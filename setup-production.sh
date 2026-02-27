#!/usr/bin/env bash
set -Eeuo pipefail

DOMAIN="${DOMAIN:-financial.seribuweb.site}"
VPS_IP="${VPS_IP:-194.238.16.13}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-admin@${DOMAIN}}"
APP_DIR="${APP_DIR:-/opt/financial-app}"

FRONTEND_DIR="budget-tracker-frontend-final-main"
BACKEND_DIR="budget-tracker-backend-final"

NGINX_CONF_DIR="${APP_DIR}/deploy/nginx/conf.d"
NGINX_CONF_FILE="${NGINX_CONF_DIR}/${DOMAIN}.conf"
CERTBOT_WWW_DIR="${APP_DIR}/deploy/certbot/www"
CERTBOT_CONF_DIR="${APP_DIR}/deploy/certbot/conf"
ROOT_ENV_FILE="${APP_DIR}/.env"
BACKEND_ENV_FILE="${APP_DIR}/${BACKEND_DIR}/.env"
FRONTEND_ENV_FILE="${APP_DIR}/${FRONTEND_DIR}/.env"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Jalankan script ini sebagai root (sudo)."
  exit 1
fi

install_docker() {
  if command -v docker >/dev/null 2>&1; then
    return
  fi

  echo "[2/12] Install Docker + Compose Plugin"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
}

upsert_env() {
  local key="$1"
  local value="$2"
  local file="$3"

  if grep -q "^${key}=" "${file}"; then
    sed -i "s|^${key}=.*|${key}=${value}|g" "${file}"
  else
    printf '%s=%s\n' "${key}" "${value}" >> "${file}"
  fi
}

ensure_root_env() {
  if [[ ! -f "${ROOT_ENV_FILE}" ]]; then
    if [[ -f "${APP_DIR}/.env.example" ]]; then
      cp "${APP_DIR}/.env.example" "${ROOT_ENV_FILE}"
    else
      cat > "${ROOT_ENV_FILE}" <<EOF
DOMAIN=${DOMAIN}
BACKEND_PORT=5001
LETSENCRYPT_EMAIL=${LETSENCRYPT_EMAIL}
MYSQL_ROOT_PASSWORD=replace_with_strong_root_password
MYSQL_DATABASE=budget_tracker_prod
MYSQL_USER=budget_app
MYSQL_PASSWORD=replace_with_strong_app_password
EOF
    fi
  fi

  set -a
  # shellcheck disable=SC1090
  source "${ROOT_ENV_FILE}"
  set +a

  DOMAIN="${DOMAIN:-financial.seribuweb.site}"
  LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-admin@${DOMAIN}}"
  BACKEND_PORT="${BACKEND_PORT:-5001}"
  MYSQL_DATABASE="${MYSQL_DATABASE:-budget_tracker_prod}"
  MYSQL_USER="${MYSQL_USER:-budget_app}"
  MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-}"
  MYSQL_PASSWORD="${MYSQL_PASSWORD:-}"

  if [[ -z "${MYSQL_ROOT_PASSWORD}" || "${MYSQL_ROOT_PASSWORD}" == "replace_with_strong_root_password" ]]; then
    echo "MYSQL_ROOT_PASSWORD belum diisi valid pada ${ROOT_ENV_FILE}"
    exit 1
  fi

  if [[ -z "${MYSQL_PASSWORD}" || "${MYSQL_PASSWORD}" == "replace_with_strong_app_password" ]]; then
    echo "MYSQL_PASSWORD belum diisi valid pada ${ROOT_ENV_FILE}"
    exit 1
  fi

  upsert_env "DOMAIN" "${DOMAIN}" "${ROOT_ENV_FILE}"
  upsert_env "BACKEND_PORT" "${BACKEND_PORT}" "${ROOT_ENV_FILE}"
  upsert_env "LETSENCRYPT_EMAIL" "${LETSENCRYPT_EMAIL}" "${ROOT_ENV_FILE}"
  upsert_env "MYSQL_DATABASE" "${MYSQL_DATABASE}" "${ROOT_ENV_FILE}"
  upsert_env "MYSQL_USER" "${MYSQL_USER}" "${ROOT_ENV_FILE}"
}

ensure_backend_env() {
  if [[ ! -f "${BACKEND_ENV_FILE}" ]]; then
    if [[ -f "${APP_DIR}/${BACKEND_DIR}/.env.example" ]]; then
      cp "${APP_DIR}/${BACKEND_DIR}/.env.example" "${BACKEND_ENV_FILE}"
    else
      touch "${BACKEND_ENV_FILE}"
    fi
  fi

  upsert_env "NODE_ENV" "production" "${BACKEND_ENV_FILE}"
  upsert_env "SERVER_PORT" "${BACKEND_PORT}" "${BACKEND_ENV_FILE}"
  upsert_env "SERVER_BASE_URL" "https://${DOMAIN}" "${BACKEND_ENV_FILE}"
  upsert_env "DB_HOST" "mysql" "${BACKEND_ENV_FILE}"
  upsert_env "DB_PORT" "3306" "${BACKEND_ENV_FILE}"
  upsert_env "DB_USER" "${MYSQL_USER}" "${BACKEND_ENV_FILE}"
  upsert_env "DB_PASSWORD" "${MYSQL_PASSWORD}" "${BACKEND_ENV_FILE}"
  upsert_env "DB_DATABASE" "${MYSQL_DATABASE}" "${BACKEND_ENV_FILE}"
  upsert_env "DB_CONNECT_MAX_RETRIES" "30" "${BACKEND_ENV_FILE}"
  upsert_env "DB_CONNECT_RETRY_DELAY_MS" "2000" "${BACKEND_ENV_FILE}"

  if ! grep -q "^JWT_SECRET=" "${BACKEND_ENV_FILE}"; then
    printf 'JWT_SECRET=%s\n' "$(openssl rand -hex 32)" >> "${BACKEND_ENV_FILE}"
  fi
}

ensure_frontend_env() {
  if [[ ! -f "${FRONTEND_ENV_FILE}" ]]; then
    if [[ -f "${APP_DIR}/${FRONTEND_DIR}/.env.example" ]]; then
      cp "${APP_DIR}/${FRONTEND_DIR}/.env.example" "${FRONTEND_ENV_FILE}"
    else
      touch "${FRONTEND_ENV_FILE}"
    fi
  fi

  upsert_env "NEXT_PUBLIC_API_DEV_BASE_URL_V1" "/api/v1" "${FRONTEND_ENV_FILE}"
  upsert_env "NEXT_PUBLIC_API_PROD_BASE_URL_V1" "https://${DOMAIN}/api/v1" "${FRONTEND_ENV_FILE}"
}

write_nginx_config_http_bootstrap() {
  cat > "${NGINX_CONF_FILE}" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location /api/ {
        proxy_pass http://backend:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /uploads/ {
        proxy_pass http://backend:${BACKEND_PORT}/uploads/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / {
        proxy_pass http://frontend:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
}

write_nginx_config_https_final() {
  cat > "${NGINX_CONF_FILE}" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${DOMAIN};

    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:10m;
    ssl_prefer_server_ciphers off;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    client_max_body_size 20m;

    location /api/ {
        proxy_pass http://backend:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }

    location /uploads/ {
        proxy_pass http://backend:${BACKEND_PORT}/uploads/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }

    location / {
        proxy_pass http://frontend:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }
}
EOF
}

apply_ssh_hardening_if_enabled() {
  if [[ "${HARDEN_SSH:-false}" != "true" ]]; then
    echo "[4/12] SSH hardening dilewati (set HARDEN_SSH=true jika ingin aktifkan)."
    return
  fi

  local ssh_port="${SSH_PORT:-22}"
  local ssh_conf_file="/etc/ssh/sshd_config.d/99-financial-hardening.conf"

  echo "[4/12] Terapkan SSH hardening (port ${ssh_port})"
  cat > "${ssh_conf_file}" <<EOF
Port ${ssh_port}
Protocol 2
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
KbdInteractiveAuthentication no
PermitEmptyPasswords no
MaxAuthTries 3
X11Forwarding no
AllowTcpForwarding no
AllowAgentForwarding no
ClientAliveInterval 300
ClientAliveCountMax 2
EOF

  if systemctl is-active --quiet sshd; then
    systemctl reload sshd
  else
    systemctl reload ssh
  fi

  if [[ "${ssh_port}" != "22" ]]; then
    ufw allow "${ssh_port}/tcp"
  fi
}

echo "[1/12] Install package dasar"
apt-get update -y
apt-get install -y ca-certificates curl gnupg lsb-release ufw openssl

install_docker
systemctl enable --now docker

if [[ -n "${SUDO_USER:-}" ]]; then
  usermod -aG docker "${SUDO_USER}" || true
fi

echo "[3/12] Setup UFW"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

apply_ssh_hardening_if_enabled

echo "[5/12] Validasi project di ${APP_DIR}"
if [[ ! -d "${APP_DIR}" ]]; then
  echo "Folder ${APP_DIR} tidak ditemukan."
  exit 1
fi
cd "${APP_DIR}"

if [[ ! -d "${FRONTEND_DIR}" || ! -d "${BACKEND_DIR}" ]]; then
  echo "Folder ${FRONTEND_DIR} atau ${BACKEND_DIR} tidak ditemukan."
  exit 1
fi

echo "[6/12] Siapkan .env root / backend / frontend"
ensure_root_env
ensure_backend_env
ensure_frontend_env

mkdir -p "${NGINX_CONF_DIR}" "${CERTBOT_WWW_DIR}" "${CERTBOT_CONF_DIR}"

echo "[7/12] Tulis Nginx bootstrap config (HTTP)"
write_nginx_config_http_bootstrap

echo "[8/12] Start MySQL dan tunggu healthy"
docker compose up -d mysql
docker compose ps mysql

echo "[9/12] Jalankan migrasi database"
docker compose --profile tools run --rm migrator

echo "[10/12] Build + start backend/frontend/nginx"
docker compose up -d --build backend frontend nginx

RESOLVED_IP="$(getent ahostsv4 "${DOMAIN}" | awk '{print $1}' | head -n1 || true)"
if [[ "${RESOLVED_IP}" != "${VPS_IP}" ]]; then
  echo "DNS ${DOMAIN} belum mengarah ke ${VPS_IP} (sekarang: ${RESOLVED_IP:-tidak terdeteksi})."
  echo "Perbaiki A record dulu, lalu jalankan ulang script untuk SSL."
  exit 1
fi

if [[ ! -f "${CERTBOT_CONF_DIR}/live/${DOMAIN}/fullchain.pem" ]]; then
  echo "[11/12] Issue SSL Let's Encrypt"
  docker compose --profile tools run --rm certbot certonly \
    --webroot -w /var/www/certbot \
    -d "${DOMAIN}" \
    --email "${LETSENCRYPT_EMAIL}" \
    --agree-tos \
    --no-eff-email \
    --non-interactive
fi

echo "[12/12] Aktifkan config HTTPS final + auto-renew"
write_nginx_config_https_final
docker compose exec -T nginx nginx -t
docker compose exec -T nginx nginx -s reload

cat > /usr/local/bin/financial-certbot-renew.sh <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "${APP_DIR}"
docker compose --profile tools run --rm certbot renew --webroot -w /var/www/certbot --quiet
docker compose exec -T nginx nginx -s reload
EOF
chmod +x /usr/local/bin/financial-certbot-renew.sh

cat > /etc/cron.d/financial-certbot-renew <<'EOF'
17 3 * * * root /usr/local/bin/financial-certbot-renew.sh
EOF
chmod 644 /etc/cron.d/financial-certbot-renew

echo
echo "Selesai. Jalankan verifikasi:"
echo "1) docker compose ps"
echo "2) docker compose logs --tail=80 mysql backend nginx"
echo "3) curl -I https://${DOMAIN}"
echo "4) curl -I https://${DOMAIN}/api/v1/auth/profile"
