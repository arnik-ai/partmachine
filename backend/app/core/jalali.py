"""تبدیل تاریخ میلادی به شمسی برای متن‌هایی که سرور می‌سازد (مثلاً قرارداد).

الگوریتم محاسباتی رایج (همان روش jalaali-js)؛ برای بازه‌ی سال‌های امروزی دقیق است و با تست
روزهای شناخته‌شده (مثلاً نوروز) بررسی می‌شود. نمایش تاریخ در رابط کاربری با Intl مرورگر است.
"""

from datetime import date

from app.core.text import fa_digits

MONTHS = (
    "فروردین",
    "اردیبهشت",
    "خرداد",
    "تیر",
    "مرداد",
    "شهریور",
    "مهر",
    "آبان",
    "آذر",
    "دی",
    "بهمن",
    "اسفند",
)
_DAYS_BEFORE_MONTH = (0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334)


def to_jalali(value: date) -> tuple[int, int, int]:
    gy, gm, gd = value.year, value.month, value.day
    gy2 = gy + 1 if gm > 2 else gy
    days = (
        355666
        + 365 * gy
        + (gy2 + 3) // 4
        - (gy2 + 99) // 100
        + (gy2 + 399) // 400
        + gd
        + _DAYS_BEFORE_MONTH[gm - 1]
    )
    jy = -1595 + 33 * (days // 12053)
    days %= 12053
    jy += 4 * (days // 1461)
    days %= 1461
    if days > 365:
        jy += (days - 1) // 365
        days = (days - 1) % 365
    if days < 186:
        return jy, 1 + days // 31, 1 + days % 31
    return jy, 7 + (days - 186) // 30, 1 + (days - 186) % 30


def format_jalali(value: date) -> str:
    """مثلاً «۲۲ مهر ۱۴۰۵»."""
    jy, jm, jd = to_jalali(value)
    return f"{fa_digits(jd)} {MONTHS[jm - 1]} {fa_digits(jy)}"
