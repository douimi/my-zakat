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
import { Calculator, Info, AlertCircle, Users, DollarSign, Calendar, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import SEOHead from '../components/SEOHead'
import { fetchNisab, hasUsableFigure, type Nisab as NisabData } from '../utils/nisabApi'
import {
  currentYear,
  getBreadcrumbJsonLd,
  getFaqJsonLd,
  getWebApplicationJsonLd,
  getHowToJsonLd,
} from '../utils/seo'

const CARD = 'bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8'
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
    <div className="min-h-screen bg-gray-50 py-8 sm:py-12">
      <SEOHead
        title={`Kaffarah Calculator ${year} — Expiation for Missed Fasts and Oaths`}
        description="Kaffarah is the expiation for a deliberately broken fast or oath. See the graded options, how the schools differ, and when a missed fast is simply made up instead."
        canonicalPath="/kaffarah-calculator"
        jsonLd={jsonLd}
      />
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-600 rounded-full mb-6">
            <Calculator className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-heading font-bold text-gray-900 mb-4">
            Kaffarah Calculator {year} — Expiation for Missed Fasts and Oaths
          </h1>
          <p className="text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto">
            Kaffarah is owed when an obligation is broken deliberately. A fast missed through illness
            or travel is made up, not expiated.
          </p>
        </div>

        <div className="space-y-6 sm:space-y-8">
          {/* 1. What it is */}
          <section className={CARD}>
            <h2 className={HEADING}>What kaffarah is</h2>
            <p className={PROSE}>
              Kaffarah is an expiation — something owed after an obligation has been broken on
              purpose. It is not a fee, it is not paid to any authority, and it cannot be paid in
              advance to licence breaking something later. Two cases account for almost everyone who
              arrives at a page like this one: a Ramadan fast broken deliberately without a valid
              excuse, and an oath that was sworn and then not kept.
            </p>
            <p className={`${PROSE} mt-4`}>
              The two carry very different weights. The expiation for a broken oath is modest. The
              expiation for a deliberately broken fast is heavy, and it is meant to be — it is the
              measure of how serious the breach is held to be, not a tariff. In the case of the fast,
              the expiation does not take the place of the missed day: the day itself is still made
              up.
            </p>
          </section>

          {/* 2. What it is NOT — the most important section on the page. */}
          <section className="bg-amber-50 border border-amber-200 rounded-xl p-6 sm:p-8">
            <div className="flex items-center mb-4">
              <AlertCircle className="w-6 h-6 text-amber-700 mr-3" aria-hidden="true" />
              <h2 className="text-2xl font-heading font-bold text-amber-900">
                What kaffarah is not
              </h2>
            </div>
            <p className="text-amber-900 leading-relaxed">
              A fast missed because you were ill, or travelling, or pregnant, or nursing, or
              menstruating — or broken by genuine forgetfulness — is <strong>made up</strong>, day
              for day, once you are able. That is qada, and nothing further is owed. Kaffarah does
              not enter into it.
            </p>
            <p className="text-amber-900 leading-relaxed mt-4">
              Where an illness is chronic and you are not expected to be able to fast at all, the
              commonly taught position is that fidya is given instead: feeding one poor person for
              each day missed. That is a far smaller obligation than kaffarah, and the two are
              regularly confused. People arrive at calculators like this one convinced they owe two
              months of fasting for a week of flu. They do not.
            </p>
          </section>

          {/* 3. The graded options, in the order the sources give them. */}
          <section className={CARD}>
            <h2 className={HEADING}>The options for a deliberately broken fast</h2>
            <p className={PROSE}>
              The sources set out three options in a fixed sequence, and the order matters to how
              most scholars read them:
            </p>
            <ol className="mt-4 space-y-3 text-gray-700 list-decimal list-inside">
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
            <p className={`${PROSE} mt-4`}>
              <strong>The schools differ on how binding that order is.</strong> Most hold the options
              are strictly graded, so that you move to feeding only if you genuinely cannot fast two
              consecutive months; on that reading, someone able to fast may not simply choose to pay.
              Others treat the three as a choice open to the person expiating. The schools also
              differ on what triggers the expiation in the first place — some confine it to
              intercourse during a fasting day, others extend it to deliberately eating or drinking —
              and on the measure of food owed per person, usually given as a mudd or half a sa’ of
              the local staple. This page does not adjudicate any of that.
            </p>
            <p className={`${PROSE} mt-4`}>
              A broken oath is a separate and much lighter matter: feeding ten poor people, or
              clothing them, or freeing a slave, and only where none of those is possible, fasting
              three days.
            </p>
          </section>

          {/* Calculator Form — unchanged behaviour */}
          <div className="card bg-gray-50">
            <h2 className="text-2xl font-semibold text-gray-900 mb-6">Cost the feeding option</h2>
            <p className="text-sm text-gray-600 mb-6">
              This costs the feeding option only, at sixty people for each day deliberately broken.
              Whether feeding is the option that applies to you depends on the ordering above, which
              is a question for a scholar and not for a calculator.
            </p>

            <div className="space-y-6">
              {/* Days Missed */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Number of Days Broken (Deliberately)
                </label>
                <input
                  type="number"
                  min="1"
                  value={daysMissed}
                  onChange={(e) => setDaysMissed(parseInt(e.target.value) || 1)}
                  className="input-field w-full max-w-xs"
                  placeholder="1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Only days you broke deliberately, without a valid excuse. Days missed through
                  illness or travel are made up and do not belong here.
                </p>
              </div>

              {/* Calculation Method */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Atonement Method
                </label>
                <div className="space-y-3">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="method"
                      value="monetary"
                      checked={calculationMethod === 'monetary'}
                      onChange={() => setCalculationMethod('monetary')}
                      className="mr-3"
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
                      className="mr-3"
                    />
                    <span className="text-gray-700">Feeding Poor People</span>
                  </label>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Scholars differ on whether the value may be given in cash in place of the food.
                  This choice is yours to make.
                </p>
              </div>

              {/* Food Cost Per Person */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cost to Feed One Person (in USD)
                </label>
                <div className="relative max-w-xs">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <DollarSign className="w-5 h-5 text-gray-400" />
                  </div>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={foodCostPerPerson}
                    onChange={(e) => setFoodCostPerPerson(parseFloat(e.target.value) || 10)}
                    className="input-field pl-10 w-full"
                    placeholder="10.00"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  What a day’s food costs where you live. We do not supply a figure, because it is a
                  local one and only you know it.
                </p>
              </div>

              {/* Calculate Button */}
              <button
                onClick={calculateKaffarah}
                className="btn-primary w-full sm:w-auto px-8 py-3 text-lg"
              >
                Calculate Kaffarah
              </button>
            </div>
          </div>

          {/* Results — unchanged */}
          {result && (
            <div className="card bg-green-50 border-green-200">
              <h2 className="text-2xl font-semibold text-gray-900 mb-6">Your Kaffarah Calculation</h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="bg-white rounded-lg p-4 text-center">
                  <Users className="w-8 h-8 text-primary-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-600 mb-1">People to Feed</p>
                  <p className="text-2xl font-bold text-gray-900">{result.peopleToFeed}</p>
                </div>
                <div className="bg-white rounded-lg p-4 text-center">
                  <DollarSign className="w-8 h-8 text-green-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-600 mb-1">Total Amount</p>
                  <p className="text-2xl font-bold text-gray-900">${result.totalAmount.toFixed(2)}</p>
                </div>
                {calculationMethod === 'monetary' && (
                  <div className="bg-white rounded-lg p-4 text-center">
                    <Calendar className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                    <p className="text-sm text-gray-600 mb-1">Days to Fast</p>
                    <p className="text-2xl font-bold text-gray-900">{result.daysToFast}</p>
                    <p className="text-xs text-gray-500 mt-1">(Alternative option)</p>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-lg p-4 mb-4">
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
                <Link
                  to="/donate"
                  className="btn-primary flex items-center justify-center"
                >
                  Donate Now
                </Link>
                <button
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
            </div>
          )}

          {/* 4. A worked example — withheld whenever the page is withholding
              dollar figures, on the same rule as /nisab and /zakat-calculator. */}
          {showFigure && (
            <section className={CARD}>
              <h2 className={HEADING}>A worked example: feeding sixty people</h2>
              <div className="flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
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
              <ul className="mt-4 space-y-2 text-gray-700">
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
              <p className={`${PROSE} mt-4`}>
                How much food counts as feeding one person is itself given differently by different
                schools — a mudd, or half a sa’, of the local staple are the measures usually
                quoted — so the honest version of this sum is always local and always approximate.
              </p>
            </section>
          )}

          {/* 5. How it is given */}
          <section className={CARD}>
            <h2 className={HEADING}>How it is given</h2>
            <p className={PROSE}>
              Where the feeding option applies, the food goes to the poor and needy — the same
              people entitled to receive zakat — and not to your own dependants, whose support is
              already your responsibility. Sixty separate people is the number given in the sources;
              scholars differ on whether the same person may be fed sixty times instead, with many
              holding that they may not, because the breadth of the benefit is part of the point.
            </p>
            <p className={`${PROSE} mt-4`}>
              Kaffarah money is kept distinct from zakat in a charity’s accounting, even though the
              categories of recipient overlap, because they discharge different obligations. If you
              are giving through us, say which one it is so it is recorded correctly.
            </p>
            <Link
              to="/zakat-calculator"
              className="mt-4 text-primary-700 hover:text-primary-800 font-medium inline-flex items-center"
            >
              Zakat on wealth is a separate obligation — work that out here
              <ArrowRight className="ml-2 w-4 h-4" />
            </Link>
          </section>

          {/* 6. FAQ — the same text that goes into the FAQPage schema */}
          <section className={CARD}>
            <h2 className={HEADING}>Common questions</h2>
            <div className="divide-y divide-gray-200">
              {faqs.map((faq) => (
                <div key={faq.question} className="py-5 first:pt-0 last:pb-0">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{faq.question}</h3>
                  <p className={PROSE}>{faq.answer}</p>
                </div>
              ))}
            </div>
          </section>

          {/* 7. The disclaimer */}
          <section className="bg-amber-50 border border-amber-200 rounded-xl p-6 sm:p-8">
            <p className="text-amber-900 leading-relaxed">
              This page is general guidance, not a religious ruling. Zakat depends on your
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
