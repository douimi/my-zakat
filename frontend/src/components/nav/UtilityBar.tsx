/**
 * The thin band above the main header: the shortcuts people come back for.
 *
 * Phone number, Zakat calculator, the two sponsorship doors and the language,
 * one click from every page — the pattern donors know from other zakat
 * organisations, in this site's own colours (a primary-800 band, white text).
 *
 * Kept to one row at every width. On a phone only what fits stays visible —
 * the number (it is a tel: link, the most useful thing on a phone), the orphan
 * door and the language; everything else is in the mobile menu.
 */
import { Link, useLocation } from 'react-router-dom'
import { Calculator, Phone, User, Home } from 'lucide-react'
import { clsx } from 'clsx'
import LanguageSwitcher from '../i18n/LanguageSwitcher'
import { useT } from '../../i18n'
import { C } from '../../i18n/common'
import { matchesPath } from './navLinks'

export const PHONE_DISPLAY = '1-833-MYZAKAT'
export const PHONE_HREF = 'tel:+18336992528'

const linkClass = (active: boolean) =>
  clsx(
    'inline-flex items-center gap-1.5 rounded px-1.5 py-1 transition-colors hover:text-white hover:underline underline-offset-4',
    active ? 'font-semibold text-white' : 'text-primary-100',
  )

const UtilityBar = () => {
  const t = useT()
  const { pathname } = useLocation()

  const shortcuts = [
    { to: '/zakat-calculator', label: t(C.zakatCalculator), Icon: Calculator, className: 'hidden md:inline-flex' },
    { to: '/sponsor/orphans', label: t(C.sponsorAnOrphan), Icon: User, className: 'inline-flex' },
    { to: '/sponsor/families', label: t(C.sponsorAFamily), Icon: Home, className: 'hidden sm:inline-flex' },
  ]

  return (
    <div className="bg-primary-800 text-sm text-primary-100">
      <div className="section-container flex h-9 items-center justify-between gap-3">
        <a href={PHONE_HREF} className={clsx(linkClass(false), 'ltr-nums font-medium')} dir="ltr">
          <Phone aria-hidden="true" className="h-3.5 w-3.5" />
          <span>{PHONE_DISPLAY}</span>
        </a>

        <nav aria-label={t(C.quickLinks)} className="flex min-w-0 items-center gap-1 sm:gap-2">
          {shortcuts.map(({ to, label, Icon, className }, i) => (
            <span key={to} className={clsx(className, 'items-center gap-1 sm:gap-2')}>
              {i > 0 && <span aria-hidden="true" className="hidden text-primary-400 sm:inline">|</span>}
              <Link
                to={to}
                className={linkClass(matchesPath(pathname, to))}
                aria-current={matchesPath(pathname, to) ? 'page' : undefined}
              >
                <Icon aria-hidden="true" className="h-3.5 w-3.5" />
                <span className="whitespace-nowrap">{label}</span>
              </Link>
            </span>
          ))}
          <span aria-hidden="true" className="hidden text-primary-400 sm:inline">|</span>
          <LanguageSwitcher className="!px-1.5 !py-1 !text-primary-100 hover:!bg-transparent hover:!text-white" />
        </nav>
      </div>
    </div>
  )
}

export default UtilityBar
