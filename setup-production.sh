#!/usr/bin/env bash
set -Eeuo pipefail

DOMAIN="financial.seribuweb.site"
VPS_IP="194.238.16.13"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-admin@financial.seribuweb.site}"
APP_DIR="${APP_DIR:-/opt/financial-app}"

FRONTEND_DIR="budget-tracker-frontend-final-main"
BACKEND_DIR="budget-tracker-backend-final"

NGINX_CONF_DIR="${APP_DIR}/deploy/nginx/conf.d"
NGINX_CONF_FILE="${NGINX_CONF_DIR}/${DOMAIN}.conf"
CERTBOT_WWW_DIR="${APP_DIR}/deploy/certbot/www"
CERTBOT_CONF_DIR="${APP_DIR}/deploy/certbot/conf"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Jalankan script ini sebagai root (sudo)."
  exit 1
fi

echo "[1/10] Install package dasar"
apt-get update -y
apt-get install -y ca-certificates curl gnupg lsb-release ufw

if ! command -v docker >/dev/null 2>&1; then
  echo "[2/10] Install Docker + Compose Plugin"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

systemctl enable --now docker

if [[ -n "${SUDO_USER:-}" ]]; then
  usermod -aG docker "${SUDO_USER}" || true
fi

echo "[3/10] Setup UFW"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "[4/10] Validasi struktur project di ${APP_DIR}"
if [[ ! -d "${APP_DIR}" ]]; then
  echo "Folder ${APP_DIR} tidak ditemukan."
  echo "Upload/clone source code monorepo ke ${APP_DIR} lalu jalankan ulang script."
  exit 1
fi

cd "${APP_DIR}"

if [[ ! -d "${FRONTEND_DIR}" || ! -d "${BACKEND_DIR}" ]]; then
  echo "Folder ${FRONTEND_DIR} atau ${BACKEND_DIR} tidak ditemukan di ${APP_DIR}."
  exit 1
fi

detect_backend_port() {
  local port=""
  local backend_env="${APP_DIR}/${BACKEND_DIR}/.env"
  local backend_env_example="${APP_DIR}/${BACKEND_DIR}/.env.example"
  local backend_config_js="${APP_DIR}/${BACKEND_DIR}/src/config/config.js"

  if [[ -f "${backend_env}" ]]; then
    port=$(grep -E '^SERVER_PORT=' "${backend_env}" | tail -n 1 | cut -d '=' -f2 | tr -d '[:space:]' || true)
  fi

  if [[ -z "${port}" && -f "${backend_env_example}" ]]; then
    port=$(grep -E '^SERVER_PORT=' "${backend_env_example}" | tail -n 1 | cut -d '=' -f2 | tr -d '[:space:]' || true)
  fi

  if [[ -z "${port}" && -f "${backend_config_js}" ]]; then
    port=$(grep -Eo 'SERVER_PORT\)\s*\|\|\s*[0-9]+' "${backend_config_js}" | grep -Eo '[0-9]+' | head -n 1 || true)
  fi

  if [[ -z "${port}" ]]; then
    port="4000"
  fi

  echo "${port}"
}

BACKEND_PORT="$(detect_backend_port)"
export BACKEND_PORT

echo "[5/10] Backend port terdeteksi: ${BACKEND_PORT}"

if [[ ! -f "${APP_DIR}/${BACKEND_DIR}/.env" && -f "${APP_DIR}/${BACKEND_DIR}/.env.example" ]]; then
  cp "${APP_DIR}/${BACKEND_DIR}/.env.example" "${APP_DIR}/${BACKEND_DIR}/.env"
  echo "File ${BACKEND_DIR}/.env dibuat dari .env.example. Lengkapi secret/DB sebelum produksi penuh."
fi

mkdir -p "${NGINX_CONF_DIR}" "${CERTBOT_WWW_DIR}" "${CERTBOT_CONF_DIR}"

echo "[6/10] Tulis Nginx bootstrap config (HTTP)"
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

echo "[7/10] Build dan jalankan stack"
docker compose up -d --build frontend backend nginx

RESOLVED_IP="$(getent ahostsv4 "${DOMAIN}" | awk '{print $1}' | head -n1 || true)"
if [[ "${RESOLVED_IP}" != "${VPS_IP}" ]]; then
  echo "DNS domain ${DOMAIN} belum mengarah ke ${VPS_IP} (saat ini: ${RESOLVED_IP:-tidak terdeteksi})."
  echo "Perbaiki A record dulu, lalu jalankan ulang script untuk issue SSL."
  exit 1
fi

if [[ ! -f "${CERTBOT_CONF_DIR}/live/${DOMAIN}/fullchain.pem" ]]; then
  echo "[8/10] Issue SSL Let's Encrypt"
  docker compose --profile tools run --rm certbot certonly \
    --webroot -w /var/www/certbot \
    -d "${DOMAIN}" \
    --email "${LETSENCRYPT_EMAIL}" \
    --agree-tos \
    --no-eff-email \
    --non-interactive
fi

echo "[9/10] Tulis Nginx final config (HTTPS + /api routing)"
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

docker compose exec -T nginx nginx -t
docker compose exec -T nginx nginx -s reload

echo "[10/10] Setup auto-renew SSL"
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
echo "Deployment selesai."
echo "Cek status: docker compose ps"
echo "Cek firewall: ufw status"
echo "Cek domain: https://${DOMAIN}"
