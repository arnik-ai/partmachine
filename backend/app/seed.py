"""
داده‌ی نمونه برای توسعه‌ی محلی و دمو — فقط در محیط development و test اجرا می‌شود.

اجرا (از پوشه‌ی backend، پس از `alembic upgrade head`):
    python -m app.seed

ایمن و تکرارپذیر است: اگر داده موجود باشد دوباره وارد نمی‌کند.
رمز حساب‌های نمونه از متغیر SEED_PASSWORD خوانده می‌شود (پیش‌فرض فقط برای توسعه).
"""

import asyncio
import os
import uuid
from datetime import timedelta

from sqlalchemy import select

from app.core.config import settings
from app.core.security import hash_password
from app.core.time import business_today
from app.db.session import SessionLocal, engine
from app.modules.identity.models import User
from app.modules.organizations.models import Organization
from app.modules.quotations.models import Quotation
from app.modules.rfqs.models import Rfq
from app.modules.suppliers.models import Supplier

DEV_SEED_PASSWORD = "PartMachine-dev-1234"
BUYER_EMAIL = "buyer@partmachine.ir"
SUPPLIER_EMAIL = "supplier@partmachine.ir"

# سابقه (پروژه‌ی تکمیل‌شده، تحویل به‌موقع، امتیازها) ساختگی ساخته نمی‌شود؛ از سفارش‌های واقعی
# می‌آید (O12) و تا آن موقع مقدار اولیه نمایش داده می‌شود
SUPPLIERS = [
    {
        "company_name": "صنایع دقیق‌تراش آریا",
        "description": "ماشین‌کاری CNC قطعات فلزی با دقت بالا، تخصص در قطعات خودرویی و نفت و گاز.",
        "city": "تهران",
        "address": "شهرک صنعتی شمس‌آباد",
        "founded_year": 1387,
        "employee_count": 45,
        "capabilities": ["cnc", "tooling", "heat_treatment"],
        "machines": [
            {"name": "مرکز ماشین‌کاری ۵ محور", "model": "DMG MORI DMU 50", "count": 2},
            {"name": "تراش CNC", "model": "Doosan Lynx 2100", "count": 6},
        ],
        "certifications": [
            {"title": "ISO 9001:2015", "issuer": "TUV Nord", "validUntil": "2027-03-01"},
            {"title": "IATF 16949", "issuer": "DQS", "validUntil": "2026-11-15"},
        ],
        "production_capacity_per_month": 12000,
        "lead_time_days": 14,
        "verified": True,
        "gallery_titles": ["فلنج استیل ۳۰۴", "شفت CNC فولادی", "بوش برنجی"],
    },
    {
        "company_name": "قالب‌سازان پیشرو اصفهان",
        "description": "طراحی و ساخت قالب تزریق پلاستیک و دایکاست، تولید انبوه قطعات پلیمری.",
        "city": "اصفهان",
        "founded_year": 1380,
        "employee_count": 80,
        "capabilities": ["injection_molding", "tooling", "plastic_manufacturing"],
        "machines": [
            {"name": "تزریق پلاستیک ۴۰۰ تن", "model": "Haitian MA4000", "count": 5},
        ],
        "certifications": [
            {"title": "ISO 9001:2015", "issuer": "SGS", "validUntil": "2026-09-20"},
        ],
        "production_capacity_per_month": 500000,
        "lead_time_days": 30,
        "verified": True,
        "gallery_titles": ["قالب دو حفره‌ای بدنه", "قطعات ABS تولید انبوه"],
    },
    {
        "company_name": "ریخته‌گری مدرن مشهد",
        "description": "ریخته‌گری چدن و آلومینیوم به روش ماسه‌ای و دایکاست، همراه با ماشین‌کاری نهایی.",
        "city": "مشهد",
        "founded_year": 1375,
        "employee_count": 110,
        "capabilities": ["casting", "cnc", "heat_treatment"],
        "machines": [{"name": "خط قالب‌گیری اتوماتیک", "model": "DISA 130", "count": 1}],
        "certifications": [
            {"title": "ISO 9001:2015", "issuer": "IMQ", "validUntil": "2027-01-10"},
        ],
        "production_capacity_per_month": 200000,
        "lead_time_days": 25,
        "verified": True,
        "gallery_titles": [],
    },
    {
        "company_name": "تراشکاری امید قم",
        "description": "تراشکاری و فرزکاری قطعات سفارشی در تیراژ پایین، نمونه‌سازی سریع.",
        "city": "قم",
        "founded_year": 1398,
        "employee_count": 8,
        "capabilities": ["cnc", "welding"],
        "machines": [{"name": "تراش CNC", "model": "TAKISAWA EX-110", "count": 2}],
        "certifications": [],
        "production_capacity_per_month": 2000,
        "lead_time_days": 7,
        "verified": False,
        "gallery_titles": [],
    },
    {
        "company_name": "فورج فولاد اراک",
        "description": "آهنگری گرم قطعات فولادی تا ۵۰ کیلوگرم، فلنج، شفت و قطعات راه‌سازی.",
        "city": "اراک",
        "founded_year": 1370,
        "employee_count": 150,
        "capabilities": ["forging", "heat_treatment", "cnc"],
        "machines": [{"name": "پرس فورج ۱۶۰۰ تن", "model": "SMERAL LZK 1600", "count": 1}],
        "certifications": [
            {"title": "ISO 9001:2015", "issuer": "TUV Nord", "validUntil": "2027-06-01"},
            {"title": "API Q1", "issuer": "API"},
        ],
        "production_capacity_per_month": 50000,
        "lead_time_days": 35,
        "verified": True,
        "gallery_titles": [],
    },
]


async def seed() -> None:
    if settings.environment not in ("development", "test"):
        raise SystemExit("seed فقط در محیط development یا test مجاز است.")
    password = os.environ.get("SEED_PASSWORD", DEV_SEED_PASSWORD)
    hashed = await hash_password(password)
    today = business_today()

    async with SessionLocal() as db:
        if await db.scalar(select(User.id).limit(1)) is not None:
            print("داده از قبل موجود است — seed رد شد.")
            return

        # قطعه‌سازهای نمونه: هر کدام سازمان خودش را دارد
        suppliers: list[Supplier] = []
        for data in SUPPLIERS:
            org = Organization(id=uuid.uuid4(), name=str(data["company_name"]))
            db.add(org)
            await db.flush()
            supplier = Supplier(organization_id=org.id, **data)
            db.add(supplier)
            suppliers.append(supplier)
        await db.flush()

        # کارفرمای نمونه
        buyer_org = Organization(id=uuid.uuid4(), name="شرکت صنعتی نمونه")
        db.add(buyer_org)
        await db.flush()
        buyer = User(
            id=uuid.uuid4(),
            organization_id=buyer_org.id,
            email=BUYER_EMAIL,
            full_name="کارفرمای نمونه",
            hashed_password=hashed,
            role="buyer",
            is_verified=True,
        )
        # هر قطعه‌ساز نمونه یک کاربر دارد؛ اولی با ایمیل ساده‌ی supplier@ برای ورود دستی
        supplier_users: list[User] = []
        for index, supplier in enumerate(suppliers, start=1):
            email = SUPPLIER_EMAIL if index == 1 else f"supplier{index}@partmachine.ir"
            supplier_users.append(
                User(
                    id=uuid.uuid4(),
                    organization_id=supplier.organization_id,
                    email=email,
                    full_name=f"کاربر {supplier.company_name}",
                    hashed_password=hashed,
                    role="supplier",
                    is_verified=True,
                )
            )
        db.add_all([buyer, *supplier_users])
        await db.flush()

        rfq = Rfq(
            id=uuid.uuid4(),
            organization_id=buyer_org.id,
            created_by_id=buyer.id,
            title="ساخت ۵۰۰ عدد فلنج استیل ۳۰۴",
            description="فلنج طبق نقشه‌ی پیوست، قطر خارجی ۱۲۰ میلی‌متر، سوراخ‌کاری ۸ عدد M10.",
            capability="cnc",
            material="استیل 304",
            quantity=500,
            delivery_city="تهران",
            deadline=today + timedelta(days=45),
            quotes_due=today + timedelta(days=10),
            status="quoting",
            files=[
                {"name": "flange-drawing.pdf", "size": 845000, "kind": "pdf"},
                {"name": "flange-model.step", "size": 2400000, "kind": "cad"},
            ],
        )
        db.add(rfq)
        await db.flush()

        # پیشنهاد قطعه‌سازهای ۲ تا ۵؛ قطعه‌ساز ۱ (supplier@) هنوز پیشنهاد نداده تا بتوان دستی امتحان کرد.
        # آخرین مبلغ عمداً بیشتر از سقف int4 است (پول BIGINT به ریال).
        offers = [
            (1, 1_850_000_000, 14, "تضمین تلرانس ±۰٫۰۲ میلی‌متر."),
            (2, 1_620_000_000, 25, "قیمت رقابتی با ریخته‌گری دقیق."),
            (3, 1_410_000_000, 21, "ارزان‌ترین پیشنهاد، بدون گواهینامه."),
            (4, 2_350_000_000, 12, "سریع‌ترین تحویل، مناسب فوری."),
        ]
        for index, price, lead, note in offers:
            db.add(
                Quotation(
                    rfq_id=rfq.id,
                    supplier_id=suppliers[index].id,
                    submitted_by_id=supplier_users[index].id,
                    total_price_rials=price,
                    lead_time_days=lead,
                    valid_until=today + timedelta(days=20),
                    note=note,
                )
            )
        await db.commit()

    print("seed با موفقیت انجام شد.")
    print(f"ورود نمونه: {BUYER_EMAIL} (کارفرما) و {SUPPLIER_EMAIL} (قطعه‌ساز)")
    if password == DEV_SEED_PASSWORD:
        print(f"رمز هر دو حساب (فقط توسعه): {DEV_SEED_PASSWORD}")


async def _main() -> None:
    try:
        await seed()
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(_main())
