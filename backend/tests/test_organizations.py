"""سازمان و اعضا (گام 2c فاز ۲): دعوت با لینک یک‌بارمصرف، عضو شدن، دسترسی مشترک به داده‌ی
سازمان، مدیریت فقط توسط مدیر، ابطال و انقضای دعوت، و قطع فوری دسترسی عضو حذف‌شده."""

import logging
import uuid
from collections.abc import Callable
from typing import Any

import httpx
import pytest
from sqlalchemy import text

from app.db.session import engine
from tests.helpers import (
    API,
    CSRF,
    PASSWORD,
    Account,
    create_rfq,
    register,
    signup_agreements,
    submit_quote,
)


async def _invite(owner: Account) -> dict[str, Any]:
    response = await owner.client.post(f"{API}/organization/invites", headers=owner.auth)
    assert response.status_code == 201, response.text
    return response.json()  # type: ignore[no-any-return]


def _join_body(token: str, role: str) -> dict[str, Any]:
    return {
        "email": f"member-{uuid.uuid4().hex[:10]}@example.com",
        "password": PASSWORD,
        "fullName": "عضو جدید سازمان",
        "role": role,
        "inviteToken": token,
        "acceptedAgreements": signup_agreements(role),
    }


async def _join(client: httpx.AsyncClient, token: str, role: str) -> Account:
    response = await client.post(f"{API}/auth/register", json=_join_body(token, role))
    assert response.status_code == 201, response.text
    data = response.json()
    return Account(client=client, user=data["user"], token=data["accessToken"])


async def test_invite_tokens_never_reach_the_logs(
    client_factory: Callable[[], httpx.AsyncClient], caplog: pytest.LogCaptureFixture
) -> None:
    """لینک دعوت تا ۷ روز عضویت می‌دهد؛ لاگ دسترسی فقط الگوی مسیر را نگه می‌دارد."""
    owner = await register(client_factory())
    invite = await _invite(owner)
    with caplog.at_level(logging.INFO, logger="partmachine.access"):
        assert (await client_factory().get(f"{API}/invites/{invite['token']}")).status_code == 200
    logged = [r for r in caplog.records if r.name == "partmachine.access"]
    assert logged and all(invite["token"] not in r.getMessage() for r in logged)
    assert all(invite["token"] not in str(getattr(r, "path", "")) for r in logged)
    assert any("/invites/{token}" in r.getMessage() for r in logged)


async def test_member_joins_the_inviting_organization(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    owner = await register(client_factory(), company="صنایع آزمون", full_name="مدیر آزمون")
    invite = await _invite(owner)
    assert invite["token"] and invite["createdByName"] == "مدیر آزمون"

    info = await client_factory().get(f"{API}/invites/{invite['token']}")
    assert info.status_code == 200
    assert info.json() | {"expiresAt": None} == {
        "organizationName": "صنایع آزمون",
        "role": "buyer",
        "inviterName": "مدیر آزمون",
        "expiresAt": None,
    }

    member = await _join(client_factory(), invite["token"], "buyer")
    assert member.user["organizationId"] == owner.user["organizationId"]
    assert member.user["orgRole"] == "member"
    assert member.user["companyName"] == "صنایع آزمون"

    organization = (await member.client.get(f"{API}/organization", headers=member.auth)).json()
    assert organization["myOrgRole"] == "member"
    assert [m["orgRole"] for m in organization["members"]] == ["owner", "member"]

    reused = await client_factory().post(
        f"{API}/auth/register", json=_join_body(invite["token"], "buyer")
    )
    assert reused.status_code == 422
    assert reused.json()["errors"][0]["field"] == "inviteToken"


async def test_members_share_the_organization_rfqs(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    owner = await register(client_factory())
    member = await _join(client_factory(), (await _invite(owner))["token"], "buyer")
    rfq = await create_rfq(owner)

    mine = (await member.client.get(f"{API}/rfqs/mine", headers=member.auth)).json()
    assert [item["id"] for item in mine["items"]] == [rfq["id"]]
    detail = (await member.client.get(f"{API}/rfqs/{rfq['id']}", headers=member.auth)).json()
    assert detail["isOwner"] is True and detail["quotationsCount"] == 0
    cancelled = await member.client.post(
        f"{API}/rfqs/{rfq['id']}/cancel", json={}, headers=member.auth
    )
    assert cancelled.status_code == 200


async def test_supplier_members_quote_on_behalf_of_the_organization(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    buyer = await register(client_factory())
    owner = await register(client_factory(), role="supplier", company="کارگاه مشترک")
    member = await _join(client_factory(), (await _invite(owner))["token"], "supplier")
    assert member.user["role"] == "supplier"
    rfq = await create_rfq(buyer)

    assert (await submit_quote(member, rfq["id"])).status_code == 201
    duplicate = await submit_quote(owner, rfq["id"])
    assert duplicate.status_code == 409 and duplicate.json()["code"] == "duplicate_quotation"
    owners_view = (await owner.client.get(f"{API}/quotations/mine", headers=owner.auth)).json()
    assert owners_view["total"] == 1
    assert owners_view["items"][0]["supplierName"] == "کارگاه مشترک"


async def test_only_the_owner_manages_invites_and_members(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    owner = await register(client_factory())
    member = await _join(client_factory(), (await _invite(owner))["token"], "buyer")
    for method, path in (
        ("post", "/organization/invites"),
        ("get", "/organization/invites"),
        ("delete", f"/organization/members/{owner.user['id']}"),
    ):
        response = await getattr(member.client, method)(f"{API}{path}", headers=member.auth)
        assert response.status_code == 403, path
        assert response.json()["code"] == "not_org_owner"


async def test_invites_can_be_revoked_and_expire(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    owner = await register(client_factory())
    first, second = await _invite(owner), await _invite(owner)
    listed = (await owner.client.get(f"{API}/organization/invites", headers=owner.auth)).json()
    assert {i["id"] for i in listed} == {first["id"], second["id"]}
    assert all("token" not in i for i in listed)

    revoked = await owner.client.delete(
        f"{API}/organization/invites/{first['id']}", headers=owner.auth
    )
    assert revoked.status_code == 204
    anonymous = client_factory()
    assert (await anonymous.get(f"{API}/invites/{first['token']}")).status_code == 404
    rejected = await anonymous.post(
        f"{API}/auth/register", json=_join_body(first["token"], "buyer")
    )
    assert rejected.status_code == 422

    async with engine.begin() as conn:
        await conn.execute(
            text("UPDATE organization_invites SET expires_at = now() - interval '1 minute'")
        )
    assert (await anonymous.get(f"{API}/invites/{second['token']}")).status_code == 404
    assert (await owner.client.get(f"{API}/organization/invites", headers=owner.auth)).json() == []


async def test_removed_member_loses_access_immediately(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    owner = await register(client_factory())
    member = await _join(client_factory(), (await _invite(owner))["token"], "buyer")
    assert (await member.client.get(f"{API}/auth/me", headers=member.auth)).status_code == 200

    removed = await owner.client.delete(
        f"{API}/organization/members/{member.user['id']}", headers=owner.auth
    )
    assert removed.status_code == 204
    assert (await member.client.get(f"{API}/auth/me", headers=member.auth)).status_code == 401
    assert (await member.client.post(f"{API}/auth/refresh", headers=CSRF)).status_code == 401
    login = await member.client.post(
        f"{API}/auth/login", json={"email": member.user["email"], "password": PASSWORD}
    )
    assert login.status_code == 403

    members = (await owner.client.get(f"{API}/organization", headers=owner.auth)).json()
    assert [m["id"] for m in members["members"]] == [owner.user["id"]]
    again = await owner.client.delete(
        f"{API}/organization/members/{member.user['id']}", headers=owner.auth
    )
    assert again.status_code == 404
    self_removal = await owner.client.delete(
        f"{API}/organization/members/{owner.user['id']}", headers=owner.auth
    )
    assert self_removal.status_code == 409


async def test_joining_requires_the_terms_of_the_invite_role(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    owner = await register(client_factory(), role="supplier")
    invite = await _invite(owner)
    # نقش و قوانین «کارفرما» در بدنه آمده، ولی دعوت برای سازمان قطعه‌ساز است
    response = await client_factory().post(
        f"{API}/auth/register", json=_join_body(invite["token"], "buyer")
    )
    assert response.status_code == 422
    assert response.json()["errors"][0]["field"] == "acceptedAgreements"
