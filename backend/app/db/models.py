"""همه‌ی مدل‌ها را import می‌کند تا metadata کامل باشد (برای Alembic و تست‌ها)."""

from app.db.base import Base
from app.modules.agreements.models import AgreementAcceptance
from app.modules.audit.models import AuditEvent
from app.modules.contracts.models import Contract, ContractSignature, ContractVersion
from app.modules.disputes.models import OrderDispute
from app.modules.files.models import StoredFile
from app.modules.identity.models import RecoveryCode, RefreshToken, User
from app.modules.inspections.models import OrderInspection
from app.modules.notifications.models import Notification
from app.modules.orders.models import Order, OrderEvent, OrderReminder
from app.modules.organizations.models import Organization, OrganizationInvite
from app.modules.outbox.models import OutboxMessage
from app.modules.payments.models import OrderPayment
from app.modules.quotations.models import Quotation
from app.modules.ratings.models import OrderRating
from app.modules.rfqs.models import Rfq
from app.modules.suppliers.models import Supplier
from app.modules.verification.models import VerificationRequest

__all__ = [
    "AgreementAcceptance",
    "AuditEvent",
    "Contract",
    "ContractSignature",
    "ContractVersion",
    "Base",
    "Order",
    "OrderDispute",
    "OrderInspection",
    "OrderPayment",
    "OrderRating",
    "OrderEvent",
    "OrderReminder",
    "Notification",
    "Organization",
    "OrganizationInvite",
    "OutboxMessage",
    "Quotation",
    "RecoveryCode",
    "RefreshToken",
    "Rfq",
    "StoredFile",
    "Supplier",
    "User",
    "VerificationRequest",
]
