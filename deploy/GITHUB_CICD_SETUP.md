# GitHub Actions CI/CD Setup

Tujuan:
- Setiap push ke `main` akan menjalankan CI.
- Jika CI sukses, server VPS otomatis pull update, migrasi DB, dan redeploy Docker.

## 1. Persiapan di VPS (sekali saja)
Jalankan setup produksi dulu:

```bash
cd /opt/financial-app
sudo bash ./setup-production.sh
```

Pastikan repo di VPS ada di path:
- `/opt/financial-app`

Jika beda path, nanti isi di secret `VPS_APP_DIR`.

## 2. Buat SSH key untuk GitHub Actions
Di laptop lokal:

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_actions_deploy
```

Tambahkan public key ke VPS:

```bash
ssh-copy-id -i ~/.ssh/github_actions_deploy.pub <user>@194.238.16.13
```

## 3. Tambah GitHub Secrets
Di GitHub repo -> `Settings` -> `Secrets and variables` -> `Actions`:

- `VPS_HOST` = `194.238.16.13`
- `VPS_USER` = user ssh di server (contoh: `ubuntu`)
- `VPS_PORT` = `22`
- `VPS_SSH_KEY` = isi private key `~/.ssh/github_actions_deploy`
- `VPS_APP_DIR` = `/opt/financial-app`

## 4. Workflow yang digunakan
File workflow:
- `.github/workflows/ci-cd.yml`

Alur:
1. CI build frontend + syntax check backend.
2. Jika push ke `main` dan CI sukses -> SSH ke VPS.
3. VPS menjalankan:
   - `git pull --ff-only origin main`
   - `bash ./deploy/server-deploy.sh`

`server-deploy.sh` sudah mencakup:
- start service MySQL
- run migrasi (`docker compose --profile tools run --rm migrator`)
- redeploy backend/frontend/nginx
- validasi reload nginx

## 5. Test pipeline
Commit kecil lalu push:

```bash
git add .
git commit -m "test: trigger ci cd"
git push origin main
```

Lihat hasil:
- GitHub -> `Actions`
- VPS:

```bash
cd /opt/financial-app
docker compose ps
docker compose logs --tail=100 nginx frontend backend
```

## 6. Rollback cepat jika deploy bermasalah
Di VPS:

```bash
cd /opt/financial-app
git log --oneline -n 5
git checkout <commit-sebelumnya>
bash ./deploy/server-deploy.sh
```
