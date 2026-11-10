import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import { HelmetProvider } from 'react-helmet-async'
import { LocaleProvider } from '../../../i18n'
import SponsorProfile from '../SponsorProfile'
import type { PublicDetail } from '../../../utils/sponsorshipApi'

const api = vi.hoisted(() => ({
  profile: null as PublicDetail | null,
  checkout: vi.fn(),
}))

vi.mock('../../../utils/sponsorshipApi', async () => {
  const actual = await vi.importActual<typeof import('../../../utils/sponsorshipApi')>('../../../utils/sponsorshipApi')
  return {
    ...actual,
    fetchCase: vi.fn(async () => {
      if (!api.profile) throw Object.assign(new Error('nf'), { response: { status: 404 } })
      return api.profile
    }),
    startCheckout: api.checkout,
  }
})

vi.mock('@stripe/react-stripe-js', () => ({ useStripe: () => null }))

const profile = (over: Partial<PublicDetail> = {}): PublicDetail => ({
  reference: 'O-ABC234',
  kind: 'orphan',
  display_name: 'Yusuf',
  title: 'A boy who wants to become a teacher',
  title_ar: 'طفل يحلم بأن يصبح معلمًا',
  country: 'Morocco',
  region: 'Souss-Massa',
  monthly_need_cents: 6000,
  coverage: { committed_cents: 2000, remaining_cents: 4000, available_cents: 4000, percent: 33, state: 'partial', sponsors: 1 },
  waiting_since: '2026-10-01T00:00:00',
  verified_at: '2026-09-20T00:00:00',
  photo_url: null,
  needs: [{ category: 'education', monthly_cents: 4000 }, { category: 'clothing', monthly_cents: 2000 }],
  age: 9,
  gender: 'male',
  story: 'Yusuf lives with his mother and two sisters.',
  story_ar: 'يعيش يوسف مع أمه وأختيه.',
  verified_documents: ['birth_certificate', 'death_certificate'],
  distributed_cents: 12000,
  related: [],
  ...over,
})

const renderAt = (locale: 'en' | 'ar' = 'en') => render(
  <HelmetProvider>
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <LocaleProvider locale={locale}>
        <MemoryRouter initialEntries={['/sponsor/O-ABC234']}>
          <Routes><Route path="/sponsor/:ref" element={<SponsorProfile />} /></Routes>
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>
  </HelmetProvider>,
)

describe('SponsorProfile', () => {
  beforeEach(() => {
    api.profile = profile()
    api.checkout.mockReset()
  })

  it('shows the public profile and offers exactly what is still needed', async () => {
    renderAt()
    expect(await screen.findByRole('heading', { name: 'Yusuf', level: 1 })).toBeInTheDocument()
    expect(screen.getByText(/9 years old/)).toBeInTheDocument()
    expect(screen.getByText(/Cover the whole remaining need/)).toBeInTheDocument()
    expect(screen.getAllByText(/\$40 a month/).length).toBeGreaterThan(0)
  })

  it('refuses a share larger than what is left, before calling the server', async () => {
    const user = userEvent.setup()
    renderAt()
    await screen.findByRole('heading', { name: 'Yusuf', level: 1 })
    await user.click(screen.getByLabelText(/Give a share/))
    await user.type(screen.getByLabelText(/Another amount/), '75')
    expect(screen.getByText(/At most \$40 a month is still needed/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Continue to secure payment/ })).toBeDisabled()
    expect(api.checkout).not.toHaveBeenCalled()
  })

  it('sends the donor to Stripe with the chosen monthly amount and language', async () => {
    const user = userEvent.setup()
    api.checkout.mockResolvedValue({ id: 'cs_1', url: null })
    renderAt()
    await screen.findByRole('heading', { name: 'Yusuf', level: 1 })
    await user.type(screen.getByLabelText(/Your name/), 'Sara Donor')
    await user.type(screen.getByLabelText(/Your email address/), 'sara@example.com')
    await user.click(screen.getByRole('button', { name: /Continue to secure payment/ }))
    await waitFor(() => expect(api.checkout).toHaveBeenCalledWith('O-ABC234', {
      name: 'Sara Donor', email: 'sara@example.com', monthly_amount_cents: 4000, lang: 'en',
    }))
  })

  it('says so when the need is fully covered, and offers someone else', async () => {
    api.profile = profile({ coverage: { committed_cents: 6000, remaining_cents: 0, available_cents: 0, percent: 100, state: 'full', sponsors: 2 } })
    renderAt()
    expect(await screen.findByText('Fully sponsored', { selector: 'h2' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Continue to secure payment/ })).toBeNull()
  })

  it('reads in Arabic, with the Arabic story and title', async () => {
    renderAt('ar')
    expect(await screen.findByText('يعيش يوسف مع أمه وأختيه.')).toBeInTheDocument()
    expect(screen.getByText('طفل يحلم بأن يصبح معلمًا')).toBeInTheDocument()
    expect(screen.getByText(/9 سنوات/)).toBeInTheDocument()
  })

  it('explains a profile that is no longer available', async () => {
    api.profile = null
    renderAt()
    expect(await screen.findByText('This profile is no longer available')).toBeInTheDocument()
  })
})
