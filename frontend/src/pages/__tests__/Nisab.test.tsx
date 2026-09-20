/**
 * /nisab — the page that prints the threshold, or refuses to.
 *
 * Only `fetchNisab` is mocked. `hasUsableFigure`, `formatNisabDate` and
 * `formatUsd` are the real implementations, because the whole point of this
 * page is the guard: if `hasUsableFigure` ever started returning true for a
 * stale payload, these tests must go red rather than quietly agree with it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import Nisab from '../Nisab'
import { fetchNisab } from '../../utils/nisabApi'
import type { Nisab as NisabData } from '../../utils/nisabApi'

vi.mock('../../utils/nisabApi', async (importActual) => ({
  ...(await importActual<typeof import('../../utils/nisabApi')>()),
  fetchNisab: vi.fn(),
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

/** What the backend sends once the price behind the figure has aged out: the
 *  method survives, every monetary field is withheld. */
const staleNisab = (): NisabData => ({
  gold_grams: 87.48,
  silver_grams: 612.36,
  stale_after_days: 7,
  is_stale: true,
  as_of: '2026-01-05T06:00:00Z',
  source: 'metals-api',
  gold_price_per_gram_usd: null,
  silver_price_per_gram_usd: null,
  nisab_gold_usd: null,
  nisab_silver_usd: null,
})

const renderPage = () =>
  render(
    <HelmetProvider>
      <MemoryRouter>
        <Nisab />
      </MemoryRouter>
    </HelmetProvider>,
  )

describe('Nisab page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('prints the threshold and the date it was taken', async () => {
    vi.mocked(fetchNisab).mockResolvedValue(freshNisab())
    renderPage()

    expect(await screen.findByText(/\$8,321/)).toBeInTheDocument()
    expect(screen.getByText(/\$661/)).toBeInTheDocument()
    expect(screen.getByText(/September 20, 2026/)).toBeInTheDocument()
  })

  it('shows the method and no dollar figure when the data is stale', async () => {
    vi.mocked(fetchNisab).mockResolvedValue(staleNisab())
    renderPage()

    expect(await screen.findByText(/87\.48 grams of gold/i)).toBeInTheDocument()
    expect(screen.getByText(/612\.36 grams of silver/i)).toBeInTheDocument()
    expect(screen.queryByText(/\$\d/)).not.toBeInTheDocument()
  })

  it('states the method in words, and no figure, when the endpoint is unreachable', async () => {
    // With no snapshot there is no mass either, and the page will not fall back
    // on a constant of its own: nisab.gold_grams is configurable, so a hardcoded
    // 87.48 here would state as ours a weight the foundation may not use.
    vi.mocked(fetchNisab).mockResolvedValue(null)
    renderPage()

    expect((await screen.findAllByText(/a set weight of gold/i)).length).toBeGreaterThan(0)
    expect(screen.queryByText(/\$\d/)).not.toBeInTheDocument()
  })

  it('takes the mass it calls ours from the snapshot, not from the markup', async () => {
    // nisab.gold_grams is a setting so the foundation can adopt the other
    // convention without a code change. When it does, every sentence that
    // states the mass as ours must move with it -- otherwise the page prints a
    // dollar figure computed from 85 g under a caption reading 87.48 g.
    vi.mocked(fetchNisab).mockResolvedValue({
      ...freshNisab(),
      gold_grams: 85,
      silver_grams: 595,
      nisab_gold_usd: 8085.2,
      nisab_silver_usd: 642.6,
    })
    renderPage()

    expect(await screen.findByText(/we use 85 grams of gold and 595 grams of silver/i))
      .toBeInTheDocument()
    expect(screen.getByText(/85 g of gold/i)).toBeInTheDocument()
    expect(screen.queryByText(/87\.48/)).not.toBeInTheDocument()
  })

  it('names where the figure came from, not only when it was taken', async () => {
    // /nisab is meant to be the canonical, citable statement; a citation needs
    // its provenance.
    vi.mocked(fetchNisab).mockResolvedValue(freshNisab())
    renderPage()

    expect(await screen.findByText(/metals-api/i)).toBeInTheDocument()
  })

  it('names the other convention rather than pretending the masses are settled', async () => {
    vi.mocked(fetchNisab).mockResolvedValue(freshNisab())
    renderPage()

    // Ours, named as ours...
    expect(
      await screen.findByText(/we use 87\.48 grams of gold and 612\.36 grams of silver/i),
    ).toBeInTheDocument()
    // ...and the other convention, named as the other convention. The page
    // reports the disagreement; it does not settle it.
    expect(screen.getByText(/85 grams and 595 grams/i)).toBeInTheDocument()
  })

  it('presents both thresholds without ruling between them', async () => {
    vi.mocked(fetchNisab).mockResolvedValue(freshNisab())
    renderPage()

    expect(await screen.findByText(/scholars differ/i)).toBeInTheDocument()
  })

  it('carries the scholar disclaimer', async () => {
    vi.mocked(fetchNisab).mockResolvedValue(freshNisab())
    renderPage()

    expect(await screen.findByText(/not a religious ruling/i)).toBeInTheDocument()
    expect(screen.getByText(/qualified scholar/i)).toBeInTheDocument()
  })
})
