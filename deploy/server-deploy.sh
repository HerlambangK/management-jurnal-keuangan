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

echo "[deploy] run db migration"
docker compose --profile tools run --rm migrator

echo "[deploy] deploy app services"
docker compose up -d --build backend frontend nginx --remove-orphans

echo "[deploy] validate nginx config"
docker compose exec -T nginx nginx -t
docker compose exec -T nginx nginx -s reload

docker compose ps
docker image prune -f
