"""عکس پروفایل شرکت: فقط مدیر قطعه‌ساز بارگذاری می‌کند، عکس تازه جای قبلی را می‌گیرد و در
پروفایل و پیشنهادها دیده می‌شود؛ ستاره‌ی کارفرماها (میانگین و تعداد) هم کنار پیشنهاد می‌آید."""

from collections.abc import Callable
from typing import Any

import httpx

from tests.helpers import (
    API,
    PNG_BYTES,
    Account,
    complete_profile,
    create_rfq,
    register,
    submit_quote,
    upload_file,
)


async def _upload_logo(account: Account) -> dict[str, Any]:
    response = await upload_file(account, name="logo.png", content=PNG_BYTES, purpose="logo")
    assert response.status_code == 201, response.text
    return response.json()


async def _mine(account: Account) -> dict[str, Any]:
    response = await account.client.get(f"{API}/suppliers/me", headers=account.auth)
    assert response.status_code == 200, response.text
    return response.json()


async def test_owner_sets_and_replaces_the_logo(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    supplier = await register(client_factory(), role="supplier")
    await complete_profile(supplier)
    first = await _upload_logo(supplier)
    mine = await _mine(supplier)
    assert mine["logo"]["id"] == first["id"]

    public = await supplier.client.get(f"{API}/suppliers/{mine['id']}", headers=supplier.auth)
    assert public.status_code == 200 and public.json()["logo"] == mine["logo"]
    image = await supplier.client.get(f"{API}{mine['logo']['url']}")
    assert image.status_code == 200 and image.content == PNG_BYTES

    second = await _upload_logo(supplier)
    mine = await _mine(supplier)
    assert mine["logo"]["id"] == second["id"]
    old = await supplier.client.get(f"{API}/suppliers/{mine['id']}/images/{first['id']}")
    assert old.status_code == 404


async def test_only_suppliers_upload_a_logo(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    buyer = await register(client_factory())
    response = await upload_file(buyer, name="logo.png", content=PNG_BYTES, purpose="logo")
    assert response.status_code == 403


async def test_quotes_carry_the_logo_and_buyer_stars(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    buyer = await register(client_factory())
    supplier = await register(client_factory(), role="supplier")
    await complete_profile(supplier)
    logo = await _upload_logo(supplier)
    rfq = await create_rfq(buyer)
    assert (await submit_quote(supplier, rfq["id"])).status_code == 201

    response = await buyer.client.get(f"{API}/rfqs/{rfq['id']}/quotations", headers=buyer.auth)
    quote = response.json()[0]
    assert quote["supplierLogoUrl"].endswith(f"/images/{logo['id']}")
    assert quote["supplierRatingCount"] == 0
    assert quote["supplierRatingAverage"] is None
