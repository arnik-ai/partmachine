"""پروفایل قطعه‌ساز (گام 2e فاز ۲): ویرایش فقط توسط مدیر سازمان، نمایش در فهرست عمومی پس از
تکمیل، اعتبارسنجی فیلدها، گالری نمونه‌کار عمومی با سقف، و فیلتر «فقط تأییدشده‌ها»."""

from collections.abc import Callable

import httpx
from sqlalchemy import select, text

from app.db.session import engine
from app.modules.audit.models import AuditEvent
from tests.helpers import (
    API,
    PDF_BYTES,
    PNG_BYTES,
    complete_profile,
    join_organization,
    profile_body,
    register,
    upload_file,
)


async def _mark_verified(supplier_id: str) -> None:
    async with engine.begin() as conn:
        await conn.execute(
            text("UPDATE suppliers SET verified = true, verified_at = now() WHERE id = :id"),
            {"id": supplier_id},
        )


async def test_completed_profile_appears_in_directory(client: httpx.AsyncClient) -> None:
    supplier = await register(client, role="supplier", company="كارگاه اولیه")
    assert (await client.get(f"{API}/suppliers")).json()["total"] == 0

    saved = await complete_profile(
        supplier,
        companyName="صنايع دقیق‌تراش آریا",
        city="اصفهان",
        phone="۰۳۱-۳۳۴۴۵۵۶۶",
        website="aria-cnc.ir",
        foundedYear=1385,
        capabilities=["cnc", "welding", "cnc"],
        machines=[{"name": "تراش CNC", "model": "Doosan", "count": 3}],
        certifications=[{"title": "ISO 9001", "issuer": "TÜV", "validUntil": "2027-03-01"}],
    )
    assert saved["listed"] is True and saved["verified"] is False
    # یکسان‌سازی: حروف عربی، ارقام فارسی، پروتکل وب‌سایت و خدمت تکراری
    assert saved["companyName"] == "صنایع دقیق‌تراش آریا"
    assert saved["phone"] == "031-33445566"
    assert saved["website"] == "https://aria-cnc.ir"
    assert saved["capabilities"] == ["cnc", "welding"]
    assert saved["certifications"] == [
        {"title": "ISO 9001", "issuer": "TÜV", "validUntil": "2027-03-01"}
    ]

    page = (await client.get(f"{API}/suppliers", params={"q": "آریا"})).json()
    assert [s["id"] for s in page["items"]] == [saved["id"]]
    # نام سازمان هم با نام شرکت هم‌گام می‌شود
    me = (await client.get(f"{API}/auth/me", headers=supplier.auth)).json()
    assert me["companyName"] == "صنایع دقیق‌تراش آریا"

    async with engine.connect() as conn:
        data = await conn.scalar(
            select(AuditEvent.data).where(AuditEvent.action == "supplier.profile_updated")
        )
    assert {"company_name", "city", "capabilities", "machines"} <= set(data["fields"])


async def test_profile_validation_is_per_field_and_persian(client: httpx.AsyncClient) -> None:
    supplier = await register(client, role="supplier")
    cases = [
        ({"capabilities": []}, "capabilities", "حداقل یک خدمت را انتخاب کنید."),
        ({"city": "   "}, "city", "این فیلد را کامل وارد کنید."),
        (
            {"website": "javascript:alert(1)"},
            "website",
            "آدرس وب‌سایت معتبر نیست (مثال: example.ir).",
        ),
        ({"website": "https://user:pw@evil.example"}, "website", None),
        ({"phone": "تماس بگیرید"}, "phone", None),
        ({"foundedYear": 1200}, "foundedYear", None),
        ({"leadTimeDays": 0}, "leadTimeDays", None),
        ({"capabilities": ["laser"]}, "capabilities.0", None),
    ]
    for overrides, field, message in cases:
        response = await client.put(
            f"{API}/suppliers/me", json=profile_body(**overrides), headers=supplier.auth
        )
        assert response.status_code == 422, overrides
        errors = {e["field"]: e["message"] for e in response.json()["errors"]}
        assert field in errors, (overrides, errors)
        if message:
            assert errors[field] == message


async def test_only_the_owner_edits_the_company_profile(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    owner = await register(client_factory(), role="supplier", company="کارگاه مالک")
    member = await join_organization(owner, client_factory())

    mine = (await member.client.get(f"{API}/suppliers/me", headers=member.auth)).json()
    assert mine["companyName"] == "کارگاه مالک" and mine["canEdit"] is False
    denied = await member.client.put(
        f"{API}/suppliers/me", json=profile_body(), headers=member.auth
    )
    assert denied.status_code == 403 and denied.json()["code"] == "not_org_owner"
    for purpose, content, name in (
        ("portfolio_image", PNG_BYTES, "sample.png"),
        ("verification_document", PDF_BYTES, "license.pdf"),
    ):
        upload = await upload_file(member, name, content, purpose)
        assert upload.status_code == 403, purpose

    buyer = await register(client_factory())
    assert (await buyer.client.get(f"{API}/suppliers/me", headers=buyer.auth)).status_code == 403


async def test_company_name_is_locked_after_verification(client: httpx.AsyncClient) -> None:
    supplier = await register(client, role="supplier")
    saved = await complete_profile(supplier, companyName="شرکت تأییدشده")
    await _mark_verified(saved["id"])

    renamed = await client.put(
        f"{API}/suppliers/me",
        json=profile_body(companyName="نام دیگر"),
        headers=supplier.auth,
    )
    assert renamed.status_code == 422
    assert renamed.json()["errors"][0]["field"] == "companyName"
    # بقیه‌ی پروفایل همچنان ویرایش‌شدنی است
    updated = await complete_profile(supplier, companyName="شرکت تأییدشده", city="تبریز")
    assert updated["city"] == "تبریز" and updated["verified"] is True


async def test_portfolio_images_are_public_and_capped(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    supplier = await register(client_factory(), role="supplier")
    profile = await complete_profile(supplier)
    image = await upload_file(supplier, "نمونه‌کار.png", PNG_BYTES, "portfolio_image")
    assert image.status_code == 201, image.text
    image_id = image.json()["id"]

    public = (await client_factory().get(f"{API}/suppliers/{profile['id']}")).json()
    assert public["portfolio"] == [
        {"id": image_id, "url": f"/suppliers/{profile['id']}/images/{image_id}"}
    ]
    served = await client_factory().get(f"{API}{public['portfolio'][0]['url']}")
    assert served.status_code == 200
    assert served.content == PNG_BYTES
    assert served.headers["content-type"] == "image/png"
    assert served.headers["x-content-type-options"] == "nosniff"
    assert served.headers["cache-control"].startswith("public")

    # از این مسیر فقط تصویر نمونه‌کارِ همان قطعه‌ساز خوانده می‌شود
    other = await register(client_factory(), role="supplier")
    other_profile = await complete_profile(other)
    document = await upload_file(supplier, "license.pdf", PDF_BYTES, "verification_document")
    for supplier_id, file_id in (
        (other_profile["id"], image_id),
        (profile["id"], document.json()["id"]),
    ):
        response = await client_factory().get(f"{API}/suppliers/{supplier_id}/images/{file_id}")
        assert response.status_code == 404

    for index in range(11):
        extra = await upload_file(supplier, f"{index}.png", PNG_BYTES, "portfolio_image")
        assert extra.status_code == 201, extra.text
    full = await upload_file(supplier, "13.png", PNG_BYTES, "portfolio_image")
    assert full.status_code == 409 and full.json()["code"] == "portfolio_full"

    removed = await supplier.client.delete(f"{API}/files/{image_id}", headers=supplier.auth)
    assert removed.status_code == 204
    again = await upload_file(supplier, "13.png", PNG_BYTES, "portfolio_image")
    assert again.status_code == 201


async def test_verified_only_filter(client_factory: Callable[[], httpx.AsyncClient]) -> None:
    plain = await register(client_factory(), role="supplier")
    await complete_profile(plain, companyName="قطعه‌ساز معمولی")
    trusted = await register(client_factory(), role="supplier")
    trusted_profile = await complete_profile(trusted, companyName="قطعه‌ساز معتبر")
    await _mark_verified(trusted_profile["id"])

    client = client_factory()
    everyone = (await client.get(f"{API}/suppliers")).json()
    # تأییدشده‌ها اول می‌آیند
    assert [s["companyName"] for s in everyone["items"]] == ["قطعه‌ساز معتبر", "قطعه‌ساز معمولی"]
    verified = (await client.get(f"{API}/suppliers", params={"verified": "true"})).json()
    assert verified["total"] == 1 and verified["items"][0]["verified"] is True
