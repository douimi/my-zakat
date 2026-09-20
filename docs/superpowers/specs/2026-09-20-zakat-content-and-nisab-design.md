# Zakat Content & Live Nisab — Design

**Date:** 2026-09-20
**Status:** Approved for planning

## Summary

MyZakat ranks for its own name and nothing else. The cause is not keywords: the
site is a Vite SPA, so every URL serves the same 4.4 KB shell containing twelve
words of body text and no structured data. Islamic Relief serves 3,900–5,500
words of rendered HTML per page across 1,433+ URLs.

Fixing that at the root means pre-rendering, which is deferred: the app reads
`localStorage` during render in several places and rendering it server-side
risks build failures and hydration mismatches on a live donation site. That
deferral is deliberate and its cost is understood — **Google executes
JavaScript, so this work will reach Google; LLM crawlers do not, so the
generative-search half stays blocked** until pre-rendering lands, except for
what is served statically or as JSON.

This design covers what can be done first and is worth doing regardless:

1. The calculators stop using hardcoded metal prices and start serving a
   **current, dated nisab** from a real source, with a staleness guard.
2. The four calculator pages and a new `/nisab` page get the editorial content
   that makes them rankable at all.
3. The structured-data generators already written in `seo.ts` get wired up, and
   `HowTo` / `WebApplication` are added.
4. `llms.txt` is rewritten to point at the one fact LLM crawlers *can* read
   today.

## Goals

- No page publishes a monetary figure that is stale or wrong.
- Each calculator page answers, in crawlable prose, the questions a person has
  before they trust the number the widget gives them.
- `/nisab` becomes the canonical, citable statement of the current threshold.
- The existing `seo.ts` helpers stop being dead code.

## Non-goals

- Pre-rendering / SSR. Deferred deliberately; it is the single highest-value
  follow-up and nothing here conflicts with it.
- Competing for `charity`, `donation`, or `Islamic relief`. The first two are
  head terms owned by forty-year-old organisations with three orders of
  magnitude more indexed content; the third is a registered trademark whose
  owner Google will always favour. **The target is zakat-calculation intent,
  where the four calculators are a genuine product advantage.**
- An SEO dashboard in the admin console. Explicitly dropped: Search Console's
  own UI is free and better, and there is nothing to measure until the site is
  crawlable.
- Long-tail editorial articles ("zakat on a 401k", "can I give zakat to
  family"). A larger writing effort, worth doing after this lands.
- Charity Navigator / Candid / GuideStar listings and publishing the EIN. Real
  and valuable for LLM trust, but an administrative task for the foundation,
  not code.

## Current state

- `frontend/src/pages/ZakatCalculator.tsx` — 528 lines, almost entirely widget.
  Hardcodes `DEFAULT_GOLD_PRICE_PER_GRAM = 95.00` and
  `DEFAULT_SILVER_PRICE_PER_GRAM = 1.10`, with a comment telling the user to
  check current rates elsewhere. The figures it produces are therefore already
  unreliable — a product defect, independent of SEO.
- `frontend/src/pages/ZakatOnGold.tsx` — **73 lines**. In the navigation and the
  sitemap, effectively empty.
- `frontend/src/pages/KaffarahCalculator.tsx` (276) and
  `ZakatAlFitrCalculator.tsx` (278) — widget with minimal surrounding text.
- `frontend/src/utils/seo.ts` — exports `getGlobalJsonLd` (NonprofitOrganization
  + WebSite/SearchAction), `getBreadcrumbJsonLd`, `getFaqJsonLd`. The breadcrumb
  and FAQ generators are **never called**.
- `frontend/public/llms.txt` (3.8 KB) and `llms-full.txt` (11 KB) exist and are
  decent. They are currently the only substantive content any non-JS crawler can
  read on the whole domain.
- `frontend/public/sitemap.xml` — 22 URLs. No `/nisab`.
- `backend/models.py:193` — a `Setting` table (`key`, `value`, `description`,
  `updated_at`) already used for site configuration.
- No Google Search Console verification and no web analytics of any kind.
- Production routing: Traefik sends `/api` to the backend service and everything
  else to the frontend's nginx.

## Decisions

| Question | Decision |
|---|---|
| Content authority | The site owner chose to publish without religious review, after being advised against it. The drafting compensates: stay on what is agreed across schools, flag divergences rather than resolve them, never rule on contested matters, and carry a visible pointer to a qualified scholar on every page. |
| Price source | A metals-price API, refreshed at most once per 24 hours. |
| Refresh mechanism | Lazy refresh behind `GET /api/nisab`: serve the cache, refresh it when older than the interval. No scheduler. |
| Staleness | Past 7 days without a successful refresh, the API reports `is_stale` and **the UI stops showing a figure**, falling back to the method. |
| Scope | The four calculator pages plus a new `/nisab`. |
| Year in titles | Derived from the current date, never hardcoded. |
| `llms.txt` | Stays a static file. It points at `/api/nisab` rather than embedding a number that would go stale. |

### Why the lazy-refresh endpoint rather than a scheduled job

A daily Arq job would be conceptually tidier — the worker container already
exists for marketing email. It also fails silently: if the worker stops, the
value freezes and nobody learns about it until someone notices a wrong number on
the site. The lazy endpoint repairs itself on the next request, stops calling the
external API when nobody is visiting, and makes staleness a property the caller
can see rather than an invisible background failure.

### Why `llms.txt` points at the API instead of carrying the number

Serving `llms.txt` from the backend so it could embed a live figure would mean a
new Traefik route in production — the kind of change this whole plan is
deliberately avoiding right now. And a static file carrying a dated dollar
amount is exactly the stale-figure problem the staleness guard exists to
prevent.

`GET /api/nisab` returns JSON, is served by the backend, and **needs no
JavaScript** — so it is readable today by precisely the crawlers the rendered
pages are invisible to. It is the one citable, current fact this work can put in
front of an LLM before pre-rendering lands.

## The nisab service

**Storage.** Reuse the existing `settings` table rather than adding one: keys
`nisab.gold_price_per_gram_usd`, `nisab.silver_price_per_gram_usd`,
`nisab.source`, `nisab.as_of`, `nisab.fetched_at`. Small, already administered,
already backed up.

**`backend/nisab_service.py`** owns the arithmetic and the refresh. The default
masses are **85 g of gold and 595 g of silver**, the figures in widest
contemporary use.

They are *not* uncontested, and the pages must not pretend otherwise: the Hanafi
convention gives 87.48 g of gold and 612.36 g of silver, from 20 mithqal and 200
dirhams respectively. The service therefore reads the two masses from the
`settings` table (`nisab.gold_grams`, `nisab.silver_grams`) rather than hardcoding
them, so the foundation can adopt whichever convention it follows without a code
change, and the `/nisab` page states which one is in use and names the other.

```
nisab_gold_usd   = nisab.gold_grams   × gold_price_per_gram_usd    # 85 g by default
nisab_silver_usd = nisab.silver_grams × silver_price_per_gram_usd  # 595 g by default
```

**`GET /api/nisab`** (public, no auth):

```json
{
  "gold_price_per_gram_usd": 95.12,
  "silver_price_per_gram_usd": 1.08,
  "nisab_gold_usd": 8085.20,
  "nisab_silver_usd": 642.60,
  "gold_grams": 85,
  "silver_grams": 595,
  "as_of": "2026-09-20T06:00:00Z",
  "is_stale": false,
  "source": "metals.dev"
}
```

When no price has ever been fetched, or the last success is older than seven
days, `is_stale` is `true` and the four monetary fields are `null`. The masses
and the method are always present, because they never expire.

**Failure behaviour.** A missing API key, a non-200, a malformed payload or a
timeout all leave the cache untouched and are logged; the endpoint keeps serving
the last known good value with its real `as_of`. The refresh is attempted at most
once per 24 hours regardless of outcome, so a broken upstream cannot be hammered.

**Configuration.** `METALS_API_KEY` and `METALS_API_URL` from the environment. If
the key is absent the service starts normally and behaves as permanently stale —
no crash, no hidden dependency at boot.

## The pages

Titles follow the pattern that works for the competitor — a question, the current
year, an intent — with the year computed at render time:

| Route | Title |
|---|---|
| `/zakat-calculator` | Zakat Calculator {year} — How Much Zakat Do I Owe? |
| `/nisab` *(new)* | Nisab {year} — Current Gold & Silver Threshold for Zakat |
| `/zakat-on-gold` | Zakat on Gold {year} — How Much Do You Pay? |
| `/zakat-al-fitr-calculator` | Zakat al-Fitr {year} — How Much to Pay and When |
| `/kaffarah-calculator` | Kaffarah Calculator {year} — Expiation for Missed Fasts and Broken Oaths |

**Each calculator page** gains 600–900 words below the widget, in this order:
what the tool computes and who it is for; the rule in plain language; the current
nisab with its date, read from `/api/nisab`; a fully worked example with real
figures; four to six frequently asked questions; and, where schools differ, both
positions stated without adjudication. Every page ends with a short note that the
content is general guidance and that particular situations should go to a
qualified scholar.

**`/nisab`** does one thing: state the current threshold, dated, with its method,
and explain the gold-versus-silver divergence by presenting the two common
positions — the silver threshold is lower and so captures more payers, the gold
threshold is the more common contemporary practice — without ruling between
them. It is added to `sitemap.xml` and linked from every calculator page, which
reference it instead of repeating the figure.

## Structured data

`getBreadcrumbJsonLd` and `getFaqJsonLd` already exist and are never called.
They get wired into all five pages with their real content. Two generators are
added to `seo.ts`:

- `getHowToJsonLd` — the calculation steps, per calculator.
- `getWebApplicationJsonLd` — each calculator as a free, browser-based tool.

All of it is injected through `SEOHead`, which means **Google will see it and
LLM crawlers will not**, until pre-rendering lands. That is the known cost of the
deferral, stated here so the limitation is not mistaken for a defect later.

## `llms.txt`

Rewritten to describe the calculators concretely rather than in marketing terms,
to state the nisab method (85 g / 595 g) which never expires, and to point at
`https://myzakat.org/api/nisab` for the current figure. `llms-full.txt` gains the
same. Neither carries a dollar amount.

## Testing

- **Nisab service**: the arithmetic for both metals; a successful fetch updates
  the cache and `as_of`; a failed fetch leaves the previous value intact and does
  not raise; a value older than seven days reports `is_stale` with null amounts;
  a missing API key behaves as stale rather than crashing; the refresh is not
  attempted twice inside one 24-hour window.
- **Endpoint**: shape of the response in both fresh and stale states; no auth
  required; masses always present.
- **Calculators**: they consume `/api/nisab` and no longer reference the removed
  constants; a user override still wins; when the API is stale or unreachable the
  page shows the method and not a figure.
- **Pages**: each renders its FAQ and emits valid `FAQPage`, `BreadcrumbList`,
  `HowTo` and `WebApplication` JSON-LD; the title contains the current year.
- **`/nisab`**: present in `sitemap.xml`, routed, and linked from all four
  calculators.

## Risks

- **A wrong number is worse than no number.** The staleness guard is the control
  that prevents it, and it is the part of this design most worth reviewing: if it
  fails open, the site publishes an authoritative-looking figure that is wrong.
- **Religious content ships without scholarly review**, by the owner's explicit
  decision. The drafting constraints above limit but do not remove the exposure.
- The external price API is a new third-party dependency in the request path of a
  public endpoint. It is called at most once per interval, never blocks on
  failure, and the site degrades to the method — but it is a dependency that did
  not exist before.
