/**
 * /zakat-education — the overview page, and the last place the old hardcoded
 * nisab survived.
 *
 * This page is in the sitemap, in the llms files and in the header nav, and it
 * used to publish "Current Nisab (Gold Standard): ~$4,000 USD — *Based on 85g
 * of gold": an undated figure roughly half the real threshold, resting on a
 * mass that contradicted the one /nisab and the calculator use. It now takes
 * the same treatment as those pages — the figure and the mass both come from
 * /api/nisab, and no dollar amount is printed unless `hasUsableFigure` says we
 * hold a price we can vouch for.
 *
 * It also carries what used to be /charity-in-islam (zakat versus sadaqa), and
 * the eight groups who receive zakat, both folded until asked for.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Calculator, CheckCircle, ArrowRight } from 'lucide-react'
import SEOHead from '../components/SEOHead'
import PageHeader from '../components/ui/PageHeader'
import Disclosure from '../components/ui/Disclosure'
import {
  fetchNisab,
  hasUsableFigure,
  formatNisabDate,
  formatUsd,
  type Nisab as NisabData,
} from '../utils/nisabApi'

const CONDITIONS = [
  'A Muslim',
  'An adult of sound mind',
  'Owns wealth above the nisab threshold',
  'Has held that wealth for one lunar year',
]

const RECIPIENTS = [
  'The poor',
  'The needy',
  'Those who administer zakat',
  'Those whose hearts are to be reconciled',
  'Freeing captives',
  'People in debt',
  'In the cause of God',
  'Stranded travellers',
]

const ZakatEducation = () => {
  const [nisab, setNisab] = useState<NisabData | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    void fetchNisab().then((data) => {
      if (!active) return
      setNisab(data)
      setLoaded(true)
    })
    return () => {
      active = false
    }
  }, [])

  // The single gate on printing money on this page.
  const showFigure = loaded && hasUsableFigure(nisab)
  // The mass is stated as ours, so it is read from the snapshot, never written
  // into the markup. It survives staleness: the method never expires.
  const goldGrams = nisab?.gold_grams ?? null

  return (
    <div className="min-h-screen bg-white">
      <SEOHead
        title="Zakat Education"
        description="Learn about Zakat – the third pillar of Islam. Understand who must pay Zakat, eligible recipients, calculation methods, and the spiritual significance of charitable giving."
        canonicalPath="/zakat-education"
      />
      <PageHeader
        eyebrow="Zakat guide"
        title="Understanding Zakat"
        description="What zakat is, who owes it, on what, and how much."
        actions={
          <Link to="/zakat-calculator" className="btn-primary gap-2">
            <Calculator className="w-5 h-5" aria-hidden="true" />
            Calculate your zakat
          </Link>
        }
      />

      <div className="section-container py-10 sm:py-12">
        <div className="max-w-3xl space-y-10">
          {/* What is Zakat */}
          <section aria-labelledby="what-is-zakat">
            <h2 id="what-is-zakat" className="section-title mb-4">What is Zakat?</h2>
            <p className="text-gray-700 leading-relaxed">
              Zakat is one of the Five Pillars of Islam, making it a fundamental religious obligation for
              every eligible Muslim. The word "Zakat" comes from the Arabic root meaning "to purify" and
              "to grow," signifying both the purification of wealth and the spiritual growth that comes
              from giving to those in need.
            </p>
          </section>

          {/* Who Must Pay Zakat */}
          <section aria-labelledby="who-must-pay">
            <h2 id="who-must-pay" className="section-title mb-4">Who Must Pay Zakat?</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="card">
                <h3 className="card-title mb-4">Eligibility conditions</h3>
                <ul className="space-y-3">
                  {CONDITIONS.map((condition) => (
                    <li key={condition} className="flex items-start gap-2">
                      <CheckCircle className="w-5 h-5 text-accent-600 shrink-0 mt-0.5" aria-hidden="true" />
                      <span className="text-gray-700">{condition}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="card">
                <h3 className="card-title mb-2">Nisab threshold</h3>
                <p className="text-gray-700 mb-4">
                  Nisab is the minimum amount of wealth a Muslim must possess before Zakat becomes obligatory.
                </p>
                <div className="bg-primary-50 p-4 rounded-lg">
                  {showFigure && nisab ? (
                    <>
                      <div className="text-sm text-gray-600 mb-1">Current Nisab (gold):</div>
                      <div className="text-2xl font-bold text-primary-700">
                        {formatUsd(nisab.nisab_gold_usd as number)}
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        {goldGrams} g of gold, as of {formatNisabDate(nisab.as_of)}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-sm text-gray-600 mb-1">Current Nisab (gold):</div>
                      <div className="text-lg font-bold text-primary-700">
                        {goldGrams !== null ? `${goldGrams} g of gold` : 'a set weight of gold'}
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        We show a dollar figure only while we hold a price we can vouch for. Multiply
                        the weight by today’s price per gram.
                      </div>
                    </>
                  )}
                </div>
                <Link to="/nisab" className="link inline-flex items-center mt-4">
                  The current nisab, and how it is worked out
                  <ArrowRight className="w-4 h-4 ms-2" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </section>

          {/* What it is due on */}
          <section aria-labelledby="due-on">
            <h2 id="due-on" className="section-title mb-4">What zakat is due on</h2>
            <p className="text-gray-700 leading-relaxed">
              Zakat is 2.5% of cash and savings, gold and silver, investments, and business stock, once
              their total has stayed above the nisab for a lunar year. Your home, car and personal
              belongings are not counted.
            </p>
          </section>

          {/* Longer reference, folded */}
          <div className="space-y-3">
            <Disclosure title="Who receives zakat" summary="Eight groups named in the Qur'an (9:60)">
              <p className="text-gray-700">The Qur'an (9:60) names eight groups:</p>
              <ul className="list-disc ps-6 space-y-1 text-gray-700">
                {RECIPIENTS.map((group) => (
                  <li key={group}>{group}</li>
                ))}
              </ul>
            </Disclosure>

            <Disclosure title="Zakat and sadaqa" summary="One is obligatory, the other voluntary">
              <p className="text-gray-700 leading-relaxed">
                <strong className="text-gray-900">Zakat is obligatory:</strong> 2.5% of qualifying
                wealth, given to the eight groups above.
              </p>
              <p className="text-gray-700 leading-relaxed">
                <strong className="text-gray-900">Sadaqa is voluntary:</strong> any amount, any time, to
                anyone in need, including your time and good deeds.
              </p>
            </Disclosure>
          </div>

          {/* Call to Action */}
          <section aria-labelledby="calculate-cta" className="card-tinted">
            <h2 id="calculate-cta" className="section-title mb-4">Ready to Calculate Your Zakat?</h2>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link to="/zakat-calculator" className="btn-primary gap-2">
                <Calculator className="w-5 h-5" aria-hidden="true" />
                Calculate Zakat
              </Link>
              <Link to="/donate?purpose=Zakat" className="btn-secondary gap-2">
                Pay Zakat Now
                <ArrowRight className="w-5 h-5" aria-hidden="true" />
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default ZakatEducation
