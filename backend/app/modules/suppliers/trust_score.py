"""
موتور امتیاز اعتماد (explainable) — منطق هم‌راستا با نسخه‌ی نمایشی فرانت.

ورودی‌ها: نرخ تحویل به‌موقع، کیفیت، رضایت، سرعت پاسخ، تعداد اختلاف.
خروجی: trust / risk / reliability / quality (۰–۱۰۰) + تفکیک قابل‌توضیح.
"""

from __future__ import annotations

from typing import Any


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
) -> dict[str, Any]:
    on_time = round(on_time_delivery_rate * 100)
    response_value = round(_clamp(100 - response_time_hours * 8))
    # هر اختلاف ۸ امتیاز ریسک اضافه می‌کند
    risk = round(_clamp(dispute_count * 8 + max(0, 80 - completed_jobs) * 0.1))
    dispute_value = round(_clamp(100 - risk))

    components: list[dict[str, Any]] = [
        {
            "key": "on_time_delivery",
            "label": "تحویل به‌موقع",
            "value": on_time,
            "weight": 0.25,
            "explanation": f"{on_time}٪ سفارش‌ها در موعد مقرر تحویل شده است",
        },
        {
            "key": "quality",
            "label": "کیفیت",
            "value": round(quality_score),
            "weight": 0.25,
            "explanation": "میانگین امتیاز کیفیت گزارش‌های QC و بازخورد خریداران",
        },
        {
            "key": "satisfaction",
            "label": "رضایت مشتری",
            "value": round(satisfaction_score),
            "weight": 0.20,
            "explanation": "میانگین امتیاز نظرات تأییدشده‌ی خریداران",
        },
        {
            "key": "response_speed",
            "label": "سرعت پاسخ‌گویی",
            "value": response_value,
            "weight": 0.15,
            "explanation": f"میانگین زمان پاسخ به استعلام: {response_time_hours:g} ساعت",
        },
        {
            "key": "dispute_history",
            "label": "سابقه‌ی اختلاف",
            "value": dispute_value,
            "weight": 0.15,
            "explanation": (
                "بدون اختلاف باز در ۱۲ ماه گذشته"
                if dispute_count == 0
                else f"{dispute_count} اختلاف ثبت‌شده در سابقه"
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
