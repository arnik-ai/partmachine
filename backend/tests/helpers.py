"""ابزارهای کمکی تست: ساخت حساب، RFQ و پیشنهاد از طریق خود API (نه مستقیم در DB)."""

import shutil
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

import httpx
from botocore.exceptions import ClientError
from sqlalchemy import text

from app.core.storage import LocalStorage, S3Storage, get_storage
from app.core.time import business_today
from app.db.session import engine
from app.modules.agreements.catalog import (
    AGREEMENTS,
    BUYER_ORDER,
    RFQ_NDA,
    SIGNUP_AGREEMENT_BY_ROLE,
)

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


def accepted(key: str) -> dict[str, str]:
    """پذیرش نسخه‌ی جاری یک متن توافق، همان‌طور که فرم‌ها می‌فرستند."""
    return {"key": key, "version": AGREEMENTS[key].version}


def signup_agreements(role: str) -> list[dict[str, str]]:
    return [accepted(SIGNUP_AGREEMENT_BY_ROLE[role])]


async def set_quotes_due(rfq_id: str, days_from_today: int) -> None:
    """مهلت دریافت پیشنهاد را نسبت به «امروزِ» کسب‌وکار جابه‌جا می‌کند (برای آزمودن انقضا)."""
    async with engine.begin() as conn:
        await conn.execute(
            text("UPDATE rfqs SET quotes_due = :due WHERE id = :id"),
            {"due": business_today() + timedelta(days=days_from_today), "id": rfq_id},
        )


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
        "acceptedAgreements": signup_agreements(role),
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
        "acceptedAgreements": [accepted(BUYER_ORDER.key)],
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


async def accept_nda(account: Account, rfq_id: str) -> httpx.Response:
    return await account.client.post(
        f"{API}/rfqs/{rfq_id}/nda", json=accepted(RFQ_NDA.key), headers=account.auth
    )


def _s3_keys(storage: S3Storage) -> list[str]:
    paginator = storage.client.get_paginator("list_objects_v2")
    return [
        item["Key"]
        for page in paginator.paginate(Bucket=storage.bucket, Prefix=storage.prefix)
        for item in page.get("Contents", [])
    ]


def stored_keys() -> list[str]:
    """کلید فایل‌هایی که الان در فضای ذخیره‌ی تست هستند (دیسک یا S3)."""
    storage = get_storage()
    if isinstance(storage, S3Storage):
        return sorted(key.removeprefix(storage.prefix) for key in _s3_keys(storage))
    assert isinstance(storage, LocalStorage)
    return sorted(
        p.relative_to(storage.root).as_posix() for p in storage.root.rglob("*") if p.is_file()
    )


def ensure_storage() -> None:
    """bucket تست را اگر نباشد می‌سازد (فقط در حالت S3)."""
    storage = get_storage()
    if isinstance(storage, S3Storage):
        try:
            storage.client.head_bucket(Bucket=storage.bucket)
        except ClientError:
            storage.client.create_bucket(Bucket=storage.bucket)


def empty_storage() -> None:
    storage = get_storage()
    if isinstance(storage, S3Storage):
        # یکی‌یکی، چون DeleteObjects در برخی سرویس‌های S3-سازگار checksum متفاوتی می‌خواهد
        for key in _s3_keys(storage):
            storage.client.delete_object(Bucket=storage.bucket, Key=key)
        return
    assert isinstance(storage, LocalStorage)
    for child in storage.root.iterdir():
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()


PDF_BYTES = b"%PDF-1.4\n% PartMachine test file\n" + b"0" * 200
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 120
ADMIN_PASSWORD = "Admin-Passw0rd-long!"


async def upload_file(
    account: Account,
    name: str = "flange-drawing.pdf",
    content: bytes = PDF_BYTES,
    purpose: str = "rfq_attachment",
) -> httpx.Response:
    return await account.client.post(
        f"{API}/files",
        params={"purpose": purpose, "name": name},
        content=content,
        headers={**account.auth, "Content-Type": "application/octet-stream"},
    )


def profile_body(**overrides: Any) -> dict[str, Any]:
    """پروفایل کامل قطعه‌ساز، همان‌طور که فرم ویرایش می‌فرستد."""
    body: dict[str, Any] = {
        "companyName": "تراشکاری دقیق نمونه",
        "description": "ماشین‌کاری CNC قطعات صنعتی",
        "city": "تهران",
        "address": None,
        "phone": None,
        "website": None,
        "foundedYear": None,
        "employeeCount": None,
        "capabilities": ["cnc"],
        "machines": [],
        "certifications": [],
        "productionCapacityPerMonth": None,
        "leadTimeDays": 14,
    }
    body.update(overrides)
    return body


async def complete_profile(account: Account, **overrides: Any) -> dict[str, Any]:
    response = await account.client.put(
        f"{API}/suppliers/me", json=profile_body(**overrides), headers=account.auth
    )
    assert response.status_code == 200, response.text
    return response.json()  # type: ignore[no-any-return]


async def login(client: httpx.AsyncClient, email: str, password: str = PASSWORD) -> Account:
    response = await client.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    data = response.json()
    return Account(client=client, user=data["user"], token=data["accessToken"])


async def make_admin(client: httpx.AsyncClient, email: str = "admin@example.com") -> Account:
    """ادمین فقط با CLI ساخته می‌شود؛ تست همان تابع CLI را صدا می‌زند و بعد وارد می‌شود."""
    from app.create_admin import create_admin

    await create_admin(email, "ادمین آزمون", ADMIN_PASSWORD)
    return await login(client, email, ADMIN_PASSWORD)


async def join_organization(owner: Account, client: httpx.AsyncClient) -> Account:
    """عضو تازه با لینک دعوت مدیر (نقش کاری همان نقش مدیر است)."""
    invite = await owner.client.post(f"{API}/organization/invites", headers=owner.auth)
    assert invite.status_code == 201, invite.text
    role = owner.user["role"]
    response = await client.post(
        f"{API}/auth/register",
        json={
            "email": f"member-{uuid.uuid4().hex[:10]}@example.com",
            "password": PASSWORD,
            "fullName": "عضو سازمان",
            "role": role,
            "inviteToken": invite.json()["token"],
            "acceptedAgreements": signup_agreements(role),
        },
    )
    assert response.status_code == 201, response.text
    data = response.json()
    return Account(client=client, user=data["user"], token=data["accessToken"])


# --- سفارش و قرارداد (فاز ۳) ---------------------------------------------------------------


@dataclass
class Deal:
    buyer: Account
    supplier: Account
    rfq: dict[str, Any]
    quote: dict[str, Any]


async def make_deal(
    client_factory: Callable[[], httpx.AsyncClient], *, with_drawing: bool = False
) -> Deal:
    buyer = await register(client_factory(), company="کارخانه‌ی خریدار")
    supplier = await register(client_factory(), role="supplier", company="کارگاه برنده")
    extra: dict[str, Any] = {}
    if with_drawing:
        drawing = await upload_file(buyer, "bush-drawing.pdf")
        assert drawing.status_code == 201, drawing.text
        extra["fileIds"] = [drawing.json()["id"]]
    rfq = await create_rfq(buyer, title="ساخت ۲۰۰ عدد بوش برنجی", **extra)
    quote = await submit_quote(supplier, rfq["id"], price=2_000_000_000, leadTimeDays=20)
    assert quote.status_code == 201, quote.text
    return Deal(buyer, supplier, rfq, quote.json())


async def award(deal: Deal) -> httpx.Response:
    return await deal.buyer.client.post(
        f"{API}/quotations/{deal.quote['id']}/award", headers=deal.buyer.auth
    )


async def order_of(deal: Deal) -> dict[str, Any]:
    rfq = (
        await deal.buyer.client.get(f"{API}/rfqs/{deal.rfq['id']}", headers=deal.buyer.auth)
    ).json()
    assert rfq["orderId"], rfq
    response = await deal.buyer.client.get(
        f"{API}/orders/{rfq['orderId']}", headers=deal.buyer.auth
    )
    assert response.status_code == 200, response.text
    return response.json()  # type: ignore[no-any-return]


async def signed_order(
    client_factory: Callable[[], httpx.AsyncClient],
    *,
    prepayment: int = 0,
    with_drawing: bool = False,
    material_from_buyer: bool = False,
) -> tuple[Deal, str]:
    """سفارشی که قراردادش با درصد پیش‌پرداخت داده‌شده توسط هر دو طرف امضا شده است."""
    deal = await make_deal(client_factory, with_drawing=with_drawing)
    await award(deal)
    order_id = str((await order_of(deal))["id"])
    contract = (
        await deal.buyer.client.get(f"{API}/orders/{order_id}/contract", headers=deal.buyer.auth)
    ).json()
    version = contract["version"]
    if prepayment or material_from_buyer:
        revised = await deal.buyer.client.put(
            f"{API}/orders/{order_id}/contract",
            json={
                **contract["terms"],
                "prepaymentPercent": prepayment,
                "materialFromBuyer": material_from_buyer,
                "changeNote": "",
            },
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


async def verified_lab(
    client_factory: Callable[[], httpx.AsyncClient], admin: Account, name: str
) -> Account:
    """آزمایشگاهی که ادمین حساب مدیرش را تأیید کرده است (قابل انتخاب برای بازرسی)."""
    lab = await register(client_factory(), role="qc", company=name)
    verified = await admin.client.post(
        f"{API}/admin/users/{lab.user['id']}/verify", json={}, headers=admin.auth
    )
    assert verified.status_code == 200, verified.text
    return lab
