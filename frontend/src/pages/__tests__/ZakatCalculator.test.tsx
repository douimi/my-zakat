/**
 * /zakat-calculator — the page must never build an answer on a price it made up.
 *
 * Only `fetchNisab` is mocked. `hasUsableFigure`, `formatNisabDate` and
 * `formatUsd` stay real, because the guard is the thing under test: if
 * `hasUsableFigure` ever began approving a stale payload, these tests should go
 * red rather than quietly agree with it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import ZakatCalculator from '../ZakatCalculator'
import { fetchNisab } from '../../utils/nisabApi'
import type { Nisab as NisabData } from '../../utils/nisabApi'
import { donationsAPI } from '../../utils/api'

vi.mock('../../utils/nisabApi', async (importActual) => ({
  ...(await importActual<typeof import('../../utils/nisabApi')>()),
  fetchNisab: vi.fn(),
}))

vi.mock('../../utils/api', () => ({
  donationsAPI: { calculateZakat: vi.fn() },
}))

/** A payload the backend is willing to stand behind. */
const freshNisab = (): NisabData => ({
  gold_grams: 87.48,
  silver_grams: 612.36,
  stale_after_days: 7,
  is_stale: false,
  as_of: '2026-09-20T06:00:00Z',
  source: 'metals-api',
  gold_price_per_gram_usd: 95.12,
  silver_price_per_gram_usd: 1.08,
  nisab_gold_usd: 8321.1,
  nisab_silver_usd: 661.35,
})

const renderPage = () =>
  render(
    <HelmetProvider>
      <MemoryRouter>
        <ZakatCalculator />
      </MemoryRouter>
    </HelmetProvider>,
  )

describe('Zakat calculator page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('seeds the metal prices from the live figure', async () => {
    vi.mocked(fetchNisab).mockResolvedValue(freshNisab())
    renderPage()

    expect(await screen.findByDisplayValue('95.12')).toBeInTheDocument()
    expect(screen.getByDisplayValue('1.08')).toBeInTheDocument()
  })

  it('still lets the user override the price', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchNisab).mockResolvedValue(freshNisab())
    renderPage()
    const goldInput = await screen.findByDisplayValue('95.12')

    await user.clear(goldInput)
    await user.type(goldInput, '120')

    expect(goldInput).toHaveValue(120)
  })

  it('says the prices are unavailable rather than inventing them', async () => {
    // The old hardcoded 95.00 / 1.10 must not come back as a silent fallback:
    // a made-up price produces a made-up zakat figure.
    vi.mocked(fetchNisab).mockResolvedValue(null)
    renderPage()

    expect(await screen.findByText(/enter today's price/i)).toBeInTheDocument()
    expect(screen.queryByDisplayValue('95')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('1.1')).not.toBeInTheDocument()
  })

  it('shows the nisab it is comparing against, with its date', async () => {
    vi.mocked(fetchNisab).mockResolvedValue(freshNisab())
    renderPage()

    expect(await screen.findByText(/September 20, 2026/)).toBeInTheDocument()
  })

  it('seeds a four-decimal price as something the field will accept', async () => {
    // The price inputs are step="0.01". A seeded 95.1234 is a stepMismatch, so
    // the browser blocks submission and the handler never runs -- on the one
    // path that exists only when we do hold a live price.
    vi.mocked(fetchNisab).mockResolvedValue({ ...freshNisab(), gold_price_per_gram_usd: 95.1234 })
    renderPage()

    expect(await screen.findByDisplayValue('95.12')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('95.1234')).not.toBeInTheDocument()
  })

  it('shows no threshold at all when the backend could not reach one', async () => {
    // The live path today: no price from us, none from the user. The backend
    // returns a null threshold and a null verdict rather than the $65/g guess
    // it used to substitute, and the page must not print a figure or a verdict
    // of its own on top of that.
    const user = userEvent.setup()
    vi.mocked(fetchNisab).mockResolvedValue(null)
    vi.mocked(donationsAPI.calculateZakat).mockResolvedValue({
      wealth: 0, gold: 0, silver: 0, business_goods: 0, agriculture: 0, total: 0,
      total_assets: 100000, net_zakatable: 100000,
      nisab_threshold: null, meets_nisab: null,
    })
    renderPage()

    await user.click(await screen.findByRole('button', { name: /calculate/i }))

    expect(await screen.findByText(/no threshold to compare against/i)).toBeInTheDocument()
    expect(screen.queryByText(/\$5,686/)).not.toBeInTheDocument()
    expect(screen.queryByText(/No Zakat Due/i)).not.toBeInTheDocument()
  })

  it('titles itself with the current year', async () => {
    vi.mocked(fetchNisab).mockResolvedValue(freshNisab())
    renderPage()

    expect(await screen.findByRole('heading', { level: 1 }))
      .toHaveTextContent(String(new Date().getFullYear()))
  })
})
