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
import { Info, AlertCircle, Users, DollarSign, Gift, ArrowRight } from 'lucide-react'
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
    <div className="min-h-screen bg-gray-50 py-8 sm:py-12">
      <SEOHead
        title={`Zakat al-Fitr ${year} — How Much to Pay and When`}
        description="Zakat al-Fitr is one sa’ of staple food per person, due before the Eid prayer. Work out what your household owes, and see where scholars differ on paying its value in cash."
        canonicalPath="/zakat-al-fitr-calculator"
        jsonLd={jsonLd}
      />
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-600 rounded-full mb-6">
            <Gift className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-heading font-bold text-gray-900 mb-4">
            Zakat al-Fitr {year} — How Much to Pay and When
          </h1>
          <p className="text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto">
            A measure of staple food for every person in the household, given before the Eid prayer
            at the end of Ramadan.
          </p>
        </div>

        <div className="space-y-6 sm:space-y-8">
          {/* 1. What it is */}
          <section className={CARD}>
            <h2 className={HEADING}>What Zakat al-Fitr is</h2>
            <p className={PROSE}>
              Zakat al-Fitr — often called fitrana or sadaqat al-fitr — is a small charge that falls
              due at the end of Ramadan, and it works quite differently from the annual zakat on
              wealth. It is not a percentage of what you own, it is not tied to a lunar year of
              ownership, and it is not measured against the nisab. It is a fixed measure of staple
              food, owed once, for every person in the household.
            </p>
            <p className={`${PROSE} mt-4`}>
              Because it is a per-person obligation, the size of your family determines the amount
              far more than the size of your savings does. It is due from anyone who has food beyond
              what their household needs for the day of Eid and the night before it, which brings in
              a great many people who owe no zakat on wealth at all. Its purpose is plain enough: it
              is meant to reach a poor family in time for them to eat well on the morning of Eid
              rather than at some point afterwards.
            </p>
          </section>

          {/* 2. How much */}
          <section className={CARD}>
            <h2 className={HEADING}>How much is due</h2>
            <p className={PROSE}>
              The measure is one sa’ per person. A sa’ is a volume measure from the prophetic
              period — four times a mudd, which is roughly two cupped handfuls — and converting it
              into modern weight depends on what you are measuring, since a sa’ of dates and a sa’ of
              wheat do not weigh the same. That is why you will see it given as a range rather than a
              single number: between about 2.5 and 3 kilograms of staple food is the usual
              conversion, and the calculator below works from the middle of that range.
            </p>
            <p className={`${PROSE} mt-4`}>
              The staple is whatever people actually eat where you live: wheat, rice, barley, dates,
              raisins, maize. There is no requirement to send a particular grain across the world,
              and nothing is gained by giving a food nobody in the area cooks with.
            </p>
          </section>

          {/* 3. The contested point, named and left open. */}
          <section className={CARD}>
            <h2 className={HEADING}>Food, or the money instead?</h2>
            <p className={PROSE}>
              <strong>This is the point on which scholars genuinely differ.</strong> Many hold that
              the value may be paid in cash rather than in grain: the obligation exists to meet a
              need on the day of Eid, money meets that need more flexibly than a sack of rice, and a
              family that already has rice may need something else entirely. This is the position
              most commonly associated with the Hanafi school, and it is how most charities,
              including this one, are set up to collect.
            </p>
            <p className={`${PROSE} mt-4`}>
              Other scholars hold that the obligation was specified as food and should be discharged
              as food. On this view the measure is not incidental to the ruling but part of it, and
              paying the value substitutes something for what was actually prescribed. Both positions
              have substantial support behind them, and this page does not choose between them. The
              calculator below will show you the measure in kilograms and the value in dollars side
              by side, so you can act on whichever position you follow.
            </p>
          </section>

          {/* Calculator Form — unchanged behaviour */}
          <div className="card bg-gray-50">
            <h2 className="text-2xl font-semibold text-gray-900 mb-6">Calculate your Zakat al-Fitr</h2>

            <div className="space-y-6">
              {/* Household Size */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Household Size (Number of People)
                </label>
                <input
                  type="number"
                  min="1"
                  value={householdSize}
                  onChange={(e) => setHouseholdSize(parseInt(e.target.value) || 1)}
                  className="input-field w-full max-w-xs"
                  placeholder="1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Include yourself and all dependants (spouse, children, elderly parents, etc.)
                </p>
              </div>

              {/* Calculation Method */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Payment Method
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
                      value="food"
                      checked={calculationMethod === 'food'}
                      onChange={() => setCalculationMethod('food')}
                      className="mr-3"
                    />
                    <span className="text-gray-700">Food (staple food such as wheat, rice or dates)</span>
                  </label>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Scholars differ on whether the value may be paid in place of the food. This choice
                  is yours to make; the calculator shows both the measure and the value either way.
                </p>
              </div>

              {/* Food Price Per Kg */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Price of Staple Food per Kilogram (in USD)
                </label>
                <div className="relative max-w-xs">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <DollarSign className="w-5 h-5 text-gray-400" />
                  </div>
                  <input
                    type="number"
                    min="0.5"
                    step="0.01"
                    value={foodPricePerKg}
                    onChange={(e) => setFoodPricePerKg(parseFloat(e.target.value) || 3)}
                    className="input-field pl-10 w-full"
                    placeholder="3.00"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  The price you pay locally for a staple food — wheat, rice, dates. We do not supply
                  one, because it is a local figure and only you know it.
                </p>
              </div>

              {/* Calculate Button */}
              <button
                onClick={calculateZakatAlFitr}
                className="btn-primary w-full sm:w-auto px-8 py-3 text-lg"
              >
                Calculate Zakat al-Fitr
              </button>
            </div>
          </div>

          {/* Results — unchanged */}
          {result && (
            <div className="card bg-green-50 border-green-200">
              <h2 className="text-2xl font-semibold text-gray-900 mb-6">Your Zakat al-Fitr Calculation</h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="bg-white rounded-lg p-4 text-center">
                  <Users className="w-8 h-8 text-primary-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-600 mb-1">Household Size</p>
                  <p className="text-2xl font-bold text-gray-900">{householdSize}</p>
                  <p className="text-xs text-gray-500 mt-1">person{householdSize > 1 ? 's' : ''}</p>
                </div>
                <div className="bg-white rounded-lg p-4 text-center">
                  <Gift className="w-8 h-8 text-green-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-600 mb-1">Per Person</p>
                  <p className="text-2xl font-bold text-gray-900">{result.perPerson.toFixed(2)} kg</p>
                  <p className="text-xs text-gray-500 mt-1">or ${(result.totalAmount / householdSize).toFixed(2)}</p>
                </div>
                <div className="bg-white rounded-lg p-4 text-center">
                  <DollarSign className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-600 mb-1">Total Amount</p>
                  <p className="text-2xl font-bold text-gray-900">${result.totalAmount.toFixed(2)}</p>
                  <p className="text-xs text-gray-500 mt-1">({result.totalKg.toFixed(2)} kg total)</p>
                </div>
              </div>

              <div className="bg-white rounded-lg p-4 mb-4">
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
                  to="/donate"
                  className="btn-primary flex items-center justify-center"
                >
                  Donate Now
                </Link>
                <button
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
            </div>
          )}

          {/* 4. Timing — the part people most often get wrong. */}
          <section className={CARD}>
            <div className="flex items-center mb-4">
              <AlertCircle className="w-6 h-6 text-primary-600 mr-3" aria-hidden="true" />
              <h2 className="text-2xl font-heading font-bold text-gray-900">
                When it has to be paid
              </h2>
            </div>
            <p className={PROSE}>
              Zakat al-Fitr has a deadline, and that is what makes it different from almost every
              other kind of giving on this site. It has to reach those entitled to it{' '}
              <strong>before the Eid prayer</strong>. Given after the prayer, the widely taught
              position is that it no longer counts as Zakat al-Fitr and is recorded as ordinary
              charity instead — the giving is not wasted, but the obligation has not been discharged
              in the way it was meant to be.
            </p>
            <p className={`${PROSE} mt-4`}>
              This is the part people most often get wrong, usually by leaving it to the morning
              itself. By then a transfer to a charity has almost no chance of turning into food on
              anyone’s table in time, which is the whole point of the exercise. Scholars differ on
              how early in Ramadan it may be paid — some permit it only in the last days, others from
              the beginning of the month — but there is no disagreement about the far end of the
              window. Paying two or three days ahead of Eid is the safe course, and most charities
              close their collection a day or so before for exactly that reason.
            </p>
          </section>

          {/* 5. A worked example — withheld whenever the page is withholding
              dollar figures, on the same rule as /nisab and /zakat-calculator. */}
          {showFigure && (
            <section className={CARD}>
              <h2 className={HEADING}>A worked example: a family of five</h2>
              <div className="flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
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
              <ul className="mt-4 space-y-2 text-gray-700">
                <li>
                  <strong>Per person:</strong> one sa’, taken at 2.75 kg — so 2.75 kg × $4 = $11.
                </li>
                <li>
                  <strong>For the household:</strong> 5 × 2.75 kg = 13.75 kg of rice, or 5 × $11 =
                  $55 if you are paying the value.
                </li>
              </ul>
              <p className={`${PROSE} mt-4`}>
                Both figures describe the same obligation: 13.75 kg of rice delivered, or $55 given
                so that someone can buy it. Which of the two discharges it is the question scholars
                differ on, set out above. Either way it needs to be in the recipients’ hands before
                the Eid prayer.
              </p>
            </section>
          )}

          {/* 6. Who receives it */}
          <section className={CARD}>
            <h2 className={HEADING}>Who receives it</h2>
            <p className={PROSE}>
              Zakat al-Fitr goes to the poor and needy — the same categories entitled to zakat, and
              in practice the first two of them. It is not given to your own parents, children or
              spouse, since supporting them is already your responsibility, and it is not used to
              pay for mosque running costs or general good causes. Giving it locally, so that it
              reaches a family who will eat on Eid morning in the community you are part of, is the
              commonly encouraged practice, though sending it where the need is greater is widely
              accepted too.
            </p>
            <Link
              to="/nisab"
              className="mt-4 text-primary-700 hover:text-primary-800 font-medium inline-flex items-center"
            >
              How the nisab works for zakat on wealth — a different obligation
              <ArrowRight className="ml-2 w-4 h-4" />
            </Link>
          </section>

          {/* 7. FAQ — the same text that goes into the FAQPage schema */}
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

          {/* 8. The disclaimer */}
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

export default ZakatAlFitrCalculator
