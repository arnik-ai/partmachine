"""
داده‌ی نمونه برای دمو — هم‌راستا با mock فرانت.

اجرا:  python -m app.seed
ایمن است: اگر داده موجود باشد، دوباره وارد نمی‌کند.
"""

import asyncio
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import SessionLocal, init_db
from app.models import Quotation, Rfq, Supplier, User


def _iso(days_from_now: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days_from_now)).strftime(
        "%Y-%m-%d"
    )


SUPPLIERS = [
    dict(
        company_name="صنایع دقیق‌تراش آریا",
        description="ماشین‌کاری CNC قطعات فلزی با دقت بالا، تخصص در قطعات خودرویی و نفت و گاز.",
        city="تهران",
        address="شهرک صنعتی شمس‌آباد",
        founded_year=1387,
        employee_count=45,
        capabilities=["cnc", "tooling", "heat_treatment"],
        machines=[
            {"name": "مرکز ماشین‌کاری ۵ محور", "model": "DMG MORI DMU 50", "count": 2},
            {"name": "تراش CNC", "model": "Doosan Lynx 2100", "count": 6},
        ],
        certifications=[
            {"title": "ISO 9001:2015", "issuer": "TUV Nord", "validUntil": "2027-03-01"},
            {"title": "IATF 16949", "issuer": "DQS", "validUntil": "2026-11-15"},
        ],
        production_capacity_per_month=12000,
        lead_time_days=14,
        completed_jobs=312,
        on_time_delivery_rate=0.96,
        response_time_hours=2,
        verified=True,
        quality_score=91,
        satisfaction_score=93,
        dispute_count=0,
        gallery_titles=["فلنج استیل ۳۰۴", "شفت CNC فولادی", "بوش برنجی"],
    ),
    dict(
        company_name="قالب‌سازان پیشرو اصفهان",
        description="طراحی و ساخت قالب تزریق پلاستیک و دایکاست، تولید انبوه قطعات پلیمری.",
        city="اصفهان",
        founded_year=1380,
        employee_count=80,
        capabilities=["injection_molding", "tooling", "plastic_manufacturing"],
        machines=[
            {"name": "تزریق پلاستیک ۴۰۰ تن", "model": "Haitian MA4000", "count": 5},
        ],
        certifications=[
            {"title": "ISO 9001:2015", "issuer": "SGS", "validUntil": "2026-09-20"},
        ],
        production_capacity_per_month=500000,
        lead_time_days=30,
        completed_jobs=198,
        on_time_delivery_rate=0.91,
        response_time_hours=5,
        verified=True,
        quality_score=86,
        satisfaction_score=88,
        dispute_count=1,
        gallery_titles=["قالب دو حفره‌ای بدنه", "قطعات ABS تولید انبوه"],
    ),
    dict(
        company_name="ریخته‌گری مدرن مشهد",
        description="ریخته‌گری چدن و آلومینیوم به روش ماسه‌ای و دایکاست، همراه با ماشین‌کاری نهایی.",
        city="مشهد",
        founded_year=1375,
        employee_count=110,
        capabilities=["casting", "cnc", "heat_treatment"],
        machines=[{"name": "خط قالب‌گیری اتوماتیک", "model": "DISA 130", "count": 1}],
        certifications=[
            {"title": "ISO 9001:2015", "issuer": "IMQ", "validUntil": "2027-01-10"},
        ],
        production_capacity_per_month=200000,
        lead_time_days=25,
        completed_jobs=421,
        on_time_delivery_rate=0.93,
        response_time_hours=8,
        verified=True,
        quality_score=89,
        satisfaction_score=90,
        dispute_count=0,
        gallery_titles=[],
    ),
    dict(
        company_name="تراشکاری امید قم",
        description="تراشکاری و فرزکاری قطعات سفارشی در تیراژ پایین، نمونه‌سازی سریع.",
        city="قم",
        founded_year=1398,
        employee_count=8,
        capabilities=["cnc", "welding"],
        machines=[{"name": "تراش CNC", "model": "TAKISAWA EX-110", "count": 2}],
        certifications=[],
        production_capacity_per_month=2000,
        lead_time_days=7,
        completed_jobs=67,
        on_time_delivery_rate=0.82,
        response_time_hours=1,
        verified=False,
        quality_score=70,
        satisfaction_score=78,
        dispute_count=2,
        gallery_titles=[],
    ),
    dict(
        company_name="فورج فولاد اراک",
        description="آهنگری گرم قطعات فولادی تا ۵۰ کیلوگرم، فلنج، شفت و قطعات راه‌سازی.",
        city="اراک",
        founded_year=1370,
        employee_count=150,
        capabilities=["forging", "heat_treatment", "cnc"],
        machines=[{"name": "پرس فورج ۱۶۰۰ تن", "model": "SMERAL LZK 1600", "count": 1}],
        certifications=[
            {"title": "ISO 9001:2015", "issuer": "TUV Nord", "validUntil": "2027-06-01"},
            {"title": "API Q1", "issuer": "API"},
        ],
        production_capacity_per_month=50000,
        lead_time_days=35,
        completed_jobs=502,
        on_time_delivery_rate=0.95,
        response_time_hours=12,
        verified=True,
        quality_score=92,
        satisfaction_score=91,
        dispute_count=0,
        gallery_titles=[],
    ),
]


async def seed() -> None:
    await init_db()
    async with SessionLocal() as db:
        existing = await db.scalar(select(User).limit(1))
        if existing is not None:
            print("داده از قبل موجود است — seed رد شد.")
            return

        # کاربر کارفرمای نمونه
        buyer = User(
            email="buyer@partmachine.ir",
            full_name="کارفرمای نمونه",
            hashed_password=hash_password("password123"),
            role="buyer",
            company_name="شرکت صنعتی نمونه",
        )
        db.add(buyer)
        await db.flush()

        suppliers: list[Supplier] = []
        for data in SUPPLIERS:
            s = Supplier(**data)
            suppliers.append(s)
            db.add(s)
        await db.flush()

        # یک RFQ نمونه برای کارفرما
        rfq = Rfq(
            buyer_id=buyer.id,
            title="ساخت ۵۰۰ عدد فلنج استیل ۳۰۴",
            description="فلنج طبق نقشه‌ی پیوست، قطر خارجی ۱۲۰ میلی‌متر، سوراخ‌کاری ۸ عدد M10.",
            capability="cnc",
            material="استیل 304",
            quantity=500,
            delivery_city="تهران",
            deadline=_iso(45),
            status="quoting",
            files=[
                {"name": "flange-drawing.pdf", "size": 845000, "kind": "pdf"},
                {"name": "flange-model.step", "size": 2400000, "kind": "cad"},
            ],
        )
        db.add(rfq)
        await db.flush()

        # چند استعلام از تأمین‌کننده‌های مختلف
        offers = [
            (suppliers[0], 1_850_000_000, 14, "تضمین تلرانس ±۰٫۰۲ میلی‌متر."),
            (suppliers[2], 1_620_000_000, 25, "قیمت رقابتی با ریخته‌گری دقیق."),
            (suppliers[3], 1_410_000_000, 21, "ارزان‌ترین پیشنهاد، بدون گواهینامه."),
            (suppliers[4], 2_050_000_000, 12, "سریع‌ترین تحویل، مناسب فوری."),
        ]
        for supplier, price, lead, note in offers:
            db.add(
                Quotation(
                    rfq_id=rfq.id,
                    supplier_id=supplier.id,
                    total_price_rials=price,
                    lead_time_days=lead,
                    valid_until=_iso(20),
                    note=note,
                )
            )

        await db.commit()
        print("seed با موفقیت انجام شد.")
        print("ورود نمونه:  buyer@partmachine.ir / password123")


if __name__ == "__main__":
    asyncio.run(seed())
