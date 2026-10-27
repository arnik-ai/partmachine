"""فایل‌های خصوصی: آپلود با بررسی محتوای واقعی، حذف پیش از پیوست، و لینک دانلود کوتاه‌عمر
با بررسی دسترسی (پیوست RFQ برای قطعه‌ساز فقط اگر تأییدشده باشد و NDA همان RFQ را پذیرفته باشد).

آپلود دو سقف دارد: حجم بارگذاری هر سازمان در ۲۴ ساعت (`STORAGE_ORG_DAILY_BYTES`، شمارش دقیق حتی با آپلودهای
هم‌زمان) و، روی دیسک محلی، فضای آزاد لازم (`STORAGE_MIN_FREE_BYTES`)؛ تا چند حساب یک‌بارمصرف نتوانند دیسکِ
پایگاه داده را پر کنند."""

import logging
import re
import uuid
from collections.abc import AsyncIterator
from datetime import timedelta
from urllib.parse import quote

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import rate_limit
from app.core.config import settings
from app.core.errors import AppError, Conflict, Forbidden, NotFound, field_error
from app.core.security import create_signed_token, decode_signed_token
from app.core.storage import FileTooLarge, get_storage
from app.core.text import fa_digits
from app.core.time import utcnow
from app.modules.agreements import service as agreements
from app.modules.agreements.catalog import INSPECTION_NDA
from app.modules.audit import service as audit
from app.modules.files.content import (
    CONTENT_TYPES,
    MAX_PORTFOLIO_IMAGES,
    MB,
    PURPOSES,
    FilePurpose,
    clean_filename,
    detect_kind,
    extension,
)
from app.modules.files.models import StoredFile
from app.modules.files.schemas import DownloadLinkOut, FileOut
from app.modules.identity.deps import CurrentUser
from app.modules.orders import service as orders
from app.modules.rfqs import service as rfq_service
from app.modules.rfqs.policies import RfqView
from app.modules.suppliers.models import Supplier

logger = logging.getLogger("partmachine.files")

DOWNLOAD_TOKEN = "file_download"
FILE_NOT_FOUND = "فایل موردنظر پیدا نشد."
DISK_FULL = (
    "فضای ذخیره‌سازی سرور موقتاً پر است و فایل تازه پذیرفته نمی‌شود. لطفاً کمی بعد دوباره تلاش کنید."
)
LINK_INVALID = "لینک دانلود معتبر نیست یا منقضی شده است؛ دوباره روی «دانلود» بزنید."
OWNER_ONLY = "فقط مدیر سازمان می‌تواند مدارک و تصاویر پروفایل شرکت را تغییر دهد."
ATTACHED = {
    "rfq_attachment": "فایل پیوستِ یک درخواست ثبت‌شده را نمی‌توان حذف کرد.",
    "verification_document": "مدرکی که برای بررسی ارسال شده است را نمی‌توان حذف کرد.",
    "order_document": "سندی که در تاریخچه‌ی سفارش ثبت شده است را نمی‌توان حذف کرد.",
}


# سقف حجم بارگذاری هر سازمان در یک پنجره‌ی چرخان ۲۴ ساعته: جلوی پر کردن دیسک با حساب‌های یک‌بارمصرف را
# می‌گیرد، ولی شرکتی را که در طول زمان فایل زیاد دارد (فایل پیوست‌شده حذف‌شدنی نیست) برای همیشه نمی‌بندد.
# سقف کل هر شرکت (مثلاً در طرح‌های اشتراک) تصمیم کسب‌وکاری است و این‌جا ساخته نمی‌شود.
QUOTA_WINDOW = timedelta(hours=24)


async def _uploaded_recently(db: AsyncSession, organization_id: uuid.UUID) -> int:
    used = await db.scalar(
        select(func.coalesce(func.sum(StoredFile.size_bytes), 0)).where(
            StoredFile.organization_id == organization_id,
            StoredFile.created_at >= utcnow() - QUOTA_WINDOW,
        )
    )
    return int(used or 0)


def _quota_full() -> AppError:
    quota = settings.storage_org_daily_bytes
    size = (
        f"{fa_digits(quota // 1024**3)} گیگابایت"
        if quota >= 1024**3
        else f"{fa_digits(quota // MB)} مگابایت"
    )
    return AppError(
        f"سقف بارگذاری شرکت شما در ۲۴ ساعت ({size}) پر شده است. چند ساعت بعد دوباره تلاش کنید یا با"
        " پشتیبانی تراشینو تماس بگیرید.",
        code="storage_quota_exceeded",
        status_code=429,
    )


def to_out(stored: StoredFile) -> FileOut:
    return FileOut(
        id=stored.id,
        name=stored.original_name,
        size=stored.size_bytes,
        kind=stored.kind,
        purpose=stored.purpose,
        created_at=stored.created_at,
    )


async def upload(
    db: AsyncSession,
    user: CurrentUser,
    *,
    purpose: FilePurpose,
    name: str,
    chunks: AsyncIterator[bytes],
) -> FileOut:
    rule = PURPOSES[purpose]
    if user.role not in rule.roles and not user.is_admin:
        raise Forbidden("نقش کاربری شما اجازه‌ی بارگذاری این نوع فایل را ندارد.")
    if rule.owner_only and not user.is_org_owner and not user.is_admin:
        raise Forbidden(OWNER_ONLY, code="not_org_owner")
    await rate_limit.hit(rate_limit.UPLOADS_PER_USER, str(user.id))

    filename = clean_filename(name)
    ext = extension(filename)
    if ext not in rule.extensions:
        allowed = "، ".join(sorted(rule.extensions))
        raise field_error("file", f"این نوع فایل پذیرفته نمی‌شود. نوع‌های مجاز: {allowed}")

    file_id = uuid.uuid4()
    key = f"{user.organization_id}/{file_id}"
    storage = get_storage()
    free = storage.free_bytes()
    if free is not None and free - rule.max_bytes < settings.storage_min_free_bytes:
        logger.error("ALERT storage disk almost full (%s MB free); uploads refused", free // MB)
        raise AppError(DISK_FULL, code="storage_full", status_code=507)
    # بررسی سریع پیش از دریافت فایل؛ شمارش دقیق پس از دریافت، زیر قفل همین سازمان انجام می‌شود
    if await _uploaded_recently(db, user.organization_id) >= settings.storage_org_daily_bytes:
        raise _quota_full()
    # دریافت یک فایل ۵۰ مگابایتی روی اینترنت کند ممکن است دقیقه‌ها طول بکشد؛ اتصال پایگاه داده (که از
    # بررسی کاربر باز مانده) در این مدت به استخر برمی‌گردد تا چند آپلود هم‌زمان استخر را خالی نکنند
    await db.commit()
    try:
        written = await storage.write(key, chunks, max_bytes=rule.max_bytes)
    except FileTooLarge:
        raise AppError(
            f"حجم فایل بیش از {fa_digits(rule.max_bytes // MB)} مگابایت است.",
            code="file_too_large",
            status_code=413,
        ) from None
    free = storage.free_bytes()
    if free is not None and free < settings.storage_min_free_bytes // 2:
        # چند آپلود هم‌زمان با هم از ذخیره‌ی فضای آزاد گذشتند؛ این فایل نگه داشته نمی‌شود
        await storage.delete(key)
        logger.error("ALERT storage disk almost full (%s MB free); upload discarded", free // MB)
        raise AppError(DISK_FULL, code="storage_full", status_code=507)
    # آپلودهای هم‌زمان یک سازمان این‌جا پشت سر هم شمرده می‌شوند (قفل تا commit همین تراکنش)، پس با هم از
    # سقف رد نمی‌شوند
    await db.execute(
        select(func.pg_advisory_xact_lock(func.hashtext(f"upload-quota:{user.organization_id}")))
    )
    if (
        await _uploaded_recently(db, user.organization_id) + written.size
        > settings.storage_org_daily_bytes
    ):
        await storage.delete(key)
        raise _quota_full()

    kind = detect_kind(ext, written.head, written.size) if written.size else None
    if kind is None:
        await storage.delete(key)
        raise field_error(
            "file",
            "فایل خالی است."
            if written.size == 0
            else "محتوای فایل با نوع آن هم‌خوان نیست یا فایل خراب است.",
        )
    if purpose == "portfolio_image" and await _portfolio_full(db, user.organization_id):
        await storage.delete(key)
        raise Conflict(
            f"حداکثر {fa_digits(MAX_PORTFOLIO_IMAGES)} تصویر نمونه‌کار مجاز است؛"
            " برای افزودن، یکی از تصاویر قبلی را حذف کنید.",
            code="portfolio_full",
        )

    # عکس پروفایل یکی است: عکس تازه جای قبلی را می‌گیرد
    replaced = (
        list(
            await db.scalars(
                select(StoredFile).where(
                    StoredFile.organization_id == user.organization_id,
                    StoredFile.purpose == "logo",
                )
            )
        )
        if purpose == "logo"
        else []
    )
    stored = StoredFile(
        id=file_id,
        organization_id=user.organization_id,
        uploaded_by_id=user.id,
        purpose=purpose,
        kind=kind,
        original_name=filename,
        content_type=CONTENT_TYPES.get(ext, "application/octet-stream"),
        size_bytes=written.size,
        sha256=written.sha256,
        storage_key=key,
        created_at=utcnow(),
    )
    db.add(stored)
    for old in replaced:
        await db.delete(old)
    details: dict[str, object] = {"purpose": purpose, "kind": kind, "size": written.size}
    if replaced:
        details["replaced"] = [str(old.id) for old in replaced]
    audit.record(
        db,
        action="file.uploaded",
        entity_type="file",
        entity_id=file_id,
        actor_user_id=user.id,
        organization_id=user.organization_id,
        data=details,
    )
    try:
        await db.commit()
    except Exception:
        await storage.delete(key)  # فایل یتیم نماند
        raise
    for old in replaced:
        await storage.delete(old.storage_key)
    return to_out(stored)


async def _portfolio_full(db: AsyncSession, organization_id: uuid.UUID) -> bool:
    # قفل ردیف پروفایل تا بارگذاری‌های هم‌زمان یکی‌یکی شمرده شوند و از سقف نگذرند
    await db.execute(
        select(Supplier.id).where(Supplier.organization_id == organization_id).with_for_update()
    )
    count = await db.scalar(
        select(func.count())
        .select_from(StoredFile)
        .where(
            StoredFile.organization_id == organization_id,
            StoredFile.purpose == "portfolio_image",
        )
    )
    return (count or 0) >= MAX_PORTFOLIO_IMAGES


async def delete_unattached(db: AsyncSession, user: CurrentUser, file_id: uuid.UUID) -> None:
    """فایلی که هنوز به جایی پیوست نشده (مثلاً از فرم RFQ برداشته شده) یا تصویر نمونه‌کار حذف
    می‌شود؛ پیوست RFQ ثبت‌شده و مدرک ارسال‌شده برای بررسی ماندگارند."""
    stored = await db.get(StoredFile, file_id)
    if stored is None or stored.organization_id != user.organization_id:
        raise NotFound(FILE_NOT_FOUND)
    if PURPOSES[stored.purpose].owner_only and not user.is_org_owner:
        raise Forbidden(OWNER_ONLY, code="not_org_owner")
    if stored.is_attached:
        raise Conflict(ATTACHED[stored.purpose], code="file_attached")
    key = stored.storage_key
    await db.delete(stored)
    audit.record(
        db,
        action="file.deleted",
        entity_type="file",
        entity_id=file_id,
        actor_user_id=user.id,
        organization_id=user.organization_id,
        data={"purpose": stored.purpose},
    )
    await db.commit()
    await get_storage().delete(key)


async def _authorize_download(db: AsyncSession, user: CurrentUser, stored: StoredFile) -> None:
    if stored.purpose == "rfq_attachment":
        if stored.rfq_id is None:
            if stored.organization_id != user.organization_id:
                raise NotFound(FILE_NOT_FOUND)
            return
        # آزمایشگاه بازرسی سفارشِ همین RFQ: پس از پذیرش تعهد عدم افشای مخصوص آزمایشگاه
        if user.role == "qc" and await orders.lab_has_rfq(db, user.organization_id, stored.rfq_id):
            if not await agreements.has_accepted_rfq_nda(
                db, user.organization_id, stored.rfq_id, agreement=INSPECTION_NDA
            ):
                raise Forbidden(
                    "برای دانلود فایل‌های این سفارش ابتدا تعهد عدم افشا را بپذیرید.",
                    code="nda_required",
                )
            return
        rfq, view = await rfq_service.load_visible(db, user, stored.rfq_id)
        if view is RfqView.SUMMARY:
            # هنگام ساخت هر لینک دوباره سنجیده می‌شود، پس لغو تأیید هویت دسترسی را فوراً قطع می‌کند
            # (برنده‌ی همین RFQ استثناست: کارفرما او را برای ساخت انتخاب کرده است)
            if not await rfq_service.may_receive_drawings(db, user, rfq):
                raise Forbidden(rfq_service.FILES_NEED_VERIFICATION, code="supplier_not_verified")
            if not await agreements.has_accepted_rfq_nda(db, user.organization_id, rfq.id):
                raise Forbidden(
                    "برای دانلود فایل‌های این درخواست ابتدا تعهد عدم افشا را بپذیرید.",
                    code="nda_required",
                )
        return
    if stored.purpose == "verification_document":
        if not (user.is_admin or stored.organization_id == user.organization_id):
            raise NotFound(FILE_NOT_FOUND)
        return
    if stored.purpose == "order_document":
        # سند خود سازمان (مثلاً گزارش آزمایشگاه یا رسید کارفرما) همیشه برای خودش در دسترس است
        if stored.organization_id == user.organization_id:
            return
        if stored.order_id is None:
            raise NotFound(FILE_NOT_FOUND)
        # فقط طرف‌های همان سفارش (و ادمین)؛ بقیه، از جمله آزمایشگاه، 404
        await orders.load(db, user, stored.order_id)
        return
    # portfolio_image: تصویر عمومی پروفایل قطعه‌ساز


async def create_download_link(
    db: AsyncSession, user: CurrentUser, file_id: uuid.UUID
) -> DownloadLinkOut:
    stored = await db.get(StoredFile, file_id)
    if stored is None:
        raise NotFound(FILE_NOT_FOUND)
    await _authorize_download(db, user, stored)
    ttl = timedelta(seconds=settings.download_link_ttl_seconds)
    token = create_signed_token(
        subject=str(stored.id), token_type=DOWNLOAD_TOKEN, ttl=ttl, extra={"uid": str(user.id)}
    )
    audit.record(
        db,
        action="file.downloaded",
        entity_type="file",
        entity_id=stored.id,
        actor_user_id=user.id,
        organization_id=user.organization_id,
        data={"rfq_id": str(stored.rfq_id) if stored.rfq_id else None, "purpose": stored.purpose},
    )
    await db.commit()
    return DownloadLinkOut(url=f"/files/download?token={token}", expires_at=utcnow() + ttl)


async def open_download(db: AsyncSession, token: str) -> tuple[StoredFile, AsyncIterator[bytes]]:
    payload = decode_signed_token(token, DOWNLOAD_TOKEN)
    if payload is None:
        raise NotFound(LINK_INVALID, code="download_link_invalid")
    try:
        file_id = uuid.UUID(str(payload["sub"]))
    except ValueError:
        raise NotFound(LINK_INVALID, code="download_link_invalid") from None
    stored = await db.get(StoredFile, file_id)
    if stored is None:
        raise NotFound(LINK_INVALID, code="download_link_invalid")
    return stored, get_storage().read(stored.storage_key)


def content_disposition(name: str) -> str:
    """پیوست اجباری، با نام فارسی سالم (RFC 6266) و نام جایگزین ASCII برای مرورگرهای قدیمی."""
    fallback = re.sub(r"[^A-Za-z0-9._-]", "_", name)
    if not re.search(r"[A-Za-z0-9]", fallback.rsplit(".", 1)[0]):
        fallback = f"file.{extension(name) or 'bin'}"
    return f"attachment; filename=\"{fallback}\"; filename*=UTF-8''{quote(name)}"
