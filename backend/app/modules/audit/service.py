import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import request_id_var
from app.modules.audit.models import AuditEvent


def record(
    db: AsyncSession,
    *,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID | None = None,
    actor_user_id: uuid.UUID | None = None,
    organization_id: uuid.UUID | None = None,
    data: dict[str, Any] | None = None,
) -> None:
    """رویداد را در همان تراکنش عملیات اصلی ثبت می‌کند (commit با فراخواننده است)."""
    db.add(
        AuditEvent(
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            actor_user_id=actor_user_id,
            organization_id=organization_id,
            data=data or {},
            request_id=request_id_var.get(),
        )
    )
