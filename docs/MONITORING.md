# Monitoring — Logs, Dashboards & Audit Trail

MyZakat ships with a complete observability stack:

- **Loki** — log aggregation (lightweight alternative to Elasticsearch)
- **Promtail** — log shipper, reads from all Docker containers
- **Grafana** — web UI for dashboards and ad-hoc log queries

All running on the same VPS as the app, ~200MB total RAM overhead.

---

## Access

### Production

- Dashboard: `http://31.97.131.31:3100` (HTTP, direct IP)
- Or `https://grafana.myzakat.org` once DNS is configured
- Default login: `admin` / `myzakat2024` (override via `GRAFANA_ADMIN_PASSWORD` in `env.production`)

### Local dev

- Dashboard: `http://localhost:3100`
- Default login: `admin` / `admin`

---

## The "MyZakat Activity" dashboard

Pre-provisioned with five panels:

### 🔴 Live Activity (top, full width)

Every state-changing action across the entire app, in real time. Human-readable:

```
✓ otmane: logged in
✓ omar: uploaded a new gallery item
✗ admin: deleted story #5 — failed (403)
✓ Hikmat: started a one-time donation
✓ → Stripe webhook received
```

A leading `✓` means success; `✗` means failure (HTTP 4xx or 5xx).

### ❌ Problems (left, middle)

Errors and failures only. First place to look when something breaks.

### 💳 Payments (right, middle)

Stripe webhooks, donation confirmations, certificate emails, subscription
lifecycle events. Filtered to exclude noise (the panel ignores routine
`GET /api/donations/stats` requests).

### 🔐 Logins & Signups (left, bottom)

Authentication events: every login and registration.

### 📤 Content Changes (right, bottom)

Uploads, edits, deletes across stories, events, gallery, testimonials, etc.
Each line includes the user's email and what they did.

---

## How audit logging works

A FastAPI middleware ([backend/audit_middleware.py](../backend/audit_middleware.py))
intercepts every state-changing request (POST/PUT/PATCH/DELETE).

For each request, it:

1. Decodes the JWT (if present) and looks up the user in PostgreSQL
2. Translates the `(method, path)` into a human-readable action via
   `ACTION_MAP` (50+ patterns covering all admin endpoints)
3. Logs a structured line:

   ```
   ✓ otmane: uploaded a new gallery item | email=otmane@myzakat.org method=POST path=/api/gallery/upload status=200 duration_ms=42 ip=1.2.3.4
   ```

The human-readable part is for humans; the `| key=value …` tail is for
Loki's structured queries.

---

## How log persistence works

| Component | Storage | Retention |
|---|---|---|
| Backend stdout | Docker JSON log driver, **50MB × 5 files = 250MB** per container | Until rotated by Docker |
| Promtail position file | Persistent Docker volume `promtail_positions` | Forever (survives rebuilds) |
| Loki chunks + index | Persistent Docker volume `loki_data` | **7 days** (configurable in `loki-config.yml`) |
| Grafana dashboards + datasources | Persistent Docker volume `grafana_data` | Forever |

**Why this matters:** previously Promtail stored its position file in `/tmp`
inside the container, which was wiped on every rebuild. After a deploy,
Promtail would start reading from "now" and miss everything that happened
during the deploy. The persistent volume fixes this.

---

## Common queries (LogQL)

In Grafana → **Explore** → select **Loki** datasource → paste any of these:

| Query | What it shows |
|---|---|
| `{container=~".*backend.*"} \|~ "✓\|✗"` | All audited actions |
| `{container=~".*backend.*"} \|= "logged in"` | All logins |
| `{container=~".*backend.*"} \|= "ERROR"` | All error logs |
| `{container=~".*backend.*"} \|= "Stripe"` | Anything Stripe-related |
| `{container="myzakat-backend"} \|= "donation"` | Donation activity |
| `{container=~".*backend.*"} \|= "certificate"` | Certificate emails |
| `{container="traefik"} \|~ "5[0-9]{2}"` | 5xx HTTP errors from Traefik |

To filter by a specific admin's actions:

```
{container=~".*backend.*"} |= "admin@example.com" |= "✓"
```

---

## Adding a new audit message

When you add a new admin endpoint and want it to show up nicely in Grafana,
add an entry to `ACTION_MAP` in
[backend/audit_middleware.py](../backend/audit_middleware.py):

```python
("POST", re.compile(r"^/api/myresource/?$"), "created a my-resource"),
("DELETE", re.compile(r"^/api/myresource/(\d+)$"),
   lambda m: f"deleted my-resource #{m.group(1)}"),
```

Without this entry, the audit log still records the action but in raw
`METHOD path` form rather than a human phrase.

---

## Configuration files

| File | Purpose |
|---|---|
| `monitoring/loki/loki-config.yml` | Loki retention, storage paths |
| `monitoring/promtail/promtail-config.yml` | Docker discovery, position file path |
| `monitoring/grafana/provisioning/datasources/datasources.yml` | Auto-configure Loki datasource |
| `monitoring/grafana/provisioning/dashboards/dashboards.yml` | Auto-load dashboards from `/var/lib/grafana/dashboards` |
| `monitoring/grafana/dashboards/myzakat-activity.json` | The dashboard itself |

Changes to these files take effect on `docker compose up -d` (no full rebuild needed).

---

## Troubleshooting

### "No data" in dashboard panels

1. Check that the backend is actually emitting logs in the new format
   (the audit middleware must be deployed):
   ```bash
   docker logs myzakat-backend --tail 20 | grep "✓"
   ```
2. Check Promtail is shipping:
   ```bash
   docker logs myzakat-promtail --tail 20
   ```
3. Check Loki is healthy:
   ```bash
   docker logs myzakat-loki --tail 20
   ```
4. In Grafana, expand the time range — maybe logs exist but outside the
   current window.

### Logs disappear after a deploy

This should no longer happen — `promtail_positions` is now a persistent
volume. If it still happens, verify the volume exists:
```bash
docker volume ls | grep promtail
```

### Grafana dashboard not appearing

Force Grafana to reload provisioning:
```bash
docker restart myzakat-grafana
```

The dashboard is in `monitoring/grafana/dashboards/myzakat-activity.json`
on disk. If Grafana doesn't show it, check the container logs.

---

## Future improvements

Tracked items (not blocking, but nice to have):
- Alerting on error rate spikes (Grafana Alerting → Slack/email)
- Per-environment dashboards (dev/staging/prod)
- Histogram of donation amounts over time
- Latency percentiles per endpoint
- Distributed tracing (currently not enabled — logs are sufficient for current scale)
