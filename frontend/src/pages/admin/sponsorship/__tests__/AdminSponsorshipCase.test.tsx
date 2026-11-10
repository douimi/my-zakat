import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from 'react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AdminSponsorshipCase from '../AdminSponsorshipCase'
import { staffCase } from './fixtures'
import type { StaffCase } from '../../../../utils/sponsorshipApi'

const api = {
  get: vi.fn(),
  transition: vi.fn(),
  addDisbursement: vi.fn(),
}
vi.mock('../../../../utils/sponsorshipApi', () => ({
  sponsorshipAdmin: {
    get: (...a: unknown[]) => api.get(...a),
    transition: (...a: unknown[]) => api.transition(...a),
    addDisbursement: (...a: unknown[]) => api.addDisbursement(...a),
  },
  errorDetail: (e: any) => {
    const d = e?.response?.data?.detail
    return typeof d === 'string' ? d : d?.message ?? null
  },
}))

const auth = { isAdmin: true, user: { id: 42, email: 'reviewer@myzakat.org' } }
vi.mock('../../../../store/authStore', () => ({
  useAuthStore: (selector?: (s: typeof auth) => unknown) => (selector ? selector(auth) : auth),
}))

vi.mock('../../../../contexts/ToastContext', () => ({
  useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

const renderCase = (c: StaffCase, query = '') => {
  api.get.mockResolvedValue(c)
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[`/admin/sponsorship/cases/${c.id}${query}`]}>
        <Routes>
          <Route path="/admin/sponsorship/cases/:id" element={<AdminSponsorshipCase />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AdminSponsorshipCase', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.transition.mockReset()
    api.addDisbursement.mockReset()
    auth.isAdmin = true
  })

  it('explains each approval blocker in words and holds back the Approve button', async () => {
    renderCase(staffCase())
    expect(await screen.findByRole('heading', { level: 1, name: /F-7K2Q9M/ })).toBeInTheDocument()
    expect(screen.getByText('The required document “Identity document” is not verified yet.')).toBeInTheDocument()
    expect(screen.getByText('Possible duplicates have not been reviewed yet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Approve/ })).toBeDisabled()
    // The other decisions stay available.
    expect(screen.getByRole('button', { name: 'Request information' })).toBeEnabled()
  })

  it('requires a message to the applicant before requesting information', async () => {
    const updated = staffCase({ status: 'info_requested', allowed_actions: ['reject', 'close'], approval_blockers: [] })
    api.transition.mockResolvedValue(updated)
    renderCase(staffCase())

    await userEvent.click(await screen.findByRole('button', { name: 'Request information' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Request information' }))

    expect(within(dialog).getByText('Write the message the applicant will receive.')).toBeInTheDocument()
    expect(api.transition).not.toHaveBeenCalled()

    await userEvent.type(within(dialog).getByLabelText(/Message to the applicant \(required\)/), 'Please send a clearer copy of the ID.')
    await userEvent.type(within(dialog).getByLabelText(/Internal note/), 'Scan is blurred')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Request information' }))

    expect(api.transition).toHaveBeenCalledWith(7, expect.objectContaining({
      action: 'request_info', message: 'Please send a clearer copy of the ID.', note: 'Scan is blurred',
    }))
    expect(await screen.findByText('Info requested')).toBeInTheDocument()
  })

  it('shows the server’s blockers when it refuses a transition', async () => {
    api.transition.mockRejectedValue({
      response: { status: 409, data: { detail: { message: 'This case cannot be published yet.', blockers: ['no_public_story'] } } },
    })
    renderCase(staffCase({ status: 'approved', allowed_actions: ['request_info', 'reject', 'publish', 'close'], approval_blockers: [], publish_blockers: [] }))

    await userEvent.click(await screen.findByRole('button', { name: /^Publish/ }))
    const dialog = screen.getByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Publish' }))

    expect(await within(dialog).findByText('This case cannot be published yet.')).toBeInTheDocument()
    expect(within(dialog).getByText('The public profile has no story.')).toBeInTheDocument()
  })

  it('asks an admin to confirm ending active sponsorships before closing', async () => {
    const sp = {
      id: 5, sponsor_name: 'Sara', sponsor_email: 'sara@example.org', monthly_amount_cents: 15000, status: 'active' as const,
      started_at: '2026-10-05T00:00:00', last_payment_at: null, ended_at: null, end_reason: null, end_note: null,
      ended_by: null, created_at: '2026-10-05T00:00:00', payments: [],
    }
    api.transition.mockResolvedValue(staffCase({ status: 'closed', allowed_actions: ['reopen'] }))
    renderCase(staffCase({ status: 'published', allowed_actions: ['pause', 'close'], approval_blockers: [], sponsorships: [sp] }))

    await userEvent.click(await screen.findByRole('button', { name: 'Close case' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.selectOptions(within(dialog).getByLabelText('Why is the case closed?'), 'self_sufficient')
    const confirm = within(dialog).getByRole('checkbox', { name: /End the 1 active sponsorship/ })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close case' }))
    expect(api.transition).not.toHaveBeenCalled()

    await userEvent.click(confirm)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close case' }))
    expect(api.transition).toHaveBeenCalledWith(7, expect.objectContaining({
      action: 'close', close_reason: 'self_sufficient', end_sponsorships: true,
    }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('does not offer the disbursement form to a manager', async () => {
    auth.isAdmin = false
    renderCase(staffCase({ status: 'published', allowed_actions: ['pause', 'close'], approval_blockers: [] }), '?tab=funds')
    expect(await screen.findByText('Only an administrator can record a disbursement.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Record a disbursement/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Amount (USD)')).not.toBeInTheDocument()
  })

  it('lets an admin record a disbursement', async () => {
    api.addDisbursement.mockResolvedValue(staffCase())
    renderCase(staffCase({ status: 'published', allowed_actions: ['pause', 'close'], approval_blockers: [] }), '?tab=funds')
    await userEvent.click(await screen.findByRole('button', { name: /Record a disbursement/ }))
    const dialog = screen.getByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Amount (USD)'), '120.50')
    await userEvent.type(within(dialog).getByLabelText('Public description (English)'), 'Food basket for November')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Record disbursement' }))
    expect(api.addDisbursement).toHaveBeenCalledWith(7, expect.objectContaining({
      amount_cents: 12050, category: 'food', description: 'Food basket for November',
    }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
