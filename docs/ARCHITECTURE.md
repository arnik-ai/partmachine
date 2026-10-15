# گزارش معماری — PartMachine

> نسخه ۱.۴ — به‌روزرسانی: ۲۰۲۶/۱۰/۱۵ (فاز ۴، تا گام 4d) — این سند **طراحی هدف** است؛ آنچه واقعاً پیاده شده در بخش ۴ و [SECURITY_MODEL.md](SECURITY_MODEL.md) آمده است.

## ۱. نمای کلی

PartMachine یک بازار صنعتی B2B است که پنج نقش اصلی دارد: تأمین‌کننده (قطعه‌ساز)، کارفرما (خریدار)، مأمور خرید، مرکز کنترل کیفیت (QC) و مدیر پلتفرم. هدف: مقیاس‌پذیری تا +۱۰۰هزار کاربر و میلیون‌ها رکورد.

## ۲. معماری کلان

```
[Next.js 16 (RTL/fa)] ──HTTPS──> [FastAPI v1 REST]
                                     │
                  ┌──────────────────┼──────────────────┐
            [PostgreSQL 17]      [Redis 7]         [MinIO / S3]
            (داده‌ی اصلی)     (کش/سشن/صف/ریت‌لیمیت)  (فایل‌های CAD/PDF)
                                     │
                              [AI Services Layer]
                     (Trust Score | Matching | Fraud | Doc Analysis)
```

### تصمیم‌های کلیدی (ADR خلاصه)

| # | تصمیم | دلیل |
|---|---|---|
| 1 | Monorepo با `frontend/` و `backend/` | استقرار هماهنگ، CI ساده‌تر، قرارداد API مشترک |
| 2 | REST نسخه‌دار (`/api/v1`) با OpenAPI | پایداری قرارداد برای کلاینت‌های آینده (موبایل) |
| 3 | JWT کوتاه‌عمر (۱۵ دقیقه، فقط در حافظه‌ی مرورگر) + Refresh Token مات و چرخشی در کوکی HttpOnly (فقط هش آن در DB) | امنیت + امکان ابطال + تشخیص استفاده مجدد (reuse detection)؛ پیش‌نیاز: استقرار هم‌سایت فرانت و API |
| 4 | RBAC با نقش پایه + مجوزهای ریز در لایه‌ی سرویس | پنج نقش مشخص با مرز روشن |
| 5 | پول به‌صورت `BIGINT` به ریال (IRR) | جلوگیری از خطای اعشاری؛ درگاه‌های ایرانی ریالی‌اند |
| 6 | موتورهای AI به‌صورت سرویس ماژولار با اینترفیس مشترک | تعویض‌پذیری مدل/Provider بدون تغییر API |
| 7 | بارگذاری و دانلود فایل از راه API؛ نگهداری خصوصی روی دیسک یا فضای S3-سازگار، بدون لینک عمومی یا presigned | محتوای واقعی هنگام بارگذاری بررسی می‌شود و دانلود همان قواعد دسترسی و NDA را دارد؛ با سقف ۵۰MB عبور فایل از API مشکلی ندارد |
| 8 | فرانت RTL-first با Tailwind v4 و توکن‌های تم | بازار ایران، فارسی‌زبان |
| 9 | مرز مستاجر = `organizations`؛ مالکیت داده با `organization_id` | یک شرکت چند کاربر خواهد داشت؛ مجوزدهی از ابتدا روی tenant |
| 10 | قرارداد API: JSON با camelCase، خطای یکسان `{detail, code, errors?, requestId}` با پیام فارسی، لیست‌ها `{items,total,limit,offset}` | فرانت و کلاینت‌های آینده با یک قالب کار می‌کنند؛ تایپ‌های فرانت از OpenAPI تولید می‌شوند |
| 11 | داده‌ی نمونه فقط در build نمایشی (`NEXT_PUBLIC_DEMO_MODE`) | تولید هرگز داده‌ی ساختگی یا موفقیت جعلی نشان نمی‌دهد |

## ۳. فرانت‌اند

- **Next.js 16 (App Router)** — Server Components به‌صورت پیش‌فرض؛ Client Components فقط برای تعامل (فرم‌ها، استورها).
- **CSP با nonce (گام 4e):** `src/proxy.ts` برای هر درخواست CSP تازه می‌سازد. برای همین layout ریشه همه‌ی صفحه‌ها را هنگام درخواست می‌سازد (`connection()`)، جز در خروجی استاتیک نسخه‌ی نمایشی.
- **TailwindCSS v4** — پیکربندی CSS-first با `@theme`؛ فونت وزیرمتن؛ `dir="rtl"` در ریشه.
- **shadcn/ui-style** — کامپوننت‌های ui داخل `src/components/ui` با CVA.
- **React Query v5** — داده‌ی سرور (لیست تأمین‌کننده‌ها، RFQها)؛ کش و revalidate.
- **Zustand v5** — وضعیت کلاینت (سشن کاربر، UI state).
- **لایه‌ی API** (`src/lib/api-client.ts`) — کلاینت fetch که توکن را خودکار می‌فرستد، روی 401 یک‌بار نشست را تازه می‌کند و خطاها را با پیام فارسی و خطای هر فیلد برمی‌گرداند. داده‌ی نمونه **فقط** در build نمایشی استفاده می‌شود؛ در غیر آن خطا با دکمه‌ی «تلاش دوباره» نمایش داده می‌شود.
- **نشست** (`src/features/auth`) — access token فقط در حافظه؛ بازیابی بی‌صدای نشست با کوکی HttpOnly هنگام باز شدن سایت؛ محافظ صفحات خصوصی (`RequireAuth`) فقط برای تجربه‌ی کاربری.
- **قرارداد API** — `src/lib/api/schema.ts` از `backend/openapi.json` تولید می‌شود (`npm run gen:api`) و `src/lib/api/contract.ts` سازگاری را در typecheck می‌سنجد.

### ساختار مسیرها

```
/                  → لندینگ
/login /register   → احراز هویت
/suppliers         → جستجو و فیلتر تأمین‌کننده‌ها
/suppliers/[id]    → پروفایل تأمین‌کننده (توانمندی، ماشین‌آلات، گواهی، امتیاز اعتماد)
/rfqs              → لیست RFQهای من
/rfqs/new          → ثبت RFQ (متریال، تعداد، مهلت؛ فعلاً فقط متادیتای فایل‌ها)
/rfqs/[id]         → جزئیات RFQ (مالک: کامل؛ قطعه‌ساز: خلاصه)
/dashboard         → داشبورد نقش‌محور
/orders            → سفارش‌های من (کارفرما، قطعه‌ساز و آزمایشگاه انتخاب‌شده)
/orders/[id]       → سفارش: کار بعدی، کنترل کیفیت، پرداخت‌ها، امتیاز، خط زمان و تاریخچه
/orders/[id]/contract → قرارداد نسخه‌دار، امضا و نسخه‌ی چاپی
/notifications     → اعلان‌های داخل سایت
/admin/disputes    → صف اختلاف‌ها (فقط ادمین)
```

## ۴. بک‌اند (پیاده‌شده در فاز ۱ تا ۳)

- FastAPI + Python 3.13، SQLAlchemy 2.x async + asyncpg، Pydantic v2، Alembic، Redis.
- **مونولیت ماژولار:** `app/modules/{identity, organizations, agreements, files, suppliers, verification, rfqs, quotations, pricing, audit, admin, orders, contracts, payments, inspections, disputes, ratings, notifications, dashboard}`، هر ماژول با `models`، `schemas`، `router` و `service` (و `policies`/`lifecycle` برای قواعد دسترسی و وضعیت). زیرساخت مشترک در `app/core` (تنظیمات، خطاها، لاگ، middleware، محدودیت نرخ، امنیت، ذخیره‌ی فایل و ارسال کد).
- **فایل‌ها:** رابط `Storage` با دو پیاده‌سازی: دیسک محلی (P6) و فضای S3-سازگار (گام 4c؛ `STORAGE_BACKEND=s3` با boto3). بارگذاری از API با بررسی محتوای واقعی؛ دانلود از API با لینک امضاشده‌ی کوتاه‌عمر. `python -m app.copy_files_to_s3` فایل‌های دیسک را به S3 منتقل می‌کند.
- **ارسال کد و پیام:** رابط‌های `CodeSender` (کد یک‌بارمصرف) و `MessageSender` (ایمیل اعلان‌ها از صف `outbox_messages`)؛ `console` در توسعه، `disabled` در تولید تا انتخاب سرویس پیامک/ایمیل (P8، S9).
- **کارهای پس‌زمینه (گام 4d):** `python -m app.worker`، یک حلقه‌ی کوچک روی همان Redis و PostgreSQL. یادآوری موعد تحویل، پاک‌سازی فایل‌های رهاشده و اعلان‌های قدیمی، و صف ارسال. هر کار با قفل Redis، سقف زمان و تلاش دوباره‌ی محدود اجرا می‌شود. arq و saq با redis-py 8 سازگار نبودند.
- **داده:** فقط PostgreSQL؛ schema با Alembic (`create_all` حذف شده). بدون relationship ضمنی در ORM (کوئری صریح). قیود یکپارچگی در خود پایگاه داده.
- **امنیت:** Argon2id، ورود دومرحله‌ای با اپ Authenticator (برای ادمین اجباری؛ `identity/two_factor.py`)، نشست کوکی‌دار با چرخش و تشخیص سرقت، CSRF برای endpointهای کوکی‌محور، محدودیت نرخ در Redis، audit برای رویدادهای مهم، و اعتبارسنجی پیکربندی هنگام شروع. جزئیات در [SECURITY_MODEL.md](SECURITY_MODEL.md).
- **عملیات:** لاگ JSON با request-id، `/health` (liveness) و `/ready` (DB و Redis)، TrustedHost، سقف حجم درخواست، و `statement_timeout` و `idle_in_transaction_session_timeout` روی اتصال‌ها.
- **پایش (گام 4e):**
  - `/metrics` (قالب Prometheus، فقط داخل سرور): تعداد درخواست و خطا و زمان پاسخ هر الگوی مسیر، سلامت اجزا، ضربان worker و وضعیت هر کار پس‌زمینه. شمارش در Redis است تا همه‌ی پروسه‌ها یک‌جا باشند.
  - `/api/v1/status` (عمومی، فقط «بالا/پایین») برای سرویس پایش بیرونی.
  - کار `site_watch` در worker هر دقیقه API و سایت را می‌آزماید و هنگام پایین رفتن و برگشتن به ادمین‌ها اعلان می‌دهد.
  - گزارش خطا تا تصمیم S5 همان لاگ ساختاریافته است.
- **سفارش (فاز ۳):** چرخه‌ی وضعیت در `orders/lifecycle.py`؛ قرارداد نسخه‌دار با امضای مدیر دو طرف؛ پیگیری پرداخت بدون جابه‌جایی پول؛ کنترل کیفیت اختیاری؛ اختلاف با تصمیم ادمین؛ اعلان داخل سایت که در همان تراکنش رویداد ثبت می‌شود؛ سابقه‌ی واقعی قطعه‌ساز که از داده‌ی اصلی دوباره ساخته می‌شود (`suppliers/track_record.py`). جزئیات در [PHASE3_REPORT.md](PHASE3_REPORT.md).
- **هنوز پیاده نشده:** جابه‌جایی واقعی پول (درگاه و escrow؛ فقط پس از تصمیم حقوقی و مالی)، ارسال واقعی ایمیل و پیامک (صف آماده است؛ پس از انتخاب سرویس، S9)، اسکن ویروس (S6)، موتورهای AI (فاز ۵). موتور Trust Score، برآورد قیمت و «امتیاز ترکیبی» پیشنهادها فرمول‌های قطعی و شفاف‌اند، نه هوش مصنوعی.

## ۵. طرح دیتابیس (ERD خلاصه)

```mermaid
erDiagram
    users ||--o| supplier_profiles : has
    users ||--o| qc_centers : has
    users ||--o{ refresh_tokens : owns
    users ||--|| wallets : owns
    supplier_profiles ||--o{ supplier_capabilities : has
    supplier_profiles ||--o{ supplier_machines : has
    supplier_profiles ||--o{ supplier_certifications : has
    supplier_profiles ||--o{ portfolio_items : has
    supplier_profiles ||--o| supplier_scores : scored
    users ||--o{ rfqs : creates
    rfqs ||--o{ rfq_files : attaches
    rfqs ||--o{ quotations : receives
    supplier_profiles ||--o{ quotations : submits
    quotations ||--o| orders : awarded
    orders ||--|| escrow_accounts : secured
    escrow_accounts ||--o{ escrow_milestones : staged
    wallets ||--o{ transactions : ledger
    orders ||--o{ disputes : may_have
    orders ||--o{ inspection_requests : inspected
    qc_centers ||--o{ inspection_requests : handles
    inspection_requests ||--o{ inspection_reports : produces
    users ||--o{ reviews : writes
    users ||--o{ files : uploads
    users ||--o{ audit_logs : acted
```

> این ERD طرح هدف است. جداول پیاده‌شده تا پایان فاز ۳: `organizations`، `organization_invites`، `users`، `refresh_tokens`، `agreement_acceptances`، `suppliers` (توانمندی‌ها، ماشین‌آلات و گواهی‌ها فعلاً JSONB؛ به‌علاوه‌ی شمارش‌های سابقه)، `verification_requests`، `files`، `rfqs`، `quotations`، `audit_events`، و از فاز ۳: `orders`، `order_events`، `contracts`، `contract_versions`، `contract_signatures`، `order_payments`، `order_inspections`، `order_disputes`، `order_ratings` و `notifications`. در طرح هدف `wallets`، `escrow_*` و `transactions` آمده‌اند؛ این‌ها **ساخته نشده‌اند**، چون پول از پلتفرم عبور نمی‌کند (O6). ستون قدیمی `rfqs.files` (متادیتای JSONB فاز ۱) دیگر استفاده نمی‌شود و حذفش migration مخرب است که تأیید مالک را لازم دارد. شناسه‌ها فعلاً UUIDv4 هستند.

### نکات مقیاس‌پذیری

- ایندکس‌های ترکیبی روی `(status, created_at)` برای RFQ و سفارش‌ها؛ GIN روی فیلدهای JSONB و جستجوی متنی (pg_trgm).
- پارتیشن‌بندی `audit_logs` و `transactions` بر اساس ماه (RANGE on created_at).
- شناسه‌ها UUIDv7 (ترتیب‌پذیر، مناسب ایندکس B-Tree).
- خواندن‌های سنگین (جستجوی تأمین‌کننده، امتیازها) پشت کش Redis با TTL.

## ۶. موتورهای AI (معماری ماژولار)

هر موتور یک سرویس مستقل با اینترفیس مشترک `score(input) -> ScoredResult(value, components, explanation)`:

1. **Trust Score** — مدل وزن‌دار explainable روی: تحویل به‌موقع، امتیاز کیفیت، نرخ ردی، رضایت مشتری، تعداد کار تکمیل‌شده، سرعت پاسخ، سابقه‌ی اختلاف → خروجی: Trust / Risk / Reliability / Quality (۰–۱۰۰) + توضیح هر مؤلفه.
2. **Matching Engine** — رتبه‌بندی تأمین‌کننده برای هر RFQ: تطبیق توانمندی، فاصله‌ی جغرافیایی، عملکرد تحویل، کیفیت، ظرفیت آزاد، سابقه.
3. **Fraud Detection** — قواعد + ناهنجاری‌یابی (قیمت غیرعادی، الگوی ریویو جعلی، ثبت‌نام مشکوک).
4. **Document Analysis** — اینترفیس Provider-محور برای LLM (استخراج هزینه‌ی متریال/دستمزد/مالیات/بیمه/حمل از قرارداد و فاکتور). اتصال Provider در افزایش ۴.

اجرای کارهای سنگین AI به‌صورت async از طریق صف Redis.

## ۷. سفارش و پرداخت (پیاده‌شده در فاز ۳)

چرخه‌ی سفارش:

```
در انتظار قرارداد → (امضای دو طرف) → در انتظار پیش‌پرداخت → در حال تولید
در حال تولید → [بازرسی کیفیت، اگر کارفرما آزمایشگاه انتخاب کرده: رد ⇒ تولید، قبول ⇒ ارسال مجاز]
→ ارسال‌شده → تحویل‌شده → (تأیید همه‌ی اقساط) → تکمیل‌شده
پیش از امضا: لغو با دلیل. پس از امضا: لغو با توافق دو طرف، یا «اعلام مشکل» → اختلاف → تصمیم ادمین (ادامه / تکمیل / لغو)
```

پرداخت فقط **ثبت و پیگیری** است (O6): کارفرما پرداختِ بیرون از پلتفرم را اعلام می‌کند و قطعه‌ساز دریافت را تأیید می‌کند. طرح قبلی escrow (کیف پول امانی، آزادسازی مرحله‌ای، `PaymentGateway`) کنار گذاشته شد. هر نوع نگهداری یا جابه‌جایی پول فقط پس از تصمیم کسب‌وکاری و بررسی حقوقی و مالی دوباره طراحی می‌شود.
