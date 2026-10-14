"""یکسان‌سازی متن فارسی.

کیبوردهای ویندوز معمولاً «ي» و «ك» عربی تایپ می‌کنند؛ بدون یکسان‌سازی، جستجوی
«آريا» نام «آریا» را پیدا نمی‌کند. همین نگاشت در ستون محاسبه‌شده‌ی `suppliers.search_text`
(SEARCH_TEXT_SQL در suppliers/models.py) هم اعمال شده است و باید هم‌خوان بماند.
"""

_ARABIC_TO_PERSIAN = str.maketrans({"ي": "ی", "ى": "ی", "ك": "ک"})
_SEARCH_MAP = str.maketrans({"ي": "ی", "ى": "ی", "ك": "ک", "‌": " "})

_FA_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")


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
