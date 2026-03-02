# jurnal-keuangan

## Deployment
- Tutorial Hostinger VPS + CI/CD: [deploy/HOSTINGER_VPS_STEP_BY_STEP.md](deploy/HOSTINGER_VPS_STEP_BY_STEP.md)
- Setup production VPS: [deploy/PRODUCTION_DEPLOY.md](deploy/PRODUCTION_DEPLOY.md)
- Setup CI/CD GitHub Actions: [deploy/GITHUB_CICD_SETUP.md](deploy/GITHUB_CICD_SETUP.md)

## Quick Start (Production)
```bash
cp .env.example .env
cp budget-tracker-backend-final/.env.example budget-tracker-backend-final/.env
cp budget-tracker-frontend-final-main/.env.example budget-tracker-frontend-final-main/.env

# sesuaikan password/secret pada file .env
sudo bash ./setup-production.sh
```
