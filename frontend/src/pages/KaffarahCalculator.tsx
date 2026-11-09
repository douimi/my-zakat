/**
 * /kaffarah-calculator — expiation for a deliberately broken fast or oath,
 * plus the content that makes the page findable.
 *
 * The calculator's arithmetic is unchanged. What is new is the content around
 * it, written to the same editorial rules as /nisab and /zakat-calculator: it
 * states what is agreed, names what is not, and rules on nothing. The single
 * most important thing this page has to do is tell people who do NOT owe
 * kaffarah that they do not owe it — a fast missed through illness or travel is
 * made up, not expiated, and a page that lets someone talk themselves into
 * sixty days of fasting over a bout of flu has done harm.
 *
 * The worked example is gated on `hasUsableFigure`, like every worked example
 * on this site.
 */
import { useEffect, useState } from 'react'
import { Info, AlertCircle, DollarSign, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import SEOHead from '../components/SEOHead'
import PageHeader from '../components/ui/PageHeader'
import Disclosure from '../components/ui/Disclosure'
import { fetchNisab, hasUsableFigure, type Nisab as NisabData } from '../utils/nisabApi'
import {
  currentYear,
  getBreadcrumbJsonLd,
  getFaqJsonLd,
  getWebApplicationJsonLd,
  getHowToJsonLd,
} from '../utils/seo'

const HEADING = 'text-2xl font-heading font-bold text-gray-900 mb-4'
const PROSE = 'text-gray-700 leading-relaxed'

const KaffarahCalculator = () => {
  const [daysMissed, setDaysMissed] = useState<number>(1)
  const [foodCostPerPerson, setFoodCostPerPerson] = useState<number>(10)
  const [calculationMethod, setCalculationMethod] = useState<'feeding' | 'monetary'>('monetary')
  const [result, setResult] = useState<{
    totalAmount: number
    peopleToFeed: number
    daysToFast: number
  } | null>(null)

  const [nisab, setNisab] = useState<NisabData | null>(null)
  const [nisabLoaded, setNisabLoaded] = useState(false)

  useEffect(() => {
    let active = true
    void fetchNisab().then((data) => {
      if (!active) return
      setNisab(data)
      setNisabLoaded(true)
    })
    return () => {
      active = false
    }
  }, [])

  // The single gate on printing invented money anywhere on this page.
  const showFigure = nisabLoaded && hasUsableFigure(nisab)

  const year = currentYear()

  const calculateKaffarah = () => {
    if (daysMissed <= 0) {
      alert('Please enter a valid number of days missed')
      return
    }

    if (calculationMethod === 'feeding') {
      // For feeding: 60 poor people per day missed
      const peopleToFeed = daysMissed * 60
      const totalAmount = peopleToFeed * foodCostPerPerson
      setResult({
        totalAmount,
        peopleToFeed,
        daysToFast: 0
      })
    } else {
      // Monetary equivalent: cost of feeding 60 people per day missed
      const peopleToFeed = daysMissed * 60
      const totalAmount = peopleToFeed * foodCostPerPerson
      setResult({
        totalAmount,
        peopleToFeed,
        daysToFast: daysMissed * 60 // Two consecutive months = approximately 60 days
      })
    }
  }

  const faqs = [
    {
      question: 'What is kaffarah?',
      answer:
        'Kaffarah is an expiation: something owed when a religious obligation has been broken deliberately, rather than simply missed. The two cases people meet most often are a fast in Ramadan broken on purpose without a valid excuse, and an oath sworn and then not kept. It is not a fine paid to anyone in authority, and it is not a way of buying an exemption in advance — it is owed after the fact, and in the case of the fast it sits alongside making the day up rather than replacing it.',
    },
    {
      question: 'When do I owe kaffarah rather than just making up a fast?',
      answer:
        'The dividing line is deliberateness. A fast broken on purpose, without a valid excuse, while you were obliged to be keeping it, is the case the expiation was prescribed for; a fast missed or broken for a reason the law recognises — illness, travel, pregnancy, menstruation, genuine forgetfulness — is made up later and nothing further is owed. The schools differ on exactly which deliberate acts trigger it: some confine the expiation to intercourse during a fasting day, while others extend it to deliberately eating or drinking as well. Where your own case falls is worth putting to a scholar rather than deciding from a web page.',
    },
    {
      question: 'How much is the kaffarah for a broken fast?',
      answer:
        'The sources set out graded options rather than a single amount: freeing a slave, then fasting two consecutive months, then feeding sixty poor people — and the thresholds and the order are not read identically by every school. Most hold the options are strictly ordered, so that you move to feeding only if you genuinely cannot fast two months without interruption; others treat them as a choice. The measure of food per person also differs by school, and it is usually described as a mudd or half a sa’ of the local staple, so the dollar amount depends entirely on local food prices.',
    },
    {
      question: 'What is the kaffarah for a broken oath?',
      answer:
        'A broken oath carries a different and much lighter expiation than a broken fast: feeding ten poor people, or clothing them, or freeing a slave, and only if none of those is possible, fasting three days. The ten are fed with what is average for the food you give your own family, so again the cash amount tracks local prices. Not every statement counts as an oath for this purpose — scholars distinguish a deliberate, binding oath from a casual turn of phrase, and they differ over where exactly that line falls.',
    },
    {
      question: 'Can I pay the money instead of feeding people?',
      answer:
        'Scholars differ. Many hold that the value may be given in cash and used to buy and distribute the food, on the grounds that the obligation is to feed people and money is simply the means; this is how most charities, including this one, are organised to handle it. Others hold that the expiation was specified as feeding and should be discharged as feeding, so that what reaches the recipient is a meal and not a transfer. We do not adjudicate between them. Note that this question only arises once feeding is the option that applies to you, which under the ordered reading is not the first option for a broken fast.',
    },
    {
      question: 'Do I owe kaffarah if I missed a fast because I was ill?',
      answer:
        'No — and this is the most important thing on the page. A fast missed or broken because of illness, or because you were travelling, is made up day for day once you are able, and no expiation is owed on top of it. If an illness is chronic and you are not expected to become able to fast at all, the commonly taught position is that fidya is given instead, which is feeding one poor person for each missed day and is a far smaller obligation than kaffarah. People sometimes arrive at this calculator convinced they owe sixty days of fasting for a week of flu; they do not.',
    },
  ]

  const jsonLd = [
    getBreadcrumbJsonLd([
      { name: 'Home', path: '/' },
      { name: 'Kaffarah Calculator', path: '/kaffarah-calculator' },
    ]),
    getFaqJsonLd(faqs),
    getWebApplicationJsonLd({
      name: 'Kaffarah Calculator',
      description:
        'A free calculator for kaffarah, the expiation owed for a deliberately broken fast: enter the days and a local cost of feeding one person, and see the amount.',
      path: '/kaffarah-calculator',
    }),
    getHowToJsonLd({
      name: 'How to work out your kaffarah',
      description:
        'Four steps from a deliberately broken fast to the expiation owed for it, and how to tell when none is owed at all.',
      steps: [
        {
          name: 'Check that kaffarah is what you owe',
          text: 'A fast missed through illness or travel is made up, not expiated. Kaffarah is for a fast broken deliberately, without a valid excuse.',
        },
        {
          name: 'Count the days',
          text: 'The expiation is reckoned per day deliberately broken, not once for the whole of Ramadan.',
        },
        {
          name: 'Take the options in order',
          text: 'The sources give freeing a slave, then fasting two consecutive months, then feeding sixty poor people. Most schools read them as strictly ordered; some treat them as a choice.',
        },
        {
          name: 'Cost the feeding option locally',
          text: 'Sixty people fed per day broken, at the cost of a day’s food where you live. Make up the missed day itself as well.',
        },
      ],
    }),
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <SEOHead
        title={`Kaffarah Calculator ${year} — Expiation for Missed Fasts and Oaths`}
        description="Kaffarah is the expiation for a deliberately broken fast or oath. See the graded options, how the schools differ, and when a missed fast is simply made up instead."
        canonicalPath="/kaffarah-calculator"
        jsonLd={jsonLd}
      />

      <PageHeader
        title={`Kaffarah Calculator ${year} — Expiation for Missed Fasts and Oaths`}
        description="Kaffarah is owed when an obligation is broken deliberately. A fast missed through illness or travel is made up, not expiated."
      />

      <div className="section-container py-8 sm:py-10">
        <div className="max-w-4xl space-y-6 sm:space-y-8">
          {/* What it is NOT — the most important thing on the page, so it
              stays open, directly above the tool. */}
          <section className="alert-warning block p-6 text-base" aria-labelledby="kaffarah-not">
            <h2 id="kaffarah-not" className="flex items-center text-lg font-heading font-bold text-amber-900 mb-2">
              <AlertCircle className="w-5 h-5 text-amber-700 me-2 shrink-0" aria-hidden="true" />
              What kaffarah is not
            </h2>
            <p className="text-amber-900 leading-relaxed">
              A fast missed through illness, travel, pregnancy, nursing, menstruation or genuine
              forgetfulness is <strong>made up day for day</strong>. No kaffarah is owed. If you cannot
              fast at all because of a chronic illness, fidya applies instead: one person fed per day
              missed.
            </p>
          </section>

          {/* Calculator Form — unchanged behaviour */}
          <section className="card sm:p-8" aria-labelledby="kaffarah-form">
            <h2 id="kaffarah-form" className="text-xl font-heading font-bold text-gray-900 mb-2">
              Cost the feeding option
            </h2>
            <p className="text-sm text-gray-600 mb-6">
              This costs the feeding option only, at sixty people for each day deliberately broken.
              Whether feeding is the option that applies to you depends on the ordering of the
              options, which is a question for a scholar and not for a calculator.
            </p>

            <div className="space-y-6">
              {/* Days Missed */}
              <div>
                <label htmlFor="kaffarah-days" className="label">
                  Number of Days Broken (Deliberately)
                </label>
                <input
                  id="kaffarah-days"
                  type="number"
                  min="1"
                  value={daysMissed}
                  onChange={(e) => setDaysMissed(parseInt(e.target.value) || 1)}
                  className="input-field w-full max-w-xs"
                  placeholder="1"
                />
                <p className="help-text">
                  Only days you broke deliberately, without a valid excuse. Days missed through
                  illness or travel are made up and do not belong here.
                </p>
              </div>

              {/* Calculation Method */}
              <fieldset>
                <legend className="label">Atonement Method</legend>
                <div className="space-y-3 mt-2">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="method"
                      value="monetary"
                      checked={calculationMethod === 'monetary'}
                      onChange={() => setCalculationMethod('monetary')}
                      className="me-3"
                    />
                    <span className="text-gray-700">Monetary Payment (the value of the food, in cash)</span>
                  </label>
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="method"
                      value="feeding"
                      checked={calculationMethod === 'feeding'}
                      onChange={() => setCalculationMethod('feeding')}
                      className="me-3"
                    />
                    <span className="text-gray-700">Feeding Poor People</span>
                  </label>
                </div>
                <p className="help-text">
                  Scholars differ on whether the value may be given in cash in place of the food.
                  This choice is yours to make.
                </p>
              </fieldset>

              {/* Food Cost Per Person */}
              <div>
                <label htmlFor="kaffarah-cost" className="label">
                  Cost to Feed One Person (in USD)
                </label>
                <div className="relative max-w-xs">
                  <div className="absolute inset-y-0 start-0 ps-3 flex items-center pointer-events-none">
                    <DollarSign className="w-5 h-5 text-gray-500" aria-hidden="true" />
                  </div>
                  <input
                    id="kaffarah-cost"
                    type="number"
                    min="1"
                    step="0.01"
                    value={foodCostPerPerson}
                    onChange={(e) => setFoodCostPerPerson(parseFloat(e.target.value) || 10)}
                    className="input-field ps-10 w-full"
                    placeholder="10.00"
                  />
                </div>
                <p className="help-text">
                  What a day’s food costs where you live. We do not supply a figure, because it is a
                  local one and only you know it.
                </p>
              </div>

              {/* Calculate Button */}
              <button
                type="button"
                onClick={calculateKaffarah}
                className="btn-primary btn-lg w-full sm:w-auto"
              >
                Calculate Kaffarah
              </button>
            </div>
          </section>

          {/* Results — unchanged figures */}
          {result && (
            <section className="card-tinted sm:p-8" aria-live="polite" aria-labelledby="kaffarah-result">
              <h2 id="kaffarah-result" className="text-xl font-heading font-bold text-gray-900 mb-6">
                Your Kaffarah Calculation
              </h2>

              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
                  <dt className="text-sm text-gray-600 mb-1">People to Feed</dt>
                  <dd className="text-2xl font-bold text-gray-900">{result.peopleToFeed}</dd>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
                  <dt className="text-sm text-gray-600 mb-1">Total Amount</dt>
                  <dd className="text-2xl font-bold text-gray-900">${result.totalAmount.toFixed(2)}</dd>
                </div>
                {calculationMethod === 'monetary' && (
                  <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
                    <dt className="text-sm text-gray-600 mb-1">Days to Fast</dt>
                    <dd className="text-2xl font-bold text-gray-900">{result.daysToFast}</dd>
                    <dd className="text-xs text-gray-500 mt-1">(Alternative option)</dd>
                  </div>
                )}
              </dl>

              <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
                <h3 className="font-semibold text-gray-900 mb-2">Summary</h3>
                <p className="text-gray-700 mb-2">
                  For {daysMissed} day{daysMissed > 1 ? 's' : ''} broken, the feeding option comes to:
                </p>
                <ul className="list-disc list-inside text-gray-700 space-y-1">
                  <li><strong>Feed {result.peopleToFeed} poor people</strong> (60 people × {daysMissed} day{daysMissed > 1 ? 's' : ''})</li>
                  <li><strong>Pay ${result.totalAmount.toFixed(2)}</strong> at the cost per person you entered</li>
                </ul>
                <p className="text-sm text-gray-600 mt-3">
                  This uses the cost you supplied, not a figure of ours. The missed day itself is
                  still made up, in addition to the expiation.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                {/* The purpose keeps kaffarah money recorded apart from zakat
                    (see "How it is given"). */}
                <Link
                  to={`/donate?purpose=Kaffarah&amount=${result.totalAmount.toFixed(2)}`}
                  className="btn-primary"
                >
                  Donate Now
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setResult(null)
                    setDaysMissed(1)
                    setFoodCostPerPerson(10)
                  }}
                  className="btn-secondary"
                >
                  Calculate Again
                </button>
              </div>
            </section>
          )}

          {/* The explanations, folded under the tool. The text stays in the
              DOM (and the FAQ in the schema). */}
          <section aria-labelledby="kaffarah-learn" className="space-y-3">
            <h2 id="kaffarah-learn" className={HEADING}>How kaffarah works</h2>

            <Disclosure title="What kaffarah is" summary="An expiation for a deliberate breach, not a fee">
              <p className={PROSE}>
                Kaffarah is an expiation — something owed after an obligation has been broken on
                purpose. It is not a fee, it is not paid to any authority, and it cannot be paid in
                advance to licence breaking something later. It applies in two cases: a Ramadan fast
                broken deliberately without a valid excuse, and an oath that was sworn and then not
                kept.
              </p>
              <p className={PROSE}>
                The two carry very different weights. The expiation for a broken oath is modest. The
                expiation for a deliberately broken fast is heavy, and it is meant to be — it is the
                measure of how serious the breach is held to be, not a tariff. In the case of the fast,
                the expiation does not take the place of the missed day: the day itself is still made
                up.
              </p>
            </Disclosure>

            <Disclosure
              title="The options for a deliberately broken fast"
              summary="Three options in a fixed order; the schools differ on how binding it is"
            >
              <p className={PROSE}>
                The sources set out three options in a fixed sequence, and the order matters to how
                most scholars read them:
              </p>
              <ol className="space-y-3 text-gray-700 list-decimal list-inside">
                <li>
                  <strong>Freeing a slave.</strong> Listed first in the texts, and without application
                  today, which is why the discussion in practice starts at the second option.
                </li>
                <li>
                  <strong>Fasting two consecutive months</strong> — around sixty days, unbroken. If the
                  sequence is interrupted without an excuse, the common position is that it starts
                  again from the beginning.
                </li>
                <li>
                  <strong>Feeding sixty poor people</strong> for each day that was deliberately broken.
                </li>
              </ol>
              <p className={PROSE}>
                <strong>The schools differ on how binding that order is.</strong> Most hold the options
                are strictly graded, so that you move to feeding only if you genuinely cannot fast two
                consecutive months; on that reading, someone able to fast may not simply choose to pay.
                Others treat the three as a choice open to the person expiating. The schools also
                differ on what triggers the expiation in the first place — some confine it to
                intercourse during a fasting day, others extend it to deliberately eating or drinking —
                and on the measure of food owed per person, usually given as a mudd or half a sa’ of
                the local staple. This page does not adjudicate any of that.
              </p>
              <p className={PROSE}>
                A broken oath is a separate and much lighter matter: feeding ten poor people, or
                clothing them, or freeing a slave, and only where none of those is possible, fasting
                three days.
              </p>
            </Disclosure>

            {/* A worked example — withheld whenever the page is withholding
                dollar figures, on the same rule as /nisab and /zakat-calculator. */}
            {showFigure && (
              <Disclosure title="A worked example" summary="Feeding sixty people, at an invented $5 each">
                <div className="flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <Info className="w-5 h-5 text-gray-500 shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="text-sm text-gray-600">
                    Illustrative only. The cost below is a round invented number chosen to show the
                    arithmetic — it is not a price we are quoting. Use your own local cost in the
                    calculator above.
                  </p>
                </div>
                <p className={PROSE}>
                  Suppose one day of Ramadan was broken deliberately, the feeding option is the one
                  that applies to you, and a day’s food for one person costs an illustrative $5 where
                  you live.
                </p>
                <ul className="space-y-2 text-gray-700">
                  <li>
                    <strong>For one day broken:</strong> 60 people × $5 = $300.
                  </li>
                  <li>
                    <strong>For two days broken:</strong> 120 people × $5 = $600 — the expiation is
                    reckoned per day, not once for the month.
                  </li>
                  <li>
                    <strong>And in addition:</strong> the missed day or days are made up by fasting
                    them later. The expiation does not replace them.
                  </li>
                </ul>
                <p className={PROSE}>
                  How much food counts as feeding one person is itself given differently by different
                  schools — a mudd, or half a sa’, of the local staple are the measures usually
                  quoted — so the honest version of this sum is always local and always approximate.
                </p>
              </Disclosure>
            )}

            <Disclosure title="How it is given" summary="To the poor and needy, recorded apart from zakat">
              <p className={PROSE}>
                Where the feeding option applies, the food goes to the poor and needy — the same
                people entitled to receive zakat — and not to your own dependants, whose support is
                already your responsibility. Sixty separate people is the number given in the sources;
                scholars differ on whether the same person may be fed sixty times instead, with many
                holding that they may not, because the breadth of the benefit is part of the point.
              </p>
              <p className={PROSE}>
                Kaffarah money is kept distinct from zakat in a charity’s accounting, even though the
                categories of recipient overlap, because they discharge different obligations. If you
                are giving through us, say which one it is so it is recorded correctly.
              </p>
              <Link to="/zakat-calculator" className="link inline-flex items-center">
                Zakat on wealth is a separate obligation — work that out here
                <ArrowRight className="ms-2 w-4 h-4" aria-hidden="true" />
              </Link>
            </Disclosure>
          </section>

          {/* FAQ — the same text that goes into the FAQPage schema */}
          <section aria-labelledby="kaffarah-faq">
            <h2 id="kaffarah-faq" className={HEADING}>Common questions</h2>
            <div className="card py-1 sm:py-1 divide-y divide-gray-200">
              {faqs.map((faq) => (
                <Disclosure key={faq.question} variant="plain" title={faq.question}>
                  <p className={PROSE}>{faq.answer}</p>
                </Disclosure>
              ))}
            </div>
          </section>

          {/* The disclaimer — stays open */}
          <section className="alert-warning block p-6 sm:p-8 text-base">
            <p className="text-amber-900 leading-relaxed">
              This page is general guidance, not a religious ruling. Kaffarah depends on your
              circumstances — for anything specific to your situation, please ask a qualified
              scholar.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}

export default KaffarahCalculator
