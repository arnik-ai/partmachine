"""فایل‌های خصوصی (گام 2d فاز ۲): آپلود با بررسی محتوای واقعی، پیوست به RFQ، قواعد دانلود
(مالک، قطعه‌ساز پس از NDA، بقیه هیچ)، لینک کوتاه‌عمر و حذف فایل پیوست‌نشده."""

import os
import struct
from collections.abc import Callable
from datetime import timedelta
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from sqlalchemy import text

from app.core.security import create_signed_token
from app.core.storage import LocalStorage
from app.db.session import engine
from app.modules.files.service import DOWNLOAD_TOKEN, content_disposition
from tests.helpers import (
    API,
    PDF_BYTES,
    Account,
    accept_nda,
    create_rfq,
    register,
    rfq_body,
    upload_file,
)

STORAGE = Path(os.environ["STORAGE_LOCAL_DIR"])


def _stored_paths() -> list[Path]:
    return [p for p in STORAGE.rglob("*") if p.is_file()]


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
    assert len(_stored_paths()) == 1

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
    assert _stored_paths() == []


async def test_size_limit_per_purpose(client: httpx.AsyncClient) -> None:
    supplier = await register(client, role="supplier")
    too_big = b"\x89PNG\r\n\x1a\n" + b"\0" * (5 * 1024 * 1024)
    response = await upload_file(
        supplier, name="gallery.png", content=too_big, purpose="portfolio_image"
    )
    assert response.status_code == 413
    assert response.json()["code"] == "file_too_large"
    assert _stored_paths() == []

    # مسیر آپلود از سقف عمومی ۱ مگابایت معاف است
    buyer = await register(client)
    large_pdf = PDF_BYTES + b"0" * (2 * 1024 * 1024)
    assert (await upload_file(buyer, content=large_pdf)).status_code == 201


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
    blocked = await _download(supplier, file_id)
    assert blocked.status_code == 403 and blocked.json()["code"] == "nda_required"

    after_nda = (await accept_nda(supplier, rfq["id"])).json()
    assert [f["id"] for f in after_nda["files"]] == [file_id]
    assert (await _download(supplier, file_id)).content == PDF_BYTES

    assert (await _download(other_buyer, file_id)).status_code == 404
    anonymous = await client_factory().post(f"{API}/files/{file_id}/link")
    assert anonymous.status_code == 401

    async with engine.connect() as conn:
        downloads = await conn.scalar(
            text("SELECT count(*) FROM audit_events WHERE action = 'file.downloaded'")
        )
    assert downloads == 2


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
    assert len(_stored_paths()) == 1
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
