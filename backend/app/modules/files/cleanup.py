"""پاک‌سازی خودکار فایل‌هایی که بارگذاری شدند ولی هرگز به جایی پیوست نشدند (کار worker، گام 4d).

مثلاً نقشه‌ای که در فرم RFQ بارگذاری شد ولی RFQ هرگز ثبت نشد. چنین فایلی پس از `UNATTACHED_DAYS`
روز پاک می‌شود. تصویرهای نمونه‌کار پیوست لازم ندارند و این‌جا هرگز پاک نمی‌شوند. فایلی که در
تاریخچه‌ی سفارش، پرداخت، بازرسی یا اختلاف آمده باشد هم دست نمی‌خورد.
"""

import logging
from datetime import datetime, timedelta

from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import get_storage
from app.modules.audit import service as audit
from app.modules.disputes.models import OrderDispute
from app.modules.files.models import StoredFile
from app.modules.inspections.models import OrderInspection
from app.modules.orders.models import OrderEvent
from app.modules.payments.models import OrderPayment

logger = logging.getLogger("partmachine.files")

UNATTACHED_DAYS = 7
BATCH_SIZE = 200
EXPIRING_PURPOSES = ("rfq_attachment", "verification_document", "order_document")


async def delete_unattached_uploads(db: AsyncSession, *, now: datetime) -> dict[str, int]:
    files = (
        await db.scalars(
            select(StoredFile)
            .where(
                StoredFile.purpose.in_(EXPIRING_PURPOSES),
                StoredFile.rfq_id.is_(None),
                StoredFile.verification_request_id.is_(None),
                StoredFile.order_id.is_(None),
                StoredFile.created_at < now - timedelta(days=UNATTACHED_DAYS),
                ~exists().where(OrderEvent.file_id == StoredFile.id),
                ~exists().where(OrderPayment.receipt_file_id == StoredFile.id),
                ~exists().where(OrderInspection.report_file_id == StoredFile.id),
                ~exists().where(OrderDispute.file_id == StoredFile.id),
            )
            .order_by(StoredFile.created_at)
            .limit(BATCH_SIZE)
            # پیوست هم‌زمان (مثلاً ثبت RFQ) همین ردیف را قفل می‌کند؛ هر کدام زودتر برسد برنده است
            .with_for_update(skip_locked=True)
        )
    ).all()
    keys = []
    for stored in files:
        keys.append(stored.storage_key)
        await db.delete(stored)
        audit.record(
            db,
            action="file.expired",
            entity_type="file",
            entity_id=stored.id,
            organization_id=stored.organization_id,
            data={"purpose": stored.purpose, "days": UNATTACHED_DAYS},
        )
    await db.commit()

    # محتوا پس از commit پاک می‌شود؛ اگر این‌جا خطا رخ دهد فقط یک فایل بی‌صاحب در فضای ذخیره می‌ماند
    storage = get_storage()
    storage_errors = 0
    for key in keys:
        try:
            await storage.delete(key)
        except Exception:
            storage_errors += 1
            logger.warning("could not delete expired file content %s", key, exc_info=True)
    return {"deleted": len(keys), "storage_errors": storage_errors}
