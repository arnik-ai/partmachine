"""سابقه‌ی واقعی قطعه‌ساز و امتیاز کارفرما (گام 3f فاز ۳، O12): سفارش‌های تکمیل‌شده، تحویل
به‌موقع، قبولی بازرسی در نوبت اول، امتیاز ۱ تا ۵، مشکل‌های اعلام‌شده و سرعت پاسخ از داده‌ی
واقعی ساخته می‌شوند؛ امتیاز اعتماد کم‌کم به آن‌ها می‌رسد و توضیحش صادقانه است."""

from collections.abc import Callable
from datetime import timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy import text

from app.core.time import business_today
from app.db.session import engine
from tests.helpers import (
    API,
    PDF_BYTES,
    Account,
    Deal,
    make_admin,
    signed_order,
    upload_file,
    verified_lab,
)


async def _post(
    account: Account, order_id: str, path: str, body: dict[str, Any] | None = None
) -> httpx.Response:
    return await account.client.post(
        f"{API}/orders/{order_id}/{path}", json=body or {}, headers=account.auth
    )


async def _profile(supplier: Account) -> dict[str, Any]:
    response = await supplier.client.get(f"{API}/suppliers/me", headers=supplier.auth)
    assert response.status_code == 200, response.text
    return response.json()  # type: ignore[no-any-return]


def _explain(profile: dict[str, Any], key: str) -> str:
    return next(c["explanation"] for c in profile["score"]["components"] if c["key"] == key)


async def _pay_everything(deal: Deal, order_id: str) -> None:
    """کارفرما همه‌ی اقساط قابل‌پرداخت را اعلام و قطعه‌ساز تأیید می‌کند."""
    payments = (
        await deal.buyer.client.get(f"{API}/orders/{order_id}/payments", headers=deal.buyer.auth)
    ).json()["items"]
    report = {"paidOn": business_today().isoformat(), "reference": "111", "note": ""}
    for payment in payments:
        if payment["canReport"]:
            await _post(deal.buyer, order_id, f"payments/{payment['id']}/report", report)
            await _post(deal.supplier, order_id, f"payments/{payment['id']}/confirm")


async def _rate(account: Account, order_id: str, score: int, comment: str = "") -> httpx.Response:
    return await account.client.put(
        f"{API}/orders/{order_id}/rating",
        json={"score": score, "comment": comment},
        headers=account.auth,
    )


async def test_completed_order_builds_history_and_the_buyer_rates_it(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    deal, order_id = await signed_order(client_factory)
    before = await _profile(deal.supplier)
    assert (before["completedJobs"], before["deliveredJobs"], before["ratingCount"]) == (0, 0, 0)
    assert before["ratingAverage"] is None
    assert _explain(before, "on_time_delivery").startswith("هنوز سفارشی در تراشینو تحویل نشده")
    assert _explain(before, "satisfaction").startswith("هنوز امتیازی از کارفرماها ثبت نشده")
    # پیشنهاد همین قطعه‌ساز برای سرعت پاسخ حساب شده است
    assert "در ۱ پیشنهاد" in _explain(before, "response_speed")

    early = await _rate(deal.buyer, order_id, 5)
    assert early.status_code == 409 and early.json()["code"] == "order_not_completed"
    await _post(deal.supplier, order_id, "ship")
    await _post(deal.buyer, order_id, "confirm-delivery")
    await _pay_everything(deal, order_id)  # تسویه‌ی پایانی ⇒ تکمیل

    after = await _profile(deal.supplier)
    assert (after["completedJobs"], after["deliveredJobs"], after["onTimeJobs"]) == (1, 1, 1)
    # کم‌کم: یک تحویل به‌موقع کنار مقدار اولیه‌ی ۹۰٪ با وزن ۳
    assert after["onTimeDeliveryRate"] == pytest.approx((0.9 * 3 + 1) / 4)
    assert _explain(after, "on_time_delivery") == "۱ از ۱ سفارش در موعد تحویل شد"

    assert (await _rate(deal.supplier, order_id, 5)).status_code == 403
    for invalid in (0, 6):
        assert (await _rate(deal.buyer, order_id, invalid)).status_code == 422
    rated = await _rate(deal.buyer, order_id, 4, "کیفیت خوب، بسته‌بندی ضعیف")
    assert rated.status_code == 200, rated.text
    order = rated.json()
    assert order["rating"]["score"] == 4 and order["canRate"] is True
    assert order["events"][-1]["note"] == "امتیاز ۴ از ۵ — کیفیت خوب، بسته‌بندی ضعیف"
    supplier_view = (
        await deal.supplier.client.get(f"{API}/orders/{order_id}", headers=deal.supplier.auth)
    ).json()
    assert supplier_view["rating"]["comment"] == "کیفیت خوب، بسته‌بندی ضعیف"
    assert supplier_view["canRate"] is False

    profile = await _profile(deal.supplier)
    assert (profile["ratingCount"], profile["ratingAverage"]) == (1, 4.0)
    assert _explain(profile, "satisfaction") == "میانگین ۴٫۰ از ۵ در ۱ امتیاز کارفرماها"

    # تغییر امتیاز جای قبلی را می‌گیرد؛ تکرار همان امتیاز بی‌اثر است
    await _rate(deal.buyer, order_id, 5)
    again = await _rate(deal.buyer, order_id, 5)
    assert [e["action"] for e in again.json()["events"]].count("rated") == 2
    profile = await _profile(deal.supplier)
    assert (profile["ratingCount"], profile["ratingAverage"]) == (1, 5.0)


async def test_late_delivery_lowers_the_on_time_rate(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    deal, order_id = await signed_order(client_factory, prepayment=100)
    await _pay_everything(deal, order_id)
    await _post(deal.supplier, order_id, "ship")
    async with engine.begin() as conn:
        await conn.execute(
            text("UPDATE orders SET delivery_due = :due WHERE id = :id"),
            {"due": business_today() - timedelta(days=2), "id": order_id},
        )
    delivered = await _post(deal.buyer, order_id, "confirm-delivery")
    assert delivered.json()["status"] == "completed"  # همه‌ی اقساط پیش‌تر پرداخت شده بود
    profile = await _profile(deal.supplier)
    assert (profile["deliveredJobs"], profile["onTimeJobs"]) == (1, 0)
    assert profile["onTimeDeliveryRate"] == pytest.approx(0.9 * 3 / 4)
    assert _explain(profile, "on_time_delivery") == "۰ از ۱ سفارش در موعد تحویل شد"


async def test_inspections_and_buyer_disputes_shape_quality_and_risk(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    admin = await make_admin(client_factory())
    lab = await verified_lab(client_factory, admin, "آزمایشگاه سابقه")
    deal, order_id = await signed_order(client_factory)
    await deal.buyer.client.put(
        f"{API}/orders/{order_id}/inspection",
        json={"labOrganizationId": lab.user["organizationId"]},
        headers=deal.buyer.auth,
    )
    for attempt, passed in ((1, False), (2, True)):
        await _post(deal.supplier, order_id, "inspection/ready")
        report = await upload_file(lab, f"report-{attempt}.pdf", PDF_BYTES, "order_document")
        result = await _post(
            lab,
            order_id,
            "inspection/result",
            {
                "attempt": attempt,
                "passed": passed,
                "note": "" if passed else "سختی سطح کمتر از حد مجاز",
                "fileId": report.json()["id"],
            },
        )
        assert result.status_code == 200, result.text
    profile = await _profile(deal.supplier)
    assert profile["score"]["quality"] == pytest.approx(85 * 3 / 4, abs=1)
    assert _explain(profile, "quality") == "۰ از ۱ بازرسی کیفیت در نوبت اول قبول شد"

    # مشکلی که خود قطعه‌ساز اعلام کند در سابقه‌اش حساب نمی‌شود؛ مشکل کارفرما حساب می‌شود
    await _post(deal.supplier, order_id, "ship")
    reason = "ابعاد بخشی از قطعات با نقشه نمی‌خواند"
    assert (await _post(deal.buyer, order_id, "dispute", {"reason": reason})).status_code == 200
    profile = await _profile(deal.supplier)
    assert _explain(profile, "dispute_history") == "۱ مشکل اعلام‌شده از سوی کارفرماها در سابقه"
