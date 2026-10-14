"""اختلاف و لغو توافقی پس از امضا (گام 3f فاز ۳، O11): «اعلام مشکل» سفارش را تا تصمیم پشتیبانی
متوقف می‌کند و ادمین با دلیل تصمیم می‌گیرد (ادامه، تکمیل یا لغو)؛ لغو پس از امضا فقط با موافقت
هر دو طرف انجام می‌شود."""

from collections.abc import Callable
from typing import Any

import httpx
from sqlalchemy import func, select

from app.core.time import business_today
from app.db.session import engine
from app.modules.audit.models import AuditEvent
from app.modules.disputes.models import OrderDispute
from tests.helpers import (
    API,
    PNG_BYTES,
    Account,
    award,
    make_admin,
    make_deal,
    order_of,
    signed_order,
    upload_file,
)


async def _post(
    account: Account, order_id: str, path: str, body: dict[str, Any] | None = None
) -> httpx.Response:
    return await account.client.post(
        f"{API}/orders/{order_id}/{path}", json=body or {}, headers=account.auth
    )


async def _order(account: Account, order_id: str) -> dict[str, Any]:
    response = await account.client.get(f"{API}/orders/{order_id}", headers=account.auth)
    assert response.status_code == 200, response.text
    return response.json()  # type: ignore[no-any-return]


async def _queue(admin: Account, status: str = "open") -> dict[str, Any]:
    response = await admin.client.get(
        f"{API}/admin/disputes", params={"status": status}, headers=admin.auth
    )
    assert response.status_code == 200, response.text
    return response.json()  # type: ignore[no-any-return]


async def _resolve(admin: Account, dispute_id: str, resolution: str, reason: str) -> httpx.Response:
    return await admin.client.post(
        f"{API}/admin/disputes/{dispute_id}/resolve",
        json={"resolution": resolution, "reason": reason},
        headers=admin.auth,
    )


async def _kinds(account: Account) -> list[str]:
    items = (await account.client.get(f"{API}/notifications", headers=account.auth)).json()["items"]
    return [item["kind"] for item in items]


async def test_buyer_reports_a_problem_and_admin_completes_the_order(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    admin = await make_admin(client_factory())
    deal, order_id = await signed_order(client_factory)
    await _post(deal.supplier, order_id, "ship", {"note": "بارنامه ۱۲"})

    short = await _post(deal.buyer, order_id, "dispute", {"reason": "خراب"})
    assert short.status_code == 422 and short.json()["errors"][0]["field"] == "reason"
    photo = await upload_file(deal.buyer, "قطعه-معیوب.png", PNG_BYTES, "order_document")
    reason = "ده عدد از قطعات ترک دارند و قابل استفاده نیستند"
    opened = await _post(
        deal.buyer, order_id, "dispute", {"reason": reason, "fileId": photo.json()["id"]}
    )
    assert opened.status_code == 200, opened.text
    body = opened.json()
    assert body["status"] == "disputed" and body["nextActions"] == []
    assert body["dispute"]["openedSide"] == "buyer" and body["dispute"]["reason"] == reason
    assert body["dispute"]["previousStatus"] == "shipped"
    assert body["dispute"]["file"]["name"] == "قطعه-معیوب.png"
    # تکرار بی‌اثر است و در حین بررسی کار دیگری روی سفارش انجام نمی‌شود
    assert (await _post(deal.supplier, order_id, "dispute", {"reason": reason})).status_code == 200
    blocked = await _post(deal.buyer, order_id, "confirm-delivery")
    assert blocked.status_code == 409
    supplier_view = await _order(deal.supplier, order_id)
    assert supplier_view["dispute"]["reason"] == reason
    assert "order_dispute" in await _kinds(deal.supplier)
    assert "dispute_opened" in await _kinds(admin)
    # سند مشکل برای طرف مقابل و ادمین قابل دانلود است
    for account in (deal.supplier, admin):
        link = await account.client.post(
            f"{API}/files/{photo.json()['id']}/link", headers=account.auth
        )
        assert link.status_code == 200

    # صف فقط برای ادمین است
    hidden = await deal.buyer.client.get(f"{API}/admin/disputes", headers=deal.buyer.auth)
    assert hidden.status_code == 404
    [item] = (await _queue(admin))["items"]
    assert (item["orderNumber"], item["buyerName"], item["supplierName"]) == (
        1001,
        "کارخانه‌ی خریدار",
        "کارگاه برنده",
    )
    no_reason = await _resolve(admin, item["id"], "complete", " ")
    assert no_reason.status_code == 422
    decided = await _resolve(admin, item["id"], "complete", "قطعات جایگزین تحویل شد")
    assert decided.status_code == 200, decided.text
    assert decided.json()["status"] == "resolved" and decided.json()["resolution"] == "complete"
    assert decided.json()["resolvedByName"] == "ادمین آزمون"
    again = await _resolve(admin, item["id"], "cancel", "دوباره")
    assert again.status_code == 409 and again.json()["code"] == "already_decided"

    order = await order_of(deal)
    assert order["status"] == "completed" and order["dispute"] is None
    last = order["events"][-1]
    assert (last["action"], last["fromStatus"], last["toStatus"], last["actorSide"]) == (
        "dispute_resolved",
        "disputed",
        "completed",
        "admin",
    )
    assert last["note"] == "تکمیل سفارش: قطعات جایگزین تحویل شد"
    assert "dispute_resolved" in await _kinds(deal.buyer)
    assert (await _queue(admin))["items"] == []
    assert len((await _queue(admin, "resolved"))["items"]) == 1
    async with engine.connect() as conn:
        actions = list(await conn.scalars(select(AuditEvent.action)))
    assert {"order.dispute", "dispute.resolved"} <= set(actions)


async def test_admin_can_resume_or_cancel_a_disputed_order(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    admin = await make_admin(client_factory())
    deal, order_id = await signed_order(client_factory, prepayment=30)
    # قطعه‌ساز هم می‌تواند مشکل اعلام کند (مثلاً پیش‌پرداخت نرسیده است)
    reason = "پیش‌پرداخت پس از دو هفته هنوز واریز نشده است"
    assert (await _post(deal.supplier, order_id, "dispute", {"reason": reason})).status_code == 200
    [item] = (await _queue(admin))["items"]
    assert item["openedSide"] == "supplier" and item["previousStatus"] == "awaiting_prepayment"
    resumed = await _resolve(admin, item["id"], "resume", "کارفرما پرداخت را انجام داد")
    assert resumed.status_code == 200
    assert (await order_of(deal))["status"] == "awaiting_prepayment"

    # اختلاف دوم روی همان سفارش، این بار با تصمیم لغو
    second = "کارفرما پاسخ نمی‌دهد و پرداخت انجام نشد"
    assert (await _post(deal.supplier, order_id, "dispute", {"reason": second})).status_code == 200
    [item] = (await _queue(admin))["items"]
    cancelled = await _resolve(admin, item["id"], "cancel", "عدم پرداخت پیش‌پرداخت")
    assert cancelled.json()["orderStatus"] == "cancelled"
    order = await order_of(deal)
    assert order["status"] == "cancelled" and order["cancelReason"] == "عدم پرداخت پیش‌پرداخت"
    async with engine.connect() as conn:
        assert await conn.scalar(select(func.count()).select_from(OrderDispute)) == 2


async def test_disputes_need_a_signed_contract_and_a_party(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    deal = await make_deal(client_factory)
    await award(deal)
    order_id = str((await order_of(deal))["id"])
    reason = "قطعه‌ساز پاسخ تماس‌ها را نمی‌دهد"
    early = await _post(deal.buyer, order_id, "dispute", {"reason": reason})
    assert early.status_code == 409 and early.json()["code"] == "invalid_transition"
    admin = await make_admin(client_factory())
    as_admin = await _post(admin, order_id, "dispute", {"reason": reason})
    assert as_admin.status_code == 403


async def test_cancelling_after_signing_needs_both_sides(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    deal, order_id = await signed_order(client_factory)
    no_reason = await _post(deal.buyer, order_id, "cancel", {"reason": ""})
    assert no_reason.status_code == 422 and no_reason.json()["errors"][0]["field"] == "reason"

    requested = await _post(deal.buyer, order_id, "cancel", {"reason": "طرح محصول عوض شد"})
    body = requested.json()
    assert body["status"] == "in_production"
    assert (body["cancelRequest"]["side"], body["cancelRequest"]["reason"]) == (
        "buyer",
        "طرح محصول عوض شد",
    )
    assert "cancel" not in body["nextActions"] and "keep" in body["nextActions"]
    supplier_view = await _order(deal.supplier, order_id)
    assert {"cancel", "keep"} <= set(supplier_view["nextActions"])
    assert "order_cancel_requested" in await _kinds(deal.supplier)
    # تکرار درخواست بی‌اثر است
    again = await _post(deal.buyer, order_id, "cancel", {"reason": "دلیل دیگر"})
    assert again.json()["cancelRequest"]["reason"] == "طرح محصول عوض شد"

    declined = await _post(deal.supplier, order_id, "keep", {"note": "مواد اولیه خریده شده است"})
    assert declined.status_code == 200 and declined.json()["cancelRequest"] is None
    assert declined.json()["events"][-1]["note"] == "مواد اولیه خریده شده است"
    assert "order_cancel_request_closed" in await _kinds(deal.buyer)

    # درخواست دوباره و موافقت قطعه‌ساز ⇒ لغو با دلیل درخواست‌دهنده
    await _post(deal.buyer, order_id, "cancel", {"reason": "پروژه متوقف شد"})
    agreed = await _post(deal.supplier, order_id, "cancel", {})
    assert agreed.status_code == 200, agreed.text
    order = agreed.json()
    assert order["status"] == "cancelled" and order["cancelReason"] == "پروژه متوقف شد"
    assert order["events"][-1]["note"] == "با توافق دو طرف: پروژه متوقف شد"


async def test_withdrawn_request_and_dispute_clear_a_pending_cancellation(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    deal, order_id = await signed_order(client_factory)
    await _post(deal.supplier, order_id, "cancel", {"reason": "دستگاه CNC خراب شد"})
    withdrawn = await _post(deal.supplier, order_id, "keep")
    assert withdrawn.json()["cancelRequest"] is None
    assert withdrawn.json()["events"][-1]["note"] == "درخواست لغو پس گرفته شد."

    await _post(deal.supplier, order_id, "cancel", {"reason": "دستگاه CNC خراب شد"})
    reason = "قطعه‌ساز بدون هماهنگی تولید را متوقف کرده است"
    disputed = await _post(deal.buyer, order_id, "dispute", {"reason": reason})
    assert disputed.json()["status"] == "disputed"
    assert disputed.json()["cancelRequest"] is None
    # پس از اعلام مشکل، لغو فقط با تصمیم پشتیبانی است
    blocked = await _post(deal.supplier, order_id, "cancel", {"reason": "دوباره"})
    assert blocked.status_code == 409


async def test_payment_reporting_waits_while_the_order_is_disputed(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    deal, order_id = await signed_order(client_factory)
    await _post(deal.supplier, order_id, "ship")
    reason = "بسته‌بندی آسیب دیده و چند قطعه کم است"
    await _post(deal.buyer, order_id, "dispute", {"reason": reason})
    payments = (
        await deal.buyer.client.get(f"{API}/orders/{order_id}/payments", headers=deal.buyer.auth)
    ).json()["items"]
    assert payments[0]["canReport"] is False
    report = await _post(
        deal.buyer,
        order_id,
        f"payments/{payments[0]['id']}/report",
        {"paidOn": business_today().isoformat(), "reference": "1", "note": ""},
    )
    assert report.status_code == 409
