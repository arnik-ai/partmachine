"""ادمین حداقلی: ساخت فقط با CLI، پنهان بودن مسیرها از نقش‌های دیگر (404)، غیرفعال‌سازی با قطع
فوری دسترسی، تأیید دستی مأمور خرید و آزمایشگاه، و رویدادهای audit با فیلتر."""

import io
from collections.abc import Callable
from typing import Any

import httpx
import pytest

from app.create_admin import AdminSetupError, _read_password, create_admin
from tests.helpers import (
    ADMIN_PASSWORD,
    API,
    CSRF,
    PASSWORD,
    login,
    make_admin,
    register,
)


async def test_admin_routes_are_hidden_from_everyone_else(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    anonymous = await client_factory().get(f"{API}/admin/users")
    assert anonymous.status_code == 401  # فرانت با 401 نشست را تازه می‌کند
    for role in ("buyer", "supplier", "agent", "qc"):
        account = await register(client_factory(), role=role)
        for path in ("/admin/users", "/admin/verifications", "/admin/audit-events"):
            response = await account.client.get(f"{API}{path}", headers=account.auth)
            assert response.status_code == 404, (role, path)

    admin = await make_admin(client_factory())
    assert admin.user["role"] == "admin"
    ok = await admin.client.get(f"{API}/admin/users", headers=admin.auth)
    assert ok.status_code == 200


def test_password_from_a_windows_pipe_loses_the_invisible_bom(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """PowerShell ویندوز هنگام pipe، BOM را به اول متن می‌چسباند (دیده‌شده ۲۰۲۶/۱۰/۲۶)."""
    monkeypatch.setattr("sys.stdin", io.StringIO("﻿Admin-Passw0rd-long!\r\n"))
    assert _read_password(from_stdin=True) == "Admin-Passw0rd-long!"


async def test_create_admin_cli_is_idempotent_and_safe(client: httpx.AsyncClient) -> None:
    first = await create_admin("Root@Example.com", "مدیر اول", ADMIN_PASSWORD)
    assert first.created is True
    again = await create_admin("root@example.com", "مدیر اول", ADMIN_PASSWORD)
    assert again.created is False and again.user_id == first.user_id
    second = await create_admin("second@example.com", "مدیر دوم", ADMIN_PASSWORD)
    assert second.created is True

    buyer = await register(client)
    with pytest.raises(AdminSetupError):
        # ارتقای کاربر عادی به ادمین ممکن نیست
        await create_admin(buyer.user["email"], "ادمین", ADMIN_PASSWORD)
    with pytest.raises(AdminSetupError):
        await create_admin("short@example.com", "ادمین", "short-pass")
    with pytest.raises(AdminSetupError):
        await create_admin("not-an-email", "ادمین", ADMIN_PASSWORD)

    session = await login(client, "root@example.com", ADMIN_PASSWORD)
    assert session.user["role"] == "admin"
    # ادمین از ثبت‌نام عمومی ساخته نمی‌شود
    response = await client.post(
        f"{API}/auth/register",
        json={
            "email": "sneaky@example.com",
            "password": PASSWORD,
            "fullName": "ادمین جعلی",
            "role": "admin",
        },
    )
    assert response.status_code == 422


async def test_deactivation_cuts_access_immediately(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    buyer = await register(client_factory())
    admin = await make_admin(client_factory())

    deactivated = await admin.client.post(
        f"{API}/admin/users/{buyer.user['id']}/deactivate",
        json={"reason": "گزارش کلاهبرداری"},
        headers=admin.auth,
    )
    assert deactivated.status_code == 200 and deactivated.json()["isActive"] is False
    assert (await buyer.client.get(f"{API}/auth/me", headers=buyer.auth)).status_code == 401
    refresh = await buyer.client.post(f"{API}/auth/refresh", headers=CSRF)
    assert refresh.status_code == 401
    blocked = await buyer.client.post(
        f"{API}/auth/login", json={"email": buyer.user["email"], "password": PASSWORD}
    )
    assert blocked.status_code == 403 and blocked.json()["code"] == "inactive"

    activated = await admin.client.post(
        f"{API}/admin/users/{buyer.user['id']}/activate", json={}, headers=admin.auth
    )
    assert activated.json()["isActive"] is True
    await login(client_factory(), buyer.user["email"])

    # حساب ادمین از پنل تغییر نمی‌کند
    protected = await admin.client.post(
        f"{API}/admin/users/{admin.user['id']}/deactivate", json={}, headers=admin.auth
    )
    assert protected.status_code == 409

    events = (
        await admin.client.get(
            f"{API}/admin/audit-events", params={"action": "admin"}, headers=admin.auth
        )
    ).json()["items"]
    assert [e["action"] for e in events][:2] == ["admin.user_activated", "admin.user_deactivated"]
    assert events[1]["data"] == {"reason": "گزارش کلاهبرداری"}
    assert events[1]["actorEmail"] == "admin@example.com"


async def test_manual_verification_is_only_for_agents_and_labs(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    agent = await register(client_factory(), role="agent")
    supplier = await register(client_factory(), role="supplier")
    admin = await make_admin(client_factory())

    verified = await admin.client.post(
        f"{API}/admin/users/{agent.user['id']}/verify", json={}, headers=admin.auth
    )
    assert verified.json()["verified"] is True
    me = (await agent.client.get(f"{API}/auth/me", headers=agent.auth)).json()
    assert me["verified"] is True

    refused = await admin.client.post(
        f"{API}/admin/users/{supplier.user['id']}/verify", json={}, headers=admin.auth
    )
    assert refused.status_code == 409 and refused.json()["code"] == "not_manually_verifiable"


async def test_user_search_and_filters(client_factory: Callable[[], httpx.AsyncClient]) -> None:
    await register(client_factory(), email="ali.buyer@example.com", full_name="علی خریدار")
    supplier = await register(
        client_factory(), role="supplier", company="ريخته‌گري شمال", full_name="سارا"
    )
    admin = await make_admin(client_factory())

    async def users(**params: str) -> list[str]:
        response = await admin.client.get(f"{API}/admin/users", params=params, headers=admin.auth)
        return [u["email"] for u in response.json()["items"]]

    assert await users(q="ali.buyer") == ["ali.buyer@example.com"]
    # جستجوی فارسی با حروف عربی هم نام سازمان را پیدا می‌کند
    assert await users(q="ریخته‌گری") == [supplier.user["email"]]
    assert await users(role="supplier") == [supplier.user["email"]]
    assert "admin@example.com" in await users(role="admin")
    assert await users(active="false") == []

    row = (
        await admin.client.get(
            f"{API}/admin/users", params={"role": "supplier"}, headers=admin.auth
        )
    ).json()["items"][0]
    assert row["organizationName"] == "ریخته‌گری شمال"
    assert row["supplierVerified"] is False and row["supplierId"]


async def test_audit_event_filters_and_paging(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    buyer = await register(client_factory())
    for _ in range(3):
        await buyer.client.post(f"{API}/organization/invites", headers=buyer.auth)
    admin = await make_admin(client_factory())

    async def events(**params: str) -> dict[str, Any]:
        response = await admin.client.get(
            f"{API}/admin/audit-events", params=params, headers=admin.auth
        )
        assert response.status_code == 200, response.text
        return response.json()  # type: ignore[no-any-return]

    invites = await events(action="organization.invite_created")
    assert len(invites["items"]) == 3
    first_page = await events(action="organization", limit="2")
    assert first_page["hasMore"] is True
    by_actor = await events(actor=buyer.user["email"].upper())
    assert {e["actorEmail"] for e in by_actor["items"]} == {buyer.user["email"]}
    future = await events(since="2999-01-01")
    assert future["items"] == []
    today_range = await events(until="2999-01-01", action="organization.invite_created")
    assert len(today_range["items"]) == 3
    invalid = await admin.client.get(
        f"{API}/admin/audit-events", params={"action": "DROP TABLE"}, headers=admin.auth
    )
    assert invalid.status_code == 422
