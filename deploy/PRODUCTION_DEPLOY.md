# Production Deployment (Ubuntu 20.04 + Docker)

## 1) Prasyarat DNS
- A record `financial.seribuweb.site` harus mengarah ke `194.238.16.13`.

## 2) Jalankan setup full (fresh VPS)
```bash
sudo mkdir -p /opt/financial-app
# upload/copy project ini ke /opt/financial-app
# struktur harus berisi:
# /opt/financial-app/budget-tracker-frontend-final-main
# /opt/financial-app/budget-tracker-backend-final

cd /opt/financial-app
sudo bash ./setup-production.sh
```

## 3) Deploy/update aplikasi
```bash
cd /opt/financial-app
docker compose up -d --build
docker compose ps
```

## 4) Testing routing reverse proxy
```bash
curl -I http://financial.seribuweb.site
curl -I https://financial.seribuweb.site
curl -I https://financial.seribuweb.site/api/v1/auth/profile
```

## 5) Verifikasi SSL
```bash
openssl s_client -connect financial.seribuweb.site:443 -servername financial.seribuweb.site </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates

docker compose --profile tools run --rm certbot renew --dry-run
cat /etc/cron.d/financial-certbot-renew
```

## 6) Cek firewall
```bash
sudo ufw status numbered
```
Rule yang harus terbuka:
- OpenSSH
- 80/tcp
- 443/tcp
