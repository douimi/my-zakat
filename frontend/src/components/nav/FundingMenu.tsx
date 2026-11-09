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
 *   FundingMenuMobile  — the first group of the mobile menu, always expanded,
 *                        so the destinations cost neither a scroll nor an expand.
 *                        Applicants who are not comfortable with the web do
 *                        not explore an accordion; they give up.
 *
 * Each row carries a subtitle. They are not decoration: they answer the
 * question someone hesitating over the link is actually asking. "Check my
 * application" rather than "My Proposals" because a person who sent a dossier
 * three weeks ago is looking for where their request stands, not for a list of
 * their proposals.
 *
 * Since the sponsorship feature it also carries the applicant side of that
 * (request sponsorship for a family or an orphan, follow the request), as a
 * second group: someone asking for help looks for help here, not under the
 * donors' "Sponsor" menu.
 *
 * It is reachable by keyboard and announced to a screen reader: aria-haspopup /
 * aria-expanded, Escape closes and returns focus, role="menu" / role="menuitem".
 * The other header dropdowns share its behaviour through NavDropdown, and its
 * trigger wears the same classes (navItemClass) so the top bar reads as one row.
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronDown, FilePlus2, FileSearch, HeartHandshake, ClipboardList } from 'lucide-react'
import clsx from 'clsx'
import { navItemClass } from './NavDropdown'
import { useT, type Message } from '../../i18n'
import { C } from '../../i18n/common'

export const FUNDING_ROUTES = ['/submit-proposal', '/my-proposals', '/sponsor/apply', '/my-requests'] as const

interface Destination {
  to: string
  title: Message
  subtitle: Message
  Icon: typeof FilePlus2
}

interface Group {
  title: Message
  items: Destination[]
}

const GROUPS: Group[] = [
  {
    title: C.projectFunding,
    items: [
      { to: '/submit-proposal', title: C.submitProposal, subtitle: C.submitProposalSub, Icon: FilePlus2 },
      { to: '/my-proposals', title: C.checkApplication, subtitle: C.checkApplicationSub, Icon: FileSearch },
    ],
  },
  {
    title: C.familySponsorship,
    items: [
      { to: '/sponsor/apply', title: C.requestSponsorship, subtitle: C.requestSponsorshipSub, Icon: HeartHandshake },
      { to: '/my-requests', title: C.followMyRequest, subtitle: C.followMyRequestSub, Icon: ClipboardList },
    ],
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
  const t = useT()

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
        className={navItemClass(isActive || isOpen)}
      >
        <span>{t(C.applyForSupport)}</span>
        <ChevronDown
          aria-hidden="true"
          className={clsx('h-4 w-4 flex-shrink-0 transition-transform', isOpen && 'rotate-180')}
        />
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label={t(C.applyForSupport)}
          className="absolute start-0 top-full z-50 mt-2 w-80 rounded-xl border border-gray-200 bg-white py-2 shadow-lg"
        >
          {GROUPS.map((group, index) => (
            <div key={group.title.en} role="none" className={clsx(index > 0 && 'mt-1 border-t border-gray-100 pt-1')}>
              <p role="none" className="eyebrow px-5 pb-1 pt-2">{t(group.title)}</p>
              {group.items.map(({ to, title, subtitle, Icon }) => (
                <Link
                  key={to}
                  to={to}
                  role="menuitem"
                  onClick={() => setIsOpen(false)}
                  className="mx-2 flex items-start gap-3 rounded-lg px-3 py-2.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 hover:text-primary-700"
                >
                  <Icon aria-hidden="true" className="w-4 h-4 flex-shrink-0 mt-0.5 text-primary-700" />
                  <span className="flex flex-col">
                    <span className="font-semibold">{t(title)}</span>
                    <span className="text-xs text-gray-600 leading-snug">{t(subtitle)}</span>
                  </span>
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export const FundingMenuMobile = ({ onNavigate }: { onNavigate: () => void }) => {
  const t = useT()
  return (
    <div className="space-y-3">
      {GROUPS.map((group) => (
        <div key={group.title.en}>
          <p className="eyebrow px-3 pb-1">{t(group.title)}</p>
          {group.items.map(({ to, title, subtitle, Icon }) => (
            <Link
              key={to}
              to={to}
              onClick={onNavigate}
              className="flex items-start gap-3 rounded-lg px-3 py-2.5 text-sm text-gray-800 hover:bg-gray-50"
            >
              <Icon aria-hidden="true" className="w-4 h-4 flex-shrink-0 mt-0.5 text-primary-700" />
              <span className="flex flex-col">
                <span className="font-semibold">{t(title)}</span>
                <span className="text-xs text-gray-600 leading-snug">{t(subtitle)}</span>
              </span>
            </Link>
          ))}
        </div>
      ))}
    </div>
  )
}

export default FundingMenu
