/**
 * The current nisab, read from the backend.
 *
 * Two rules the callers depend on:
 *   - a failure returns null rather than throwing, because a metals price
 *     lookup must never take down a page;
 *   - `hasUsableFigure` is the only sanctioned way to decide whether to print
 *     an amount. A stale or absent figure means the page shows the method --
 *     87.48 g of gold, 612.36 g of silver, at today's price -- and no dollars. A
 *     wrong number carrying a date reads as authoritative, which is worse than
 *     no number at all.
 */
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export interface Nisab {
  gold_grams: number
  silver_grams: number
  stale_after_days: number
  is_stale: boolean
  as_of: string | null
  source: string | null
  gold_price_per_gram_usd: number | null
  silver_price_per_gram_usd: number | null
  nisab_gold_usd: number | null
  nisab_silver_usd: number | null
}

export const fetchNisab = async (): Promise<Nisab | null> => {
  try {
    const resp = await fetch(`${API_BASE_URL}/api/nisab`)
    if (!resp.ok) return null
    return (await resp.json()) as Nisab
  } catch {
    return null
  }
}

/**
 * Whether the page may print a dollar amount at all.
 *
 * The `> 0` is not belt-and-braces. A settings row can be written by an
 * upstream incident or by hand in the admin, and a zero or negative price
 * multiplies out to a threshold that is wrong rather than missing — "$0",
 * under an authoritative date. The backend now withholds those, and this
 * repeats the judgement so a single bad payload cannot get past both.
 */
export const hasUsableFigure = (nisab: Nisab | null): boolean =>
  Boolean(
    nisab &&
      !nisab.is_stale &&
      typeof nisab.nisab_gold_usd === 'number' &&
      nisab.nisab_gold_usd > 0 &&
      typeof nisab.nisab_silver_usd === 'number' &&
      nisab.nisab_silver_usd > 0,
  )

export const formatNisabDate = (isoDate: string | null): string =>
  isoDate ? new Date(isoDate).toLocaleDateString('en-US', { dateStyle: 'long' }) : ''

export const formatUsd = (amount: number): string =>
  `$${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
