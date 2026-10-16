"""چرخه‌ی RFQ و پیشنهاد (گام 2a فاز ۲): مهلت دریافت پیشنهاد، فید قطعه‌سازها، ویرایش، پس‌گرفتن
و ثبت دوباره‌ی پیشنهاد، لغو و تغییر مهلت، وضعیت‌های مؤثر، «پیشنهادهای من» و ارزیابی قیمت."""

from collections.abc import Callable
from datetime import timedelta

import httpx
from sqlalchemy import text

from app.core.time import business_today
from app.db.session import engine
from tests.helpers import (
    API,
    Account,
    create_rfq,
    quote_body,
    register,
    rfq_body,
    set_quotes_due,
    submit_quote,
)


def _in_days(days: int) -> str:
    return (business_today() + timedelta(days=days)).isoformat()


async def _get(account: Account, path: str) -> httpx.Response:
    return await account.client.get(f"{API}{path}", headers=account.auth)


async def _post(account: Account, path: str, body: object | None = None) -> httpx.Response:
    return await account.client.post(f"{API}{path}", json=body or {}, headers=account.auth)


async def test_quotes_due_defaults_and_validation(client: httpx.AsyncClient) -> None:
    buyer = await register(client)
    default = await create_rfq(buyer, deadline=_in_days(30))
    assert default["quotesDue"] == _in_days(7)
    short = await create_rfq(buyer, deadline=_in_days(3))
    assert short["quotesDue"] == _in_days(3)  # هرگز دیرتر از مهلت تحویل
    explicit = await create_rfq(buyer, deadline=_in_days(30), quotesDue=_in_days(12))
    assert explicit["quotesDue"] == _in_days(12)

    after = await client.post(
        f"{API}/rfqs",
        json=rfq_body(deadline=_in_days(5), quotesDue=_in_days(9)),
        headers=buyer.auth,
    )
    assert after.status_code == 422
    assert after.json()["errors"] == [
        {
            "field": "quotesDue",
            "message": "مهلت دریافت پیشنهاد نمی‌تواند بعد از مهلت تحویل باشد.",
        }
    ]
    past = await client.post(
        f"{API}/rfqs", json=rfq_body(quotesDue=_in_days(-1)), headers=buyer.auth
    )
    assert past.status_code == 422


async def test_feed_lists_only_open_rfqs_for_suppliers(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    buyer = await register(client_factory())
    supplier = await register(client_factory(), role="supplier")
    flange = await create_rfq(buyer, title="فلنج استیل", capability="cnc", deliveryCity="تهران")
    pump = await create_rfq(
        buyer,
        title="بدنه‌ي پمپ چدنی",  # «ي» عربی
        capability="casting",
        deliveryCity="اصفهان",
        quotesDue=_in_days(2),
    )
    expired = await create_rfq(buyer, title="درخواست منقضی")
    await set_quotes_due(expired["id"], -1)
    cancelled = await create_rfq(buyer, title="درخواست لغوشده")
    assert (await _post(buyer, f"/rfqs/{cancelled['id']}/cancel")).status_code == 200

    feed = (await _get(supplier, "/rfqs/open")).json()
    assert feed["total"] == 2
    assert {item["id"] for item in feed["items"]} == {flange["id"], pump["id"]}
    for item in feed["items"]:
        assert item["files"] == [] and item["quotationsCount"] is None
        assert item["status"] == "published" and item["myQuotation"] is None

    by_capability = (await _get(supplier, "/rfqs/open?capability=casting")).json()
    assert [i["id"] for i in by_capability["items"]] == [pump["id"]]
    by_city = await supplier.client.get(
        f"{API}/rfqs/open", params={"city": "اصفهان"}, headers=supplier.auth
    )
    assert [i["id"] for i in by_city.json()["items"]] == [pump["id"]]
    by_text = await supplier.client.get(
        f"{API}/rfqs/open", params={"q": "بدنه‌ی پمپ"}, headers=supplier.auth
    )
    assert [i["id"] for i in by_text.json()["items"]] == [pump["id"]]
    closing = (await _get(supplier, "/rfqs/open?sort=closing")).json()
    assert closing["items"][0]["id"] == pump["id"]

    quote = (await submit_quote(supplier, flange["id"])).json()
    mine = next(
        i for i in (await _get(supplier, "/rfqs/open")).json()["items"] if i["id"] == flange["id"]
    )
    assert mine["myQuotation"] == {"id": quote["id"], "status": "active"}

    assert (await _get(buyer, "/rfqs/open")).status_code == 403


async def test_effective_status_follows_dates_and_quotes(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    buyer = await register(client_factory())
    supplier = await register(client_factory(), role="supplier")
    outsider = await register(client_factory(), role="supplier")
    rfq = await create_rfq(buyer)
    empty = await create_rfq(buyer, title="بدون پیشنهاد")
    assert rfq["status"] == "published"

    quote = (await submit_quote(supplier, rfq["id"])).json()
    assert (await _get(buyer, f"/rfqs/{rfq['id']}")).json()["status"] == "quoting"
    # قطعه‌ساز از وجود پیشنهاد رقبا خبردار نمی‌شود
    assert (await _get(supplier, f"/rfqs/{rfq['id']}")).json()["status"] == "published"

    await set_quotes_due(rfq["id"], -1)
    await set_quotes_due(empty["id"], -1)
    assert (await _get(buyer, f"/rfqs/{rfq['id']}")).json()["status"] == "evaluating"
    assert (await _get(supplier, f"/rfqs/{rfq['id']}")).json()["status"] == "evaluating"
    assert (await _get(buyer, f"/rfqs/{empty['id']}")).json()["status"] == "expired"
    assert (await _get(outsider, f"/rfqs/{rfq['id']}")).status_code == 404

    # پس از پایان مهلت دریافت پیشنهاد هم کارفرما برنده را انتخاب می‌کند
    award = await _post(buyer, f"/quotations/{quote['id']}/award")
    assert award.status_code == 200
    assert (await _get(buyer, f"/rfqs/{rfq['id']}")).json()["status"] == "awarded"


async def test_supplier_can_revise_quote_until_quotes_due(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    buyer = await register(client_factory())
    supplier = await register(client_factory(), role="supplier")
    rival = await register(client_factory(), role="supplier")
    rfq = await create_rfq(buyer)
    quote = (await submit_quote(supplier, rfq["id"], price=2_000_000_000)).json()
    assert quote["revision"] == 1

    revised = await supplier.client.patch(
        f"{API}/quotations/{quote['id']}",
        json=quote_body(1_800_000_000, leadTimeDays=10),
        headers=supplier.auth,
    )
    assert revised.status_code == 200
    assert revised.json()["revision"] == 2
    owner_view = (await _get(buyer, f"/rfqs/{rfq['id']}/quotations")).json()
    assert owner_view[0]["totalPriceRials"] == 1_800_000_000
    assert owner_view[0]["leadTimeDays"] == 10

    async with engine.connect() as conn:
        previous = await conn.scalar(
            text(
                "SELECT data -> 'previous' ->> 'total_price_rials' FROM audit_events "
                "WHERE action = 'quotation.revised'"
            )
        )
    assert previous == "2000000000"

    stranger = await rival.client.patch(
        f"{API}/quotations/{quote['id']}", json=quote_body(1), headers=rival.auth
    )
    assert stranger.status_code == 404

    await set_quotes_due(rfq["id"], -1)
    late = await supplier.client.patch(
        f"{API}/quotations/{quote['id']}", json=quote_body(1_700_000_000), headers=supplier.auth
    )
    assert late.status_code == 409
    assert late.json()["code"] == "rfq_expired"


async def test_withdraw_and_resubmit(client_factory: Callable[[], httpx.AsyncClient]) -> None:
    buyer = await register(client_factory())
    supplier = await register(client_factory(), role="supplier")
    rfq = await create_rfq(buyer)
    quote = (await submit_quote(supplier, rfq["id"])).json()

    withdrawn = await _post(supplier, f"/quotations/{quote['id']}/withdraw")
    assert withdrawn.status_code == 200 and withdrawn.json()["status"] == "withdrawn"
    assert (await _post(supplier, f"/quotations/{quote['id']}/withdraw")).status_code == 200

    assert (await _get(buyer, f"/rfqs/{rfq['id']}/quotations")).json() == []
    assert (await _get(buyer, f"/rfqs/{rfq['id']}")).json()["quotationsCount"] == 0
    award = await _post(buyer, f"/quotations/{quote['id']}/award")
    assert award.status_code == 409 and award.json()["code"] == "quotation_withdrawn"

    edit = await supplier.client.patch(
        f"{API}/quotations/{quote['id']}", json=quote_body(), headers=supplier.auth
    )
    assert edit.status_code == 409 and edit.json()["code"] == "quotation_withdrawn"

    resubmitted = await submit_quote(supplier, rfq["id"], price=1_200_000_000)
    assert resubmitted.status_code == 201
    assert resubmitted.json()["id"] == quote["id"]
    assert resubmitted.json()["status"] == "active"
    assert resubmitted.json()["revision"] == 2
    assert (await _get(supplier, f"/rfqs/{rfq['id']}")).json()["myQuotation"] == {
        "id": quote["id"],
        "status": "active",
    }


async def test_no_withdrawal_after_award(client_factory: Callable[[], httpx.AsyncClient]) -> None:
    buyer = await register(client_factory())
    supplier = await register(client_factory(), role="supplier")
    rfq = await create_rfq(buyer)
    quote = (await submit_quote(supplier, rfq["id"])).json()
    assert (await _post(buyer, f"/quotations/{quote['id']}/award")).status_code == 200
    response = await _post(supplier, f"/quotations/{quote['id']}/withdraw")
    assert response.status_code == 409 and response.json()["code"] == "rfq_closed"


async def test_owner_can_cancel_rfq(client_factory: Callable[[], httpx.AsyncClient]) -> None:
    buyer = await register(client_factory())
    other_buyer = await register(client_factory())
    supplier = await register(client_factory(), role="supplier")
    late_supplier = await register(client_factory(), role="supplier")
    rfq = await create_rfq(buyer)
    quote = (await submit_quote(supplier, rfq["id"])).json()

    assert (await _post(other_buyer, f"/rfqs/{rfq['id']}/cancel")).status_code == 404
    assert (await _post(supplier, f"/rfqs/{rfq['id']}/cancel")).status_code == 404

    cancelled = await _post(buyer, f"/rfqs/{rfq['id']}/cancel", {"reason": "پروژه منتفی شد"})
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"
    assert cancelled.json()["cancelReason"] == "پروژه منتفی شد"

    supplier_view = (await _get(supplier, f"/rfqs/{rfq['id']}")).json()
    assert supplier_view["status"] == "cancelled" and supplier_view["cancelReason"] is None
    outcome = (await _get(supplier, "/quotations/mine")).json()["items"][0]["outcome"]
    assert outcome == "cancelled"

    late = await submit_quote(late_supplier, rfq["id"])
    assert late.status_code == 409 and late.json()["code"] == "rfq_closed"
    award = await _post(buyer, f"/quotations/{quote['id']}/award")
    assert award.status_code == 409
    again = await _post(buyer, f"/rfqs/{rfq['id']}/cancel")
    assert again.status_code == 409 and again.json()["code"] == "rfq_not_cancellable"


async def test_reschedule_reopens_and_validates(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    buyer = await register(client_factory())
    other_buyer = await register(client_factory())
    supplier = await register(client_factory(), role="supplier")
    rfq = await create_rfq(buyer, deadline=_in_days(20))
    await set_quotes_due(rfq["id"], -1)
    assert (await _get(buyer, f"/rfqs/{rfq['id']}")).json()["status"] == "expired"

    reopened = await _post(buyer, f"/rfqs/{rfq['id']}/reschedule", {"quotesDue": _in_days(5)})
    assert reopened.status_code == 200
    assert reopened.json()["status"] == "published"
    assert reopened.json()["quotesDue"] == _in_days(5)
    assert (await submit_quote(supplier, rfq["id"])).status_code == 201

    too_late = await _post(buyer, f"/rfqs/{rfq['id']}/reschedule", {"quotesDue": _in_days(25)})
    assert too_late.status_code == 422
    assert too_late.json()["errors"][0]["field"] == "quotesDue"
    extended = await _post(
        buyer,
        f"/rfqs/{rfq['id']}/reschedule",
        {"quotesDue": _in_days(25), "deadline": _in_days(40)},
    )
    assert extended.status_code == 200 and extended.json()["deadline"] == _in_days(40)

    assert (
        await _post(other_buyer, f"/rfqs/{rfq['id']}/reschedule", {"quotesDue": _in_days(3)})
    ).status_code == 404

    quote_id = (await _get(buyer, f"/rfqs/{rfq['id']}/quotations")).json()[0]["id"]
    assert (await _post(buyer, f"/quotations/{quote_id}/award")).status_code == 200
    after_award = await _post(buyer, f"/rfqs/{rfq['id']}/reschedule", {"quotesDue": _in_days(3)})
    assert after_award.status_code == 409


async def test_my_quotations_show_outcomes(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    buyer = await register(client_factory())
    supplier = await register(client_factory(), role="supplier")
    rival = await register(client_factory(), role="supplier")
    won, lost, pending, withdrawn = [
        await create_rfq(buyer, title=f"درخواست {name}")
        for name in ("برنده", "بازنده", "در انتظار", "پس‌گرفته")
    ]
    mine = {
        rfq["id"]: (await submit_quote(supplier, rfq["id"])).json()
        for rfq in (won, lost, pending, withdrawn)
    }
    rival_quote = (await submit_quote(rival, lost["id"], price=900_000_000)).json()
    await _post(buyer, f"/quotations/{mine[won['id']]['id']}/award")
    await _post(buyer, f"/quotations/{rival_quote['id']}/award")
    await _post(supplier, f"/quotations/{mine[withdrawn['id']]['id']}/withdraw")

    page = (await _get(supplier, "/quotations/mine")).json()
    assert page["total"] == 4
    outcomes = {item["rfq"]["id"]: item["outcome"] for item in page["items"]}
    assert outcomes == {
        won["id"]: "won",
        lost["id"]: "lost",
        pending["id"]: "pending",
        withdrawn["id"]: "withdrawn",
    }
    statuses = {item["rfq"]["id"]: item["rfq"]["status"] for item in page["items"]}
    assert statuses[won["id"]] == "awarded" and statuses[pending["id"]] == "published"
    assert (await _get(buyer, "/quotations/mine")).status_code == 403
