import uuid
from datetime import datetime

from app.core.schemas import CamelModel


class NotificationOut(CamelModel):
    id: uuid.UUID
    kind: str
    title: str
    body: str
    # مسیر داخلی سایت؛ خالی یعنی بدون لینک
    link: str
    created_at: datetime
    read_at: datetime | None = None


class NotificationPage(CamelModel):
    items: list[NotificationOut]
    total: int
    unread: int
    limit: int
    offset: int


class UnreadCountOut(CamelModel):
    unread: int
