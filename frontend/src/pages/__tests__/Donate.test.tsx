import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import { HelmetProvider } from 'react-helmet-async'
import { ToastProvider } from '../../contexts/ToastContext'
import { Elements } from '@stripe/react-stripe-js'

// Mock Stripe
vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: any) => <div>{children}</div>,
  CardElement: () => <div data-testid="card-element">Card Input</div>,
  useStripe: () => ({
    redirectToCheckout: vi.fn().mockResolvedValue({ error: null }),
  }),
  useElements: () => ({}),
}))

// Mock API
vi.mock('../../utils/api', () => ({
  donationsAPI: {
    createPaymentSession: vi.fn(),
    createSubscription: vi.fn(),
    getStats: vi.fn().mockResolvedValue({
      total_donations: 50000,
      total_donors: 200,
      recent_donations: [],
      impact: { meals: 25000, families: 1200, orphans: 500 },
    }),
    getRecentPublic: vi.fn().mockResolvedValue([]),
  },
  getStaticFileUrl: (path: string) => `http://localhost:8000${path}`,
}))

// Mock auth store
vi.mock('../../store/authStore', () => ({
  useAuthStore: () => ({
    isAuthenticated: false,
    user: null,
  }),
}))

import Donate from '../Donate'
import { donationsAPI } from '../../utils/api'

const mockedDonationsAPI = vi.mocked(donationsAPI)

function renderDonate(initialEntries = ['/donate']) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <HelmetProvider>
      <ToastProvider>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={initialEntries}>
            <Donate />
          </MemoryRouter>
        </QueryClientProvider>
      </ToastProvider>
    </HelmetProvider>,
  )
}

describe('Donate Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedDonationsAPI.createPaymentSession.mockResolvedValue({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.com/pay/cs_test_123',
    })
  })

  it('renders the donation form with amount input', () => {
    renderDonate()
    // Should have at least one numeric input (the amount field)
    const inputs = screen.getAllByRole('spinbutton')
    expect(inputs.length).toBeGreaterThanOrEqual(1)
  })

  it('shows quick amount buttons', () => {
    renderDonate()
    // The page should have preset amount options
    const amounts = ['$25', '$50', '$100', '$250', '$500', '$1000']
    for (const amt of amounts) {
      expect(screen.getAllByText(amt).length).toBeGreaterThanOrEqual(1)
    }
  })

  it('shows frequency options', () => {
    renderDonate()
    expect(screen.getAllByText('One-Time').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Monthly').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Annually').length).toBeGreaterThanOrEqual(1)
  })

  it('asks one question about where the money goes, defaulting to where it is most needed', () => {
    renderDonate()
    expect(screen.getByText('Where should your donation go?')).toBeInTheDocument()
    expect(screen.getByLabelText(/Where the need is greatest/)).toBeChecked()
    expect(screen.getByTestId('donate-zakat')).not.toBeChecked()
    // The old static purpose list is gone.
    expect(screen.queryByTestId('donate-purpose')).toBeNull()
  })

  it('shows security trust content', () => {
    renderDonate()
    expect(screen.getAllByText(/secure/i).length).toBeGreaterThanOrEqual(1)
  })
})

describe('Donate Page - URL Parameters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('pre-fills amount from URL parameter', () => {
    renderDonate(['/donate?amount=250'])
    // The amount input should be pre-filled - check via input value
    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[]
    const amountInput = inputs.find((i) => i.value === '250')
    expect(amountInput).toBeDefined()
  })

  it('marks the gift as Zakat when the donor comes from the Zakat calculator', () => {
    renderDonate(['/donate?zakat_amount=312.50'])
    expect(screen.getByTestId('donate-zakat')).toBeChecked()
  })

  it('offers the cause a link named, selected, above "where most needed"', () => {
    renderDonate(['/donate?purpose=Food%20for%20Gaza'])
    expect(screen.getByLabelText(/Food for Gaza/)).toBeChecked()
    expect(screen.getByLabelText(/Where the need is greatest/)).not.toBeChecked()
  })

  it('shows an obligation from a calculator as fixed, not as the Zakat box', () => {
    renderDonate(['/donate?purpose=Kaffarah&amount=120'])
    expect(screen.getByTestId('donate-giving-type')).toHaveTextContent('You are paying: Kaffarah')
    expect(screen.queryByTestId('donate-zakat')).toBeNull()
  })
})
