# ایمیج تولیدی بک‌اند (FastAPI) — بدون state؛ چند نسخه پشت پروکسی معکوس قابل اجرا است.
#
#   docker build -t partmachine-api backend
#
# پیش از بالا آمدن نسخه‌ی تازه، migration جداگانه اجرا می‌شود (هرگز همراه شروع برنامه):
#   docker run --rm --env-file … partmachine-api alembic upgrade head
# راه‌اندازی کامل با یک دستور: deploy/docker-compose.prod.yml

FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app
RUN addgroup --system app && adduser --system --ingroup app --home /app app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY alembic.ini .
COPY alembic ./alembic
COPY app ./app
# فایل‌های خصوصی تا ذخیره‌ی S3 (گام 4c) روی این مسیر می‌مانند؛ در تولید یک volume پایدار است
RUN mkdir -p /data/storage && chown -R app:app /data

USER app
EXPOSE 8000

# /health فقط زنده بودن پروسه است؛ آمادگی پایگاه داده و Redis با /ready (داخلی) بررسی می‌شود.
# ALLOWED_HOSTS باید 127.0.0.1 را هم داشته باشد تا این بررسی داخلی رد نشود.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import sys, urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).status == 200 else 1)"

# WEB_CONCURRENCY: تعداد پروسه‌ها. FORWARDED_ALLOW_IPS: آدرس پروکسی معکوس، تا IP واقعی کاربر
# (برای محدودیت نرخ و audit) از X-Forwarded-For خوانده شود؛ «*» فقط وقتی امن است که API مستقیم
# در دسترس نباشد و فقط از داخل شبکه‌ی Docker و از راه پروکسی صدا زده شود.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers ${WEB_CONCURRENCY:-2} --proxy-headers --forwarded-allow-ips=${FORWARDED_ALLOW_IPS:-127.0.0.1} --no-server-header"]
