"""حساب کاربری (گام 2f فاز ۲): تغییر رمز با بستن فوری همه‌ی نشست‌های دیگر، بازیابی رمز و تأیید
موبایل با کد یک‌بارمصرف (ارسال‌کننده‌ی آزمایشی، طبق P8)، و سقف تلاش‌ها."""

from collections.abc import Callable, Iterator

import httpx
import pytest
from sqlalchemy import select

from app.core.messaging import ConsoleSender, DisabledSender, SentCode, set_sender
from app.db.session import engine
from app.modules.audit.models import AuditEvent
from app.modules.identity import otp
from app.modules.identity.service import PHONE_TAKEN, RESET_SENT
from tests.helpers import API, CSRF, PASSWORD, Account, login, register

NEW_PASSWORD = "Another-long-passw0rd"


@pytest.fixture
def outbox() -> Iterator[list[SentCode]]:
    sender = ConsoleSender()
    set_sender(sender)
    yield sender.outbox
    set_sender(None)


async def _me(account: Account, token: str | None = None) -> httpx.Response:
    headers = {"Authorization": f"Bearer {token}"} if token else account.auth
    return await account.client.get(f"{API}/auth/me", headers=headers)


async def _actions() -> list[str]:
    async with engine.connect() as conn:
        return list(await conn.scalars(select(AuditEvent.action)))


async def test_password_change_signs_out_every_other_session(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    first = await register(client_factory())
    second = await login(client_factory(), first.user["email"])

    wrong = await first.client.post(
        f"{API}/auth/change-password",
        json={"currentPassword": "not-my-password", "newPassword": NEW_PASSWORD},
        headers=first.auth,
    )
    assert wrong.status_code == 422 and wrong.json()["errors"][0]["field"] == "currentPassword"
    same = await first.client.post(
        f"{API}/auth/change-password",
        json={"currentPassword": PASSWORD, "newPassword": PASSWORD},
        headers=first.auth,
    )
    assert same.status_code == 422 and same.json()["errors"][0]["field"] == "newPassword"

    changed = await first.client.post(
        f"{API}/auth/change-password",
        json={"currentPassword": PASSWORD, "newPassword": NEW_PASSWORD},
        headers=first.auth,
    )
    assert changed.status_code == 200, changed.text
    fresh_token = changed.json()["accessToken"]

    # توکن‌های دسترسی قبلی فوراً (نه پس از ۱۵ دقیقه) باطل می‌شوند، در همه‌ی دستگاه‌ها
    assert (await _me(first)).status_code == 401
    assert (await _me(second)).status_code == 401
    assert (await second.client.post(f"{API}/auth/refresh", headers=CSRF)).status_code == 401
    # همین مرورگر با نشست تازه ادامه می‌دهد
    assert (await _me(first, fresh_token)).status_code == 200
    assert (await first.client.post(f"{API}/auth/refresh", headers=CSRF)).status_code == 200

    old = await client_factory().post(
        f"{API}/auth/login", json={"email": first.user["email"], "password": PASSWORD}
    )
    assert old.status_code == 401
    await login(client_factory(), first.user["email"], NEW_PASSWORD)
    assert "auth.password_changed" in await _actions()


async def test_wrong_current_password_is_rate_limited(client: httpx.AsyncClient) -> None:
    account = await register(client)
    body = {"currentPassword": "wrong-password", "newPassword": NEW_PASSWORD}
    for _ in range(8):
        response = await client.post(f"{API}/auth/change-password", json=body, headers=account.auth)
        assert response.status_code == 422
    blocked = await client.post(f"{API}/auth/change-password", json=body, headers=account.auth)
    assert blocked.status_code == 429


async def test_password_reset_with_a_one_time_code(
    client_factory: Callable[[], httpx.AsyncClient], outbox: list[SentCode]
) -> None:
    account = await register(client_factory())
    email = account.user["email"]
    client = client_factory()

    sent = await client.post(f"{API}/auth/password-reset/request", json={"email": email})
    assert sent.status_code == 202 and sent.json() == {"detail": RESET_SENT}
    assert [(m.channel, m.destination, m.purpose) for m in outbox] == [
        ("email", email, "password_reset")
    ]
    # ایمیل ناموجود همان پاسخ را می‌گیرد و چیزی فرستاده نمی‌شود
    unknown = await client.post(
        f"{API}/auth/password-reset/request", json={"email": "nobody@example.com"}
    )
    assert unknown.status_code == 202 and unknown.json() == {"detail": RESET_SENT}
    assert len(outbox) == 1
    again = await client.post(f"{API}/auth/password-reset/request", json={"email": email})
    assert again.status_code == 429 and again.json()["code"] == "otp_cooldown"

    code = outbox[0].code
    wrong_code = "000000" if code != "000000" else "111111"
    wrong = await client.post(
        f"{API}/auth/password-reset/confirm",
        json={"email": email, "code": wrong_code, "newPassword": NEW_PASSWORD},
    )
    assert wrong.status_code == 422
    assert wrong.json()["errors"] == [{"field": "code", "message": otp.CODE_INVALID}]

    # ارقام فارسی هم پذیرفته می‌شوند
    persian = code.translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))
    reset = await client.post(
        f"{API}/auth/password-reset/confirm",
        json={"email": email, "code": persian, "newPassword": NEW_PASSWORD},
    )
    assert reset.status_code == 200, reset.text
    assert reset.json()["user"]["email"] == email
    assert (await _me(account)).status_code == 401  # نشست‌های قبلی بسته شدند

    reused = await client.post(
        f"{API}/auth/password-reset/confirm",
        json={"email": email, "code": code, "newPassword": "Yet-another-passw0rd"},
    )
    assert reused.status_code == 422
    assert reused.json()["errors"][0]["message"] == otp.CODE_EXPIRED
    await login(client_factory(), email, NEW_PASSWORD)
    assert "auth.password_reset" in await _actions()


async def test_a_code_allows_only_five_attempts(
    client: httpx.AsyncClient, outbox: list[SentCode]
) -> None:
    account = await register(client)
    email = account.user["email"]
    await client.post(f"{API}/auth/password-reset/request", json={"email": email})
    code = outbox[0].code
    wrong_code = "000000" if code != "000000" else "111111"

    messages = []
    for _ in range(5):
        response = await client.post(
            f"{API}/auth/password-reset/confirm",
            json={"email": email, "code": wrong_code, "newPassword": NEW_PASSWORD},
        )
        messages.append(response.json()["errors"][0]["message"])
    assert messages == [otp.CODE_INVALID] * 4 + [otp.TOO_MANY_WRONG]

    # حتی کد درست هم دیگر پذیرفته نمی‌شود؛ باید کد تازه گرفت
    late = await client.post(
        f"{API}/auth/password-reset/confirm",
        json={"email": email, "code": code, "newPassword": NEW_PASSWORD},
    )
    assert late.json()["errors"][0]["message"] == otp.CODE_EXPIRED


async def test_phone_verification(
    client_factory: Callable[[], httpx.AsyncClient], outbox: list[SentCode]
) -> None:
    first = await register(client_factory())
    invalid = await first.client.post(
        f"{API}/auth/phone/request", json={"phone": "12345"}, headers=first.auth
    )
    assert invalid.status_code == 422 and invalid.json()["errors"][0]["field"] == "phone"

    sent = await first.client.post(
        f"{API}/auth/phone/request", json={"phone": "۰۹۱۲ ۱۲۳ ۴۵۶۷"}, headers=first.auth
    )
    assert sent.status_code == 202
    assert [(m.channel, m.destination) for m in outbox] == [("sms", "+989121234567")]

    # کد به همین کاربر گره خورده است؛ کاربر دیگری نمی‌تواند با آن شماره را برای خودش تأیید کند
    other = await register(client_factory())
    stolen = await other.client.post(
        f"{API}/auth/phone/verify",
        json={"phone": "09121234567", "code": outbox[0].code},
        headers=other.auth,
    )
    assert stolen.status_code == 422

    verified = await first.client.post(
        f"{API}/auth/phone/verify",
        json={"phone": "+98 912 123 4567", "code": outbox[0].code},
        headers=first.auth,
    )
    assert verified.status_code == 200, verified.text
    assert verified.json()["phone"] == "+989121234567"
    assert (await _me(first)).json()["phone"] == "+989121234567"
    assert "auth.phone_verified" in await _actions()

    taken = await other.client.post(
        f"{API}/auth/phone/request", json={"phone": "09121234567"}, headers=other.auth
    )
    assert taken.status_code == 422
    assert taken.json()["errors"] == [{"field": "phone", "message": PHONE_TAKEN}]


async def test_everything_is_off_without_a_sender(client: httpx.AsyncClient) -> None:
    set_sender(DisabledSender())
    try:
        options = (await client.get(f"{API}/auth/options")).json()
        # قابلیت‌های وابسته به ارسال کد خاموش‌اند (بقیه‌ی گزینه‌ها به ارسال‌کننده ربطی ندارند)
        assert options["passwordReset"] is False and options["phoneVerification"] is False
        account = await register(client)
        reset = await client.post(
            f"{API}/auth/password-reset/request", json={"email": account.user["email"]}
        )
        assert reset.status_code == 503 and reset.json()["code"] == "otp_disabled"
        phone = await client.post(
            f"{API}/auth/phone/request", json={"phone": "09121234567"}, headers=account.auth
        )
        assert phone.status_code == 503
    finally:
        set_sender(None)
    enabled = (await client.get(f"{API}/auth/options")).json()
    assert enabled == {"passwordReset": True, "phoneVerification": True}
