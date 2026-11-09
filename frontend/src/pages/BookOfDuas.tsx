/**
 * /book-of-duas — the route stays, but the page no longer promises a
 * collection it does not hold. It used to announce "a comprehensive collection
 * of authentic supplications" above five title-only cards.
 *
 * Owner decision pending: supply real duas (Arabic, transliteration,
 * translation, source), or drop the route from the sitemap and noindex it.
 */
import { Link } from 'react-router-dom'
import SEOHead from '../components/SEOHead'
import PageHeader from '../components/ui/PageHeader'

const BookOfDuas = () => {
  return (
    <div className="min-h-screen bg-white">
      <SEOHead
        title="Book of Duas"
        description="A curated collection of Islamic duas (supplications) for daily life, prayer, and special occasions. Find authentic duas with translations and guidance."
        canonicalPath="/book-of-duas"
      />
      <PageHeader title="Book of Duas" description="This collection is not ready yet." />

      <div className="section-container py-10 sm:py-12">
        <div className="max-w-3xl">
          <p className="text-gray-700 leading-relaxed">
            In the meantime, our zakat guide explains what zakat is, who owes it and who receives it.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <Link to="/zakat-education" className="btn-primary">
              Read the zakat guide
            </Link>
            <Link to="/" className="btn-secondary">
              Go to the home page
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BookOfDuas
