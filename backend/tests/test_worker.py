"""کارهای پس‌زمینه (گام 4d فاز ۴): زمان‌بندی با قفل و تلاش دوباره‌ی محدود، یادآوری موعد تحویل،
پاک‌سازی فایل‌های رهاشده و اعلان‌های قدیمی، و صف ارسال ایمیل."""

import asyncio
import json
import uuid
from collections.abc import Callable, Iterator
from datetime import timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy import text

from app import worker
from app.core.messaging import (
    ConsoleMessageSender,
    DisabledMessageSender,
    set_message_sender,
)
from app.core.redis import get_redis
from app.core.time import business_today, utcnow
from app.db.session import SessionLocal, engine
from app.modules.files import cleanup as file_cleanup
from app.modules.notifications import service as notifications
from app.modules.orders import reminders
from app.modules.outbox import service as outbox
from tests.helpers import (
    PNG_BYTES,
    complete_profile,
    create_rfq,
    register,
    signed_order,
    stored_keys,
    upload_file,
)

# --- زمان‌بندی -------------------------------------------------------------------------------


def counting_job(name: str = "test_job", *, fail: bool = False, delay: float = 0) -> worker.Job:
    runs: list[int] = []

    async def run() -> dict[str, int]:
        runs.append(1)
        await asyncio.sleep(delay)
        if fail:
            raise RuntimeError("disk full")
        return {"runs": len(runs)}

    return worker.Job(name, timedelta(hours=1), run, timeout=timedelta(seconds=1))


async def state_of(job: worker.Job) -> dict[str, Any]:
    return dict(await get_redis().hgetall(job.key))


async def test_jobs_run_once_per_interval() -> None:
    redis = get_redis()
    job = counting_job()
    now = 1_000_000.0
    assert await worker.run_job(redis, job, now) == {"runs": 1}
    assert await worker.run_job(redis, job, now + 60) is None  # هنوز سررسید نشده است
    assert await worker.run_job(redis, job, now + 3600) == {"runs": 2}

    state = await state_of(job)
    assert state["last_status"] == "ok" and state["failures"] == "0"
    assert float(state["next_run"]) == now + 7200
    assert json.loads(state["last_result"]) == {"runs": 2}
    assert not await redis.exists(f"{job.key}:lock")  # قفل آزاد شده است

    # اجرای دستی (--run) منتظر سررسید نمی‌ماند
    assert await worker.run_job(redis, job, now + 3600, force=True) == {"runs": 3}


async def test_only_one_worker_runs_a_job_at_a_time() -> None:
    redis = get_redis()
    job = counting_job()
    await redis.set(f"{job.key}:lock", "another-worker", px=60_000)
    assert await worker.run_job(redis, job, 1_000_000.0) is None
    # قفل worker دیگر دست نمی‌خورد
    assert await redis.get(f"{job.key}:lock") == "another-worker"


async def test_failures_retry_with_growing_delays_then_follow_the_schedule() -> None:
    redis = get_redis()
    job = counting_job(fail=True)
    now = 1_000_000.0
    for expected_delay in (60, 300, 900, 3600):
        assert await worker.run_job(redis, job, now, force=True) is None
        state = await state_of(job)
        assert float(state["next_run"]) == now + expected_delay
    assert state["last_status"] == "failed"
    assert state["last_error"] == "RuntimeError: disk full"
    assert state["failures"] == "4"


async def test_slow_jobs_time_out_and_count_as_failures() -> None:
    job = counting_job(delay=5)
    assert await worker.run_job(get_redis(), job, 1_000_000.0) is None
    state = await state_of(job)
    assert state["last_status"] == "failed" and state["last_error"].startswith("TimeoutError")


def test_job_names_are_unique() -> None:
    names = [job.name for job in worker.JOBS]
    assert len(names) == len(set(names))


# --- یادآوری موعد تحویل ----------------------------------------------------------------------


async def notified(kind: str) -> list[tuple[str, str]]:
    async with engine.connect() as conn:
        rows = await conn.execute(
            text(
                "SELECT u.email, n.title FROM notifications n JOIN users u ON u.id = n.user_id"
                " WHERE n.kind = :kind ORDER BY u.email"
            ),
            {"kind": kind},
        )
        return [(email, title) for email, title in rows]


async def set_order(order_id: str, **values: object) -> None:
    columns = ", ".join(f"{name} = :{name}" for name in values)
    async with engine.begin() as conn:
        await conn.execute(
            text(f"UPDATE orders SET {columns} WHERE id = :id"), {**values, "id": order_id}
        )


async def run_reminders() -> dict[str, int]:
    async with SessionLocal() as db:
        return await reminders.send_delivery_reminders(db, today=business_today())


async def test_delivery_reminders_are_sent_once(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    deal, order_id = await signed_order(client_factory)
    today = business_today()

    await set_order(order_id, delivery_due=today + timedelta(days=10))
    assert await run_reminders() == {"due_soon": 0, "overdue": 0}

    await set_order(order_id, delivery_due=today + timedelta(days=2))
    assert await run_reminders() == {"due_soon": 1, "overdue": 0}
    assert await run_reminders() == {"due_soon": 0, "overdue": 0}  # دوباره فرستاده نمی‌شود
    due_soon = await notified("order_due_soon")
    # فقط قطعه‌ساز؛ کارفرما برای «نزدیک موعد» اعلان نمی‌گیرد
    assert [email for email, _ in due_soon] == [deal.supplier.user["email"]]
    assert "نزدیک است" in due_soon[0][1]

    await set_order(order_id, delivery_due=today - timedelta(days=1))
    assert await run_reminders() == {"due_soon": 0, "overdue": 1}
    assert await run_reminders() == {"due_soon": 0, "overdue": 0}
    overdue = await notified("order_overdue")
    assert sorted(email for email, _ in overdue) == sorted(
        [deal.buyer.user["email"], deal.supplier.user["email"]]
    )


async def test_shipped_orders_get_no_reminders(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    _, order_id = await signed_order(client_factory)
    await set_order(order_id, status="shipped", delivery_due=business_today() - timedelta(days=3))
    assert await run_reminders() == {"due_soon": 0, "overdue": 0}


# --- پاک‌سازی ---------------------------------------------------------------------------------


async def backdate(table: str, row_id: str, days: int) -> None:
    async with engine.begin() as conn:
        await conn.execute(
            text(
                f"UPDATE {table} SET created_at = now() - make_interval(days => :days)"
                " WHERE id = :id"
            ),
            {"days": days, "id": row_id},
        )


async def test_unattached_uploads_are_deleted_after_a_week(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    buyer = await register(client_factory())
    abandoned = (await upload_file(buyer, "abandoned.pdf")).json()["id"]
    recent = (await upload_file(buyer, "recent.pdf")).json()["id"]
    attached = (await upload_file(buyer, "attached.pdf")).json()["id"]
    await create_rfq(buyer, fileIds=[attached])
    supplier = await register(client_factory(), role="supplier")
    await complete_profile(supplier)
    image = (await upload_file(supplier, "sample.png", PNG_BYTES, "portfolio_image")).json()["id"]
    for file_id in (abandoned, attached, image):
        await backdate("files", file_id, days=8)
    assert len(stored_keys()) == 4

    async with SessionLocal() as db:
        result = await file_cleanup.delete_unattached_uploads(db, now=utcnow())
    assert result == {"deleted": 1, "storage_errors": 0}
    async with engine.connect() as conn:
        left = set((await conn.scalars(text("SELECT id::text FROM files"))).all())
        expired = await conn.scalar(
            text("SELECT count(*) FROM audit_events WHERE action = 'file.expired'")
        )
    assert left == {recent, attached, image}
    assert expired == 1
    assert len(stored_keys()) == 3


async def test_old_read_notifications_are_deleted(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    buyer = await register(client_factory())
    user_id = uuid.UUID(buyer.user["id"])
    async with engine.connect() as conn:
        organization_id = await conn.scalar(
            text("SELECT organization_id FROM users WHERE id = :id"), {"id": user_id}
        )
    async with SessionLocal() as db:
        for title in ("old read", "old unread", "recent read"):
            notifications.notify_user(
                db, user_id=user_id, organization_id=organization_id, kind="test", title=title
            )
        await db.commit()
    async with engine.begin() as conn:
        await conn.execute(
            text(
                "UPDATE notifications SET created_at = now() - interval '200 days'"
                " WHERE title LIKE 'old%'"
            )
        )
        await conn.execute(
            text(
                "UPDATE notifications SET read_at = now() WHERE title IN ('old read', 'recent read')"
            )
        )

    async with SessionLocal() as db:
        assert await notifications.delete_old_read(db, now=utcnow()) == 1
    async with engine.connect() as conn:
        titles = set((await conn.scalars(text("SELECT title FROM notifications"))).all())
    assert titles == {"old unread", "recent read"}


# --- صف ارسال ایمیل ---------------------------------------------------------------------------


class FailingSender:
    enabled = True

    async def send_message(self, **_: object) -> None:
        raise ConnectionError("provider unreachable")


@pytest.fixture
def console() -> Iterator[ConsoleMessageSender]:
    sender = ConsoleMessageSender()
    set_message_sender(sender)
    yield sender
    set_message_sender(None)


async def notify_once(client_factory: Callable[[], httpx.AsyncClient]) -> tuple[str, str]:
    """یک اعلان می‌سازد و (ایمیل گیرنده، شناسه‌ی اعلان) را برمی‌گرداند."""
    buyer = await register(client_factory())
    async with engine.connect() as conn:
        organization_id = await conn.scalar(
            text("SELECT organization_id FROM users WHERE id = :id"), {"id": buyer.user["id"]}
        )
    async with SessionLocal() as db:
        notifications.notify_user(
            db,
            user_id=uuid.UUID(buyer.user["id"]),
            organization_id=organization_id,
            kind="test",
            title="پیشنهاد تازه",
            body="یک پیشنهاد قیمت تازه رسید.",
            link="/rfqs/123",
        )
        await db.commit()
    async with engine.connect() as conn:
        notification_id = await conn.scalar(text("SELECT id::text FROM notifications"))
    return buyer.user["email"], str(notification_id)


async def outbox_rows() -> list[dict[str, Any]]:
    async with engine.connect() as conn:
        rows = await conn.execute(
            text("SELECT status, attempts, last_error, next_attempt_at FROM outbox_messages")
        )
        return [dict(row._mapping) for row in rows]


async def test_notification_emails_are_queued_and_sent(
    client_factory: Callable[[], httpx.AsyncClient], console: ConsoleMessageSender
) -> None:
    email, _ = await notify_once(client_factory)
    assert [row["status"] for row in await outbox_rows()] == ["pending"]

    assert await outbox.send_due() == {"sent": 1, "retry": 0, "failed": 0, "skipped": 0}
    [message] = console.outbox
    assert message.destination == email and message.subject == "پیشنهاد تازه"
    assert "یک پیشنهاد قیمت تازه رسید." in message.body
    assert "http://localhost:3100/rfqs/123" in message.body
    assert [row["status"] for row in await outbox_rows()] == ["sent"]
    # دوباره فرستاده نمی‌شود
    assert await outbox.send_due() == {"sent": 0, "retry": 0, "failed": 0, "skipped": 0}


async def test_failed_emails_retry_a_limited_number_of_times(
    client_factory: Callable[[], httpx.AsyncClient], console: ConsoleMessageSender
) -> None:
    await notify_once(client_factory)
    set_message_sender(FailingSender())
    before = utcnow()
    assert await outbox.send_due() == {"sent": 0, "retry": 1, "failed": 0, "skipped": 0}
    [row] = await outbox_rows()
    assert row["status"] == "pending" and row["attempts"] == 1
    assert row["last_error"] == "ConnectionError: provider unreachable"
    assert row["next_attempt_at"] >= before + timedelta(minutes=1)
    # تا سررسید بعدی کاری نمی‌شود
    assert await outbox.send_due() == {"sent": 0, "retry": 0, "failed": 0, "skipped": 0}

    for _ in range(outbox.MAX_ATTEMPTS - 1):
        async with engine.begin() as conn:
            await conn.execute(text("UPDATE outbox_messages SET next_attempt_at = now()"))
        await outbox.send_due()
    [row] = await outbox_rows()
    assert row["status"] == "failed" and row["attempts"] == outbox.MAX_ATTEMPTS


async def test_emails_to_deactivated_users_are_skipped(
    client_factory: Callable[[], httpx.AsyncClient], console: ConsoleMessageSender
) -> None:
    email, _ = await notify_once(client_factory)
    async with engine.begin() as conn:
        await conn.execute(
            text("UPDATE users SET is_active = false WHERE email = :e"), {"e": email}
        )
    assert await outbox.send_due() == {"sent": 0, "retry": 0, "failed": 0, "skipped": 1}
    assert console.outbox == []


async def test_nothing_is_queued_while_sending_is_off(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    # پیش‌فرض تولید تا انتخاب سرویس (S9)
    set_message_sender(DisabledMessageSender())
    try:
        await notify_once(client_factory)
        assert await outbox_rows() == []
        assert await outbox.send_due() == {"sent": 0, "retry": 0, "failed": 0, "skipped": 0}
    finally:
        set_message_sender(None)
