/**
 * /charity-in-islam — kept as a route. Its content now lives on
 * /zakat-education ("Zakat and sadaqa"); this page keeps the short version
 * and points there.
 */
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import SEOHead from '../components/SEOHead'
import PageHeader from '../components/ui/PageHeader'

const CharityInIslam = () => {
  return (
    <div className="min-h-screen bg-white">
      <SEOHead
        title="Charity in Islam"
        description="Discover the importance and types of charity in Islam. Learn about Zakat, Sadaqa, Waqf, and other forms of Islamic charitable giving and their spiritual rewards."
        canonicalPath="/charity-in-islam"
      />
      <PageHeader
        title="Charity in Islam"
        description="The two forms of giving we handle: zakat and sadaqa."
      />

      <div className="section-container py-10 sm:py-12">
        <div className="max-w-3xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <section className="card" aria-labelledby="charity-zakat">
              <h2 id="charity-zakat" className="card-title mb-2">Zakat</h2>
              <p className="text-gray-700 leading-relaxed">
                Zakat is one of the Five Pillars of Islam, an obligatory charity that purifies wealth and
                helps those in need.
              </p>
            </section>

            <section className="card" aria-labelledby="charity-sadaqa">
              <h2 id="charity-sadaqa" className="card-title mb-2">Sadaqah</h2>
              <p className="text-gray-700 leading-relaxed">
                Voluntary charity that can be given at any time, in any amount, bringing blessings and
                rewards.
              </p>
            </section>
          </div>

          <Link to="/zakat-education" className="link inline-flex items-center mt-6">
            Zakat in detail
            <ArrowRight className="w-4 h-4 ms-2" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  )
}

export default CharityInIslam
