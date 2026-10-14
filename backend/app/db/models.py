"""همه‌ی مدل‌ها را import می‌کند تا metadata کامل باشد (برای Alembic و تست‌ها)."""

from app.db.base import Base
from app.modules.audit.models import AuditEvent
from app.modules.identity.models import RefreshToken, User
from app.modules.organizations.models import Organization
from app.modules.quotations.models import Quotation
from app.modules.rfqs.models import Rfq
from app.modules.suppliers.models import Supplier

__all__ = [
    "AuditEvent",
    "Base",
    "Organization",
    "Quotation",
    "RefreshToken",
    "Rfq",
    "Supplier",
    "User",
]
