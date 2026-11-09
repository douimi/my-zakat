import { Languages } from 'lucide-react'
import { clsx } from 'clsx'
import { useLocation } from 'react-router-dom'
import { LOCALES, localeHref, switchLocale, useLocale, type Locale } from '../../i18n'

/**
 * A plain link to the same page in the other language.
 *
 * A link, not a button: it has a real href (shareable, opens in a new tab,
 * crawlable alongside the hreflang tags), and the click only adds remembering
 * the choice. Each label is written in its own language — someone who cannot
 * read the current one must still recognise their own.
 */
const LanguageSwitcher = ({ className, compact = false }: { className?: string; compact?: boolean }) => {
  const locale = useLocale()
  // Re-render on navigation so the href follows the current page.
  useLocation()
  const target: Locale = locale === 'ar' ? 'en' : 'ar'
  const { label, htmlLang } = LOCALES[target]

  return (
    <a
      href={localeHref(target)}
      hrefLang={htmlLang}
      lang={htmlLang}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
        event.preventDefault()
        switchLocale(target)
      }}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100 hover:text-primary-700',
        className,
      )}
    >
      <Languages aria-hidden="true" className="h-4 w-4" />
      <span className={clsx(compact && 'sr-only sm:not-sr-only')}>{label}</span>
    </a>
  )
}

export default LanguageSwitcher
