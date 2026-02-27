# Production Deployment (Ubuntu 20.04 + Docker + Nginx + SSL)

Dokumen ini untuk deploy monorepo:
- `budget-tracker-frontend-final-main` (Next.js)
- `budget-tracker-backend-final` (Node.js + Sequelize)

Domain target:
- `financial.seribuweb.site`

## 1) Prasyarat VPS
- DNS A record `financial.seribuweb.site` harus mengarah ke IP VPS.
- VPS Ubuntu 20.04 fresh.
- Akses SSH key-based login sudah siap.

## 2) Struktur direktori server
Contoh:

```bash
/opt/financial-app
├── docker-compose.yml
├── setup-production.sh
├── .env
├── budget-tracker-frontend-final-main/
├── budget-tracker-backend-final/
└── deploy/
```

## 3) Isi file `.env` root (WAJIB)
Buat `/opt/financial-app/.env` dari `.env.example`:

```bash
cp .env.example .env
```

Isi minimal:

```env
DOMAIN=financial.seribuweb.site
BACKEND_PORT=5001
LETSENCRYPT_EMAIL=admin@financial.seribuweb.site

MYSQL_ROOT_PASSWORD=<password-root-mysql-kuat>
MYSQL_DATABASE=budget_tracker_prod
MYSQL_USER=budget_app
MYSQL_PASSWORD=<password-app-db-kuat>
```

## 4) Isi file backend `.env` (WAJIB)
Jika belum ada:

```bash
cp budget-tracker-backend-final/.env.example budget-tracker-backend-final/.env
```

Contoh production:

```env
NODE_ENV=production
SERVER_PORT=5001
SERVER_BASE_URL=https://financial.seribuweb.site

DB_HOST=mysql
DB_PORT=3306
DB_USER=budget_app
DB_PASSWORD=<password-app-db-kuat>
DB_DATABASE=budget_tracker_prod
DB_CONNECT_MAX_RETRIES=30
DB_CONNECT_RETRY_DELAY_MS=2000

GEMINI_API_KEY=<isi>
OPENROUTER_API_KEY=<isi>
JWT_SECRET=<random-very-long-secret>
```

## 5) Isi file frontend `.env`
Jika belum ada:

```bash
cp budget-tracker-frontend-final-main/.env.example budget-tracker-frontend-final-main/.env
```

Isi:

```env
NEXT_PUBLIC_API_DEV_BASE_URL_V1=/api/v1
NEXT_PUBLIC_API_PROD_BASE_URL_V1=https://financial.seribuweb.site/api/v1
```

## 6) Jalankan setup full pertama kali

```bash
cd /opt/financial-app
sudo bash ./setup-production.sh
```

Script akan:
1. Install Docker + Compose + UFW.
2. Buka port `OpenSSH`, `80`, `443`.
3. Start MySQL.
4. Jalankan migrasi DB (`npm run migrate`) via service `migrator`.
5. Build/start backend, frontend, nginx.
6. Issue SSL Let's Encrypt.
7. Setup auto-renew certbot harian.

## 7) Deploy update berikutnya (CI/CD atau manual)

```bash
cd /opt/financial-app
bash ./deploy/server-deploy.sh
```

Script deploy akan:
1. start/update MySQL
2. jalankan migrasi
3. build+redeploy backend/frontend/nginx
4. validasi dan reload nginx

## 8) Verifikasi wajib

```bash
docker compose ps
docker compose logs --tail=120 mysql backend nginx
curl -I https://financial.seribuweb.site
curl -I https://financial.seribuweb.site/api/v1/auth/profile
```

Verifikasi sertifikat:

```bash
openssl s_client -connect financial.seribuweb.site:443 -servername financial.seribuweb.site </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates
```

## 9) SSH hardening (opsional tapi direkomendasikan)
Jika siap menggunakan login SSH key-only:

```bash
cd /opt/financial-app
sudo HARDEN_SSH=true SSH_PORT=22 bash ./setup-production.sh
```

Catatan:
- Pastikan key SSH sudah terpasang sebelum aktifkan.
- Jika ganti port SSH, buka juga port tersebut di UFW.

## 10) Troubleshooting cepat

### Backend error `EAI_AGAIN mysql`
Artinya backend belum resolve DNS service `mysql`.

Cek:
```bash
docker compose ps
docker inspect financial-app-backend-1 --format '{{json .NetworkSettings.Networks}}'
docker inspect financial-mysql --format '{{json .NetworkSettings.Networks}}'
```

Perbaikan:
```bash
docker compose up -d mysql
docker compose --profile tools run --rm migrator
docker compose up -d backend
docker compose logs -f backend
```

### SSL belum aktif
Pastikan DNS domain ke IP VPS sudah benar, lalu ulang:

```bash
docker compose --profile tools run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d financial.seribuweb.site \
  --email admin@financial.seribuweb.site \
  --agree-tos --no-eff-email --non-interactive
docker compose exec -T nginx nginx -s reload
```
