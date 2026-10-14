"""پیشنهاد قیمت: محرمانگی، پول و چرخه‌ی وضعیت (سناریوهای Q1–Q6، AW3، AW5 گزارش فاز ۰)."""

from collections.abc import Callable
from datetime import date, timedelta

import httpx
from sqlalchemy import text

from app.db.session import engine
from tests.helpers import API, create_rfq, register, submit_quote


async def test_owner_sees_all_quotes_sorted_by_price(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    buyer = await register(client_factory())
    supplier_a = await register(client_factory(), role="supplier", company="کارگاه الف")
    supplier_b = await register(client_factory(), role="supplier", company="کارگاه ب")
    rfq = await create_rfq(buyer)
    assert (await submit_quote(supplier_a, rfq["id"], price=1_900_000_000)).status_code == 201
    assert (await submit_quote(supplier_b, rfq["id"], price=1_200_000_000)).status_code == 201

    listing = await buyer.client.get(f"{API}/rfqs/{rfq['id']}/quotations", headers=buyer.auth)
    assert listing.status_code == 200
    names = [q["supplierName"] for q in listing.json()]
    assert names == ["کارگاه ب", "کارگاه الف"]

    detail = (await buyer.client.get(f"{API}/rfqs/{rfq['id']}", headers=buyer.auth)).json()
    assert detail["status"] == "quoting"
    assert detail["quotationsCount"] == 2


async def test_competitor_never_sees_other_prices(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    buyer = await register(client_factory())
    supplier_a = await register(client_factory(), role="supplier", company="کارگاه الف")
    supplier_b = await register(client_factory(), role="supplier", company="کارگاه ب")
    rfq = await create_rfq(buyer)
    await submit_quote(supplier_a, rfq["id"], price=1_900_000_000)
    await submit_quote(supplier_b, rfq["id"], price=1_200_000_000)

    seen = await supplier_b.client.get(
        f"{API}/rfqs/{rfq['id']}/quotations", headers=supplier_b.auth
    )
    assert seen.status_code == 200
    assert [q["supplierName"] for q in seen.json()] == ["کارگاه ب"]

    newcomer = await register(client_factory(), role="supplier")
    empty = await newcomer.client.get(f"{API}/rfqs/{rfq['id']}/quotations", headers=newcomer.auth)
    assert empty.status_code == 200 and empty.json() == []


async def test_anonymous_and_other_buyers_cannot_list_quotes(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    buyer = await register(client_factory())
    supplier = await register(client_factory(), role="supplier")
    rfq = await create_rfq(buyer)
    await submit_quote(supplier, rfq["id"])

    anonymous = await client_factory().get(f"{API}/rfqs/{rfq['id']}/quotations")
    assert anonymous.status_code == 401
    other = await register(client_factory())
    assert (
        await other.client.get(f"{API}/rfqs/{rfq['id']}/quotations", headers=other.auth)
    ).status_code == 404


async def test_large_prices_round_trip_exactly(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    buyer = await register(client_factory())
    supplier = await register(client_factory(), role="supplier")
    rfq = await create_rfq(buyer)
    created = await submit_quote(supplier, rfq["id"], price=50_000_000_000)
    assert created.status_code == 201
    assert created.json()["totalPriceRials"] == 50_000_000_000
    async with engine.connect() as conn:
        stored = await conn.scalar(text("SELECT total_price_rials FROM quotations"))
    assert stored == 50_000_000_000

    other = await register(client_factory(), role="supplier")
    too_big = await submit_quote(other, rfq["id"], price=10**15 + 1)
    assert too_big.status_code == 422


async def test_invalid_quote_values_are_rejected(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    buyer = await register(client_factory())
    supplier = await register(client_factory(), role="supplier")
    rfq = await create_rfq(buyer)
    yesterday = (date.today() - timedelta(days=2)).isoformat()
    for overrides in (
        {"totalPriceRials": -100},
        {"leadTimeDays": 0},
        {"validUntil": "not-a-date"},
        {"validUntil": yesterday},
    ):
        response = await supplier.client.post(
            f"{API}/rfqs/{rfq['id']}/quotations",
            json={
                "totalPriceRials": 1_000_000,
                "leadTimeDays": 10,
                "validUntil": "2099-01-01",
                **overrides,
            },
            headers=supplier.auth,
        )
        assert response.status_code == 422, overrides
    async with engine.connect() as conn:
        assert await conn.scalar(text("SELECT count(*) FROM quotations")) == 0


async def test_one_quote_per_supplier(client_factory: Callable[[], httpx.AsyncClient]) -> None:
    buyer = await register(client_factory())
    supplier = await register(client_factory(), role="supplier")
    rfq = await create_rfq(buyer)
    assert (await submit_quote(supplier, rfq["id"])).status_code == 201
    duplicate = await submit_quote(supplier, rfq["id"], price=900_000_000)
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == "شما قبلاً برای این درخواست قیمت داده‌اید."


async def test_buyer_cannot_submit_quote(client_factory: Callable[[], httpx.AsyncClient]) -> None:
    buyer = await register(client_factory())
    other_buyer = await register(client_factory())
    rfq = await create_rfq(buyer)
    assert (await submit_quote(other_buyer, rfq["id"])).status_code == 403


async def test_quotes_after_deadline_are_rejected(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    buyer = await register(client_factory())
    supplier = await register(client_factory(), role="supplier")
    rfq = await create_rfq(buyer)
    async with engine.begin() as conn:
        await conn.execute(text("UPDATE rfqs SET deadline = current_date - 1"))
    response = await submit_quote(supplier, rfq["id"])
    assert response.status_code == 409
    assert response.json()["code"] == "rfq_expired"


async def test_closed_rfq_rejects_new_quotes(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    buyer = await register(client_factory())
    supplier = await register(client_factory(), role="supplier")
    rfq = await create_rfq(buyer)
    quote = (await submit_quote(supplier, rfq["id"])).json()
    await buyer.client.post(f"{API}/quotations/{quote['id']}/award", headers=buyer.auth)

    late = await register(client_factory(), role="supplier")
    rejected = await submit_quote(late, rfq["id"])
    # قطعه‌سازی که صفحه را باز داشته پیام روشن می‌گیرد، نه «پیدا نشد»
    assert rejected.status_code == 409
    assert rejected.json()["code"] == "rfq_closed"
    assert rejected.json()["detail"] == "این درخواست دیگر پیشنهاد جدید نمی‌پذیرد."
    async with engine.connect() as conn:
        assert await conn.scalar(text("SELECT count(*) FROM quotations")) == 1
