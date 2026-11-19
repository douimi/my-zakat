/**
 * A failed or abandoned donation's details: why it failed, what Stripe saw,
 * and the button that offers the donor help, against the backend's contract.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from 'react-query'
import AdminDonations from '../AdminDonations'

const showError = vi.fn()
const showSuccess = vi.fn()
vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ showError, showSuccess }),
}))
vi.mock('../../../store/authStore', () => ({
  useAuthStore: (selector: (s: { token: string | null }) => unknown) => selector({ token: 'test-token' }),
}))

const ABANDONED = {
  id: 7, name: 'Safa', email: 'safa@example.com', amount: 325.5, frequency: 'Abandoned',
  donated_at: '2026-11-18T19:52:56', stripe_session_id: 'cs_live_abc',
  failure_code: null, failure_detail: null,
  failure_explanation: 'The donor opened the Stripe payment page and left without paying. '
    + 'Stripe closed the session when it expired. No card was charged.',
  followup_status: null, followup_due_at: null, followup_sent_at: null,
}

vi.mock('../../../utils/api', () => ({
  donationsAPI: { getAll: vi.fn(async () => [ABANDONED]) },
}))

const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body })

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  showError.mockReset()
  showSuccess.mockReset()
  let sends = 0
  fetchMock = vi.fn(async (url: string) => {
    if (url.includes('/stripe-timeline')) {
      return json(200, {
        summary: 'The donor left without ever submitting a card: no payment was attempted.',
        steps: [
          { at: '2026-11-18T19:52:56Z', tone: 'info', label: 'Donor opened the Stripe payment page for $325.50 (Zakat)' },
          { at: '2026-11-19T19:52:56Z', tone: 'neutral', label: 'Stripe closed the payment page: it expired unpaid' },
        ],
        failure_explanation: ABANDONED.failure_explanation, failure_detail: null,
      })
    }
    if (url.includes('/send-followup')) {
      sends += 1
      if (!url.includes('force=true')) {
        return json(409, { detail: 'Safa already completed a donation of $100.00 on November 19, 2026 after this one. Send the email anyway?' })
      }
      return json(200, { ...ABANDONED, followup_status: 'sent', followup_sent_at: '2026-11-19T21:00:00' })
    }
    return json(200, [])  // fundraising projects
  })
  vi.stubGlobal('fetch', fetchMock)
})

const renderPage = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <AdminDonations />
  </QueryClientProvider>,
)

describe('a donation that did not go through', () => {
  it('shows why in the list, and what Stripe saw on demand in the details', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByText(/left without paying/, { selector: 'span' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'View details' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText("Why it didn't go through")).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'What happened exactly?' }))
    expect(await within(dialog).findByText(/without ever submitting a card/)).toBeInTheDocument()
    expect(within(dialog).getByText('Stripe closed the payment page: it expired unpaid')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/donations/7/stripe-timeline'),
      expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
    )
  })

  it('sends the help email by hand, asking first when the donor already gave', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'View details' }))

    await user.click(screen.getByRole('button', { name: 'Send help email' }))
    expect(await screen.findByText(/will receive the email from nhdieb@myzakat.org/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByText(/already completed a donation of \$100.00/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Send anyway' }))

    expect(await screen.findByText(/Help email sent to the donor on/)).toBeInTheDocument()
    expect(showSuccess).toHaveBeenCalledWith('Email sent', 'Help email sent to safa@example.com')
    expect(screen.getByRole('button', { name: 'Send help email again' })).toBeInTheDocument()
    const sends = fetchMock.mock.calls.filter(([u]) => String(u).includes('/send-followup'))
    expect(sends.map(([u]) => String(u).endsWith('?force=true'))).toEqual([false, true])
  })
})
