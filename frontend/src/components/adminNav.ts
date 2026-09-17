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
  Mail,
  ShieldOff,
  Send,
  FileText,
  Filter,
  Rocket,
  HeartHandshake,
  FolderKanban,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from '../store/authStore'

// ─────────────────────────────────────────────────────────────────────
// Navigation structure
// ─────────────────────────────────────────────────────────────────────

export type NavLink = {
  kind: 'link'
  name: string
  href: string
  icon: LucideIcon
}

export type NavGroup = {
  kind: 'group'
  id: string
  label: string
  icon: LucideIcon
  items: NavLink[]
}

export type NavEntry = NavLink | NavGroup

export const NAV: readonly NavEntry[] = [
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
      { kind: 'link', name: 'Project Proposals', href: '/admin/project-proposals', icon: FolderKanban },
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
      { kind: 'link', name: 'Fund Projects', href: '/admin/fundraising-projects', icon: HeartHandshake },
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
      { kind: 'link', name: 'My Workspace', href: '/admin/media', icon: FolderOpen },
      { kind: 'link', name: 'All Media', href: '/admin/media/all', icon: Layers },
      { kind: 'link', name: 'Gallery', href: '/admin/gallery', icon: Film },
      { kind: 'link', name: 'Cleanup', href: '/admin/cleanup', icon: Trash2 },
    ],
  },

  {
    kind: 'group',
    id: 'marketing',
    label: 'Marketing',
    icon: Send,
    items: [
      { kind: 'link', name: 'Campaigns', href: '/admin/marketing-campaigns', icon: Rocket },
      { kind: 'link', name: 'Templates', href: '/admin/email-templates', icon: FileText },
      { kind: 'link', name: 'Audiences', href: '/admin/audiences', icon: Filter },
      { kind: 'link', name: 'Email Log', href: '/admin/email-log', icon: Mail },
      { kind: 'link', name: 'Suppressions', href: '/admin/suppressions', icon: ShieldOff },
    ],
  },

  { kind: 'link', name: 'Settings', href: '/admin/settings', icon: Settings },
]

// Items each non-admin role is allowed to access. Admins see everything, so
// they have no entry here (the early return in filterNavForRole makes one
// dead). `user` is listed explicitly, even though the `?? new Set()`
// fallback would cover it too, to document that donors deliberately get no
// admin nav items.
export const ROLE_ALLOWED: Partial<Record<Role, ReadonlySet<string>>> = {
  manager: new Set([
    '/admin/contacts',
    '/admin/volunteers',
    '/admin/stories',
    '/admin/project-proposals',
    '/admin/media',
    '/admin/media/all',
  ]),
  field_staff: new Set(['/admin/media']),
  user: new Set<string>(),
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

export function filterNavForRole(nav: readonly NavEntry[], role: Role): readonly NavEntry[] {
  if (role === 'admin') return nav
  const allowed = ROLE_ALLOWED[role] ?? new Set<string>()
  return nav
    .map((entry) => {
      if (entry.kind === 'link') {
        return allowed.has(entry.href) ? entry : null
      }
      const items = entry.items.filter((i) => allowed.has(i.href))
      return items.length > 0 ? { ...entry, items } : null
    })
    .filter((e): e is NavEntry => e !== null)
}
