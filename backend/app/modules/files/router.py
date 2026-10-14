"""مسیرهای فایل: آپلود (بدنه‌ی خام فایل)، حذف پیش از پیوست، ساخت لینک دانلود و دانلود با لینک."""

import uuid

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.files import service
from app.modules.files.content import FilePurpose
from app.modules.files.schemas import DownloadLinkOut, FileOut
from app.modules.identity.deps import CurrentUser, get_current_user

router = APIRouter(prefix="/files", tags=["files"])


@router.post(
    "",
    response_model=FileOut,
    status_code=201,
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "application/octet-stream": {"schema": {"type": "string", "format": "binary"}}
            },
        }
    },
)
async def upload_file(
    request: Request,
    purpose: FilePurpose = Query(),
    name: str = Query(min_length=1, max_length=255),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FileOut:
    """بدنه‌ی درخواست خود فایل است (نه multipart)؛ نوع واقعی از روی محتوا بررسی می‌شود."""
    return await service.upload(db, user, purpose=purpose, name=name, chunks=request.stream())


@router.get("/download", response_class=StreamingResponse)
async def download_file(
    token: str = Query(min_length=20, max_length=2000), db: AsyncSession = Depends(get_db)
) -> StreamingResponse:
    stored, stream = await service.open_download(db, token)
    return StreamingResponse(
        stream,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": service.content_disposition(stored.original_name),
            "Content-Length": str(stored.size_bytes),
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "sandbox",
        },
    )


@router.delete("/{file_id}", status_code=204)
async def delete_file(
    file_id: uuid.UUID,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await service.delete_unattached(db, user, file_id)
    return Response(status_code=204)


@router.post("/{file_id}/link", response_model=DownloadLinkOut)
async def create_download_link(
    file_id: uuid.UUID,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DownloadLinkOut:
    return await service.create_download_link(db, user, file_id)
