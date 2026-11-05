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

**Applied automatically by the deploy.** `scripts/migrate.sh` walks
`migrations/NN_*.sql` in filename order, applies whatever has not run yet, and
records it in a `schema_migrations` table. There is nothing to do by hand.

The deploy order is what makes this safe:

```
git reset --hard origin/main
build frontend backend worker
docker compose up -d --wait db          # no-op on an upgrade; required on a fresh volume
./scripts/migrate.sh --phase pre        # additive — BEFORE the new image starts
docker compose up -d                    # new code goes live
./scripts/migrate.sh --phase post       # destructive — AFTER the old image is gone
```

A failure in the `pre` pass stops the deploy with the **old image still
serving**. That is the point: the new code would select columns the old schema
does not have.

### Adding a migration

Drop a numbered file in `migrations/` and commit it. That is all.

Two rules:

- **Idempotent** (`IF NOT EXISTS`, `DO $$ ... IF NOT EXISTS`), like the existing
  files. The runner will not apply a file twice, but a re-run after a partial
  failure should be harmless.
- **If it is destructive** — dropping a column or table the *current* image
  still writes — add this header so it is deferred until after the new image is
  live:

  ```sql
  -- migrate:phase post
  ```

  Default is `pre`. Migration 33 is the only one that needs it today. A typo
  here silently falls back to `pre`, so `backend/tests/test_migration_inventory.py`
  rejects any `migrate:phase` line the runner cannot parse.

Each file is applied inside a transaction **together with its tracking row**, so
a migration that fails records nothing and leaves the database as it was. The
one exception is `32_proposal_versioning.sql`, which opens its own transaction;
the runner detects that, runs it as-is, and records it immediately after.

### Running it by hand

```bash
./scripts/migrate.sh --list        # what is applied, what is pending
./scripts/migrate.sh --dry-run     # what would run, changes nothing
./scripts/migrate.sh --phase all   # apply everything pending
```

Locally, against the dev stack:

```bash
./scripts/migrate.sh --compose-file docker-compose.yml   --env-file .env --db-user postgres
```

### An existing database, and a fresh one

The first run against a database that predates the runner finds no
`schema_migrations` table but plenty of application tables. It then records the
migrations **up to the watermark in `migrations/.baseline`** as applied without
running them — replaying those would duplicate seed data
(`16_populate_programs`) and drop columns (`33`) — and applies everything after
the watermark normally. It says so loudly in the deploy log.

That watermark is the whole reason the file exists. Baselining the *entire*
directory would mark a migration that has never run as "applied" and skip it
forever, which is how a brand-new migration silently fails to reach production.

**The watermark is a fact about the production database, not about this
directory, so adding a migration must not move it.** It is read once per
database; after that `schema_migrations` is authoritative and the file is inert.
`backend/tests/test_migration_inventory.py` fails if it names a missing file, or
if it has been bumped to the newest migration — which would skip that migration
in production.

An **empty** database is built from zero instead: every migration in order. That
is what makes a new VPS, or a lost volume, work with no manual step. There is
deliberately no `initdb` script — one that populated the schema would leave a
database with no migration history, which the runner would baseline as
"already applied", silently skipping every migration after it.

If the count of existing tables cannot be read, the runner **stops** rather than
guess: assuming "empty" on a live database would replay the whole chain.

### If a migration was edited after being applied

The runner stores a checksum and fails loudly when the repository and the
database disagree about what ran. Resolve it deliberately — restore the file, or
if the edit was only a comment:

```sql
UPDATE schema_migrations SET checksum = '<new>' WHERE filename = '<file>';
```

`./scripts/migrate.sh --list` prints the new checksum next to the old one.

### Schema ownership

`create_all()` runs in development and tests only. In production the schema
comes from `migrations/` alone, because `create_all()` creates missing *tables*
but never a missing *column* — which is how the proposal-versioning deploy ended
up 500ing on a column that did not exist, and why migration 34 exists.

### `36_proposal_reports.sql` — BEFORE deploying the new backend

Widens `project_proposals.status` to VARCHAR(32), adds the report pointers, and
creates `proposal_reports` and `proposal_report_attachments`. Additive and
idempotent, and the migration runner applies it automatically.

The width matters: `report_changes_requested` is 24 characters and a VARCHAR(20)
rejects it outright rather than truncating, so the new statuses cannot be
written at all until this has run.

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
- `migrations/` - Numbered SQL migrations, applied automatically by the deploy
  via `scripts/migrate.sh` (see above)
- `scripts/migrate.sh` - Migration runner
- `scripts/logs.sh` - Read the logs on the VPS

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
