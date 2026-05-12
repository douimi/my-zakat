# Local Development Guide

This guide gets you from a fresh clone to a fully running MyZakat stack on your laptop.

---

## Prerequisites

- **Docker Desktop** (or Docker Engine + Docker Compose v2)
- **Node.js 18+** and **npm** (for running frontend tests/Playwright outside Docker)
- **Python 3.11+** and **pip** (for running backend tests outside Docker)
- **Git**
- A **Stripe test account** — sign up free at [stripe.com](https://stripe.com)
- (Optional) **Stripe CLI** for local webhook forwarding — [docs](https://stripe.com/docs/stripe-cli)

---

## First-time setup

### 1. Clone the repo

```bash
git clone https://github.com/douimi/my-zakat.git
cd my-zakat
```

### 2. Configure environment

Copy the template:

```bash
cp env.example .env
```

Edit `.env` and fill in **at minimum**:

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...      # from `stripe listen` or dashboard
SECRET_KEY=any-random-string-for-dev
DATABASE_URL=postgresql://postgres:password@db:5432/myzakat
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password
FRONTEND_URL=http://localhost:3000
```

> 💡 For local Stripe webhook testing, run `stripe listen --forward-to localhost:8000/api/donations/stripe-webhook` — the CLI prints the `whsec_` secret to paste into `.env`.

### 3. Start the stack

```bash
docker-compose up -d
```

This brings up:

| Service | Port | Purpose |
|---|---|---|
| Frontend (Nginx + React build) | 3000 | http://localhost:3000 |
| Backend (FastAPI + uvicorn) | 8000 | http://localhost:8000 |
| PostgreSQL | 5432 | DB (auto-migrated) |
| MinIO (S3-compatible) | 9000 + 9001 | API + console |
| Redis | 6379 | Optional cache |
| Loki | (internal) | Log aggregation |
| Promtail | (internal) | Log shipper |
| Grafana | 3100 | http://localhost:3100 |

First boot takes ~30-60 seconds while images pull and the DB initializes.

### 4. Verify

- **Frontend**: http://localhost:3000 — should show the homepage
- **Backend docs**: http://localhost:8000/docs — Swagger UI for all endpoints
- **Backend health**: http://localhost:8000/health → `{"status":"healthy"}`
- **Grafana**: http://localhost:3100 (login `admin` / `admin`)

### 5. Create an admin account

The backend auto-creates `admin@example.com` / `admin123` on first start
if no admin exists. Log in at http://localhost:3000/login.

For a custom admin:

```bash
docker exec myzakat-backend python -c "
from auth_utils import get_password_hash
from database import SessionLocal
from models import User
db = SessionLocal()
db.add(User(
    email='you@example.com',
    password=get_password_hash('your-password'),
    name='Your Name',
    is_active=True,
    is_admin=True,
    email_verified=True,
))
db.commit()
"
```

---

## Daily workflow

### Hot reload — frontend

The default `docker-compose.yml` builds the frontend into Nginx (production-like).
For HMR during development, run Vite directly:

```bash
cd frontend
npm install        # first time only
npm run dev        # starts http://localhost:5173 with HMR
```

Make sure the backend is still running via Docker on port 8000.
Vite proxies `/api/*` to the backend automatically.

### Hot reload — backend

```bash
docker exec -it myzakat-backend bash -c "kill -HUP 1"
```

Or restart the container:

```bash
docker compose restart backend
```

Python code is bind-mounted, so saved changes take effect on restart.

### Browse the database

```bash
docker exec -it my-zakat-db-1 psql -U postgres -d myzakat
```

Then any SQL:

```sql
SELECT id, email, name, is_admin FROM users;
SELECT id, name, email, amount, frequency, donated_at FROM donations ORDER BY id DESC LIMIT 10;
```

Or use pgAdmin / DBeaver pointing at `localhost:5432` (user `postgres`, password `password`).

### Browse files in MinIO

http://localhost:9001 — login `minioadmin` / `minioadmin`. The bucket is `myzakat-media`.

### Tail logs

```bash
docker logs -f myzakat-backend         # backend stdout
docker logs -f my-zakat-frontend-1     # nginx access logs
docker logs -f myzakat-loki            # log aggregator
```

Or use the Grafana "MyZakat Activity" dashboard for a nicer view.

---

## Running tests

### Backend unit tests (fast, mocked Stripe, SQLite)

```bash
cd backend
pip install -r requirements.txt    # first time only
pytest tests/test_payments.py tests/test_donations.py -v
```

### Backend integration tests (real Stripe + PostgreSQL)

```bash
# Must have Docker stack running and Stripe test keys in .env
docker-compose up -d
cd backend
pytest tests/integration/ -v -s
```

### Frontend unit tests (vitest)

```bash
cd frontend
npm install
npm run test
```

### E2E tests (Playwright, full browser)

```bash
# Must have Docker stack running
docker-compose up -d
npm install               # at project root, installs @playwright/test
npx playwright install chromium
npm run test:e2e          # headless
npm run test:e2e:headed   # see the browser
npm run test:e2e:ui       # interactive UI mode
```

Open the HTML report after a run:

```bash
npm run test:e2e:report
```

See [TESTING.md](TESTING.md) for the full strategy.

---

## Common tasks

### Reset the database

```bash
docker-compose down -v   # ⚠️ destroys ALL volumes including DB and MinIO
docker-compose up -d
```

### Reset just donations

```bash
docker exec -it my-zakat-db-1 psql -U postgres -d myzakat -c \
  "TRUNCATE donations, donation_subscriptions RESTART IDENTITY;"
```

### Test a Stripe webhook locally

```bash
# Terminal 1: forward webhooks
stripe listen --forward-to localhost:8000/api/donations/stripe-webhook
# Copy the whsec_ from output into .env, then restart backend

# Terminal 2: trigger a test event
stripe trigger checkout.session.completed
```

### Build the frontend for production check

```bash
cd frontend
npm run build       # outputs to dist/
npm run preview     # serves the production build locally
```

### Update Stripe webhook subscriptions

In Stripe Dashboard → Developers → Webhooks, ensure your endpoint listens to:

- `checkout.session.completed`
- `checkout.session.expired`
- `customer.subscription.created`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `charge.failed`

---

## Project conventions

### Backend (Python)

- **Logging**: `from logging_config import get_logger; logger = get_logger(__name__)` —
  never use `print()`.
- **Imports**: stdlib → third-party → local, grouped with blank lines.
- **Routers**: one file per domain in `backend/routers/`. Each exports `router = APIRouter()`.
- **Pydantic schemas**: in `backend/schemas.py`. SQLAlchemy models in `backend/models.py`.
- **Auth**: depend on `get_current_user` (regular) or `get_current_admin` (admin).

### Frontend (TypeScript)

- **Components**: PascalCase files in `frontend/src/components/` (shared) or `frontend/src/pages/` (route components).
- **API calls**: go through `frontend/src/utils/api.ts` — never `fetch()` directly.
- **State**: Zustand for auth (`store/authStore.ts`), React Query for server state.
- **Styling**: Tailwind utility classes. Reusable patterns in `frontend/src/index.css` (`btn-primary`, `input-field`, `card`, `section-container`).
- **Notifications**: `useToast()` from `contexts/ToastContext.tsx` — never `alert()`.
- **Test IDs**: add `data-testid="..."` to elements that E2E tests need to interact with.

### Git

- Branch directly off `main` for small fixes; use feature branches + PRs for larger work.
- CI runs unit tests on every push; E2E + deploy run on push to `main` only.
- Commit messages: terse and clear. Co-Author tag for AI-assisted commits.

---

## Troubleshooting

### "Port 3000/5432/8000 already in use"

Something else is bound to that port. Either stop it or change the host
port in `docker-compose.yml` (e.g. `"3001:80"` instead of `"3000:80"`).

### "STRIPE_WEBHOOK_SECRET not configured"

Backend logs this when a webhook arrives but the secret isn't set in `.env`.
Add it and restart the backend.

### Frontend can't reach backend

Vite dev server proxies `/api/*` to `localhost:8000` automatically. If you
changed the backend port, update `frontend/vite.config.ts`.

### Stripe checkout shows "test mode" but I'm using live keys

Browser cached the old frontend bundle. Hard refresh (`Ctrl+Shift+R`)
or open in a private window. The publishable key is baked into the JS
bundle at build time.

### Container won't start

Check logs: `docker logs <container-name>`. Common issues:
- Missing env var (especially `SECRET_KEY` in production)
- Port collision
- Volume permission (Linux/Mac: `chmod +x deploy.sh`)

### "Webhook signature verification failed"

The `STRIPE_WEBHOOK_SECRET` in `.env` doesn't match the one Stripe is
signing with. Re-run `stripe listen` and copy the new `whsec_` value.

---

## Where to look for…

| You want to… | File |
|---|---|
| Add a new public page | `frontend/src/pages/` + `frontend/src/App.tsx` + sitemap |
| Add a new admin section | `frontend/src/pages/admin/` + backend router + `AdminLayout.tsx` sidebar |
| Change donation flow | `backend/routers/donations.py` + `frontend/src/pages/Donate.tsx` |
| Add a webhook event | `backend/routers/donations.py` (stripe_webhook function) |
| Add an email template | `backend/email_service.py` |
| Add a Grafana panel | `monitoring/grafana/dashboards/myzakat-activity.json` |
| Change CI/CD | `.github/workflows/deploy.yml` |
| Add an action to audit logs | `backend/audit_middleware.py` (`ACTION_MAP`) |

---

## Contact

**MyZakat – Zakat Distribution Foundation**
P.O. BOX 2250, Winchester, VA 22604
1-833-MYZAKAT · info@myzakat.org
