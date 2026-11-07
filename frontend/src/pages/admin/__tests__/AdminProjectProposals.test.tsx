/**
 * The admin proposals list against the contract the backend actually offers.
 *
 * `serialize_for_admin` flattens the CURRENT VERSION's content onto the
 * dossier, and tolerates a dossier that has no version yet — during the
 * migration-32 deployment window the tables exist but a dossier may not be
 * backfilled. In that state every content field comes back null, so these
 * tests render exactly that payload rather than a tidy fixture.
 *
 * The page talks to the API with raw `fetch` and the token out of
 * `useAuthStore`, not the axios client, so `fetch` is what gets mocked here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminProjectProposals from '../AdminProjectProposals'

const showError = vi.fn()
const showSuccess = vi.fn()
vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ showError, showSuccess }),
}))

// The page reads the token through a selector — `useAuthStore((s) => s.token)` —
// so the mock has to apply the selector rather than return the store object.
vi.mock('../../../store/authStore', () => ({
  useAuthStore: (selector: (s: { token: string | null }) => unknown) =>
    selector({ token: 'test-token' }),
}))

/** Stand in for GET /api/project-proposals/ with the given rows. */
const mockList = (items: Record<string, unknown>[]) => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ items, total: items.length }),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const renderPage = () => render(<AdminProjectProposals />)

/** A fully populated dossier — the happy path the page was written against. */
const COMPLETE = {
  id: 2,
  email: 'amina@example.com',
  full_name: 'Amina Yusuf',
  national_id: 'ID-90210',
  date_of_birth_year: 1992,
  place_of_residence: 'Gaza City',
  mobile_number: '+970599000000',
  educational_level: 'BSc',
  project_name: 'Community Water Well',
  project_description: 'A well.',
  problem_solved: 'No water.',
  target_beneficiaries: '250 families.',
  community_impact: 'Open water points.',
  expected_impact: 'Fewer illnesses.',
  implementation_steps: 'Survey\nDrill',
  implementation_location: 'Northern camp',
  required_materials: 'Rig\nPump',
  expected_duration: 'Two weeks',
  continuity_plan: 'A local committee.',
  feasibility: 'Shallow aquifer.',
  expected_challenges: 'Fuel shortages',
  number_of_beneficiaries: 250,
  cost_per_unit_usd: 20,
  unit_type: 'family',
  additional_expenses_usd: 0,
  additional_expenses_description: null,
  total_amount_usd: 5000,
  status: 'submitted',
  decision_comment: null,
  internal_note: null,
  version_count: 1,
  current_version_no: 1,
  versions: [],
  reviewed_at: null,
  reviewed_by: null,
  submitted_ip: null,
  submitted_at: '2026-08-01T10:00:00',
  updated_at: '2026-08-01T10:00:00',
}

describe('AdminProjectProposals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('does not crash on a dossier that has no version yet', async () => {
    // serialize_for_admin returns every content field as null when a dossier
    // has no version -- a real state during the migration window. The page
    // used to call .toLocaleString() straight on the money fields and take
    // the whole admin console down with it.
    mockList([{
      id: 1,
      email: 'legacy@example.com',
      status: 'submitted',
      submitted_at: '2026-08-01T10:00:00',
      updated_at: '2026-08-01T10:00:00',
      reviewed_at: null,
      reviewed_by: null,
      version_count: 0,
      current_version_no: null,
      versions: [],
      decision_comment: null,
      internal_note: null,
      full_name: null,
      project_name: null,
      total_amount_usd: null,
      cost_per_unit_usd: null,
      number_of_beneficiaries: null,
      additional_expenses_usd: null,
    }])

    renderPage()

    expect(await screen.findByText(/legacy@example.com/)).toBeInTheDocument()
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument()
  })

  it('still shows the real figures for a dossier that has a version', async () => {
    mockList([COMPLETE])

    renderPage()

    expect(await screen.findByText(/Community Water Well/)).toBeInTheDocument()
    // The thousands separator is whatever the runner's locale uses (a comma
    // here, a narrow no-break space on a French machine), so match the digits
    // and let the separator be any single non-digit.
    expect(screen.getByText(/^\$5\D?000$/)).toBeInTheDocument()
  })
})

/**
 * The reworked drawer.
 *
 * The complaint these answer: nine always-open sections and a permanent row of
 * five status buttons left the reviewer to work out where a dossier stood and
 * what to do with it. So what matters is not that the markup exists, but that
 * only ONE course of action is offered at a time, and that the buttons which do
 * not apply to a status are genuinely absent.
 */

/** Open the drawer for the single row in the list. */
const openDrawer = async (
  user: ReturnType<typeof userEvent.setup>,
  row: Record<string, unknown>,
) => {
  mockList([row])
  renderPage()
  await user.click(await screen.findByTitle(/review/i))
}

const lifecycleRow = (status: string, extra: Record<string, unknown> = {}) => ({
  ...COMPLETE,
  status,
  is_unread: false,
  is_revision: false,
  has_report: false,
  awaiting_report_review: false,
  report_unread: false,
  ...extra,
})

describe('AdminProjectProposals - the reworked drawer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('shows where the dossier stands as a lifecycle, not a lone badge', async () => {
    const user = userEvent.setup()
    await openDrawer(user, lifecycleRow('funded'))
    for (const step of ['Received', 'Review', 'Approved', 'Funded', 'Report', 'Completed']) {
      expect(screen.getAllByText(step).length).toBeGreaterThan(0)
    }
  })

  it('names who a stalled dossier is waiting on', async () => {
    const user = userEvent.setup()
    await openDrawer(user, lifecycleRow('funded'))
    // Said twice on purpose: under the stepper, and as the Next step title.
    expect(screen.getAllByText(/waiting on the team/i).length).toBeGreaterThan(0)
  })

  it('offers the review verdicts only while a verdict is the next move', async () => {
    const user = userEvent.setup()
    await openDrawer(user, lifecycleRow('submitted'))
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ask for changes/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /decline/i })).toBeInTheDocument()
  })

  it('does not offer a verdict on a closed dossier', async () => {
    // The old footer showed Mark submitted / under review / Request changes /
    // Reject / Approve on every dossier, completed ones included. That is the
    // single worst piece of the clutter, so it gets its own test.
    const user = userEvent.setup()
    await openDrawer(user, lifecycleRow('completed', { has_report: true }))
    expect(screen.queryByRole('button', { name: /^approve$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /decline/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ask for changes/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /mark under review/i })).not.toBeInTheDocument()
  })

  it('offers funding only on an approved dossier', async () => {
    const user = userEvent.setup()
    await openDrawer(user, lifecycleRow('approved'))
    expect(screen.getByRole('button', { name: /mark as funded/i })).toBeInTheDocument()
  })

  it('does not offer funding before approval', async () => {
    const user = userEvent.setup()
    await openDrawer(user, lifecycleRow('under_review'))
    expect(screen.queryByRole('button', { name: /mark as funded/i })).not.toBeInTheDocument()
  })

  it('points the reviewer at a report that is waiting', async () => {
    const user = userEvent.setup()
    await openDrawer(user, lifecycleRow('report_submitted', {
      has_report: true, awaiting_report_review: true,
    }))
    expect(screen.getByRole('button', { name: /read the report/i })).toBeInTheDocument()
  })

  it('offers to reopen a declined dossier instead of leaving it dead', async () => {
    const user = userEvent.setup()
    await openDrawer(user, lifecycleRow('rejected'))
    expect(screen.getByRole('button', { name: /reopen for review/i })).toBeInTheDocument()
    expect(screen.getByText(/stopped here/i)).toBeInTheDocument()
  })

  it('hides the agreement and report tabs until they can hold anything', async () => {
    const user = userEvent.setup()
    await openDrawer(user, lifecycleRow('submitted'))
    expect(screen.getByRole('button', { name: /^application$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^agreement$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^report$/i })).not.toBeInTheDocument()
  })

  it('shows the agreement tab from approval onwards', async () => {
    const user = userEvent.setup()
    await openDrawer(user, lifecycleRow('approved'))
    expect(screen.getByRole('button', { name: /^agreement$/i })).toBeInTheDocument()
  })

  it('opens on the application and keeps the other tabs out of the way', async () => {
    const user = userEvent.setup()
    await openDrawer(user, lifecycleRow('funded', { has_report: true }))
    expect(await screen.findByText(/1\. Personal information/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Version history/i })).not.toBeInTheDocument()
  })

  it('switches to the history tab on demand', async () => {
    const user = userEvent.setup()
    await openDrawer(user, lifecycleRow('funded', { has_report: true }))
    await user.click(screen.getByRole('button', { name: /history/i }))
    expect(await screen.findByRole('heading', { name: /Version history/i })).toBeInTheDocument()
    expect(screen.queryByText(/1\. Personal information/i)).not.toBeInTheDocument()
  })
})

describe('AdminProjectProposals - the reworked list', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('says in words what a row needs, not in a colour alone', async () => {
    mockList([lifecycleRow('report_submitted', {
      has_report: true, awaiting_report_review: true,
    })])
    renderPage()
    expect(await screen.findByText('Review report')).toBeInTheDocument()
    // And the status column says where it IS, not what to do about it.
    expect(screen.getByText('Report filed')).toBeInTheDocument()
  })

  it('reports the report review ahead of an unread application', async () => {
    // Both are true. The report wins: it has money already spent behind it.
    mockList([lifecycleRow('report_submitted', {
      has_report: true, awaiting_report_review: true,
      is_unread: true, is_revision: true,
    })])
    renderPage()
    expect(await screen.findByText('Review report')).toBeInTheDocument()
    expect(screen.queryByText(/Changed/)).not.toBeInTheDocument()
  })

  it('distinguishes a changed application from a new one', async () => {
    mockList([lifecycleRow('submitted', { is_unread: true, is_revision: true })])
    renderPage()
    expect(await screen.findByText(/Changed/)).toBeInTheDocument()
  })

  it('leaves a row that needs nothing visibly quiet', async () => {
    mockList([lifecycleRow('completed', { has_report: true })])
    renderPage()
    expect(await screen.findByText(/Community Water Well/)).toBeInTheDocument()
    expect(screen.queryByText('Review report')).not.toBeInTheDocument()
    expect(screen.queryByText('New')).not.toBeInTheDocument()
    expect(screen.queryByText(/Changed/)).not.toBeInTheDocument()
  })
})

describe('AdminProjectProposals - resending the status email', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  const SENT = [
    { id: 9, template: 'proposal_access_code', subject: 'Your sign-in code', status: 'sent',
      error: null, resent: false, created_at: '2026-11-06T09:00:00', sent_at: '2026-11-06T09:00:05' },
    { id: 8, template: 'proposal_funded', subject: 'Your project #2 has been funded — MyZakat',
      status: 'failed', error: 'Mailbox unavailable', resent: false,
      created_at: '2026-11-01T09:00:00', sent_at: null },
  ]

  /** Answer each endpoint the drawer calls with its own shape. */
  const mockApi = (row: Record<string, unknown>, opts: { resend?: { ok: boolean; body: unknown } } = {}) => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/resend-notification')) {
        const r = opts.resend ?? { ok: true, body: { queued: true, notification: 'Funded: how to send the report', to: 'amina@example.com' } }
        return { ok: r.ok, json: async () => r.body }
      }
      if (url.includes('/notifications')) return { ok: true, json: async () => ({ email: 'amina@example.com', items: SENT }) }
      if (init?.method === 'POST') return { ok: true, json: async () => ({ unread_count: 0 }) }
      if (url.match(/project-proposals\/(\?|$)/)) return { ok: true, json: async () => ({ items: [row], total: 1 }) }
      return { ok: true, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  const open = async (status: string) => {
    const user = userEvent.setup()
    const fetchMock = mockApi(lifecycleRow(status))
    renderPage()
    await user.click(await screen.findByTitle(/review/i))
    return { user, fetchMock }
  }

  it('says what was last sent, and how it went, next to the button', async () => {
    await open('funded')
    expect(await screen.findByText(/last email: "your project #2 has been funded/i))
      .toHaveTextContent(/failed/i)
  })

  it('resends the email for the current status after confirming', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { user, fetchMock } = await open('funded')

    await user.click(await screen.findByRole('button', { name: /resend "funded: how to send the report"/i }))

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('amina@example.com'))
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/project-proposals/2/resend-notification'),
      expect.objectContaining({ method: 'POST' }))
    expect(showSuccess).toHaveBeenCalledWith('Email queued', expect.stringContaining('amina@example.com'))
  })

  it('sends nothing when the admin cancels', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { user, fetchMock } = await open('funded')
    await user.click(await screen.findByRole('button', { name: /resend/i }))
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('resend-notification'))).toBe(false)
  })

  it('shows the server reason when the address is blocked', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    mockApi(lifecycleRow('funded'), {
      resend: { ok: false, body: { detail: 'amina@example.com is on the suppression list.' } },
    })
    renderPage()
    await user.click(await screen.findByTitle(/review/i))

    await user.click(await screen.findByRole('button', { name: /resend/i }))

    expect(showError).toHaveBeenCalledWith('Not sent', 'amina@example.com is on the suppression list.')
  })

  it('lists every email, sign-in codes included, in the history tab', async () => {
    const { user } = await open('funded')
    await user.click(screen.getByRole('button', { name: /history/i }))

    const list = await screen.findByTestId('sent-emails')
    expect(list).toHaveTextContent('Sign-in code')
    expect(list).toHaveTextContent('Failed')
    expect(list).toHaveTextContent('Mailbox unavailable')
  })
})
