import uuid
from datetime import datetime

from app.core.schemas import CamelModel
from app.modules.files.content import FileKind, FilePurpose


class FileOut(CamelModel):
    id: uuid.UUID
    name: str
    size: int
    kind: FileKind
    purpose: FilePurpose
    created_at: datetime


class DownloadLinkOut(CamelModel):
    """`url` نسبی به آدرس API است (مثلاً `/files/download?token=...`) و چند دقیقه اعتبار دارد."""

    url: str
    expires_at: datetime
