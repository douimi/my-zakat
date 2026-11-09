/**
 * /zakat-calculator — the calculator, plus the content that makes it findable.
 *
 * The page used to seed its gold and silver price fields from two hardcoded
 * constants. Every figure it produced was therefore built on a guess wearing a
 * comment that told the user to go and check the real rate elsewhere. The
 * prices now come from /api/nisab at render time, and when we do not hold a
 * price we can vouch for the fields start empty and say so. There is no
 * fallback price, under any name: a made-up price produces a made-up zakat
 * figure, and that is worse than an empty box.
 */
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { Calculator, DollarSign, TrendingUp, Info, ArrowRight, CheckCircle, AlertCircle, X, RotateCcw, Scale } from 'lucide-react'
import { donationsAPI } from '../utils/api'
import type { ZakatCalculation, ZakatResult } from '../types'
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
import {
  currentYear,
  getBreadcrumbJsonLd,
  getFaqJsonLd,
  getWebApplicationJsonLd,
  getHowToJsonLd,
} from '../utils/seo'

const PRICE_HINT = "Enter today's price per gram"

/**
 * The price fields are `<input type="number" step="0.01">`, and the snapshot
 * carries four decimals. A value like 95.1234 is a stepMismatch, so the browser
 * refuses to submit the form and the handler never runs — on the one path that
 * only exists when we *do* hold a live price. Rounding to cents rather than
 * loosening the step keeps the field validating what it is there to validate;
 * a hundredth of a cent per gram is far below the precision anyone reads off
 * this form, and the user can still type a finer figure if they want one.
 */
const toCents = (price: number) => Math.round(price * 100) / 100

const HEADING = 'text-2xl font-heading font-bold text-gray-900 mb-4'
const PROSE = 'text-gray-700 leading-relaxed'

const formatUSD = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)

const ZakatCalculator = () => {
  const [result, setResult] = useState<ZakatResult | null>(null)
  const [isCalculating, setIsCalculating] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [showResultModal, setShowResultModal] = useState(false)
  const [nisab, setNisab] = useState<NisabData | null>(null)
  const [nisabLoaded, setNisabLoaded] = useState(false)
  const navigate = useNavigate()

  // No price defaults. A field we cannot fill honestly starts empty.
  const { register, handleSubmit, watch, reset, setValue } = useForm<ZakatCalculation>({
    defaultValues: {
      liabilities: 0,
      cash: 0,
      receivables: 0,
      stocks: 0,
      retirement: 0,
      gold_weight: 0,
      silver_weight: 0,
      business_goods: 0,
      agriculture_value: 0,
      investment_property: 0,
      other_valuables: 0,
      livestock: 0,
      other_assets: 0,
    },
  })

  useEffect(() => {
    let cancelled = false
    void fetchNisab().then((snapshot) => {
      if (cancelled) return
      setNisab(snapshot)
      setNisabLoaded(true)
      // Seed the price inputs only from a figure we can vouch for. Falling
      // back to a hardcoded price is how this page used to produce confident
      // numbers from a guess.
      if (hasUsableFigure(snapshot) && snapshot) {
        setValue('gold_price_per_gram', toCents(snapshot.gold_price_per_gram_usd as number))
        setValue('silver_price_per_gram', toCents(snapshot.silver_price_per_gram_usd as number))
      }
    })
    return () => {
      cancelled = true
    }
  }, [setValue])

  // The result dialog closes on Escape, like every other dialog on the site.
  useEffect(() => {
    if (!showResultModal) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowResultModal(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [showResultModal])

  // The single gate on printing money anywhere on this page.
  const showFigure = nisabLoaded && hasUsableFigure(nisab)

  const goldPrice = watch('gold_price_per_gram')
  const hasGoldPrice = typeof goldPrice === 'number' && Number.isFinite(goldPrice) && goldPrice > 0

  // The weights come from the /api/nisab snapshot, which is the one definition
  // of them; they survive staleness, because the method never expires. Only an
  // unreachable endpoint leaves us without them, and then the page says the
  // method in words rather than falling back on a constant of its own.
  const goldGrams = nisab?.gold_grams ?? null
  const silverGrams = nisab?.silver_grams ?? null
  const currentNisab = hasGoldPrice && goldGrams !== null ? goldGrams * goldPrice : null
  const usingLivePrice =
    showFigure && Boolean(nisab) && goldPrice === nisab?.gold_price_per_gram_usd

  const year = currentYear()

  // The masses are stated as ours, so they are read from the snapshot rather
  // than written into the prose: nisab.gold_grams is a setting precisely so the
  // foundation can follow the other convention without a code change, and a
  // hardcoded "87.48" here would contradict the figure the moment it did. They
  // survive staleness — the method never expires — so nothing gates them.
  const goldGramsText = goldGrams !== null ? `${goldGrams} grams` : 'a set weight of gold'
  const silverGramsText = silverGrams !== null ? `${silverGrams} grams` : 'a set weight of silver'
  const massSentence =
    goldGrams !== null && silverGrams !== null
      ? `The threshold set by ${goldGrams} g of gold or ${silverGrams} g of silver at today’s price.`
      : 'The threshold set by a fixed weight of gold — or of silver — at today’s price.'

  const reseedPrices = () => {
    if (hasUsableFigure(nisab) && nisab) {
      setValue('gold_price_per_gram', toCents(nisab.gold_price_per_gram_usd as number))
      setValue('silver_price_per_gram', toCents(nisab.silver_price_per_gram_usd as number))
    }
  }

  const onSubmit = async (data: ZakatCalculation) => {
    setSubmitError(null)

    // An empty price field is not a price of zero. Holding metal but sending a
    // blank price would silently drop it out of the total.
    const missingGoldPrice = data.gold_weight > 0 && !(data.gold_price_per_gram > 0)
    const missingSilverPrice = data.silver_weight > 0 && !(data.silver_price_per_gram > 0)
    if (missingGoldPrice || missingSilverPrice) {
      setSubmitError(
        'Add a price per gram for the metal you hold. We will not substitute a price of our own.',
      )
      return
    }

    // Blank number inputs read back as NaN; send zero rather than null.
    const payload: ZakatCalculation = { ...data }
    ;(Object.keys(payload) as (keyof ZakatCalculation)[]).forEach((key) => {
      if (!Number.isFinite(payload[key])) payload[key] = 0
    })

    setIsCalculating(true)
    try {
      const calculationResult = await donationsAPI.calculateZakat(payload)
      setResult(calculationResult)
      setShowResultModal(true)
    } catch (error: any) {
      const detail = error?.response?.data?.detail
      if (Array.isArray(detail)) {
        setSubmitError('Please make sure all values are non-negative numbers.')
      } else {
        setSubmitError(detail || 'Could not calculate Zakat. Please try again.')
      }
    } finally {
      setIsCalculating(false)
    }
  }

  // Field definition: `unit` distinguishes USD ($) from grams (g)
  type FieldDef = { name: keyof ZakatCalculation; label: string; placeholder: string; unit: 'usd' | 'grams' }

  // Assets first, then what you owe: the order people think in. (Liabilities
  // used to come first.) Field names are unchanged.
  const formSections: { title: string; icon: typeof TrendingUp; note?: string | null; fields: FieldDef[] }[] = [
    {
      title: 'Cash & Liquid Assets',
      icon: DollarSign,
      fields: [
        { name: 'cash', label: 'Cash in Hand / Bank', placeholder: '0.00', unit: 'usd' },
        { name: 'receivables', label: 'Money Owed to You', placeholder: '0.00', unit: 'usd' },
        { name: 'stocks', label: 'Stocks & Bonds', placeholder: '0.00', unit: 'usd' },
        { name: 'retirement', label: 'Retirement Funds', placeholder: '0.00', unit: 'usd' },
      ],
    },
    {
      title: 'Precious Metals',
      icon: Calculator,
      note: showFigure
        ? null
        : 'Live gold and silver prices are temporarily unavailable, so these two fields have been left'
          + " blank rather than filled with a guess — enter today's price per gram from a source you trust.",
      fields: [
        { name: 'gold_weight', label: 'Gold Weight (grams)', placeholder: '0', unit: 'grams' },
        { name: 'gold_price_per_gram', label: 'Gold Price per Gram', placeholder: showFigure ? '0.00' : PRICE_HINT, unit: 'usd' },
        { name: 'silver_weight', label: 'Silver Weight (grams)', placeholder: '0', unit: 'grams' },
        { name: 'silver_price_per_gram', label: 'Silver Price per Gram', placeholder: showFigure ? '0.00' : PRICE_HINT, unit: 'usd' },
      ],
    },
    {
      title: 'Business & Investments',
      icon: TrendingUp,
      fields: [
        { name: 'business_goods', label: 'Business Inventory / Goods', placeholder: '0.00', unit: 'usd' },
        { name: 'agriculture_value', label: 'Agricultural Produce', placeholder: '0.00', unit: 'usd' },
        { name: 'investment_property', label: 'Investment Property (held for resale)', placeholder: '0.00', unit: 'usd' },
        { name: 'livestock', label: 'Livestock Value', placeholder: '0.00', unit: 'usd' },
      ],
    },
    {
      title: 'Other Assets',
      icon: DollarSign,
      fields: [
        { name: 'other_valuables', label: 'Other Valuable Assets', placeholder: '0.00', unit: 'usd' },
        { name: 'other_assets', label: 'Miscellaneous Assets', placeholder: '0.00', unit: 'usd' },
      ],
    },
    {
      title: 'Liabilities & Debts',
      icon: TrendingUp,
      fields: [
        { name: 'liabilities', label: 'Total Debts & Liabilities', placeholder: '0.00', unit: 'usd' },
      ],
    },
  ]

  const showDonateButton = result && result.meets_nisab === true && result.total >= 1

  /**
   * The gate on printing a threshold beside a result.
   *
   * `showFigure` governs the figures this page sources itself; a result is
   * gated on the result's own field instead, because the threshold there may
   * rest on a price the user typed — a price we can attribute, even though it
   * is not ours. What it can never rest on is a price nobody supplied: the
   * backend returns a null threshold and a null verdict for that, and the two
   * branches below become three so the page states the method rather than an
   * invented number.
   */
  const resultThreshold = result != null && result.nisab_threshold != null ? result.nisab_threshold : null

  const faqs = [
    {
      question: 'How much zakat do I pay?',
      answer:
        'The rate for zakat al-mal is 2.5% of the qualifying wealth you have held for a full lunar year, and it applies to the whole of that wealth rather than only to the part above the threshold. The arithmetic is simply your net qualifying total multiplied by 0.025. Produce from the land is treated differently, at 5% or 10% depending on how the crop was irrigated, and livestock is counted by head against its own tables rather than by value.',
    },
    {
      question: 'What counts as zakatable wealth?',
      answer:
        'Broadly, wealth that grows or is held as a store of value: cash, money you have lent out and expect back, gold and silver in any form, shares and funds, accessible retirement balances, stock held for sale, and property bought to resell. Personal belongings are not counted, and neither is the home you live in, the car you drive or the tools you work with.',
    },
    {
      question: 'Do I subtract my debts before calculating zakat?',
      answer:
        'Scholars differ on this, and the difference is real. Many hold that debts immediately due — this month’s rent, an overdue bill — come off your zakatable wealth before the 2.5% is applied. Others hold that a long-term debt such as a mortgage is not deducted in full, since setting a twenty-year liability against a single year’s wealth would remove almost everyone from zakat, and deduct only the instalments due within the year. We do not adjudicate between them; ask a scholar you trust.',
    },
    {
      question: 'Does zakat apply to my house or my car?',
      answer:
        'Not where they are for your own use. The home you live in, the car you drive, your furniture and your clothes are personal necessities, and the common position is that no zakat is due on them however much they are worth. The picture changes when the same asset is held for gain: a second property bought to resell is trading stock and is zakatable at its value, and scholars differ over how a building held to rent out should be treated.',
    },
    {
      question: 'When is zakat due?',
      answer:
        'Zakat falls due once a full lunar year — a hawl, roughly 354 days — has passed over wealth that has stayed at or above the nisab. The date is personal to you: the anniversary of the day your wealth first reached the threshold, not a fixed date in the calendar. Many people set that anniversary in Ramadan so it is easy to remember, and paying early is widely accepted.',
    },
    {
      question: 'What if my wealth went up and down during the year?',
      answer:
        'Fluctuation during the year does not break the hawl, so long as your wealth did not fall below the nisab. The commonly taught approach is to compare against the threshold at the start and the end of the year, ignore the peaks and troughs between, and pay 2.5% of what you actually hold on your anniversary. If your wealth did drop below the nisab and later rose above it, many scholars hold that a new lunar year begins from the day it crossed back.',
    },
  ]

  const jsonLd = [
    getBreadcrumbJsonLd([
      { name: 'Home', path: '/' },
      { name: 'Zakat Calculator', path: '/zakat-calculator' },
    ]),
    getFaqJsonLd(faqs),
    getWebApplicationJsonLd({
      name: 'Zakat Calculator',
      description:
        'A free zakat calculator that totals your cash, gold, silver, investments and business assets, compares them against the current nisab, and works out the 2.5% due.',
      path: '/zakat-calculator',
    }),
    getHowToJsonLd({
      name: 'How to calculate your zakat',
      description:
        'Four steps from your assets to the amount of zakat due, using the current nisab threshold.',
      steps: [
        {
          name: 'Add up your zakatable assets',
          text: 'Cash, savings, gold, silver, investments held for resale, and business stock.',
        },
        {
          name: 'Subtract what you owe',
          text: 'Immediate debts that are due.',
        },
        {
          name: 'Compare the total against the nisab',
          text: massSentence,
        },
        {
          name: 'Pay 2.5% if you are at or above it',
          text: 'And if you are below, no zakat is due this year.',
        },
      ],
    }),
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <SEOHead
        title={`Zakat Calculator ${year} — How Much Zakat Do I Owe?`}
        description="Work out what zakat you owe. Enter your cash, savings, gold, silver, investments and business assets, and see them compared against the current nisab threshold."
        canonicalPath="/zakat-calculator"
        jsonLd={jsonLd}
      />

      <PageHeader
        title={`Zakat Calculator ${year} — How Much Zakat Do I Owe?`}
        description="Total your cash, gold, investments and business assets, see them measured against the current nisab, and find the 2.5% that is due."
      />

      <div className="section-container py-8 sm:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Calculator Form */}
          <div className="lg:col-span-2">
            <div className="card">
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
                {formSections.map((section) => (
                  <div key={section.title} className="border-b border-gray-200 pb-8 last:border-b-0">
                    <div className="flex items-center mb-6">
                      <section.icon className="w-5 h-5 text-primary-600 me-3" aria-hidden="true" />
                      <h2 className="text-lg font-semibold text-gray-900">{section.title}</h2>
                    </div>

                    {section.note && (
                      <div className="alert-warning mb-6">
                        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                        <p>{section.note}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {section.fields.map((field) => (
                        <div key={field.name}>
                          <label htmlFor={`zakat-${field.name}`} className="label">
                            {field.label}
                          </label>
                          <div className="relative">
                            <div className="absolute inset-y-0 start-0 ps-3 flex items-center pointer-events-none">
                              <span className="text-gray-500 text-sm">
                                {field.unit === 'usd' ? '$' : 'g'}
                              </span>
                            </div>
                            <input
                              id={`zakat-${field.name}`}
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder={field.placeholder}
                              {...register(field.name, { valueAsNumber: true, min: 0 })}
                              className="input-field ps-7"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {submitError && (
                  <div className="alert-error" role="alert">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{submitError}</span>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-4">
                  <button
                    type="submit"
                    disabled={isCalculating}
                    className="btn-primary flex-1 gap-2"
                  >
                    {isCalculating ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        Calculating...
                      </>
                    ) : (
                      <>
                        <Calculator className="w-5 h-5" aria-hidden="true" />
                        Calculate Zakat
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      reset()
                      reseedPrices()
                      setResult(null)
                      setSubmitError(null)
                      setShowResultModal(false)
                    }}
                    className="btn-secondary flex-1"
                  >
                    Reset Calculator
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* What the total is being measured against — shown above the
                result, so the threshold is never implicit. */}
            <div className="card">
              <div className="flex items-center mb-4">
                <Scale className="w-5 h-5 text-primary-600 me-3" aria-hidden="true" />
                <h2 className="text-lg font-semibold text-gray-900">What your total is compared against</h2>
              </div>

              {!nisabLoaded && (
                <p className="text-sm text-gray-700">Checking the latest gold and silver prices…</p>
              )}

              {nisabLoaded && (
                <div className="space-y-3 text-sm text-gray-700">
                  {currentNisab !== null ? (
                    <p>
                      Compared against the gold nisab of {formatUSD(currentNisab)} — {goldGrams} grams
                      of gold at {formatUSD(goldPrice)} a gram.
                    </p>
                  ) : goldGrams !== null ? (
                    <p>
                      We hold no gold price we can vouch for, so there is no threshold to show yet. The
                      nisab is {goldGrams} grams of gold, or {silverGrams} grams of silver, valued at the
                      market price on the day you work it out.
                    </p>
                  ) : (
                    <p>
                      We could not reach the figures behind the threshold, so there is none to show
                      here. The nisab is a set weight of gold — or of silver — valued at the market
                      price on the day you work it out; the nisab page sets out both weights.
                    </p>
                  )}

                  {usingLivePrice && (
                    <p>Live gold and silver prices, as of {formatNisabDate(nisab?.as_of ?? null)}.</p>
                  )}

                  {nisabLoaded && !usingLivePrice && hasGoldPrice && (
                    <p>That uses the price you entered, not a live figure of ours.</p>
                  )}

                  {showFigure && nisab && (
                    <p>
                      Many scholars use the silver threshold instead, which is the lower of the two:{' '}
                      {formatUsd(nisab.nisab_silver_usd as number)} for {nisab.silver_grams} grams of silver. Which
                      threshold applies to you is a point on which scholars differ.
                    </p>
                  )}

                  <Link to="/nisab" className="link inline-flex items-center">
                    How the nisab is worked out
                    <ArrowRight className="ms-2 w-4 h-4" aria-hidden="true" />
                  </Link>
                </div>
              )}
            </div>

            {/* Results */}
            {result && (
              <div className="card-tinted" aria-live="polite">
                <div className="mb-6">
                  <h2 className="text-xl font-heading font-bold text-gray-900 mb-1">Your Zakat Calculation</h2>
                  <p className="text-gray-600 text-sm">Based on your provided information</p>
                </div>

                {/* Nisab status banner */}
                {resultThreshold === null ? (
                  <div className="alert-warning mb-4">
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <p className="font-semibold mb-1">No threshold to compare against</p>
                      <p>
                        Your net zakatable wealth is {formatUSD(result.net_zakatable)}. We are not
                        showing a threshold because no gold price was entered and we hold none we
                        can vouch for — we will not invent one. The nisab is {goldGramsText} of
                        gold, or {silverGramsText} of silver, at the market price on the day you
                        work it out.
                      </p>
                    </div>
                  </div>
                ) : !result.meets_nisab ? (
                  <div className="alert-warning mb-4">
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <p className="font-semibold mb-1">Below Nisab — no Zakat is due</p>
                      <p>
                        Your net zakatable wealth ({formatUSD(result.net_zakatable)}) is below the
                        current Nisab threshold of {formatUSD(resultThreshold)}.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="alert-success mb-4">
                    <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <p className="font-semibold mb-1">Above Nisab — Zakat is due</p>
                      <p>
                        Net zakatable: {formatUSD(result.net_zakatable)} • Nisab: {formatUSD(resultThreshold)}
                      </p>
                    </div>
                  </div>
                )}

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center py-2 border-b border-primary-100">
                    <span className="text-gray-700">Wealth Zakat:</span>
                    <span className="font-semibold text-gray-900">{formatUSD(result.wealth)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-primary-100">
                    <span className="text-gray-700">Gold Zakat:</span>
                    <span className="font-semibold text-gray-900">{formatUSD(result.gold)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-primary-100">
                    <span className="text-gray-700">Silver Zakat:</span>
                    <span className="font-semibold text-gray-900">{formatUSD(result.silver)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-primary-100">
                    <span className="text-gray-700">Business Zakat:</span>
                    <span className="font-semibold text-gray-900">{formatUSD(result.business_goods)}</span>
                  </div>
                  {/* No rate in the label: the rate on produce is 5% or 10%
                      depending on irrigation (see the FAQ). */}
                  <div className="flex justify-between items-center py-2 border-b border-primary-100">
                    <span className="text-gray-700">Agriculture Zakat:</span>
                    <span className="font-semibold text-gray-900">{formatUSD(result.agriculture)}</span>
                  </div>
                  <div className="flex justify-between items-center py-4 bg-white rounded-lg px-4 mt-4">
                    <span className="text-base font-bold text-gray-900">Total Zakat Due:</span>
                    <span className="text-2xl font-bold text-primary-700">{formatUSD(result.total)}</span>
                  </div>
                </div>

                {/* While the result dialog is open it carries the same link;
                    one at a time, so there is never a hidden duplicate. */}
                {showDonateButton && !showResultModal && (
                  <div className="mt-6">
                    <Link
                      to={`/donate?zakat_amount=${result.total.toFixed(2)}`}
                      className="btn-primary w-full gap-2"
                    >
                      Pay Zakat Now
                      <ArrowRight className="w-5 h-5" aria-hidden="true" />
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ------------------------------------------------------------------
            The content. Written to the editorial rules: it states what is
            agreed, names what is not, and rules on nothing. Folded under the
            tool; the text stays in the DOM (and in the FAQ schema).
           ------------------------------------------------------------------ */}
        <div className="max-w-4xl mt-12 sm:mt-16 space-y-8">
          <section aria-labelledby="zakat-how-it-works" className="space-y-3">
            <h2 id="zakat-how-it-works" className={HEADING}>How it works</h2>

            <Disclosure
              title="What this calculator covers — and what it does not"
              summary="Zakat on wealth only, not zakat al-Fitr or livestock tables"
            >
              <p className={PROSE}>
                This works out zakat al-mal: the annual charge on wealth you have held for a full lunar
                year. It takes cash, money owed to you, shares and funds, retirement savings, gold and
                silver by weight, business stock, property bought to resell, agricultural produce and
                livestock value, subtracts your liabilities, and applies the rate to what is left.
              </p>
              <p className={PROSE}>
                It does not cover zakat al-fitr, the per-person amount due before the Eid prayer at the
                end of Ramadan, and it does not apply the detailed livestock tables, which count animals
                by head and species rather than by value. It also cannot know which school you follow, so
                treat the number it gives as a starting point rather than a verdict.
              </p>
            </Disclosure>

            <Disclosure title="The rule in plain language" summary="2.5%, after a lunar year above the nisab">
              <p className={PROSE}>
                Zakat is due at 2.5% of qualifying wealth once two conditions are met. The first is time:
                the wealth must have been yours for a full lunar year — a hawl, about 354 days, not 365.
                The second is amount: it must sit at or above the nisab, the threshold defined by the
                value of a set weight of gold or of silver.
              </p>
              <p className={PROSE}>
                At or above the threshold, the 2.5% applies to the whole of that wealth, not only to the
                part above the line. Below it, no zakat is due this year.
              </p>
            </Disclosure>

            <Disclosure
              title="What counts, and what does not"
              summary="Cash, gold, shares, business stock; not your home or car"
            >
              <p className={PROSE}>
                Zakatable wealth is broadly wealth that grows or is held as a store of value: cash,
                savings, receivables, gold and silver in any form, shares, accessible retirement
                balances, goods held for sale, and property bought to resell. What you hold for your own
                use is not counted — your home, your car, your furniture, your clothes and the tools of
                your trade.
              </p>
              <p className={PROSE}>
                <strong>Debts are the point on which scholars differ.</strong> Many hold that debts
                immediately due — this month&apos;s rent, an overdue bill — come off your
                zakatable wealth before the rate is applied. Others hold that a long-term debt such as a
                mortgage is not deducted in full, since setting a twenty-year liability against a single
                year&apos;s wealth would remove almost everyone from zakat, and deduct only the
                instalments falling due within the year. Both positions are held by serious scholars.
                This page does not choose between them: the calculator subtracts whatever you enter in
                the liabilities field, so that entry is yours to make.
              </p>
            </Disclosure>

            <Disclosure title="The nisab this calculator uses" summary="The gold threshold; the silver one is lower">
              <p className={PROSE}>
                The threshold your total is measured against is shown beside the result above, with the
                date the price behind it was taken. We print a dollar figure only while that price is
                recent enough for us to stand behind; when it is not, the price fields stay empty and
                the method is shown instead.
              </p>
              <p className={PROSE}>
                This calculator uses the gold threshold, at {goldGramsText}. The silver threshold,{' '}
                {silverGramsText}, works out much lower, so it brings more people into zakat, and many
                scholars prefer it for that reason. The{' '}
                <Link to="/nisab" className="text-primary-700 underline hover:text-primary-800">
                  nisab page
                </Link>{' '}
                sets out both, along with the competing weight conventions, and carries the current
                figures.
              </p>
            </Disclosure>

            {/* A worked example, withheld whenever the page is withholding real
                money. We do not show invented arithmetic on the same screen where
                we have just declined to show a figure we could not vouch for. It
                is measured against the gold nisab, like the calculator. */}
            {showFigure && (
              <Disclosure title="A worked example" summary="$10,000 in savings, with $2,000 owed">
                <div className="flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <Info className="w-5 h-5 text-gray-500 shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="text-sm text-gray-600">
                    Illustrative only. The round numbers below are invented to show the arithmetic, not
                    market data. Use the dated threshold beside the result above.
                  </p>
                </div>
                <p className={PROSE}>
                  Suppose you hold $10,000 in savings that has been with you for a full lunar year and
                  owe $2,000 due immediately. On the view that immediately due debts are deducted, your
                  net zakatable wealth is $8,000. If that is above the nisab that day, zakat is due: 2.5%
                  of $8,000 is $200.
                </p>
                <p className={PROSE}>
                  On the other view of that $2,000 — that a long-term liability is not set against
                  a single year&apos;s wealth — the base would be $10,000 and the amount due $250. That
                  $50 gap is why it is worth asking someone qualified which treatment applies to you.
                </p>
              </Disclosure>
            )}

            <Link to="/zakat-education" className="link inline-flex items-center pt-1">
              Zakat explained, from the beginning
              <ArrowRight className="ms-2 w-4 h-4" aria-hidden="true" />
            </Link>
          </section>

          {/* FAQ — the same text that goes into the FAQPage schema, one closed
              item per question. */}
          <section aria-labelledby="zakat-faq">
            <h2 id="zakat-faq" className={HEADING}>Common questions</h2>
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
              This page is general guidance, not a religious ruling. Zakat depends on your
              circumstances — for anything specific to your situation, please ask a qualified
              scholar.
            </p>
          </section>
        </div>
      </div>

      {/* Zakat Result Modal */}
      {showResultModal && result && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={() => setShowResultModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="zakat-result-title"
            className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <div className="flex justify-end p-4 pb-0">
              <button
                type="button"
                onClick={() => setShowResultModal(false)}
                className="p-1 -m-1 rounded text-gray-500 hover:text-gray-700"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 pb-6 -mt-4">
              {/* Three states, not two. Without a price there is no threshold,
                  and "No Zakat Due" would be a verdict we have not reached. */}
              {resultThreshold === null ? (
                <>
                  <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center w-12 h-12 bg-amber-50 rounded-full mb-4">
                      <Scale className="w-6 h-6 text-amber-700" aria-hidden="true" />
                    </div>
                    <h2 id="zakat-result-title" className="text-2xl font-heading font-bold text-gray-900 mb-2">
                      We cannot tell you yet
                    </h2>
                    <p className="text-sm text-gray-600">
                      There is no threshold to measure your total against.
                    </p>
                  </div>

                  <div className="alert-warning block mb-6">
                    <div className="flex justify-between mb-2">
                      <span className="font-medium">Your net zakatable:</span>
                      <span className="font-semibold">{formatUSD(result.net_zakatable)}</span>
                    </div>
                    <p className="mt-3">
                      No gold price was entered, and we hold none recent enough to vouch for. Rather
                      than substitute a price of our own and hand you a confident figure built on it,
                      we are showing you none. Enter today’s gold price per gram above and the
                      threshold will appear with your result.
                    </p>
                  </div>

                  <p className="text-sm text-gray-600 mb-6">
                    The nisab is {goldGramsText} of gold, or {silverGramsText} of silver, at the
                    market price on the day you work it out.
                  </p>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      type="button"
                      onClick={() => setShowResultModal(false)}
                      className="btn-primary flex-1 gap-2"
                    >
                      <RotateCcw className="w-5 h-5" aria-hidden="true" />
                      Add a price and recalculate
                    </button>
                    <Link
                      to="/nisab"
                      onClick={() => setShowResultModal(false)}
                      className="btn-secondary flex-1 gap-2"
                    >
                      How the nisab is worked out
                      <ArrowRight className="w-5 h-5" aria-hidden="true" />
                    </Link>
                  </div>
                </>
              ) : result.meets_nisab && result.total >= 1 ? (
                <>
                  <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center w-12 h-12 bg-primary-50 rounded-full mb-4">
                      <CheckCircle className="w-6 h-6 text-primary-700" aria-hidden="true" />
                    </div>
                    <h2 id="zakat-result-title" className="text-2xl font-heading font-bold text-gray-900 mb-2">
                      Your Zakat Calculation is Ready
                    </h2>
                    <p className="text-sm text-gray-600">Here is the Zakat amount you owe</p>
                  </div>

                  {/* Big amount. The label is deliberately not "Total Zakat
                      Due": that phrase belongs to the result card behind the
                      dialog, and the two must not both match one query. */}
                  <div className="card-tinted mb-6 text-center">
                    <p className="text-sm font-medium text-primary-700 mb-1 uppercase tracking-wide">
                      Zakat due
                    </p>
                    <p className="text-5xl font-bold text-primary-700 mb-1">
                      {formatUSD(result.total)}
                    </p>
                    <p className="text-xs text-gray-600">
                      Based on net zakatable wealth of {formatUSD(result.net_zakatable)}
                    </p>
                  </div>

                  {/* Compact breakdown */}
                  <div className="bg-gray-50 rounded-lg p-4 mb-6 text-sm">
                    <div className="grid grid-cols-2 gap-2 text-gray-700">
                      {result.wealth > 0 && (
                        <>
                          <span>Wealth Zakat</span>
                          <span className="text-end font-medium">{formatUSD(result.wealth)}</span>
                        </>
                      )}
                      {result.gold > 0 && (
                        <>
                          <span>Gold Zakat</span>
                          <span className="text-end font-medium">{formatUSD(result.gold)}</span>
                        </>
                      )}
                      {result.silver > 0 && (
                        <>
                          <span>Silver Zakat</span>
                          <span className="text-end font-medium">{formatUSD(result.silver)}</span>
                        </>
                      )}
                      {result.business_goods > 0 && (
                        <>
                          <span>Business Zakat</span>
                          <span className="text-end font-medium">{formatUSD(result.business_goods)}</span>
                        </>
                      )}
                      {result.agriculture > 0 && (
                        <>
                          <span>Agriculture Zakat</span>
                          <span className="text-end font-medium">{formatUSD(result.agriculture)}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Link
                      to={`/donate?zakat_amount=${result.total.toFixed(2)}`}
                      onClick={() => setShowResultModal(false)}
                      className="btn-primary flex-1 gap-2"
                    >
                      Pay Zakat Now
                      <ArrowRight className="w-5 h-5" aria-hidden="true" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => setShowResultModal(false)}
                      className="btn-secondary flex-1 gap-2"
                    >
                      <RotateCcw className="w-5 h-5" aria-hidden="true" />
                      Recalculate
                    </button>
                  </div>

                  <p className="text-center text-xs text-gray-500 mt-4">
                    The donation form opens with this amount filled in.
                  </p>
                </>
              ) : (
                <>
                  {/* Below-Nisab state */}
                  <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center w-12 h-12 bg-amber-50 rounded-full mb-4">
                      <AlertCircle className="w-6 h-6 text-amber-700" aria-hidden="true" />
                    </div>
                    <h2 id="zakat-result-title" className="text-2xl font-heading font-bold text-gray-900 mb-2">
                      No Zakat Due
                    </h2>
                    <p className="text-sm text-gray-600">
                      Your net zakatable wealth is below the Nisab threshold.
                    </p>
                  </div>

                  <div className="alert-warning block mb-6">
                    <div className="flex justify-between mb-2">
                      <span className="font-medium">Your net zakatable:</span>
                      <span className="font-semibold">{formatUSD(result.net_zakatable)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Nisab threshold:</span>
                      <span className="font-semibold">{formatUSD(resultThreshold)}</span>
                    </div>
                  </div>

                  <p className="text-sm text-gray-600 mb-6">
                    Since your wealth is below the Nisab, Zakat is not obligatory this year.
                    You can still make a voluntary Sadaqa donation if you wish.
                  </p>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setShowResultModal(false)
                        navigate('/donate')
                      }}
                      className="btn-primary flex-1 gap-2"
                    >
                      <ArrowRight className="w-5 h-5" aria-hidden="true" />
                      Make a Sadaqa Donation
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowResultModal(false)}
                      className="btn-secondary flex-1 gap-2"
                    >
                      <RotateCcw className="w-5 h-5" aria-hidden="true" />
                      Recalculate
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ZakatCalculator
