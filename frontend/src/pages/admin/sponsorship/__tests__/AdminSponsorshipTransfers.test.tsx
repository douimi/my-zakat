import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import type { PayoutPeriod, PayoutRow } from '../../../../utils/sponsorshipApi'

const auth = vi.hoisted(() => ({ isAdmin: true }))
vi.mock('../../../../store/authStore', () => ({
  useAuthStore: (sel?: (s: unknown) => unknown) => (sel ? sel(auth) : auth),
}))
vi.mock('../../../../contexts/ToastContext', () => ({
  useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

const api = vi.hoisted(() => ({
  payouts: vi.fn(),
  planPayouts: vi.fn(),
  confirmPayouts: vi.fn(),
  exportPayouts: vi.fn(),
  confirmPayout: vi.fn(),
  editPayout: vi.fn(),
  cancelPayout: vi.fn(),
}))
vi.mock('../../../../utils/sponsorshipApi', async () => {
  const actual = await vi.importActual<object>('../../../../utils/sponsorshipApi')
  return { ...actual, sponsorshipAdmin: api }
})

import AdminSponsorshipTransfers from '../AdminSponsorshipTransfers'

const row = (over: Partial<PayoutRow> = {}): PayoutRow => ({
  payout_id: 1, case_id: 7, reference: 'F-KP4LFW', kind: 'family', case_status: 'published',
  recipient: 'Khadija Benali', child: null, phone: '+212600000000', organization: 'Jamiyat Al-Amal',
  address: '12 Rue X', city: 'Agadir', region: null, country: 'Morocco', monthly_cents: 25000,
  balance_before_cents: 40000, amount_cents: 25000, balance_after_cents: 15000, status: 'planned',
  method: null, transfer_reference: null, note: null, received_on: null, ...over,
})
const period = (items: PayoutRow[]): PayoutPeriod => ({
  period: '2026-11', items,
  totals: {
    planned_cents: items.filter((r) => r.status === 'planned').reduce((s, r) => s + r.amount_cents, 0),
    confirmed_cents: items.filter((r) => r.status === 'confirmed').reduce((s, r) => s + r.amount_cents, 0),
    lines: items.length,
  },
})

const renderPage = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><AdminSponsorshipTransfers /></MemoryRouter>
  </QueryClientProvider>,
)

describe('AdminSponsorshipTransfers', () => {
  beforeEach(() => {
    auth.isAdmin = true
    Object.values(api).forEach((f) => f.mockReset())
  })

  it('prepares the month and lists who to pay, where and how much', async () => {
    api.payouts.mockResolvedValue(period([]))
    api.planPayouts.mockResolvedValue({ created: 1, ...period([row()]) })
    renderPage()

    expect(await screen.findByText(/No transfers for/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Prepare this month/ }))

    expect(await screen.findByText('Khadija Benali')).toBeInTheDocument()
    expect(screen.getByText('Agadir, Morocco')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'F-KP4LFW' })).toHaveAttribute('href', '/admin/sponsorship/cases/7?tab=funds')
    expect(api.planPayouts).toHaveBeenCalled()
  })

  it('confirms a selection as received in one go', async () => {
    api.payouts.mockResolvedValue(period([row(), row({ payout_id: 2, reference: 'O-4BG2ME', recipient: 'Fatima' })]))
    api.confirmPayouts.mockResolvedValue({ refused: [], ...period([row({ status: 'confirmed' })]) })
    renderPage()

    await userEvent.click(await screen.findByLabelText('Select every transfer still to send'))
    await userEvent.click(screen.getByRole('button', { name: /Confirm 2 as received/ }))

    await waitFor(() => expect(api.confirmPayouts).toHaveBeenCalledWith([1, 2], expect.objectContaining({ method: 'bank_transfer' })))
  })

  it('is for administrators only', () => {
    auth.isAdmin = false
    renderPage()
    expect(screen.getByText('Administrators only')).toBeInTheDocument()
    expect(api.payouts).not.toHaveBeenCalled()
  })
})
