# Monitoring — Logs, Dashboards & Audit Trail

- **Loki** — log storage, 30-day retention
- **Promtail** — ships every container's stdout into Loki
- **Grafana** — dashboards and ad-hoc queries

~200MB RAM overhead, all on the same VPS as the app.

---

## The one thing to know

Every backend log line is **logfmt**: space-separated `key=value`, one event per
line, always with a timestamp.

```
ts=2026-09-26T18:45:12.108Z level=info logger=donations event=donation.succeeded
  outcome=success donation_id=412 amount=50 currency=usd purpose=Zakat
  email=a***@gmail.com stripe_session=cs_live_a1OI4h msg="donation succeeded"
```

(one line in reality — wrapped here to fit)

That single format serves both readers. On the VPS it greps. In Loki, `| logfmt`
turns every key into a real field, so dashboards filter on `event` and `reason`
instead of matching wording — which is why panels no longer go blank when a
message is reworded.

**Exceptions are folded into the same line** as `error=` and `stack=`, with
newlines escaped. A traceback therefore sits with the event it belongs to
instead of arriving in Loki as a dozen unrelated entries.

---

## Reading logs on the VPS

Use the helper; it knows the container names and the field names.

```bash
./scripts/logs.sh                      # follow the money path + anything wrong
./scripts/logs.sh donations            # every donation / subscription / webhook event
./scripts/logs.sh donations --failed   # only donations that failed      <-- start here
./scripts/logs.sh errors               # errors and warnings, all services
./scripts/logs.sh receipts             # receipt-email successes and failures
./scripts/logs.sh webhooks             # Stripe webhook traffic
./scripts/logs.sh event donation.succeeded
./scripts/logs.sh grep cs_live_a1OI4h  # trace one Stripe session end to end
./scripts/logs.sh raw                  # unfiltered, unformatted
```

Options, in any position: `--since 30m`, `--lines 500`, `--follow`/`-f`,
`--container myzakat-worker`, `--no-color`.

It prints time, level and event as fixed columns and leaves the `key=value`
pairs intact, so output stays greppable after formatting:

```
18:45:12 INFO    donation.succeeded       outcome=success donation_id=412 amount=50 ...
18:45:31 WARNING donation.failed          outcome=failure reason=card_declined amount=50 ...
18:46:02 ERROR   webhook.failed           outcome=failure reason=db_error stripe_session=cs_live_... error="ValueError: ..."
```

Plain `docker logs myzakat-backend` still works, and every line has a timestamp.

---

## Grafana

- Production: `http://31.97.131.31:3100`, or `https://grafana.myzakat.org` once DNS is set
- Local dev: `http://localhost:3100`
- Login: `admin` / `myzakat2024` in production (`GRAFANA_ADMIN_PASSWORD` in `env.production`)

Two dashboards are provisioned into the **MyZakat** folder from
`monitoring/grafana/dashboards/`. They are files in the repo, so edits made in
the Grafana UI are lost on redeploy — change the JSON.

### Donations

The one that matters. Top row answers "did donations work?" at a glance:

| Tile | Means |
|---|---|
| **Donations succeeded** | money arrived *and* a Donation row exists |
| **Donations failed** | any failure on the money path |
| **Success rate** | succeeded / (succeeded + failed); green above 95% |
| **Receipts not sent** | donation succeeded, receipt email did not — the donor will ask |
| **Paid but not recorded** | Stripe took money we have no row for. Red background; act on any non-zero |

Then: succeeded vs failed over time, failures grouped by reason, and
**Donation failures** — every failure newest-first, each line carrying the
reason, amount, masked email and the `stripe_session`/`stripe_charge` needed to
find it in Stripe, with the traceback on the same line.

A collapsed section holds the full event stream and Stripe webhook throughput.

### Platform activity

Everything that is not the money path: error and failed-request counts, log
volume by level, all errors and warnings across services, and the admin audit
trail of who changed what.

---

## Event taxonomy

Defined once in [`backend/log_events.py`](../backend/log_events.py). Dashboards
and `scripts/logs.sh` match these strings, so **renaming one silently blinds a
panel** — change it in that module and its callers together.

| Event | Meaning |
|---|---|
| `donation.session_created` | donor was handed a Stripe checkout session (intent, not money) |
| `donation.session_failed` | we could not create the session — donor saw an error, Stripe has no record |
| `donation.succeeded` | **money arrived and a row exists** |
| `donation.failed` | Stripe says the charge failed; `reason` says why |
| `donation.abandoned` | reached checkout, never paid (routine; the funnel denominator) |
| `donation.certificate_emailed` / `_failed` | receipt delivery, tracked separately from the money |
| `webhook.received` / `.processed` | how we learn any of the above happened |
| `webhook.duplicate` | a Stripe retry we had already handled |
| `webhook.rejected` | bad signature or payload — Stripe knows about money we do not |
| `webhook.failed` | our handler raised |
| `subscription.*` | recurring donations |
| `auth.login`, `content.changed`, `request.failed` | everything else worth finding |

Two conventions make this queryable:

- **`outcome=success|failure`** on every payment event, so one query answers
  "did donations work" without listing event names.
- **`reason=<token>`** on failures, from a bounded vocabulary (`card_declined`,
  `stripe_error`, `db_error`, `email_send_failed`, …) so failures group into a
  short list instead of one bucket per exception message. Unbounded detail lives
  in `error=` and `stack=`.

---

## Useful queries

```logql
# every donation failure
{service="backend"} | logfmt | outcome="failure"

# failures grouped by cause over the last hour
sum by (reason) (count_over_time({service="backend"} | logfmt | outcome="failure" [1h]))

# did donations work today?
sum by (outcome) (count_over_time({service="backend"} | logfmt | outcome != "" [24h]))

# one donor's journey (masked email is still matchable)
{service="backend"} | logfmt | email="a***@gmail.com"

# one Stripe session end to end
{service="backend"} |= "cs_live_a1OI4h"

# donations we were paid for but never recorded — recover via the stripe_session
{service="backend"} | logfmt | event=~"webhook.failed|webhook.rejected"

# total donated, by purpose
sum by (purpose) (sum_over_time({service="backend"} | logfmt
  | event="donation.succeeded" | unwrap amount [24h]))

# anything wrong, any service
{level=~"error|warning|critical"}
```

`| logfmt` is what makes fields available; without it you are matching raw text.

---

## Noise policy

Deliberately **not** logged in the steady state:

- **uvicorn's access log** — was one line per request including every media
  file, and bypassed the formatter so none of it had a timestamp. Traefik
  records access at the edge and ships it to Loki; the audit middleware logs
  every state-changing request with structure.
- **Successful health checks and static/media reads** at the Traefik layer,
  dropped by Promtail. Only *successes* — a `/health` that starts returning 503
  or an image that 404s still arrives.
- **Read requests** in the audit middleware.
- **Third-party chatter** (httpx, botocore, stripe, PIL, …) clamped to WARNING.
  httpx alone logged a line per outbound email and price lookup.
- **Per-upload progress** ("Compressing image…") demoted to DEBUG.

All of it is recoverable: set `LOG_LEVEL=DEBUG` in `env.production` and restart
the backend. That restores the progress lines *and* third-party request logs.
Donor email addresses are masked (`a***@gmail.com`) everywhere, and the metals
API key is redacted by a logging filter that stays in force at DEBUG.

---

## Retention and cardinality

30 days (`retention_period: 720h` in `monitoring/loki/loki-config.yml`), chosen
to cover month-end donation reconciliation. `reject_old_samples_max_age` matches
it, so a Promtail replay is accepted rather than 400-ing — and because entries
carry the application's own timestamp, a replay de-duplicates instead of
producing a second copy stamped "now".

Only `container`, `service`, `project`, `container_id` and `level` are **labels**.
`event`, `reason`, `donation_id` and the rest are fields parsed at query time by
`| logfmt`. That is deliberate: labels are indexed, so a label per donation id
or Stripe session would multiply the index until every query crawled.

---

## Verifying the pipeline yourself

If a dashboard looks empty, check in this order — the answer is usually the
first one that fails.

```bash
# 1. is the app logging at all, and with timestamps?
docker logs --tail 5 myzakat-backend

# 2. is Promtail shipping? (any 'level=error' here is the problem)
docker logs --tail 20 myzakat-promtail

# 3. does Loki have the labels?
curl -s http://localhost:3100/loki/api/v1/label/service/values

# 4. does Loki have the data?
curl -s -G http://localhost:3100/loki/api/v1/query \
  --data-urlencode 'query=sum(count_over_time({service="backend"}[1h]))'

# 5. can Grafana reach Loki?
#    Grafana -> Connections -> Data sources -> Loki -> Save & test
```

An empty panel and a healthy-but-quiet system look identical, which is how a
broken dashboard goes unnoticed. Step 4 tells them apart.
