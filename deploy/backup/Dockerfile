# پشتیبان‌گیری رمزگذاری‌شده با restic (فاز ۴، گام 4f): پایگاه داده با pg_dump و فایل‌های روی دیسک.
# راهنما: docs/BACKUP_RESTORE.md
FROM restic/restic:0.19.1

# نسخه‌ی pg_dump باید با PostgreSQL 17 سرور بخواند؛ redis-cli برای ثبت آخرین پشتیبان موفق (هشدار)
RUN apk add --no-cache postgresql17-client redis

COPY backup.sh /usr/local/bin/partmachine-backup
RUN chmod +x /usr/local/bin/partmachine-backup

ENTRYPOINT ["/usr/local/bin/partmachine-backup"]
CMD ["daemon"]
