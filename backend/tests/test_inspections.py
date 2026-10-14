"""کنترل کیفیت اختیاری (گام 3d فاز ۳، O9): فقط آزمایشگاه تأییدشده انتخاب می‌شود، آزمایشگاه فقط
همان سفارش را (بدون مبلغ، پرداخت و قرارداد) و نقشه‌ها را پس از تعهد عدم افشا می‌بیند، رد بازرسی
سفارش را به تولید برمی‌گرداند و ارسال پیش از قبولی ممکن نیست."""

from collections.abc import Callable
from typing import Any

import httpx

from app.modules.agreements.catalog import INSPECTION_NDA, RFQ_NDA
from tests.helpers import (
    API,
    PDF_BYTES,
    Account,
    Deal,
    accepted,
    award,
    make_admin,
    make_deal,
    order_of,
    register,
    signed_order,
    upload_file,
    verified_lab,
)


async def _inspection(account: Account, order_id: str) -> dict[str, Any]:
    response = await account.client.get(f"{API}/orders/{order_id}/inspection", headers=account.auth)
    assert response.status_code == 200, response.text
    return response.json()  # type: ignore[no-any-return]


async def _choose(account: Account, order_id: str, lab: Account) -> httpx.Response:
    return await account.client.put(
        f"{API}/orders/{order_id}/inspection",
        json={"labOrganizationId": lab.user["organizationId"]},
        headers=account.auth,
    )


async def _post(
    account: Account, order_id: str, path: str, body: dict[str, Any] | None = None
) -> httpx.Response:
    return await account.client.post(
        f"{API}/orders/{order_id}/{path}", json=body or {}, headers=account.auth
    )


async def _report(lab: Account, name: str = "inspection-report.pdf") -> str:
    uploaded = await upload_file(lab, name, PDF_BYTES, "order_document")
    assert uploaded.status_code == 201, uploaded.text
    return str(uploaded.json()["id"])


async def _result(
    lab: Account, order_id: str, attempt: int, passed: bool, note: str = "", **extra: Any
) -> httpx.Response:
    body: dict[str, Any] = {"attempt": attempt, "passed": passed, "note": note}
    if "file_id" not in extra:
        body["fileId"] = await _report(lab)
    elif extra["file_id"] is not None:
        body["fileId"] = extra["file_id"]
    return await _post(lab, order_id, "inspection/result", body)


async def _order(account: Account, order_id: str) -> httpx.Response:
    return await account.client.get(f"{API}/orders/{order_id}", headers=account.auth)


async def _link(account: Account, file_id: str) -> httpx.Response:
    return await account.client.post(f"{API}/files/{file_id}/link", headers=account.auth)


async def test_only_verified_labs_can_be_chosen_by_the_buyer(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    admin = await make_admin(client_factory())
    lab = await verified_lab(client_factory, admin, "آزمایشگاه متالورژی دقیق")
    unverified = await register(client_factory(), role="qc", company="آزمایشگاه تأییدنشده")

    deal = await make_deal(client_factory)
    labs = await deal.buyer.client.get(f"{API}/qc-labs", headers=deal.buyer.auth)
    assert labs.status_code == 200
    assert [item["name"] for item in labs.json()["items"]] == ["آزمایشگاه متالورژی دقیق"]
    for other in (deal.supplier, lab):
        hidden = await other.client.get(f"{API}/qc-labs", headers=other.auth)
        assert hidden.status_code == 403

    await award(deal)
    order_id = str((await order_of(deal))["id"])
    before = await _inspection(deal.buyer, order_id)
    assert before["status"] == "none" and before["canChooseLab"] is True
    assert (await _inspection(deal.supplier, order_id))["canChooseLab"] is False

    rejected = await _choose(deal.buyer, order_id, unverified)
    assert rejected.status_code == 422
    assert rejected.json()["errors"][0]["field"] == "labOrganizationId"
    assert (await _choose(deal.supplier, order_id, lab)).status_code == 403

    chosen = await _choose(deal.buyer, order_id, lab)
    assert chosen.status_code == 200, chosen.text
    body = chosen.json()
    assert body["status"] == "requested" and body["attempt"] == 0
    assert body["lab"]["name"] == "آزمایشگاه متالورژی دقیق"
    # تکرار همان انتخاب بی‌اثر است
    assert (await _choose(deal.buyer, order_id, lab)).status_code == 200
    order = await order_of(deal)
    assert order["inspection"] == {"status": "requested", "lab": body["lab"]}
    assert [e["action"] for e in order["events"]].count("inspection_requested") == 1
    # پیش از امضای قرارداد، قطعه‌ساز هنوز نمی‌تواند آمادگی را اعلام کند
    supplier_view = await _inspection(deal.supplier, order_id)
    assert supplier_view["status"] == "requested" and supplier_view["canMarkReady"] is False
    early = await _post(deal.supplier, order_id, "inspection/ready")
    assert early.status_code == 409


async def test_lab_sees_only_its_order_and_drawings_after_nda(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    admin = await make_admin(client_factory())
    lab = await verified_lab(client_factory, admin, "آزمایشگاه انتخاب‌شده")
    other_lab = await verified_lab(client_factory, admin, "آزمایشگاه دیگر")
    deal, order_id = await signed_order(client_factory, with_drawing=True)
    _, other_order = await signed_order(client_factory)
    assert (await _choose(deal.buyer, order_id, lab)).status_code == 200

    listed = (await lab.client.get(f"{API}/orders", headers=lab.auth)).json()
    assert [o["id"] for o in listed["items"]] == [order_id]
    [summary] = listed["items"]
    assert summary["mySide"] == "qc" and summary["amountRials"] is None
    assert summary["nextActions"] == []

    detail = await _order(lab, order_id)
    assert detail.status_code == 200
    assert detail.json()["amountRials"] is None
    assert {e["action"] for e in detail.json()["events"]} == {"inspection_requested"}
    # قرارداد، پرداخت‌ها و سفارش‌های دیگر برای آزمایشگاه وجود ندارند
    for path in (f"orders/{order_id}/contract", f"orders/{order_id}/payments"):
        hidden = await lab.client.get(f"{API}/{path}", headers=lab.auth)
        assert hidden.status_code == 404, path
    assert (await _order(lab, other_order)).status_code == 404
    assert (await _order(other_lab, order_id)).status_code == 404
    other_view = await other_lab.client.get(
        f"{API}/orders/{order_id}/inspection", headers=other_lab.auth
    )
    assert other_view.status_code == 404

    gate = await _inspection(lab, order_id)
    assert gate["ndaAccepted"] is False and gate["fileCount"] == 1 and gate["files"] == []
    rfq = (
        await deal.buyer.client.get(f"{API}/rfqs/{deal.rfq['id']}", headers=deal.buyer.auth)
    ).json()
    drawing_id = rfq["files"][0]["id"]
    before = await _link(lab, drawing_id)
    assert before.status_code == 403 and before.json()["code"] == "nda_required"
    assert (await _link(other_lab, drawing_id)).status_code == 404

    wrong = await _post(lab, order_id, "inspection/nda", accepted(RFQ_NDA.key))
    assert wrong.status_code == 422
    for _ in range(2):  # پذیرش دوباره بی‌اثر و موفق است
        ok = await _post(lab, order_id, "inspection/nda", accepted(INSPECTION_NDA.key))
        assert ok.status_code == 200, ok.text
    opened = ok.json()
    assert opened["ndaAccepted"] is True
    assert [f["name"] for f in opened["files"]] == ["bush-drawing.pdf"]
    assert (await _link(lab, drawing_id)).status_code == 200
    # NDA مخصوص آزمایشگاه است؛ قطعه‌ساز و کارفرما نمی‌توانند از این مسیر بپذیرند
    not_lab = await _post(deal.supplier, order_id, "inspection/nda", accepted(INSPECTION_NDA.key))
    assert not_lab.status_code == 403


async def test_failed_inspection_returns_to_production_and_pass_unlocks_shipping(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    admin = await make_admin(client_factory())
    lab = await verified_lab(client_factory, admin, "آزمایشگاه کنترل ابعادی")
    spare_lab = await verified_lab(client_factory, admin, "آزمایشگاه جایگزین")
    deal, order_id = await signed_order(client_factory)
    await _choose(deal.buyer, order_id, lab)
    assert (await order_of(deal))["status"] == "in_production"

    supplier_order = (await _order(deal.supplier, order_id)).json()
    assert "ship" not in supplier_order["nextActions"]
    blocked = await _post(deal.supplier, order_id, "ship")
    assert blocked.status_code == 409 and blocked.json()["code"] == "inspection_required"
    too_early = await _result(lab, order_id, 1, True)
    assert too_early.status_code == 409 and too_early.json()["code"] == "inspection_not_ready"
    # آزمایشگاه کارهای دو طرف را انجام نمی‌دهد
    assert (await _post(lab, order_id, "ship")).status_code == 403
    assert (await _choose(lab, order_id, spare_lab)).status_code == 403
    assert (await _post(lab, order_id, "inspection/ready")).status_code == 403

    assert (await _inspection(deal.supplier, order_id))["canMarkReady"] is True
    ready = await _post(deal.supplier, order_id, "inspection/ready", {"note": "قطعات در انبار"})
    assert ready.status_code == 200, ready.text
    assert (ready.json()["status"], ready.json()["attempt"]) == ("ready", 1)
    again = await _post(deal.supplier, order_id, "inspection/ready")
    assert again.json()["attempt"] == 1  # تکرار بی‌اثر
    assert (await order_of(deal))["status"] == "in_inspection"
    still_blocked = await _post(deal.supplier, order_id, "ship")
    assert still_blocked.status_code == 409

    no_reason = await _result(lab, order_id, 1, False, "")
    assert no_reason.status_code == 422 and no_reason.json()["errors"][0]["field"] == "note"
    no_report = await _result(lab, order_id, 1, False, "قطر داخلی خارج از تلرانس", file_id=None)
    assert no_report.status_code == 422 and no_report.json()["errors"][0]["field"] == "fileId"
    assert (await _inspection(lab, order_id))["canRecordResult"] is True

    failed = await _result(lab, order_id, 1, False, "قطر داخلی خارج از تلرانس")
    assert failed.status_code == 200, failed.text
    result = failed.json()
    assert result["status"] == "failed" and result["resultNote"] == "قطر داخلی خارج از تلرانس"
    report_id = result["report"]["id"]
    repeat = await _result(lab, order_id, 1, True)
    assert repeat.status_code == 200 and repeat.json()["status"] == "failed"
    order = await order_of(deal)
    assert order["status"] == "in_production"
    last = order["events"][-1]
    assert (last["action"], last["fromStatus"], last["toStatus"], last["actorSide"]) == (
        "inspection_failed",
        "in_inspection",
        "in_production",
        "qc",
    )
    # گزارش برای دو طرف و خود آزمایشگاه قابل دانلود است
    for account in (deal.buyer, deal.supplier, lab):
        assert (await _link(account, report_id)).status_code == 200

    assert (await _post(deal.supplier, order_id, "ship")).status_code == 409
    second = await _post(deal.supplier, order_id, "inspection/ready")
    assert (second.json()["status"], second.json()["attempt"]) == ("ready", 2)
    stale = await _result(lab, order_id, 1, True)
    assert stale.status_code == 409  # نتیجه‌ی دور قبل، دور تازه را نمی‌بندد
    passed = await _result(lab, order_id, 2, True, "مطابق نقشه")
    assert passed.json()["status"] == "passed"
    order = await order_of(deal)
    assert order["status"] == "in_inspection" and order["inspection"]["status"] == "passed"
    assert "ship" in (await _order(deal.supplier, order_id)).json()["nextActions"]

    locked = await _choose(deal.buyer, order_id, spare_lab)
    assert locked.status_code == 409 and locked.json()["code"] == "inspection_locked"
    removal = await deal.buyer.client.delete(
        f"{API}/orders/{order_id}/inspection", headers=deal.buyer.auth
    )
    assert removal.status_code == 409

    waybill = await upload_file(deal.supplier, "waybill.pdf", PDF_BYTES, "order_document")
    shipped = await _post(deal.supplier, order_id, "ship", {"fileId": waybill.json()["id"]})
    assert shipped.status_code == 200 and shipped.json()["status"] == "shipped"
    # آزمایشگاه سفارش را هنوز می‌بیند ولی سند ارسال قطعه‌ساز را نه
    lab_view = (await _order(lab, order_id)).json()
    assert lab_view["status"] == "shipped"
    assert "ship" not in {e["action"] for e in lab_view["events"]}
    assert (await _link(lab, waybill.json()["id"])).status_code == 404


async def test_buyer_can_change_or_remove_the_lab_until_it_passes(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    admin = await make_admin(client_factory())
    first = await verified_lab(client_factory, admin, "آزمایشگاه اول")
    second = await verified_lab(client_factory, admin, "آزمایشگاه دوم")
    deal, order_id = await signed_order(client_factory)
    await _choose(deal.buyer, order_id, first)
    await _post(deal.supplier, order_id, "inspection/ready")

    changed = await _choose(deal.buyer, order_id, second)
    assert changed.status_code == 200
    assert changed.json()["lab"]["name"] == "آزمایشگاه دوم"
    assert changed.json()["status"] == "ready"  # دور جاری با آزمایشگاه تازه ادامه می‌یابد
    assert (await _order(first, order_id)).status_code == 404
    assert (await _inspection(second, order_id))["canRecordResult"] is True

    removed = await deal.buyer.client.delete(
        f"{API}/orders/{order_id}/inspection", headers=deal.buyer.auth
    )
    assert removed.status_code == 200 and removed.json()["status"] == "none"
    order = await order_of(deal)
    assert order["status"] == "in_production" and order["inspection"] is None
    last = order["events"][-1]
    assert (last["action"], last["fromStatus"], last["toStatus"]) == (
        "inspection_removed",
        "in_inspection",
        "in_production",
    )
    assert (await _order(second, order_id)).status_code == 404
    again = await deal.buyer.client.delete(
        f"{API}/orders/{order_id}/inspection", headers=deal.buyer.auth
    )
    assert again.status_code == 200
    # بدون بازرسی، قطعه‌ساز مستقیم ارسال می‌کند
    assert (await _post(deal.supplier, order_id, "ship")).status_code == 200


async def test_lab_whose_verification_is_revoked_cannot_record_results(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    admin = await make_admin(client_factory())
    lab = await verified_lab(client_factory, admin, "آزمایشگاه معلق")
    deal, order_id = await signed_order(client_factory)
    await _choose(deal.buyer, order_id, lab)
    await _post(deal.supplier, order_id, "inspection/ready")

    revoked = await admin.client.post(
        f"{API}/admin/users/{lab.user['id']}/unverify", json={}, headers=admin.auth
    )
    assert revoked.status_code == 200
    assert (await _inspection(lab, order_id))["canRecordResult"] is False
    refused = await _result(lab, order_id, 1, True)
    assert refused.status_code == 403 and refused.json()["code"] == "lab_not_verified"
    labs = (await deal.buyer.client.get(f"{API}/qc-labs", headers=deal.buyer.auth)).json()
    assert labs["items"] == []


async def test_inspection_rules_hold_for_cancelled_orders(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    admin = await make_admin(client_factory())
    lab = await verified_lab(client_factory, admin, "آزمایشگاه")
    deal: Deal = await make_deal(client_factory)
    await award(deal)
    order_id = str((await order_of(deal))["id"])
    await _post(deal.buyer, order_id, "cancel", {"reason": "تغییر طراحی قطعه"})
    closed = await _choose(deal.buyer, order_id, lab)
    assert closed.status_code == 409 and closed.json()["code"] == "inspection_locked"
    assert (await _inspection(deal.buyer, order_id))["canChooseLab"] is False
