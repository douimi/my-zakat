/**
 * /zakat-al-fitr-calculator — the per-person charity due before the Eid prayer,
 * plus the content that makes the page findable.
 *
 * The calculator itself is unchanged: household size, a staple food price you
 * supply, and one sa' per head. What is new around it is the content, written
 * to the same editorial rules as /nisab and /zakat-calculator — it states what
 * is agreed, names what is not, and rules on nothing.
 *
 * The worked example is gated on `hasUsableFigure` like every other worked
 * example on this site. The figures the calculator produces are not gated,
 * because they are arithmetic on a price the visitor typed in, not a figure
 * this site is vouching for.
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

const ZakatAlFitrCalculator = () => {
  const [householdSize, setHouseholdSize] = useState<number>(1)
  const [foodPricePerKg, setFoodPricePerKg] = useState<number>(3)
  const [calculationMethod, setCalculationMethod] = useState<'food' | 'monetary'>('monetary')
  const [result, setResult] = useState<{
    totalAmount: number
    totalKg: number
    perPerson: number
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

  const calculateZakatAlFitr = () => {
    if (householdSize <= 0) {
      alert('Please enter a valid household size')
      return
    }

    // Zakat al-Fitr is approximately 2.5-3 kg of staple food per person
    const kgPerPerson = 2.75 // Average of 2.5-3 kg
    const totalKg = householdSize * kgPerPerson

    if (calculationMethod === 'food') {
      setResult({
        totalAmount: totalKg * foodPricePerKg,
        totalKg,
        perPerson: kgPerPerson
      })
    } else {
      // Monetary equivalent
      const totalAmount = totalKg * foodPricePerKg
      setResult({
        totalAmount,
        totalKg,
        perPerson: kgPerPerson
      })
    }
  }

  const faqs = [
    {
      question: 'How much is Zakat al-Fitr this year?',
      answer:
        'The obligation is defined as a measure of staple food rather than as a sum of money: one sa’ per person, which is usually put at somewhere between 2.5 and 3 kilograms of wheat, rice, barley, dates or whatever the staple is where you live. There is therefore no single dollar figure for the year, and any site that quotes one is quoting a local food price rather than the rule itself. Work out what one sa’ of your local staple costs, or ask your mosque, which will usually publish a figure for the area shortly before Eid.',
    },
    {
      question: 'Who has to pay Zakat al-Fitr?',
      answer:
        'It is due from every Muslim who has food beyond what they and their dependants need for the day of Eid and the night before it, which is a much lower bar than the nisab that governs zakat on wealth. It is a per-person obligation rather than a per-household one, so the amount owed scales with the number of people, not with how much anyone owns. In practice the head of the household usually pays the whole family’s share in one go.',
    },
    {
      question: 'Do I pay it for my children?',
      answer:
        'Yes — the obligation covers every member of the household, children included, and it is normally discharged on their behalf by whoever supports them. A newborn who arrives before the end of Ramadan is generally included; scholars differ over a child born during the night before Eid, and over whether it is owed for an unborn child, with most holding that it is not. Adult dependants you support, such as an elderly parent living with you, are usually counted in the same way.',
    },
    {
      question: 'When is the deadline?',
      answer:
        'It must reach those entitled to it before the Eid prayer — that is the part people most often get wrong, because charity given later in the day feels like it should still count. Scholars differ on how early it may be paid, with some permitting it during the last days of Ramadan and others from the beginning of the month, but nobody disputes the far end of the window. Paying two or three days ahead is the safe course, and it is what makes it possible for the money to turn into food in time.',
    },
    {
      question: 'Can I pay money instead of food?',
      answer:
        'Scholars differ on this, and the difference is a real one rather than a technicality. Many hold that the value may be paid in cash, on the grounds that the aim is to meet a need on the day of Eid and money meets it more flexibly than a sack of grain; this is the position most commonly associated with the Hanafi school and the one most charities work to. Others hold that the obligation was specified as food and should be discharged as food, and that substituting the value changes what was prescribed. We do not adjudicate between them; ask a scholar you trust, or follow the practice of your school.',
    },
    {
      question: 'What happens if I miss it?',
      answer:
        'The widely taught position is that paying after the Eid prayer no longer counts as Zakat al-Fitr and is recorded as ordinary charity instead, so the obligation remains outstanding. Most scholars hold that you should still pay it as soon as you realise, since a debt owed is not cancelled by being late, and many add that some repentance is appropriate where the delay was avoidable. If you have missed it for several years, the amount owed is worked out per person per year, and it is worth asking someone qualified how to settle it.',
    },
  ]

  const jsonLd = [
    getBreadcrumbJsonLd([
      { name: 'Home', path: '/' },
      { name: 'Zakat al-Fitr Calculator', path: '/zakat-al-fitr-calculator' },
    ]),
    getFaqJsonLd(faqs),
    getWebApplicationJsonLd({
      name: 'Zakat al-Fitr Calculator',
      description:
        'A free calculator for Zakat al-Fitr: enter your household size and the price of a staple food, and see the measure and the value due before the Eid prayer.',
      path: '/zakat-al-fitr-calculator',
    }),
    getHowToJsonLd({
      name: 'How to work out your Zakat al-Fitr',
      description:
        'Four steps from the size of your household to the amount due before the Eid prayer.',
      steps: [
        {
          name: 'Count everyone in the household',
          text: 'Yourself, your spouse, your children and any dependants you support — it is a per-person obligation.',
        },
        {
          name: 'Take one sa’ per person',
          text: 'One sa’ is a volume measure of staple food, usually put at between 2.5 and 3 kilograms of wheat, rice, barley or dates.',
        },
        {
          name: 'Give it as food, or as its value',
          text: 'Whether the monetary equivalent may be given in place of the food is a point on which scholars differ; follow the position of your school or teacher.',
        },
        {
          name: 'Pay it before the Eid prayer',
          text: 'It must reach those entitled to it before the prayer. Paid afterwards, it is widely held to count as ordinary charity rather than Zakat al-Fitr.',
        },
      ],
    }),
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <SEOHead
        title={`Zakat al-Fitr ${year} — How Much to Pay and When`}
        description="Zakat al-Fitr is one sa’ of staple food per person, due before the Eid prayer. Work out what your household owes, and see where scholars differ on paying its value in cash."
        canonicalPath="/zakat-al-fitr-calculator"
        jsonLd={jsonLd}
      />

      <PageHeader
        title={`Zakat al-Fitr ${year} — How Much to Pay and When`}
        description="A measure of staple food for every person in the household, given before the Eid prayer at the end of Ramadan."
      />

      <div className="section-container py-8 sm:py-10">
        <div className="max-w-4xl space-y-6 sm:space-y-8">
          {/* Calculator Form — unchanged behaviour */}
          <section className="card sm:p-8" aria-labelledby="fitr-form">
            <h2 id="fitr-form" className="text-xl font-heading font-bold text-gray-900 mb-6">
              Calculate your Zakat al-Fitr
            </h2>

            <div className="space-y-6">
              {/* Household Size */}
              <div>
                <label htmlFor="fitr-household" className="label">
                  Household Size (Number of People)
                </label>
                <input
                  id="fitr-household"
                  type="number"
                  min="1"
                  value={householdSize}
                  onChange={(e) => setHouseholdSize(parseInt(e.target.value) || 1)}
                  className="input-field w-full max-w-xs"
                  placeholder="1"
                />
                <p className="help-text">
                  Include yourself and all dependants (spouse, children, elderly parents, etc.)
                </p>
              </div>

              {/* Calculation Method */}
              <fieldset>
                <legend className="label">Payment Method</legend>
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
                      value="food"
                      checked={calculationMethod === 'food'}
                      onChange={() => setCalculationMethod('food')}
                      className="me-3"
                    />
                    <span className="text-gray-700">Food (staple food such as wheat, rice or dates)</span>
                  </label>
                </div>
                <p className="help-text">
                  Scholars differ on whether the value may be paid in place of the food. This choice
                  is yours to make; the calculator shows both the measure and the value either way.
                </p>
              </fieldset>

              {/* Food Price Per Kg */}
              <div>
                <label htmlFor="fitr-price" className="label">
                  Price of Staple Food per Kilogram (in USD)
                </label>
                <div className="relative max-w-xs">
                  <div className="absolute inset-y-0 start-0 ps-3 flex items-center pointer-events-none">
                    <DollarSign className="w-5 h-5 text-gray-500" aria-hidden="true" />
                  </div>
                  <input
                    id="fitr-price"
                    type="number"
                    min="0.5"
                    step="0.01"
                    value={foodPricePerKg}
                    onChange={(e) => setFoodPricePerKg(parseFloat(e.target.value) || 3)}
                    className="input-field ps-10 w-full"
                    placeholder="3.00"
                  />
                </div>
                <p className="help-text">
                  The price you pay locally for a staple food — wheat, rice, dates. We do not supply
                  one, because it is a local figure and only you know it.
                </p>
              </div>

              {/* Calculate Button */}
              <button
                type="button"
                onClick={calculateZakatAlFitr}
                className="btn-primary btn-lg w-full sm:w-auto"
              >
                Calculate Zakat al-Fitr
              </button>
            </div>
          </section>

          {/* Results — unchanged figures */}
          {result && (
            <section className="card-tinted sm:p-8" aria-live="polite" aria-labelledby="fitr-result">
              <h2 id="fitr-result" className="text-xl font-heading font-bold text-gray-900 mb-6">
                Your Zakat al-Fitr Calculation
              </h2>

              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
                  <dt className="text-sm text-gray-600 mb-1">Household Size</dt>
                  <dd className="text-2xl font-bold text-gray-900">{householdSize}</dd>
                  <dd className="text-xs text-gray-500 mt-1">person{householdSize > 1 ? 's' : ''}</dd>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
                  <dt className="text-sm text-gray-600 mb-1">Per Person</dt>
                  <dd className="text-2xl font-bold text-gray-900">{result.perPerson.toFixed(2)} kg</dd>
                  <dd className="text-xs text-gray-500 mt-1">or ${(result.totalAmount / householdSize).toFixed(2)}</dd>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
                  <dt className="text-sm text-gray-600 mb-1">Total Amount</dt>
                  <dd className="text-2xl font-bold text-gray-900">${result.totalAmount.toFixed(2)}</dd>
                  <dd className="text-xs text-gray-500 mt-1">({result.totalKg.toFixed(2)} kg total)</dd>
                </div>
              </dl>

              <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
                <h3 className="font-semibold text-gray-900 mb-2">Summary</h3>
                <p className="text-gray-700 mb-2">
                  For a household of {householdSize} person{householdSize > 1 ? 's' : ''}, your Zakat al-Fitr is:
                </p>
                <ul className="list-disc list-inside text-gray-700 space-y-1">
                  <li><strong>{result.totalKg.toFixed(2)} kg</strong> of staple food ({result.perPerson.toFixed(2)} kg × {householdSize} person{householdSize > 1 ? 's' : ''})</li>
                  <li><strong>${result.totalAmount.toFixed(2)}</strong> at the food price you entered</li>
                </ul>
                <p className="text-sm text-gray-600 mt-3">
                  This works from a sa’ of 2.75 kg — the middle of the 2.5–3 kg range — and from the
                  food price you supplied, not a price of ours.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  to={`/donate?purpose=${encodeURIComponent('Zakat al-Fitr')}&amount=${result.totalAmount.toFixed(2)}`}
                  className="btn-primary"
                >
                  Donate Now
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setResult(null)
                    setHouseholdSize(1)
                    setFoodPricePerKg(3)
                  }}
                  className="btn-secondary"
                >
                  Calculate Again
                </button>
              </div>
            </section>
          )}

          {/* Timing — the part people most often get wrong, so it stays open. */}
          <section className="alert-warning block p-6 text-base" aria-labelledby="fitr-deadline">
            <h2 id="fitr-deadline" className="flex items-center text-lg font-heading font-bold text-amber-900 mb-2">
              <AlertCircle className="w-5 h-5 text-amber-700 me-2 shrink-0" aria-hidden="true" />
              When it has to be paid
            </h2>
            <p className="text-amber-900 leading-relaxed">
              It must reach recipients <strong>before the Eid prayer</strong>; after the prayer it
              counts as ordinary charity. Give two or three days before Eid: most charities close
              collection a day or so early.
            </p>
          </section>

          {/* The explanations, folded under the tool. The text stays in the
              DOM (and the FAQ in the schema). */}
          <section aria-labelledby="fitr-learn" className="space-y-3">
            <h2 id="fitr-learn" className={HEADING}>How Zakat al-Fitr works</h2>

            <Disclosure title="What Zakat al-Fitr is" summary="A food measure per person, due before Eid">
              <p className={PROSE}>
                Zakat al-Fitr — often called fitrana or sadaqat al-fitr — is a small charge that falls
                due at the end of Ramadan, and it works quite differently from the annual zakat on
                wealth. It is not a percentage of what you own, it is not tied to a lunar year of
                ownership, and it is not measured against the nisab. It is a fixed measure of staple
                food, owed once, for every person in the household.
              </p>
              <p className={PROSE}>
                Because it is a per-person obligation, the size of your family determines the amount
                far more than the size of your savings does. It is due from anyone who has food beyond
                what their household needs for the day of Eid and the night before it, which brings in
                a great many people who owe no zakat on wealth at all. Its purpose is plain enough: it
                is meant to reach a poor family in time for them to eat well on the morning of Eid
                rather than at some point afterwards.
              </p>
            </Disclosure>

            <Disclosure title="How much is due" summary="One sa’, about 2.5–3 kg of staple food">
              <p className={PROSE}>
                The measure is one sa’ per person. A sa’ is a volume measure from the prophetic
                period — four times a mudd, which is roughly two cupped handfuls — and converting it
                into modern weight depends on what you are measuring, since a sa’ of dates and a sa’ of
                wheat do not weigh the same. That is why you will see it given as a range rather than a
                single number: between about 2.5 and 3 kilograms of staple food is the usual
                conversion, and the calculator above works from the middle of that range.
              </p>
              <p className={PROSE}>
                The staple is whatever people actually eat where you live: wheat, rice, barley, dates,
                raisins, maize. There is no requirement to send a particular grain across the world,
                and nothing is gained by giving a food nobody in the area cooks with.
              </p>
            </Disclosure>

            <Disclosure title="Food, or the money instead?" summary="Scholars differ; we collect cash">
              <p className={PROSE}>
                <strong>This is the point on which scholars genuinely differ.</strong> Many hold that
                the value may be paid in cash rather than in grain: the obligation exists to meet a
                need on the day of Eid, money meets that need more flexibly than a sack of rice, and a
                family that already has rice may need something else entirely. This is the position
                most commonly associated with the Hanafi school, and it is how most charities,
                including this one, are set up to collect.
              </p>
              <p className={PROSE}>
                Other scholars hold that the obligation was specified as food and should be discharged
                as food. On this view the measure is not incidental to the ruling but part of it, and
                paying the value substitutes something for what was actually prescribed. Both positions
                have substantial support behind them, and this page does not choose between them. The
                calculator above shows you the measure in kilograms and the value in dollars side by
                side, so you can act on whichever position you follow.
              </p>
            </Disclosure>

            {/* A worked example — withheld whenever the page is withholding
                dollar figures, on the same rule as /nisab and /zakat-calculator. */}
            {showFigure && (
              <Disclosure title="A worked example" summary="A family of five">
                <div className="flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <Info className="w-5 h-5 text-gray-500 shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="text-sm text-gray-600">
                    Illustrative only. The food price below is a round invented number chosen to show
                    the arithmetic — it is not a price we are quoting. Use your own local price in the
                    calculator above.
                  </p>
                </div>
                <p className={PROSE}>
                  Two parents and three children make five people, so five shares are due. Suppose the
                  staple where you live is rice, and suppose it costs an illustrative $4 a kilogram.
                </p>
                <ul className="space-y-2 text-gray-700">
                  <li>
                    <strong>Per person:</strong> one sa’, taken at 2.75 kg — so 2.75 kg × $4 = $11.
                  </li>
                  <li>
                    <strong>For the household:</strong> 5 × 2.75 kg = 13.75 kg of rice, or 5 × $11 =
                    $55 if you are paying the value.
                  </li>
                </ul>
                <p className={PROSE}>
                  Both figures describe the same obligation: 13.75 kg of rice delivered, or $55 given
                  so that someone can buy it. Which of the two discharges it is the question scholars
                  differ on, set out above. Either way it needs to be in the recipients’ hands before
                  the Eid prayer.
                </p>
              </Disclosure>
            )}

            <Disclosure title="Who receives it" summary="The poor and needy, not your own dependants">
              <p className={PROSE}>
                Zakat al-Fitr goes to the poor and needy — the same categories entitled to zakat, and
                in practice the first two of them. It is not given to your own parents, children or
                spouse, since supporting them is already your responsibility, and it is not used to
                pay for mosque running costs or general good causes. Giving it locally, so that it
                reaches a family who will eat on Eid morning in the community you are part of, is the
                commonly encouraged practice, though sending it where the need is greater is widely
                accepted too.
              </p>
              <Link to="/nisab" className="link inline-flex items-center">
                How the nisab works for zakat on wealth — a different obligation
                <ArrowRight className="ms-2 w-4 h-4" aria-hidden="true" />
              </Link>
            </Disclosure>
          </section>

          {/* FAQ — the same text that goes into the FAQPage schema */}
          <section aria-labelledby="fitr-faq">
            <h2 id="fitr-faq" className={HEADING}>Common questions</h2>
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
              This page is general guidance, not a religious ruling. Zakat al-Fitr depends on your
              circumstances — for anything specific to your situation, please ask a qualified
              scholar.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}

export default ZakatAlFitrCalculator
