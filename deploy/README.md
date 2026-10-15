# راه‌اندازی پارت‌ماشین روی یک سرور

> مخاطب: کسی که پارت‌ماشین را روی سرور نصب یا به‌روز می‌کند. راهنمای کامل (staging، پایش و پشتیبان) در گام‌های بعدی فاز ۴ به `docs/DEPLOYMENT.md` اضافه می‌شود.

## چه چیزی بالا می‌آید

با یک دستور این سرویس‌ها به این ترتیب بالا می‌آیند:

| سرویس | کار |
|---|---|
| PostgreSQL | پایگاه داده |
| Redis | محدودیت نرخ و هماهنگی |
| migration | به‌روزرسانی ساختار پایگاه داده، یک‌بار و پیش از API |
| API | بک‌اند |
| worker | کارهای پس‌زمینه (جدول پایین) |
| سایت | فرانت |
| Caddy | HTTPS خودکار |

سایت و API زیر **یک دامنه** هستند و API زیر مسیر `/api` است. روی سرور فقط پورت‌های ۸۰ و ۴۴۳ باز می‌شوند.

## پیش‌نیازها

- سروری با Docker و Docker Compose.
- یک دامنه یا زیردامنه (مثلاً `app.partmachine.ir`) که رکورد DNS آن به IP سرور اشاره کند.
- پورت‌های ۸۰ و ۴۴۳ از اینترنت باز باشند تا Caddy گواهی Let's Encrypt بگیرد.

## نصب بار اول

```bash
cp deploy/.env.prod.example deploy/.env.prod     # مقدارها را پر کنید؛ این فایل هرگز commit نمی‌شود
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod up -d --build

# ساخت حساب ادمین (رمز از ورودی خوانده می‌شود و در تاریخچه‌ی shell نمی‌ماند)
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod run --rm -T api \
  python -m app.create_admin --email admin@example.com --name "مدیر پارت‌ماشین" --password-stdin
```

اگر تنظیمی ناامن یا ناقص باشد، API با پیام روشن بالا نمی‌آید. نمونه‌ها: رمز کوتاه، دامنه‌ی نامشخص، خاموش بودن محدودیت نرخ.

### ورود دومرحله‌ای ادمین

برای ادمین اجباری است. ادمین پس از نخستین ورود، در صفحه‌ی «حساب کاربری» روشنش می‌کند: QR را با اپ Authenticator (مثلاً Google Authenticator) اسکن می‌کند و ۱۰ کد پشتیبان می‌گیرد. تا آن موقع بخش مدیریت برایش باز نمی‌شود.

اگر ادمین گوشی و کدهای پشتیبان را با هم گم کند، روی سرور:

```bash
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod run --rm -T api \
  python -m app.reset_two_factor --email admin@example.com
```

همه‌ی نشست‌های آن حساب بسته می‌شود و ادمین پس از ورود دوباره روشنش می‌کند. اگر `SECRET_KEY` عوض شود، کلیدهای ذخیره‌شده خوانده نمی‌شوند و همین دستور برای هر حساب لازم است.

## فایل‌ها: دیسک سرور یا فضای ابری

فایل‌های کاربران (نقشه، مدرک و تصویر) دو جا می‌توانند بمانند. انتخاب با `STORAGE_BACKEND` در فایل env است:

| گزینه | مناسب برای | نکته |
|---|---|---|
| `local` (پیش‌فرض) | یک سرور | فایل‌ها در volume `storage` هستند؛ همراه پایگاه داده پشتیبان بگیرید |
| `s3` | فضای ابری S3-سازگار (لیارا، ابر آروان و…) | دیسک سرور پر نمی‌شود و سرور راحت عوض می‌شود |

برای `s3`:

1. در پنل سرویس یک bucket **خصوصی** بسازید و کلید دسترسی‌ای بگیرید که فقط به همان bucket دسترسی دارد.
2. مقدارهای `S3_*` را در فایل env بگذارید. آدرس باید `https://` باشد.
3. همان دستور `up -d` را اجرا کنید.

فایل‌ها هیچ‌وقت لینک عمومی ندارند. دانلود فقط از راه سایت و با همان قواعد دسترسی انجام می‌شود. اگر تنظیمی ناقص باشد، API با پیام روشن بالا نمی‌آید.

### انتقال از دیسک به فضای ابری

اگر سایت تا امروز با `local` کار کرده است:

```bash
# ۱. تنظیمات S3 را در فایل env بگذارید (STORAGE_BACKEND=s3 و S3_*)، بعد فایل‌ها را منتقل کنید
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod run --rm api python -m app.copy_files_to_s3
# ۲. API را با تنظیمات تازه بالا بیاورید
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod up -d
# ۳. یک بار دیگر، برای فایل‌هایی که در این فاصله بارگذاری شده‌اند
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod run --rm api python -m app.copy_files_to_s3
```

- ابزار پیش از شروع، اتصال و دسترسی به bucket را می‌سنجد و خطا را به فارسی می‌گوید.
- hash هر فایل با مقدار ثبت‌شده هنگام بارگذاری مقایسه می‌شود.
- اجرای دوباره بی‌خطر است و فایلی که منتقل شده، دوباره فرستاده نمی‌شود.
- فایل‌های دیسک پاک نمی‌شوند. پس از بررسی سایت، volume `storage` را خودتان پاک کنید.

## به‌روزرسانی

1. کد تازه را بگیرید.
2. `IMAGE_TAG` را در فایل env به نسخه‌ی تازه تغییر دهید، مثلاً شناسه‌ی commit.
3. همان دستور `up -d --build` را اجرا کنید.

migration خودکار پیش از API اجرا می‌شود. اگر شکست بخورد، API نسخه‌ی تازه بالا نمی‌آید.

## بازگشت به نسخه‌ی قبل

`IMAGE_TAG` را به برچسب قبلی برگردانید و `up -d` را بدون `--build` اجرا کنید. ایمیج‌های قبلی روی سرور می‌مانند.

همه‌ی migrationها تا امروز فقط چیزی اضافه کرده‌اند، پس کد قبلی با پایگاه داده‌ی تازه کار می‌کند. اگر روزی migration مخربی لازم شود، پیش از آن پشتیبان گرفته می‌شود.

## کارهای پس‌زمینه (worker)

| کار | هر چند وقت | چه می‌کند |
|---|---|---|
| `delivery_reminders` | هر ساعت | یادآوری موعد تحویل: «نزدیک موعد» (از ۳ روز مانده) برای قطعه‌ساز، «گذشته از موعد» برای هر دو طرف؛ هر کدام یک بار |
| `expired_uploads` | هر ۶ ساعت | پاک کردن فایلی که ۷ روز پیش بارگذاری شده و هرگز پیوست نشده است (تصویر نمونه‌کار هرگز) |
| `old_notifications` | روزانه | پاک کردن اعلان‌های خوانده‌شده‌ی قدیمی‌تر از ۶ ماه |
| `outbox` | هر ۳۰ ثانیه | فرستادن ایمیل اعلان‌ها؛ تا انتخاب سرویس (S9) در تولید خاموش است |

اجرای چند worker بی‌خطر است. هر کار هم‌زمان فقط در یکی اجرا می‌شود. برای اجرای فوری یک کار:

```bash
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod exec worker python -m app.worker --run delivery_reminders
```

اگر worker گیر کند، `ps` آن را `unhealthy` نشان می‌دهد. خطای هر کار در لاگ worker می‌آید.

## گزارش‌ها و وضعیت

```bash
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod ps
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod logs -f api
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod logs -f worker
```

## آزمون روی همین کامپیوتر

دامنه را `localhost` بگذارید و پورت‌ها را مثلاً ۸۰۸۰ و ۸۴۴۳، با `PUBLIC_PORT_SUFFIX=:8443`. در این حالت Caddy گواهی محلی می‌سازد که مرورگر به آن اعتماد ندارد. به همین دلیل:

- آزمون Playwright را با `E2E_IGNORE_HTTPS_ERRORS=true` اجرا کنید.
- **service worker (PWA) ثبت نمی‌شود.** این قاعده‌ی امنیتی مرورگر است. روی دامنه‌ی واقعی با گواهی معتبر کار می‌کند.

همین پشته در CI هم با هر push ساخته و از بیرون آزموده می‌شود (job `production-stack`).
