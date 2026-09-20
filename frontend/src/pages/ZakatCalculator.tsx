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

const CARD = 'bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8'
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
        setValue('gold_price_per_gram', snapshot.gold_price_per_gram_usd as number)
        setValue('silver_price_per_gram', snapshot.silver_price_per_gram_usd as number)
      }
    })
    return () => {
      cancelled = true
    }
  }, [setValue])

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

  const reseedPrices = () => {
    if (hasUsableFigure(nisab) && nisab) {
      setValue('gold_price_per_gram', nisab.gold_price_per_gram_usd as number)
      setValue('silver_price_per_gram', nisab.silver_price_per_gram_usd as number)
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

  const formSections: { title: string; icon: typeof TrendingUp; note?: string | null; fields: FieldDef[] }[] = [
    {
      title: 'Liabilities & Debts',
      icon: TrendingUp,
      fields: [
        { name: 'liabilities', label: 'Total Debts & Liabilities', placeholder: '0.00', unit: 'usd' },
      ],
    },
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
  ]

  const showDonateButton = result && result.meets_nisab && result.total >= 1

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
          text: 'The threshold set by 87.48 g of gold or 612.36 g of silver at today’s price.',
        },
        {
          name: 'Pay 2.5% if you are at or above it',
          text: 'And if you are below, no zakat is due this year.',
        },
      ],
    }),
  ]

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <SEOHead
        title={`Zakat Calculator ${year} — How Much Zakat Do I Owe?`}
        description="Work out what zakat you owe. Enter your cash, savings, gold, silver, investments and business assets, and see them compared against the current nisab threshold."
        canonicalPath="/zakat-calculator"
        jsonLd={jsonLd}
      />
      <div className="section-container">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-600 rounded-full mb-6">
            <Calculator className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl lg:text-5xl font-heading font-bold text-gray-900 mb-4">
            Zakat Calculator {year} — How Much Zakat Do I Owe?
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Total your cash, gold, investments and business assets, see them measured against the
            current nisab, and find the 2.5% that is due.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Calculator Form */}
          <div className="lg:col-span-2">
            <div className="card">
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
                {formSections.map((section, sectionIndex) => (
                  <div key={sectionIndex} className="border-b border-gray-200 pb-8 last:border-b-0">
                    <div className="flex items-center mb-6">
                      <section.icon className="w-6 h-6 text-primary-600 mr-3" />
                      <h3 className="text-xl font-semibold text-gray-900">{section.title}</h3>
                    </div>

                    {section.note && (
                      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                        <p className="text-sm text-amber-900">{section.note}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {section.fields.map((field) => (
                        <div key={field.name}>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            {field.label}
                          </label>
                          <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                              <span className="text-gray-500 text-sm">
                                {field.unit === 'usd' ? '$' : 'g'}
                              </span>
                            </div>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder={field.placeholder}
                              {...register(field.name, { valueAsNumber: true, min: 0 })}
                              className="input-field pl-7"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {submitError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 flex items-start">
                    <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
                    <span className="text-sm">{submitError}</span>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-4">
                  <button
                    type="submit"
                    disabled={isCalculating}
                    className="btn-primary flex-1 flex items-center justify-center"
                  >
                    {isCalculating ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                        Calculating...
                      </>
                    ) : (
                      <>
                        <Calculator className="w-5 h-5 mr-2" />
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
                    className="btn-outline flex-1"
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
            <div className="card bg-primary-50 border-primary-200">
              <div className="flex items-center mb-4">
                <Scale className="w-6 h-6 text-primary-600 mr-3" aria-hidden="true" />
                <h3 className="text-lg font-semibold text-gray-900">What your total is compared against</h3>
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

                  <Link
                    to="/nisab"
                    className="text-primary-700 hover:text-primary-800 font-medium inline-flex items-center"
                  >
                    How the nisab is worked out
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </Link>
                </div>
              )}
            </div>

            {/* Results */}
            {result && (
              <div className="card bg-gradient-to-br from-primary-50 to-blue-50 border-primary-200">
                <div className="text-center mb-6">
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">Your Zakat Calculation</h3>
                  <p className="text-gray-600 text-sm">Based on your provided information</p>
                </div>

                {/* Nisab status banner */}
                {!result.meets_nisab ? (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                    <div className="flex items-start">
                      <AlertCircle className="w-5 h-5 text-yellow-600 mr-2 flex-shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-semibold text-yellow-900 mb-1">Below Nisab — no Zakat is due</p>
                        <p className="text-yellow-800">
                          Your net zakatable wealth ({formatUSD(result.net_zakatable)}) is below the
                          current Nisab threshold of {formatUSD(result.nisab_threshold)}.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                    <div className="flex items-start">
                      <CheckCircle className="w-5 h-5 text-green-600 mr-2 flex-shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-semibold text-green-900 mb-1">Above Nisab — Zakat is due</p>
                        <p className="text-green-800">
                          Net zakatable: {formatUSD(result.net_zakatable)} • Nisab: {formatUSD(result.nisab_threshold)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex justify-between items-center py-2 border-b border-primary-200">
                    <span className="text-gray-700">Wealth Zakat:</span>
                    <span className="font-semibold text-gray-900">{formatUSD(result.wealth)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-primary-200">
                    <span className="text-gray-700">Gold Zakat:</span>
                    <span className="font-semibold text-gray-900">{formatUSD(result.gold)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-primary-200">
                    <span className="text-gray-700">Silver Zakat:</span>
                    <span className="font-semibold text-gray-900">{formatUSD(result.silver)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-primary-200">
                    <span className="text-gray-700">Business Zakat:</span>
                    <span className="font-semibold text-gray-900">{formatUSD(result.business_goods)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-primary-200">
                    <span className="text-gray-700">Agriculture Zakat (5%):</span>
                    <span className="font-semibold text-gray-900">{formatUSD(result.agriculture)}</span>
                  </div>
                  <div className="flex justify-between items-center py-4 bg-primary-100 rounded-lg px-4 mt-4">
                    <span className="text-lg font-bold text-gray-900">Total Zakat Due:</span>
                    <span className="text-2xl font-bold text-primary-600">{formatUSD(result.total)}</span>
                  </div>
                </div>

                {showDonateButton && (
                  <div className="mt-6">
                    <Link
                      to={`/donate?zakat_amount=${result.total.toFixed(2)}`}
                      className="btn-primary w-full text-center flex items-center justify-center"
                    >
                      Pay Zakat Now
                      <ArrowRight className="ml-2 w-5 h-5" />
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* Information */}
            <div className="card">
              <div className="flex items-center mb-4">
                <Info className="w-6 h-6 text-primary-600 mr-3" />
                <h3 className="text-lg font-semibold text-gray-900">About Zakat</h3>
              </div>
              <div className="space-y-4 text-sm text-gray-600">
                <p>
                  Zakat is one of the Five Pillars of Islam and represents 2.5% of your qualifying
                  wealth that has been in your possession for a full lunar year.
                </p>
                <p>
                  <strong>Nisab threshold:</strong> Zakat is due only once your net zakatable wealth
                  reaches the nisab. This calculator measures against the gold threshold; the silver
                  one is lower.
                </p>
              </div>

              <div className="mt-6 pt-6 border-t border-gray-200">
                <Link
                  to="/zakat-education"
                  className="text-primary-600 hover:text-primary-700 font-medium flex items-center"
                >
                  Learn More About Zakat
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Link>
              </div>
            </div>

            {/* Quick Tips */}
            <div className="card bg-yellow-50 border-yellow-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">💡 Quick Tips</h3>
              <ul className="space-y-2 text-sm text-gray-700">
                <li>• Include all cash, savings, and investments</li>
                <li>• Liabilities are deducted from your total</li>
                <li>• Check the metal prices against a source you trust</li>
                <li>• Business inventory counts as zakatable wealth</li>
                <li>• Personal residence is typically not included</li>
              </ul>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------------
            The content. Written to the editorial rules: it states what is
            agreed, names what is not, and rules on nothing.
           ------------------------------------------------------------------ */}
        <div className="max-w-4xl mx-auto mt-12 sm:mt-16 space-y-6 sm:space-y-8">
          <section className={CARD}>
            <h2 className={HEADING}>What this calculator covers — and what it does not</h2>
            <p className={PROSE}>
              This works out zakat al-mal: the annual charge on wealth you have held for a full lunar
              year. It takes cash, money owed to you, shares and funds, retirement savings, gold and
              silver by weight, business stock, property bought to resell, agricultural produce and
              livestock value, subtracts your liabilities, and applies the rate to what is left.
            </p>
            <p className={`${PROSE} mt-4`}>
              It does not cover zakat al-fitr, the per-person amount due before the Eid prayer at the
              end of Ramadan, and it does not apply the detailed livestock tables, which count animals
              by head and species rather than by value. It also cannot know which school you follow, so
              treat the number it gives as a starting point rather than a verdict.
            </p>
          </section>

          <section className={CARD}>
            <h2 className={HEADING}>The rule in plain language</h2>
            <p className={PROSE}>
              Zakat is due at 2.5% of qualifying wealth once two conditions are met. The first is time:
              the wealth must have been yours for a full lunar year — a hawl, about 354 days, not 365.
              The second is amount: it must sit at or above the nisab, the threshold defined by the
              value of a set weight of gold or of silver.
            </p>
            <p className={`${PROSE} mt-4`}>
              At or above the threshold, the 2.5% applies to the whole of that wealth, not only to the
              part above the line. Below it, no zakat is due this year.
            </p>
          </section>

          <section className={CARD}>
            <h2 className={HEADING}>What counts, and what does not</h2>
            <p className={PROSE}>
              Zakatable wealth is broadly wealth that grows or is held as a store of value: cash,
              savings, receivables, gold and silver in any form, shares, accessible retirement
              balances, goods held for sale, and property bought to resell. What you hold for your own
              use is not counted — your home, your car, your furniture, your clothes and the tools of
              your trade.
            </p>
            <p className={`${PROSE} mt-4`}>
              <strong>Debts are the point on which scholars differ.</strong> Many hold that debts
              immediately due — this month&apos;s rent, an overdue bill — come off your
              zakatable wealth before the rate is applied. Others hold that a long-term debt such as a
              mortgage is not deducted in full, since setting a twenty-year liability against a single
              year&apos;s wealth would remove almost everyone from zakat, and deduct only the
              instalments falling due within the year. Both positions are held by serious scholars.
              This page does not choose between them: the calculator subtracts whatever you enter in
              the liabilities field, so that entry is yours to make.
            </p>
          </section>

          <section className={CARD}>
            <h2 className={HEADING}>The nisab this calculator uses</h2>
            <p className={PROSE}>
              The threshold your total is measured against is shown beside the result above, with the
              date the price behind it was taken. We print a dollar figure only while that price is
              recent enough for us to stand behind; when it is not, the price fields stay empty and
              the method is shown instead.
            </p>
            <p className={`${PROSE} mt-4`}>
              This calculator uses the gold threshold, at 87.48 grams. The silver threshold, 612.36 grams,
              works out much lower, so it brings more people into zakat, and many scholars prefer it
              for that reason. The{' '}
              <Link to="/nisab" className="text-primary-700 underline hover:text-primary-800">
                nisab page
              </Link>{' '}
              sets out both, along with the competing weight conventions, and carries the current
              figures.
            </p>
          </section>

          {/* A worked example, withheld whenever the page is withholding real
              money. We do not show invented arithmetic on the same screen where
              we have just declined to show a figure we could not vouch for. */}
          {showFigure && (
            <section className={CARD}>
              <h2 className={HEADING}>A worked example</h2>
              <div className="flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
                <Info className="w-5 h-5 text-gray-500 shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-sm text-gray-600">
                  Illustrative only. The round numbers below are invented to show the arithmetic, not
                  market data. Use the dated threshold beside the result above.
                </p>
              </div>
              <p className={PROSE}>
                Suppose you hold $10,000 in savings that has been with you for a full lunar year and
                owe $2,000 due immediately. On the view that immediately due debts are deducted, your
                net zakatable wealth is $8,000. If the silver nisab works out at around $640 that day,
                $8,000 is well above it, so zakat is due: 2.5% of $8,000 is $200.
              </p>
              <p className={`${PROSE} mt-4`}>
                On the other view of that $2,000 — that a long-term liability is not set against
                a single year&apos;s wealth — the base would be $10,000 and the amount due $250. That
                $50 gap is why it is worth asking someone qualified which treatment applies to you.
              </p>
            </section>
          )}

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

          <section className="bg-amber-50 border border-amber-200 rounded-xl p-6 sm:p-8">
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
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={() => setShowResultModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <div className="flex justify-end p-4 pb-0">
              <button
                onClick={() => setShowResultModal(false)}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 pb-6 -mt-4">
              {result.meets_nisab && result.total >= 1 ? (
                <>
                  {/* Header — celebrates the calculation */}
                  <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-primary-500 to-blue-600 rounded-full mb-4 shadow-lg">
                      <CheckCircle className="w-8 h-8 text-white" />
                    </div>
                    <h2 className="text-2xl font-heading font-bold text-gray-900 mb-2">
                      Your Zakat Calculation is Ready
                    </h2>
                    <p className="text-sm text-gray-600">Here is the Zakat amount you owe</p>
                  </div>

                  {/* Big amount */}
                  <div className="bg-gradient-to-br from-primary-50 via-blue-50 to-primary-50 border-2 border-primary-200 rounded-xl p-6 mb-6 text-center">
                    <p className="text-sm font-medium text-primary-700 mb-1 uppercase tracking-wide">
                      Total Zakat Due
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
                          <span className="text-right font-medium">{formatUSD(result.wealth)}</span>
                        </>
                      )}
                      {result.gold > 0 && (
                        <>
                          <span>Gold Zakat</span>
                          <span className="text-right font-medium">{formatUSD(result.gold)}</span>
                        </>
                      )}
                      {result.silver > 0 && (
                        <>
                          <span>Silver Zakat</span>
                          <span className="text-right font-medium">{formatUSD(result.silver)}</span>
                        </>
                      )}
                      {result.business_goods > 0 && (
                        <>
                          <span>Business Zakat</span>
                          <span className="text-right font-medium">{formatUSD(result.business_goods)}</span>
                        </>
                      )}
                      {result.agriculture > 0 && (
                        <>
                          <span>Agriculture Zakat (5%)</span>
                          <span className="text-right font-medium">{formatUSD(result.agriculture)}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={() => {
                        setShowResultModal(false)
                        navigate(`/donate?zakat_amount=${result.total.toFixed(2)}`)
                      }}
                      className="btn-primary flex-1 flex items-center justify-center py-3"
                    >
                      <ArrowRight className="w-5 h-5 mr-2" />
                      Proceed with Donation
                    </button>
                    <button
                      onClick={() => setShowResultModal(false)}
                      className="btn-outline flex-1 flex items-center justify-center py-3"
                    >
                      <RotateCcw className="w-5 h-5 mr-2" />
                      Recalculate
                    </button>
                  </div>

                  <p className="text-center text-xs text-gray-500 mt-4">
                    "Proceed with Donation" will pre-fill the donation page with your Zakat amount.
                  </p>
                </>
              ) : (
                <>
                  {/* Below-Nisab state */}
                  <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-yellow-100 rounded-full mb-4">
                      <AlertCircle className="w-8 h-8 text-yellow-600" />
                    </div>
                    <h2 className="text-2xl font-heading font-bold text-gray-900 mb-2">
                      No Zakat Due
                    </h2>
                    <p className="text-sm text-gray-600">
                      Your net zakatable wealth is below the Nisab threshold.
                    </p>
                  </div>

                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 text-sm">
                    <div className="flex justify-between mb-2">
                      <span className="text-yellow-900 font-medium">Your net zakatable:</span>
                      <span className="text-yellow-900 font-semibold">{formatUSD(result.net_zakatable)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-yellow-900 font-medium">Nisab threshold:</span>
                      <span className="text-yellow-900 font-semibold">{formatUSD(result.nisab_threshold)}</span>
                    </div>
                  </div>

                  <p className="text-sm text-gray-600 mb-6">
                    Since your wealth is below the Nisab, Zakat is not obligatory this year.
                    You can still make a voluntary Sadaqa donation if you wish.
                  </p>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={() => {
                        setShowResultModal(false)
                        navigate('/donate')
                      }}
                      className="btn-primary flex-1 flex items-center justify-center py-3"
                    >
                      <ArrowRight className="w-5 h-5 mr-2" />
                      Make a Sadaqa Donation
                    </button>
                    <button
                      onClick={() => setShowResultModal(false)}
                      className="btn-outline flex-1 flex items-center justify-center py-3"
                    >
                      <RotateCcw className="w-5 h-5 mr-2" />
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
