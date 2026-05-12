# MyZakat — Zakat Distribution Foundation

A modern, full-stack donation platform built for **MyZakat**, a 501(c)(3) nonprofit
foundation that facilitates Zakat, Sadaqa, and other Islamic charitable giving.

> **Live site:** [https://myzakat.org](https://myzakat.org)
> **Stack:** FastAPI · React · PostgreSQL · Stripe · MinIO/S3 · Traefik · Grafana/Loki

---

## Table of Contents

- [What this is](#what-this-is)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Quick start (local development)](#quick-start-local-development)
- [Documentation map](#documentation-map)
- [Testing](#testing)
- [Deployment](#deployment)
- [Monitoring](#monitoring)
- [Contact](#contact)

---

## What this is

MyZakat is a donation platform with four core capabilities:

| Capability | Summary |
|---|---|
| **Secure donations** | One-time + recurring (monthly/annual) donations via Stripe Checkout. PDF certificates auto-emailed on success. |
| **Zakat calculators** | Zakat (wealth, gold, silver, business, agriculture), Kaffarah, Zakat Al-Fitr, Zakat on Gold. |
| **Content management** | Full admin console for stories, events, testimonials, programs, urgent needs, gallery, slideshow, settings, users. |
| **Observability** | All admin actions audited; live Grafana dashboard for activity, payments, and errors. |

A complete functional specification lives in [docs/SPECIFICATIONS.md](docs/SPECIFICATIONS.md).

---

## Architecture

```
                 ┌─────────────────────────────────────────┐
                 │              Traefik (HTTPS)            │
                 └────────────┬────────────────────────────┘
                              │
        ┌─────────────────────┼──────────────────────┐
        │                     │                      │
   ┌────▼────┐         ┌──────▼──────┐         ┌────▼──────┐
   │ React   │         │  FastAPI    │         │  Grafana  │
   │ frontend│◀───────▶│  backend    │         │           │
   │ (Vite)  │   /api  │  (Python)   │         └────┬──────┘
   └─────────┘         └──┬────────┬─┘              │
                          │        │                │
                  ┌───────▼──┐  ┌──▼────┐      ┌────▼──────┐
                  │PostgreSQL│  │ MinIO │      │   Loki    │
                  │          │  │ (S3)  │      │ (logs)    │
                  └──────────┘  └───────┘      └────▲──────┘
                                                    │
                                              ┌─────┴─────┐
                                              │ Promtail  │  ← Docker socket
                                              └───────────┘
                                                    ▲
                  ┌─────────────────┐               │
                  │   Stripe        │──webhook─────▶│
                  └─────────────────┘    backend
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the deep dive.

---

## Repository layout

```
my-zakat/
├── backend/                  FastAPI app (Python 3.11)
│   ├── main.py               App entrypoint + CORS + audit middleware
│   ├── audit_middleware.py   Logs every state-changing request with user email
│   ├── logging_config.py     Centralized logger setup
│   ├── database.py           SQLAlchemy session
│   ├── models.py             ORM models (User, Donation, Story, Event…)
│   ├── schemas.py            Pydantic request/response schemas
│   ├── auth_utils.py         JWT, password hashing, get_current_user/admin
│   ├── email_service.py      SMTP send + templated emails
│   ├── pdf_service.py        Donation certificate PDF generation
│   ├── s3_service.py         MinIO/S3 upload + proxy
│   ├── media_processing.py   Image compression, video thumbnails
│   ├── image_cache.py        In-memory LRU cache + on-the-fly resize
│   ├── routers/              One file per domain (donations, stories, events…)
│   └── tests/
│       ├── test_*.py         Unit tests (pytest, mocked Stripe, SQLite)
│       └── integration/      End-to-end tests against real Docker stack
│
├── frontend/                 React 18 + TypeScript + Vite + Tailwind
│   ├── src/
│   │   ├── pages/            Route components (Home, Donate, Admin*, etc.)
│   │   ├── components/       Shared UI (Header, Footer, SEOHead, …)
│   │   ├── contexts/         Toast notifications
│   │   ├── utils/            API client, SEO helpers, media helpers
│   │   ├── store/            Zustand auth store
│   │   └── App.tsx           Routes + lazy loading
│   ├── public/               robots.txt, sitemap.xml, llms.txt, llms-full.txt
│   └── nginx.conf            Static-asset caching + SPA fallback
│
├── e2e/                      Playwright E2E tests (TypeScript)
│
├── monitoring/
│   ├── loki/                 Loki storage + retention config
│   ├── promtail/             Promtail Docker discovery config
│   └── grafana/
│       ├── provisioning/     Datasource + dashboard provisioning
│       └── dashboards/       MyZakat Activity (human-readable)
│
├── docs/                     All long-form documentation
├── .github/workflows/        CI/CD (test + deploy)
├── docker-compose.yml        Local dev stack
├── docker-compose.traefik.yml Production stack
├── traefik.yml               Traefik routing + Let's Encrypt
└── README.md                 ← you are here
```

---

## Quick start (local development)

### Prerequisites

- Docker + Docker Compose
- Node.js 18+ (for running frontend tests/Playwright outside Docker)
- Python 3.11+ (for running backend tests outside Docker)
- A Stripe test account ([dashboard.stripe.com](https://dashboard.stripe.com))

### One-command setup

```bash
# 1. Copy the env template and fill in your Stripe test keys
cp env.example .env
# Edit .env — at minimum set STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY,
# STRIPE_WEBHOOK_SECRET (use Stripe CLI to generate this for local testing)

# 2. Start the stack
docker-compose up -d

# 3. Browse:
#    Frontend           → http://localhost:3000
#    Backend API docs   → http://localhost:8000/docs
#    Grafana            → http://localhost:3100  (admin/admin)
#    MinIO console      → http://localhost:9001  (minioadmin/minioadmin)
```

The backend auto-creates the database tables and a default admin user
on first start (`admin@example.com` / `admin123` — **change this in production**).

For full development setup including running tests, see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

---

## Documentation map

| Document | What's inside |
|---|---|
| [docs/SPECIFICATIONS.md](docs/SPECIFICATIONS.md) | Functional specifications: user stories, business rules, data flows |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture, technology choices, key design decisions |
| [docs/API.md](docs/API.md) | Complete REST API reference for every endpoint |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Local dev setup, running tests, common workflows |
| [docs/TESTING.md](docs/TESTING.md) | Unit + integration + E2E testing guide |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production deployment to VPS via GitHub Actions |
| [docs/MONITORING.md](docs/MONITORING.md) | Grafana + Loki + Promtail setup and dashboards |
| [docs/PRODUCTION_READINESS_REPORT.md](docs/PRODUCTION_READINESS_REPORT.md) | Security audit and production hardening checklist |

---

## Testing

```bash
# Backend unit tests (mocked Stripe, in-memory SQLite)
cd backend
pytest tests/test_payments.py tests/test_donations.py -v

# Backend integration tests (real Stripe test API + real PostgreSQL)
docker-compose up -d
pytest tests/integration/ -v

# Frontend unit tests
cd frontend
npm run test

# E2E tests (Playwright, against running Docker stack)
docker-compose up -d
npm run test:e2e
```

The CI pipeline (`.github/workflows/deploy.yml`) runs unit + E2E tests on
every push to `main`. Deploy to VPS happens only if all tests pass.

Full testing guide: [docs/TESTING.md](docs/TESTING.md).

---

## Deployment

Pushing to `main` triggers GitHub Actions:

1. **Test** stage — backend unit tests, frontend unit tests, frontend build
2. **E2E** stage — full Docker stack + Playwright suite
3. **Deploy** stage — SSH to VPS, `git pull`, rebuild & restart containers, health check

Full guide: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## Monitoring

Grafana dashboard "MyZakat Activity" provides a live view of:

- 🔴 **Live Activity** — every state-changing action, human-readable
  (e.g. `✓ otmane: uploaded a new gallery item`)
- ❌ **Problems** — errors and failures
- 💳 **Payments** — donations, subscriptions, Stripe webhooks, certificates
- 🔐 **Logins & Signups** — authentication events
- 📤 **Content Changes** — uploads, edits, deletes

Logs are collected by Promtail from all Docker containers, stored in Loki
with 7-day retention. Full guide: [docs/MONITORING.md](docs/MONITORING.md).

---

## Contact

**MyZakat – Zakat Distribution Foundation**
P.O. BOX 2250, Winchester, VA 22604, United States

- 🌐 [https://myzakat.org](https://myzakat.org)
- 📧 info@myzakat.org
- 📞 1-833-MYZAKAT (1-833-699-2528)

---

## License

Proprietary — © MyZakat Distribution Foundation. All rights reserved.
