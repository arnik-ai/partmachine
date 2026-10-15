"""Middleware سطح ASGI: request-id، محدودیت حجم بدنه، هدرهای امنیتی، لاگ دسترسی و
تبدیل هر خطای پیش‌بینی‌نشده به پاسخ 500 فارسی (بدون نشت جزئیات داخلی).
"""

import json
import logging
import re
import time
import uuid
from typing import Any

from fastapi import HTTPException
from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core import metrics
from app.core.errors import GENERIC_500, error_body
from app.core.logging import request_id_var

logger = logging.getLogger("partmachine.access")
error_logger = logging.getLogger("partmachine.errors")

_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
_TOO_LARGE = "حجم درخواست بیش از حد مجاز است."

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    # پاسخ‌های API ممکن است داده‌ی خصوصی کاربر/سازمان داشته باشند؛ هیچ cache مشترکی نگه ندارد
    "Cache-Control": "no-store",
}


class RequestContextMiddleware:
    def __init__(
        self,
        app: ASGIApp,
        max_body_bytes: int,
        *,
        upload_paths: tuple[str, ...] = (),
        upload_max_bytes: int = 0,
    ) -> None:
        self.app = app
        self.max_body_bytes = max_body_bytes
        # مسیر آپلود فایل سقف جداگانه دارد؛ خود endpoint هم سقف هر نوع فایل را اعمال می‌کند
        self.upload_paths = upload_paths
        self.upload_max_bytes = upload_max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope["headers"]}
        incoming = headers.get("x-request-id", "")
        request_id = incoming if _REQUEST_ID_RE.match(incoming) else uuid.uuid4().hex
        token = request_id_var.set(request_id)
        started = time.perf_counter()
        state: dict[str, Any] = {"status": 500, "started": False}

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                state["status"] = message["status"]
                state["started"] = True
                response_headers = MutableHeaders(scope=message)
                response_headers["X-Request-ID"] = request_id
                for name, value in SECURITY_HEADERS.items():
                    if name not in response_headers:
                        response_headers[name] = value
            await send(message)

        received = 0
        limit = (
            self.upload_max_bytes if scope.get("path") in self.upload_paths else self.max_body_bytes
        )

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    # FastAPI این HTTPException را بدون تغییر به handler خطا می‌رساند
                    raise HTTPException(status_code=413, detail=_TOO_LARGE)
            return message

        try:
            length = headers.get("content-length", "")
            if length.isdigit() and int(length) > limit:
                await self._send_json(
                    send_wrapper, 413, error_body(_TOO_LARGE, "payload_too_large")
                )
                return
            await self.app(scope, limited_receive, send_wrapper)
        except Exception:
            error_logger.exception("unhandled error")
            if not state["started"]:
                await self._send_json(send_wrapper, 500, error_body(GENERIC_500, "internal_error"))
        finally:
            duration_ms = round((time.perf_counter() - started) * 1000, 1)
            logger.info(
                "%s %s %s %sms",
                scope.get("method"),
                scope.get("path"),
                state["status"],
                duration_ms,
                extra={
                    "method": scope.get("method"),
                    "path": scope.get("path"),
                    "status": state["status"],
                    "duration_ms": duration_ms,
                    "event": "http_request",
                },
            )
            # شمارش با الگوی مسیر (نه آدرس واقعی) تا برچسب‌ها محدود بمانند؛ خود /metrics شمرده نمی‌شود
            if scope.get("path") != "/metrics":
                route = getattr(scope.get("route"), "path", None) or "unmatched"
                metrics.observe(
                    str(scope.get("method")), route, state["status"], duration_ms / 1000
                )
            request_id_var.reset(token)

    @staticmethod
    async def _send_json(send: Send, status: int, body: dict[str, Any]) -> None:
        payload = json.dumps(body, ensure_ascii=False).encode()
        await send(
            {
                "type": "http.response.start",
                "status": status,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(payload)).encode()),
                ],
            }
        )
        await send({"type": "http.response.body", "body": payload})
