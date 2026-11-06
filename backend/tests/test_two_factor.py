"""ورود دومرحله‌ای (گام 4e فاز ۴، S7): روشن کردن با QR و کد اپ، مرحله‌ی دوم ورود، کدهای پشتیبان
یک‌بارمصرف، سقف تلاش، و اجباری بودنش برای ادمین. بازیابی رمز و دستور سرور هم مرحله‌ی دوم را دور
نمی‌زنند."""

from collections.abc import Callable, Iterator
from datetime import UTC, datetime

import httpx
import pyotp
import pytest
from sqlalchemy import select, text

from app.core.config import settings
from app.core.messaging import ConsoleSender, SentCode, set_sender
from app.db.session import engine
from app.modules.audit.models import AuditEvent
from app.modules.identity.two_factor import WRONG_CODE
from app.reset_two_factor import reset_two_factor
from tests.helpers import ADMIN_PASSWORD, API, CSRF, PASSWORD, Account, login, make_admin, register


def code_at(secret: str, steps_ahead: int = 0) -> str:
    """کد اپ؛ هر کد فقط یک بار پذیرفته می‌شود، پس استفاده‌ی دوم در همان ۳۰ ثانیه گام بعد را می‌گیرد."""
    return pyotp.TOTP(secret).at(datetime.now(UTC), steps_ahead)


async def enable(account: Account, password: str = PASSWORD) -> tuple[str, list[str]]:
    setup = await account.client.post(f"{API}/auth/2fa/setup", headers=account.auth)
    assert setup.status_code == 200, setup.text
    body = setup.json()
    assert body["otpauthUri"].startswith("otpauth://totp/PartMachine:")
    assert body["qrCode"].startswith("data:image/svg+xml")
    enabled = await account.client.post(
        f"{API}/auth/2fa/enable",
        json={
            "setupToken": body["setupToken"],
            "code": code_at(body["secret"]),
            "password": password,
        },
        headers=account.auth,
    )
    assert enabled.status_code == 200, enabled.text
    # توکن دسترسی قبلی باطل شد؛ همین دستگاه مثل فرانت با refresh (کوکی خودش) ادامه می‌دهد
    assert (await account.client.get(f"{API}/auth/me", headers=account.auth)).status_code == 401
    refreshed = await account.client.post(f"{API}/auth/refresh", headers=CSRF)
    assert refreshed.status_code == 200, refreshed.text
    account.token = refreshed.json()["accessToken"]
    return body["secret"], enabled.json()["recoveryCodes"]


async def start_login(client: httpx.AsyncClient, email: str, password: str = PASSWORD) -> str:
    response = await client.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["twoFactorRequired"] is True and "accessToken" not in body
    # هنوز نشستی ساخته نشده است
    assert "set-cookie" not in response.headers
    return str(body["challenge"])


async def second_step(client: httpx.AsyncClient, challenge: str, code: str) -> httpx.Response:
    return await client.post(f"{API}/auth/login/2fa", json={"challenge": challenge, "code": code})


async def actions() -> list[str]:
    async with engine.connect() as conn:
        return list(await conn.scalars(select(AuditEvent.action)))


async def test_enable_and_sign_in_with_the_app(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    buyer = await register(client_factory())
    email = buyer.user["email"]
    secret, codes = await enable(buyer)
    assert len(codes) == 10 and len(set(codes)) == 10
    me = await buyer.client.get(f"{API}/auth/me", headers=buyer.auth)
    assert me.json()["twoFactorEnabled"] is True
    # کلید مخفی خوانا در پایگاه داده نیست
    async with engine.connect() as conn:
        stored = await conn.scalar(
            text("SELECT totp_secret FROM users WHERE email = :e"), {"e": email}
        )
    assert stored and secret not in stored

    client = client_factory()
    challenge = await start_login(client, email)
    wrong = await second_step(
        client, challenge, "000000" if code_at(secret, 1) != "000000" else "111111"
    )
    assert wrong.status_code == 422
    assert wrong.json()["errors"] == [{"field": "code", "message": WRONG_CODE}]

    used = code_at(secret, 1)
    ok = await second_step(client, challenge, used)
    assert ok.status_code == 200, ok.text
    assert ok.json()["user"]["twoFactorEnabled"] is True
    assert "pm_refresh" in ok.headers.get("set-cookie", "")

    # همان کد دوباره پذیرفته نمی‌شود، حتی با چالش تازه
    replay = await second_step(client_factory(), await start_login(client_factory(), email), used)
    assert replay.status_code == 422
    assert "auth.two_factor_enabled" in await actions()


async def test_recovery_codes_work_once(client_factory: Callable[[], httpx.AsyncClient]) -> None:
    buyer = await register(client_factory())
    email = buyer.user["email"]
    _, codes = await enable(buyer)

    first = await second_step(
        client_factory(), await start_login(client_factory(), email), codes[0]
    )
    assert first.status_code == 200, first.text
    # با حروف بزرگ و بدون خط تیره هم پذیرفته می‌شود
    second = await second_step(
        client_factory(),
        await start_login(client_factory(), email),
        codes[1].replace("-", "").upper(),
    )
    assert second.status_code == 200, second.text
    reused = await second_step(
        client_factory(), await start_login(client_factory(), email), codes[0]
    )
    assert reused.status_code == 422
    assert (await actions()).count("auth.recovery_code_used") == 2


async def test_wrong_codes_are_limited(client_factory: Callable[[], httpx.AsyncClient]) -> None:
    buyer = await register(client_factory())
    secret, _ = await enable(buyer)
    client = client_factory()
    challenge = await start_login(client, buyer.user["email"])
    good = code_at(secret, 1)
    bad = "000000" if good != "000000" else "111111"
    for _ in range(5):
        assert (await second_step(client, challenge, bad)).status_code == 422
    # پس از ۵ کد اشتباه، کد درست هم تا ۱۵ دقیقه پذیرفته نمی‌شود
    assert (await second_step(client, challenge, good)).status_code == 429


async def test_challenges_cannot_be_forged_or_outlive_a_password_change(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    buyer = await register(client_factory())
    secret, _ = await enable(buyer)
    client = client_factory()
    assert (await second_step(client, "not-a-token", code_at(secret))).status_code == 401
    challenge = await start_login(client, buyer.user["email"])
    changed = await buyer.client.post(
        f"{API}/auth/change-password",
        json={"currentPassword": PASSWORD, "newPassword": "Another-long-passw0rd"},
        headers=buyer.auth,
    )
    assert changed.status_code == 200, changed.text
    # چالشی که پیش از تغییر رمز گرفته شده بود دیگر کار نمی‌کند
    assert (await second_step(client, challenge, code_at(secret, 1))).status_code == 401


async def test_turning_off_needs_the_password_and_a_code(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    buyer = await register(client_factory())
    secret, _ = await enable(buyer)
    wrong_password = await buyer.client.post(
        f"{API}/auth/2fa/disable",
        json={"password": "wrong-password", "code": code_at(secret, 1)},
        headers=buyer.auth,
    )
    assert wrong_password.status_code == 422
    assert wrong_password.json()["errors"][0]["field"] == "password"
    off = await buyer.client.post(
        f"{API}/auth/2fa/disable",
        json={"password": PASSWORD, "code": code_at(secret, 1)},
        headers=buyer.auth,
    )
    assert off.status_code == 204, off.text
    login = await client_factory().post(
        f"{API}/auth/login", json={"email": buyer.user["email"], "password": PASSWORD}
    )
    assert "accessToken" in login.json()


async def test_new_recovery_codes_replace_the_old_ones(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    buyer = await register(client_factory())
    secret, old = await enable(buyer)
    fresh = await buyer.client.post(
        f"{API}/auth/2fa/recovery-codes",
        json={"password": PASSWORD, "code": code_at(secret, 1)},
        headers=buyer.auth,
    )
    assert fresh.status_code == 200, fresh.text
    new = fresh.json()["recoveryCodes"]
    email = buyer.user["email"]
    assert (
        await second_step(client_factory(), await start_login(client_factory(), email), old[0])
    ).status_code == 422
    assert (
        await second_step(client_factory(), await start_login(client_factory(), email), new[0])
    ).status_code == 200


async def test_admins_must_turn_it_on_before_any_admin_access(
    client_factory: Callable[[], httpx.AsyncClient], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "admin_two_factor_required", True)
    admin = await make_admin(client_factory())
    blocked = await admin.client.get(f"{API}/admin/verifications", headers=admin.auth)
    assert blocked.status_code == 403
    assert blocked.json()["code"] == "two_factor_setup_required"

    secret, _ = await enable(admin, ADMIN_PASSWORD)
    allowed = await admin.client.get(f"{API}/admin/verifications", headers=admin.auth)
    assert allowed.status_code == 200, allowed.text
    # برای ادمین خاموش‌شدنی نیست
    off = await admin.client.post(
        f"{API}/auth/2fa/disable",
        json={"password": ADMIN_PASSWORD, "code": code_at(secret, 1)},
        headers=admin.auth,
    )
    assert off.status_code == 403


async def test_enabling_closes_every_other_session(
    client_factory: Callable[[], httpx.AsyncClient], monkeypatch: pytest.MonkeyPatch
) -> None:
    """رمز لورفته: نشستی که پیش از روشن شدن فقط با رمز باز شده، بعد از آن نه ادامه می‌یابد و نه ادمین می‌شود."""
    monkeypatch.setattr(settings, "admin_two_factor_required", True)
    admin = await make_admin(client_factory())
    other = await login(client_factory(), admin.user["email"], ADMIN_PASSWORD)
    await enable(admin, ADMIN_PASSWORD)
    stale = await other.client.get(f"{API}/admin/verifications", headers=other.auth)
    assert stale.status_code == 401
    assert (await other.client.post(f"{API}/auth/refresh", headers=CSRF)).status_code == 401
    # دستگاهی که کد اپ را نشان داد، با نشست خودش ادامه می‌دهد
    mine = await admin.client.get(f"{API}/admin/verifications", headers=admin.auth)
    assert mine.status_code == 200, mine.text


@pytest.fixture
def outbox() -> Iterator[list[SentCode]]:
    sender = ConsoleSender()
    set_sender(sender)
    yield sender.outbox
    set_sender(None)


async def test_password_reset_still_asks_for_the_code(
    client_factory: Callable[[], httpx.AsyncClient], outbox: list[SentCode]
) -> None:
    buyer = await register(client_factory())
    email = buyer.user["email"]
    secret, _ = await enable(buyer)
    client = client_factory()
    await client.post(f"{API}/auth/password-reset/request", json={"email": email})
    reset = await client.post(
        f"{API}/auth/password-reset/confirm",
        json={"email": email, "code": outbox[0].code, "newPassword": "Another-long-passw0rd"},
    )
    assert reset.status_code == 200, reset.text
    body = reset.json()
    # رمز عوض شد، ولی نشست فقط پس از کد اپ ساخته می‌شود
    assert body["twoFactorRequired"] is True and "accessToken" not in body
    assert "set-cookie" not in reset.headers
    done = await second_step(client, body["challenge"], code_at(secret, 1))
    assert done.status_code == 200, done.text


async def test_server_command_turns_it_off_and_closes_sessions(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    buyer = await register(client_factory())
    await enable(buyer)
    assert await reset_two_factor(buyer.user["email"]) is True
    assert await reset_two_factor(buyer.user["email"]) is False
    # نشست‌ها و توکن‌های قبلی بسته شدند
    assert (await buyer.client.get(f"{API}/auth/me", headers=buyer.auth)).status_code == 401
    login = await client_factory().post(
        f"{API}/auth/login", json={"email": buyer.user["email"], "password": PASSWORD}
    )
    assert "accessToken" in login.json()
    assert "auth.two_factor_reset" in await actions()
