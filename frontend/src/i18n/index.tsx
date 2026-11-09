/**
 * English / Arabic for the public site.
 *
 * Design: docs/superpowers/specs/2026-11-09-sponsorship-and-arabic-design.md (part 2)
 *
 * How it works
 * ------------
 * The locale is the first path segment: `/ar/...` is Arabic, anything else is
 * English. main.tsx reads it once and mounts the router with basename "/ar",
 * so every existing <Link to="/donate"> resolves to /ar/donate without being
 * touched. Switching language is a full navigation to the same path under the
 * other prefix (see localeHref): the direction, the fonts and every cached
 * string change together, so a reload is the honest way to do it.
 *
 * Messages are colocated with the component that uses them:
 *
 *   const M = defineMessages({
 *     title: { en: 'Sponsor an orphan', ar: 'اكفل يتيمًا' },
 *     left:  { en: '{count} still waiting', ar: 'ما زال {count} في الانتظار' },
 *   })
 *   const t = useT()
 *   t(M.title); t(M.left, { count: 3 })
 *
 * A two-language site does not need a key catalogue, and a page and its
 * translation can never drift apart in separate files. Shared chrome strings
 * live in ./common.ts.
 */
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'

export type Locale = 'en' | 'ar'
export type Dir = 'ltr' | 'rtl'

export interface Message {
  en: string
  ar: string
}

export const LOCALES: Record<Locale, { dir: Dir; label: string; htmlLang: string; prefix: string }> = {
  en: { dir: 'ltr', label: 'English', htmlLang: 'en', prefix: '' },
  ar: { dir: 'rtl', label: 'العربية', htmlLang: 'ar', prefix: '/ar' },
}

/** Remembered choice, so a returning visitor lands in their language. */
export const LOCALE_PREF_KEY = 'myzakat_locale'

/**
 * Arabic text, Western digits: the convention for amounts across the Maghreb
 * and on most Arabic payment pages, and unambiguous for a US-dollar charity.
 */
const INTL_LOCALE: Record<Locale, string> = { en: 'en-US', ar: 'ar-u-nu-latn' }

export const detectLocale = (pathname: string): Locale =>
  pathname === '/ar' || pathname.startsWith('/ar/') ? 'ar' : 'en'

/** The path without its locale prefix: what React Router sees. */
export const stripLocale = (pathname: string): string => {
  if (pathname === '/ar') return '/'
  if (pathname.startsWith('/ar/')) return pathname.slice(3)
  return pathname
}

/** The full URL of the current page in another language. */
export const localeHref = (target: Locale, location: Pick<Location, 'pathname' | 'search' | 'hash'> = window.location): string => {
  const bare = stripLocale(location.pathname)
  const path = target === 'ar' ? (bare === '/' ? '/ar' : `/ar${bare}`) : bare
  return `${path}${location.search}${location.hash}`
}

/** Remember the choice and go there. */
export const switchLocale = (target: Locale): void => {
  try { localStorage.setItem(LOCALE_PREF_KEY, target) } catch { /* private mode */ }
  window.location.assign(localeHref(target))
}

const LocaleContext = createContext<Locale>('en')

export const LocaleProvider = ({ locale, children }: { locale: Locale; children: ReactNode }) => (
  <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
)

export const useLocale = (): Locale => useContext(LocaleContext)

export const useDir = (): Dir => LOCALES[useLocale()].dir

export const defineMessages = <T extends Record<string, Message>>(messages: T): T => messages

export type Vars = Record<string, string | number | null | undefined>

export const interpolate = (text: string, vars?: Vars): string =>
  vars ? text.replace(/\{(\w+)\}/g, (_, key) => (vars[key] ?? '').toString()) : text

/** Translate a message (or pick one of two strings) for the current locale. */
export const useT = () => {
  const locale = useLocale()
  return useCallback(
    (message: Message, vars?: Vars) => interpolate(message[locale] || message.en, vars),
    [locale],
  )
}

/** Pick the Arabic variant of a stored field when there is one. */
export const usePick = () => {
  const locale = useLocale()
  return useCallback(
    (en: string | null | undefined, ar: string | null | undefined) =>
      (locale === 'ar' && ar && ar.trim() ? ar : en) || '',
    [locale],
  )
}

/** Money, numbers and dates in the reader's language. */
export const useFormat = () => {
  const locale = useLocale()
  return useMemo(() => {
    const tag = INTL_LOCALE[locale]
    const money = (cents: number, opts: { decimals?: boolean } = {}) =>
      new Intl.NumberFormat(tag, {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: opts.decimals || cents % 100 !== 0 ? 2 : 0,
        maximumFractionDigits: 2,
      }).format(cents / 100)
    const number = (value: number) => new Intl.NumberFormat(tag).format(value)
    const date = (iso: string | null | undefined, style: 'medium' | 'long' = 'medium') => {
      if (!iso) return ''
      const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
      return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat(tag, { dateStyle: style }).format(d)
    }
    const relativeDays = (iso: string | null | undefined) => {
      if (!iso) return ''
      const days = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000)
      const rtf = new Intl.RelativeTimeFormat(tag, { numeric: 'auto' })
      if (Math.abs(days) < 31) return rtf.format(-days, 'day')
      if (Math.abs(days) < 365) return rtf.format(-Math.round(days / 30), 'month')
      return rtf.format(-Math.round(days / 365), 'year')
    }
    /** Arabic plural categories (zero, one, two, few, many, other) via CLDR. */
    const plural = (count: number, forms: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }) => {
      const rule = new Intl.PluralRules(tag).select(count)
      return interpolate(forms[rule] ?? forms.other, { count: number(count) })
    }
    return { money, number, date, relativeDays, plural, tag }
  }, [locale])
}
