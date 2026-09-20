import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchNisab, formatNisabDate, hasUsableFigure } from '../nisabApi'
import type { Nisab } from '../nisabApi'

const fresh: Nisab = {
  gold_grams: 87.48,
  silver_grams: 612.36,
  stale_after_days: 7,
  is_stale: false,
  as_of: '2026-09-20T06:00:00Z',
  source: 'https://api.metals.dev/v1/latest',
  gold_price_per_gram_usd: 95.12,
  silver_price_per_gram_usd: 1.08,
  nisab_gold_usd: 8321.1,
  nisab_silver_usd: 661.35,
}

const stale: Nisab = {
  ...fresh,
  is_stale: true,
  as_of: null,
  source: null,
  gold_price_per_gram_usd: null,
  silver_price_per_gram_usd: null,
  nisab_gold_usd: null,
  nisab_silver_usd: null,
}

describe('hasUsableFigure', () => {
  it('is true only when a real, fresh amount came back', () => {
    expect(hasUsableFigure(fresh)).toBe(true)
    expect(hasUsableFigure(stale)).toBe(false)
    expect(hasUsableFigure(null)).toBe(false)
  })

  it('is false when the server says fresh but sends no amount', () => {
    // Defence in depth: the page must never print "$null" or "$0" as a threshold.
    expect(hasUsableFigure({ ...fresh, nisab_gold_usd: null })).toBe(false)
  })
})

describe('fetchNisab', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the snapshot on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve(fresh),
    }))

    await expect(fetchNisab()).resolves.toEqual(fresh)
  })

  it('returns null rather than throwing when the endpoint is unreachable', async () => {
    // A price lookup must never take down a page. The caller renders the
    // method instead of a figure.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))

    await expect(fetchNisab()).resolves.toBeNull()
  })

  it('returns null on a non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))

    await expect(fetchNisab()).resolves.toBeNull()
  })
})

describe('formatNisabDate', () => {
  it('renders a readable date for the "as of" line', () => {
    expect(formatNisabDate('2026-09-20T06:00:00Z')).toMatch(/2026/)
  })

  it('returns an empty string when there is no date', () => {
    expect(formatNisabDate(null)).toBe('')
  })
})
