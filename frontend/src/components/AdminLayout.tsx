import { Outlet, Link, useLocation } from 'react-router-dom'
import {
  Heart,
  LogOut,
  Menu,
  X,
  ChevronDown,
  ExternalLink,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { clsx } from 'clsx'
import { NAV, filterNavForRole, type NavEntry, type NavLink, type NavGroup } from './adminNav'

const STORAGE_KEY = 'myzakat_admin_nav_expanded'
const COLLAPSED_KEY = 'myzakat_admin_nav_collapsed'

/** How often the sidebar re-checks for proposals nobody has opened yet. */
const UNREAD_POLL_MS = 60_000
const PROPOSALS_HREF = '/admin/project-proposals'
const SPONSORSHIP_HREF = '/admin/sponsorship'

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function isLinkActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin'
  return pathname === href || pathname.startsWith(href + '/')
}

/** The single nav href the current path belongs to. The most specific match
 *  wins, so /admin/media/all lights up "All Media", not also "My Workspace". */
function findActiveHref(nav: readonly NavEntry[], pathname: string): string | null {
  let best: string | null = null
  for (const entry of nav) {
    const links = entry.kind === 'link' ? [entry] : entry.items
    for (const link of links) {
      if (isLinkActive(pathname, link.href) && (!best || link.href.length > best.length)) best = link.href
    }
  }
  return best
}

function findActivePageName(nav: readonly NavEntry[], activeHref: string | null): string | null {
  if (!activeHref) return null
  for (const entry of nav) {
    if (entry.kind === 'link' && entry.href === activeHref) return entry.name
    if (entry.kind === 'group') {
      const item = entry.items.find((i) => i.href === activeHref)
      if (item) return `${entry.label} / ${item.name}`
    }
  }
  return null
}

function findActiveGroupId(nav: readonly NavEntry[], activeHref: string | null): string | null {
  for (const entry of nav) {
    if (entry.kind === 'group' && entry.items.some((i) => i.href === activeHref)) {
      return entry.id
    }
  }
  return null
}

function loadExpanded(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const ids = JSON.parse(raw)
    return Array.isArray(ids) ? new Set(ids) : new Set()
  } catch {
    return new Set()
  }
}

function loadCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function saveCollapsed(value: boolean) {
  try {
    window.localStorage.setItem(COLLAPSED_KEY, value ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function saveExpanded(ids: Set<string>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
  } catch {
    /* ignore */
  }
}

// ─────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────

const AdminLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsedState] = useState<boolean>(loadCollapsed)
  const setSidebarCollapsed = (value: boolean) => {
    setSidebarCollapsedState(value)
    saveCollapsed(value)
  }
  const [expanded, setExpanded] = useState<Set<string>>(loadExpanded)
  const [proposalsUnread, setProposalsUnread] = useState(0)
  const [sponsorshipUnread, setSponsorshipUnread] = useState(0)
  const location = useLocation()
  const { logout, user, role } = useAuthStore()
  const token = useAuthStore((s) => s.token)

  /**
   * Keep the proposals badge current.
   *
   * Polled rather than pushed: one small request a minute is cheaper than the
   * websocket plumbing a true push would need, and a reviewer who sees a
   * revision up to a minute late has lost nothing. Re-runs on navigation so
   * the count drops as soon as the reviewer opens a dossier, without waiting
   * for the next tick.
   *
   * Failures are swallowed on purpose: a missing badge must never produce an
   * error toast on every admin page.
   */
  useEffect(() => {
    if (!token) return
    let cancelled = false
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

    const check = async () => {
      try {
        const resp = await fetch(`${API_URL}/api/project-proposals/unread-count`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!resp.ok) return
        const body = await resp.json()
        if (!cancelled) setProposalsUnread(body.count || 0)
      } catch {
        /* the badge is not worth surfacing an error for */
      }
      // Sponsorship cases are reviewed by managers and admins only; field staff would get a 403.
      if (role !== 'admin' && role !== 'manager') return
      try {
        const resp = await fetch(`${API_URL}/api/sponsorship/admin/unread`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!resp.ok) return
        const body = await resp.json()
        if (!cancelled) setSponsorshipUnread(body.unread || 0)
      } catch {
        /* same: a missing badge is not an error */
      }
    }

    check()
    const timer = window.setInterval(check, UNREAD_POLL_MS)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [token, role, location.pathname])

  const nav = useMemo(() => filterNavForRole(NAV, role), [role])
  const activeHref = useMemo(
    () => findActiveHref(nav, location.pathname),
    [nav, location.pathname],
  )
  const activeGroupId = useMemo(() => findActiveGroupId(nav, activeHref), [nav, activeHref])
  const activePageName = useMemo(() => findActivePageName(nav, activeHref), [nav, activeHref])

  // Auto-open the group containing the active route, once.
  useEffect(() => {
    if (activeGroupId && !expanded.has(activeGroupId)) {
      setExpanded((prev) => {
        const next = new Set(prev)
        next.add(activeGroupId)
        saveExpanded(next)
        return next
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroupId])

  const toggleGroup = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      saveExpanded(next)
      return next
    })
  }

  // ── Sub-components ─────────────────────────────────────────────

  const renderLink = (link: NavLink, indented = false) => {
    const active = link.href === activeHref
    // Only the proposals entry carries a count today; `badge` stays a local
    // lookup rather than a field on NavLink so adminNav.ts remains a pure
    // static structure with no data fetching behind it.
    const badge = badgeFor(link.href)
    return (
      <Link
        key={link.href}
        to={link.href}
        onClick={() => setSidebarOpen(false)}
        className={clsx(
          'flex items-center rounded-lg transition-colors text-sm font-medium',
          active
            ? 'bg-primary-50 text-primary-700'
            : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900',
          sidebarCollapsed ? 'lg:justify-center lg:px-2 px-3 py-2' : 'px-3 py-2',
          indented && !sidebarCollapsed && 'lg:ml-3',
        )}
        title={sidebarCollapsed ? link.name : undefined}
        aria-current={active ? 'page' : undefined}
      >
        <span className={clsx('relative flex-shrink-0', sidebarCollapsed ? 'lg:mr-0' : 'mr-3')}>
          <link.icon className="w-5 h-5" />
          {/* Collapsed sidebar has no room for the number, so the icon itself
              carries a dot — the title attribute still says how many. */}
          {badge > 0 && sidebarCollapsed && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white" aria-hidden />
          )}
        </span>
        {!sidebarCollapsed && <span className="truncate">{link.name}</span>}
        {badge > 0 && !sidebarCollapsed && (
          <span
            className="ml-auto min-w-[1.25rem] px-1.5 py-0.5 text-xs font-bold leading-none text-center rounded-full bg-amber-500 text-white"
            aria-label={`${badge} awaiting review`}
          >
            {badge > 99 ? '99+' : badge}
          </span>
        )}
        {active && !sidebarCollapsed && badge === 0 && (
          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary-600" aria-hidden />
        )}
      </Link>
    )
  }

  const badgeFor = (href: string) =>
    href === PROPOSALS_HREF ? proposalsUnread : href === SPONSORSHIP_HREF ? sponsorshipUnread : 0

  const renderGroup = (group: NavGroup) => {
    // Collapsed sidebar: render the group's items as plain icons with a small
    // separator above. No header, no chevron.
    if (sidebarCollapsed) {
      return (
        <div key={group.id} className="pt-2 mt-1 border-t border-gray-100 first:border-t-0 first:mt-0 first:pt-0">
          {group.items.map((i) => renderLink(i))}
        </div>
      )
    }

    const isOpen = expanded.has(group.id)
    const containsActive = group.items.some((i) => i.href === activeHref)
    // A folded group still says something inside awaits review.
    const groupBadge = isOpen ? 0 : group.items.reduce((n, i) => n + badgeFor(i.href), 0)

    return (
      <div key={group.id} className="space-y-0.5">
        <button
          type="button"
          onClick={() => toggleGroup(group.id)}
          className={clsx(
            'w-full flex items-center px-3 py-2 rounded-lg text-sm font-semibold transition-colors',
            containsActive
              ? 'text-primary-700'
              : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900',
          )}
          aria-expanded={isOpen}
        >
          <group.icon className="w-5 h-5 mr-3 flex-shrink-0" />
          <span className="flex-1 text-left">{group.label}</span>
          {groupBadge > 0 && (
            <span
              className="mr-2 min-w-[1.25rem] px-1.5 py-0.5 text-xs font-bold leading-none text-center rounded-full bg-amber-500 text-white"
              aria-label={`${groupBadge} awaiting review`}
            >
              {groupBadge > 99 ? '99+' : groupBadge}
            </span>
          )}
          <ChevronDown
            className={clsx(
              'w-4 h-4 text-gray-400 transition-transform duration-200',
              isOpen && 'rotate-180',
            )}
          />
        </button>
        {isOpen && (
          <div className="space-y-0.5 pl-2 border-l border-gray-100 ml-4">
            {group.items.map((i) => renderLink(i, true))}
          </div>
        )}
      </div>
    )
  }

  // ── Account section ─────────────────────────────────────────────

  const userInitial = (user?.name || user?.email || '?').charAt(0).toUpperCase()
  const roleLabel =
    role === 'admin' ? 'Admin'
      : role === 'manager' ? 'Manager'
      : role === 'field_staff' ? 'Field Staff'
      : 'User'
  const roleBadgeClass =
    role === 'admin' ? 'bg-purple-100 text-purple-800'
      : role === 'manager' ? 'bg-amber-100 text-amber-800'
      : role === 'field_staff' ? 'bg-teal-100 text-teal-800'
      : 'bg-gray-100 text-gray-700'

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-gray-900/50 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 bg-white shadow-xl lg:shadow-sm border-r border-gray-200',
          'transform transition-all duration-300 ease-in-out lg:translate-x-0',
          'flex flex-col',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          sidebarCollapsed ? 'lg:w-16' : 'lg:w-64',
          'w-64',
        )}
      >
        {/* Brand / collapse */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200 flex-shrink-0">
          <Link
            to="/admin"
            className={clsx('flex items-center', sidebarCollapsed && 'lg:justify-center lg:w-full')}
            onClick={() => setSidebarOpen(false)}
          >
            <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg flex items-center justify-center shadow-sm">
              <Heart className="w-4 h-4 text-white" />
            </div>
            {!sidebarCollapsed && (
              <span className="ml-2.5 text-base font-semibold text-gray-900 tracking-tight">
                MyZakat <span className="text-primary-600">Admin</span>
              </span>
            )}
          </Link>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="hidden lg:flex p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <Menu className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1 rounded-md text-gray-400 hover:text-gray-700"
              aria-label="Hide navigation"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1" aria-label="Admin">
          {nav.map((entry) =>
            entry.kind === 'link' ? renderLink(entry) : renderGroup(entry),
          )}
        </nav>

        {/* Account */}
        <div className="border-t border-gray-200 p-3 flex-shrink-0">
          {!sidebarCollapsed ? (
            <div className="space-y-1">
              <div className="flex items-center gap-3 px-2 py-2">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-500 to-blue-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                  {userInitial}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {user?.name || user?.email}
                  </p>
                  <span className={clsx('inline-block mt-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider', roleBadgeClass)}>
                    {roleLabel}
                  </span>
                </div>
              </div>
              <Link
                to="/dashboard"
                className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50 hover:text-gray-900"
              >
                <Heart className="w-4 h-4 mr-3" />
                My account
              </Link>
              <button
                onClick={logout}
                className="w-full flex items-center px-3 py-2 text-sm font-medium text-red-600 rounded-lg hover:bg-red-50"
              >
                <LogOut className="w-4 h-4 mr-3" />
                Logout
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center space-y-2">
              <div
                className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-500 to-blue-600 flex items-center justify-center text-white font-semibold text-sm"
                title={user?.name || user?.email}
              >
                {userInitial}
              </div>
              <Link
                to="/dashboard"
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg"
                title="My account"
                aria-label="My account"
              >
                <Heart className="w-4 h-4" />
              </Link>
              <button
                onClick={logout}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                title="Logout"
                aria-label="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className={clsx('transition-all duration-300', sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-64')}>
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-gray-200">
          <div className="flex items-center justify-between h-14 px-4 sm:px-6">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 -ml-2 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                aria-label="Open menu"
              >
                <Menu className="w-5 h-5" />
              </button>
              {/* Not a heading: every page renders its own single <h1>. */}
              <p className="text-sm sm:text-base font-medium text-gray-600 truncate">
                {activePageName || 'Admin'}
              </p>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              <Link
                to="/"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                View Site
              </Link>
            </div>
          </div>
        </header>

        <main className="py-6 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

export default AdminLayout
