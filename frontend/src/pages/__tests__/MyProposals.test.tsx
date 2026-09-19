/**
 * The submitter portal's four-view state machine.
 *
 * The transitions worth pinning down are the ones that decide whether an
 * applicant keeps or loses a twenty-six field revision they have already typed
 * once, so most of these tests drive the form to its submit button and then
 * make the thirty-minute portal token lapse underneath it.
 *
 * `utils/proposalPortalApi` is mocked wholesale: the token lives in
 * sessionStorage behind `hasPortalToken`, so a mutable flag here stands in for
 * it and lets a test make a token appear (a verified code) or vanish (a lapsed
 * session) exactly where the real one would.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import MyProposals from '../MyProposals'
import {
  clearPortalToken, fetchMyProposals, hasPortalToken, requestPortalCode,
  submitRevision, verifyPortalCode,
} from '../../utils/proposalPortalApi'

vi.mock('../../utils/proposalPortalApi', () => ({
  hasPortalToken: vi.fn(),
  clearPortalToken: vi.fn(),
  fetchMyProposals: vi.fn(),
  requestPortalCode: vi.fn(),
  verifyPortalCode: vi.fn(),
  submitRevision: vi.fn(),
}))

const APPLICANT = 'amina@example.com'

/** A complete, valid content dict — every field clears ProposalForm's MIN_LEN
 *  map, so the wizard's Continue and Resubmit buttons actually enable. */
const CONTENT: Record<string, unknown> = {
  full_name: 'Amina Yusuf',
  national_id: 'ID-90210',
  date_of_birth_year: 1992,
  place_of_residence: 'Gaza City',
  mobile_number: '+970599000000',
  email: APPLICANT,
  educational_level: 'BSc Agricultural Engineering',
  project_name: 'Community Water Well',
  project_description: 'Drilling and equipping a community water well for displaced families.',
  problem_solved: 'There is no safe drinking water within four kilometres of the camp.',
  target_beneficiaries: '250 displaced families in the northern camp.',
  community_impact: 'Free, metered water points open to every household in the camp.',
  expected_impact: 'Fewer waterborne illnesses and hours of walking returned to schooling.',
  implementation_steps: 'Survey the site\nDrill the borehole\nInstall the pump',
  implementation_location: 'Northern displacement camp',
  required_materials: 'Drilling rig\nSubmersible pump\nStorage tank',
  expected_duration: 'Two weeks after procurement',
  continuity_plan: 'A local water committee collects a small maintenance fee.',
  feasibility: 'The aquifer is shallow here and the contractor is already on site.',
  expected_challenges: 'Fuel shortages: stockpile diesel before drilling starts.',
  number_of_beneficiaries: 250,
  cost_per_unit_usd: 20,
  unit_type: 'family',
  additional_expenses_usd: 0,
  additional_expenses_description: null,
  total_amount_usd: 5000,
}

const DOSSIER = {
  id: 41,
  project_name: 'Community Water Well',
  status: 'changes_requested',
  editable: true,
  submitted_at: '2026-01-05T10:00:00Z',
  updated_at: '2026-01-06T10:00:00Z',
  version_no: 1,
  decision_comment: 'Please give us a firmer beneficiary number.',
  content: CONTENT,
}

/** The shape axios hands the page: only `response.status` and the detail. */
const httpError = (status: number, detail?: unknown) =>
  ({ response: { status, data: { detail } } })

let tokenPresent = false

const renderPortal = () =>
  render(
    <HelmetProvider>
      <MemoryRouter>
        <MyProposals />
      </MemoryRouter>
    </HelmetProvider>,
  )

/** Open the dossier for revision from a tab that already holds a token. */
const openRevision = async (
  user: ReturnType<typeof userEvent.setup>,
  dossier: typeof DOSSIER = DOSSIER,
  email: string = APPLICANT,
) => {
  tokenPresent = true
  vi.mocked(fetchMyProposals).mockResolvedValue({ email, items: [dossier] })
  renderPortal()
  await user.click(await screen.findByRole('button', { name: /fix and resubmit/i }))
  await screen.findByRole('heading', { name: /personal information/i })
}

/** Walk the wizard from step 1 to the budget step, where Resubmit lives. */
const toBudgetStep = async (user: ReturnType<typeof userEvent.setup>) => {
  for (let i = 0; i < 3; i += 1) {
    await user.click(screen.getByRole('button', { name: /^continue$/i }))
  }
  await screen.findByRole('heading', { name: /required budget/i })
}

beforeEach(() => {
  vi.clearAllMocks()
  tokenPresent = false
  vi.mocked(hasPortalToken).mockImplementation(() => tokenPresent)
  vi.mocked(clearPortalToken).mockImplementation(() => { tokenPresent = false })
  vi.mocked(verifyPortalCode).mockImplementation(async () => { tokenPresent = true })
  vi.mocked(requestPortalCode).mockResolvedValue({ message: 'If that address has a proposal, a code is on its way.' })
  vi.mocked(fetchMyProposals).mockResolvedValue({ email: '', items: [] })
  vi.mocked(submitRevision).mockResolvedValue(DOSSIER as never)
})

describe('MyProposals — a reloaded tab', () => {
  it('goes straight to the list when the tab already holds a token', async () => {
    tokenPresent = true
    vi.mocked(fetchMyProposals).mockResolvedValue({ email: APPLICANT, items: [DOSSIER] })

    renderPortal()

    expect(await screen.findByRole('heading', { name: 'Community Water Well' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /sign in to your proposals/i })).toBeNull()
    expect(requestPortalCode).not.toHaveBeenCalled()
  })

  it('learns whose proposals it is showing from the response', async () => {
    // A same-tab reload keeps the token and loses every piece of React state,
    // `email` included — the sign-in input that used to set it never renders.
    // GET /portal/me returns the address the token was issued for, and the page
    // has to adopt it or it has nothing to show and nowhere to send a code.
    tokenPresent = true
    vi.mocked(fetchMyProposals).mockResolvedValue({ email: APPLICANT, items: [] })

    renderPortal()

    expect(await screen.findByText(`There is nothing filed under ${APPLICANT} yet.`))
      .toBeInTheDocument()
  })

  it('does not fall back to the sign-in box when the list fails to load', async () => {
    tokenPresent = true
    vi.mocked(fetchMyProposals).mockRejectedValue(httpError(500))

    renderPortal()

    expect(await screen.findByText(/could not load your proposals/i)).toBeInTheDocument()
    // The token is perfectly valid; asking for it again beside a load error is
    // a non-sequitur, and the empty state would claim there are no proposals.
    expect(screen.queryByRole('heading', { name: /sign in to your proposals/i })).toBeNull()
    expect(screen.queryByText(/no proposals yet/i)).toBeNull()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })
})

describe('MyProposals — a token that lapses mid-revision', () => {
  it('keeps the form and its edits when the PUT comes back 401', async () => {
    const user = userEvent.setup()
    await openRevision(user)
    await toBudgetStep(user)

    const count = screen.getByLabelText(/^beneficiaries \(count\)/i)
    await user.clear(count)
    await user.type(count, '300')

    vi.mocked(submitRevision).mockRejectedValueOnce(httpError(401))
    await user.click(screen.getByRole('button', { name: /^resubmit proposal$/i }))

    // The new code goes to the address /portal/me handed back — not to the
    // empty string a reloaded tab would otherwise have posted, which earns a
    // 422 and strands the applicant on a code panel no code can satisfy.
    await waitFor(() => expect(requestPortalCode).toHaveBeenCalledWith(APPLICANT))
    expect(screen.getByLabelText(new RegExp(`six-digit code we sent to ${APPLICANT}`, 'i')))
      .toBeInTheDocument()

    // `editing` survives — the dossier header is still rendered — and so does
    // every value in the still-mounted form, the fresh edit included.
    expect(screen.getByText(/Reference #41/)).toBeInTheDocument()
    expect(screen.getByDisplayValue('300')).toBeInTheDocument()
  })

  it('resubmits the identical payload once a fresh code is accepted', async () => {
    const user = userEvent.setup()
    await openRevision(user)
    await toBudgetStep(user)

    vi.mocked(submitRevision).mockRejectedValueOnce(httpError(401))
    await user.click(screen.getByRole('button', { name: /^resubmit proposal$/i }))
    await screen.findByRole('heading', { name: /confirm it's you/i })

    await user.type(screen.getByLabelText(/six-digit code/i), '424242')
    await user.click(screen.getByRole('button', { name: /confirm and send my proposal/i }))

    await waitFor(() => expect(submitRevision).toHaveBeenCalledTimes(2))
    const [firstId, firstPayload] = vi.mocked(submitRevision).mock.calls[0]
    const [secondId, secondPayload] = vi.mocked(submitRevision).mock.calls[1]
    expect(secondId).toBe(firstId)
    expect(secondPayload).toEqual(firstPayload)

    // And the applicant is told it went through, not asked to retype anything.
    expect(await screen.findByText(/updated proposal has been sent/i)).toBeInTheDocument()
  })

  it('keeps the form visible when it has no address to send a code to', async () => {
    // The belt-and-braces path: /portal/me answered without an address (or the
    // page never got that far), so there is nobody to email. The old code
    // posted the empty string anyway and hid the form behind the code panel,
    // where the only live control discarded the revision.
    const user = userEvent.setup()
    await openRevision(user, DOSSIER, '')
    await toBudgetStep(user)

    vi.mocked(submitRevision).mockRejectedValueOnce(httpError(401))
    await user.click(screen.getByRole('button', { name: /^resubmit proposal$/i }))

    expect(await screen.findByText(/no longer knows which address/i)).toBeInTheDocument()
    expect(requestPortalCode).not.toHaveBeenCalled()
    // Not hidden behind a code box, and the work is still reachable.
    expect(screen.queryByLabelText(/six-digit code/i)).toBeNull()
    expect(screen.getByRole('button', { name: /^resubmit proposal$/i })).toBeInTheDocument()
    // Still on the budget step the applicant was on, with its values intact.
    expect(screen.getByDisplayValue('250')).toBeInTheDocument()
    expect(screen.getByDisplayValue('family')).toBeInTheDocument()
  })
})

describe('MyProposals — the other ways a revision can fail', () => {
  it('says a closed dossier is closed', async () => {
    const user = userEvent.setup()
    await openRevision(user)
    await toBudgetStep(user)

    vi.mocked(submitRevision).mockRejectedValueOnce(httpError(409))
    await user.click(screen.getByRole('button', { name: /^resubmit proposal$/i }))

    expect(await screen.findByText(/no longer open for changes/i)).toBeInTheDocument()
  })

  it('feeds a 422 back into the form as field errors', async () => {
    const user = userEvent.setup()
    await openRevision(user)
    await toBudgetStep(user)

    vi.mocked(submitRevision).mockRejectedValueOnce(httpError(422, [
      { loc: ['body', 'cost_per_unit_usd'], msg: 'Input should be greater than 0' },
    ]))
    await user.click(screen.getByRole('button', { name: /^resubmit proposal$/i }))

    expect(await screen.findByText(/must be greater than zero/i)).toBeInTheDocument()
    expect(screen.getByText(/Step 4 · Cost per unit:/)).toBeInTheDocument()
  })
})

describe('MyProposals — the SMS opt-in', () => {
  it('restates an opt-in the dossier carries instead of revoking it', async () => {
    // Guards the wiring, not the backend: `serialize_for_portal` does not put
    // sms_consent in `content` yet, so today this arrives undefined and the box
    // stays clear. The moment it does arrive, a revision must not post `false`
    // over an opt-in the applicant never withdrew.
    const user = userEvent.setup()
    await openRevision(user, { ...DOSSIER, content: { ...CONTENT, sms_consent: true } })

    expect(screen.getByRole('checkbox')).toBeChecked()
    expect(screen.getByText(/opted in to SMS messages on your previous submission/i))
      .toBeInTheDocument()
  })

  it('leaves the box clear when the dossier carries no opt-in', async () => {
    const user = userEvent.setup()
    await openRevision(user)

    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })
})
