"""تأیید هویت قطعه‌ساز (P4): ارسال مدارک، تصمیم ادمین با دلیل، نشان «تأییدشده»، ارسال دوباره
پس از رد، لغو تأیید، ماندگاری مدارک ارسال‌شده و ثبت همه‌ی اقدام‌ها در audit."""

from collections.abc import Callable
from typing import Any

import httpx
from sqlalchemy import select

from app.db.session import engine
from app.modules.audit.models import AuditEvent
from tests.helpers import (
    API,
    PDF_BYTES,
    Account,
    complete_profile,
    join_organization,
    make_admin,
    register,
    upload_file,
)


async def _document(account: Account, name: str = "روزنامه-رسمی.pdf") -> str:
    response = await upload_file(account, name, PDF_BYTES, "verification_document")
    assert response.status_code == 201, response.text
    return str(response.json()["id"])


async def _submit(account: Account, file_ids: list[str], note: str = "") -> httpx.Response:
    return await account.client.post(
        f"{API}/suppliers/me/verification",
        json={"fileIds": file_ids, "note": note},
        headers=account.auth,
    )


async def _ready_supplier(client: httpx.AsyncClient, company: str = "کارگاه مدارک") -> Account:
    supplier = await register(client, role="supplier")
    await complete_profile(supplier, companyName=company)
    return supplier


async def _decide(admin: Account, request_id: str, action: str, reason: str = "") -> httpx.Response:
    return await admin.client.post(
        f"{API}/admin/verifications/{request_id}/{action}",
        json={"reason": reason},
        headers=admin.auth,
    )


async def _public_profile(client: httpx.AsyncClient, account: Account) -> dict[str, Any]:
    mine = (await client.get(f"{API}/suppliers/me", headers=account.auth)).json()
    return (await client.get(f"{API}/suppliers/{mine['id']}")).json()  # type: ignore[no-any-return]


async def _actions() -> list[str]:
    async with engine.connect() as conn:
        rows = await conn.scalars(select(AuditEvent.action).order_by(AuditEvent.created_at))
    return list(rows)


async def test_documents_reviewed_and_approved_by_admin(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    supplier = await _ready_supplier(client_factory(), "صنایع مدارک کامل")
    assert (
        await supplier.client.get(f"{API}/suppliers/me/verification", headers=supplier.auth)
    ).json() is None

    documents = [await _document(supplier), await _document(supplier, "پروانه.pdf")]
    submitted = await _submit(supplier, documents, note="پروانه‌ی بهره‌برداری پیوست است")
    assert submitted.status_code == 201, submitted.text
    request = submitted.json()
    assert request["status"] == "pending"
    assert [f["name"] for f in request["files"]] == ["روزنامه-رسمی.pdf", "پروانه.pdf"]

    again = await _submit(supplier, [await _document(supplier)])
    assert again.status_code == 409 and again.json()["code"] == "verification_pending"

    admin = await make_admin(client_factory())
    queue = (await admin.client.get(f"{API}/admin/verifications", headers=admin.auth)).json()
    assert queue["total"] == 1
    item = queue["items"][0]
    assert item["companyName"] == "صنایع مدارک کامل"
    assert item["submittedByEmail"] == supplier.user["email"]
    assert item["note"] == "پروانه‌ی بهره‌برداری پیوست است"

    # ادمین مدرک را می‌بیند؛ قطعه‌ساز دیگر نه
    link = await admin.client.post(f"{API}/files/{documents[0]}/link", headers=admin.auth)
    assert link.status_code == 200
    stranger = await register(client_factory(), role="supplier")
    denied = await stranger.client.post(f"{API}/files/{documents[0]}/link", headers=stranger.auth)
    assert denied.status_code == 404

    approved = await _decide(admin, request["id"], "approve")
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"
    assert approved.json()["decidedByName"] == "ادمین آزمون"
    assert (await _public_profile(client_factory(), supplier))["verified"] is True

    latest = (
        await supplier.client.get(f"{API}/suppliers/me/verification", headers=supplier.auth)
    ).json()
    assert latest["status"] == "approved" and latest["decidedAt"]

    twice = await _decide(admin, request["id"], "reject", "دیر")
    assert twice.status_code == 409 and twice.json()["code"] == "already_decided"
    already = await _submit(supplier, [await _document(supplier)])
    assert already.status_code == 409 and already.json()["code"] == "already_verified"

    actions = await _actions()
    assert "verification.submitted" in actions and "verification.approved" in actions
    assert "file.downloaded" in actions


async def test_rejection_needs_a_reason_and_supplier_can_resubmit(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    supplier = await _ready_supplier(client_factory())
    first_document = await _document(supplier)
    request = (await _submit(supplier, [first_document])).json()
    admin = await make_admin(client_factory())

    no_reason = await _decide(admin, request["id"], "reject")
    assert no_reason.status_code == 422
    assert no_reason.json()["errors"][0]["field"] == "reason"

    rejected = await _decide(admin, request["id"], "reject", "تصویر مدرک خوانا نیست.")
    assert rejected.json()["status"] == "rejected"
    latest = (
        await supplier.client.get(f"{API}/suppliers/me/verification", headers=supplier.auth)
    ).json()
    assert latest["decisionReason"] == "تصویر مدرک خوانا نیست."
    assert (await _public_profile(client_factory(), supplier))["verified"] is False

    # مدرک ارسال‌شده ماندگار است: نه حذف می‌شود، نه دوباره استفاده
    removed = await supplier.client.delete(f"{API}/files/{first_document}", headers=supplier.auth)
    assert removed.status_code == 409 and removed.json()["code"] == "file_attached"
    reused = await _submit(supplier, [first_document])
    assert reused.status_code == 422 and reused.json()["errors"][0]["field"] == "fileIds"

    resubmitted = await _submit(supplier, [await _document(supplier, "مدرک-خوانا.pdf")])
    assert resubmitted.status_code == 201
    assert resubmitted.json()["status"] == "pending"


async def test_revoking_removes_the_badge(client_factory: Callable[[], httpx.AsyncClient]) -> None:
    supplier = await _ready_supplier(client_factory())
    request = (await _submit(supplier, [await _document(supplier)])).json()
    admin = await make_admin(client_factory())
    await _decide(admin, request["id"], "approve", "مدارک کامل است.")

    assert (await _decide(admin, request["id"], "revoke")).status_code == 422
    revoked = await _decide(admin, request["id"], "revoke", "گزارش تخلف تأیید شد.")
    assert revoked.status_code == 200 and revoked.json()["status"] == "revoked"
    assert (await _public_profile(client_factory(), supplier))["verified"] is False
    latest = (
        await supplier.client.get(f"{API}/suppliers/me/verification", headers=supplier.auth)
    ).json()
    assert latest["revokeReason"] == "گزارش تخلف تأیید شد."
    assert (await _decide(admin, request["id"], "revoke", "دوباره")).status_code == 409
    assert "verification.revoked" in await _actions()


async def test_submission_rules(client_factory: Callable[[], httpx.AsyncClient]) -> None:
    # پروفایل ناقص ← اول تکمیل
    fresh = await register(client_factory(), role="supplier")
    incomplete = await _submit(fresh, [await _document(fresh)])
    assert incomplete.status_code == 409 and incomplete.json()["code"] == "profile_incomplete"

    # مدرک سازمان دیگر یا فایل با کاربرد دیگر پذیرفته نمی‌شود
    owner = await _ready_supplier(client_factory())
    other = await _ready_supplier(client_factory())
    borrowed = await _submit(other, [await _document(owner)])
    assert borrowed.status_code == 422
    image = await upload_file(
        other, "photo.png", b"\x89PNG\r\n\x1a\n" + b"0" * 50, "portfolio_image"
    )
    wrong_purpose = await _submit(other, [image.json()["id"]])
    assert wrong_purpose.status_code == 422
    assert (await _submit(other, [])).status_code == 422

    # فقط مدیر سازمان درخواست می‌فرستد
    member = await join_organization(owner, client_factory())
    from_member = await _submit(member, [await _document(owner)])
    assert from_member.status_code == 403

    buyer = await register(client_factory())
    assert (await _submit(buyer, [])).status_code == 403
