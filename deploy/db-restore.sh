#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

usage() {
  cat <<'EOF'
Usage:
  bash ./deploy/db-restore.sh --file <backup.sql|backup.sql.gz> [--replace-database] [--skip-pre-backup]

Options:
  --file <path>          Path file backup SQL (.sql atau .sql.gz)
  --replace-database     Drop + create ulang database target sebelum import
  --skip-pre-backup      Lewati backup otomatis sebelum replace database
EOF
}

BACKUP_FILE=""
REPLACE_DATABASE="false"
SKIP_PRE_BACKUP="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --file)
      BACKUP_FILE="${2:-}"
      shift 2
      ;;
    --replace-database)
      REPLACE_DATABASE="true"
      shift
      ;;
    --skip-pre-backup)
      SKIP_PRE_BACKUP="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ -z "${BACKUP_FILE}" ]]; then
  usage
  exit 1
fi

if [[ -f "${ROOT_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT_DIR}/.env"
  set +a
fi

: "${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD is required in root .env}"
: "${MYSQL_DATABASE:?MYSQL_DATABASE is required in root .env}"

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "File backup tidak ditemukan: ${BACKUP_FILE}"
  exit 1
fi

echo "[restore] ensure mysql is running"
docker compose up -d mysql >/dev/null

if [[ "${REPLACE_DATABASE}" == "true" ]]; then
  if [[ "${SKIP_PRE_BACKUP}" != "true" ]]; then
    echo "[restore] create pre-restore backup"
    bash "${ROOT_DIR}/deploy/db-backup.sh" "pre-restore-$(date +%Y%m%d-%H%M%S)"
  fi

  echo "[restore] drop + recreate target database"
  docker compose exec -T mysql sh -lc \
    "mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\" -e \"DROP DATABASE IF EXISTS \\\`\$MYSQL_DATABASE\\\`; CREATE DATABASE \\\`\$MYSQL_DATABASE\\\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\""
else
  echo "[restore] ensure target database exists"
  docker compose exec -T mysql sh -lc \
    "mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\" -e \"CREATE DATABASE IF NOT EXISTS \\\`\$MYSQL_DATABASE\\\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\""
fi

echo "[restore] import backup from ${BACKUP_FILE}"
if [[ "${BACKUP_FILE}" == *.gz ]]; then
  gunzip -c "${BACKUP_FILE}" | docker compose exec -T mysql sh -lc \
    "mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\" \"\$MYSQL_DATABASE\""
else
  cat "${BACKUP_FILE}" | docker compose exec -T mysql sh -lc \
    "mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\" \"\$MYSQL_DATABASE\""
fi

echo "[restore] verify table count"
docker compose exec -T mysql sh -lc \
  "mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\" -e \"SELECT COUNT(*) AS total_tables FROM information_schema.tables WHERE table_schema='\$MYSQL_DATABASE';\""

echo "[restore] done"
