# PartMachine — بازار صنعتی B2B

پلتفرم اتصال قطعه‌سازان، کارفرمایان، مأموران خرید و آزمایشگاه‌های کنترل کیفیت — مشابه دیوار اما تخصصی برای تولید و تأمین صنعتی.

## ساختار مخزن

```
partmachine/
├── frontend/   # Next.js 16 + TypeScript + TailwindCSS (RTL فارسی)
├── backend/    # FastAPI + Python 3.13 + SQLAlchemy 2 (افزایش ۲)
├── docs/       # معماری، ERD، نقشه‌ی پیاده‌سازی
└── docker-compose.yml
```

## اجرای فرانت‌اند (توسعه)

```bash
cd frontend
npm install
npm run dev
```

سپس http://localhost:3000 را باز کنید.

## مستندات

- [گزارش معماری](docs/ARCHITECTURE.md)
- [نقشه‌ی پیاده‌سازی](docs/IMPLEMENTATION_PLAN.md)

## نقش‌ها (Actors)

| نقش | شرح |
|---|---|
| Supplier | قطعه‌ساز / تأمین‌کننده خدمات تولیدی |
| Buyer | کارفرما — ثبت RFQ و دریافت استعلام قیمت |
| Agent | مأمور خرید — جستجو و مقایسه و مذاکره |
| QC | آزمایشگاه کنترل کیفیت — بازرسی و صدور گواهی |
| Admin | مدیر پلتفرم |
