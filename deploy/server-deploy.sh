#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

wait_http_status() {
  local url="$1"
  local max_attempts="${2:-20}"
  local sleep_seconds="${3:-3}"
  local expected_status_regex="${4:-2|3}"

  for attempt in $(seq 1 "${max_attempts}"); do
    local status_code
    status_code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "${url}" || true)"

    if [[ "${status_code}" =~ ^(${expected_status_regex})[0-9]{2}$ ]]; then
      echo "[deploy] healthcheck OK: ${url} status=${status_code} (attempt ${attempt}/${max_attempts})"
      return 0
    fi

    echo "[deploy] waiting healthcheck: ${url} status=${status_code:-000} (attempt ${attempt}/${max_attempts})"
    sleep "${sleep_seconds}"
  done

  echo "[deploy] healthcheck failed: ${url}"
  return 1
}

wait_backend_api_ok() {
  local path="${1:-/api/v1/health}"
  local max_attempts="${2:-20}"
  local sleep_seconds="${3:-3}"

  for attempt in $(seq 1 "${max_attempts}"); do
    if docker compose exec -T backend node -e "const port = process.env.SERVER_PORT || 5001; fetch('http://127.0.0.1:' + port + '${path}').then((r) => process.exit(r.status === 200 ? 0 : 1)).catch(() => process.exit(1));" >/dev/null 2>&1; then
      echo "[deploy] backend API OK: ${path} (attempt ${attempt}/${max_attempts})"
      return 0
    fi

    echo "[deploy] waiting backend API: ${path} (attempt ${attempt}/${max_attempts})"
    sleep "${sleep_seconds}"
  done

  echo "[deploy] backend API failed: ${path}"
  return 1
}

if [[ -f "${ROOT_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT_DIR}/.env"
  set +a
fi

BACKUP_BEFORE_DEPLOY="${BACKUP_BEFORE_DEPLOY:-true}"
APP_HEALTHCHECK_URL="${APP_HEALTHCHECK_URL:-https://${DOMAIN:-financial.seribuweb.site}}"
API_HEALTHCHECK_URL="${API_HEALTHCHECK_URL:-https://${DOMAIN:-financial.seribuweb.site}/api/v1/health}"
API_HEALTHCHECK_PATH="${API_HEALTHCHECK_PATH:-/api/v1/health}"

if [[ "${BACKUP_BEFORE_DEPLOY}" == "true" ]]; then
  echo "[deploy] create pre-deploy backup"
  bash "${ROOT_DIR}/deploy/db-backup.sh" "pre-deploy-$(date +%Y%m%d-%H%M%S)"
else
  echo "[deploy] skip pre-deploy backup (BACKUP_BEFORE_DEPLOY=${BACKUP_BEFORE_DEPLOY})"
fi

echo "[deploy] start mysql"
docker compose up -d mysql

echo "[deploy] ensure database exists"
docker compose exec -T mysql sh -lc "mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\" -e \"CREATE DATABASE IF NOT EXISTS \\\`\$MYSQL_DATABASE\\\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\""
docker compose exec -T mysql sh -lc "mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\" -e \"SHOW DATABASES LIKE '\$MYSQL_DATABASE';\""

echo "[deploy] run db migration"
docker compose --profile tools run --rm migrator

echo "[deploy] run db seeder"
docker compose --profile tools run --rm seeder

echo "[deploy] deploy app services"
docker compose up -d --build backend frontend nginx --remove-orphans

echo "[deploy] validate nginx config"
docker compose exec -T nginx nginx -t
docker compose exec -T nginx nginx -s reload

echo "[deploy] run post-deploy healthcheck"
wait_http_status "${APP_HEALTHCHECK_URL}" 20 3 "2|3"
wait_http_status "${API_HEALTHCHECK_URL}" 20 3 "2"
wait_backend_api_ok "${API_HEALTHCHECK_PATH}" 20 3

docker compose ps
docker image prune -f
