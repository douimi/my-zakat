/**
 * /nisab — the current zakat threshold, dated, with the method behind it.
 *
 * The page has two faces. When `hasUsableFigure` is true it leads with the
 * dollar figure and the date the price was taken. When it is false — a stale
 * price, or an unreachable endpoint — it prints no dollar amount anywhere on
 * the page, including in the worked example, and shows the method instead. A
 * wrong number carrying a date reads as authoritative; the absence of one at
 * least tells the truth.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Scale, Calculator, Coins, Wallet, Wheat, Info } from 'lucide-react'
import SEOHead from '../components/SEOHead'
import {
  fetchNisab,
  hasUsableFigure,
  formatNisabDate,
  formatUsd,
  type Nisab as NisabData,
} from '../utils/nisabApi'
import { currentYear, getBreadcrumbJsonLd, getFaqJsonLd } from '../utils/seo'

const CARD = 'bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8'
const HEADING = 'text-2xl font-heading font-bold text-gray-900 mb-4'
const PROSE = 'text-gray-700 leading-relaxed'

const CALCULATORS = [
  {
    path: '/zakat-calculator',
    name: 'Zakat Calculator',
    blurb: 'Total your cash, gold, investments and business assets, and see whether they clear the threshold.',
    icon: Calculator,
  },
  {
    path: '/zakat-on-gold',
    name: 'Zakat on Gold',
    blurb: 'Work out what is due on jewellery and bullion from its weight and purity.',
    icon: Coins,
  },
  {
    path: '/zakat-al-fitr-calculator',
    name: 'Zakat al-Fitr Calculator',
    blurb: 'The per-person charity due before the Eid prayer at the end of Ramadan.',
    icon: Wheat,
  },
  {
    path: '/kaffarah-calculator',
    name: 'Kaffarah Calculator',
    blurb: 'Expiation for a deliberately broken fast or oath, costed by the number of days.',
    icon: Wallet,
  },
]

const Nisab = () => {
  const [nisab, setNisab] = useState<NisabData | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    fetchNisab().then((data) => {
      if (!active) return
      setNisab(data)
      setLoaded(true)
    })
    return () => {
      active = false
    }
  }, [])

  // The single gate on printing money. Nothing else on this page may decide it.
  const showFigure = loaded && hasUsableFigure(nisab)

  const year = currentYear()

  const howMuchAnswer = showFigure
    ? 'There is no fixed figure for the year: the nisab tracks the gold and silver markets, so it moves whenever they do. The current thresholds, together with the date the prices behind them were taken, are shown at the top of this page. We publish them only while the underlying price is recent enough for us to vouch for.'
    : 'There is no fixed figure for the year: the nisab tracks the gold and silver markets, so it moves whenever they do. We are not showing a dollar amount right now because we do not hold a price recent enough to vouch for. To work it out yourself, multiply 87.48 g of gold — or 612.36 g of silver — by today’s price per gram.'

  const faqs = [
    {
      question: 'What is the nisab for zakat?',
      answer:
        'Nisab is the minimum amount of wealth a Muslim must hold before zakat becomes due on it. If your qualifying wealth stays at or above that threshold for a full lunar year, zakat is due at 2.5% of it; below the threshold, nothing is owed. The threshold is not a fixed sum of money — it is defined as the value of a set weight of gold or of silver, so it moves with those markets.',
    },
    {
      question: 'Is the nisab based on gold or silver?',
      answer:
        'Both are in use, and there is no single agreed answer on which one to apply. The silver threshold is much the lower of the two, so it brings more people into zakat and more wealth to those entitled to receive it, and many scholars prefer it for that reason. Others hold that gold is the sounder benchmark today, on the grounds that silver has lost a great deal of value against everyday goods since the two were set as equivalents. If you follow a particular school or teacher, follow their position.',
    },
    {
      question: `How much is the nisab in ${year}?`,
      answer: howMuchAnswer,
    },
    {
      question: 'Does the nisab change?',
      answer:
        'Yes, continuously. Because it is defined as the value of a weight of metal rather than as a sum of money, it rises and falls with the gold and silver markets, and it can differ noticeably from one year to the next. That is why any threshold you read should carry the date it was taken, and why a figure from last year is not a safe substitute for today’s.',
    },
    {
      question: 'Do I pay zakat if I am just below the nisab?',
      answer:
        'No. Zakat is not due on wealth that stays below the threshold — that is what the threshold is for. Voluntary charity, sadaqa, remains open to you at any level of wealth and is encouraged. If you are close to the line it is worth noting that the silver threshold is the lower of the two, so which one you follow can change the answer.',
    },
    {
      question: 'Does the nisab apply per person or per household?',
      answer:
        'Zakat is assessed per person, on the wealth that each individual owns, rather than on a household total. A husband and wife would each measure their own qualifying wealth against the nisab separately instead of pooling it, and jointly owned assets are generally counted by each owner’s share. Where finances are genuinely intermingled the picture is less clear-cut, so ask a scholar how to divide them.',
    },
  ]

  const jsonLd = [
    getBreadcrumbJsonLd([
      { name: 'Home', path: '/' },
      { name: 'Nisab', path: '/nisab' },
    ]),
    getFaqJsonLd(faqs),
  ]

  return (
    <div className="min-h-screen bg-gray-50 py-8 sm:py-12">
      <SEOHead
        title={`Nisab ${year} — Current Gold & Silver Threshold for Zakat`}
        description="The nisab is the minimum wealth at which zakat becomes due. See the current gold and silver thresholds in USD, the date they were taken, and how they are worked out."
        canonicalPath="/nisab"
        jsonLd={jsonLd}
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-600 rounded-full mb-6">
            <Scale className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-heading font-bold text-gray-900 mb-4">
            Nisab: the threshold at which zakat becomes due
          </h1>
          <p className="text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto">
            The nisab is defined as the value of a fixed weight of gold or of silver, so it has no
            fixed dollar value — it moves with the metal markets.
          </p>
        </div>

        <div className="space-y-6 sm:space-y-8">
          {/* 1. The figure, first */}
          <section
            className="bg-primary-50 rounded-xl shadow-sm border border-primary-200 p-6 sm:p-8"
            aria-labelledby="current-threshold"
          >
            <h2 id="current-threshold" className="text-xl font-heading font-bold text-gray-900 mb-6">
              The current threshold
            </h2>

            {!loaded && (
              <p className={PROSE}>Checking the latest gold and silver prices…</p>
            )}

            {loaded && showFigure && nisab && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  <div className="bg-white rounded-lg border border-gray-200 p-5">
                    <p className="text-sm font-medium uppercase tracking-wide text-gray-500 mb-1">
                      Gold nisab
                    </p>
                    <p className="text-3xl font-bold text-gray-900">
                      {formatUsd(nisab.nisab_gold_usd as number)}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">87.48 g of gold</p>
                  </div>
                  <div className="bg-white rounded-lg border border-gray-200 p-5">
                    <p className="text-sm font-medium uppercase tracking-wide text-gray-500 mb-1">
                      Silver nisab
                    </p>
                    <p className="text-3xl font-bold text-gray-900">
                      {formatUsd(nisab.nisab_silver_usd as number)}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">612.36 g of silver</p>
                  </div>
                </div>
                <p className="text-sm text-gray-600 mt-4">
                  as of {formatNisabDate(nisab.as_of)}
                </p>
              </>
            )}

            {loaded && !showFigure && (
              <>
                <p className={PROSE}>
                  We show the threshold in dollars only when we have a price we can vouch for. Right
                  now we do not, so here is the method instead — work it out against today’s gold or
                  silver price.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mt-6">
                  <div className="bg-white rounded-lg border border-gray-200 p-5">
                    <p className="text-sm font-medium uppercase tracking-wide text-gray-500 mb-1">
                      Gold nisab
                    </p>
                    <p className="text-2xl font-bold text-gray-900">87.48 g of gold</p>
                  </div>
                  <div className="bg-white rounded-lg border border-gray-200 p-5">
                    <p className="text-sm font-medium uppercase tracking-wide text-gray-500 mb-1">
                      Silver nisab
                    </p>
                    <p className="text-2xl font-bold text-gray-900">612.36 g of silver</p>
                  </div>
                </div>
              </>
            )}
          </section>

          {/* 2. What the nisab is */}
          <section className={CARD}>
            <h2 className={HEADING}>What the nisab is</h2>
            <p className={PROSE}>
              Nisab is the minimum amount of wealth a Muslim must hold, for a full lunar year, before
              zakat becomes due on it. Below the nisab, no zakat is owed. At or above it, zakat is
              due at 2.5% of the qualifying wealth.
            </p>
            <p className={`${PROSE} mt-4`}>
              The threshold is not a fixed sum of money. It is defined as the value of a fixed weight
              of gold or of silver, so it moves with the metal markets.
            </p>
          </section>

          {/* 3. How it is worked out */}
          <section className={CARD}>
            <h2 className={HEADING}>How it is worked out</h2>
            <p className={PROSE}>
              We use 87.48 grams of gold and 612.36 grams of silver — the same threshold our zakat
              calculator measures against. Multiply the weight by today’s price per gram and you have
              the threshold in your own currency.
            </p>
            <p className={`${PROSE} mt-4`}>
              These weights are not the only ones in circulation. They are the Hanafi conversion of
              20 mithqal of gold and 200 dirhams of silver; another convention in common use rounds
              the same measures to 85 grams and 595 grams respectively. The difference is small in
              practice, but it is real, and a site that showed one figure without mentioning the
              other would be hiding a genuine disagreement.
            </p>
          </section>

          {/* 4. Gold or silver? */}
          <section className={CARD}>
            <h2 className={HEADING}>Gold or silver?</h2>
            <p className={PROSE}>
              Scholars differ on which threshold to use. The silver nisab is far lower, so it brings
              more people into zakat and more wealth to those entitled to it; many scholars prefer it
              for that reason. Others hold that gold is the sounder benchmark today, on the grounds
              that silver’s value relative to everyday goods has fallen a long way since the two
              thresholds were set as equivalents.
            </p>
            <p className={`${PROSE} mt-4`}>
              If you want to be cautious, use the silver threshold: it is the lower of the two, so it
              errs towards paying zakat rather than withholding it. If you follow a particular school
              or teacher, follow their position.
            </p>
          </section>

          {/* 5. A worked example — withheld whenever the page is withholding
              dollar figures, so the page never mixes made-up money with a
              missing real one. */}
          {showFigure && (
            <section className={CARD}>
              <h2 className={HEADING}>A worked example</h2>
              <div className="flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
                <Info className="w-5 h-5 text-gray-500 shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-sm text-gray-600">
                  Illustrative only. The round numbers below are invented to show the arithmetic —
                  they are not market data. Use the dated figures at the top of this page.
                </p>
              </div>
              <p className={PROSE}>
                Suppose the silver nisab works out at $640 and you hold $4,000 in savings that you
                have had for a full lunar year. $4,000 is above $640, so zakat is due: 2.5% of $4,000
                is $100.
              </p>
            </section>
          )}

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

          {/* 8. The calculators */}
          <section className={CARD}>
            <h2 className={HEADING}>Work out what you owe</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {CALCULATORS.map((calc) => (
                <Link
                  key={calc.path}
                  to={calc.path}
                  className="flex items-start gap-3 rounded-lg border border-gray-200 p-4 hover:border-primary-400 hover:bg-primary-50 transition-colors"
                >
                  <calc.icon className="w-5 h-5 text-primary-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>
                    <span className="block font-semibold text-gray-900">{calc.name}</span>
                    <span className="block text-sm text-gray-600 mt-1">{calc.blurb}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default Nisab
