/**
 * /quick-links — the single "Guides and tools" index. Only real pages: the
 * empty Islamic Knowledge and Book of Duas pages are no longer listed.
 */
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import SEOHead from '../components/SEOHead'
import PageHeader from '../components/ui/PageHeader'

const GROUPS = [
  {
    title: 'Zakat guides and calculators',
    links: [
      { name: 'Zakat Calculator', href: '/zakat-calculator' },
      { name: 'Nisab', href: '/nisab' },
      { name: 'Zakat on Gold', href: '/zakat-on-gold' },
      { name: 'Zakat al-Fitr Calculator', href: '/zakat-al-fitr-calculator' },
      { name: 'Kaffarah Calculator', href: '/kaffarah-calculator' },
      { name: 'Zakat Education', href: '/zakat-education' },
    ],
  },
  {
    title: 'Give',
    links: [
      { name: 'Projects', href: '/projects' },
      { name: 'Programs', href: '/programs' },
      { name: 'Donate', href: '/donate' },
    ],
  },
]

const QuickLinks = () => {
  return (
    <div className="min-h-screen bg-white">
      <SEOHead
        title="Quick Links"
        description="Quick links to all MyZakat resources – Zakat calculators, donation page, programs, events, educational content, and more."
        canonicalPath="/quick-links"
      />
      <PageHeader title="Guides and tools" />

      <div className="section-container py-10 sm:py-12">
        <div className="max-w-3xl space-y-8">
          {GROUPS.map((group) => (
            <section key={group.title} aria-label={group.title}>
              <h2 className="eyebrow mb-3">{group.title}</h2>
              <ul className="divide-y divide-gray-200 rounded-xl border border-gray-200">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      to={link.href}
                      className="flex items-center justify-between gap-4 px-5 py-3.5 font-medium text-gray-900 hover:bg-gray-50 transition-colors"
                    >
                      {link.name}
                      <ArrowRight className="w-4 h-4 text-primary-600 shrink-0" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

export default QuickLinks
