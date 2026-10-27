# تراشینو روی سرور مشترک

> مخاطب: کسی که تراشینو را روی سرور مالک (همان سرور سایت لاله، ربات‌ها و دموها) نصب یا به‌روز می‌کند.

## چیدمان

```
بازدیدکننده ── HTTPS ──> Caddy سرور (/opt/nikan، پورت ۸۰ و ۴۴۳، مال سایت‌های دیگر)
                            │ بلوک nikan-block.caddy: X-Forwarded-For = آدرس واقعی بازدیدکننده
                            v HTTP ساده، فقط داخل سرور
                 172.17.0.1:18080  (نشانی داخلی Docker؛ از اینترنت بسته)
                            v
          Caddy تراشینو (deploy/Caddyfile) ──> /api/* به api، بقیه به web
          پروژه‌ی جدا partmachine-prod: شبکه، volume و پایگاه داده‌ی خودش
```

- همه‌ی سرویس‌ها همان `deploy/docker-compose.prod.yml` و `deploy/Caddyfile` آزموده‌اند؛ `compose.yml` همین پوشه فقط این‌ها را عوض می‌کند: ایمیج‌های ساخته‌شده در CI (`ghcr.io/arnik-ai/partmachine-*:<commit>`)، درگاه داخلی به جای ۸۰/۴۴۳، و سقف CPU و حافظه.
- هیچ ایمیجی روی سرور ساخته نمی‌شود؛ CI (کار `shared-host`) همان ایمیج‌ها را با همین فایل‌ها می‌آزماید و `publish-images` منتشرشان می‌کند.
- هیچ کانتینری از این پروژه به شبکه‌ی سایت‌های دیگر وصل نمی‌شود. تنها تغییر در فایل‌های آن‌ها، یک بلوک در `/opt/nikan/Caddyfile` است.

## نصب اول (روی سرور، با root)

```sh
git clone --filter=blob:none --sparse https://github.com/arnik-ai/partmachine /opt/partmachine
cd /opt/partmachine && git sparse-checkout set deploy && git checkout <commit>
sh deploy/shared-host/pm.sh init <tag>     # <tag> = ۱۲ نویسه‌ی اول commit؛ رمزها تصادفی و چاپ‌نشده
sh deploy/shared-host/pm.sh up
sh deploy/shared-host/pm.sh smoke
```

بعد از `init`، مقدار `SECRET_KEY` و `BACKUP_PASSWORD` در `deploy/.env.prod` را در یک مدیر رمز بیرون از سرور هم نگه دارید؛ بازگردانی پشتیبان بدون آن‌ها ممکن نیست.

## وصل کردن به Caddy سرور (فقط با تأیید مالک)

`/opt/nikan/Caddyfile` با bind mount تک‌فایلی داخل کانتینر است؛ فقط با `>>` یا `cat >` همان فایل را عوض کنید (ویرایشگر یا `sed -i` فایل تازه می‌سازد و Caddy فایل قبلی را می‌بیند).

```sh
cp -p /opt/nikan/Caddyfile /opt/nikan/Caddyfile.bak-$(date -u +%Y%m%dT%H%M%SZ)
cat deploy/shared-host/nikan-block.caddy >> /opt/nikan/Caddyfile
docker exec nikan-caddy-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile \
  && docker exec nikan-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile \
  || cat /opt/nikan/Caddyfile.bak-<زمان> > /opt/nikan/Caddyfile     # برگشت اگر معتبر نبود
```

`reload` بدون ری‌استارت است و اگر تنظیم تازه بالا نیاید، Caddy با تنظیم قبلی ادامه می‌دهد. پیش و پس از آن، سایت لاله، miniapps و coin را بیازمایید.

## حساب ادمین

مالک در ترمینال خودش (رمز فقط پیش خودش):

```sh
cd /opt/partmachine && sh deploy/shared-host/pm.sh compose exec api python -m app.create_admin --email <ایمیل> --name "<نام>"
```

سپس در مرورگر وارد شود و ورود دومرحله‌ای را روشن کند؛ تا آن موقع پنل ادمین بسته است.

## نسخه‌ی تازه و برگشت

```sh
cd /opt/partmachine && git fetch origin && git checkout <commit>   # commitی که CI آن سبز است
sh deploy/shared-host/pm.sh release <tag>                         # پشتیبان، migration، بالا آمدن، smoke
```

برگشت: `git checkout <commit قبلی>` و `pm.sh release <tag قبلی>`. اگر نسخه‌ی تازه migration داشته، migrate نسخه‌ی قبلی آن را نمی‌شناسد؛ در آن حالت به‌جای برگشت، اشکال را با نسخه‌ی تازه‌تر رفع کنید یا آخرین پشتیبان را بازگردانید (docs/BACKUP_RESTORE.md).

## هرگز

- `docker compose -f deploy/docker-compose.prod.yml up` بدون `pm.sh` (Caddy خودش پورت ۸۰/۴۴۳ را می‌خواهد).
- `docker system/image/builder prune` سراسری (ایمیج‌ها و کش سایت‌های دیگر هم پاک می‌شوند)، یا `docker pull caddy:2-alpine` (نسخه‌ی Caddy سرور را جابه‌جا می‌کند).
- تست بار بدون پایش هم‌زمان سایت‌های دیگر.
