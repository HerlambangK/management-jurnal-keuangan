# GitHub Actions CI/CD Setup

Tujuan:
- Setiap `pull_request` ke `main` menjalankan CI.
- Setiap `push` ke `main` menjalankan CI lalu deploy otomatis ke VPS.
- Setiap deploy kirim status sinkron ke Telegram (`started`, `success`, `failed`).

Workflow file:
- `.github/workflows/ci-cd.yml`

## 1) Prasyarat di VPS

Pastikan deploy manual pertama sudah berhasil:

```bash
cd /opt/financial-app
sudo bash ./setup-production.sh
```

Jika belum punya folder project:

```bash
mkdir -p /opt
cd /opt
git clone https://github.com/HerlambangK/management-jurnal-keuangan.git financial-app
```

## 2) Buat SSH key khusus GitHub Actions

Di lokal:

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_actions_deploy
```

Daftarkan public key ke VPS:

```bash
ssh-copy-id -i ~/.ssh/github_actions_deploy.pub root@31.97.222.155
```

## 3) Tambahkan repository secrets

Di GitHub repo -> `Settings` -> `Secrets and variables` -> `Actions`:

- `VPS_HOST` = `31.97.222.155`
- `VPS_USER` = `root` (atau user deploy)
- `VPS_PORT` = `22`
- `VPS_SSH_KEY` = isi private key `~/.ssh/github_actions_deploy`
- `VPS_APP_DIR` = `/opt/financial-app`
- `VPS_REPO_URL` = `https://github.com/HerlambangK/management-jurnal-keuangan.git`
- `TELEGRAM_BOT_TOKEN` = token bot Telegram (opsional, untuk notifikasi)
- `TELEGRAM_CHAT_ID` = chat id tujuan (opsional, untuk notifikasi)

`VPS_REPO_URL` opsional, tapi direkomendasikan untuk first deploy otomatis jika folder app belum ada.
`TELEGRAM_*` opsional, tapi wajib jika ingin sinkron status deploy ke Telegram.

## 4) Alur CI/CD di workflow

1. Checkout source.
2. Install dependency frontend + build production frontend.
3. Install dependency backend + syntax check backend.
4. Jika push ke `main`, workflow SSH ke VPS.
5. Workflow kirim notifikasi Telegram `DEPLOY STARTED`.
6. Di VPS workflow menjalankan:
   - auto clone repo jika `${VPS_APP_DIR}` belum ada
   - `git fetch`, `git checkout main`, `git pull --ff-only origin main`
   - `bash ./deploy/server-deploy.sh`
7. Workflow kirim notifikasi Telegram `DEPLOY SUCCESS` atau `DEPLOY FAILED`.

`server-deploy.sh` melakukan:
- backup otomatis DB sebelum deploy (default `BACKUP_BEFORE_DEPLOY=true`)
- start MySQL
- memastikan database `${MYSQL_DATABASE}` tersedia
- run migrasi DB
- run seeder DB
- deploy backend/frontend/nginx
- reload nginx
- healthcheck URL aplikasi dan API

## 5) Test pipeline

Push commit kecil ke `main`:

```bash
git add .
git commit -m "test: trigger ci cd"
git push origin main
```

Cek:
- GitHub -> `Actions` -> pastikan job `ci` dan `deploy` hijau.
- Telegram -> ada pesan `DEPLOY STARTED` lalu `DEPLOY SUCCESS`.
- VPS:

```bash
cd /opt/financial-app
docker compose ps
docker compose logs --tail=100 nginx frontend backend
```

## 6) Rollback cepat jika deploy bermasalah

Di VPS:

```bash
cd /opt/financial-app
git log --oneline -n 5
git checkout <commit-sebelumnya>
bash ./deploy/server-deploy.sh
```

Jika butuh rollback data:

```bash
cd /opt/financial-app
ls -lah backups/mysql
bash ./deploy/db-restore.sh --file ./backups/mysql/<backup-file>.sql.gz --replace-database
bash ./deploy/server-deploy.sh
```
