"""احراز هویت و نشست (سناریوهای AUTH1–AUTH9 گزارش فاز ۰)."""

import asyncio
import hashlib
import threading
import time
import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

import httpx
import jwt
import pytest
from sqlalchemy import text

from app.core import security
from app.core.config import settings
from app.db.session import engine
from app.modules.identity import service as identity_service
from tests.helpers import API, CSRF, PASSWORD, register, signup_agreements


async def test_register_returns_session_and_httponly_cookie(client: httpx.AsyncClient) -> None:
    response = await client.post(
        f"{API}/auth/register",
        json={
            "email": "new@example.com",
            "password": PASSWORD,
            "fullName": "مریم احمدی",
            "role": "buyer",
            "companyName": "صنایع نمونه",
            "acceptedAgreements": signup_agreements("buyer"),
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["accessToken"] and body["expiresIn"] == 15 * 60
    assert "refreshToken" not in body and "tokens" not in body
    assert body["user"]["companyName"] == "صنایع نمونه"
    assert body["user"]["organizationId"]

    cookie = response.headers["set-cookie"]
    assert cookie.startswith("pm_refresh=")
    assert "HttpOnly" in cookie
    assert "Path=/api/v1/auth" in cookie
    assert "SameSite=lax" in cookie
    assert "Secure" not in cookie  # فقط در محیط test/development


async def test_supplier_must_name_company_and_gets_profile(client: httpx.AsyncClient) -> None:
    missing = await client.post(
        f"{API}/auth/register",
        json={
            "email": "s@example.com",
            "password": PASSWORD,
            "fullName": "علی",
            "role": "supplier",
        },
    )
    assert missing.status_code == 422
    assert {
        "field": "companyName",
        "message": "نام شرکت یا کارگاه برای قطعه‌سازها الزامی است.",
    } in missing.json()["errors"]

    supplier = await register(client, role="supplier", company="کارگاه تراشکاری ستاره")
    # پروفایل پایه بلافاصله ساخته می‌شود؛ تا تکمیل (شهر و خدمت) در فهرست عمومی نیست
    me = (await client.get(f"{API}/suppliers/me", headers=supplier.auth)).json()
    assert me["companyName"] == "کارگاه تراشکاری ستاره"
    assert me["listed"] is False and me["canEdit"] is True
    found = await client.get(f"{API}/suppliers", params={"q": "ستاره"})
    assert found.json()["total"] == 0


async def test_validation_errors_are_persian_and_per_field(client: httpx.AsyncClient) -> None:
    response = await client.post(
        f"{API}/auth/register",
        json={"email": "bad", "password": "1", "fullName": "x", "role": "admin"},
    )
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "validation_error"
    fields = {e["field"]: e["message"] for e in body["errors"]}
    assert fields["email"] == "ایمیل معتبر نیست."
    assert fields["password"] == "باید حداقل ۸ کاراکتر باشد."
    assert fields["role"] == "مقدار انتخاب‌شده معتبر نیست."  # admin قابل ثبت‌نام نیست (AUTH2)


async def test_email_is_case_insensitive(client: httpx.AsyncClient) -> None:
    await register(client, email="Mixed.Case@Example.com")
    duplicate = await client.post(
        f"{API}/auth/register",
        json={
            "email": "mixed.case@example.com",
            "password": PASSWORD,
            "fullName": "تست",
            "role": "buyer",
            "acceptedAgreements": signup_agreements("buyer"),
        },
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["code"] == "email_taken"

    login = await client.post(
        f"{API}/auth/login", json={"email": "MIXED.CASE@example.com", "password": PASSWORD}
    )
    assert login.status_code == 200


async def test_two_logins_in_the_same_second_both_succeed(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    account = await register(client_factory())
    credentials = {"email": account.user["email"], "password": PASSWORD}
    first, second = await asyncio.gather(
        client_factory().post(f"{API}/auth/login", json=credentials),
        client_factory().post(f"{API}/auth/login", json=credentials),
    )
    assert first.status_code == second.status_code == 200
    assert first.json()["accessToken"] != second.json()["accessToken"]
    assert first.cookies["pm_refresh"] != second.cookies["pm_refresh"]


async def test_refresh_rotates_cookie_and_keeps_user_signed_in(client: httpx.AsyncClient) -> None:
    await register(client)
    old_cookie = client.cookies["pm_refresh"]
    refreshed = await client.post(f"{API}/auth/refresh", headers=CSRF)
    assert refreshed.status_code == 200
    assert refreshed.json()["accessToken"]
    assert client.cookies["pm_refresh"] != old_cookie
    # refresh token فقط در کوکی HttpOnly است، هرگز در بدنه‌ی پاسخ
    assert "refreshToken" not in refreshed.json()
    assert client.cookies["pm_refresh"] not in refreshed.text


async def test_refresh_tokens_are_stored_only_as_hashes(client: httpx.AsyncClient) -> None:
    await register(client)
    cookie = client.cookies["pm_refresh"]
    async with engine.connect() as conn:
        stored = (await conn.execute(text("SELECT token_hash FROM refresh_tokens"))).scalars().all()
    assert stored == [hashlib.sha256(cookie.encode()).hexdigest()]


@pytest.mark.parametrize("role", ["agent", "qc"])
async def test_agent_and_qc_can_register_but_start_unverified(
    client: httpx.AsyncClient, role: str
) -> None:
    account = await register(client, role=role, company="آزمایشگاه نمونه" if role == "qc" else None)
    assert account.user["role"] == role
    assert account.user["verified"] is False


async def test_refresh_reuse_revokes_whole_session_family(
    client_factory: Callable[[], httpx.AsyncClient], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(identity_service, "REUSE_GRACE", timedelta(0))
    browser = client_factory()
    await register(browser)
    stolen = browser.cookies["pm_refresh"]
    assert (await browser.post(f"{API}/auth/refresh", headers=CSRF)).status_code == 200

    attacker = client_factory()
    attacker.cookies.set("pm_refresh", stolen, path="/api/v1/auth")
    replay = await attacker.post(f"{API}/auth/refresh", headers=CSRF)
    assert replay.status_code == 401
    assert replay.json()["code"] == "session_revoked"

    # نشست قربانی هم باطل شد؛ باید دوباره وارد شود
    assert (await browser.post(f"{API}/auth/refresh", headers=CSRF)).status_code == 401
    async with engine.connect() as conn:
        events = await conn.scalar(
            text("SELECT count(*) FROM audit_events WHERE action = 'auth.refresh_reuse_detected'")
        )
    assert events == 1


async def test_concurrent_refresh_from_two_tabs_is_not_treated_as_theft(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    browser = client_factory()
    await register(browser)
    cookie = browser.cookies["pm_refresh"]
    tab1, tab2 = client_factory(), client_factory()
    for tab in (tab1, tab2):
        tab.cookies.set("pm_refresh", cookie, path="/api/v1/auth")
    first, second = await asyncio.gather(
        tab1.post(f"{API}/auth/refresh", headers=CSRF),
        tab2.post(f"{API}/auth/refresh", headers=CSRF),
    )
    assert first.status_code == second.status_code == 200


async def test_refresh_requires_csrf_header_and_allowed_origin(client: httpx.AsyncClient) -> None:
    await register(client)
    no_header = await client.post(f"{API}/auth/refresh")
    assert no_header.status_code == 403
    assert no_header.json()["code"] == "csrf_failed"
    evil = await client.post(
        f"{API}/auth/refresh", headers={**CSRF, "Origin": "https://evil.example"}
    )
    assert evil.status_code == 403
    allowed = await client.post(
        f"{API}/auth/refresh", headers={**CSRF, "Origin": "http://localhost:3100"}
    )
    assert allowed.status_code == 200


async def test_refresh_without_cookie_is_a_quiet_401(client: httpx.AsyncClient) -> None:
    response = await client.post(f"{API}/auth/refresh", headers=CSRF)
    assert response.status_code == 401
    assert response.json()["code"] == "no_session"


async def test_logout_revokes_session(client_factory: Callable[[], httpx.AsyncClient]) -> None:
    browser = client_factory()
    await register(browser)
    cookie = browser.cookies["pm_refresh"]
    logout = await browser.post(f"{API}/auth/logout", headers=CSRF)
    assert logout.status_code == 204
    assert "pm_refresh=" in logout.headers["set-cookie"]

    other = client_factory()
    other.cookies.set("pm_refresh", cookie, path="/api/v1/auth")
    assert (await other.post(f"{API}/auth/refresh", headers=CSRF)).status_code == 401


@pytest.mark.parametrize("closed_by", ["logout", "password_change"])
async def test_recently_rotated_token_dies_with_its_session(
    client_factory: Callable[[], httpx.AsyncClient], closed_by: str
) -> None:
    """مهلت چند ثانیه‌ای برگه‌های هم‌زمان، پس از خروج یا تغییر رمز راه بازگشت به نشست نیست."""
    browser = client_factory()
    account = await register(browser)
    previous = browser.cookies["pm_refresh"]
    rotated = await browser.post(f"{API}/auth/refresh", headers=CSRF)
    assert rotated.status_code == 200
    if closed_by == "logout":
        assert (await browser.post(f"{API}/auth/logout", headers=CSRF)).status_code == 204
    else:
        changed = await browser.post(
            f"{API}/auth/change-password",
            json={"currentPassword": PASSWORD, "newPassword": "Another-long-passw0rd"},
            headers={"Authorization": f"Bearer {rotated.json()['accessToken']}"},
        )
        assert changed.status_code == 200, changed.text
        assert account.user["id"] == changed.json()["user"]["id"]

    # همان چند ثانیه‌ی پس از چرخش؛ توکن قبلی دیگر نشست تازه نمی‌سازد
    other = client_factory()
    other.cookies.set("pm_refresh", previous, path="/api/v1/auth")
    assert (await other.post(f"{API}/auth/refresh", headers=CSRF)).status_code == 401


async def test_wrong_password_is_rate_limited_per_email(client: httpx.AsyncClient) -> None:
    account = await register(client)
    wrong = {"email": account.user["email"], "password": "wrong-password"}
    for _ in range(8):
        response = await client.post(f"{API}/auth/login", json=wrong)
        assert response.status_code == 401
        assert response.json()["detail"] == "ایمیل یا رمز عبور درست نیست."
    blocked = await client.post(f"{API}/auth/login", json=wrong)
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) > 0
    # حتی رمز درست هم تا پایان پنجره پذیرفته نمی‌شود
    correct = await client.post(
        f"{API}/auth/login", json={"email": account.user["email"], "password": PASSWORD}
    )
    assert correct.status_code == 429


async def test_unknown_email_gets_same_message(client: httpx.AsyncClient) -> None:
    response = await client.post(
        f"{API}/auth/login", json={"email": "nobody@example.com", "password": "whatever-123"}
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "ایمیل یا رمز عبور درست نیست."


async def test_me_requires_valid_token(client: httpx.AsyncClient) -> None:
    account = await register(client)
    assert (await client.get(f"{API}/auth/me")).status_code == 401
    me = await client.get(f"{API}/auth/me", headers=account.auth)
    assert me.status_code == 200
    assert me.json()["email"] == account.user["email"]


@pytest.mark.parametrize(
    "claims_change",
    [
        {"secret": "another-secret-key-of-sufficient-length-123"},
        {"type": "refresh"},
        {"exp_delta": -120},
    ],
)
async def test_tampered_or_expired_tokens_are_rejected(
    client: httpx.AsyncClient, claims_change: dict[str, object]
) -> None:
    account = await register(client)
    now = datetime.now(UTC)
    payload = {
        "sub": account.user["id"],
        "org": account.user["organizationId"],
        "role": "buyer",
        "type": claims_change.get("type", "access"),
        "jti": uuid.uuid4().hex,
        "iat": now,
        "exp": now + timedelta(seconds=int(claims_change.get("exp_delta", 600))),  # type: ignore[call-overload]
    }
    secret = str(claims_change.get("secret", settings.secret_key))
    token = jwt.encode(payload, secret, algorithm="HS256")
    response = await client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert response.json()["code"] == "token_invalid"


async def test_password_hashing_is_bounded_per_process(monkeypatch: pytest.MonkeyPatch) -> None:
    """موج ورود: بیش از سقف، محاسبه‌ی Argon2 هم‌زمان اجرا نمی‌شود (بقیه صف می‌کشند)."""
    active = peak = 0
    guard = threading.Lock()

    class SlowHasher:
        def hash(self, password: str) -> str:
            nonlocal active, peak
            with guard:
                active += 1
                peak = max(peak, active)
            time.sleep(0.05)
            with guard:
                active -= 1
            return "hashed"

    monkeypatch.setattr(security, "_hasher", SlowHasher())
    await asyncio.gather(*(security.hash_password("x") for _ in range(8)))
    assert peak == settings.password_hash_concurrency


async def test_login_holds_no_database_connection_while_checking_the_password(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """اتصال‌های پایگاه داده در موج ورود صرف انتظار برای Argon2 نمی‌شوند (آزمون بار ۲۰۲۶/۱۰/۲۶)."""
    account = await register(client)
    checked_out: list[int] = []
    real = security._hasher

    class WatchingHasher:
        def verify(self, hashed: str, password: str) -> bool:
            checked_out.append(engine.sync_engine.pool.checkedout())  # type: ignore[attr-defined]
            return bool(real.verify(hashed, password))

        def check_needs_rehash(self, hashed: str) -> bool:
            return bool(real.check_needs_rehash(hashed))

    monkeypatch.setattr(security, "_hasher", WatchingHasher())
    response = await client.post(
        f"{API}/auth/login", json={"email": account.user["email"], "password": PASSWORD}
    )
    assert response.status_code == 200, response.text
    assert checked_out == [0]
