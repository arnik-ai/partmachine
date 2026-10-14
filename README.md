# PartMachine — بازار صنعتی B2B

پلتفرم اتصال قطعه‌سازان، کارفرمایان، مأموران خرید و آزمایشگاه‌های کنترل کیفیت — مشابه دیوار اما تخصصی برای تولید و تأمین صنعتی.

> **وضعیت:** فاز ۱ (تثبیت و ایمنی تولید) انجام شده و منتظر بازبینی است. هنوز روی هیچ سرور واقعی مستقر نشده است. نسخه‌ی [GitHub Pages](https://arnik-ai.github.io/partmachine/) فقط **دموی نمایشی** با داده‌ی نمونه است.

## ساختار مخزن

```
partmachine/
├── frontend/           # Next.js 16 + TypeScript + Tailwind v4 (RTL فارسی)
├── backend/            # FastAPI + SQLAlchemy 2 (async) + Alembic + PostgreSQL + Redis
├── docs/               # راهنمای توسعه، مدل امنیتی، معماری، گزارش فازها
├── docker-compose.yml  # PostgreSQL 17 و Redis 7 برای توسعه‌ی محلی
└── .github/workflows/  # CI و انتشار دموی Pages
```

## راه‌اندازی سریع

```bash
docker compose up -d db redis                     # PostgreSQL :5433، Redis :6380

cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements-dev.txt     # لینوکس/مک: .venv/bin/...
.venv/Scripts/alembic upgrade head
.venv/Scripts/python -m app.seed                      # اختیاری: داده‌ی نمونه
.venv/Scripts/uvicorn app.main:app --reload --port 8100

cd ../frontend
npm ci
npm run dev                                           # http://localhost:3100
```

جزئیات، متغیرهای محیطی، تست‌ها و رفع اشکال در [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) آمده است.

## مستندات

| سند | محتوا |
|---|---|
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | راه‌اندازی، env، migration، تست، build، CI، پشتیبان‌گیری |
| [docs/SECURITY_MODEL.md](docs/SECURITY_MODEL.md) | نشست، CSRF، محدودیت نرخ، نقش‌ها، قواعد دسترسی، قیود داده |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | معماری و تصمیم‌های کلیدی |
| [docs/PHASE0_ASSESSMENT.md](docs/PHASE0_ASSESSMENT.md) | ارزیابی فاز ۰ (یافته‌های F01–F38) |
| [docs/PHASE1_REPORT.md](docs/PHASE1_REPORT.md) | گزارش فاز ۱ و نتایج ثبت‌شده‌ی تست‌ها |
| [CLAUDE.md](CLAUDE.md) | قواعد کار و برنامه‌ی فازها |

## نقش‌ها (Actors)

| نقش | شرح |
|---|---|
| Supplier | قطعه‌ساز / تأمین‌کننده خدمات تولیدی |
| Buyer | کارفرما — ثبت RFQ و دریافت استعلام قیمت |
| Agent | مأمور خرید — جستجو و مقایسه و مذاکره |
| QC | آزمایشگاه کنترل کیفیت — بازرسی و صدور گواهی |
| Admin | مدیر پلتفرم |
