"""یکسان‌سازی متن فارسی.

کیبوردهای ویندوز معمولاً «ي» و «ك» عربی تایپ می‌کنند؛ بدون یکسان‌سازی، جستجوی
«آريا» نام «آریا» را پیدا نمی‌کند. همین نگاشت در ستون محاسبه‌شده‌ی `suppliers.search_text`
(SEARCH_TEXT_SQL در suppliers/models.py) هم اعمال شده است و باید هم‌خوان بماند.
"""

_AR_LETTERS = "يىك"  # ي ى ك (عربی)
_FA_LETTERS = "ییک"  # ی ی ک (فارسی)


def search_text_sql(expr: str) -> str:
    """عبارت SQL ستون جستجوی یکسان‌شده؛ باید با normalize_search هم‌خوان بماند."""
    return f"translate(lower({expr}), '{_AR_LETTERS}' || chr(8204), '{_FA_LETTERS} ')"


_ARABIC_TO_PERSIAN = str.maketrans({"ي": "ی", "ى": "ی", "ك": "ک"})
_SEARCH_MAP = str.maketrans({"ي": "ی", "ى": "ی", "ك": "ک", "‌": " "})

_FA_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")
_ASCII_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


def normalize_text(value: str) -> str:
    """برای ذخیره‌ی ورودی کاربر: حروف عربی به فارسی + حذف فاصله‌ی ابتدا و انتها."""
    return value.translate(_ARABIC_TO_PERSIAN).strip()


def normalize_search(value: str) -> str:
    """برای جستجو: مثل ستون search_text (حروف کوچک، ی/ک فارسی، نیم‌فاصله ← فاصله)."""
    return value.lower().translate(_SEARCH_MAP).strip()


def escape_like(value: str) -> str:
    """کاراکترهای ویژه‌ی LIKE را خنثی می‌کند (با escape='\\')."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def fa_digits(value: object) -> str:
    return str(value).translate(_FA_DIGITS)


def ascii_digits(value: str) -> str:
    """ارقام فارسی و عربی را به ارقام لاتین تبدیل می‌کند (مثلاً برای شماره تلفن)."""
    return value.translate(_ASCII_DIGITS)
