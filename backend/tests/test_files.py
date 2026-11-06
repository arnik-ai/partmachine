"""فایل‌های خصوصی (گام 2d فاز ۲): آپلود با بررسی محتوای واقعی، پیوست به RFQ، قواعد دانلود
(مالک، قطعه‌ساز پس از NDA، بقیه هیچ)، لینک کوتاه‌عمر و حذف فایل پیوست‌نشده."""

import asyncio
import struct
from collections.abc import Callable
from datetime import timedelta
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from sqlalchemy import text

from app.core.config import settings
from app.core.security import create_signed_token
from app.core.storage import LocalStorage
from app.db.session import engine
from app.modules.files.service import DOWNLOAD_TOKEN, content_disposition
from tests.helpers import (
    API,
    PDF_BYTES,
    Account,
    accept_nda,
    award,
    create_rfq,
    make_deal,
    register,
    rfq_body,
    set_supplier_verified,
    stored_keys,
    submit_quote,
    upload_file,
)


async def _download(account: Account, file_id: str) -> httpx.Response:
    link = await account.client.post(f"{API}/files/{file_id}/link", headers=account.auth)
    if link.status_code != 200:
        return link
    return await account.client.get(f"{API}{link.json()['url']}")


async def test_upload_and_attach_to_rfq(client: httpx.AsyncClient) -> None:
    buyer = await register(client)
    uploaded = await upload_file(buyer, name="نقشه فلنج.pdf")
    assert uploaded.status_code == 201, uploaded.text
    body = uploaded.json()
    assert body["name"] == "نقشه فلنج.pdf"
    assert body["size"] == len(PDF_BYTES) and body["kind"] == "pdf"
    assert len(stored_keys()) == 1

    rfq = await create_rfq(buyer, fileIds=[body["id"]])
    assert rfq["fileCount"] == 1
    assert rfq["files"] == [
        {"id": body["id"], "name": "نقشه فلنج.pdf", "size": len(PDF_BYTES), "kind": "pdf"}
    ]
    async with engine.connect() as conn:
        uploaded_events = await conn.scalar(
            text("SELECT count(*) FROM audit_events WHERE action = 'file.uploaded'")
        )
    assert uploaded_events == 1


@pytest.mark.parametrize(
    ("name", "content", "expected_kind"),
    [
        ("part.step", b"ISO-10303-21;\nHEADER;\n", "cad"),
        ("part.stl", b"solid flange\nfacet normal 0 0 1\n", "cad"),
        ("part-binary.stl", b"\0" * 80 + struct.pack("<I", 2) + b"\0" * 100, "cad"),
        ("plan.dwg", b"AC1027" + b"\0" * 100, "drawing"),
        ("plan.dxf", b"  0\nSECTION\n  2\nHEADER\n", "drawing"),
        ("photo.png", b"\x89PNG\r\n\x1a\n" + b"\0" * 50, "image"),
        ("photo.jpg", b"\xff\xd8\xff\xe0" + b"\0" * 50, "image"),
    ],
)
async def test_real_content_is_detected(
    client: httpx.AsyncClient, name: str, content: bytes, expected_kind: str
) -> None:
    buyer = await register(client)
    response = await upload_file(buyer, name=name, content=content)
    assert response.status_code == 201, response.text
    assert response.json()["kind"] == expected_kind


@pytest.mark.parametrize(
    ("name", "content", "message_part"),
    [
        ("virus.exe", b"MZ" + b"\0" * 50, "نوع‌های مجاز"),
        ("fake.pdf", b"\x89PNG\r\n\x1a\n" + b"\0" * 50, "هم‌خوان نیست"),
        ("broken.stl", b"\0" * 80 + struct.pack("<I", 9) + b"\0" * 10, "هم‌خوان نیست"),
        ("empty.pdf", b"", "خالی"),
    ],
)
async def test_invalid_files_are_rejected_and_not_kept(
    client: httpx.AsyncClient, name: str, content: bytes, message_part: str
) -> None:
    buyer = await register(client)
    response = await upload_file(buyer, name=name, content=content)
    assert response.status_code == 422
    assert response.json()["errors"][0]["field"] == "file"
    assert message_part in response.json()["detail"]
    assert stored_keys() == []


async def test_size_limit_per_purpose(client: httpx.AsyncClient) -> None:
    supplier = await register(client, role="supplier")
    too_big = b"\x89PNG\r\n\x1a\n" + b"\0" * (5 * 1024 * 1024)
    response = await upload_file(
        supplier, name="gallery.png", content=too_big, purpose="portfolio_image"
    )
    assert response.status_code == 413
    assert response.json()["code"] == "file_too_large"
    assert stored_keys() == []

    # مسیر آپلود از سقف عمومی ۱ مگابایت معاف است
    buyer = await register(client)
    large_pdf = PDF_BYTES + b"0" * (2 * 1024 * 1024)
    assert (await upload_file(buyer, content=large_pdf)).status_code == 201


async def test_each_organization_has_a_rolling_daily_upload_quota(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """چند حساب یک‌بارمصرف نمی‌توانند فضای سرور را پر کنند؛ ولی سقف چرخان است و شرکتی را که در طول
    زمان فایل زیاد دارد (فایل پیوست‌شده حذف‌شدنی نیست) برای همیشه نمی‌بندد."""
    buyer = await register(client)
    monkeypatch.setattr(settings, "storage_org_daily_bytes", len(PDF_BYTES) * 2)
    assert (await upload_file(buyer)).status_code == 201
    assert (await upload_file(buyer)).status_code == 201
    full = await upload_file(buyer)
    assert full.status_code == 429 and full.json()["code"] == "storage_quota_exceeded"
    assert len(stored_keys()) == 2
    # سازمان دیگر سهم خودش را دارد
    assert (await upload_file(await register(client))).status_code == 201

    # ۲۴ ساعت بعد، بارگذاری‌های دیروز دیگر شمرده نمی‌شوند
    async with engine.begin() as conn:
        await conn.execute(
            text(
                "UPDATE files SET created_at = created_at - interval '25 hours' WHERE organization_id = :o"
            ),
            {"o": buyer.user["organizationId"]},
        )
    assert (await upload_file(buyer)).status_code == 201


async def test_parallel_uploads_cannot_jointly_pass_the_quota(
    client_factory: Callable[[], httpx.AsyncClient], monkeypatch: pytest.MonkeyPatch
) -> None:
    """شمارش دقیق زیر قفل همان سازمان: آپلودهای هم‌زمان با هم از سقف رد نمی‌شوند."""
    buyer = await register(client_factory())
    monkeypatch.setattr(settings, "storage_org_daily_bytes", len(PDF_BYTES) * 2)
    results = await asyncio.gather(*(upload_file(buyer) for _ in range(6)))
    codes = sorted(r.status_code for r in results)
    assert codes == [201, 201, 429, 429, 429, 429], codes
    assert len(stored_keys()) == 2


async def test_uploads_stop_before_the_disk_fills(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """پایگاه داده روی همان دیسک است؛ پیش از پر شدن دیسک، آپلود با پیام روشن متوقف می‌شود."""
    if settings.storage_backend != "local":
        pytest.skip("فقط برای ذخیره روی دیسک محلی")
    buyer = await register(client)
    monkeypatch.setattr(settings, "storage_min_free_bytes", 10**18)
    response = await upload_file(buyer)
    assert response.status_code == 507 and response.json()["code"] == "storage_full"
    assert stored_keys() == []


async def test_only_rfq_creators_upload_attachments(client: httpx.AsyncClient) -> None:
    supplier = await register(client, role="supplier")
    assert (await upload_file(supplier)).status_code == 403
    anonymous = await client.post(
        f"{API}/files", params={"purpose": "rfq_attachment", "name": "a.pdf"}, content=PDF_BYTES
    )
    assert anonymous.status_code == 401


async def test_files_cannot_be_borrowed_or_reused(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    buyer = await register(client_factory())
    other = await register(client_factory())
    mine = (await upload_file(buyer)).json()
    theirs = (await upload_file(other)).json()

    borrowed = await buyer.client.post(
        f"{API}/rfqs",
        json=rfq_body(fileIds=[theirs["id"]]),
        headers=buyer.auth,
    )
    assert borrowed.status_code == 422
    assert borrowed.json()["errors"][0]["field"] == "fileIds"

    await create_rfq(buyer, fileIds=[mine["id"]])
    reused = await buyer.client.post(
        f"{API}/rfqs", json=rfq_body(fileIds=[mine["id"]]), headers=buyer.auth
    )
    assert reused.status_code == 422


async def test_download_rules(client_factory: Callable[[], httpx.AsyncClient]) -> None:
    buyer = await register(client_factory())
    other_buyer = await register(client_factory())
    supplier = await register(client_factory(), role="supplier")
    file_id = (await upload_file(buyer, name="نقشه فلنج.pdf")).json()["id"]
    rfq = await create_rfq(buyer, fileIds=[file_id])

    owner_download = await _download(buyer, file_id)
    assert owner_download.status_code == 200
    assert owner_download.content == PDF_BYTES
    disposition = owner_download.headers["content-disposition"]
    assert disposition.startswith("attachment;") and "filename*=UTF-8''" in disposition
    assert owner_download.headers["x-content-type-options"] == "nosniff"
    assert owner_download.headers["content-type"] == "application/octet-stream"

    summary = (await supplier.client.get(f"{API}/rfqs/{rfq['id']}", headers=supplier.auth)).json()
    assert summary["fileCount"] == 1 and summary["files"] == []
    # قطعه‌ساز تأییدنشده نه NDA را می‌پذیرد و نه فایل می‌گیرد (تصمیم مالک ۲۰۲۶/۱۰/۲۶)
    unverified = await _download(supplier, file_id)
    assert unverified.status_code == 403 and unverified.json()["code"] == "supplier_not_verified"
    nda_refused = await accept_nda(supplier, rfq["id"])
    assert nda_refused.status_code == 403
    assert nda_refused.json()["code"] == "supplier_not_verified"

    await set_supplier_verified(supplier)
    blocked = await _download(supplier, file_id)
    assert blocked.status_code == 403 and blocked.json()["code"] == "nda_required"
    after_nda = (await accept_nda(supplier, rfq["id"])).json()
    assert [f["id"] for f in after_nda["files"]] == [file_id]
    assert (await _download(supplier, file_id)).content == PDF_BYTES

    # لغو تأیید هویت دسترسی را فوراً قطع می‌کند، حتی با NDA پذیرفته‌شده
    await set_supplier_verified(supplier, False)
    revoked = await _download(supplier, file_id)
    assert revoked.status_code == 403 and revoked.json()["code"] == "supplier_not_verified"
    hidden = (await supplier.client.get(f"{API}/rfqs/{rfq['id']}", headers=supplier.auth)).json()
    assert hidden["ndaAccepted"] is True and hidden["files"] == []

    assert (await _download(other_buyer, file_id)).status_code == 404
    anonymous = await client_factory().post(f"{API}/files/{file_id}/link")
    assert anonymous.status_code == 401

    async with engine.connect() as conn:
        downloads = await conn.scalar(
            text("SELECT count(*) FROM audit_events WHERE action = 'file.downloaded'")
        )
    assert downloads == 2


async def test_the_awarded_supplier_gets_the_drawings_before_verification(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    """کارفرما قطعه‌سازِ هنوز تأییدنشده‌ای را برنده کرده است: او برای ساخت قطعه نقشه لازم دارد
    (پس از NDA)، ولی پیشنهاددهنده‌ی بازنده‌ی تأییدنشده همچنان هیچ فایلی نمی‌گیرد."""
    deal = await make_deal(client_factory, with_drawing=True)
    file_id = deal.rfq["files"][0]["id"]
    loser = await register(client_factory(), role="supplier")
    assert (await submit_quote(loser, deal.rfq["id"], price=2_500_000_000)).status_code == 201
    assert (await award(deal)).status_code == 200

    before_nda = await _download(deal.supplier, file_id)
    assert before_nda.status_code == 403 and before_nda.json()["code"] == "nda_required"
    after_nda = await accept_nda(deal.supplier, deal.rfq["id"])
    assert after_nda.status_code == 200, after_nda.text
    assert [f["id"] for f in after_nda.json()["files"]] == [file_id]
    assert (await _download(deal.supplier, file_id)).content == PDF_BYTES

    refused = await accept_nda(loser, deal.rfq["id"])
    assert refused.status_code == 403 and refused.json()["code"] == "supplier_not_verified"
    blocked = await _download(loser, file_id)
    assert blocked.status_code == 403 and blocked.json()["code"] == "supplier_not_verified"


async def test_download_links_are_signed_and_short_lived(client: httpx.AsyncClient) -> None:
    buyer = await register(client)
    file_id = (await upload_file(buyer)).json()["id"]
    link = (await client.post(f"{API}/files/{file_id}/link", headers=buyer.auth)).json()
    token = parse_qs(urlparse(link["url"]).query)["token"][0]

    tampered = await client.get(f"{API}/files/download", params={"token": token[:-4] + "AAAA"})
    assert tampered.status_code == 404
    assert tampered.json()["code"] == "download_link_invalid"

    expired = create_signed_token(
        subject=file_id, token_type=DOWNLOAD_TOKEN, ttl=timedelta(seconds=-5)
    )
    assert (await client.get(f"{API}/files/download", params={"token": expired})).status_code == 404
    # توکن دسترسی معمولی به‌جای لینک دانلود پذیرفته نمی‌شود
    assert (
        await client.get(f"{API}/files/download", params={"token": buyer.token})
    ).status_code == 404


async def test_only_unattached_files_can_be_deleted(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    buyer = await register(client_factory())
    other = await register(client_factory())
    loose = (await upload_file(buyer)).json()["id"]
    attached = (await upload_file(buyer)).json()["id"]
    await create_rfq(buyer, fileIds=[attached])

    assert (
        await other.client.delete(f"{API}/files/{loose}", headers=other.auth)
    ).status_code == 404
    assert (
        await buyer.client.delete(f"{API}/files/{loose}", headers=buyer.auth)
    ).status_code == 204
    assert len(stored_keys()) == 1
    conflict = await buyer.client.delete(f"{API}/files/{attached}", headers=buyer.auth)
    assert conflict.status_code == 409 and conflict.json()["code"] == "file_attached"


def test_storage_keys_cannot_escape_the_root(tmp_path: Path) -> None:
    storage = LocalStorage(tmp_path)
    with pytest.raises(ValueError):
        storage._path("../outside.txt")


def test_content_disposition_keeps_persian_names() -> None:
    header = content_disposition("نقشه فلنج.pdf")
    assert header.startswith('attachment; filename="file.pdf"')
    assert "%D9%86%D9%82%D8%B4%D9%87" in header
    assert content_disposition("flange v2.pdf").startswith('attachment; filename="flange_v2.pdf"')
