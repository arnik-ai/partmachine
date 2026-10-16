"""قطعه‌ی کارفرما: با گزینه‌ی «کارفرما قطعه یا مواد را می‌فرستد» در قرارداد، سفارش پس از امضا (و
پیش‌پرداخت) منتظر رسیدن قطعه می‌ماند، فقط مجری رسیدنش را اعلام می‌کند و مهلت تحویل از همان روز
شمرده می‌شود."""

from collections.abc import Callable
from datetime import timedelta
from typing import Any

import httpx

from app.core.time import business_today
from tests.helpers import API, Account, signed_order


async def _order(account: Account, order_id: str) -> dict[str, Any]:
    response = await account.client.get(f"{API}/orders/{order_id}", headers=account.auth)
    assert response.status_code == 200, response.text
    return response.json()  # type: ignore[no-any-return]


async def _confirm(account: Account, order_id: str, note: str = "") -> httpx.Response:
    return await account.client.post(
        f"{API}/orders/{order_id}/confirm-material", json={"note": note}, headers=account.auth
    )


async def test_the_deadline_starts_when_the_part_arrives(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    deal, order_id = await signed_order(client_factory, material_from_buyer=True)
    waiting = await _order(deal.supplier, order_id)
    assert waiting["status"] == "awaiting_material"
    assert waiting["materialFromBuyer"] is True and waiting["materialReceivedAt"] is None
    assert "confirm_material" in waiting["nextActions"]
    assert waiting["isOverdue"] is False
    assert "confirm_material" not in (await _order(deal.buyer, order_id))["nextActions"]

    contract = (
        await deal.buyer.client.get(f"{API}/orders/{order_id}/contract", headers=deal.buyer.auth)
    ).json()
    assert contract["terms"]["materialFromBuyer"] is True
    delivery = next(a for a in contract["articles"] if a["number"] == 4)
    assert "پس از رسیدن آن" in delivery["paragraphs"][0]

    # فقط مجری رسیدن قطعه را اعلام می‌کند
    assert (await _confirm(deal.buyer, order_id)).status_code == 403

    confirmed = await _confirm(deal.supplier, order_id, "۲۰۰ قطعه‌ی خام سالم رسید")
    assert confirmed.status_code == 200, confirmed.text
    order = confirmed.json()
    today = business_today()
    assert order["status"] == "in_production"
    assert order["materialReceivedAt"] == today.isoformat()
    assert order["deliveryDue"] == (today + timedelta(days=order["leadTimeDays"])).isoformat()
    event = next(e for e in order["events"] if e["action"] == "confirm_material")
    assert event["note"].startswith("۲۰۰ قطعه‌ی خام سالم رسید")

    # تکرار بی‌اثر است و مهلت عوض نمی‌شود
    again = await _confirm(deal.supplier, order_id)
    assert again.status_code == 200 and again.json()["deliveryDue"] == order["deliveryDue"]


async def test_after_the_prepayment_the_order_waits_for_the_part(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    deal, order_id = await signed_order(client_factory, prepayment=30, material_from_buyer=True)
    assert (await _order(deal.buyer, order_id))["status"] == "awaiting_prepayment"
    payments = (
        await deal.buyer.client.get(f"{API}/orders/{order_id}/payments", headers=deal.buyer.auth)
    ).json()
    prepayment = next(p for p in payments["items"] if p["kind"] == "prepayment")
    reported = await deal.buyer.client.post(
        f"{API}/orders/{order_id}/payments/{prepayment['id']}/report",
        json={"paidOn": business_today().isoformat(), "reference": "123456", "note": ""},
        headers=deal.buyer.auth,
    )
    assert reported.status_code == 200, reported.text
    confirmed = await deal.supplier.client.post(
        f"{API}/orders/{order_id}/payments/{prepayment['id']}/confirm",
        json={},
        headers=deal.supplier.auth,
    )
    assert confirmed.status_code == 200, confirmed.text
    assert (await _order(deal.buyer, order_id))["status"] == "awaiting_material"


async def test_without_the_option_production_starts_on_signing(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    deal, order_id = await signed_order(client_factory)
    order = await _order(deal.supplier, order_id)
    assert order["status"] == "in_production" and order["materialFromBuyer"] is False
    assert (await _confirm(deal.supplier, order_id)).status_code == 200  # بی‌اثر
    assert (await _order(deal.supplier, order_id))["materialReceivedAt"] is None
