"""
موتور امتیاز اعتماد (explainable) — منطق هم‌راستا با نسخه‌ی نمایشی فرانت.

ورودی‌ها: نرخ تحویل به‌موقع، کیفیت، رضایت، سرعت پاسخ، تعداد اختلاف.
خروجی: trust / risk / reliability / quality (۰–۱۰۰) + تفکیک قابل‌توضیح.

اگر سابقه‌ی واقعی (`record`) داده شود، توضیح هر جزء صادقانه از همان شمارش‌ها ساخته می‌شود
(مثلاً «۳ از ۴ سفارش در موعد تحویل شد» یا «هنوز امتیازی ثبت نشده؛ مقدار اولیه»).
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from app.core.text import fa_digits

if TYPE_CHECKING:
    from app.modules.suppliers.track_record import TrackRecord


def _clamp(value: float, low: float = 0, high: float = 100) -> float:
    return max(low, min(high, value))


def compute_trust_score(
    *,
    on_time_delivery_rate: float,
    quality_score: float,
    satisfaction_score: float,
    response_time_hours: float,
    dispute_count: int,
    completed_jobs: int,
    record: TrackRecord | None = None,
) -> dict[str, Any]:
    on_time = round(on_time_delivery_rate * 100)
    response_value = round(_clamp(100 - response_time_hours * 8))
    # هر اختلاف ۸ امتیاز ریسک اضافه می‌کند
    risk = round(_clamp(dispute_count * 8 + max(0, 80 - completed_jobs) * 0.1))
    dispute_value = round(_clamp(100 - risk))
    explain = _explanations(
        record, on_time, round(quality_score), round(satisfaction_score), response_time_hours
    )

    components: list[dict[str, Any]] = [
        {
            "key": "on_time_delivery",
            "label": "تحویل به‌موقع",
            "value": on_time,
            "weight": 0.25,
            "explanation": explain.get(
                "on_time_delivery", f"{on_time}٪ سفارش‌ها در موعد مقرر تحویل شده است"
            ),
        },
        {
            "key": "quality",
            "label": "کیفیت",
            "value": round(quality_score),
            "weight": 0.25,
            "explanation": explain.get(
                "quality", "میانگین امتیاز کیفیت گزارش‌های QC و بازخورد خریداران"
            ),
        },
        {
            "key": "satisfaction",
            "label": "رضایت مشتری",
            "value": round(satisfaction_score),
            "weight": 0.20,
            "explanation": explain.get("satisfaction", "میانگین امتیاز نظرات تأییدشده‌ی خریداران"),
        },
        {
            "key": "response_speed",
            "label": "سرعت پاسخ‌گویی",
            "value": response_value,
            "weight": 0.15,
            "explanation": explain.get(
                "response_speed", f"میانگین زمان پاسخ به استعلام: {response_time_hours:g} ساعت"
            ),
        },
        {
            "key": "dispute_history",
            "label": "سابقه‌ی اختلاف",
            "value": dispute_value,
            "weight": 0.15,
            "explanation": (
                "بدون اختلاف ثبت‌شده در پارت‌ماشین"
                if dispute_count == 0
                else f"{fa_digits(dispute_count)} مشکل اعلام‌شده از سوی کارفرماها در سابقه"
            ),
        },
    ]

    trust = round(sum(c["value"] * c["weight"] for c in components))
    reliability = round(on_time * 0.6 + dispute_value * 0.4)

    return {
        "trust": _clamp(trust),
        "risk": _clamp(risk),
        "reliability": _clamp(reliability),
        "quality": _clamp(round(quality_score)),
        "components": components,
    }


def _explanations(
    record: TrackRecord | None,
    on_time: int,
    quality: int,
    satisfaction: int,
    response_hours: float,
) -> dict[str, str]:
    """توضیح‌های صادقانه از سابقه‌ی واقعی؛ بدون سابقه، صریحاً «مقدار اولیه» گفته می‌شود."""
    if record is None:
        return {}
    initial = "تا ثبت سابقه‌ی واقعی، مقدار اولیه"
    texts = {
        "on_time_delivery": (
            f"{fa_digits(record.on_time_jobs)} از {fa_digits(record.delivered_jobs)} سفارش "
            "در موعد تحویل شد"
            if record.delivered_jobs
            else f"هنوز سفارشی در پارت‌ماشین تحویل نشده؛ {initial} ({fa_digits(on_time)}٪)"
        ),
        "quality": (
            f"{fa_digits(record.first_pass_jobs)} از {fa_digits(record.inspected_jobs)} بازرسی "
            "کیفیت در نوبت اول قبول شد"
            if record.inspected_jobs
            else f"هنوز بازرسی کیفیتی ثبت نشده؛ {initial} ({fa_digits(quality)})"
        ),
        "satisfaction": (
            f"میانگین {_fa_decimal(f'{record.rating_average:.1f}')} از ۵ در "
            f"{fa_digits(record.rating_count)} امتیاز کارفرماها"
            if record.rating_average is not None
            else f"هنوز امتیازی از کارفرماها ثبت نشده؛ {initial} ({fa_digits(satisfaction)})"
        ),
        "response_speed": (
            f"میانگین فاصله‌ی انتشار درخواست تا پیشنهاد در {fa_digits(record.responses_count)} "
            f"پیشنهاد: {_fa_decimal(f'{response_hours:g}')} ساعت"
            if record.responses_count
            else f"هنوز پیشنهادی ثبت نشده؛ {initial} ({_fa_decimal(f'{response_hours:g}')} ساعت)"
        ),
    }
    return texts


def _fa_decimal(value: str) -> str:
    """عدد اعشاری با ارقام و ممیز فارسی (۴٫۵)."""
    return fa_digits(value).replace(".", "٫")
