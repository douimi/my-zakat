/**
 * /islamic-knowledge — kept as a route, but no longer a "knowledge base".
 *
 * It used to show four unlinked cards promising content that does not exist.
 * It now points to the guides we actually publish. The route stays because it
 * is linked from outside; dropping it from the sitemap needs the owner's call.
 */
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import SEOHead from '../components/SEOHead'
import PageHeader from '../components/ui/PageHeader'

const GUIDES = [
  {
    path: '/zakat-education',
    name: 'Zakat basics',
    blurb: 'What zakat is, who owes it, on what, and who receives it.',
  },
  {
    path: '/nisab',
    name: 'Nisab today',
    blurb: 'The current threshold at which zakat becomes due, and how it is worked out.',
  },
  {
    path: '/zakat-on-gold',
    name: 'Zakat on gold',
    blurb: 'Work out what is due on jewellery and bullion from its weight and purity.',
  },
  {
    path: '/zakat-al-fitr-calculator',
    name: 'Zakat al-Fitr',
    blurb: 'The per-person charity due before the Eid prayer at the end of Ramadan.',
  },
  {
    path: '/kaffarah-calculator',
    name: 'Kaffarah',
    blurb: 'Expiation for a deliberately broken fast or oath, costed by the number of days.',
  },
]

const IslamicKnowledge = () => {
  return (
    <div className="min-h-screen bg-white">
      <SEOHead
        title="Islamic Knowledge"
        description="Explore Islamic educational resources from MyZakat. Learn about Islamic principles, charitable giving, and spiritual growth through our curated content."
        canonicalPath="/islamic-knowledge"
      />
      <PageHeader title="Guides to giving" description="Short, sourced guides to the giving we handle." />

      <div className="section-container py-10 sm:py-12">
        <ul className="max-w-3xl divide-y divide-gray-200 rounded-xl border border-gray-200">
          {GUIDES.map((guide) => (
            <li key={guide.path}>
              <Link
                to={guide.path}
                className="flex items-start justify-between gap-4 px-5 py-4 hover:bg-gray-50 transition-colors"
              >
                <span>
                  <span className="block font-semibold text-gray-900">{guide.name}</span>
                  <span className="block text-sm text-gray-600 mt-1">{guide.blurb}</span>
                </span>
                <ArrowRight className="w-5 h-5 text-primary-600 shrink-0 mt-0.5" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default IslamicKnowledge
