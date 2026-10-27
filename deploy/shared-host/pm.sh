#!/bin/sh
# PartMachine روی سرور مشترک: تنها راه اجرای docker compose روی این سرور (README همین پوشه).
#   sh deploy/shared-host/pm.sh init <tag>     فایل deploy/.env.prod با رمزهای تصادفی (هیچ رمزی چاپ نمی‌شود)
#   sh deploy/shared-host/pm.sh check          فقط درگاه داخلی منتشر شود، چیزی ساخته نشود، نشانی درست باشد
#   sh deploy/shared-host/pm.sh up             دانلود ایمیج‌ها، migration، بالا آوردن و صبر تا سالم شدن
#   sh deploy/shared-host/pm.sh smoke          آزمون دود از راه Caddy همین پروژه
#   sh deploy/shared-host/pm.sh release <tag>  نسخه‌ی تازه: اول پشتیبان، بعد up و smoke
#   sh deploy/shared-host/pm.sh compose ...    هر فرمان دیگر compose (ps، logs، exec، ...)
set -eu
cd "$(dirname "$0")/../.."

ENV_FILE=deploy/.env.prod

dc() {
	docker compose -p partmachine-prod --env-file "$ENV_FILE" \
		-f deploy/docker-compose.prod.yml -f deploy/shared-host/compose.yml "$@"
}

val() { sed -n "s/^$1=//p" "$2" | tail -n 1; }
need_env() { [ -f "$ENV_FILE" ] || { echo "$ENV_FILE نیست؛ اول: pm.sh init <tag>" >&2; exit 1; }; }
edge() { echo "$(val EDGE_BIND "$ENV_FILE" | grep . || echo 172.17.0.1):$(val EDGE_PORT "$ENV_FILE" | grep . || echo 18080)"; }

init() {
	tag=${1:?"pm.sh init <image-tag>"}
	[ ! -e "$ENV_FILE" ] || { echo "$ENV_FILE از قبل هست؛ بازنویسی نمی‌شود" >&2; exit 1; }
	umask 077
	{
		echo "# PartMachine روی سرور مشترک، ساخته‌شده با pm.sh init در $(date -u +%F)."
		echo "# SECRET_KEY و BACKUP_PASSWORD را در یک مدیر رمز بیرون از سرور هم نگه دارید (بازگردانی کامل بدون آن‌ها ممکن نیست)."
		echo "APP_DOMAIN=$(val APP_DOMAIN deploy/shared-host/domain.env)"
		echo "IMAGE_TAG=$tag"
		echo "SECRET_KEY=$(openssl rand -hex 32)"
		echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
		echo "REDIS_PASSWORD=$(openssl rand -hex 24)"
		echo "BACKUP_PASSWORD=$(openssl rand -hex 24)"
		echo "# سقف‌ها روی سرور مشترک (۳ هسته و ۶ گیگ رم، کنار سایت‌های دیگر)"
		echo "API_MEM_LIMIT=768m"
		echo "WORKER_MEM_LIMIT=384m"
		echo "WEB_MEM_LIMIT=512m"
		echo "REDIS_MEM_LIMIT=128m"
		echo "CADDY_MEM_LIMIT=128m"
		echo "BACKUP_MEM_LIMIT=512m"
		echo "PASSWORD_HASH_CONCURRENCY=1"
		echo "# سقف بارگذاری هر شرکت در ۲۴ ساعت روی این دیسک کوچک (۵۰۰ مگابایت)"
		echo "STORAGE_ORG_DAILY_BYTES=524288000"
	} > "$ENV_FILE"
	echo "ساخته شد: $ENV_FILE (فقط root می‌خواند)"
}

check() {
	need_env
	want=$(val APP_DOMAIN deploy/shared-host/domain.env)
	have=$(val APP_DOMAIN "$ENV_FILE")
	[ "$have" = "$want" ] || { echo "APP_DOMAIN فایل env ($have) با domain.env ($want) یکی نیست؛ ایمیج سایت برای $want ساخته شده" >&2; exit 1; }
	config=$(dc config --format json)
	# پورت‌های ۸۰ و ۴۴۳ مال Caddy سرور است؛ فقط درگاه داخلی Caddy همین پروژه
	ports=$(echo "$config" | jq -r '[.services[] | (.ports // [])[] | "\(.host_ip // "0.0.0.0"):\(.published)"] | join(" ")')
	[ "$ports" = "$(edge)" ] || { echo "پورت منتشرشده‌ی غیرمنتظره: $ports" >&2; exit 1; }
	echo "$config" | jq -e '[.services[] | select(has("build"))] | length == 0' > /dev/null \
		|| { echo "روی این سرور نباید ایمیجی ساخته شود" >&2; exit 1; }
	echo "check: فقط $ports منتشر می‌شود؛ ایمیج‌ها از GHCR با برچسب $(val IMAGE_TAG "$ENV_FILE")"
}

up() {
	check
	# ایمیج‌هایی که روی سرور نیستند (برچسب تازه) خودکار دانلود می‌شوند؛ چیزی ساخته نمی‌شود
	dc up -d
	for _ in $(seq 1 60); do
		if [ "$(dc ps api --format '{{.Health}}')" = healthy ] \
			&& [ "$(dc ps worker --format '{{.Health}}')" = healthy ] \
			&& curl -fs -m 5 -o /dev/null -H "Host: $(val APP_DOMAIN "$ENV_FILE")" "http://$(edge)/api/v1/status"; then
			test "$(dc ps -a migrate --format '{{.ExitCode}}')" = 0
			dc ps
			return 0
		fi
		sleep 5
	done
	dc ps -a
	echo "سرویس‌ها در ۵ دقیقه سالم نشدند؛ pm.sh compose logs --tail=100" >&2
	exit 1
}

smoke() {
	need_env
	host=$(val APP_DOMAIN "$ENV_FILE")
	base="http://$(edge)"
	code() { curl -s -m 10 -o /dev/null -w '%{http_code}' -H "Host: $host" "$base$1"; }
	curl -fsS -m 10 -H "Host: $host" "$base/" | grep -q 'rel="manifest"'
	curl -fsS -m 10 -H "Host: $host" "$base/api/v1/status" | grep -q '"ok"'
	curl -fsSI -m 10 -H "Host: $host" "$base/" | grep -qi '^strict-transport-security:'
	# آمار، سلامت داخلی و مستندات API از بیرون بسته‌اند
	for path in /metrics /ready /health /api/v1/docs; do
		[ "$(code "$path")" = 404 ] || { echo "$path از بیرون باز است" >&2; exit 1; }
	done
	echo "smoke: ok ($host از راه $base)"
}

release() {
	tag=${1:?"pm.sh release <image-tag>"}
	need_env
	# پشتیبان پیش از migrationهای نسخه‌ی تازه
	dc exec -T backup partmachine-backup run
	sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$tag/" "$ENV_FILE"
	up
	smoke
}

cmd=${1:-}
[ $# -gt 0 ] && shift
case "$cmd" in
	init) init "$@" ;;
	check) check ;;
	up) up ;;
	smoke) smoke ;;
	release) release "$@" ;;
	compose) need_env; dc "$@" ;;
	*) sed -n '2,9p' "$0"; exit 2 ;;
esac
