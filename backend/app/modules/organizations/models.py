from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKey


class Organization(Base, UUIDPrimaryKey, TimestampMixin):
    """مستاجر (tenant): هر داده‌ی خصوصی به یک سازمان تعلق دارد.

    فعلاً هر کاربر هنگام ثبت‌نام یک سازمان دارد (نام شرکت، یا نام خودش)؛
    عضویت چندنفره و دعوت در فاز ۲ اضافه می‌شود.
    """

    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(String(200))
