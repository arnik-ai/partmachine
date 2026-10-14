"""چرخه‌ی وضعیت RFQ — تنها جایی که قواعد انتقال وضعیت تعریف می‌شود.

وضعیت ذخیره‌شده: `published` / `quoting` (باز)، `awarded`، `cancelled`.
وضعیت مؤثر (آنچه API نشان می‌دهد) از تاریخ و تعداد پیشنهادهای فعال محاسبه می‌شود؛ پس برای
«منقضی شدن» به هیچ کار زمان‌بندی‌شده‌ای نیاز نیست:

| ذخیره‌شده | شرط | وضعیت مؤثر |
|---|---|---|
| باز | تا پایان `quotes_due`، بدون پیشنهاد فعال | `published` |
| باز | تا پایان `quotes_due`، با پیشنهاد فعال (فقط برای مالک) | `quoting` |
| باز | پس از `quotes_due`، با پیشنهاد فعال | `evaluating` — کارفرما برنده را انتخاب می‌کند |
| باز | پس از `quotes_due`، بدون پیشنهاد فعال | `expired` |
| `awarded` / `cancelled` | — | همان |

برای غیرمالک، `quoting` به `published` تبدیل می‌شود تا وجود پیشنهاد رقبا لو نرود.
"""

from datetime import date

from app.modules.rfqs.models import OPEN_STATUSES, Rfq


def is_open(rfq: Rfq) -> bool:
    """هنوز برنده ندارد و لغو نشده است."""
    return rfq.status in OPEN_STATUSES


def accepts_quotes(rfq: Rfq, today: date) -> bool:
    """قطعه‌سازها می‌توانند پیشنهاد ثبت، ویرایش یا دوباره ثبت کنند."""
    return is_open(rfq) and today <= rfq.quotes_due


def can_award(rfq: Rfq) -> bool:
    # پس از پایان مهلت دریافت پیشنهاد هم کارفرما باید بتواند برنده را انتخاب کند
    return is_open(rfq)


def can_cancel(rfq: Rfq) -> bool:
    return is_open(rfq)


def can_reschedule(rfq: Rfq) -> bool:
    return is_open(rfq)


def effective_status(rfq: Rfq, *, active_quotes: int, today: date, viewer_is_owner: bool) -> str:
    if not is_open(rfq):
        return rfq.status
    if today <= rfq.quotes_due:
        return "quoting" if viewer_is_owner and active_quotes > 0 else "published"
    return "evaluating" if active_quotes > 0 else "expired"
