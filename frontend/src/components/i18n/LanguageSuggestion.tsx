import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { LOCALE_PREF_KEY, localeHref, switchLocale, useLocale } from '../../i18n'

const DISMISSED_KEY = 'myzakat_locale_suggestion_dismissed'

/**
 * Offers the Arabic site to a visitor whose browser prefers Arabic.
 *
 * An offer, never a redirect: a redirect would send crawlers and people who
 * deliberately opened an English link somewhere they did not ask to go. Shown
 * once, until dismissed or answered, and never to someone who already chose.
 */
const LanguageSuggestion = () => {
  const locale = useLocale()
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (locale !== 'en') return
    try {
      if (localStorage.getItem(LOCALE_PREF_KEY) || localStorage.getItem(DISMISSED_KEY)) return
    } catch {
      return
    }
    const prefersArabic = (navigator.languages || [navigator.language]).some((l) => l?.toLowerCase().startsWith('ar'))
    setShow(prefersArabic)
  }, [locale])

  if (!show) return null

  const dismiss = () => {
    try { localStorage.setItem(DISMISSED_KEY, '1') } catch { /* private mode */ }
    setShow(false)
  }

  return (
    <div className="border-b border-primary-100 bg-primary-50" lang="ar" dir="rtl">
      <div className="section-container flex items-center justify-center gap-3 py-2 text-sm text-primary-900">
        <span>هذا الموقع متوفر باللغة العربية.</span>
        <a
          href={localeHref('ar')}
          onClick={(e) => { e.preventDefault(); switchLocale('ar') }}
          className="font-semibold underline underline-offset-2"
        >
          تصفح بالعربية
        </a>
        <button type="button" onClick={dismiss} aria-label="إغلاق" className="rounded p-1 hover:bg-primary-100">
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

export default LanguageSuggestion
