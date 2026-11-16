"""ورود با کد پیامکی، و لایه‌ی اتصال به سرویس پیامک.

ورود با پیامک فقط برای شماره‌ای کار می‌کند که در یک حساب تأیید شده است؛ پاسخِ شماره‌ی ناشناس با
پاسخِ شماره‌ی موجود یکی است تا فهرست شماره‌ها لو نرود. تماس با سرویس واقعی در این‌جا جعل می‌شود
و هیچ درخواستی به بیرون نمی‌رود.
"""

from collections.abc import Callable, Iterator
from typing import Any

import httpx
import pytest
from pydantic import SecretStr

from app.core import sms
from app.core.config import settings
from app.core.messaging import ConsoleSender, SentCode, set_sender
from app.modules.identity.service import SMS_LOGIN_SENT
from tests.helpers import API, Account, register

PHONE = "09121234567"
NORMALIZED = "+989121234567"


@pytest.fixture
def outbox() -> Iterator[list[SentCode]]:
    sender = ConsoleSender()
    set_sender(sender)
    yield sender.outbox
    set_sender(None)


async def _verified_phone_account(client: httpx.AsyncClient, outbox: list[SentCode]) -> Account:
    account = await register(client)
    requested = await client.post(
        f"{API}/auth/phone/request", json={"phone": PHONE}, headers=account.auth
    )
    assert requested.status_code == 202, requested.text
    verified = await client.post(
        f"{API}/auth/phone/verify",
        json={"phone": PHONE, "code": outbox[-1].code},
        headers=account.auth,
    )
    assert verified.status_code == 200, verified.text
    outbox.clear()
    return account


async def test_login_with_a_texted_code(
    client_factory: Callable[[], httpx.AsyncClient], outbox: list[SentCode]
) -> None:
    owner = await _verified_phone_account(client_factory(), outbox)

    # مرورگر تازه، بدون کوکی و بدون رمز
    other = client_factory()
    requested = await other.post(f"{API}/auth/login/sms/request", json={"phone": "۰۹۱۲ ۱۲۳ ۴۵۶۷"})
    assert requested.status_code == 202
    assert requested.json()["detail"] == SMS_LOGIN_SENT
    assert [(m.channel, m.destination, m.purpose) for m in outbox] == [
        ("sms", NORMALIZED, "sms_login")
    ]

    wrong = await other.post(
        f"{API}/auth/login/sms/verify", json={"phone": PHONE, "code": "000000"}
    )
    assert wrong.status_code == 422

    signed_in = await other.post(
        f"{API}/auth/login/sms/verify", json={"phone": PHONE, "code": outbox[-1].code}
    )
    assert signed_in.status_code == 200, signed_in.text
    token = signed_in.json()["accessToken"]
    me = await other.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.json()["id"] == owner.user["id"]

    # کد یک‌بارمصرف است
    again = await other.post(
        f"{API}/auth/login/sms/verify", json={"phone": PHONE, "code": outbox[-1].code}
    )
    assert again.status_code == 422


async def test_unknown_phone_looks_the_same_and_sends_nothing(
    client: httpx.AsyncClient, outbox: list[SentCode]
) -> None:
    response = await client.post(f"{API}/auth/login/sms/request", json={"phone": "09350000000"})
    assert response.status_code == 202
    assert response.json()["detail"] == SMS_LOGIN_SENT
    assert outbox == []


async def test_an_unverified_phone_cannot_be_used_to_log_in(
    client_factory: Callable[[], httpx.AsyncClient], outbox: list[SentCode]
) -> None:
    """شماره‌ای که فقط درخواست تأیید داشته (و تأیید نشده) راه ورود نمی‌دهد."""
    account = await register(client_factory())
    await account.client.post(
        f"{API}/auth/phone/request", json={"phone": PHONE}, headers=account.auth
    )
    outbox.clear()
    response = await client_factory().post(f"{API}/auth/login/sms/request", json={"phone": PHONE})
    assert response.status_code == 202 and outbox == []


async def test_only_the_sms_channel_is_offered_when_only_sms_is_connected(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """با سرویس پیامک (و بدون سرویس ایمیل): ورود با پیامک روشن، بازیابی رمز خاموش."""
    monkeypatch.setattr(settings, "sms_api_key", SecretStr("test-key"))
    monkeypatch.setattr(settings, "sms_otp_template", "tarashino-login")
    set_sender(sms.SmsCodeSender())
    try:
        options = (await client.get(f"{API}/auth/options")).json()
        assert options["smsLogin"] is True and options["phoneVerification"] is True
        assert options["passwordReset"] is False

        account = await register(client)
        refused = await client.post(
            f"{API}/auth/password-reset/request", json={"email": account.user["email"]}
        )
        assert refused.status_code == 503 and refused.json()["code"] == "otp_disabled"
    finally:
        set_sender(None)


def test_numbers_are_sent_in_the_local_format() -> None:
    assert sms.local_number(NORMALIZED) == PHONE
    assert sms.local_number(PHONE) == PHONE


async def test_the_provider_call_carries_the_code_and_never_logs_the_key(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setattr(settings, "sms_api_key", SecretStr("secret-key"))
    monkeypatch.setattr(settings, "sms_otp_template", "tarashino-login")
    calls: list[tuple[str, dict[str, str]]] = []

    def fake_post(url: str, fields: dict[str, str], timeout: float) -> dict[str, Any]:
        calls.append((url, fields))
        return {"return": {"status": 200}}

    monkeypatch.setattr(sms, "_post", fake_post)
    await sms.SmsCodeSender().send(
        channel="sms", destination=NORMALIZED, code="123456", purpose="sms_login"
    )

    url, fields = calls[0]
    assert url.endswith("/verify/lookup.json") and "secret-key" in url
    assert fields == {"receptor": PHONE, "token": "123456", "template": "tarashino-login"}
    assert "secret-key" not in caplog.text


async def test_a_failing_provider_does_not_look_like_success(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setattr(settings, "sms_api_key", SecretStr("secret-key"))
    monkeypatch.setattr(settings, "sms_otp_template", "tarashino-login")

    def refusing_post(url: str, fields: dict[str, str], timeout: float) -> dict[str, Any]:
        return {"return": {"status": 418, "message": "secret-key is wrong"}}

    monkeypatch.setattr(sms, "_post", refusing_post)
    with pytest.raises(Exception) as error:
        await sms.SmsCodeSender().send(
            channel="sms", destination=NORMALIZED, code="123456", purpose="sms_login"
        )
    assert getattr(error.value, "code", "") == "sms_failed"
    assert "secret-key" not in caplog.text


def test_settings_refuse_a_half_configured_sms_service(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "otp_sender", "kavenegar")
    monkeypatch.setattr(settings, "sms_api_key", SecretStr(""))
    monkeypatch.setattr(settings, "sms_otp_template", "")
    problems = settings.problems()
    assert any("SMS_API_KEY" in problem and "SMS_OTP_TEMPLATE" in problem for problem in problems)
