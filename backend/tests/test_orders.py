"""سفارش (گام 3a فاز ۳): ساخت خودکار و یکتا پس از انتخاب برنده، دسترسی فقط برای دو طرف، لغو پیش از
قرارداد با دلیل، ارسال با سند خصوصی و تأیید تحویل، انتقال‌های نامعتبر و تکراری، و دیرکرد."""

import asyncio
from collections.abc import Callable
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

import httpx
from sqlalchemy import func, select, text

from app.core.time import business_today
from app.db.session import engine
from app.modules.orders.models import Order, OrderEvent
from tests.helpers import (
    API,
    PDF_BYTES,
    Account,
    create_rfq,
    make_admin,
    register,
    submit_quote,
    upload_file,
)


@dataclass
class Deal:
    buyer: Account
    supplier: Account
    rfq: dict[str, Any]
    quote: dict[str, Any]


async def _deal(client_factory: Callable[[], httpx.AsyncClient]) -> Deal:
    buyer = await register(client_factory(), company="کارخانه‌ی خریدار")
    supplier = await register(client_factory(), role="supplier", company="کارگاه برنده")
    rfq = await create_rfq(buyer, title="ساخت ۲۰۰ عدد بوش برنجی")
    quote = await submit_quote(supplier, rfq["id"], price=2_000_000_000, leadTimeDays=20)
    assert quote.status_code == 201, quote.text
    return Deal(buyer, supplier, rfq, quote.json())


async def _award(deal: Deal) -> httpx.Response:
    return await deal.buyer.client.post(
        f"{API}/quotations/{deal.quote['id']}/award", headers=deal.buyer.auth
    )


async def _order_of(deal: Deal) -> dict[str, Any]:
    rfq = (
        await deal.buyer.client.get(f"{API}/rfqs/{deal.rfq['id']}", headers=deal.buyer.auth)
    ).json()
    assert rfq["orderId"], rfq
    response = await deal.buyer.client.get(
        f"{API}/orders/{rfq['orderId']}", headers=deal.buyer.auth
    )
    assert response.status_code == 200, response.text
    return response.json()  # type: ignore[no-any-return]


async def _set_status(order_id: str, status: str, **extra: Any) -> None:
    assignments = ", ".join(["status = :status", *(f"{k} = :{k}" for k in extra)])
    async with engine.begin() as conn:
        await conn.execute(
            text(f"UPDATE orders SET {assignments} WHERE id = :id"),
            {"status": status, "id": order_id, **extra},
        )


async def _act(
    account: Account, order_id: str, action: str, body: dict[str, Any]
) -> httpx.Response:
    return await account.client.post(
        f"{API}/orders/{order_id}/{action}", json=body, headers=account.auth
    )


async def test_award_creates_exactly_one_order_for_both_parties(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    deal = await _deal(client_factory)
    # چند درخواست هم‌زمان انتخاب برنده ⇒ فقط یک سفارش
    responses = await asyncio.gather(*(_award(deal) for _ in range(5)))
    assert all(r.status_code == 200 for r in responses)
    async with engine.connect() as conn:
        assert await conn.scalar(select(func.count()).select_from(Order)) == 1

    order = await _order_of(deal)
    assert order["status"] == "awaiting_contract"
    assert order["number"] >= 1001
    assert order["amountRials"] == 2_000_000_000 and order["leadTimeDays"] == 20
    assert order["deliveryDue"] == (business_today() + timedelta(days=20)).isoformat()
    assert order["buyer"]["name"] == "کارخانه‌ی خریدار"
    assert order["supplier"]["name"] == "کارگاه برنده"
    assert order["mySide"] == "buyer" and order["nextActions"] == ["cancel"]
    assert [e["action"] for e in order["events"]] == ["created"]

    # قطعه‌ساز برنده هم سفارش را می‌بیند (از فهرست و از «پیشنهادهای من»)
    listed = (await deal.supplier.client.get(f"{API}/orders", headers=deal.supplier.auth)).json()
    assert [o["id"] for o in listed["items"]] == [order["id"]]
    assert listed["items"][0]["mySide"] == "supplier"
    mine = (
        await deal.supplier.client.get(f"{API}/quotations/mine", headers=deal.supplier.auth)
    ).json()
    assert mine["items"][0]["orderId"] == order["id"]
    winner_view = (
        await deal.supplier.client.get(f"{API}/rfqs/{deal.rfq['id']}", headers=deal.supplier.auth)
    ).json()
    assert winner_view["orderId"] == order["id"]

    # سازمان سوم چیزی نمی‌بیند
    outsider = await register(client_factory(), role="supplier")
    hidden = await outsider.client.get(f"{API}/orders/{order['id']}", headers=outsider.auth)
    assert hidden.status_code == 404
    empty = (await outsider.client.get(f"{API}/orders", headers=outsider.auth)).json()
    assert empty["total"] == 0


async def test_either_side_can_cancel_before_the_contract(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    deal = await _deal(client_factory)
    await _award(deal)
    order = await _order_of(deal)

    no_reason = await _act(deal.supplier, order["id"], "cancel", {"reason": " "})
    assert no_reason.status_code == 422
    cancelled = await _act(
        deal.supplier, order["id"], "cancel", {"reason": "ظرفیت تولید این ماه پر شد"}
    )
    assert cancelled.status_code == 200, cancelled.text
    body = cancelled.json()
    assert body["status"] == "cancelled" and body["cancelReason"] == "ظرفیت تولید این ماه پر شد"
    assert body["nextActions"] == []
    assert body["events"][-1] | {"id": None, "createdAt": None, "file": None} == {
        "id": None,
        "action": "cancel",
        "fromStatus": "awaiting_contract",
        "toStatus": "cancelled",
        "actorName": "کاربر آزمایشی",
        "actorSide": "supplier",
        "note": "ظرفیت تولید این ماه پر شد",
        "file": None,
        "createdAt": None,
    }

    # تکرار همان درخواست بی‌اثر است و رویداد تازه‌ای نمی‌سازد
    again = await _act(deal.buyer, order["id"], "cancel", {"reason": "دوباره"})
    assert again.status_code == 200
    async with engine.connect() as conn:
        events = await conn.scalar(
            select(func.count()).select_from(OrderEvent).where(OrderEvent.action == "cancel")
        )
    assert events == 1


async def test_shipping_with_a_private_document_and_delivery(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    deal = await _deal(client_factory)
    await _award(deal)
    order = await _order_of(deal)
    # قرارداد و پرداخت در گام‌های 3b و 3c می‌آیند؛ اینجا سفارش مستقیم به تولید برده می‌شود
    await _set_status(order["id"], "in_production")

    late_cancel = await _act(deal.buyer, order["id"], "cancel", {"reason": "پشیمان شدم"})
    assert late_cancel.status_code == 409 and late_cancel.json()["code"] == "invalid_transition"
    wrong_side = await _act(deal.buyer, order["id"], "ship", {})
    assert wrong_side.status_code == 403 and wrong_side.json()["code"] == "not_your_step"

    waybill = await upload_file(deal.supplier, "بارنامه.pdf", PDF_BYTES, "order_document")
    assert waybill.status_code == 201, waybill.text
    shipped = await _act(
        deal.supplier,
        order["id"],
        "ship",
        {"note": "باربری نمونه، بارنامه ۱۲۳۴", "fileId": waybill.json()["id"]},
    )
    assert shipped.status_code == 200, shipped.text
    event = shipped.json()["events"][-1]
    assert event["action"] == "ship" and event["note"] == "باربری نمونه، بارنامه ۱۲۳۴"
    assert event["file"]["name"] == "بارنامه.pdf"

    # سند سفارش فقط برای دو طرف؛ سازمان سوم 404 می‌گیرد و سند ثبت‌شده حذف‌شدنی نیست
    file_id = event["file"]["id"]
    link = await deal.buyer.client.post(f"{API}/files/{file_id}/link", headers=deal.buyer.auth)
    assert link.status_code == 200
    outsider = await register(client_factory())
    denied = await outsider.client.post(f"{API}/files/{file_id}/link", headers=outsider.auth)
    assert denied.status_code == 404
    removed = await deal.supplier.client.delete(
        f"{API}/files/{file_id}", headers=deal.supplier.auth
    )
    assert removed.status_code == 409

    supplier_confirms = await _act(deal.supplier, order["id"], "confirm-delivery", {})
    assert supplier_confirms.status_code == 403
    delivered = await _act(deal.buyer, order["id"], "confirm-delivery", {"note": "سالم رسید"})
    assert delivered.status_code == 200
    assert delivered.json()["status"] == "delivered" and delivered.json()["deliveredAt"]
    reship = await _act(deal.supplier, order["id"], "ship", {})
    assert reship.status_code == 409


async def test_documents_must_be_fresh_and_owned(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    deal = await _deal(client_factory)
    await _award(deal)
    order = await _order_of(deal)
    await _set_status(order["id"], "in_production")

    async def ship_with(file_id: str) -> httpx.Response:
        return await _act(deal.supplier, order["id"], "ship", {"fileId": file_id})

    # سند سازمان دیگر، یا فایلی با کاربرد دیگر، پذیرفته نمی‌شود
    foreign = await upload_file(deal.buyer, "doc.pdf", PDF_BYTES, "order_document")
    borrowed = await ship_with(foreign.json()["id"])
    assert borrowed.status_code == 422 and borrowed.json()["errors"][0]["field"] == "fileId"
    license_doc = await upload_file(
        deal.supplier, "license.pdf", PDF_BYTES, "verification_document"
    )
    assert (await ship_with(license_doc.json()["id"])).status_code == 422

    # سندی که یک‌بار در تاریخچه ثبت شده دوباره استفاده نمی‌شود
    waybill = await upload_file(deal.supplier, "waybill.pdf", PDF_BYTES, "order_document")
    assert (await ship_with(waybill.json()["id"])).status_code == 200
    await _set_status(order["id"], "in_production", shipped_at=None)
    assert (await ship_with(waybill.json()["id"])).status_code == 422


async def test_lists_filters_overdue_and_admin_view(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    deal = await _deal(client_factory)
    await _award(deal)
    order = await _order_of(deal)
    yesterday = business_today() - timedelta(days=1)
    await _set_status(order["id"], "in_production", delivery_due=yesterday)

    late = (
        await deal.buyer.client.get(f"{API}/orders/{order['id']}", headers=deal.buyer.auth)
    ).json()
    assert late["isOverdue"] is True

    async def count(account: Account, group: str) -> int:
        page = await account.client.get(
            f"{API}/orders", params={"status": group}, headers=account.auth
        )
        return int(page.json()["total"])

    assert await count(deal.buyer, "active") == 1
    assert await count(deal.buyer, "completed") == 0
    assert await count(deal.buyer, "cancelled") == 0

    admin = await make_admin(client_factory())
    seen = (await admin.client.get(f"{API}/orders/{order['id']}", headers=admin.auth)).json()
    assert seen["mySide"] == "admin" and seen["nextActions"] == []
    assert await count(admin, "all") == 1
