import { Link } from 'react-router-dom'
import { Mail, Phone, MapPin } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useT, type Message } from '../i18n'
import { C } from '../i18n/common'

/**
 * Official social profiles. Empty on purpose: the old icons pointed at the bare
 * facebook.com / twitter.com / instagram.com / youtube.com home pages. Add the
 * real profile URLs here and the row of icons comes back, e.g.
 *   { name: 'Facebook', href: 'https://www.facebook.com/<page>', Icon: Facebook }
 */
const SOCIAL_LINKS: { name: string; href: string; Icon: LucideIcon }[] = []

const LINK_GROUPS: { title: Message; wide?: boolean; links: { to: string; label: Message }[] }[] = [
  {
    title: C.quickLinks,
    wide: true,
    links: [
      { to: '/donate', label: C.donate },
      { to: '/projects', label: C.projects },
      { to: '/programs', label: C.programs },
      { to: '/zakat-calculator', label: C.zakatCalculator },
      { to: '/nisab', label: C.nisab },
      { to: '/about', label: C.about },
      { to: '/stories', label: C.stories },
      { to: '/contact', label: C.contact },
    ],
  },
  {
    title: C.sponsor,
    links: [
      { to: '/sponsor/orphans', label: C.sponsorAnOrphan },
      { to: '/sponsor/families', label: C.sponsorAFamily },
      { to: '/my-sponsorships', label: C.mySponsorships },
    ],
  },
  {
    title: C.applyForSupport,
    links: [
      { to: '/submit-proposal', label: C.submitProposal },
      { to: '/my-proposals', label: C.checkApplication },
      { to: '/sponsor/apply', label: C.requestSponsorship },
      { to: '/my-requests', label: C.followMyRequest },
    ],
  },
  {
    title: C.legal,
    links: [
      { to: '/privacy-policy', label: C.privacyPolicy },
      { to: '/donation-policy', label: C.donationPolicy },
      { to: '/terms-of-service', label: C.termsOfService },
      { to: '/sms-opt-in', label: C.smsSubscription },
    ],
  },
]

const headingClass = 'mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400'
const linkClass = 'text-gray-300 transition-colors hover:text-white'

const Footer = () => {
  const t = useT()
  return (
    <footer className="bg-gray-900 text-white">
      <div className="section-container py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4 lg:grid-cols-6">
          {/* Brand + contact */}
          <div className="col-span-2 md:col-span-4 lg:col-span-2">
            <Link to="/" className="mb-4 inline-flex rounded-lg bg-white p-1">
              <img src="/logo.png" alt={t(C.homeLogoAlt)} width={48} height={48} className="h-12 w-12 object-contain" />
            </Link>
            <p className="mb-5 max-w-sm text-gray-300">
              {t(C.tagline)}
            </p>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-3">
                <Mail aria-hidden="true" className="h-4 w-4 flex-shrink-0 text-primary-300" />
                <a href="mailto:info@myzakat.org" className={linkClass}>info@myzakat.org</a>
              </li>
              <li className="flex items-center gap-3">
                <Phone aria-hidden="true" className="h-4 w-4 flex-shrink-0 text-primary-300" />
                <a href="tel:+18336992528" className={`${linkClass} ltr-nums`} dir="ltr">1-833-MYZAKAT</a>
              </li>
              <li className="flex items-start gap-3">
                <MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary-300" />
                <span className="text-gray-300">{t(C.address)}</span>
              </li>
            </ul>
            {SOCIAL_LINKS.length > 0 && (
              <div className="mt-5 flex gap-3">
                {SOCIAL_LINKS.map(({ name, href, Icon }) => (
                  <a
                    key={name}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={name}
                    className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-800 text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
                  >
                    <Icon aria-hidden="true" className="h-5 w-5" />
                  </a>
                ))}
              </div>
            )}
          </div>

          {LINK_GROUPS.map((group) => (
            <div key={group.title.en} className={group.wide ? 'col-span-2 md:col-span-2 lg:col-span-1' : undefined}>
              <h2 className={headingClass}>{t(group.title)}</h2>
              <ul className={group.wide ? 'grid grid-cols-2 gap-x-4 gap-y-2 text-sm lg:grid-cols-1' : 'space-y-2 text-sm'}>
                {group.links.map((link) => (
                  <li key={link.to}>
                    <Link to={link.to} className={linkClass}>{t(link.label)}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 border-t border-gray-800 pt-6 text-center text-sm text-gray-400">
          <p>{t(C.copyright, { year: new Date().getFullYear() })}</p>
        </div>
      </div>
    </footer>
  )
}

export default Footer
