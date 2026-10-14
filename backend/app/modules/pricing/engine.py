"""
موتور برآورد قیمت (روش استاندارد محاسبه‌ی هزینه REFA / VDI 3258).

  قیمت = مواد + (نرخ ساعتی ماشین × زمان کار) + سربار + سود + کارمزد پلتفرم
  زمان کار = زمان تنظیم + (زمان هر قطعه × ضریب پیچیدگی × تعداد)

منطق دقیقاً معادل نسخه‌ی فرانت (features/pricing) است؛ مرجع واحد در بک‌اند
تا داده‌ی نرخ‌ها قابل‌مدیریت و محافظت‌شده بماند.
"""

from __future__ import annotations

from app.core.text import fa_digits

# نرخ ساعتی ماشین (ریال) + زمان تنظیم (دقیقه) + زمان هر قطعه (دقیقه)
MACHINE_RATES: dict[str, dict] = {
    "cnc": {"hourly": 1_200_000, "setup": 90, "per_piece": 12},
    "injection_molding": {"hourly": 900_000, "setup": 240, "per_piece": 0.6},
    "sheet_metal": {"hourly": 850_000, "setup": 45, "per_piece": 5},
    "casting": {"hourly": 1_100_000, "setup": 180, "per_piece": 8},
    "welding": {"hourly": 700_000, "setup": 30, "per_piece": 15},
    "tooling": {"hourly": 1_500_000, "setup": 300, "per_piece": 40},
    "plastic_manufacturing": {"hourly": 800_000, "setup": 120, "per_piece": 0.8},
    "forging": {"hourly": 1_300_000, "setup": 150, "per_piece": 6},
    "heat_treatment": {"hourly": 600_000, "setup": 60, "per_piece": 3},
    "surface_treatment": {"hourly": 500_000, "setup": 40, "per_piece": 2},
}

# قیمت هر کیلوگرم (ریال) + جرم پیش‌فرض هر قطعه (کیلوگرم)
MATERIAL_INFO: dict[str, dict] = {
    "فولاد St37": {"price_kg": 420_000, "kg": 1.5},
    "فولاد CK45": {"price_kg": 520_000, "kg": 1.5},
    "استیل 304": {"price_kg": 1_350_000, "kg": 1.2},
    "استیل 316": {"price_kg": 1_950_000, "kg": 1.2},
    "آلومینیوم 6061": {"price_kg": 1_150_000, "kg": 0.6},
    "آلومینیوم 7075": {"price_kg": 1_850_000, "kg": 0.6},
    "برنج": {"price_kg": 4_200_000, "kg": 0.8},
    "مس": {"price_kg": 5_500_000, "kg": 0.8},
    "چدن": {"price_kg": 350_000, "kg": 2.0},
    "ABS": {"price_kg": 750_000, "kg": 0.15},
    "POM (پلی‌استال)": {"price_kg": 1_100_000, "kg": 0.15},
    "پلی‌آمید PA6": {"price_kg": 980_000, "kg": 0.15},
    "پلی‌اتیلن PE": {"price_kg": 620_000, "kg": 0.15},
    "سایر": {"price_kg": 800_000, "kg": 1.0},
}

COMPLEXITY_FACTORS = {"simple": 0.75, "normal": 1.0, "complex": 1.6}

OVERHEAD_RATE = 0.12
PROFIT_RATE = 0.15
PLATFORM_FEE_RATE = 0.05
RANGE_SPREAD = 0.15

_DEFAULT_MACHINE = {"hourly": 800_000, "setup": 60, "per_piece": 10}
_DEFAULT_MATERIAL = MATERIAL_INFO["سایر"]


def estimate_price(
    *,
    capability: str,
    material: str,
    quantity: int,
    complexity: str = "normal",
    kg_per_piece: float | None = None,
) -> dict:
    machine = MACHINE_RATES.get(capability, _DEFAULT_MACHINE)
    mat = MATERIAL_INFO.get(material, _DEFAULT_MATERIAL)
    qty = max(1, quantity)
    factor = COMPLEXITY_FACTORS.get(complexity, 1.0)
    kg = kg_per_piece if kg_per_piece is not None else mat["kg"]

    material_cost = round(qty * kg * mat["price_kg"] * 1.08)
    total_minutes = machine["setup"] + machine["per_piece"] * factor * qty
    total_hours = total_minutes / 60
    machine_cost = round(total_hours * machine["hourly"])

    making_cost = material_cost + machine_cost
    overhead = round(making_cost * OVERHEAD_RATE)
    before_profit = making_cost + overhead
    profit = round(before_profit * PROFIT_RATE)
    before_fee = before_profit + profit
    platform_fee = round(before_fee * PLATFORM_FEE_RATE)
    total = before_fee + platform_fee

    return {
        "unit_price_rials": round(total / qty),
        "total_price_rials": total,
        "range_low_rials": round(total * (1 - RANGE_SPREAD)),
        "range_high_rials": round(total * (1 + RANGE_SPREAD)),
        "total_hours": round(total_hours, 1),
        "components": [
            {
                "key": "material",
                "label": "مواد اولیه",
                "amount_rials": material_cost,
                "detail": f"{fa_digits(qty)} عدد × {fa_digits(kg)} کیلوگرم + ۸٪ پرت",
            },
            {
                "key": "machine",
                "label": "کار ماشین و دستمزد",
                "amount_rials": machine_cost,
                "detail": f"{fa_digits(round(total_hours, 1))} ساعت کار با نرخ ساعتی ماشین",
            },
            {
                "key": "overhead",
                "label": "سربار اداری و فروش",
                "amount_rials": overhead,
                "detail": "۱۲٪ هزینه‌ی ساخت",
            },
            {
                "key": "profit",
                "label": "سود مجری",
                "amount_rials": profit,
                "detail": "۱۵٪",
            },
            {
                "key": "platform_fee",
                "label": "کارمزد پلتفرم",
                "amount_rials": platform_fee,
                "detail": "۵٪",
            },
        ],
    }


def judge_quote_price(quoted_total: int, estimate: dict) -> dict:
    base = estimate["total_price_rials"]
    deviation = round((quoted_total - base) / base * 100)

    if quoted_total < estimate["range_low_rials"]:
        return {
            "verdict": "low",
            "deviation_percent": deviation,
            "message": f"حدود {fa_digits(abs(deviation))}٪ زیر برآورد منطقی — احتمال افت کیفیت",
        }
    if quoted_total > estimate["range_high_rials"]:
        return {
            "verdict": "high",
            "deviation_percent": deviation,
            "message": f"حدود {fa_digits(deviation)}٪ بالای برآورد منطقی — قیمت گران",
        }
    return {
        "verdict": "fair",
        "deviation_percent": deviation,
        "message": "در محدوده‌ی منطقی قیمت",
    }
