/**
 * /zakat-on-gold — what is due on bullion, coins and jewellery, and the one
 * point on which this page deliberately declines to rule.
 *
 * Two constraints carried over from /nisab and /zakat-calculator:
 *   - the nisab weight is read from the /api/nisab snapshot, never hardcoded.
 *     One definition of the mass, in one place, is what stopped the 85-versus-
 *     87.48 contradiction from coming back;
 *   - the worked example is gated on `hasUsableFigure`. The page must never
 *     print invented dollar arithmetic on the same screen where it has just
 *     declined to print a real figure.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Coins, Calculator, Info, Scale, ArrowRight } from 'lucide-react'
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

const KARATS = [
  { karat: '24k', purity: '99.9%', note: 'Bullion, investment bars and most coins.' },
  { karat: '22k', purity: '91.7%', note: 'Common in South Asian and Middle Eastern jewellery.' },
  { karat: '21k', purity: '87.5%', note: 'Widely used in Gulf jewellery.' },
  { karat: '18k', purity: '75.0%', note: 'Common in European and American jewellery.' },
  { karat: '14k', purity: '58.3%', note: 'Common in American jewellery.' },
]

const ZakatOnGold = () => {
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

  // The single gate on printing money anywhere on this page.
  const showFigure = loaded && hasUsableFigure(nisab)

  // The mass comes from the snapshot, which is the one definition of it. It
  // survives a stale price, because the method never expires; only an
  // unreachable endpoint leaves us without it, and then the page states the
  // method in words rather than falling back on a constant of its own.
  const goldGrams = nisab?.gold_grams ?? null

  const year = currentYear()

  const thresholdSentence =
    goldGrams !== null
      ? `${goldGrams} grams of gold, valued at the market price on the day you work it out`
      : 'a set weight of gold, valued at the market price on the day you work it out'

  const faqs = [
    {
      question: 'Is there zakat on gold jewellery I wear?',
      answer:
        'This is the one point on this page where scholars genuinely differ, and we do not adjudicate it. Many hold that jewellery in regular personal use is exempt, treating it as a personal effect in the same category as clothing, and some who take that view set a customary limit beyond which the excess becomes zakatable. Others hold that gold is zakatable by its nature regardless of what it is used for, and that an exemption for adornment would leave a great deal of real wealth untouched. Both positions are held by serious scholars, so follow the one your school or teacher takes.',
    },
    {
      question: 'How do I work out the weight of my gold?',
      answer:
        'Weigh it in grams on a jeweller’s scale or an accurate kitchen scale, item by item, and write the weights down so you can repeat the exercise next year. Many pieces are stamped with their karat, and a receipt or valuation certificate will usually give both the weight and the purity. If a piece has stones set in it, the stones are not gold and their weight should come out of the figure — a jeweller can tell you the gold-only weight.',
    },
    {
      question: 'Does the karat matter?',
      answer:
        'It matters for the valuation, because karat measures how much of the piece is actually gold: 24k is close to pure, 22k is about 91.7% gold, 18k is 75% and 14k is about 58.3%. The usual approach is to value each item at the market price for its own karat, or to convert it to its pure gold content and value that at the fine gold price. Weighing a 14k chain as though it were bullion would roughly double what you thought you owed, so it is worth sorting your pieces by karat before you start.',
    },
    {
      question: 'What is the nisab for gold?',
      answer: `The gold nisab is ${thresholdSentence}. If gold is all you hold, that weight sets the threshold your holding is measured against; if you also hold cash, savings or other zakatable assets, the whole total is measured against a single threshold rather than each asset being tested on its own. Which threshold to use — the gold one or the much lower silver one — is itself a question scholars differ on, and the nisab page sets out both.`,
    },
    {
      question: 'Do I pay zakat on gold I inherited?',
      answer:
        'Inherited gold is yours once the estate has been settled, and from that point it is treated like any other gold you own. The commonly taught position is that the lunar year runs from when you took ownership rather than from when the deceased acquired it, so the first zakat on it falls due a full lunar year after it came to you. If the estate is still unsettled, or the division is disputed, the position is less clear-cut and worth asking about.',
    },
    {
      question: 'What about gold held as an investment?',
      answer:
        'Gold bought to hold or to trade is zakatable, and there is no serious disagreement about it — the exemption some scholars extend to worn jewellery is argued from personal use, which does not apply here. That covers bars, coins, and gold held for you in an allocated account or vault. Gold-backed funds and ETFs are usually treated by reference to the metal behind them, though scholars differ on how to treat a product that settles in cash and never gives you a claim on physical metal.',
    },
  ]

  const jsonLd = [
    getBreadcrumbJsonLd([
      { name: 'Home', path: '/' },
      { name: 'Zakat on Gold', path: '/zakat-on-gold' },
    ]),
    getFaqJsonLd(faqs),
    getWebApplicationJsonLd({
      name: 'Zakat on Gold Calculator',
      description:
        'Work out the zakat due on gold bullion, coins and jewellery from its weight and karat, measured against the current gold nisab.',
      path: '/zakat-on-gold',
    }),
    getHowToJsonLd({
      name: 'How to calculate zakat on gold',
      description: 'Four steps from the gold in your drawer to the amount of zakat due on it.',
      steps: [
        {
          name: 'Sort your gold by karat',
          text: 'Put 24k bullion, 22k jewellery and 18k or 14k pieces into separate groups, since each is valued at a different price.',
        },
        {
          name: 'Weigh each group in grams',
          text: 'Use an accurate scale, and take out the weight of any stones, which are not gold.',
        },
        {
          name: 'Value it at today’s price per gram',
          text: 'Multiply the weight of each group by the price per gram for that karat, or convert each group to its pure gold content and value that at the fine gold price.',
        },
        {
          name: 'Compare against the nisab and pay 2.5%',
          text: `The gold threshold is ${thresholdSentence}. At or above it, 2.5% of the value is due; below it, no zakat is owed this year.`,
        },
      ],
    }),
  ]

  return (
    <div className="min-h-screen bg-gray-50 py-8 sm:py-12">
      <SEOHead
        title={`Zakat on Gold ${year} — How Much Do You Pay?`}
        description="Zakat on gold is 2.5% of its value once it has been held for a lunar year. See how to weigh and value bullion, coins and jewellery, and where scholars differ on worn jewellery."
        canonicalPath="/zakat-on-gold"
        jsonLd={jsonLd}
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-600 rounded-full mb-6">
            <Coins className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-heading font-bold text-gray-900 mb-4">
            Zakat on Gold {year} — How Much Do You Pay?
          </h1>
          <p className="text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto">
            Gold is zakatable at 2.5% of its value once it has been yours for a full lunar year. The
            work is in weighing it, valuing it by karat, and knowing which pieces to count.
          </p>
        </div>

        <div className="space-y-6 sm:space-y-8">
          {/* 1. The short answer */}
          <section className={CARD}>
            <h2 className={HEADING}>The short answer</h2>
            <p className={PROSE}>
              Zakat on gold is 2.5% of what the gold is worth today, not of what you paid for it, and
              it falls due once the gold has been in your possession for a full lunar year — a hawl,
              about 354 days — and your zakatable wealth sits at or above the nisab. Gold is measured
              by weight and purity rather than by the form it happens to take, so bullion, coins,
              bangles and a broken chain in a drawer are all treated the same way.
            </p>
            <p className={`${PROSE} mt-4`}>
              Once you are at or above the threshold the rate applies to the whole value, not only to
              the part above the line. Below the threshold, no zakat is due this year.
            </p>
          </section>

          {/* 2. Which gold counts — the contested point, named and left open. */}
          <section className={CARD}>
            <h2 className={HEADING}>Which gold counts</h2>
            <p className={PROSE}>
              Gold held as bullion, as bars, as coins or as an investment is zakatable, and there is
              no serious disagreement about it. The same goes for gold you are holding to sell, for
              scrap you have not got round to trading in, and for pieces kept in a safe deposit box
              rather than worn.
            </p>
            <p className={`${PROSE} mt-4`}>
              <strong>Jewellery in regular personal use is the contested case.</strong> Many scholars
              hold that it is exempt: it is a personal effect, used rather than accumulated, and
              belongs in the same category as clothing and household goods, which zakat does not
              reach. Some who take that view set a customary limit, so that jewellery beyond what is
              normal for a woman in her circumstances becomes zakatable on the excess. Other scholars
              hold that gold is zakatable by its nature whatever it is used for, and that carving out
              an exemption for adornment would leave a great deal of real wealth untouched while a
              saver holding the same value in cash pays in full.
            </p>
            <p className={`${PROSE} mt-4`}>
              Both positions are long-standing and both are held by serious scholars. This page does
              not choose between them. If you follow a particular school or teacher, follow their
              position; if you do not, this is exactly the sort of question worth putting to someone
              qualified before you do the arithmetic.
            </p>
          </section>

          {/* 3. Weighing and valuing */}
          <section className={CARD}>
            <h2 className={HEADING}>How to weigh and value it</h2>
            <p className={PROSE}>
              The method is the same for every piece: weight in grams, multiplied by today’s price
              per gram for that purity. Weigh each item on an accurate scale, and take out the weight
              of any stones, since a sapphire is not gold. Then sort the pieces by karat, because
              karat is what tells you how much of that weight is actually gold.
            </p>
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 uppercase tracking-wide text-xs">
                    <th className="py-2 pr-4 font-medium">Karat</th>
                    <th className="py-2 pr-4 font-medium">Gold content</th>
                    <th className="py-2 font-medium">Typically</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {KARATS.map((row) => (
                    <tr key={row.karat}>
                      <td className="py-2 pr-4 font-semibold text-gray-900">{row.karat}</td>
                      <td className="py-2 pr-4 text-gray-700">{row.purity}</td>
                      <td className="py-2 text-gray-600">{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={`${PROSE} mt-6`}>
              You can either value each group at the market price for its own karat, or convert each
              group to its pure gold content — the weight multiplied by the purity above — and value
              the whole lot at the fine gold price. The two routes give the same answer. What they
              both guard against is treating a 14k chain as though it were bullion, which would
              roughly double the figure you end up with.
            </p>
          </section>

          {/* 4. The threshold */}
          <section className={CARD}>
            <div className="flex items-center mb-4">
              <Scale className="w-6 h-6 text-primary-600 mr-3" aria-hidden="true" />
              <h2 className="text-2xl font-heading font-bold text-gray-900">
                Measuring it against the threshold
              </h2>
            </div>
            <p className={PROSE}>
              If gold is the only zakatable wealth you hold, it is measured against the gold nisab:{' '}
              {thresholdSentence}. Hold less than that and no zakat is due on it this year; hold that
              much or more and 2.5% of the value is due.
            </p>
            <p className={`${PROSE} mt-4`}>
              If you hold cash, savings or investments as well, the gold does not get a separate test
              of its own. Everything is added together and the total is measured against a single
              threshold, which is why a few grams of gold can matter even when the gold on its own
              would fall well short.
            </p>
            <p className={`${PROSE} mt-4`}>
              Which threshold applies — the gold one, or the considerably lower silver one — is a
              point on which scholars differ, and the choice can change the answer for anyone near
              the line.
            </p>
            <Link
              to="/nisab"
              className="mt-4 text-primary-700 hover:text-primary-800 font-medium inline-flex items-center"
            >
              How the nisab is worked out, with the current figures
              <ArrowRight className="ml-2 w-4 h-4" />
            </Link>
          </section>

          {/* 5. A worked example — withheld whenever the page is withholding
              dollar figures, so it never shows invented arithmetic on the same
              screen where it has just declined to print a real figure. */}
          {showFigure && goldGrams !== null && (
            <section className={CARD}>
              <h2 className={HEADING}>A worked example: 100 g of 22-karat gold</h2>
              <div className="flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
                <Info className="w-5 h-5 text-gray-500 shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-sm text-gray-600">
                  Illustrative only. The gold price below is a round invented number chosen to show
                  the arithmetic — it is not market data. Use the dated figures on the nisab page.
                </p>
              </div>
              <p className={PROSE}>
                Suppose you hold 100 grams of 22-karat jewellery, on the view that it is zakatable,
                and suppose fine gold is trading at an illustrative $100 a gram.
              </p>
              <ul className="mt-4 space-y-2 text-gray-700">
                <li>
                  <strong>Pure gold content:</strong> 100 g at 22 karat is 22 ÷ 24, or about 91.7%
                  gold — roughly 91.7 grams of fine gold.
                </li>
                <li>
                  <strong>Value:</strong> 91.7 g × $100 a gram = about $9,170.
                </li>
                <li>
                  <strong>The threshold that day:</strong> {goldGrams} g × $100 a gram = $
                  {(goldGrams * 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}.
                </li>
                <li>
                  <strong>Zakat due:</strong> $9,170 is above that threshold, so 2.5% of $9,170 is
                  about $229.
                </li>
              </ul>
              <p className={`${PROSE} mt-4`}>
                Notice how close those two numbers are. At an invented $100 a gram, 100 grams of 22k
                sits only a little above the threshold — which is why the real price on the day, and
                the karat of each piece, both move the answer more than you might expect.
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

          {/* 8. Through to the calculator */}
          <div className="text-center">
            <Link to="/zakat-calculator" className="btn-primary inline-flex items-center">
              <Calculator className="w-5 h-5 mr-2" />
              Work it out in the zakat calculator
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ZakatOnGold
