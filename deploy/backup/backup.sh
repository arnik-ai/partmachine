#!/bin/sh
# پشتیبان‌گیری تراشینو با restic (فاز ۴، گام 4f). راهنما: docs/BACKUP_RESTORE.md
#
#   partmachine-backup daemon                 یک پشتیبان هنگام شروع و بعد هر روز در ساعت BACKUP_AT (UTC)
#   partmachine-backup run                    همین حالا یک پشتیبان
#   partmachine-backup list                   فهرست پشتیبان‌ها
#   partmachine-backup restore --yes [شناسه]  بازگردانی پایگاه داده و فایل‌ها از آخرین پشتیبان (یا شناسه‌ی داده‌شده)
#
# همه‌چیز با RESTIC_PASSWORD رمزگذاری می‌شود؛ بدون آن رمز، هیچ پشتیبانی قابل بازگردانی نیست.
set -eu

: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is required}"
: "${RESTIC_PASSWORD:?RESTIC_PASSWORD is required}"
: "${PGHOST:?}" "${PGUSER:?}" "${PGDATABASE:?}" "${PGPASSWORD:?}"

KEEP_DAILY="${BACKUP_KEEP_DAILY:-14}"
BACKUP_AT="${BACKUP_AT:-23:30}"
STORAGE_DIR=/data/storage
STATUS_FILE=/tmp/partmachine-backup-ok
# نام ثابت، تا نگه‌داری ۱۴ نسخه با عوض شدن کانتینر به هم نریزد
HOST_TAG=partmachine

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }

ensure_repo() {
  restic cat config >/dev/null 2>&1 || restic init
}

record_success() {
  touch "$STATUS_FILE"
  # برای /metrics و هشدارهای «پشتیبان‌گیری انجام نشده» و «پشتیبان فقط روی همین سرور است» در worker
  if [ -n "${REDIS_HOST:-}" ]; then
    case "$RESTIC_REPOSITORY" in
      /* | local:*) offsite=0 ;;
      *) offsite=1 ;;
    esac
    REDISCLI_AUTH="${REDIS_PASSWORD:-}" redis-cli -h "$REDIS_HOST" \
      MSET pm:backup:last_success "$(date +%s)" pm:backup:offsite "$offsite" >/dev/null \
      || log "WARNING: could not record the backup in Redis"
  fi
}

run_backup() {
  started=$(date +%s)
  # پایگاه داده و فایل‌های یک نوبت برچسب مشترک دارند تا بازگردانی هر دو از همان لحظه باشد
  run_tag="run-$(date -u +%Y%m%dT%H%M%SZ)"
  ensure_repo
  restic backup --host "$HOST_TAG" --tag db --tag "$run_tag" \
    --stdin-filename partmachine.dump --stdin-from-command -- \
    pg_dump --format=custom --no-owner --no-privileges
  if [ -d "$STORAGE_DIR" ] && [ -n "$(ls -A "$STORAGE_DIR" 2>/dev/null)" ]; then
    restic backup --host "$HOST_TAG" --tag files --tag "$run_tag" "$STORAGE_DIR"
  fi
  restic forget --host "$HOST_TAG" --keep-daily "$KEEP_DAILY" --prune
  record_success
  log "backup finished in $(( $(date +%s) - started ))s"
}

restore() {
  if [ "${1:-}" != "--yes" ]; then
    echo "Restoring replaces the current database and files. Run again with --yes to continue." >&2
    exit 2
  fi
  snapshot="${2:-latest}"
  started=$(date +%s)
  log "restoring database from snapshot $snapshot; the current database is replaced"
  psql -v ON_ERROR_STOP=1 -d postgres \
    -c "DROP DATABASE IF EXISTS \"$PGDATABASE\" WITH (FORCE)" \
    -c "CREATE DATABASE \"$PGDATABASE\""
  restic dump --host "$HOST_TAG" --tag db "$snapshot" /partmachine.dump \
    | pg_restore --no-owner --no-privileges --exit-on-error -d "$PGDATABASE"
  # فایل‌ها از همان نوبتی که پایگاه داده از آن آمد (برچسب run-…)، نه از آخرین پشتیبان
  if [ "$snapshot" = latest ]; then
    db_info=$(restic snapshots --host "$HOST_TAG" --tag db --latest 1 --json)
  else
    db_info=$(restic snapshots --host "$HOST_TAG" --json "$snapshot")
  fi
  run_tag=$(printf '%s' "$db_info" | grep -o '"run-[0-9TZ]*"' | head -n 1 | tr -d '"')
  if [ -n "$run_tag" ]; then
    if restic snapshots --host "$HOST_TAG" --tag "files,$run_tag" --json | grep -q '"id"'; then
      log "restoring files from the same backup run ($run_tag)"
      restic restore --host "$HOST_TAG" --tag "files,$run_tag" latest --target /
    else
      log "that backup run had no files to restore"
    fi
  elif restic snapshots --host "$HOST_TAG" --tag files --json | grep -q '"id"'; then
    # پشتیبان‌های پیش از برچسب run-… فقط آخرین نسخه‌ی فایل‌ها را دارند
    log "WARNING: this database snapshot has no run tag; restoring the latest files instead"
    restic restore --host "$HOST_TAG" --tag files latest --target /
  fi
  log "restore finished in $(( $(date +%s) - started ))s"
}

daemon() {
  log "backup service started: now, then daily at $BACKUP_AT UTC; keeping $KEEP_DAILY daily backups"
  run_backup || log "ERROR: backup failed"
  while true; do
    if [ "$(date -u +%H:%M)" = "$BACKUP_AT" ]; then
      run_backup || log "ERROR: backup failed"
      sleep 61
    fi
    sleep 20
  done
}

case "${1:-daemon}" in
  daemon) daemon ;;
  run) run_backup ;;
  list) ensure_repo && restic snapshots --host "$HOST_TAG" ;;
  restore) shift; restore "$@" ;;
  *) echo "usage: partmachine-backup daemon|run|list|restore --yes [snapshot]" >&2; exit 2 ;;
esac
