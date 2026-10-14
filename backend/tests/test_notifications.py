"""اعلان‌های داخل سایت (گام 3e فاز ۳، O10): هر رویداد کلیدی به اعضای سازمان ذی‌نفع می‌رسد، نه
به خود انجام‌دهنده و نه به سازمان دیگر؛ شمارنده‌ی خوانده‌نشده‌ها و «خوانده شد» برای هر کاربر جداست."""

from collections.abc import Callable
from typing import Any

import httpx

from app.core.time import business_today
from tests.helpers import (
    API,
    PDF_BYTES,
    Account,
    award,
    complete_profile,
    join_organization,
    make_admin,
    make_deal,
    order_of,
    register,
    signed_order,
    submit_quote,
    upload_file,
    verified_lab,
)


async def _items(account: Account, **params: Any) -> list[dict[str, Any]]:
    response = await account.client.get(f"{API}/notifications", params=params, headers=account.auth)
    assert response.status_code == 200, response.text
    return response.json()["items"]  # type: ignore[no-any-return]


async def _kinds(account: Account) -> list[str]:
    """نوع اعلان‌ها از قدیمی به تازه."""
    return [item["kind"] for item in reversed(await _items(account))]


async def _unread(account: Account) -> int:
    response = await account.client.get(f"{API}/notifications/unread-count", headers=account.auth)
    assert response.status_code == 200, response.text
    return int(response.json()["unread"])


async def _post(account: Account, path: str, body: dict[str, Any] | None = None) -> httpx.Response:
    return await account.client.post(f"{API}/{path}", json=body or {}, headers=account.auth)


async def test_quotes_and_award_notify_only_the_interested_organizations(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    deal = await make_deal(client_factory)
    rival = await register(client_factory(), role="supplier", company="کارگاه رقیب")
    outsider = await register(client_factory(), company="کارخانه‌ی دیگر")
    assert (await submit_quote(rival, deal.rfq["id"], price=2_100_000_000)).status_code == 201
    revised = await deal.supplier.client.patch(
        f"{API}/quotations/{deal.quote['id']}",
        json={
            "totalPriceRials": 1_900_000_000,
            "leadTimeDays": 18,
            "validUntil": deal.quote["validUntil"],
            "note": "",
        },
        headers=deal.supplier.auth,
    )
    assert revised.status_code == 200, revised.text

    buyer_items = await _items(deal.buyer)
    assert [i["kind"] for i in reversed(buyer_items)] == [
        "quote_received",
        "quote_received",
        "quote_revised",
    ]
    first = buyer_items[-1]
    assert first["title"] == "پیشنهاد تازه برای «ساخت ۲۰۰ عدد بوش برنجی»"
    assert first["body"] == "کارگاه برنده پیشنهاد قیمت ثبت کرد."
    assert first["link"] == f"/rfqs/{deal.rfq['id']}"
    # خود قطعه‌ساز برای کار خودش اعلان نمی‌گیرد
    assert await _kinds(deal.supplier) == []

    await award(deal)
    order = await order_of(deal)
    [won] = await _items(deal.supplier)
    assert won["kind"] == "quote_won" and won["link"] == f"/orders/{order['id']}"
    [lost] = await _items(rival)
    assert lost["kind"] == "quote_lost" and lost["link"] == "/quotations"
    # نام و قیمت برنده به رقیب گفته نمی‌شود
    assert "کارگاه برنده" not in lost["title"] + lost["body"]
    assert "quote_won" not in await _kinds(deal.buyer)
    assert await _kinds(outsider) == []


async def test_contract_payment_and_delivery_notify_the_other_side(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    deal, order_id = await signed_order(client_factory, prepayment=30)
    # کارفرما شرایط را تغییر داد و اول امضا کرد؛ قطعه‌ساز دوم امضا کرد و قرارداد نافذ شد
    assert await _kinds(deal.supplier) == ["quote_won", "contract_revised", "contract_signed"]
    assert await _kinds(deal.buyer) == ["quote_received", "contract_effective"]
    effective = (await _items(deal.buyer))[0]
    assert effective["title"] == "قرارداد سفارش PM-1001 نافذ شد"
    assert effective["link"] == f"/orders/{order_id}"

    payments = (
        await deal.buyer.client.get(f"{API}/orders/{order_id}/payments", headers=deal.buyer.auth)
    ).json()["items"]
    report = {"paidOn": business_today().isoformat(), "reference": "123", "note": ""}
    for payment in payments:
        if payment["kind"] == "prepayment":
            pay = f"orders/{order_id}/payments/{payment['id']}"
            await _post(deal.buyer, f"{pay}/report", report)
            await _post(deal.supplier, f"{pay}/reject", {"reason": "واریزی نرسید"})
            await _post(deal.buyer, f"{pay}/report", report)
            await _post(deal.supplier, f"{pay}/confirm")
    await _post(deal.supplier, f"orders/{order_id}/ship", {"note": "بارنامه ۵۵"})
    await _post(deal.buyer, f"orders/{order_id}/confirm-delivery")

    assert (await _kinds(deal.supplier))[-3:] == [
        "payment_reported",
        "payment_reported",
        "order_confirm_delivery",
    ]
    assert (await _kinds(deal.buyer))[-3:] == [
        "payment_rejected",
        "payment_confirmed",
        "order_ship",
    ]
    confirmed, rejected = (await _items(deal.buyer))[1:3]
    assert confirmed["body"] == "تولید شروع شد."
    assert rejected["body"] == "دلیل: واریزی نرسید"


async def test_unread_count_and_marking_read_are_per_user(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    deal = await make_deal(client_factory)
    member = await join_organization(deal.buyer, client_factory())
    # مدیر از پیوستن عضو تازه باخبر می‌شود؛ خود عضو نه
    assert await _kinds(deal.buyer) == ["quote_received", "member_joined"]
    assert await _kinds(member) == []

    second = await register(client_factory(), role="supplier", company="کارگاه دوم")
    await submit_quote(second, deal.rfq["id"])
    assert await _unread(deal.buyer) == 3 and await _unread(member) == 1

    [notification] = await _items(member)
    read = await _post(member, f"notifications/{notification['id']}/read")
    assert read.status_code == 200 and read.json()["readAt"] is not None
    assert await _unread(member) == 0
    assert await _unread(deal.buyer) == 3  # خواندن یک عضو برای عضو دیگر حساب نمی‌شود
    assert await _items(member, unread="true") == []
    # اعلان کاربر دیگر قابل دسترسی نیست
    foreign = await _post(deal.supplier, f"notifications/{notification['id']}/read")
    assert foreign.status_code == 404

    cleared = await _post(deal.buyer, "notifications/read-all")
    assert cleared.status_code == 200 and cleared.json()["unread"] == 0
    assert await _unread(deal.buyer) == 0
    page = (
        await deal.buyer.client.get(f"{API}/notifications?limit=1", headers=deal.buyer.auth)
    ).json()
    assert (page["total"], page["unread"], len(page["items"])) == (3, 0, 1)

    # عضو حذف‌شده اعلان تازه نمی‌گیرد
    removed = await deal.buyer.client.delete(
        f"{API}/organization/members/{member.user['id']}", headers=deal.buyer.auth
    )
    assert removed.status_code == 204
    third = await register(client_factory(), role="supplier", company="کارگاه سوم")
    await submit_quote(third, deal.rfq["id"])
    assert await _unread(deal.buyer) == 1


async def test_inspection_and_verification_notifications(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    admin = await make_admin(client_factory())
    lab = await verified_lab(client_factory, admin, "آزمایشگاه اعلان")
    [verified] = await _items(lab)
    assert verified["kind"] == "account_verified"
    assert verified["title"] == "حساب آزمایشگاه شما تأیید شد"

    deal, order_id = await signed_order(client_factory)
    inspection = f"orders/{order_id}/inspection"
    chosen = await deal.buyer.client.put(
        f"{API}/{inspection}",
        json={"labOrganizationId": lab.user["organizationId"]},
        headers=deal.buyer.auth,
    )
    assert chosen.status_code == 200
    await _post(deal.supplier, f"{inspection}/ready", {"note": "انبار شماره ۲"})
    report = await upload_file(lab, "report.pdf", PDF_BYTES, "order_document")
    await _post(
        lab, f"{inspection}/result", {"attempt": 1, "passed": True, "fileId": report.json()["id"]}
    )

    assert await _kinds(lab) == ["account_verified", "inspection_assigned", "inspection_ready"]
    ready = (await _items(lab))[0]
    assert ready["body"] == "انبار شماره ۲" and ready["link"] == f"/orders/{order_id}"
    assert (await _kinds(deal.supplier))[-2:] == ["inspection_requested", "inspection_passed"]
    assert (await _kinds(deal.buyer))[-2:] == ["inspection_ready", "inspection_passed"]

    supplier = await register(client_factory(), role="supplier")
    await complete_profile(supplier, companyName="کارگاه مدارک")
    document = await upload_file(supplier, "مدرک.pdf", PDF_BYTES, "verification_document")
    submitted = await _post(
        supplier, "suppliers/me/verification", {"fileIds": [document.json()["id"]], "note": ""}
    )
    rejected = await _post(
        admin, f"admin/verifications/{submitted.json()['id']}/reject", {"reason": "مدرک ناخوانا"}
    )
    assert rejected.status_code == 200
    [decision] = await _items(supplier)
    assert decision["kind"] == "verification_rejected" and decision["link"] == "/profile"
    assert "مدرک ناخوانا" in decision["body"]


async def test_notifications_require_login(client: httpx.AsyncClient) -> None:
    for path in ("notifications", "notifications/unread-count"):
        assert (await client.get(f"{API}/{path}")).status_code == 401
