# Funding Menu & Portal Lookup — Design

**Date:** 2026-09-19
**Status:** Approved for planning

## Summary

Two changes, both aimed at the same people: applicants for funding, who are not
comfortable with the web and who currently have to find their way through a
navigation bar built for donors.

1. A dedicated **"Apply for Funding"** entry in the main navigation, holding the
   two destinations that matter to them — submit a proposal, and check one they
   already sent. Today the first is buried in the *Quick Links* grab-bag between
   *Book of Duas* and *Umrah Guidelines*, and the second is not in the main menu
   at all.
2. The portal's **email lookup tells the truth**. An address with no proposal
   currently lands on a code-entry screen that states "Enter the six-digit code
   we sent to <address>" — a sentence that is false, in front of the person
   least equipped to work out why nothing arrives.

## Goals

- An applicant who opens the menu looking for "how do I ask for help" finds it
  without scrolling or expanding anything, on a phone.
- The two destinations are distinguishable at a glance by someone who has never
  seen the site before.
- No screen in the portal asserts something that is not true.
- An address with no proposal is told so immediately, with a way forward.

## Non-goals

- The four-step proposal form itself. Out of scope, unchanged.
- The code-entry, dashboard and revision screens beyond the copy changes named
  below.
- The four existing navigation dropdowns. They are not reworked; the new one
  simply does not repeat their shortcomings.

## Current state

- `frontend/src/components/Header.tsx` — 911 lines. Desktop nav:
  *Our Impact · Our Work · Events · Get Involved · Urgent Needs ▾ · Tools ▾ ·
  Quick Links ▾ · About · Connect*, with responsive short labels
  (*Involved*, *Calc*, *Links*). Four hand-rolled dropdowns, each with its own
  `useState` and a shared click-outside effect. None carries `aria-haspopup`,
  `aria-expanded`, or an Escape handler.
- `/submit-proposal` sits inside the *Quick Links* dropdown (desktop line ~473,
  mobile ~816) and inside `isQuickLinksActive()`.
- `/my-proposals` appears only in `Footer.tsx`.
- Mobile menu: a vertical accordion of nine sections, rendered from
  `isMobileMenuOpen` at line 596.
- `backend/routers/proposal_portal.py` — `request_code` returns an identical
  opaque `202` for a known address, an unknown one, and a rate-limited one.
- `frontend/src/pages/MyProposals.tsx` — on any `202` it advances to the code
  view, which renders "Enter the six-digit code we sent to {email}".

## Decisions

| Question | Decision |
|---|---|
| Label | **"Apply for Funding"**, shortened to **"Funding"** when the bar tightens, matching the existing *Calculators → Calc* pattern. |
| Desktop placement | Between *Tools* and *Quick Links*. |
| Mobile placement | A pinned card at the top of the menu, **outside** the accordion. |
| Duplication | `/submit-proposal` leaves *Quick Links* entirely, and leaves `isQuickLinksActive()`. |
| Unknown address | **Told immediately**, with a link to submit a proposal. |
| Rate-limited address | Told truthfully again (`429`), since opacity no longer buys anything. |

### Why the mobile entry is pinned rather than another accordion section

A section would be consistent with the other nine, and would cost the applicant
two extra gestures — scroll, then expand — which is precisely the tax we are
trying to remove. Someone uncomfortable with the web does not explore an
accordion; they give up. The accepted cost is that the menu gives a funding
request more visual weight than *Donate*, on a site whose purpose is donations.
That trade was made deliberately.

### Why the lookup now reveals whether an address has a proposal

This reverses a property the feature shipped with, so the reasoning is recorded
rather than lost.

The opaque reply existed to stop anyone from discovering who had asked the
foundation for money — applicants for charitable funding being a sensitive
population. The cost of that protection falls entirely on the honest user who
mistyped their address or used a different one: they are sent to a dead-end
code screen and left waiting for an email that will never arrive, with no way
to tell a slow inbox from a wrong address.

Weighed against a threat that requires the attacker to already know the address
they are testing, on a small charity's site, the cost was judged the larger
harm. **The user made this call explicitly, with the trade-off stated.** If the
applicant base grows or becomes more exposed, the middle option remains
available: tell the truth, but throttle how many addresses one IP may test per
hour.

## The navigation entry

**Desktop.** A dropdown between *Tools* and *Quick Links*, opening onto two rows:

| Icon | Title | Subtitle | Destination |
|---|---|---|---|
| `FilePlus2` | Submit a project proposal | Tell us about your project and request support | `/submit-proposal` |
| `FileSearch` | Check my application | See where your request stands, or make the changes we asked for | `/my-proposals` |

The subtitles are not decoration: they answer the question someone hesitating
over the link is actually asking. "Check my application" rather than "My
Proposals" because a person who sent a dossier three weeks ago is looking for
*where does my request stand*, not *my proposals*.

The trigger is active (highlighted) on `/submit-proposal` and `/my-proposals`.

**Mobile.** A card pinned above the accordion: the heading *Apply for Funding*,
then the same two rows with the same titles and subtitles. No scrolling, no
expanding.

**Accessibility.** The trigger carries `aria-haspopup="menu"` and
`aria-expanded`; `Escape` closes and returns focus to the trigger; the panel is
`role="menu"` with `role="menuitem"` rows; focus rings are visible. The four
existing dropdowns have none of this and are left alone — but the new one does
not reproduce the defect.

## The portal lookup

`POST /api/project-proposals/portal/request-code` gains a third outcome:

| Case | Response |
|---|---|
| Address has at least one dossier, code issued | `202` — `{"sent": true, "message": "A sign-in code is on its way to <address>."}` |
| Address has no dossier | `404` — `{"detail": "We have no proposal filed under this address."}` |
| Rate limited | `429` — `{"detail": "Too many sign-in codes requested. Please wait a few minutes and try again."}` |

`proposal_otp.issue_code` and the caps are unchanged. Only the two early-return
branches in `request_code` change, plus the docstrings that describe the old
guarantee.

**Frontend.** `MyProposals.tsx` gains one view state, `not-found`, shown on a
`404`: the address that was tried, the plain statement that no proposal is
filed under it, and two ways forward — *Try a different address* (returns to the
email step, address prefilled for correction) and *Submit a proposal* (a link to
`/submit-proposal`). On `429` the real wait message. The code view is reached
only on a real `202`, so "the code we sent to <address>" becomes a true
statement.

## Files touched

| Path | Change |
|---|---|
| `frontend/src/components/nav/FundingMenu.tsx` | new: the dropdown, desktop and mobile variants |
| `frontend/src/components/Header.tsx` | mount it in both navs; drop `/submit-proposal` from *Quick Links* and from `isQuickLinksActive()` |
| `frontend/src/components/nav/__tests__/FundingMenu.test.tsx` | new |
| `backend/routers/proposal_portal.py` | the two early returns and their docstrings |
| `backend/tests/test_proposal_portal.py` | replace the two indistinguishability tests |
| `frontend/src/utils/proposalPortalApi.ts` | surface the 404 distinctly |
| `frontend/src/pages/MyProposals.tsx` | the `not-found` view, honest 429 copy |
| `frontend/src/pages/__tests__/MyProposals.test.tsx` | cover the new view |
| `docs/API.md`, `docs/superpowers/specs/2026-09-17-…-design.md` | correct the no-enumeration claim |

### Why a separate `FundingMenu.tsx`

`Header.tsx` is 911 lines with four dropdowns written inline; a fifth would push
it past a thousand and make this change hard to review. The new menu is
self-contained — it owns its open state, its keyboard handling and both
renderings — so it extracts cleanly without touching the other four. The
existing dropdowns are deliberately left as they are: reworking them is a
separate job with its own risk.

## Testing

- `FundingMenu`: renders both destinations with their subtitles; the trigger
  toggles `aria-expanded`; `Escape` closes and restores focus; clicking a row
  closes the menu; the mobile variant renders both rows without any expansion
  step; the trigger is marked active on both routes.
- `Header`: `/submit-proposal` no longer appears under *Quick Links*.
  (`Header.test.tsx` has 7 pre-existing failures on `main`; the new assertions
  go in the `FundingMenu` file rather than adding to a broken suite.)
- Backend: an unknown address answers `404` and issues no code and writes no
  row; a known address answers `202` and issues exactly one; a capped address
  answers `429`. The two tests asserting known and unknown are indistinguishable
  are deleted — they now assert the opposite of the intended behaviour.
- `MyProposals`: a `404` shows the not-found view naming the address tried and
  offering both ways forward; a `429` shows the wait message; the code view is
  never reached without a `202`.

## Risks

- **This reverses a documented security property.** `docs/API.md` and the
  2026-09-17 spec both assert the endpoint cannot be used to enumerate
  applicants. Both must be corrected in the same change, or the documentation
  becomes a false claim about a live system — which is worse than no claim.
- The mobile menu gains a pinned block above everything, including *Donate*.
  Visible to every visitor, not only applicants.
