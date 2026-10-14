"""تبدیل تاریخ شمسی (برای متن قرارداد) با روزهای شناخته‌شده."""

from datetime import date

import pytest

from app.core.jalali import format_jalali, to_jalali


@pytest.mark.parametrize(
    ("gregorian", "jalali"),
    [
        (date(2024, 3, 20), (1403, 1, 1)),  # نوروز ۱۴۰۳
        (date(2025, 3, 21), (1404, 1, 1)),  # نوروز ۱۴۰۴
        (date(2026, 3, 21), (1405, 1, 1)),  # نوروز ۱۴۰۵
        (date(2026, 10, 14), (1405, 7, 22)),
        (date(2025, 3, 20), (1403, 12, 30)),  # ۱۴۰۳ کبیسه است
        (date(2026, 9, 22), (1405, 6, 31)),
        (date(2026, 9, 23), (1405, 7, 1)),
        (date(2000, 1, 1), (1378, 10, 11)),
    ],
)
def test_known_dates(gregorian: date, jalali: tuple[int, int, int]) -> None:
    assert to_jalali(gregorian) == jalali


def test_persian_format() -> None:
    assert format_jalali(date(2026, 10, 14)) == "۲۲ مهر ۱۴۰۵"
