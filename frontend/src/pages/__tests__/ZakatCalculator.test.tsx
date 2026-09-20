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

vi.mock('../../utils/nisabApi', async (importActual) => ({
  ...(await importActual<typeof import('../../utils/nisabApi')>()),
  fetchNisab: vi.fn(),
}))

/** A payload the backend is willing to stand behind. */
const freshNisab = (): NisabData => ({
  gold_grams: 85,
  silver_grams: 595,
  stale_after_days: 7,
  is_stale: false,
  as_of: '2026-09-20T06:00:00Z',
  source: 'metals-api',
  gold_price_per_gram_usd: 95.12,
  silver_price_per_gram_usd: 1.08,
  nisab_gold_usd: 8085.2,
  nisab_silver_usd: 642.6,
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

  it('titles itself with the current year', async () => {
    vi.mocked(fetchNisab).mockResolvedValue(freshNisab())
    renderPage()

    expect(await screen.findByRole('heading', { level: 1 }))
      .toHaveTextContent(String(new Date().getFullYear()))
  })
})
