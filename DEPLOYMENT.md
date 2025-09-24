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
