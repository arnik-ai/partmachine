"""برآورد قیمت: محاسبه‌ی سازگار و ورودی‌های محدود (PR1، PR2)."""

import httpx

from tests.helpers import API


async def test_estimate_components_add_up(client: httpx.AsyncClient) -> None:
    response = await client.post(
        f"{API}/pricing/estimate",
        json={
            "capability": "cnc",
            "material": "استیل 304",
            "quantity": 100,
            "complexity": "normal",
        },
    )
    assert response.status_code == 200
    estimate = response.json()
    assert sum(c["amountRials"] for c in estimate["components"]) == estimate["totalPriceRials"]
    assert estimate["rangeLowRials"] < estimate["totalPriceRials"] < estimate["rangeHighRials"]


async def test_estimate_rejects_unbounded_or_negative_input(client: httpx.AsyncClient) -> None:
    huge = '{"capability": "cnc", "material": "x", "quantity": 1' + "0" * 400 + "}"
    response = await client.post(
        f"{API}/pricing/estimate", content=huge, headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 422
    for body in (
        {"capability": "cnc", "material": "x", "quantity": 10, "kgPerPiece": -50},
        {"capability": "laser", "material": "x", "quantity": 10},
        {"capability": "cnc", "material": "x", "quantity": 0},
    ):
        assert (await client.post(f"{API}/pricing/estimate", json=body)).status_code == 422
