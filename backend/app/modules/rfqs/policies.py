"""قواعد دسترسی به RFQ — تنها مرجع تصمیم «چه کسی چه چیزی را می‌بیند».

- سازمان صاحب درخواست (و ادمین): دسترسی کامل.
- قطعه‌ساز واردشده: فقط خلاصه‌ی RFQهایی که هنوز پیشنهاد می‌پذیرند (بدون فایل‌ها و تعداد
  پیشنهادها)، یا RFQی که خودش برایش پیشنهاد داده است (تا نتیجه را ببیند).
- بقیه: «پیدا نشد» (404) تا وجود رکورد هم لو نرود.
"""

from datetime import date
from enum import Enum

from app.modules.identity.deps import CurrentUser
from app.modules.rfqs import lifecycle
from app.modules.rfqs.models import Rfq


class RfqView(Enum):
    FULL = "full"
    SUMMARY = "summary"
    NONE = "none"


def is_owner(rfq: Rfq, user: CurrentUser) -> bool:
    return rfq.organization_id == user.organization_id


def rfq_view(rfq: Rfq, user: CurrentUser, *, has_quoted: bool, today: date) -> RfqView:
    if user.is_admin or is_owner(rfq, user):
        return RfqView.FULL
    if user.role == "supplier" and (lifecycle.accepts_quotes(rfq, today) or has_quoted):
        return RfqView.SUMMARY
    return RfqView.NONE


def can_manage(rfq: Rfq, user: CurrentUser) -> bool:
    """انتخاب برنده، لغو و تغییر مهلت: فقط سازمان مالک یا ادمین."""
    return user.is_admin or is_owner(rfq, user)
