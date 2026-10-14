"""آمار داشبورد از داده‌ی واقعی (گام 3e فاز ۳): هر نقش فقط داده‌ی سازمان خودش را می‌شمارد."""

from collections.abc import Callable

import httpx

from tests.helpers import (
    API,
    Account,
    award,
    create_rfq,
    make_admin,
    make_deal,
    register,
    signed_order,
    submit_quote,
    verified_lab,
)


async def _stats(account: Account) -> dict[str, int]:
    response = await account.client.get(f"{API}/dashboard", headers=account.auth)
    assert response.status_code == 200, response.text
    return {item["key"]: item["value"] for item in response.json()["stats"]}


async def test_buyer_and_supplier_stats_count_only_their_organization(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    deal = await make_deal(client_factory)
    second_rfq = await create_rfq(deal.buyer, title="ساخت ۵۰ عدد فلنج")
    rival = await register(client_factory(), role="supplier", company="کارگاه رقیب")
    await submit_quote(rival, deal.rfq["id"])
    await submit_quote(rival, second_rfq["id"])
    other_buyer = await register(client_factory(), company="کارخانه‌ی دیگر")
    await create_rfq(other_buyer, title="درخواست سازمان دیگر")

    assert await _stats(deal.buyer) == {
        "open_rfqs": 2,
        "quotes_received": 3,
        "active_orders": 0,
        "completed_orders": 0,
    }
    # قطعه‌ساز: درخواست‌های باز بازار (همه‌ی سازمان‌ها) و پیشنهادهای فعال خودش
    assert await _stats(rival) == {
        "open_market_rfqs": 3,
        "active_quotes": 2,
        "active_orders": 0,
        "completed_orders": 0,
    }

    await award(deal)
    assert await _stats(deal.buyer) == {
        "open_rfqs": 1,
        "quotes_received": 1,
        "active_orders": 1,
        "completed_orders": 0,
    }
    assert (await _stats(deal.supplier))["active_orders"] == 1
    assert (await _stats(rival))["active_quotes"] == 1  # پیشنهاد درخواست واگذارشده دیگر فعال نیست
    assert (await _stats(other_buyer))["active_orders"] == 0


async def test_lab_and_admin_stats(client_factory: Callable[[], httpx.AsyncClient]) -> None:
    admin = await make_admin(client_factory())
    lab = await verified_lab(client_factory, admin, "آزمایشگاه آمار")
    await register(client_factory(), role="qc", company="آزمایشگاه تأییدنشده")
    deal, order_id = await signed_order(client_factory)
    await deal.buyer.client.put(
        f"{API}/orders/{order_id}/inspection",
        json={"labOrganizationId": lab.user["organizationId"]},
        headers=deal.buyer.auth,
    )
    assert await _stats(lab) == {
        "inspections_waiting": 1,
        "inspections_ready": 0,
        "inspections_passed": 0,
    }
    await deal.supplier.client.post(
        f"{API}/orders/{order_id}/inspection/ready", json={}, headers=deal.supplier.auth
    )
    assert (await _stats(lab))["inspections_ready"] == 1

    assert await _stats(admin) == {
        "pending_verifications": 0,
        "open_disputes": 0,
        "unverified_accounts": 1,
        "active_orders": 1,
        "active_users": 4,
    }
