import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { Calculator, DollarSign, TrendingUp, Info, ArrowRight, CheckCircle, AlertCircle, X, RotateCcw } from 'lucide-react'
import { donationsAPI } from '../utils/api'
import type { ZakatCalculation, ZakatResult } from '../types'
import SEOHead from '../components/SEOHead'

// Default market prices — used as initial values, the user can override.
// These are conservative reference values; users should check current rates.
const DEFAULT_GOLD_PRICE_PER_GRAM = 95.00
const DEFAULT_SILVER_PRICE_PER_GRAM = 1.10

// Nisab gold weight in grams (standard scholarly value)
const NISAB_GOLD_GRAMS = 87.48

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
  const navigate = useNavigate()

  const { register, handleSubmit, watch, reset } = useForm<ZakatCalculation>({
    defaultValues: {
      liabilities: 0,
      cash: 0,
      receivables: 0,
      stocks: 0,
      retirement: 0,
      gold_weight: 0,
      gold_price_per_gram: DEFAULT_GOLD_PRICE_PER_GRAM,
      silver_weight: 0,
      silver_price_per_gram: DEFAULT_SILVER_PRICE_PER_GRAM,
      business_goods: 0,
      agriculture_value: 0,
      investment_property: 0,
      other_valuables: 0,
      livestock: 0,
      other_assets: 0,
    },
  })

  const goldPrice = watch('gold_price_per_gram') || DEFAULT_GOLD_PRICE_PER_GRAM
  const silverPrice = watch('silver_price_per_gram') || DEFAULT_SILVER_PRICE_PER_GRAM
  const currentNisab = NISAB_GOLD_GRAMS * goldPrice

  const onSubmit = async (data: ZakatCalculation) => {
    setSubmitError(null)
    setIsCalculating(true)
    try {
      const calculationResult = await donationsAPI.calculateZakat(data)
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

  const formSections: { title: string; icon: typeof TrendingUp; fields: FieldDef[] }[] = [
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
      fields: [
        { name: 'gold_weight', label: 'Gold Weight (grams)', placeholder: '0', unit: 'grams' },
        { name: 'gold_price_per_gram', label: 'Gold Price per Gram', placeholder: String(DEFAULT_GOLD_PRICE_PER_GRAM), unit: 'usd' },
        { name: 'silver_weight', label: 'Silver Weight (grams)', placeholder: '0', unit: 'grams' },
        { name: 'silver_price_per_gram', label: 'Silver Price per Gram', placeholder: String(DEFAULT_SILVER_PRICE_PER_GRAM), unit: 'usd' },
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

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <SEOHead
        title="Zakat Calculator"
        description="Calculate your Zakat obligation accurately with our comprehensive Zakat calculator. Enter your savings, gold, silver, investments, and business assets to determine your annual Zakat."
        canonicalPath="/zakat-calculator"
      />
      <div className="section-container">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-600 rounded-full mb-6">
            <Calculator className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl lg:text-5xl font-heading font-bold text-gray-900 mb-4">
            Zakat Calculator
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Calculate your Zakat obligation accurately according to Islamic principles.
            Our calculator follows traditional scholarly guidelines and applies the Nisab threshold.
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
                  <strong>Nisab threshold:</strong> Zakat is due only if your net zakatable wealth
                  exceeds the Nisab (equivalent to {NISAB_GOLD_GRAMS} grams of gold).
                </p>
                <p>
                  <strong>At your gold price ({formatUSD(goldPrice)}/g):</strong>
                  <br />
                  Current Nisab = {formatUSD(currentNisab)}
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
                <li>• Liabilities are automatically deducted</li>
                <li>• Update gold/silver prices to current market rates</li>
                <li>• Business inventory counts as zakatable wealth</li>
                <li>• Personal residence is typically not included</li>
              </ul>
            </div>
          </div>
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
