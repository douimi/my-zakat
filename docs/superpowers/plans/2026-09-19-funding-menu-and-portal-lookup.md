# Funding Menu & Honest Portal Lookup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give funding applicants a dedicated navigation entry they can find without scrolling or expanding anything, and stop the portal telling them a code was sent when none was.

**Architecture:** The new dropdown lives in its own component (`components/nav/FundingMenu.tsx`) with a desktop and a mobile rendering, because `Header.tsx` is already 911 lines with four inline dropdowns. The backend change is two early returns in `request_code`; the frontend follows with one new view state.

**Tech Stack:** FastAPI, pytest (SQLite in-memory), React 18 + TypeScript + Tailwind, vitest + @testing-library, lucide-react 0.294, clsx.

---

## Baselines — do not try to fix these

- Backend: `cd backend && python -m pytest -q --ignore=tests/integration` reads **`11 failed, 489 passed`**. The 11 pre-date this work on `main` (test_admin 3, test_contact 1, test_main 1, test_settings 1, test_stories 2, test_subscriptions 3). **Always pass `--ignore=tests/integration`** — those hit Stripe and only run when the docker stack is up.
- Frontend: `cd frontend && npx vitest run` reads **`22 failed, 152 passed, 174 total`**. The 22 pre-date this work (`AdminRoute` 1, `Footer` 3, `Header` 7, `Layout` 4, `Contact` 7).
- `npm run lint` is **broken on `main`** (the script passes `--ext`, removed in flat-config; `eslint.config.js` uses `module.exports` in an ESM package). Skip it, say you skipped it.
- `npx tsc --noEmit` emits **77 lines of pre-existing errors** in `src/test/setup.ts`, `src/test/utils.tsx`, `src/utils/__tests__/api.test.ts`, `src/utils/__tests__/donations.test.ts`. Add none.
- `npm run build` succeeds and must keep succeeding.

## File structure

| Path | Responsibility |
|---|---|
| `backend/routers/proposal_portal.py` | `request_code`'s two early returns + docstring |
| `backend/tests/test_proposal_portal.py` | replace the indistinguishability tests |
| `frontend/src/utils/proposalPortalApi.ts` | surface the 404 as a named error |
| `frontend/src/pages/MyProposals.tsx` | the `not-found` view |
| `frontend/src/pages/__tests__/MyProposals.test.tsx` | cover it |
| `frontend/src/components/nav/FundingMenu.tsx` | **new** — the dropdown, desktop + mobile |
| `frontend/src/components/nav/__tests__/FundingMenu.test.tsx` | **new** |
| `frontend/src/components/Header.tsx` | mount both renderings; purge `/submit-proposal` from Quick Links |
| `docs/API.md`, `docs/superpowers/specs/2026-09-17-…-design.md` | correct the no-enumeration claim |

---

## Task 1: The lookup tells the truth

**Files:**
- Modify: `backend/routers/proposal_portal.py`
- Test: `backend/tests/test_proposal_portal.py`

- [ ] **Step 1: Replace the two obsolete tests**

In `backend/tests/test_proposal_portal.py`, **delete** `test_request_code_is_indistinguishable_for_known_and_unknown_addresses` and `test_a_rate_limited_address_is_told_nothing_and_emailed_nothing` — they assert the opposite of the intended behaviour now. Also delete `test_requesting_a_code_answers_identically_for_an_unknown_address` and `test_a_known_address_gets_the_same_reply_as_an_unknown_one` for the same reason. Keep `test_no_code_is_emailed_to_an_address_with_no_proposal`.

Then append:

```python
def test_an_unknown_address_is_told_so_plainly(client, db_session):
    """The opaque reply sent a mistyped address to a code screen for a code
    that was never coming. Applicant enumeration was weighed against that and
    judged the smaller harm -- see the 2026-09-19 spec."""
    resp = client.post("/api/project-proposals/portal/request-code",
                       json={"email": "nobody-here@example.com"})

    assert resp.status_code == 404
    assert resp.json()["detail"] == "We have no proposal filed under this address."
    assert db_session.query(ProposalAccessCode).count() == 0


def test_a_known_address_is_told_a_code_is_coming(client, db_session):
    client.post("/api/project-proposals/", json=_payload())

    resp = client.post("/api/project-proposals/portal/request-code",
                       json={"email": "amina@example.com"})

    assert resp.status_code == 202
    body = resp.json()
    assert body["sent"] is True
    assert "amina@example.com" in body["message"]
    assert db_session.query(ProposalAccessCode).count() == 1


def test_the_lookup_is_case_insensitive(client, db_session):
    client.post("/api/project-proposals/", json=_payload())

    resp = client.post("/api/project-proposals/portal/request-code",
                       json={"email": "AMINA@Example.com"})

    assert resp.status_code == 202


def test_a_capped_address_is_told_to_wait(client, db_session):
    from proposal_otp import MAX_CODES_PER_EMAIL

    client.post("/api/project-proposals/", json=_payload())
    for _ in range(MAX_CODES_PER_EMAIL):
        assert client.post("/api/project-proposals/portal/request-code",
                           json={"email": "amina@example.com"}).status_code == 202

    resp = client.post("/api/project-proposals/portal/request-code",
                       json={"email": "amina@example.com"})

    assert resp.status_code == 429
    assert "wait" in resp.json()["detail"].lower()
    assert db_session.query(ProposalAccessCode).count() == MAX_CODES_PER_EMAIL
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd backend && python -m pytest tests/test_proposal_portal.py -q`
Expected: the four new tests FAIL — the endpoint answers `202` for everything.

- [ ] **Step 3: Rewrite `request_code`**

In `backend/routers/proposal_portal.py`, delete the module-level `OPAQUE_REQUEST_REPLY` constant and replace the whole `request_code` function with:

```python
@router.post("/request-code", status_code=status.HTTP_202_ACCEPTED)
async def request_code(payload: CodeRequest, request: Request, db: Session = Depends(get_db)):
    """Email a one-time code to an address that has a dossier.

    This endpoint answers truthfully: an address with no proposal gets a 404
    saying so, and a capped one gets a 429 saying so. It therefore reveals
    whether a given address has applied for funding.

    That was a deliberate reversal, recorded in
    docs/superpowers/specs/2026-09-19-funding-menu-and-portal-lookup-design.md.
    The uniform reply it replaced protected a sensitive population from
    enumeration, but it charged the whole cost to the honest applicant who
    mistyped their address: a code screen, and an email that was never coming.
    Against a threat that needs the attacker to know the address already, on a
    small charity's site, that was judged the larger harm. If the applicant
    base grows more exposed, the middle road is to keep the truth but throttle
    how many addresses one IP may test per hour.
    """
    email = payload.email.strip()

    if not _dossiers_for(db, email):
        logger.info("Proposal portal: lookup for an address with no dossier")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="We have no proposal filed under this address.",
        )

    code = proposal_otp.issue_code(db, email=email, ip=client_ip(request))
    if code is None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many sign-in codes requested. Please wait a few minutes and try again.",
        )

    email_service.send_proposal_access_code(
        email=email, code=code, ttl_minutes=proposal_otp.CODE_TTL_MINUTES
    )
    return {"sent": True, "message": f"A sign-in code is on its way to {email}."}
```

- [ ] **Step 4: Fix `proposal_otp.py`'s module docstring**

Its final paragraph still describes the opaque behaviour ("the limit is never announced"). Replace that paragraph with:

```
The caps are announced: a capped caller receives a 429 telling them to wait.
Hiding it bought nothing once the endpoint began answering truthfully about
whether an address has a dossier at all.
```

Leave every constant and function untouched.

- [ ] **Step 5: Run the tests**

Run: `cd backend && python -m pytest tests/test_proposal_portal.py -v`
Expected: all pass.

- [ ] **Step 6: Run the suite**

Run: `cd backend && python -m pytest -q --ignore=tests/integration`
Expected: `11 failed, 489 passed` — the four deleted tests are replaced by four new ones, so the count is unchanged.

- [ ] **Step 7: Commit**

```bash
git add backend/routers/proposal_portal.py backend/proposal_otp.py backend/tests/test_proposal_portal.py
git commit -m "Tell an applicant plainly when no proposal is filed under their address"
```

---

## Task 2: The portal stops claiming a code was sent

**Files:**
- Modify: `frontend/src/utils/proposalPortalApi.ts`
- Modify: `frontend/src/pages/MyProposals.tsx`
- Test: `frontend/src/pages/__tests__/MyProposals.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/pages/__tests__/MyProposals.test.tsx` (match the file's existing `vi.mock`, render helper and import style — read it first):

```tsx
  it('tells the applicant plainly when no proposal is filed under the address', async () => {
    const user = userEvent.setup()
    vi.mocked(requestPortalCode).mockRejectedValue(notFoundError())
    renderPage()

    await user.type(screen.getByLabelText(/email address you applied with/i), 'nobody@example.com')
    await user.click(screen.getByRole('button', { name: /email me a code/i }))

    expect(await screen.findByText(/no proposal filed under this address/i)).toBeInTheDocument()
    expect(screen.getByText('nobody@example.com')).toBeInTheDocument()
    // The code screen must not appear: no code was sent.
    expect(screen.queryByLabelText(/six-digit code/i)).not.toBeInTheDocument()
  })

  it('offers both ways forward from the not-found screen', async () => {
    const user = userEvent.setup()
    vi.mocked(requestPortalCode).mockRejectedValue(notFoundError())
    renderPage()

    await user.type(screen.getByLabelText(/email address you applied with/i), 'nobody@example.com')
    await user.click(screen.getByRole('button', { name: /email me a code/i }))
    await screen.findByText(/no proposal filed under this address/i)

    expect(screen.getByRole('link', { name: /submit a proposal/i })).toHaveAttribute(
      'href', '/submit-proposal',
    )
    await user.click(screen.getByRole('button', { name: /try a different address/i }))

    const input = screen.getByLabelText(/email address you applied with/i) as HTMLInputElement
    expect(input.value).toBe('nobody@example.com')
  })

  it('says how long to wait when the address is capped', async () => {
    const user = userEvent.setup()
    vi.mocked(requestPortalCode).mockRejectedValue(
      axiosErrorWithStatus(429, 'Too many sign-in codes requested. Please wait a few minutes and try again.'),
    )
    renderPage()

    await user.type(screen.getByLabelText(/email address you applied with/i), 'amina@example.com')
    await user.click(screen.getByRole('button', { name: /email me a code/i }))

    expect(await screen.findByText(/wait a few minutes/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/six-digit code/i)).not.toBeInTheDocument()
  })
```

Add these helpers near the top of the file, after the existing imports:

```tsx
const axiosErrorWithStatus = (status: number, detail?: string) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data: detail ? { detail } : {} },
  })

const notFoundError = () =>
  axiosErrorWithStatus(404, 'We have no proposal filed under this address.')
```

If the file already defines an equivalent helper, reuse it rather than adding a second — say which you did.

- [ ] **Step 2: Run them and watch them fail**

Run: `cd frontend && npx vitest run src/pages/__tests__/MyProposals.test.tsx`
Expected: the three new tests FAIL — a rejected `requestPortalCode` currently lands on the generic "We could not send the code" error.

- [ ] **Step 3: Name the 404 in the API client**

In `frontend/src/utils/proposalPortalApi.ts`, export a predicate so the page does not reach into axios internals:

```ts
/** True when the backend said no proposal is filed under the address tried. */
export const isNoProposalForAddress = (error: unknown): boolean =>
  (error as { response?: { status?: number } })?.response?.status === 404
```

Leave `requestPortalCode` itself alone: letting the 404 reject is what carries the signal.

- [ ] **Step 4: Add the view**

In `frontend/src/pages/MyProposals.tsx`:

a) Widen the view union (line ~57):
```tsx
type View = 'email' | 'code' | 'list' | 'edit' | 'not-found'
```

b) Import the predicate alongside the existing imports from `../utils/proposalPortalApi`:
```tsx
  isNoProposalForAddress,
```

c) In `handleEmailSubmit`, branch on it before the generic message:
```tsx
    } catch (exc: any) {
      if (isNoProposalForAddress(exc)) {
        // Not an error the applicant caused -- most often they used a
        // different address than the one on the application. Say so, and
        // give them somewhere to go.
        setView('not-found')
      } else if (statusOf(exc) === 429) {
        setError(exc?.response?.data?.detail
          ?? 'Too many codes requested. Please wait a few minutes and try again.')
      } else {
        setError('We could not send the code. Please check the address and try again.')
      }
    } finally {
```

d) Add the panel, rendered when `view === 'not-found'`, in the same shell as the other panels and matching their Tailwind idiom (`bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8 max-w-md mx-auto space-y-4`):

```tsx
  const notFoundPanel = (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8 max-w-md mx-auto space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
          <AlertCircle className="w-5 h-5 text-amber-700" />
        </div>
        <div>
          <h2 className="font-semibold text-gray-900">No proposal filed under this address</h2>
          <p className="text-sm text-gray-600 mt-1">
            We looked for <strong className="text-gray-900 break-all">{email.trim()}</strong> and
            found nothing. The most common reason is that the application was sent from a
            different email address.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => { setView('email'); setError(''); setNotice('') }}
        className="w-full px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg"
      >
        Try a different address
      </button>
      <p className="text-sm text-gray-600 text-center">
        Never sent one?{' '}
        <Link to="/submit-proposal" className="text-primary-700 font-medium hover:underline">
          Submit a proposal
        </Link>
      </p>
    </div>
  )
```

`AlertCircle` and `Link` are already imported in this file — verify before adding either.

e) Wire it into the render chain beside the other panels, before the fall-through to `emailPanel`:
```tsx
    if (view === 'not-found') return shell(notFoundPanel)
```
Read the existing chain first and insert it so it cannot be shadowed by an earlier branch — in particular, the `if (editing)` branch must still win when a revision is in flight.

- [ ] **Step 5: Run the page tests**

Run: `cd frontend && npx vitest run src/pages/__tests__/MyProposals.test.tsx`
Expected: all pass, 13 total (10 existing + 3 new).

- [ ] **Step 6: Types, suite, build**

Run each and report each:
- `cd frontend && npx tsc --noEmit 2>&1 | grep -iE "MyProposals|proposalPortalApi"` → empty
- `cd frontend && npx vitest run` → `22 failed, 155 passed`
- `cd frontend && npm run build` → succeeds

- [ ] **Step 7: Commit**

```bash
git add frontend/src/utils/proposalPortalApi.ts frontend/src/pages/MyProposals.tsx \
        frontend/src/pages/__tests__/MyProposals.test.tsx
git commit -m "Show a real answer when no proposal is filed under an address"
```

---

## Task 3: The FundingMenu component

**Files:**
- Create: `frontend/src/components/nav/FundingMenu.tsx`
- Test: `frontend/src/components/nav/__tests__/FundingMenu.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/nav/__tests__/FundingMenu.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import FundingMenu, { FundingMenuMobile, FUNDING_ROUTES } from '../FundingMenu'

const renderDesktop = (route = '/') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <FundingMenu />
    </MemoryRouter>,
  )

describe('FundingMenu (desktop)', () => {
  it('starts closed and opens on click', async () => {
    const user = userEvent.setup()
    renderDesktop()

    const trigger = screen.getByRole('button', { name: /apply for funding/i })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    await user.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('offers both destinations, each explained', async () => {
    const user = userEvent.setup()
    renderDesktop()
    await user.click(screen.getByRole('button', { name: /apply for funding/i }))

    const submit = screen.getByRole('menuitem', { name: /submit a project proposal/i })
    const check = screen.getByRole('menuitem', { name: /check my application/i })

    expect(submit).toHaveAttribute('href', '/submit-proposal')
    expect(check).toHaveAttribute('href', '/my-proposals')
    expect(screen.getByText(/tell us about your project/i)).toBeInTheDocument()
    expect(screen.getByText(/where your request stands/i)).toBeInTheDocument()
  })

  it('closes on Escape and gives focus back to the trigger', async () => {
    const user = userEvent.setup()
    renderDesktop()
    const trigger = screen.getByRole('button', { name: /apply for funding/i })
    await user.click(trigger)

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
  })

  it('closes when a destination is chosen', async () => {
    const user = userEvent.setup()
    renderDesktop()
    await user.click(screen.getByRole('button', { name: /apply for funding/i }))

    await user.click(screen.getByRole('menuitem', { name: /submit a project proposal/i }))

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('marks itself current on both of its routes', () => {
    for (const route of FUNDING_ROUTES) {
      const { unmount } = renderDesktop(route)
      expect(screen.getByRole('button', { name: /apply for funding/i }))
        .toHaveAttribute('data-active', 'true')
      unmount()
    }
  })

  it('is not marked current elsewhere', () => {
    renderDesktop('/stories')
    expect(screen.getByRole('button', { name: /apply for funding/i }))
      .toHaveAttribute('data-active', 'false')
  })
})

describe('FundingMenuMobile', () => {
  it('shows both destinations with no expanding step', () => {
    const onNavigate = vi.fn()
    render(
      <MemoryRouter>
        <FundingMenuMobile onNavigate={onNavigate} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: /submit a project proposal/i }))
      .toHaveAttribute('href', '/submit-proposal')
    expect(screen.getByRole('link', { name: /check my application/i }))
      .toHaveAttribute('href', '/my-proposals')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('closes the mobile menu when a destination is chosen', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    render(
      <MemoryRouter>
        <FundingMenuMobile onNavigate={onNavigate} />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('link', { name: /check my application/i }))

    expect(onNavigate).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd frontend && npx vitest run src/components/nav`
Expected: FAIL — cannot resolve `../FundingMenu`.

- [ ] **Step 3: Create the component**

Create `frontend/src/components/nav/FundingMenu.tsx`:

```tsx
/**
 * The "Apply for Funding" entry in the main navigation.
 *
 * It exists because the two things a funding applicant needs were in the wrong
 * places: submitting a proposal sat inside the Quick Links grab-bag between
 * Book of Duas and Umrah Guidelines, and checking an existing application was
 * not in the main menu at all.
 *
 * Two renderings, one source of truth for the destinations:
 *   FundingMenu        — the desktop dropdown.
 *   FundingMenuMobile  — a card pinned above the mobile accordion, so the
 *                        destinations cost neither a scroll nor an expand.
 *                        Applicants who are not comfortable with the web do
 *                        not explore an accordion; they give up.
 *
 * Each row carries a subtitle. They are not decoration: they answer the
 * question someone hesitating over the link is actually asking. "Check my
 * application" rather than "My Proposals" because a person who sent a dossier
 * three weeks ago is looking for where their request stands, not for a list of
 * their proposals.
 *
 * Unlike the four dropdowns already in Header.tsx, this one is reachable by
 * keyboard and announced to a screen reader: aria-haspopup / aria-expanded,
 * Escape closes and returns focus, role="menu" / role="menuitem". Those four
 * are deliberately left alone -- reworking them is a separate job.
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronDown, FilePlus2, FileSearch, HeartHandshake } from 'lucide-react'
import clsx from 'clsx'

export const FUNDING_ROUTES = ['/submit-proposal', '/my-proposals'] as const

interface Destination {
  to: string
  title: string
  subtitle: string
  Icon: typeof FilePlus2
}

const DESTINATIONS: Destination[] = [
  {
    to: '/submit-proposal',
    title: 'Submit a project proposal',
    subtitle: 'Tell us about your project and request support',
    Icon: FilePlus2,
  },
  {
    to: '/my-proposals',
    title: 'Check my application',
    subtitle: 'See where your request stands, or make the changes we asked for',
    Icon: FileSearch,
  },
]

const useIsFundingRoute = (): boolean => {
  const { pathname } = useLocation()
  return FUNDING_ROUTES.some((route) => pathname.startsWith(route))
}

const FundingMenu = () => {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const isActive = useIsFundingRoute()

  useEffect(() => {
    if (!isOpen) return

    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setIsOpen(false)
      // Send focus back where it came from: a keyboard user who dismisses the
      // menu must not be dropped at the top of the document.
      triggerRef.current?.focus()
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen])

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        data-active={isActive}
        className={clsx(
          'flex items-center space-x-1.5 xl:space-x-2 px-1.5 xl:px-2.5 2xl:px-3 py-2 rounded-lg text-xs xl:text-sm font-semibold transition-all duration-300 whitespace-nowrap flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
          isActive
            ? 'text-primary-600 bg-primary-50 shadow-sm'
            : 'text-gray-700 hover:text-primary-600 hover:bg-primary-50/50',
        )}
      >
        <HeartHandshake className="w-3.5 xl:w-4 h-3.5 xl:h-4 flex-shrink-0" />
        <span className="hidden xl:inline">Apply for Funding</span>
        <span className="xl:hidden">Funding</span>
        <ChevronDown className={clsx(
          'w-3 xl:w-3.5 h-3 xl:h-3.5 transition-transform duration-300 flex-shrink-0',
          isOpen && 'transform rotate-180',
        )} />
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label="Apply for Funding"
          className="absolute left-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50"
        >
          {DESTINATIONS.map(({ to, title, subtitle, Icon }) => (
            <Link
              key={to}
              to={to}
              role="menuitem"
              onClick={() => setIsOpen(false)}
              className="flex items-start space-x-3 px-3 py-2.5 text-sm transition-all duration-200 rounded-lg mx-1 text-gray-700 hover:text-primary-600 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            >
              <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span className="flex flex-col">
                <span className="font-semibold">{title}</span>
                <span className="text-xs text-gray-500 leading-snug">{subtitle}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export const FundingMenuMobile = ({ onNavigate }: { onNavigate: () => void }) => (
  <div className="mx-2 mb-2 rounded-xl border border-primary-200 bg-primary-50/70 p-3">
    <p className="px-1 pb-2 text-xs font-bold uppercase tracking-wide text-primary-800">
      Apply for Funding
    </p>
    {DESTINATIONS.map(({ to, title, subtitle, Icon }) => (
      <Link
        key={to}
        to={to}
        onClick={onNavigate}
        className="flex items-start space-x-3 rounded-lg px-2 py-2.5 text-sm text-gray-800 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      >
        <Icon className="w-4 h-4 flex-shrink-0 mt-0.5 text-primary-700" />
        <span className="flex flex-col">
          <span className="font-semibold">{title}</span>
          <span className="text-xs text-gray-600 leading-snug">{subtitle}</span>
        </span>
      </Link>
    ))}
  </div>
)

export default FundingMenu
```

`HeartHandshake` is confirmed present in lucide-react 0.294 (`HandHeart`, the
more obvious name, is not — it arrived in a later release). `FilePlus2` and
`FileSearch` are confirmed present too.

- [ ] **Step 4: Run the tests**

Run: `cd frontend && npx vitest run src/components/nav`
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/nav
git commit -m "Add a Funding menu that answers what an applicant is actually asking"
```

---

## Task 4: Mount it, and clear the duplicate

**Files:**
- Modify: `frontend/src/components/Header.tsx`

Read the whole file first. It is 911 lines; the regions you need are the desktop nav (`<nav className="hidden md:flex …">`, around line 168) and the mobile menu (`{isMobileMenuOpen && (`, around line 596).

- [ ] **Step 1: Import the component**

Add beside the existing imports:
```tsx
import FundingMenu, { FundingMenuMobile } from './nav/FundingMenu'
```

- [ ] **Step 2: Mount the desktop dropdown**

Insert `<FundingMenu />` in the desktop nav **between the Tools dropdown and the Quick Links dropdown** — that is, immediately before the `{/* Quick Links Dropdown */}` comment at around line 357.

- [ ] **Step 3: Mount the mobile card**

Inside the mobile menu, as the **first** child of the scrollable list — above the first navigation link, outside every accordion section:
```tsx
                <FundingMenuMobile onNavigate={() => setIsMobileMenuOpen(false)} />
```
Use whatever the file's own handler for closing the mobile menu is; `setIsMobileMenuOpen(false)` is what the existing mobile links call — confirm and match it.

- [ ] **Step 4: Remove the duplicate**

a) Delete the `/submit-proposal` `<Link>` from the **desktop** Quick Links dropdown (around line 473, the block ending `<span>Submit a Proposal</span></Link>`).

b) Delete the `/submit-proposal` `<Link>` from the **mobile** Quick Links section (around line 816).

c) In `isQuickLinksActive()`, delete the line:
```tsx
           location.pathname.startsWith('/submit-proposal') ||
```

Check afterwards that `FileText` is still used elsewhere in the file before removing its import — `grep -c "FileText" frontend/src/components/Header.tsx`. Remove the import only if the count reaches zero.

- [ ] **Step 5: Verify the duplicate is really gone**

Run: `cd frontend && grep -n "submit-proposal" src/components/Header.tsx`
Expected: no output. The only references left in the app should be `FundingMenu.tsx`, `MyProposals.tsx`, `SubmitProposal.tsx`, `Footer.tsx` and `App.tsx`.

- [ ] **Step 6: Types, suite, build**

Run each and report each:
- `cd frontend && npx tsc --noEmit 2>&1 | grep -iE "Header|FundingMenu"` → empty
- `cd frontend && npx vitest run` → `22 failed, 163 passed`. **`Header.test.tsx` must still show exactly 7 failures** — more than 7 is yours.
- `cd frontend && npm run build` → succeeds

- [ ] **Step 7: See it in a real browser**

The docker stack may be down; bring up what you need and rebuild the frontend image, since it serves a baked nginx build rather than a dev server:
```bash
cd "C:/Users/Otmane/Desktop/Perso/Projets/my-zakat"
docker compose up -d --build frontend backend db
```
Then open `http://localhost:3000` and confirm, reporting what you saw:
1. "Apply for Funding" appears between *Tools* and *Quick Links*, and opens on click showing both rows with their subtitles.
2. *Quick Links* no longer contains "Submit a Proposal".
3. On `/submit-proposal` and `/my-proposals` the trigger is highlighted.
4. At a phone width (~390px) the burger menu opens with the Funding card first, above everything, needing no scroll.
5. `Escape` closes the desktop dropdown.

If you cannot drive a browser, say so plainly rather than claiming you did.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/Header.tsx
git commit -m "Put Apply for Funding in the main menu, and out of Quick Links"
```

---

## Task 5: Correct the documentation that now lies

**Files:**
- Modify: `docs/API.md`
- Modify: `docs/superpowers/specs/2026-09-17-proposal-versioning-design.md`

- [ ] **Step 1: Find every claim**

Run: `grep -rn "enumerat\|request-code\|identical\|opaque" docs/API.md docs/superpowers/specs/2026-09-17-proposal-versioning-design.md`
Read each hit in context.

- [ ] **Step 2: Correct `docs/API.md`**

In the `POST /api/project-proposals/portal/request-code` entry, replace the "always 202 / cannot be used to enumerate applicants" description with the three real outcomes — `202` with `{"sent": true, "message": …}`, `404` with `{"detail": "We have no proposal filed under this address."}`, `429` with the wait message — and state plainly that the endpoint therefore reveals whether an address has a proposal, with a pointer to the 2026-09-19 spec for why. Match the file's existing format exactly. Update the Rate-limiting section, which currently says the cap is never announced, and restore `429` in the Errors table if it was marked reserved.

- [ ] **Step 3: Correct the 2026-09-17 spec**

That document is the record of what was built, so it must not keep asserting a property the system no longer has. In its route table and its "Data isolation" / rate-limit prose, replace the no-enumeration claim with a sentence saying the guarantee was deliberately dropped on 2026-09-19, and link to the newer spec. Do not rewrite its history — add the correction, keep the original reasoning visible.

- [ ] **Step 4: Verify nothing stale survives**

Run: `grep -rn "cannot be used to enumerate\|identical body" docs/ --include="*.md" | grep -v 2026-09-19`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add docs/API.md docs/superpowers/specs/2026-09-17-proposal-versioning-design.md
git commit -m "Correct the docs that still promise an enumeration guarantee we dropped"
```

---

## Final verification

- [ ] `cd backend && python -m pytest -q --ignore=tests/integration` → `11 failed, 489 passed`
- [ ] `cd frontend && npx vitest run` → `22 failed, 163 passed`
- [ ] `cd frontend && npm run build` → succeeds
- [ ] `cd "C:/Users/Otmane/Desktop/Perso/Projets/my-zakat" && E2E_ADMIN_EMAIL=admin@example.com E2E_ADMIN_PASSWORD=admin123 npx playwright test e2e/proposal-versioning.spec.ts --reporter=list` → 2 passed. The E2E drives `/my-proposals` and the admin console; it is the check that this work did not break the feature it sits on.
- [ ] `grep -rn "OPAQUE_REQUEST_REPLY" backend/` → no output
