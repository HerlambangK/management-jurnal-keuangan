# Tutorial Step-by-Step Deploy ke VPS Hostinger + CI/CD GitHub Actions

Target:
- Repo: `https://github.com/HerlambangK/management-jurnal-keuangan.git`
- Domain: `financial.seribuweb.site`
- VPS IP: `194.238.16.13`
- Branch deploy: `main`

Panduan ini untuk Ubuntu VPS dengan Docker Compose.

## 1) Arahkan DNS Domain ke VPS

1. Login ke panel domain (`seribuweb.site`) di Hostinger.
2. Buka menu `DNS Zone Editor`.
3. Set `A record`:
   - Host/Name: `financial`
   - Points to: `194.238.16.13`
   - TTL: default (misal 300)
4. Hapus record `A`/`CNAME` lain yang bentrok untuk subdomain `financial`.
5. Tunggu propagasi DNS (biasanya 1-15 menit, bisa lebih lama).

Validasi dari laptop:

```bash
dig +short financial.seribuweb.site
```

Output harus berisi `194.238.16.13`.

## 2) Login VPS dan siapkan folder project

SSH ke VPS:

```bash
ssh root@194.238.16.13
```

Jika tidak pakai `root`, ganti user sesuai akun VPS.

Install package dasar:

```bash
apt update -y
apt install -y git curl
```

Clone repo ke path standar deploy:

```bash
mkdir -p /opt
cd /opt
git clone https://github.com/HerlambangK/management-jurnal-keuangan.git financial-app
cd /opt/financial-app
```

## 3) Siapkan file environment

Copy contoh env:

```bash
cp .env.example .env
cp budget-tracker-backend-final/.env.example budget-tracker-backend-final/.env
cp budget-tracker-frontend-final-main/.env.example budget-tracker-frontend-final-main/.env
```

Edit root `.env`:

```env
DOMAIN=financial.seribuweb.site
BACKEND_PORT=5001
LETSENCRYPT_EMAIL=admin@financial.seribuweb.site
MYSQL_ROOT_PASSWORD=<password-root-kuat>
MYSQL_DATABASE=budget_tracker_prod
MYSQL_USER=budget_app
MYSQL_PASSWORD=<password-app-kuat>
```

Edit backend `.env` minimal:

```env
NODE_ENV=production
SERVER_PORT=5001
SERVER_BASE_URL=https://financial.seribuweb.site
DB_HOST=mysql
DB_PORT=3306
DB_USER=budget_app
DB_PASSWORD=<password-app-kuat>
DB_DATABASE=budget_tracker_prod
JWT_SECRET=<random-very-long-secret>
OPENROUTER_API_KEY=<openrouter-key>
OPENROUTER_MODEL=meta-llama/llama-3.2-3b-instruct:free
OPENROUTER_FREE_ONLY=true
```

Edit frontend `.env`:

```env
NEXT_PUBLIC_API_DEV_BASE_URL_V1=/api/v1
NEXT_PUBLIC_API_PROD_BASE_URL_V1=https://financial.seribuweb.site/api/v1
```

## 4) Jalankan setup production pertama kali

Di VPS:

```bash
cd /opt/financial-app
sudo bash ./setup-production.sh
```

Script akan:
- install Docker + Compose
- setup firewall (SSH/80/443)
- start MySQL + memastikan database `${MYSQL_DATABASE}` tersedia
- run migration Sequelize
- run seeder default categories
- build dan start backend/frontend/nginx
- issue SSL Let's Encrypt
- pasang auto renew cert

## 5) Verifikasi aplikasi

Jalankan:

```bash
cd /opt/financial-app
docker compose ps
docker compose logs --tail=100 mysql backend frontend nginx
curl -I https://financial.seribuweb.site
curl -I https://financial.seribuweb.site/api/v1

# cek nama database aktif
docker compose exec -T mysql sh -lc 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "SHOW DATABASES;"'

# cek migrasi + jalankan seeder manual (aman, idempotent)
docker compose --profile tools run --rm migrator npm run migrate:status
docker compose --profile tools run --rm seeder
```

Jika semua benar, status container `Up` dan domain bisa diakses HTTPS.

## 6) Siapkan SSH key untuk GitHub Actions

Di laptop lokal:

```bash
ssh-keygen -t ed25519 -C "gha-financial-deploy" -f ~/.ssh/gha_financial_deploy
```

Copy public key ke VPS:

```bash
ssh-copy-id -i ~/.ssh/gha_financial_deploy.pub root@194.238.16.13
```

Test login key:

```bash
ssh -i ~/.ssh/gha_financial_deploy root@194.238.16.13
```

## 7) Isi GitHub Actions Secrets

Masuk ke repo GitHub:
- `Settings` -> `Secrets and variables` -> `Actions` -> `New repository secret`

Isi secret berikut:
- `VPS_HOST` = `194.238.16.13`
- `VPS_USER` = `root` (atau user deploy kamu)
- `VPS_PORT` = `22`
- `VPS_SSH_KEY` = isi file private key `~/.ssh/gha_financial_deploy` (full termasuk `BEGIN`/`END`)
- `VPS_APP_DIR` = `/opt/financial-app`
- `VPS_REPO_URL` = `https://github.com/HerlambangK/management-jurnal-keuangan.git`

## 8) CI/CD yang sudah disiapkan di repo

Workflow: `.github/workflows/ci-cd.yml`

Alur:
1. Saat `pull_request` dan `push` ke `main`: jalankan CI build frontend + syntax check backend.
2. Saat `push` ke `main`: deploy ke VPS via SSH.
3. Jika folder app belum ada di VPS, workflow otomatis `git clone`.
4. Workflow menjalankan `bash ./deploy/server-deploy.sh`.

## 9) Trigger deploy otomatis

Dari lokal:

```bash
git add .
git commit -m "chore: setup hostinger deploy and ci cd"
git push origin main
```

Cek hasil di GitHub tab `Actions`.

## 10) Operasional harian di VPS

Update manual (jika dibutuhkan):

```bash
cd /opt/financial-app
git pull --ff-only origin main
bash ./deploy/server-deploy.sh
```

Cek logs:

```bash
cd /opt/financial-app
docker compose logs -f --tail=200 backend frontend nginx
```

Rollback cepat:

```bash
cd /opt/financial-app
git log --oneline -n 5
git checkout <commit-sebelumnya>
bash ./deploy/server-deploy.sh
```
