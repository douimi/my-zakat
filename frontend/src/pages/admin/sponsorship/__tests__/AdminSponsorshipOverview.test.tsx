import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from 'react-query'
import { MemoryRouter } from 'react-router-dom'
import AdminSponsorshipOverview from '../AdminSponsorshipOverview'
import type { Overview } from '../../../../utils/sponsorshipApi'

const zero = { submitted: 0, under_review: 0, info_requested: 0, approved: 0, published: 0, paused: 0, rejected: 0, closed: 0 }
const OVERVIEW: Overview = {
  pipeline: { family: { ...zero, submitted: 3, published: 2 }, orphan: { ...zero, under_review: 1 } },
  unread: 4,
  funding: { full: 1, partial: 1, unfunded: 0 },
  monthly_need_cents: 50000,
  monthly_committed_cents: 37500,
  coverage_percent: 75,
  sponsorships: {
    active: 3, past_due: 1, sponsors: 3, started_this_month: 2, ended_this_month: 1,
    end_reasons: { financial: 1 }, monthly_recurring_cents: 37500,
  },
  money: {
    collected_this_month_cents: 37500, disbursed_this_month_cents: 20000,
    collected_total_cents: 120000, disbursed_total_cents: 90000, undistributed_cents: 30000,
  },
  timing: { avg_review_days: 4.5, avg_wait_for_sponsor_days: null },
  alerts: {
    documents_pending: [{ id: 7, reference: 'F-7K2Q9M', count: 2 }],
    duplicates: [], overfunded: [], aging_out: [], no_recent_update: [], idle_funds: [],
    past_due: [{ id: 5, case_id: 8, reference: 'O-PASTDU' }],
  },
}

vi.mock('../../../../utils/sponsorshipApi', () => ({
  sponsorshipAdmin: { overview: () => Promise.resolve(OVERVIEW) },
}))

describe('AdminSponsorshipOverview', () => {
  it('shows the pipeline with links to the filtered lists, money in dollars and the alerts', async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter><AdminSponsorshipOverview /></MemoryRouter>
      </QueryClientProvider>,
    )
    expect(await screen.findByText('4 with new activity')).toBeInTheDocument()

    const submitted = screen.getAllByRole('link', { name: /Submitted/ })[0]
    expect(submitted).toHaveAttribute('href', '/admin/sponsorship/families?status=submitted')
    expect(within(submitted).getByText('3')).toBeInTheDocument()

    expect(screen.getByText('75%')).toBeInTheDocument()
    expect(screen.getByText('$375 of $500 a month')).toBeInTheDocument()
    expect(screen.getByText('$300')).toBeInTheDocument()
    expect(screen.getByText('4.5 d')).toBeInTheDocument()

    // Alerts are folded to one line each; opening one lists the cases with links.
    await userEvent.click(screen.getByRole('button', { name: /Documents awaiting verification · 1/ }))
    expect(screen.getByRole('link', { name: 'F-7K2Q9M' })).toHaveAttribute('href', '/admin/sponsorship/cases/7?tab=documents')
    await userEvent.click(screen.getByRole('button', { name: /Sponsor payments failing/ }))
    expect(screen.getByRole('link', { name: 'O-PASTDU' })).toHaveAttribute('href', '/admin/sponsorship/cases/8?tab=sponsorships')
  })
})
