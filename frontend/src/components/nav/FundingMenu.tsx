/**
 * The "Apply for Funding" entry in the main navigation.
 *
 * It exists because the two things a funding applicant needs were in the wrong
 * places: submitting a proposal sat inside the Quick Links grab-bag between
 * Book of Duas and Umrah Guidelines, and checking an existing application was
 * not in the main menu at all.
 *
 * Two renderings, one source of truth for the destinations:
 *   FundingMenu        — the desktop dropdown.
 *   FundingMenuMobile  — a card pinned above the mobile accordion, so the
 *                        destinations cost neither a scroll nor an expand.
 *                        Applicants who are not comfortable with the web do
 *                        not explore an accordion; they give up.
 *
 * Each row carries a subtitle. They are not decoration: they answer the
 * question someone hesitating over the link is actually asking. "Check my
 * application" rather than "My Proposals" because a person who sent a dossier
 * three weeks ago is looking for where their request stands, not for a list of
 * their proposals.
 *
 * Unlike the four dropdowns already in Header.tsx, this one is reachable by
 * keyboard and announced to a screen reader: aria-haspopup / aria-expanded,
 * Escape closes and returns focus, role="menu" / role="menuitem". Those four
 * are deliberately left alone -- reworking them is a separate job.
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronDown, FilePlus2, FileSearch, HeartHandshake } from 'lucide-react'
import clsx from 'clsx'

export const FUNDING_ROUTES = ['/submit-proposal', '/my-proposals'] as const

interface Destination {
  to: string
  title: string
  subtitle: string
  Icon: typeof FilePlus2
}

const DESTINATIONS: Destination[] = [
  {
    to: '/submit-proposal',
    title: 'Submit a project proposal',
    subtitle: 'Tell us about your project and request support',
    Icon: FilePlus2,
  },
  {
    to: '/my-proposals',
    title: 'Check my application',
    subtitle: 'See where your request stands, or make the changes we asked for',
    Icon: FileSearch,
  },
]

const useIsFundingRoute = (): boolean => {
  const { pathname } = useLocation()
  return FUNDING_ROUTES.some((route) => pathname.startsWith(route))
}

const FundingMenu = () => {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const isActive = useIsFundingRoute()

  useEffect(() => {
    if (!isOpen) return

    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setIsOpen(false)
      // Send focus back where it came from: a keyboard user who dismisses the
      // menu must not be dropped at the top of the document.
      triggerRef.current?.focus()
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen])

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        data-active={isActive}
        className={clsx(
          'flex items-center space-x-1.5 xl:space-x-2 px-1.5 xl:px-2.5 2xl:px-3 py-2 rounded-lg text-xs xl:text-sm font-semibold transition-all duration-300 whitespace-nowrap flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
          isActive
            ? 'text-primary-600 bg-primary-50 shadow-sm'
            : 'text-gray-700 hover:text-primary-600 hover:bg-primary-50/50',
        )}
      >
        <HeartHandshake className="w-3.5 xl:w-4 h-3.5 xl:h-4 flex-shrink-0" />
        <span className="hidden xl:inline">Apply for Funding</span>
        <span className="xl:hidden">Funding</span>
        <ChevronDown className={clsx(
          'w-3 xl:w-3.5 h-3 xl:h-3.5 transition-transform duration-300 flex-shrink-0',
          isOpen && 'transform rotate-180',
        )} />
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label="Apply for Funding"
          className="absolute left-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50"
        >
          {DESTINATIONS.map(({ to, title, subtitle, Icon }) => (
            <Link
              key={to}
              to={to}
              role="menuitem"
              onClick={() => setIsOpen(false)}
              className="flex items-start space-x-3 px-3 py-2.5 text-sm transition-all duration-200 rounded-lg mx-1 text-gray-700 hover:text-primary-600 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            >
              <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span className="flex flex-col">
                <span className="font-semibold">{title}</span>
                <span className="text-xs text-gray-500 leading-snug">{subtitle}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export const FundingMenuMobile = ({ onNavigate }: { onNavigate: () => void }) => (
  <div className="mx-2 mb-2 rounded-xl border border-primary-200 bg-primary-50/70 p-3">
    <p className="px-1 pb-2 text-xs font-bold uppercase tracking-wide text-primary-800">
      Apply for Funding
    </p>
    {DESTINATIONS.map(({ to, title, subtitle, Icon }) => (
      <Link
        key={to}
        to={to}
        onClick={onNavigate}
        className="flex items-start space-x-3 rounded-lg px-2 py-2.5 text-sm text-gray-800 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      >
        <Icon className="w-4 h-4 flex-shrink-0 mt-0.5 text-primary-700" />
        <span className="flex flex-col">
          <span className="font-semibold">{title}</span>
          <span className="text-xs text-gray-600 leading-snug">{subtitle}</span>
        </span>
      </Link>
    ))}
  </div>
)

export default FundingMenu
