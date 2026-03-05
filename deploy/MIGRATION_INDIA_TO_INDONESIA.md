# Runbook Migrasi Server India ke Indonesia

Tujuan:
- Pindah production dari VPS India ke VPS Indonesia.
- Menekan risiko kehilangan data dengan backup berlapis + restore terverifikasi.
- Tetap pakai auto deploy GitHub Actions dan sinkron status deploy ke Telegram.

## 0) Variabel yang dipakai

Sesuaikan dulu:

```bash
OLD_VPS_IP=194.238.16.13
NEW_VPS_IP=<ip-vps-indonesia>
APP_DIR=/opt/financial-app
DOMAIN=financial.seribuweb.site
```

## 1) H-1 (persiapan sebelum cutover)

1. Turunkan TTL DNS record `A` untuk `financial.seribuweb.site` ke `300`.
2. Freeze merge besar ke branch `main` sampai migrasi selesai.
3. Siapkan VPS Indonesia:
   - install OS + hardening basic.
   - clone repo ke `${APP_DIR}`.
   - isi `.env`, backend `.env`, frontend `.env`.
4. Jalankan setup awal di VPS Indonesia:

```bash
cd /opt/financial-app
sudo bash ./setup-production.sh
```

5. Pastikan GitHub Actions secrets sudah siap:
   - `VPS_HOST`, `VPS_USER`, `VPS_PORT`, `VPS_SSH_KEY`, `VPS_APP_DIR`, `VPS_REPO_URL`
   - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`

## 2) Copy data awal (dry run, tanpa cutover)

Di VPS India (old):

```bash
cd /opt/financial-app
bash ./deploy/db-backup.sh
ls -lah backups/mysql | tail -n 3
```

Transfer backup terakhir ke VPS Indonesia:

```bash
scp /opt/financial-app/backups/mysql/<backup-file>.sql.gz root@<ip-vps-indonesia>:/opt/financial-app/backups/mysql/
scp /opt/financial-app/backups/mysql/<backup-file>.sql.gz.sha256 root@<ip-vps-indonesia>:/opt/financial-app/backups/mysql/
```

Di VPS Indonesia (new):

```bash
cd /opt/financial-app
sha256sum -c backups/mysql/<backup-file>.sql.gz.sha256
bash ./deploy/db-restore.sh --file ./backups/mysql/<backup-file>.sql.gz --replace-database
bash ./deploy/server-deploy.sh
```

Validasi cepat:

```bash
docker compose ps
curl -I https://financial.seribuweb.site
curl -sS http://127.0.0.1/api/v1/health
```

## 3) Cutover day (window downtime singkat)

1. Umumkan maintenance singkat.
2. Stop trafik tulis di server India:

```bash
cd /opt/financial-app
docker compose stop frontend backend
```

3. Ambil backup final dari server India:

```bash
cd /opt/financial-app
bash ./deploy/db-backup.sh final-cutover-$(date +%Y%m%d-%H%M%S)
```

4. Transfer backup final + checksum ke server Indonesia.
5. Restore backup final di server Indonesia:

```bash
cd /opt/financial-app
bash ./deploy/db-restore.sh --file ./backups/mysql/<backup-final>.sql.gz --replace-database
bash ./deploy/server-deploy.sh
```

6. Update secret `VPS_HOST` GitHub Actions ke IP server Indonesia.
7. Push commit kecil ke `main` untuk validasi auto deploy + notifikasi Telegram.
8. Arahkan DNS `A record` domain ke `NEW_VPS_IP`.
9. Tunggu propagasi (TTL 300 biasanya cepat), lalu smoke test ulang.

## 4) Verifikasi pasca cutover

Di VPS Indonesia:

```bash
cd /opt/financial-app
docker compose ps
docker compose logs --tail=120 mysql backend frontend nginx
ls -lah backups/mysql | tail -n 5
```

Di GitHub:
- Workflow `CI-CD Production Deploy` harus hijau.

Di Telegram:
- Ada pesan `DEPLOY STARTED` lalu `DEPLOY SUCCESS`.

## 5) Rollback plan (jika produksi bermasalah)

1. Ubah DNS `A record` kembali ke `OLD_VPS_IP`.
2. Kembalikan secret `VPS_HOST` ke server India.
3. Jalankan deploy commit stabil terakhir di server India:

```bash
cd /opt/financial-app
git log --oneline -n 5
git checkout <last-good-commit>
bash ./deploy/server-deploy.sh
```

4. Setelah stabil, investigasi server Indonesia dan ulangi cutover pada window berikutnya.
