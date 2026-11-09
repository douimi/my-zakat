/**
 * Destinations of the main navigation, shared by the desktop dropdowns and the
 * mobile menu so the two cannot drift apart.
 *
 * Pages deliberately left out of the nav (their routes still work): Islamic
 * Knowledge, Book of Duas, Charity in Islam, Umrah Guidelines, Quick Links,
 * Testimonials.
 */
export interface NavLinkItem {
  to: string
  label: string
}

export interface NavGroup {
  title: string
  items: NavLinkItem[]
}

/** The "Zakat" dropdown: the tools first, then the guides. */
export const ZAKAT_GROUPS: NavGroup[] = [
  {
    title: 'Calculators',
    items: [
      { to: '/zakat-calculator', label: 'Zakat Calculator' },
      { to: '/zakat-al-fitr-calculator', label: 'Zakat al-Fitr Calculator' },
      { to: '/kaffarah-calculator', label: 'Kaffarah Calculator' },
    ],
  },
  {
    title: 'Guides',
    items: [
      { to: '/nisab', label: 'Nisab' },
      { to: '/zakat-on-gold', label: 'Zakat on Gold' },
      { to: '/zakat-education', label: 'Zakat Education' },
    ],
  },
]

export const ZAKAT_PATHS = ZAKAT_GROUPS.flatMap((group) => group.items.map((item) => item.to))

/** The "About" dropdown. */
export const ABOUT_LINKS: NavLinkItem[] = [
  { to: '/about', label: 'About us' },
  { to: '/stories', label: 'Stories' },
  { to: '/events', label: 'Events' },
  { to: '/volunteer', label: 'Volunteer' },
  { to: '/contact', label: 'Contact' },
]

/** Routes that light up the About trigger (Testimonials has no nav entry but belongs to this section). */
export const ABOUT_PATHS = [...ABOUT_LINKS.map((link) => link.to), '/testimonials']

/** True when `pathname` is `path` or one of its sub-pages. */
export const matchesPath = (pathname: string, path: string) =>
  pathname === path || pathname.startsWith(`${path}/`)
