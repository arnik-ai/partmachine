# راهنمای توسعه‌ی محلی — PartMachine

این سند برای توسعه‌دهنده‌ها و ایجنت‌هایی است که روی این مخزن کار می‌کنند. دستورها برای PowerShell ویندوز نوشته شده‌اند؛ در لینوکس و مک به‌جای `.venv\Scripts\` از `.venv/bin/` استفاده کنید.

## پیش‌نیازها

| ابزار | نسخه | کاربرد |
|---|---|---|
| Docker Desktop یا Docker Engine با Compose | — | PostgreSQL 17 و Redis 7 |
| Python | 3.13 (حداقل 3.12) | بک‌اند |
| Node.js | 22.12 یا جدیدتر | فرانت |

## راه‌اندازی سریع

### ۱. پایگاه داده و Redis

```bash
docker compose up -d db redis
```

- پورت‌ها عمداً غیرپیش‌فرض‌اند تا با پروژه‌های دیگرِ همین ماشین تداخل نکنند: PostgreSQL روی `127.0.0.1:5433` و Redis روی `127.0.0.1:6380`.
- با متغیرهای `PM_DB_PORT` و `PM_REDIS_PORT` قابل تغییرند.
- داده در volumeهای نام‌دار (`pm_db_data`، `pm_redis_data`) می‌ماند؛ خاموش کردن Docker چیزی را پاک نمی‌کند.

### ۲. بک‌اند (پورت 8100)

```powershell
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements-dev.txt
.venv\Scripts\alembic upgrade head
.venv\Scripts\python -m app.seed      # اختیاری: داده‌ی نمونه
.venv\Scripts\uvicorn app.main:app --reload --port 8100
```

- برای توسعه‌ی محلی فایل `.env` لازم نیست؛ پیش‌فرض‌ها با `docker-compose.yml` هم‌خوان‌اند.
- بررسی سلامت: `http://localhost:8100/health` (زنده بودن پروسه) و `http://localhost:8100/ready` (وضعیت DB و Redis).
- مستندات تعاملی API: `http://localhost:8100/docs` (فقط در development و test).

### ۳. فرانت (پورت 3100)

```bash
cd frontend
npm ci
npm run dev
```

سپس `http://localhost:3100` را باز کنید. آدرس API به‌طور پیش‌فرض `http://localhost:8100/api/v1` است.

### حساب‌های نمونه (پس از seed)

| نقش | ایمیل | رمز |
|---|---|---|
| کارفرما | `buyer@partmachine.ir` | `PartMachine-dev-1234` |
| قطعه‌ساز | `supplier@partmachine.ir` | `PartMachine-dev-1234` |

- قطعه‌سازهای نمونه‌ی دیگر `supplier2@` تا `supplier5@partmachine.ir` با همان رمزند. یک RFQ نمونه با چهار پیشنهاد قیمت هم ساخته می‌شود.
- seed فقط در `development` و `test` اجرا می‌شود و در محیط‌های دیگر متوقف می‌شود.
- رمز را با متغیر `SEED_PASSWORD` تغییر دهید. اگر داده‌ای موجود باشد، seed کاری نمی‌کند.

### کد یک‌بارمصرف در توسعه

بازیابی رمز و تأیید موبایل با کد ۶ رقمی کار می‌کنند. در توسعه هیچ پیامک یا ایمیلی فرستاده نمی‌شود؛ کد در لاگ API نوشته می‌شود:

```text
one-time code (password_reset via email to us***@example.com): 123456
```

### حساب ادمین

ادمین نه از ثبت‌نام ساخته می‌شود، نه از API؛ **فقط** با این دستور:

```powershell
cd backend
.venv\Scripts\python -m app.create_admin --email admin@example.com --name "نام ادمین"
```

- رمز (حداقل ۱۲ کاراکتر) پنهان و دو بار پرسیده می‌شود. برای اسکریپت‌ها رمز از ورودی استاندارد خوانده می‌شود: `--password-stdin`.
- اجرای دوباره با همان ایمیل کاری نمی‌کند. ایمیلی که متعلق به کاربر عادی است به ادمین ارتقا داده نمی‌شود.
- پنل مدیریت در `/admin` است: صف تأیید مدارک، کاربران و رویدادها. مسیرهای `/api/v1/admin/*` برای نقش‌های دیگر 404 می‌دهند.

## متغیرهای محیطی

### بک‌اند

از متغیر محیطی یا `backend/.env` خوانده می‌شوند (نمونه: `backend/.env.example`). در `staging` و `production` هر تنظیم ناامن باعث می‌شود برنامه با پیام خطای روشن **شروع نشود**.

| متغیر | پیش‌فرض (توسعه) | در تولید |
|---|---|---|
| `ENVIRONMENT` | `development` | `production` (یا `staging`) |
| `DATABASE_URL` | `postgresql+asyncpg://partmachine:partmachine@localhost:5433/partmachine` | الزامی؛ فقط PostgreSQL |
| `REDIS_URL` | `redis://localhost:6380/0` | الزامی |
| `SECRET_KEY` | مقدار ناامن توسعه | الزامی؛ تصادفی و حداقل ۳۲ بایت (`python -c "import secrets; print(secrets.token_urlsafe(48))"`) |
| `CORS_ORIGINS` | `http://localhost:3100` | فقط originهای صریح `https://`، جداشده با کاما |
| `ALLOWED_HOSTS` | `*` | نام‌های صریح دامنه‌ی API |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `15` | — |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `14` | — |
| `COOKIE_SECURE` | بر اساس محیط (خاموش در توسعه) | باید روشن بماند |
| `DOCS_ENABLED` | بر اساس محیط (روشن در توسعه) | پیش‌فرض خاموش |
| `RATE_LIMIT_ENABLED` | `true` | `true` |
| `RATE_LIMIT_FAIL_OPEN` | بر اساس محیط (`true` در توسعه) | پیش‌فرض `false`: اگر Redis قطع باشد، ورود رد می‌شود |
| `LOG_JSON` | بر اساس محیط | پیش‌فرض `true` |
| `LOG_LEVEL` | `INFO` | — |
| `MAX_BODY_BYTES` | `1000000` | — |
| `DB_POOL_SIZE` / `DB_MAX_OVERFLOW` | `10` / `10` | بر اساس ظرفیت PostgreSQL |
| `DB_STATEMENT_TIMEOUT_MS` | `15000` | — |
| `BUSINESS_TIMEZONE` | `Asia/Tehran` | مبنای «امروز» برای مهلت‌ها |
| `STORAGE_LOCAL_DIR` | `var/storage` (نسبت به `backend/`) | الزامی؛ مسیر **مطلق** روی دیسک پایدار (volume) |
| `UPLOAD_MAX_BYTES` | `52428800` (۵۰MB) | سقف کلی بدنه‌ی بارگذاری؛ هر نوع فایل سقف کوچک‌تر خودش را دارد |
| `DOWNLOAD_LINK_TTL_SECONDS` | `120` | — |
| `OTP_SENDER` | `console` در توسعه (کد در لاگ API) | پیش‌فرض `disabled`؛ `console` در تولید مجاز نیست. سرویس واقعی پیامک/ایمیل فقط پس از تأیید مالک |
| `SEED_PASSWORD` | `PartMachine-dev-1234` | — (seed در تولید اجرا نمی‌شود) |

### فرانت

این متغیرها در زمان build در کد جاسازی می‌شوند (نمونه: `frontend/.env.example`).

| متغیر | پیش‌فرض | توضیح |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8100/api/v1` | در تولید الزامی. فرانت و API باید **هم‌سایت** باشند (مثلاً `app.` و `api.` زیر یک دامنه) تا کوکی نشست کار کند. |
| `NEXT_PUBLIC_DEMO_MODE` | خاموش | فقط برای نسخه‌ی نمایشی GitHub Pages. |
| `NEXT_OUTPUT` | — | `export` فقط برای نسخه‌ی نمایشی. |
| `NEXT_PUBLIC_BASE_PATH` | — | `/partmachine` برای GitHub Pages. |

## migrationها (Alembic)

```powershell
cd backend
.venv\Scripts\alembic upgrade head                            # اعمال
.venv\Scripts\alembic revision --autogenerate -m "توضیح"      # ساخت migration جدید
.venv\Scripts\alembic check                                   # هم‌خوانی مدل‌ها و migrationها
.venv\Scripts\alembic downgrade -1                            # بازگشت یک مرحله
```

- خروجی autogenerate را همیشه بازبینی کنید؛ قیود حلقوی، داده‌ها و تغییر نام‌ها را خودش درست تشخیص نمی‌دهد. نمونه: `0001_initial_schema.py`.
- migration اعمال‌شده را ویرایش نکنید؛ migration جدید بسازید.
- migration مخرب (حذف جدول یا ستون، یا تغییر نوعی که داده از دست می‌رود) روی داده‌ی واقعی فقط با تأیید صریح و پس از پشتیبان‌گیری اجرا می‌شود.
- برنامه هنگام شروع `create_all` اجرا نمی‌کند؛ schema فقط با Alembic تغییر می‌کند.

## تست‌ها و کیفیت کد

### بک‌اند

```powershell
cd backend
.venv\Scripts\ruff check .
.venv\Scripts\ruff format --check .
.venv\Scripts\mypy app
.venv\Scripts\pytest -q
```

- تست‌ها روی PostgreSQL واقعی اجرا می‌شوند (پایگاه `partmachine_test` که خودکار ساخته می‌شود) و از Redis هم استفاده می‌کنند (db 15). پیش‌نیاز: `docker compose up -d db redis`.
- **حفاظ:** تست‌ها جدول‌ها را خالی می‌کنند؛ نام پایگاهی که در `TEST_DATABASE_URL` می‌آید باید به `_test` ختم شود، وگرنه تست‌ها اجرا نمی‌شوند.
- هر اجرا از schema تمیز شروع می‌شود (`downgrade base` و سپس `upgrade head`). یک تست جداگانه هم upgrade، downgrade و دوباره upgrade را روی یک پایگاه خالی می‌آزماید.
- سناریوهای بازتولید گزارش فاز ۰ (پیوست الف) به تست دائمی تبدیل شده‌اند؛ شناسه‌ی سناریو در docstring تست‌ها آمده است.

### فرانت

```bash
cd frontend
npm run typecheck
npm run lint
npm test
npm run build
```

### آزمون سرتاسری مرورگر (Playwright)

با سرورهای در حال اجرا (API روی 8100 و فرانت روی 3100). API آزمون مرورگر را با `RATE_LIMIT_ENABLED=false` اجرا کنید، چون هر اجرای کامل روی همه‌ی دستگاه‌ها بیش از ۳۰ حساب تازه می‌سازد. این سقف ثبت‌نام در ساعت برای هر IP است. این تنظیم فقط در توسعه پذیرفته می‌شود و staging و production با آن بالا نمی‌آیند.

```bash
cd frontend
npx playwright install chromium   # فقط بار اول
npx playwright install webkit     # فقط بار اول؛ موتور Safari برای آزمون آیفون و آیپد
npm run test:e2e                  # پیش‌فرض E2E_BASE_URL=http://localhost:3100
```

آزمون‌های ادمین به یک حساب ادمین نیاز دارند. ادمین آزمون را یک‌بار در پایگاه توسعه بسازید و ایمیل و رمزش را به Playwright بدهید:

```bash
cd backend
printf '%s' "$E2E_ADMIN_PASSWORD" | .venv/Scripts/python -m app.create_admin --email "$E2E_ADMIN_EMAIL" --name "ادمین آزمون" --password-stdin
cd ../frontend
E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... npm run test:e2e
```

بدون این دو متغیر، آزمون‌های ادمین با پیام روشن **رد (skip)** می‌شوند و بقیه اجرا می‌شوند. آزمون‌های کنترل کیفیت، اختلاف و کل مسیر هم ادمین لازم دارند، چون آزمایشگاه را ادمین تأیید می‌کند و اختلاف را ادمین تصمیم می‌گیرد.

- **پوشش:**
  - ثبت RFQ و پیدا شدن آن در فید قطعه‌سازها.
  - پیشنهاد قیمت به تومان با ارقام فارسی، و ویرایش آن.
  - مقایسه، فیلتر «فقط تأییدشده‌ها» و انتخاب برنده.
  - دیدن نتیجه توسط هر قطعه‌ساز، و لغو RFQ.
  - امنیت نشست: نبود توکن در localStorage، کوکی HttpOnly، ماندن نشست پس از reload، و خروج.
  - دعوت همکار و حذف او، و محرمانگی نقشه‌ها تا پذیرش NDA.
  - تکمیل پروفایل قطعه‌ساز، عکس نمونه‌کار، ارسال مدارک، تأیید ادمین، و نشان «تأییدشده» برای کارفرما.
  - غیرفعال‌سازی حساب توسط ادمین (قطع فوری دسترسی) و دیدن آن در رویدادها.
  - سفارش (فاز ۳):
    - ساخت سفارش پس از انتخاب برنده، و لغو پیش از قرارداد.
    - امضای قرارداد توسط دو طرف، ارسال، تحویل، پرداخت، تکمیل و امتیاز.
    - کنترل کیفیت: رد، اصلاح، قبول و سپس ارسال.
    - زنگوله‌ی اعلان و آمار واقعی داشبورد.
    - لغو توافقی پس از امضا.
    - اعلام مشکل و تصمیم پشتیبانی.
    - **کل مسیر** در `full-flow.spec.ts`: برنده، قرارداد با پیش‌پرداخت، پیش‌پرداخت، تولید، کنترل کیفیت، ارسال، تحویل، تسویه، تکمیل و امتیاز.
- **دستگاه‌ها (فاز ۴):**
  - پروژه‌ی `chromium` (کروم دسکتاپ، همان موتور Edge) همه‌ی آزمون‌ها را اجرا می‌کند.
  - پروژه‌های `android`، `iphone`، `ipad` و `ipad-landscape` فقط `responsive.spec.ts` را اجرا می‌کنند: صفحه‌های اصلی کارفرما، قطعه‌ساز و ادمین نباید اسکرول افقی داشته باشند. اگر داشته باشند، عنصر مقصر گزارش می‌شود.
  - برای یک دستگاه: `npx playwright test --project=iphone`.
- **PWA:** `pwa.spec.ts` بررسی می‌کند که manifest و آیکون‌ها در دسترس‌اند و service worker فعال است. همچنین بررسی می‌کند که بدون اینترنت صفحه‌ی «اتصال برقرار نیست» نمایش داده می‌شود و **در کش فقط فایل‌های ظاهری است**، نه صفحه یا داده‌ی خصوصی.
- **داده:** هر اجرا حساب‌ها و داده‌ی تازه با نام یکتا می‌سازد.
- **CI:** این آزمون‌ها در job جداگانه‌ی `e2e` اجرا می‌شوند.

### قرارداد API (OpenAPI به TypeScript)

بعد از هر تغییر در schemaهای بک‌اند:

```powershell
cd backend; .venv\Scripts\python -m app.export_openapi   # → backend/openapi.json
cd ..\frontend; npm run gen:api                           # → src/lib/api/schema.ts
npm run typecheck                                         # contract.ts ناسازگاری را می‌گیرد
```

- `src/lib/api/contract.ts` در زمان typecheck بررسی می‌کند که پاسخ‌های سرور در تایپ‌های فرانت جا شوند و ورودی‌های فرانت برای سرور معتبر باشند.
- CI بررسی می‌کند که `openapi.json` و `schema.ts` commit شده و به‌روز باشند.

## PWA (نصب مثل اپ)

- manifest در `src/app/manifest.ts` است. آیکون‌ها در `public/icons` و `src/app/{icon,apple-icon}.png` قرار دارند و با `node scripts/generate-icons.mjs` از روی طرح لوگو ساخته می‌شوند.
- service worker (`public/sw.js`) عمداً محدود است:
  - صفحه‌ها همیشه از شبکه می‌آیند.
  - فقط `/_next/static` و صفحه‌ی آفلاین کش می‌شوند.
  - API و فایل‌ها هرگز کش نمی‌شوند.
  - با هر تغییری در قواعد کش، `VERSION` را بالا ببرید.
- service worker فقط در build تولیدی ثبت می‌شود، نه در `npm run dev`.
- فونت وزیرمتن داخل پروژه است (`src/fonts`، مجوز OFL)، پس build به Google وابسته نیست.
- **آیفون واقعی:** نصب در Safari دستی است (Share و بعد «Add to Home Screen») و پیش از هر انتشار مهم یک‌بار روی دستگاه واقعی امتحان می‌شود.

## buildها

| build | دستور | کاربرد |
|---|---|---|
| سروری | `npm run build` | تولید؛ اجرا با `node .next/standalone/server.js` |
| نمایشی | `NEXT_OUTPUT=export NEXT_PUBLIC_DEMO_MODE=true NEXT_PUBLIC_BASE_PATH=/partmachine npm run build` | فقط GitHub Pages |
| Docker | `docker build --build-arg NEXT_PUBLIC_API_URL=https://…/api/v1 -t partmachine-frontend frontend` | تولید |

- **حفاظ‌ها:** build سروری با `NEXT_PUBLIC_DEMO_MODE=true`، و خروجی استاتیک بدون آن، هر دو عمداً شکست می‌خورند.
- **ویندوز:** Git Bash مقدار `/partmachine` را به مسیر ویندوزی تبدیل می‌کند. build نمایشی را در PowerShell اجرا کنید یا `MSYS_NO_PATHCONV=1` بگذارید.

## CI

- **`ci.yml`:** روی push به `master` و شاخه‌های `phase-*` و روی هر PR اجرا می‌شود.
  - بک‌اند: ruff، mypy، round-trip کامل Alembic و pytest روی سرویس‌های PostgreSQL 17 و Redis.
  - فرانت: به‌روز بودن تایپ‌های API، tsc، eslint، vitest، build سروری، رد build سروری با حالت دمو، build نمایشی و `npm audit` وابستگی‌های runtime.
- **`deploy-pages.yml`:** با push به `master` نسخه‌ی نمایشی را روی GitHub Pages منتشر می‌کند.

## پشتیبان‌گیری و بازگشت (محیط محلی)

```bash
# پشتیبان
docker compose exec -T db pg_dump -U partmachine -Fc partmachine > partmachine.dump
# بازگردانی (داده‌ی فعلی جایگزین می‌شود)
docker compose exec -T db pg_restore -U partmachine -d partmachine --clean --if-exists < partmachine.dump
```

- **فایل‌ها:** محتوای فایل‌ها در پایگاه داده نیست؛ پوشه‌ی `STORAGE_LOCAL_DIR` (در توسعه `backend/var/storage`) را **هم‌زمان** با پایگاه داده پشتیبان بگیرید، وگرنه فراداده و فایل‌ها ناهماهنگ می‌شوند.
- **بازگشت نسخه:** نسخه‌ی قبلی برنامه را مستقر کنید و فقط اگر migration برگشت‌پذیر بوده، `alembic downgrade <revision>` اجرا کنید.
- پیش از هر migration در تولید پشتیبان بگیرید.
- مستندات کامل استقرار، پشتیبان‌گیری خودکار و آزمون بازگردانی در فاز ۴ تهیه می‌شود.

## رفع اشکال

| نشانه | علت و راه‌حل |
|---|---|
| `/ready` پاسخ 503 می‌دهد، یا تست‌ها خطای `OSError: Multiple exceptions … 5433` می‌دهند | Docker یا کانتینرها خاموش‌اند ⇒ `docker compose up -d db redis` |
| 429 در توسعه پس از تلاش‌های زیاد | فقط در محیط محلی: `docker compose exec redis redis-cli FLUSHDB` |
| پورت اشغال است | `PM_DB_PORT` و `PM_REDIS_PORT` و `--port` را تغییر دهید؛ `CORS_ORIGINS` را هم هم‌خوان کنید |
| کمبود RAM | پس از کار، Docker Desktop را خاموش کنید؛ داده‌ها در volumeها می‌مانند |
