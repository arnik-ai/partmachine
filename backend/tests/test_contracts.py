"""قرارداد (گام 3b فاز ۳): تنظیم خودکار از روی سفارش، نسخه‌های تغییرناپذیر با هش، اصلاح پارامترها
فقط توسط کارفرما و باطل شدن امضاهای قبلی (O5)، امضای مدیر هر دو طرف با رمز عبور و شاهد کامل
(O2، O3)، رفتن سفارش به تولید یا پیش‌پرداخت، و قفل شدن قرارداد."""

import json
from collections.abc import Callable
from datetime import timedelta
from typing import Any

import httpx
from sqlalchemy import select

from app.core.time import business_today
from app.db.session import engine
from app.modules.contracts.models import ContractSignature, ContractVersion
from tests.helpers import (
    API,
    PASSWORD,
    Account,
    Deal,
    award,
    join_organization,
    make_deal,
    order_of,
    register,
)


async def _contract(account: Account, order_id: str) -> httpx.Response:
    return await account.client.get(f"{API}/orders/{order_id}/contract", headers=account.auth)


async def _sign(
    account: Account, order_id: str, version: int, password: str = PASSWORD
) -> httpx.Response:
    return await account.client.post(
        f"{API}/orders/{order_id}/contract/sign",
        json={"version": version, "password": password},
        headers=account.auth,
    )


def _terms(**overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "deliveryDue": (business_today() + timedelta(days=40)).isoformat(),
        "prepaymentPercent": 0,
        "penaltyPerDayBp": 50,
        "penaltyCapPercent": 10,
        "changeNote": "",
    }
    body.update(overrides)
    return body


async def _revise(account: Account, order_id: str, **overrides: Any) -> httpx.Response:
    return await account.client.put(
        f"{API}/orders/{order_id}/contract", json=_terms(**overrides), headers=account.auth
    )


async def _awarded(client_factory: Callable[[], httpx.AsyncClient]) -> tuple[Deal, str]:
    deal = await make_deal(client_factory)
    await award(deal)
    order = await order_of(deal)
    return deal, str(order["id"])


async def test_contract_is_prepared_from_the_order(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    deal, order_id = await _awarded(client_factory)
    response = await _contract(deal.buyer, order_id)
    assert response.status_code == 200, response.text
    contract = response.json()
    assert contract["version"] == 1 and contract["status"] == "draft"
    assert contract["terms"]["prepaymentPercent"] == 0
    assert contract["terms"]["penaltyPerDayBp"] == 50
    assert contract["terms"]["penaltyCapPercent"] == 10
    assert len(contract["contentSha256"]) == 64 and contract["draftNotice"]
    assert contract["mySide"] == "buyer"
    assert contract["canEdit"] and contract["canSign"] and not contract["canRequestChange"]

    text = json.dumps(contract["articles"], ensure_ascii=False)
    assert "کارخانه‌ی خریدار" in text and "کارگاه برنده" in text
    assert "۲۰۰٬۰۰۰٬۰۰۰ تومان" in text  # ۲ میلیارد ریال
    assert "ساخت ۲۰۰ عدد بوش برنجی" in text
    # O6: پلتفرم وجهی نگهداری نمی‌کند و متن نباید وعده‌ی پرداخت امانی بدهد
    assert "امانی" not in text and "وجهی دریافت یا نگهداری نمی‌کند" in text

    supplier_view = (await _contract(deal.supplier, order_id)).json()
    assert supplier_view["contentSha256"] == contract["contentSha256"]
    assert supplier_view["mySide"] == "supplier" and not supplier_view["canEdit"]
    assert supplier_view["canSign"] and supplier_view["canRequestChange"]

    outsider = await register(client_factory())
    assert (await _contract(outsider, order_id)).status_code == 404
    async with engine.connect() as conn:
        versions = list(await conn.scalars(select(ContractVersion.number)))
    assert versions == [1]


async def test_revising_terms_makes_a_new_version_and_resets_signatures(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    deal, order_id = await _awarded(client_factory)
    assert (await _sign(deal.buyer, order_id, 1)).json()["status"] == "partially_signed"

    supplier_edit = await _revise(deal.supplier, order_id)
    assert supplier_edit.status_code == 403
    past = await _revise(
        deal.buyer, order_id, deliveryDue=(business_today() - timedelta(days=1)).isoformat()
    )
    assert past.status_code == 422 and past.json()["errors"][0]["field"] == "deliveryDue"

    revised = await _revise(
        deal.buyer, order_id, prepaymentPercent=30, changeNote="پیش‌پرداخت طبق توافق تلفنی"
    )
    assert revised.status_code == 200, revised.text
    body = revised.json()
    assert body["version"] == 2 and body["status"] == "draft" and body["signatures"] == []
    assert body["history"][0]["number"] == 1
    assert [s["side"] for s in body["history"][0]["signatures"]] == ["buyer"]
    assert "۳۰٪ مبلغ (۶۰٬۰۰۰٬۰۰۰ تومان)" in json.dumps(body["articles"], ensure_ascii=False)

    order = await order_of(deal)
    assert order["deliveryDue"] == body["terms"]["deliveryDue"]
    assert order["events"][-1]["action"] == "contract_revised"
    assert order["events"][-1]["note"] == "پیش‌پرداخت طبق توافق تلفنی"

    same = await _revise(deal.buyer, order_id, prepaymentPercent=30)
    assert same.json()["version"] == 2  # بدون تغییر، نسخه‌ی تازه ساخته نمی‌شود


async def test_both_owners_sign_and_the_order_moves_to_production(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    deal, order_id = await _awarded(client_factory)
    member = await join_organization(deal.supplier, client_factory())
    not_owner = await _sign(member, order_id, 1)
    assert not_owner.status_code == 403 and not_owner.json()["code"] == "not_org_owner"
    wrong = await _sign(deal.supplier, order_id, 1, password="not-the-password")
    assert wrong.status_code == 422 and wrong.json()["errors"][0]["field"] == "password"

    await _revise(deal.buyer, order_id, penaltyPerDayBp=20)
    stale = await _sign(deal.supplier, order_id, 1)
    assert stale.status_code == 409 and stale.json()["code"] == "contract_changed"

    assert (await _sign(deal.buyer, order_id, 2)).status_code == 200
    signed = await _sign(deal.supplier, order_id, 2)
    assert signed.status_code == 200, signed.text
    assert signed.json()["status"] == "signed" and signed.json()["signedAt"]

    order = await order_of(deal)
    assert order["status"] == "in_production"
    last = order["events"][-1]
    assert (last["action"], last["fromStatus"], last["toStatus"]) == (
        "contract_signed",
        "awaiting_contract",
        "in_production",
    )
    supplier_order = (
        await deal.supplier.client.get(f"{API}/orders/{order_id}", headers=deal.supplier.auth)
    ).json()
    # پس از امضا: ارسال، و «درخواست لغو» و «اعلام مشکل» (O11)
    assert supplier_order["nextActions"] == ["cancel", "ship", "dispute"]

    # پس از امضا قرارداد قفل است؛ امضای تکراری بی‌اثر است
    locked = await _revise(deal.buyer, order_id, prepaymentPercent=50)
    assert locked.status_code == 409 and locked.json()["code"] == "contract_locked"
    again = await _sign(deal.buyer, order_id, 2)
    assert again.status_code == 200 and again.json()["status"] == "signed"

    async with engine.connect() as conn:
        rows = (
            await conn.execute(
                select(
                    ContractSignature.side, ContractSignature.ip, ContractSignature.content_sha256
                )
            )
        ).all()
        current_hash = await conn.scalar(
            select(ContractVersion.content_sha256).where(ContractVersion.number == 2)
        )
    assert sorted(r.side for r in rows) == ["buyer", "supplier"]
    assert all(r.ip and r.content_sha256 == current_hash for r in rows)


async def test_prepayment_waits_after_signing(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    deal, order_id = await _awarded(client_factory)
    await _revise(deal.buyer, order_id, prepaymentPercent=30)
    await _sign(deal.buyer, order_id, 2)
    await _sign(deal.supplier, order_id, 2)
    assert (await order_of(deal))["status"] == "awaiting_prepayment"


async def test_change_requests_and_cancelled_orders(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    deal, order_id = await _awarded(client_factory)
    requested = await deal.supplier.client.post(
        f"{API}/orders/{order_id}/contract/change-request",
        json={"note": "تاریخ تحویل را ده روز عقب‌تر بگذارید"},
        headers=deal.supplier.auth,
    )
    assert requested.status_code == 200
    event = (await order_of(deal))["events"][-1]
    assert event["action"] == "contract_change_requested"
    assert event["note"] == "تاریخ تحویل را ده روز عقب‌تر بگذارید"
    from_buyer = await deal.buyer.client.post(
        f"{API}/orders/{order_id}/contract/change-request",
        json={"note": "نیازی نیست"},
        headers=deal.buyer.auth,
    )
    assert from_buyer.status_code == 403

    await deal.buyer.client.post(
        f"{API}/orders/{order_id}/cancel",
        json={"reason": "پروژه منتفی شد"},
        headers=deal.buyer.auth,
    )
    assert (await _revise(deal.buyer, order_id)).status_code == 409
    assert (await _sign(deal.supplier, order_id, 1)).status_code == 409
