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
VPS_IP=31.97.222.155
BACKEND_PORT=5001
LETSENCRYPT_EMAIL=admin@financial.seribuweb.site

MYSQL_ROOT_PASSWORD=<password-root-mysql-kuat>
MYSQL_DATABASE=budget_tracker_prod
MYSQL_USER=budget_app
MYSQL_PASSWORD=<password-app-db-kuat>
MYSQL_BIND_ADDRESS=127.0.0.1
MYSQL_EXTERNAL_PORT=3306
BACKUP_BEFORE_DEPLOY=true
DB_BACKUP_DIR=./backups/mysql
DB_BACKUP_RETENTION_DAYS=14
APP_HEALTHCHECK_URL=https://financial.seribuweb.site
API_HEALTHCHECK_URL=https://financial.seribuweb.site/api/v1/health
API_HEALTHCHECK_PATH=/api/v1/health
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
3. Start MySQL + memastikan database `${MYSQL_DATABASE}` tersedia.
4. Jalankan migrasi DB (`npm run migrate`) via service `migrator`.
5. Jalankan seeder DB (`npm run seed`) via service `seeder`.
6. Build/start backend, frontend, nginx.
7. Issue SSL Let's Encrypt.
8. Setup auto-renew certbot harian.

## 7) Deploy update berikutnya (CI/CD atau manual)

```bash
cd /opt/financial-app
bash ./deploy/server-deploy.sh
```

Script deploy akan:
1. backup DB sebelum deploy
2. start/update MySQL
3. pastikan database `${MYSQL_DATABASE}` tersedia
4. jalankan migrasi
5. jalankan seeder
6. build+redeploy backend/frontend/nginx
7. validasi dan reload nginx
8. jalankan healthcheck aplikasi

## 8) Verifikasi wajib

```bash
docker compose ps
docker compose logs --tail=120 mysql backend nginx
curl -I https://financial.seribuweb.site
curl -I https://financial.seribuweb.site/api/v1/auth/profile

# cek database aktif
docker compose exec -T mysql sh -lc 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "SHOW DATABASES;"'

# cek status migrasi dan seeder
docker compose --profile tools run --rm migrator npm run migrate:status
docker compose --profile tools run --rm seeder npm run seed
```

Backup/restore manual:

```bash
# backup sekarang
bash ./deploy/db-backup.sh

# restore dari file backup (replace database)
bash ./deploy/db-restore.sh --file ./backups/mysql/<nama-file>.sql.gz --replace-database
```

Verifikasi sertifikat:

```bash
openssl s_client -connect financial.seribuweb.site:443 -servername financial.seribuweb.site </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates
```

## 9) Akses DB via DBeaver (aman)

Disarankan pakai SSH tunnel (jangan expose DB ke internet).

Setting DBeaver:
- Connection: MySQL
- Host: `127.0.0.1`
- Port: `3306` (atau `MYSQL_EXTERNAL_PORT`)
- Database: `${MYSQL_DATABASE}`
- Username: `${MYSQL_USER}` (atau `root`)
- Password: `${MYSQL_PASSWORD}` (atau `${MYSQL_ROOT_PASSWORD}`)

Tab SSH di DBeaver:
- Use SSH Tunnel: ON
- SSH Host: IP VPS
- SSH Port: `22`
- SSH User: user SSH VPS (`root`/deploy user)
- Auth: Private Key (key SSH kamu)

Catatan:
- Dengan `MYSQL_BIND_ADDRESS=127.0.0.1`, port MySQL hanya terbuka di localhost server.
- Jika ingin direct access tanpa SSH tunnel, baru set `MYSQL_BIND_ADDRESS=0.0.0.0` + batasi firewall ke IP kantor/laptop saja.

## 10) SSH hardening (opsional tapi direkomendasikan)
Jika siap menggunakan login SSH key-only:

```bash
cd /opt/financial-app
sudo HARDEN_SSH=true SSH_PORT=22 bash ./setup-production.sh
```

Catatan:
- Pastikan key SSH sudah terpasang sebelum aktifkan.
- Jika ganti port SSH, buka juga port tersebut di UFW.

## 11) Troubleshooting cepat

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
