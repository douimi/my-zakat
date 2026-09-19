# My Zakat App - Production Deployment Guide

## Overview
This guide covers deploying your My Zakat app to a VPS using Docker, Traefik for reverse proxy, and SSL certificates.

## Prerequisites
- Ubuntu VPS (31.97.131.31)
- Domain: myzakat.org pointing to your VPS
- Docker and Docker Compose installed

## Quick Deployment Steps

### 1. VPS Setup
```bash
# On your VPS, run:
bash setup-vps.sh
```

### 2. DNS Configuration
Point your domain to your VPS:
- `myzakat.org` → `31.97.131.31`
- `traefik.myzakat.org` → `31.97.131.31`

### 3. Environment Configuration
Edit `env.production` with your actual values:
- Database passwords
- Stripe keys (production)
- Email configuration
- Secret keys

### 4. Deploy Application
```bash
# Make deployment script executable
chmod +x deploy.sh

# Run deployment
./deploy.sh
```

## Database Migrations

`migrations/init.sql` is mounted into the database container and only runs on a
fresh volume. Every numbered file in `migrations/` after that is applied by
hand — neither `deploy.sh` nor the GitHub Actions deploy job runs them:

```bash
docker-compose -f docker-compose.traefik.yml exec -T db \
  psql -U myzakat_user -d myzakat < migrations/NN_name.sql
```

Most migrations are additive and can go before or after the deploy they belong
to. **Proposal versioning (32 and 33) cannot.** Apply them around the deploy, in
this order:

### 1. `32_proposal_versioning.sql` — BEFORE deploying the new backend

Creates `proposal_versions` and `proposal_access_codes`, adds
`project_proposals.current_version_id`, backfills a version 1 for every existing
proposal, and drops the NOT NULL constraints on the legacy content columns.
Additive and idempotent; the running image keeps working after it.

It must come first: the new code inserts dossier rows that carry no content, and
against the un-relaxed schema those inserts fail.

### 2. Deploy the new backend

Push to `main`, or run `./deploy.sh`.

### 3. `33_drop_proposal_content_columns.sql` — AFTER the deploy

Drops the content columns (and `admin_notes`) from `project_proposals`.

It must come last: the previous image still writes those columns, so running it
while the old image is live breaks every submission. Destructive and with no
down script — take a dump first, and confirm the backfill:

```bash
docker-compose -f docker-compose.traefik.yml exec -T db \
  psql -U myzakat_user -d myzakat \
  -c "SELECT count(*) FROM project_proposals WHERE current_version_id IS NULL;"
# must return 0
```

## Services
- **Frontend**: https://myzakat.org
- **Backend API**: https://myzakat.org/api
- **Traefik Dashboard**: https://traefik.myzakat.org (admin/password)

## Important Files
- `traefik.yml` - Traefik configuration
- `docker-compose.traefik.yml` - Production Docker Compose
- `env.production` - Production environment variables
- `deploy.sh` - Deployment script
- `setup-vps.sh` - VPS setup script
- `migrations/` - Numbered SQL migrations, applied by hand (see above)

## Security Notes
1. Change default Traefik dashboard password
2. Use strong database passwords
3. Use production Stripe keys
4. Keep environment files secure

## Monitoring
```bash
# View logs
docker-compose -f docker-compose.traefik.yml logs -f [service]

# Check status
docker-compose -f docker-compose.traefik.yml ps

# Restart services
docker-compose -f docker-compose.traefik.yml restart
```
