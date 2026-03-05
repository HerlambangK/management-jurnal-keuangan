#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if [[ -f "${ROOT_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT_DIR}/.env"
  set +a
fi

: "${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD is required in root .env}"
: "${MYSQL_DATABASE:?MYSQL_DATABASE is required in root .env}"

BACKUP_DIR="${DB_BACKUP_DIR:-${ROOT_DIR}/backups/mysql}"
RETENTION_DAYS="${DB_BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP="${1:-$(date +%Y%m%d-%H%M%S)}"
BACKUP_FILE="${BACKUP_DIR}/db-${MYSQL_DATABASE}-${TIMESTAMP}.sql"
ARCHIVE_FILE="${BACKUP_FILE}.gz"

mkdir -p "${BACKUP_DIR}"

echo "[backup] ensure mysql is running"
docker compose up -d mysql >/dev/null

echo "[backup] create SQL dump"
docker compose exec -T mysql sh -lc \
  "mysqldump -uroot -p\"\$MYSQL_ROOT_PASSWORD\" --single-transaction --quick --routines --events --triggers \"\$MYSQL_DATABASE\"" \
  > "${BACKUP_FILE}"

echo "[backup] compress dump"
gzip -f "${BACKUP_FILE}"
sha256sum "${ARCHIVE_FILE}" > "${ARCHIVE_FILE}.sha256"

if [[ "${RETENTION_DAYS}" =~ ^[0-9]+$ ]] && (( RETENTION_DAYS > 0 )); then
  echo "[backup] remove files older than ${RETENTION_DAYS} days"
  find "${BACKUP_DIR}" -type f \( -name '*.sql.gz' -o -name '*.sql.gz.sha256' \) -mtime +"${RETENTION_DAYS}" -delete
fi

echo "[backup] done: ${ARCHIVE_FILE}"
