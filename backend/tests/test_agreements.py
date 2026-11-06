"""توافق‌ها: متن نسخه‌دار، پذیرش اجباری در سرور و ثبت شاهد پذیرش (F32 گزارش فاز ۰)."""

import asyncio
from collections.abc import Callable

import httpx
from sqlalchemy import text

from app.db.session import engine
from app.modules.agreements.catalog import AGREEMENTS, SUPPLIER_SIGNUP
from tests.helpers import (
    API,
    PASSWORD,
    accept_nda,
    create_rfq,
    register,
    rfq_body,
    set_quotes_due,
    set_supplier_verified,
    signup_agreements,
)

MISSING_TERMS = "برای ادامه، قوانین را مطالعه کنید و همه‌ی بندها را بپذیرید."


def _registration(**extra: object) -> dict[str, object]:
    return {
        "email": "terms@example.com",
        "password": PASSWORD,
        "fullName": "سارا محمدی",
        "role": "buyer",
        **extra,
    }


async def test_agreement_texts_are_public_and_versioned(client: httpx.AsyncClient) -> None:
    response = await client.get(f"{API}/agreements/supplier_signup")
    assert response.status_code == 200
    body = response.json()
    assert body["version"] == SUPPLIER_SIGNUP.version
    assert body["items"][0]["critical"] is True
    assert (await client.get(f"{API}/agreements/unknown")).status_code == 404


async def test_registration_requires_the_current_terms_of_the_role(
    client: httpx.AsyncClient,
) -> None:
    missing = await client.post(f"{API}/auth/register", json=_registration())
    assert missing.status_code == 422
    assert missing.json()["errors"] == [{"field": "acceptedAgreements", "message": MISSING_TERMS}]

    outdated = await client.post(
        f"{API}/auth/register",
        json=_registration(acceptedAgreements=[{"key": "buyer_signup", "version": "old"}]),
    )
    assert outdated.status_code == 422
    assert "به‌روز شده" in outdated.json()["detail"]

    other_role = await client.post(
        f"{API}/auth/register", json=_registration(acceptedAgreements=signup_agreements("qc"))
    )
    assert other_role.status_code == 422

    async with engine.connect() as conn:
        assert await conn.scalar(text("SELECT count(*) FROM users")) == 0


async def test_acceptance_is_recorded_with_version_and_client(client: httpx.AsyncClient) -> None:
    response = await client.post(
        f"{API}/auth/register",
        json=_registration(acceptedAgreements=signup_agreements("buyer")),
        headers={"User-Agent": "TestBrowser/1.0"},
    )
    assert response.status_code == 201
    async with engine.connect() as conn:
        row = (
            await conn.execute(
                text("SELECT document, version, ip, user_agent, rfq_id FROM agreement_acceptances")
            )
        ).one()
    assert row.document == "buyer_signup"
    assert row.version == AGREEMENTS["buyer_signup"].version
    assert row.ip
    assert row.user_agent == "TestBrowser/1.0"
    assert row.rfq_id is None


async def test_rfq_creation_requires_the_buyer_terms(client: httpx.AsyncClient) -> None:
    buyer = await register(client)
    response = await client.post(
        f"{API}/rfqs", json=rfq_body(acceptedAgreements=[]), headers=buyer.auth
    )
    assert response.status_code == 422
    assert response.json()["errors"][0]["field"] == "acceptedAgreements"

    rfq = await create_rfq(buyer)
    async with engine.connect() as conn:
        linked = await conn.scalar(
            text("SELECT rfq_id::text FROM agreement_acceptances WHERE document = 'buyer_order'")
        )
    assert linked == rfq["id"]


async def test_supplier_accepts_rfq_nda_once_per_organization(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    buyer = await register(client_factory())
    supplier = await register(client_factory(), role="supplier")
    await set_supplier_verified(supplier)
    rfq = await create_rfq(buyer)

    before = await supplier.client.get(f"{API}/rfqs/{rfq['id']}", headers=supplier.auth)
    assert before.json()["ndaAccepted"] is False

    wrong = await supplier.client.post(
        f"{API}/rfqs/{rfq['id']}/nda",
        json={"key": "rfq_nda", "version": "old"},
        headers=supplier.auth,
    )
    assert wrong.status_code == 422

    first, second = await asyncio.gather(
        accept_nda(supplier, rfq["id"]), accept_nda(supplier, rfq["id"])
    )
    assert first.status_code == second.status_code == 200
    assert first.json()["ndaAccepted"] is True
    async with engine.connect() as conn:
        count = await conn.scalar(
            text("SELECT count(*) FROM agreement_acceptances WHERE document = 'rfq_nda'")
        )
    assert count == 1


async def test_nda_respects_rfq_visibility(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    buyer = await register(client_factory())
    other_buyer = await register(client_factory())
    supplier = await register(client_factory(), role="supplier")
    rfq = await create_rfq(buyer)

    assert (await accept_nda(other_buyer, rfq["id"])).status_code == 403
    await set_quotes_due(rfq["id"], -1)
    # قطعه‌سازی که پیشنهاد نداده، RFQ بسته‌شده را نمی‌بیند
    assert (await accept_nda(supplier, rfq["id"])).status_code == 404
