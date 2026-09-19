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
