"""RFQ: ثبت، اعتبارسنجی، دید هر نقش (سناریوهای RFQ1–RFQ7 و Q7 گزارش فاز ۰)."""

from collections.abc import Callable
from datetime import date, timedelta

import httpx
from sqlalchemy import text

from app.db.session import engine
from tests.helpers import API, create_rfq, register, rfq_body, submit_quote


async def test_buyer_creates_rfq_and_lists_own(client: httpx.AsyncClient) -> None:
    buyer = await register(client)
    rfq = await create_rfq(buyer)
    assert rfq["isOwner"] is True
    assert rfq["status"] == "published"
    assert rfq["quotationsCount"] == 0

    mine = await client.get(f"{API}/rfqs/mine", headers=buyer.auth)
    assert mine.status_code == 200
    page = mine.json()
    assert page["total"] == 1 and page["limit"] == 20 and page["offset"] == 0
    assert page["items"][0]["id"] == rfq["id"]

    async with engine.connect() as conn:
        events = await conn.scalar(
            text("SELECT count(*) FROM audit_events WHERE action = 'rfq.created'")
        )
    assert events == 1


async def test_invalid_rfq_is_rejected_with_persian_messages_and_not_saved(
    client: httpx.AsyncClient,
) -> None:
    buyer = await register(client)
    past = (date.today() - timedelta(days=5)).isoformat()
    response = await client.post(
        f"{API}/rfqs",
        json=rfq_body(quantity=-5, deadline=past, title="", capability="laser"),
        headers=buyer.auth,
    )
    assert response.status_code == 422
    fields = {e["field"]: e["message"] for e in response.json()["errors"]}
    assert fields["quantity"] == "باید بیشتر از ۰ باشد."
    assert fields["deadline"] == "مهلت تحویل نمی‌تواند تاریخ گذشته باشد."
    assert "title" in fields
    assert fields["capability"] == "مقدار انتخاب‌شده معتبر نیست."

    mine = await client.get(f"{API}/rfqs/mine", headers=buyer.auth)
    assert mine.json()["total"] == 0


async def test_preview_data_urls_are_not_stored(client: httpx.AsyncClient) -> None:
    """قالب قدیمی فاز ۱ (متادیتای فایل همراه پیش‌نمایش data URL) نادیده گرفته و ذخیره نمی‌شود؛
    پیوست واقعی فقط با بارگذاری فایل و fileIds است (test_files)."""
    buyer = await register(client)
    rfq = await create_rfq(
        buyer,
        files=[
            {
                "name": "photo.png",
                "size": 2048,
                "kind": "image",
                "previewUrl": "data:image/png;base64,AAAA",
            }
        ],
    )
    assert rfq["files"] == [] and rfq["fileCount"] == 0
    async with engine.connect() as conn:
        stored = await conn.scalar(text("SELECT files::text FROM rfqs"))
    assert "data:image" not in stored


async def test_supplier_cannot_create_rfq(client: httpx.AsyncClient) -> None:
    supplier = await register(client, role="supplier")
    response = await client.post(f"{API}/rfqs", json=rfq_body(), headers=supplier.auth)
    assert response.status_code == 403


async def test_anonymous_cannot_read_rfqs(client_factory: Callable[[], httpx.AsyncClient]) -> None:
    buyer = await register(client_factory())
    rfq = await create_rfq(buyer)
    anonymous = client_factory()
    assert (await anonymous.get(f"{API}/rfqs/mine")).status_code == 401
    detail = await anonymous.get(f"{API}/rfqs/{rfq['id']}")
    assert detail.status_code == 401
    assert detail.json()["detail"] == "برای ادامه وارد حساب کاربری شوید."


async def test_other_company_cannot_see_rfq(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    buyer_a = await register(client_factory())
    buyer_b = await register(client_factory())
    rfq = await create_rfq(buyer_a)
    response = await buyer_b.client.get(f"{API}/rfqs/{rfq['id']}", headers=buyer_b.auth)
    assert response.status_code == 404
    mine_b = await buyer_b.client.get(f"{API}/rfqs/mine", headers=buyer_b.auth)
    assert mine_b.json()["total"] == 0


async def test_supplier_sees_open_rfq_summary_without_files(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    buyer = await register(client_factory())
    supplier = await register(client_factory(), role="supplier")
    rfq = await create_rfq(buyer)
    response = await supplier.client.get(f"{API}/rfqs/{rfq['id']}", headers=supplier.auth)
    assert response.status_code == 200
    summary = response.json()
    assert summary["files"] == []
    assert summary["quotationsCount"] is None
    assert summary["isOwner"] is False
    assert summary["title"] == rfq["title"]


async def test_supplier_loses_access_after_award_unless_it_quoted(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    buyer = await register(client_factory())
    quoting = await register(client_factory(), role="supplier")
    outsider = await register(client_factory(), role="supplier")
    rfq = await create_rfq(buyer)
    quote = (await submit_quote(quoting, rfq["id"])).json()
    award = await buyer.client.post(f"{API}/quotations/{quote['id']}/award", headers=buyer.auth)
    assert award.status_code == 200

    seen = await quoting.client.get(f"{API}/rfqs/{rfq['id']}", headers=quoting.auth)
    assert seen.status_code == 200 and seen.json()["status"] == "awarded"
    hidden = await outsider.client.get(f"{API}/rfqs/{rfq['id']}", headers=outsider.auth)
    assert hidden.status_code == 404


async def test_my_rfqs_are_paginated(client: httpx.AsyncClient) -> None:
    buyer = await register(client)
    for i in range(3):
        await create_rfq(buyer, title=f"درخواست شماره {i + 1}")
    first = (await client.get(f"{API}/rfqs/mine", params={"limit": 2}, headers=buyer.auth)).json()
    rest = (
        await client.get(f"{API}/rfqs/mine", params={"limit": 2, "offset": 2}, headers=buyer.auth)
    ).json()
    assert first["total"] == rest["total"] == 3
    assert len(first["items"]) == 2 and len(rest["items"]) == 1
    too_big = await client.get(f"{API}/rfqs/mine", params={"limit": 500}, headers=buyer.auth)
    assert too_big.status_code == 422


async def test_invalid_rfq_id_is_422_and_unknown_is_404(client: httpx.AsyncClient) -> None:
    buyer = await register(client)
    assert (await client.get(f"{API}/rfqs/not-a-uuid", headers=buyer.auth)).status_code == 422
    unknown = await client.get(
        f"{API}/rfqs/00000000-0000-0000-0000-000000000000", headers=buyer.auth
    )
    assert unknown.status_code == 404
    assert unknown.json()["detail"] == "درخواست موردنظر پیدا نشد."
