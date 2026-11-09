import type { ReactNode } from 'react'
import { Info } from 'lucide-react'
import { useLocale, useT } from '../../i18n'
import { C } from '../../i18n/common'

/**
 * Wraps a page that has not been translated yet.
 *
 * On the English site it renders the page untouched. On the Arabic site it
 * says so in one line, then renders the English content left-to-right inside
 * the Arabic chrome — never a half-mirrored mixture of the two. Remove the
 * wrapper (in App.tsx) once the page has its own messages.
 */
const EnglishOnly = ({ children }: { children: ReactNode }) => {
  const locale = useLocale()
  const t = useT()
  if (locale === 'en') return <>{children}</>
  return (
    <>
      <div className="border-b border-amber-200 bg-amber-50">
        <p className="section-container flex items-center gap-2 py-2.5 text-sm text-amber-900">
          <Info aria-hidden="true" className="h-4 w-4 shrink-0" />
          {t(C.englishOnlyNotice)}
        </p>
      </div>
      <div dir="ltr" lang="en" className="text-left">
        {children}
      </div>
    </>
  )
}

export default EnglishOnly
