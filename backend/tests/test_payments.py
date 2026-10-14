"""پیگیری پرداخت (گام 3c فاز ۳، O6 و O7): اقساط طبق قرارداد امضاشده، اعلام با رسید یا شماره‌ی
پیگیری (کارفرما)، تأیید یا رد با دلیل (قطعه‌ساز)، شروع تولید پس از تأیید پیش‌پرداخت، و تکمیل
خودکار سفارش پس از تحویل و تأیید همه‌ی اقساط. پول از پلتفرم عبور نمی‌کند."""

from collections.abc import Callable
from datetime import timedelta
from typing import Any

import httpx
from sqlalchemy import text

from app.core.time import business_today
from app.db.session import engine
from tests.helpers import (
    API,
    PASSWORD,
    PDF_BYTES,
    Account,
    Deal,
    award,
    make_deal,
    order_of,
    register,
    upload_file,
)


async def _signed(
    client_factory: Callable[[], httpx.AsyncClient], prepayment: int = 0
) -> tuple[Deal, str]:
    """سفارشی که قراردادش با درصد پیش‌پرداخت داده‌شده توسط هر دو طرف امضا شده است."""
    deal = await make_deal(client_factory)
    await award(deal)
    order_id = str((await order_of(deal))["id"])
    contract = (
        await deal.buyer.client.get(f"{API}/orders/{order_id}/contract", headers=deal.buyer.auth)
    ).json()
    version = contract["version"]
    if prepayment:
        revised = await deal.buyer.client.put(
            f"{API}/orders/{order_id}/contract",
            json={**contract["terms"], "prepaymentPercent": prepayment, "changeNote": ""},
            headers=deal.buyer.auth,
        )
        version = revised.json()["version"]
    for account in (deal.buyer, deal.supplier):
        signed = await account.client.post(
            f"{API}/orders/{order_id}/contract/sign",
            json={"version": version, "password": PASSWORD},
            headers=account.auth,
        )
        assert signed.status_code == 200, signed.text
    return deal, order_id


async def _payments(account: Account, order_id: str) -> dict[str, Any]:
    response = await account.client.get(f"{API}/orders/{order_id}/payments", headers=account.auth)
    assert response.status_code == 200, response.text
    return response.json()  # type: ignore[no-any-return]


async def _post(account: Account, order_id: str, path: str, body: dict[str, Any]) -> httpx.Response:
    return await account.client.post(
        f"{API}/orders/{order_id}/{path}", json=body, headers=account.auth
    )


def _report(reference: str = "123456", **extra: Any) -> dict[str, Any]:
    return {"paidOn": business_today().isoformat(), "reference": reference, "note": "", **extra}


async def _status(deal: Deal) -> str:
    return str((await order_of(deal))["status"])


async def test_single_payment_after_delivery_with_rejection_and_receipt(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    deal, order_id = await _signed(client_factory)
    payments = await _payments(deal.buyer, order_id)
    assert payments["totalRials"] == 2_000_000_000 and payments["confirmedRials"] == 0
    [final] = payments["items"]
    assert (final["kind"], final["percent"], final["amountRials"]) == ("final", 100, 2_000_000_000)
    # تسویه‌ی پایانی پیش از ارسال قابل اعلام نیست
    assert final["canReport"] is False
    early = await _post(deal.buyer, order_id, f"payments/{final['id']}/report", _report())
    assert early.status_code == 409 and early.json()["code"] == "payment_not_due"

    await _post(deal.supplier, order_id, "ship", {})
    pay = f"payments/{final['id']}"
    empty = await _post(deal.buyer, order_id, f"{pay}/report", _report(reference=""))
    assert empty.status_code == 422 and empty.json()["errors"][0]["field"] == "reference"
    future = (business_today() + timedelta(days=2)).isoformat()
    later = await _post(deal.buyer, order_id, f"{pay}/report", _report(paidOn=future))
    assert later.status_code == 422 and later.json()["errors"][0]["field"] == "paidOn"

    reported = await _post(deal.buyer, order_id, f"{pay}/report", _report(reference="۹۸۷۶۵۴"))
    item = reported.json()["items"][0]
    assert item["status"] == "reported" and item["reference"] == "987654"
    supplier_view = (await _payments(deal.supplier, order_id))["items"][0]
    assert supplier_view["canConfirm"] is True and supplier_view["canReport"] is False

    rejected = await _post(
        deal.supplier, order_id, f"{pay}/reject", {"reason": "واریزی به حساب نرسید"}
    )
    item = rejected.json()["items"][0]
    assert item["status"] == "pending" and item["rejectionReason"] == "واریزی به حساب نرسید"

    receipt = await upload_file(deal.buyer, "رسید.pdf", PDF_BYTES, "order_document")
    again = await _post(
        deal.buyer, order_id, f"{pay}/report", _report(reference="", fileId=receipt.json()["id"])
    )
    item = again.json()["items"][0]
    assert item["status"] == "reported" and item["receipt"]["name"] == "رسید.pdf"
    assert item["rejectionReason"] is None
    # رسید فقط برای دو طرف قابل دانلود است
    link = await deal.supplier.client.post(
        f"{API}/files/{item['receipt']['id']}/link", headers=deal.supplier.auth
    )
    assert link.status_code == 200

    confirmed = await _post(deal.supplier, order_id, f"{pay}/confirm", {})
    assert confirmed.json()["confirmedRials"] == 2_000_000_000
    assert await _status(deal) == "shipped"  # هنوز تحویل نشده
    await _post(deal.buyer, order_id, "confirm-delivery", {})
    order = await order_of(deal)
    assert order["status"] == "completed" and order["completedAt"]
    actions = [e["action"] for e in order["events"]]
    for expected in ("payment_reported", "payment_rejected", "payment_confirmed", "completed"):
        assert expected in actions


async def test_prepayment_unlocks_production_and_final_payment_completes(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    deal, order_id = await _signed(client_factory, prepayment=30)
    assert await _status(deal) == "awaiting_prepayment"
    prepayment, final = (await _payments(deal.buyer, order_id))["items"]
    assert (prepayment["kind"], prepayment["percent"], prepayment["amountRials"]) == (
        "prepayment",
        30,
        600_000_000,
    )
    assert (final["percent"], final["amountRials"]) == (70, 1_400_000_000)
    assert prepayment["canReport"] and not final["canReport"]
    blocked = await _post(deal.supplier, order_id, "ship", {})
    assert blocked.status_code == 409

    await _post(deal.buyer, order_id, f"payments/{prepayment['id']}/report", _report())
    await _post(deal.supplier, order_id, f"payments/{prepayment['id']}/confirm", {})
    order = await order_of(deal)
    assert order["status"] == "in_production"
    last = order["events"][-1]
    assert (last["action"], last["fromStatus"], last["toStatus"]) == (
        "payment_confirmed",
        "awaiting_prepayment",
        "in_production",
    )

    await _post(deal.supplier, order_id, "ship", {})
    await _post(deal.buyer, order_id, "confirm-delivery", {})
    assert await _status(deal) == "delivered"  # قسط پایانی مانده است
    await _post(deal.buyer, order_id, f"payments/{final['id']}/report", _report("555"))
    await _post(deal.supplier, order_id, f"payments/{final['id']}/confirm", {})
    assert await _status(deal) == "completed"


async def test_full_prepayment_completes_on_delivery(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    deal, order_id = await _signed(client_factory, prepayment=100)
    [only] = (await _payments(deal.buyer, order_id))["items"]
    assert (only["kind"], only["percent"]) == ("prepayment", 100)
    await _post(deal.buyer, order_id, f"payments/{only['id']}/report", _report())
    await _post(deal.supplier, order_id, f"payments/{only['id']}/confirm", {})
    await _post(deal.supplier, order_id, "ship", {})
    delivered = await _post(deal.buyer, order_id, "confirm-delivery", {})
    assert delivered.json()["status"] == "completed"
    # تکرار تأیید تحویل پس از تکمیل، بی‌اثر و موفق است
    again = await _post(deal.buyer, order_id, "confirm-delivery", {})
    assert again.status_code == 200 and again.json()["status"] == "completed"


async def test_payment_roles_and_idempotency(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    deal, order_id = await _signed(client_factory, prepayment=50)
    prepayment = (await _payments(deal.buyer, order_id))["items"][0]
    pay = f"payments/{prepayment['id']}"

    not_reported = await _post(deal.supplier, order_id, f"{pay}/confirm", {})
    assert not_reported.status_code == 409
    assert (await _post(deal.supplier, order_id, f"{pay}/report", _report())).status_code == 403
    assert (await _post(deal.buyer, order_id, f"{pay}/report", _report())).status_code == 200
    repeat = await _post(deal.buyer, order_id, f"{pay}/report", _report("other"))
    assert repeat.status_code == 200 and repeat.json()["items"][0]["reference"] == "123456"
    assert (await _post(deal.buyer, order_id, f"{pay}/confirm", {})).status_code == 403
    assert (await _post(deal.supplier, order_id, f"{pay}/confirm", {})).status_code == 200
    assert (await _post(deal.supplier, order_id, f"{pay}/confirm", {})).status_code == 200

    outsider = await register(client_factory())
    hidden = await outsider.client.get(f"{API}/orders/{order_id}/payments", headers=outsider.auth)
    assert hidden.status_code == 404


async def test_payments_appear_for_contracts_signed_before_this_step(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    deal, order_id = await _signed(client_factory, prepayment=30)
    async with engine.begin() as conn:
        await conn.execute(
            text("DELETE FROM order_payments WHERE order_id = :id"), {"id": order_id}
        )
    items = (await _payments(deal.supplier, order_id))["items"]
    assert [(p["kind"], p["percent"]) for p in items] == [("prepayment", 30), ("final", 70)]
