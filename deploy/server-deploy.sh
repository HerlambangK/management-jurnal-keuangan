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

docker compose ps
docker image prune -f
