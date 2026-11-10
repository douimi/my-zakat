import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from 'react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AdminSponsorshipCases from '../AdminSponsorshipCases'
import { summary } from './fixtures'

const cases = vi.fn()
vi.mock('../../../../utils/sponsorshipApi', () => ({
  sponsorshipAdmin: { cases: (...args: unknown[]) => cases(...args) },
  errorDetail: () => null,
}))

const COUNTS = { submitted: 2, under_review: 1, info_requested: 0, approved: 0, published: 1, paused: 0, rejected: 0, closed: 0 }

const renderAt = (path = '/admin/sponsorship/families') =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/sponsorship/families" element={<AdminSponsorshipCases kind="family" />} />
          <Route path="/admin/sponsorship/cases/:id" element={<h1>Case page</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

describe('AdminSponsorshipCases', () => {
  beforeEach(() => {
    cases.mockReset()
    cases.mockResolvedValue({
      total: 2,
      status_counts: COUNTS,
      items: [
        summary(),
        summary({
          id: 8, reference: 'F-PUB123', name: 'Youssef Amrani', status: 'published', unread: false, docs_pending: 0,
          submitter_type: 'self', organization_name: null, submitter_email: 'youssef@example.org',
          coverage: { monthly_need_cents: 20000, committed_cents: 10000, remaining_cents: 10000, available_cents: 10000, percent: 50, state: 'partial', sponsors: 1, overfunded: false },
        }),
      ],
    })
  })

  it('renders one row per case from the API, with status, submitter and coverage', async () => {
    renderAt()
    expect(await screen.findByRole('link', { name: 'F-7K2Q9M' })).toHaveAttribute('href', '/admin/sponsorship/cases/7')
    expect(cases).toHaveBeenCalledWith(expect.objectContaining({ kind: 'family' }))

    const rows = screen.getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByText('Fatima Haddad')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Al Amal Association')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Under review')).toBeInTheDocument()
    expect(within(rows[0]).getByText('New activity')).toBeInTheDocument()
    expect(within(rows[0]).getByText('1 document to verify')).toBeInTheDocument()

    expect(within(rows[1]).getByText('Youssef Amrani')).toBeInTheDocument()
    expect(within(rows[1]).getByText('The family')).toBeInTheDocument()
    expect(within(rows[1]).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
  })

  it('shows status tabs with the counts and filters the query by status', async () => {
    renderAt()
    await screen.findByRole('link', { name: 'F-7K2Q9M' })
    const tabs = screen.getByRole('group', { name: 'Filter by status' })
    expect(within(tabs).getByRole('button', { name: /^All 4$/ })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(within(tabs).getByRole('button', { name: /^Submitted 2$/ }))
    expect(cases).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'family', status: 'submitted' }))
  })

  it('reads its filters from the URL, so the overview can link to a filtered list', async () => {
    renderAt('/admin/sponsorship/families?status=published&funding=partial')
    await screen.findByRole('link', { name: 'F-7K2Q9M' })
    expect(cases).toHaveBeenCalledWith(expect.objectContaining({ status: 'published', funding: 'partial' }))
  })

  it('opens the case page when a row is clicked', async () => {
    renderAt()
    await userEvent.click(await screen.findByText('Youssef Amrani'))
    expect(await screen.findByRole('heading', { name: 'Case page' })).toBeInTheDocument()
  })
})
