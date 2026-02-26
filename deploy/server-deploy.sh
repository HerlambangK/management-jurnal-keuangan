#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

detect_backend_port() {
  local port=""
  if [[ -f "budget-tracker-backend-final/.env" ]]; then
    port="$(grep -E '^SERVER_PORT=' budget-tracker-backend-final/.env | tail -n 1 | cut -d '=' -f2 | tr -d '[:space:]' || true)"
  fi

  if [[ -z "${port}" && -f "budget-tracker-backend-final/.env.example" ]]; then
    port="$(grep -E '^SERVER_PORT=' budget-tracker-backend-final/.env.example | tail -n 1 | cut -d '=' -f2 | tr -d '[:space:]' || true)"
  fi

  if [[ -z "${port}" ]]; then
    port="5001"
  fi

  echo "${port}"
}

export BACKEND_PORT="$(detect_backend_port)"
echo "[deploy] BACKEND_PORT=${BACKEND_PORT}"

docker compose up -d --build --remove-orphans
docker compose ps
docker image prune -f
