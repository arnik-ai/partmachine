# نقشه‌ی پیاده‌سازی افزایشی — PartMachine

## افزایش ۱ — فرانت‌اند پایه (در حال انجام)
- [x] ساختار Monorepo + git + مستندات
- [ ] Next.js 16 + TS + Tailwind v4 + RTL فارسی + فونت وزیرمتن
- [ ] کامپوننت‌های ui سبک shadcn (button, input, card, badge, ...)
- [ ] صفحات: لندینگ، ورود/ثبت‌نام، لیست و پروفایل تأمین‌کننده، ثبت/لیست RFQ، داشبورد
- [ ] React Query + Zustand + لایه‌ی API با fallback روی Mock
- [ ] تأیید build موفق

## افزایش ۲ — بک‌اند هسته
- FastAPI + SQLAlchemy 2 async + Alembic + PostgreSQL + Redis + MinIO
- Auth کامل (JWT + Refresh rotation + RBAC پنج‌نقشه)
- ماژول تأمین‌کننده، RFQ، Quotation، فایل (presigned upload)
- موتور Trust Score و Matching (explainable)
- docker-compose کامل، اتصال فرانت به API واقعی

## افزایش ۳ — تراکنش مالی
- کیف پول، Escrow (آزادسازی جزئی/مرحله‌ای، استرداد)، سفارش، اختلاف
- اینترفیس درگاه پرداخت

## افزایش ۴ — QC و نظرات
- مرکز QC: درخواست بازرسی، گزارش، گواهی PDF، انواع تست
- سیستم نظرات + تحلیل احساسات

## افزایش ۵ — AI پیشرفته و ادمین
- تحلیل اسناد با LLM (اینترفیس Provider)
- تشخیص تقلب
- پنل ادمین (کاربران، سفارش‌ها، پرداخت‌ها، اختلاف‌ها، متریک‌های AI)

## افزایش ۶ — تولید (Production)
- Observability کامل (متریک، لاگ ساختاریافته، خطایاب)
- Kubernetes manifests + CI/CD
- تست‌های جامع و Load Test
