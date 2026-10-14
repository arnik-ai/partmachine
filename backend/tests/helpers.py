"""ابزارهای کمکی تست: ساخت حساب، RFQ و پیشنهاد از طریق خود API (نه مستقیم در DB)."""

import uuid
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

import httpx

API = "/api/v1"
PASSWORD = "Passw0rd-long!"
CSRF = {"X-Requested-With": "fetch"}


@dataclass
class Account:
    client: httpx.AsyncClient
    user: dict[str, Any]
    token: str

    @property
    def auth(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"}


def future(days: int = 30) -> str:
    return (date.today() + timedelta(days=days)).isoformat()


async def register(
    client: httpx.AsyncClient,
    *,
    role: str = "buyer",
    email: str | None = None,
    company: str | None = None,
    full_name: str = "کاربر آزمایشی",
) -> Account:
    body: dict[str, Any] = {
        "email": email or f"{role}-{uuid.uuid4().hex[:10]}@example.com",
        "password": PASSWORD,
        "fullName": full_name,
        "role": role,
    }
    if company or role == "supplier":
        body["companyName"] = company or f"کارگاه {uuid.uuid4().hex[:6]}"
    response = await client.post(f"{API}/auth/register", json=body)
    assert response.status_code == 201, response.text
    data = response.json()
    return Account(client=client, user=data["user"], token=data["accessToken"])


def rfq_body(**overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "title": "ساخت ۵۰۰ عدد فلنج",
        "description": "طبق نقشه‌ی پیوست",
        "capability": "cnc",
        "material": "استیل 304",
        "quantity": 500,
        "deliveryCity": "تهران",
        "deadline": future(30),
        "files": [{"name": "flange.pdf", "size": 1000, "kind": "pdf"}],
    }
    body.update(overrides)
    return body


async def create_rfq(account: Account, **overrides: Any) -> dict[str, Any]:
    response = await account.client.post(
        f"{API}/rfqs", json=rfq_body(**overrides), headers=account.auth
    )
    assert response.status_code == 201, response.text
    return response.json()  # type: ignore[no-any-return]


def quote_body(price: int = 1_500_000_000, **overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "totalPriceRials": price,
        "leadTimeDays": 14,
        "validUntil": future(20),
        "note": "تحویل درب کارخانه",
    }
    body.update(overrides)
    return body


async def submit_quote(
    account: Account, rfq_id: str, price: int = 1_500_000_000, **overrides: Any
) -> httpx.Response:
    return await account.client.post(
        f"{API}/rfqs/{rfq_id}/quotations",
        json=quote_body(price, **overrides),
        headers=account.auth,
    )
