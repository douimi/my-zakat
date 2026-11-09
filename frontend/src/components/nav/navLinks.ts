/**
 * Destinations of the main navigation, shared by the desktop dropdowns and the
 * mobile menu so the two cannot drift apart.
 *
 * Pages deliberately left out of the nav (their routes still work): Islamic
 * Knowledge, Book of Duas, Charity in Islam, Umrah Guidelines, Quick Links,
 * Testimonials.
 */
import type { Message } from '../../i18n'
import { C } from '../../i18n/common'

export interface NavLinkItem {
  to: string
  label: Message
}

export interface NavGroup {
  title: Message
  items: NavLinkItem[]
}

/** The "Zakat" dropdown: the tools first, then the guides. */
export const ZAKAT_GROUPS: NavGroup[] = [
  {
    title: C.calculators,
    items: [
      { to: '/zakat-calculator', label: C.zakatCalculator },
      { to: '/zakat-al-fitr-calculator', label: C.zakatAlFitrCalculator },
      { to: '/kaffarah-calculator', label: C.kaffarahCalculator },
    ],
  },
  {
    title: C.guides,
    items: [
      { to: '/nisab', label: C.nisab },
      { to: '/zakat-on-gold', label: C.zakatOnGold },
      { to: '/zakat-education', label: C.zakatEducation },
    ],
  },
]

export const ZAKAT_PATHS = ZAKAT_GROUPS.flatMap((group) => group.items.map((item) => item.to))

/** The "About" dropdown. */
export const ABOUT_LINKS: NavLinkItem[] = [
  { to: '/about', label: C.aboutUs },
  { to: '/stories', label: C.stories },
  { to: '/events', label: C.events },
  { to: '/volunteer', label: C.volunteer },
  { to: '/contact', label: C.contact },
]

/** Routes that light up the About trigger (Testimonials has no nav entry but belongs to this section). */
export const ABOUT_PATHS = [...ABOUT_LINKS.map((link) => link.to), '/testimonials']

/** True when `pathname` is `path` or one of its sub-pages. */
export const matchesPath = (pathname: string, path: string) =>
  pathname === path || pathname.startsWith(`${path}/`)

/** The donor side of sponsorship: browse, learn how it works, follow your own. */
export const SPONSOR_LINKS: { to: string; title: Message; subtitle: Message }[] = [
  { to: '/sponsor/orphans', title: C.sponsorAnOrphan, subtitle: C.sponsorAnOrphanSub },
  { to: '/sponsor/families', title: C.sponsorAFamily, subtitle: C.sponsorAFamilySub },
  { to: '/sponsor', title: C.howSponsorshipWorks, subtitle: C.howSponsorshipWorksSub },
  { to: '/my-sponsorships', title: C.mySponsorships, subtitle: C.mySponsorshipsSub },
]

/** Routes that light up the Sponsor trigger. The applicant side (/sponsor/apply) belongs to Apply for Funding. */
export const isSponsorPath = (pathname: string) =>
  (matchesPath(pathname, '/sponsor') && !matchesPath(pathname, '/sponsor/apply')) ||
  matchesPath(pathname, '/my-sponsorships')
