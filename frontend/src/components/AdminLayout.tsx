import { Outlet, Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  Heart,
  Calendar,
  BookOpen,
  MessageSquare,
  Star,
  CreditCard,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Image as ImageIcon,
  UserCog,
  UserPlus,
  Film,
  AlertCircle,
  TrendingUp,
  Trash2,
  FolderOpen,
  Layers,
  Newspaper,
  Megaphone,
  ExternalLink,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { clsx } from 'clsx'

// ─────────────────────────────────────────────────────────────────────
// Navigation structure
// ─────────────────────────────────────────────────────────────────────

type NavLink = {
  kind: 'link'
  name: string
  href: string
  icon: LucideIcon
}

type NavGroup = {
  kind: 'group'
  id: string
  label: string
  icon: LucideIcon
  items: NavLink[]
}

type NavEntry = NavLink | NavGroup

const NAV: NavEntry[] = [
  { kind: 'link', name: 'Dashboard', href: '/admin', icon: LayoutDashboard },

  {
    kind: 'group',
    id: 'donations',
    label: 'Donations',
    icon: Heart,
    items: [
      { kind: 'link', name: 'All Donations', href: '/admin/donations', icon: Heart },
      { kind: 'link', name: 'Subscriptions', href: '/admin/subscriptions', icon: CreditCard },
    ],
  },

  {
    kind: 'group',
    id: 'people',
    label: 'People',
    icon: Users,
    items: [
      { kind: 'link', name: 'Users', href: '/admin/users', icon: UserCog },
      { kind: 'link', name: 'Contacts', href: '/admin/contacts', icon: MessageSquare },
      { kind: 'link', name: 'Volunteers', href: '/admin/volunteers', icon: UserPlus },
      { kind: 'link', name: 'Testimonials', href: '/admin/testimonials', icon: Star },
    ],
  },

  {
    kind: 'group',
    id: 'content',
    label: 'Content',
    icon: Newspaper,
    items: [
      { kind: 'link', name: 'Stories', href: '/admin/stories', icon: BookOpen },
      { kind: 'link', name: 'Events', href: '/admin/events', icon: Calendar },
      { kind: 'link', name: 'Slideshow', href: '/admin/slideshow', icon: ImageIcon },
      { kind: 'link', name: 'Urgent Needs', href: '/admin/urgent-needs', icon: AlertCircle },
      { kind: 'link', name: 'Campaigns', href: '/admin/campaigns', icon: Megaphone },
    ],
  },

  {
    kind: 'group',
    id: 'programs',
    label: 'Programs',
    icon: TrendingUp,
    items: [
      { kind: 'link', name: 'Programs', href: '/admin/programs', icon: TrendingUp },
      { kind: 'link', name: 'Categories', href: '/admin/program-categories', icon: Layers },
    ],
  },

  {
    kind: 'group',
    id: 'media',
    label: 'Media',
    icon: Film,
    items: [
      { kind: 'link', name: 'Gallery', href: '/admin/gallery', icon: Film },
      { kind: 'link', name: 'S3 Browser', href: '/admin/s3-media', icon: FolderOpen },
      { kind: 'link', name: 'Cleanup', href: '/admin/cleanup', icon: Trash2 },
    ],
  },

  { kind: 'link', name: 'Settings', href: '/admin/settings', icon: Settings },
]

// Items managers are allowed to access.
const MANAGER_ALLOWED = new Set([
  '/admin/contacts',
  '/admin/volunteers',
  '/admin/stories',
])

const STORAGE_KEY = 'myzakat_admin_nav_expanded'

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function filterNavForRole(nav: NavEntry[], isAdmin: boolean): NavEntry[] {
  if (isAdmin) return nav
  return nav
    .map((entry) => {
      if (entry.kind === 'link') {
        return MANAGER_ALLOWED.has(entry.href) ? entry : null
      }
      const items = entry.items.filter((i) => MANAGER_ALLOWED.has(i.href))
      return items.length > 0 ? { ...entry, items } : null
    })
    .filter((e): e is NavEntry => e !== null)
}

function isLinkActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin'
  return pathname === href || pathname.startsWith(href + '/')
}

function findActivePageName(nav: NavEntry[], pathname: string): string | null {
  for (const entry of nav) {
    if (entry.kind === 'link' && isLinkActive(pathname, entry.href)) {
      return entry.name
    }
    if (entry.kind === 'group') {
      const item = entry.items.find((i) => isLinkActive(pathname, i.href))
      if (item) return item.name
    }
  }
  return null
}

function findActiveGroupId(nav: NavEntry[], pathname: string): string | null {
  for (const entry of nav) {
    if (entry.kind === 'group' && entry.items.some((i) => isLinkActive(pathname, i.href))) {
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(loadExpanded)
  const location = useLocation()
  const { logout, user, isAdmin, role } = useAuthStore()

  const nav = useMemo(() => filterNavForRole(NAV, isAdmin), [isAdmin])
  const activeGroupId = useMemo(
    () => findActiveGroupId(nav, location.pathname),
    [nav, location.pathname],
  )
  const activePageName = useMemo(
    () => findActivePageName(nav, location.pathname),
    [nav, location.pathname],
  )

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
    const active = isLinkActive(location.pathname, link.href)
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
      >
        <link.icon className={clsx('w-5 h-5 flex-shrink-0', sidebarCollapsed ? 'lg:mr-0' : 'mr-3')} />
        {!sidebarCollapsed && <span className="truncate">{link.name}</span>}
        {active && !sidebarCollapsed && (
          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary-600" aria-hidden />
        )}
      </Link>
    )
  }

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
    const containsActive = group.items.some((i) => isLinkActive(location.pathname, i.href))

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
  const roleLabel = role === 'admin' ? 'Admin' : role === 'manager' ? 'Manager' : 'User'
  const roleBadgeClass =
    role === 'admin' ? 'bg-purple-100 text-purple-800'
      : role === 'manager' ? 'bg-amber-100 text-amber-800'
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
            >
              <Menu className="w-4 h-4" />
            </button>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1 rounded-md text-gray-400 hover:text-gray-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
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
                My Donations
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
                title="My Donations"
              >
                <Heart className="w-4 h-4" />
              </Link>
              <button
                onClick={logout}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                title="Logout"
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
              <h1 className="text-base sm:text-lg font-semibold text-gray-900 truncate">
                {activePageName || 'Admin'}
              </h1>
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

        <main className="py-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default AdminLayout
