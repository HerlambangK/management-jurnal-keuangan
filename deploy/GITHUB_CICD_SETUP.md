# GitHub Actions CI/CD Setup

Tujuan:
- Setiap `pull_request` ke `main` menjalankan CI.
- Setiap `push` ke `main` menjalankan CI lalu deploy otomatis ke VPS.

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
ssh-copy-id -i ~/.ssh/github_actions_deploy.pub root@194.238.16.13
```

## 3) Tambahkan repository secrets

Di GitHub repo -> `Settings` -> `Secrets and variables` -> `Actions`:

- `VPS_HOST` = `194.238.16.13`
- `VPS_USER` = `root` (atau user deploy)
- `VPS_PORT` = `22`
- `VPS_SSH_KEY` = isi private key `~/.ssh/github_actions_deploy`
- `VPS_APP_DIR` = `/opt/financial-app`
- `VPS_REPO_URL` = `https://github.com/HerlambangK/management-jurnal-keuangan.git`

`VPS_REPO_URL` opsional, tapi direkomendasikan untuk first deploy otomatis jika folder app belum ada.

## 4) Alur CI/CD di workflow

1. Checkout source.
2. Install dependency frontend + build production frontend.
3. Install dependency backend + syntax check backend.
4. Jika push ke `main`, workflow SSH ke VPS.
5. Di VPS workflow menjalankan:
   - auto clone repo jika `${VPS_APP_DIR}` belum ada
   - `git fetch`, `git checkout main`, `git pull --ff-only origin main`
   - `bash ./deploy/server-deploy.sh`

`server-deploy.sh` melakukan:
- start MySQL
- memastikan database `${MYSQL_DATABASE}` tersedia
- run migrasi DB
- run seeder DB
- deploy backend/frontend/nginx
- reload nginx

## 5) Test pipeline

Push commit kecil ke `main`:

```bash
git add .
git commit -m "test: trigger ci cd"
git push origin main
```

Cek:
- GitHub -> `Actions` -> pastikan job `ci` dan `deploy` hijau.
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
