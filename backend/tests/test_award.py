"""انتخاب برنده: فقط صاحب RFQ، فقط یک برنده، حتی با درخواست هم‌زمان (AW1، AW2، AW4)."""

import asyncio
from collections.abc import Callable
from typing import Any

import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.db.session import engine
from tests.helpers import API, Account, create_rfq, register, submit_quote


async def _rfq_with_quotes(
    client_factory: Callable[[], httpx.AsyncClient], count: int
) -> tuple[Account, dict[str, Any], list[dict[str, Any]]]:
    buyer = await register(client_factory())
    rfq = await create_rfq(buyer)
    quotes = []
    for i in range(count):
        supplier = await register(client_factory(), role="supplier", company=f"کارگاه {i}")
        response = await submit_quote(supplier, rfq["id"], price=1_000_000_000 + i)
        assert response.status_code == 201
        quotes.append(response.json())
    return buyer, rfq, quotes


async def _award(account: Account, quotation_id: str) -> httpx.Response:
    return await account.client.post(f"{API}/quotations/{quotation_id}/award", headers=account.auth)


async def test_owner_awards_once_and_repeat_is_harmless(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    buyer, rfq, quotes = await _rfq_with_quotes(client_factory, 2)
    first = await _award(buyer, quotes[0]["id"])
    assert first.status_code == 200 and first.json()["isAwarded"] is True

    again = await _award(buyer, quotes[0]["id"])
    assert again.status_code == 200

    second = await _award(buyer, quotes[1]["id"])
    assert second.status_code == 409
    assert second.json()["detail"] == "برای این درخواست قبلاً برنده انتخاب شده است."

    detail = (await buyer.client.get(f"{API}/rfqs/{rfq['id']}", headers=buyer.auth)).json()
    assert detail["status"] == "awarded"
    assert detail["awardedQuotationId"] == quotes[0]["id"]

    async with engine.connect() as conn:
        events = await conn.scalar(
            text("SELECT count(*) FROM audit_events WHERE action = 'rfq.awarded'")
        )
    assert events == 1


async def test_only_the_owner_can_award(client_factory: Callable[[], httpx.AsyncClient]) -> None:
    _, _, quotes = await _rfq_with_quotes(client_factory, 1)
    other_buyer = await register(client_factory())
    supplier = await register(client_factory(), role="supplier")
    for account in (other_buyer, supplier):
        assert (await _award(account, quotes[0]["id"])).status_code == 404
    anonymous = await client_factory().post(f"{API}/quotations/{quotes[0]['id']}/award")
    assert anonymous.status_code == 401


async def test_concurrent_awards_produce_exactly_one_winner(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    buyer, _, quotes = await _rfq_with_quotes(client_factory, 5)
    responses = await asyncio.gather(*(_award(buyer, quotes[i % 5]["id"]) for i in range(20)))
    assert {r.status_code for r in responses} <= {200, 409}
    winners = {r.json()["id"] for r in responses if r.status_code == 200}
    assert len(winners) == 1

    async with engine.connect() as conn:
        awarded = await conn.scalar(
            text("SELECT count(*) FROM rfqs WHERE awarded_quotation_id IS NOT NULL")
        )
        winner = await conn.scalar(text("SELECT awarded_quotation_id::text FROM rfqs"))
    assert awarded == 1
    assert winner == winners.pop()


async def test_expired_quote_cannot_win(client_factory: Callable[[], httpx.AsyncClient]) -> None:
    buyer, _, quotes = await _rfq_with_quotes(client_factory, 1)
    async with engine.begin() as conn:
        await conn.execute(text("UPDATE quotations SET valid_until = current_date - 1"))
    response = await _award(buyer, quotes[0]["id"])
    assert response.status_code == 409
    assert response.json()["code"] == "quotation_expired"


async def test_database_rejects_winner_from_another_rfq(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    """قید پایگاه داده، مستقل از کد برنامه: برنده باید پیشنهادِ همان RFQ باشد."""
    _, rfq_a, _ = await _rfq_with_quotes(client_factory, 1)
    _, _, quotes_b = await _rfq_with_quotes(client_factory, 1)
    with pytest.raises(IntegrityError):
        async with engine.begin() as conn:
            await conn.execute(
                text("UPDATE rfqs SET awarded_quotation_id = :q, status = 'awarded' WHERE id = :r"),
                {"q": quotes_b[0]["id"], "r": rfq_a["id"]},
            )
