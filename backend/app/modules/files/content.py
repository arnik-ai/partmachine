"""قواعد هر نوع فایل و تشخیص نوع واقعی از روی محتوا (نه از روی نام یا هدر مرورگر)."""

import re
import struct
import unicodedata
from dataclasses import dataclass
from typing import Literal

from app.core.text import normalize_text

FilePurpose = Literal[
    "rfq_attachment", "verification_document", "portfolio_image", "order_document"
]
FileKind = Literal["pdf", "cad", "drawing", "image"]

MB = 1024 * 1024


@dataclass(frozen=True)
class PurposeRule:
    extensions: frozenset[str]
    max_bytes: int
    roles: frozenset[str]
    # مدارک و تصاویر پروفایل هویت سازمان‌اند: فقط مدیر سازمان آن‌ها را بارگذاری یا حذف می‌کند
    owner_only: bool = False


PURPOSES: dict[str, PurposeRule] = {
    "rfq_attachment": PurposeRule(
        frozenset({"pdf", "step", "stp", "stl", "dwg", "dxf", "png", "jpg", "jpeg"}),
        50 * MB,
        frozenset({"buyer", "agent"}),
    ),
    "verification_document": PurposeRule(
        frozenset({"pdf", "png", "jpg", "jpeg"}), 10 * MB, frozenset({"supplier"}), owner_only=True
    ),
    "portfolio_image": PurposeRule(
        frozenset({"png", "jpg", "jpeg", "webp"}), 5 * MB, frozenset({"supplier"}), owner_only=True
    ),
    # اسناد سفارش: بارنامه، رسید پرداخت، گزارش بازرسی و…؛ فقط طرف‌های همان سفارش می‌بینند
    "order_document": PurposeRule(
        frozenset({"pdf", "png", "jpg", "jpeg"}),
        10 * MB,
        frozenset({"buyer", "agent", "supplier", "qc"}),
    ),
}

# سقف تصاویر نمونه‌کار هر قطعه‌ساز
MAX_PORTFOLIO_IMAGES = 12

CONTENT_TYPES = {
    "pdf": "application/pdf",
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "webp": "image/webp",
}

_DWG = re.compile(rb"^AC10\d\d")


def extension(name: str) -> str:
    return name.rsplit(".", 1)[-1].lower() if "." in name else ""


def clean_filename(name: str) -> str:
    """فقط نام فایل (بدون مسیر و نویسه‌های کنترلی)، برای نمایش و دانلود."""
    base = name.replace("\\", "/").split("/")[-1]
    printable = "".join(ch for ch in base if unicodedata.category(ch)[0] != "C" or ch == "‌")
    cleaned = normalize_text(printable)[:255]
    return cleaned or "file"


def detect_kind(ext: str, head: bytes, size: int) -> FileKind | None:
    """اگر محتوا با پسوند هم‌خوان باشد نوع فایل را برمی‌گرداند؛ وگرنه None."""
    if ext == "pdf":
        return "pdf" if head.startswith(b"%PDF-") else None
    if ext == "png":
        return "image" if head.startswith(b"\x89PNG\r\n\x1a\n") else None
    if ext in ("jpg", "jpeg"):
        return "image" if head.startswith(b"\xff\xd8\xff") else None
    if ext == "webp":
        return "image" if head[:4] == b"RIFF" and head[8:12] == b"WEBP" else None
    if ext in ("step", "stp"):
        return "cad" if head.lstrip().startswith(b"ISO-10303-21") else None
    if ext == "stl":
        if head.lstrip()[:5].lower() == b"solid":
            return "cad"
        # STL دودویی: ۸۰ بایت سرآیند + تعداد مثلث‌ها + ۵۰ بایت برای هر مثلث
        if len(head) >= 84:
            (triangles,) = struct.unpack("<I", head[80:84])
            return "cad" if 84 + 50 * triangles == size else None
        return None
    if ext == "dwg":
        return "drawing" if _DWG.match(head) else None
    if ext == "dxf":
        if head.startswith(b"AutoCAD Binary DXF") or b"SECTION" in head[:2048]:
            return "drawing"
        return None
    return None
