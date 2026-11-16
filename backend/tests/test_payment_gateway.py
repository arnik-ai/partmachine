"""درگاه پرداخت: پیش‌فرض خاموش، و وقتی روشن شد رفتار درست با پاسخ‌های درگاه.

هیچ درخواستی به بیرون نمی‌رود؛ تماس با درگاه جعل می‌شود. این درگاه فقط برای وجه خودِ پلتفرم است
و به پرداخت سفارش‌ها (که از پلتفرم عبور نمی‌کند) ربطی ندارد.
"""

from typing import Any

import pytest
from pydantic import SecretStr

from app.core.config import settings
from app.core.errors import ServiceUnavailable
from app.modules.payments import gateway

AMOUNT = 2_500_000  # ریال


@pytest.fixture
def zarinpal(monkeypatch: pytest.MonkeyPatch) -> gateway.ZarinPalGateway:
    monkeypatch.setattr(settings, "payment_merchant_id", SecretStr("merchant-secret"))
    monkeypatch.setattr(settings, "payment_base_url", "https://payment.zarinpal.com")
    return gateway.ZarinPalGateway()


def test_the_gateway_is_off_until_it_is_configured() -> None:
    gateway.set_gateway(None)
    try:
        assert gateway.get_gateway().enabled is False
    finally:
        gateway.set_gateway(None)


async def test_a_disabled_gateway_refuses_clearly() -> None:
    with pytest.raises(ServiceUnavailable) as error:
        await gateway.DisabledGateway().start(
            amount_rials=AMOUNT, description="هزینه‌ی دانلود قرارداد", callback_url="https://x/y"
        )
    assert error.value.code == "payment_disabled"


async def test_start_sends_the_amount_in_rials_and_returns_the_redirect(
    zarinpal: gateway.ZarinPalGateway, monkeypatch: pytest.MonkeyPatch
) -> None:
    sent: list[tuple[str, dict[str, Any]]] = []

    def fake_post(url: str, payload: dict[str, Any], timeout: float) -> dict[str, Any]:
        sent.append((url, payload))
        return {"data": {"code": 100, "authority": "A0000000000000000000000000000012345"}}

    monkeypatch.setattr(gateway, "_post_json", fake_post)
    started = await zarinpal.start(
        amount_rials=AMOUNT,
        description="هزینه‌ی دانلود قرارداد",
        callback_url="https://tarashino.com/payment/callback",
        mobile="+989121234567",
    )

    url, payload = sent[0]
    assert url.endswith("/pg/v4/payment/request.json")
    assert payload["amount"] == AMOUNT and payload["merchant_id"] == "merchant-secret"
    assert payload["metadata"] == {"mobile": "+989121234567"}
    assert started.reference == "A0000000000000000000000000000012345"
    assert started.redirect_url.endswith(f"/pg/StartPay/{started.reference}")


async def test_a_refused_start_is_not_silently_treated_as_success(
    zarinpal: gateway.ZarinPalGateway,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    monkeypatch.setattr(
        gateway,
        "_post_json",
        lambda url, payload, timeout: {"data": {"code": -9}, "errors": ["merchant-secret bad"]},
    )
    with pytest.raises(ServiceUnavailable) as error:
        await zarinpal.start(
            amount_rials=AMOUNT, description="تست", callback_url="https://tarashino.com/cb"
        )
    assert error.value.code == "payment_failed"
    assert "merchant-secret" not in caplog.text


@pytest.mark.parametrize(("code", "paid"), [(100, True), (101, True), (-51, False)])
async def test_verify_reports_whether_the_money_arrived(
    zarinpal: gateway.ZarinPalGateway, monkeypatch: pytest.MonkeyPatch, code: int, paid: bool
) -> None:
    monkeypatch.setattr(
        gateway,
        "_post_json",
        lambda url, payload, timeout: {"data": {"code": code, "ref_id": 7788}},
    )
    result = await zarinpal.verify(reference="A000...12345", amount_rials=AMOUNT)
    assert result.paid is paid
    assert result.tracking_code == ("7788" if paid else "")


async def test_a_broken_connection_is_not_a_paid_order(
    zarinpal: gateway.ZarinPalGateway, monkeypatch: pytest.MonkeyPatch
) -> None:
    def explode(url: str, payload: dict[str, Any], timeout: float) -> dict[str, Any]:
        raise OSError("connection reset")

    monkeypatch.setattr(gateway, "_post_json", explode)
    with pytest.raises(ServiceUnavailable) as error:
        await zarinpal.verify(reference="A000...12345", amount_rials=AMOUNT)
    assert error.value.code == "payment_failed"


def test_settings_refuse_a_gateway_without_a_merchant_id(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "payment_gateway", "zarinpal")
    monkeypatch.setattr(settings, "payment_merchant_id", SecretStr(""))
    assert any("PAYMENT_MERCHANT_ID" in problem for problem in settings.problems())
