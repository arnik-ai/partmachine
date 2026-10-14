"""فهرست قطعه‌سازها: صفحه‌بندی در DB، فیلترها، جستجوی فارسی (SUP1–SUP3)."""

import uuid

import httpx
from sqlalchemy import text

from app.core.text import normalize_search
from app.db.session import SessionLocal, engine
from app.modules.organizations.models import Organization
from app.modules.suppliers.models import Supplier
from tests.helpers import API


async def _add_supplier(
    name: str,
    *,
    description: str = "",
    city: str = "تهران",
    capabilities: list[str] | None = None,
    verified: bool = False,
) -> None:
    async with SessionLocal() as db:
        org = Organization(id=uuid.uuid4(), name=name)
        db.add(org)
        await db.flush()
        db.add(
            Supplier(
                organization_id=org.id,
                company_name=name,
                description=description,
                city=city,
                capabilities=capabilities or ["cnc"],
                verified=verified,
            )
        )
        await db.commit()


async def test_pagination_happens_in_the_database(client: httpx.AsyncClient) -> None:
    for i in range(25):
        await _add_supplier(f"کارگاه شماره {i}")
    page = (await client.get(f"{API}/suppliers", params={"limit": 10, "offset": 20})).json()
    assert page["total"] == 25
    assert len(page["items"]) == 5
    assert (await client.get(f"{API}/suppliers", params={"limit": 101})).status_code == 422


async def test_filters_by_capability_and_city(client: httpx.AsyncClient) -> None:
    await _add_supplier("ریخته‌گری شمال", city="رشت", capabilities=["casting"])
    await _add_supplier("تراشکاری مرکزی", city="تهران", capabilities=["cnc", "welding"])
    by_capability = (await client.get(f"{API}/suppliers", params={"capability": "welding"})).json()
    assert [s["companyName"] for s in by_capability["items"]] == ["تراشکاری مرکزی"]
    by_city = (await client.get(f"{API}/suppliers", params={"city": "رشت"})).json()
    assert [s["companyName"] for s in by_city["items"]] == ["ریخته‌گری شمال"]
    invalid = await client.get(f"{API}/suppliers", params={"capability": "laser"})
    assert invalid.status_code == 422


async def test_persian_search_ignores_arabic_letters_and_half_spaces(
    client: httpx.AsyncClient,
) -> None:
    await _add_supplier("صنایع دقیق‌تراش آریا", description="ماشین‌کاری CNC")
    for query in ("آريا", "آریا", "دقیق تراش", "دقيق‌تراش", "cnc"):
        page = (await client.get(f"{API}/suppliers", params={"q": query})).json()
        assert page["total"] == 1, query


async def test_like_wildcards_are_literal(client: httpx.AsyncClient) -> None:
    await _add_supplier("کارگاه یک")
    page = (await client.get(f"{API}/suppliers", params={"q": "%"})).json()
    assert page["total"] == 0


async def test_database_and_python_normalization_agree() -> None:
    await _add_supplier("قطعه‌سازي كاوه", description="ورق‌كاري")
    async with engine.connect() as conn:
        stored = await conn.scalar(text("SELECT search_text FROM suppliers"))
    assert stored == normalize_search("قطعه‌سازي كاوه ورق‌كاري")


async def test_supplier_detail(client: httpx.AsyncClient) -> None:
    await _add_supplier("کارگاه نمونه", verified=True)
    listing = (await client.get(f"{API}/suppliers")).json()
    supplier_id = listing["items"][0]["id"]
    detail = await client.get(f"{API}/suppliers/{supplier_id}")
    assert detail.status_code == 200
    assert detail.json()["score"]["components"]
    missing = await client.get(f"{API}/suppliers/{uuid.uuid4()}")
    assert missing.status_code == 404
    assert missing.json()["detail"] == "قطعه‌ساز موردنظر پیدا نشد."
