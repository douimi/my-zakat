import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { Calculator, DollarSign, TrendingUp, Info, ArrowRight } from 'lucide-react'
import { donationsAPI } from '../utils/api'
import type { ZakatCalculation, ZakatResult } from '../types'

const ZakatCalculator = () => {
  const [result, setResult] = useState<ZakatResult | null>(null)
  const [isCalculating, setIsCalculating] = useState(false)

  const { register, handleSubmit, watch, reset } = useForm<ZakatCalculation>({
    defaultValues: {
      liabilities: 0,
      cash: 0,
      receivables: 0,
      stocks: 0,
      retirement: 0,
      gold_weight: 0,
      gold_price_per_gram: 65, // Default gold price
      silver_weight: 0,
      silver_price_per_gram: 0.85, // Default silver price
      business_goods: 0,
      agriculture_value: 0,
      investment_property: 0,
      other_valuables: 0,
      livestock: 0,
      other_assets: 0,
    }
  })

  const onSubmit = async (data: ZakatCalculation) => {
    setIsCalculating(true)
    try {
      const calculationResult = await donationsAPI.calculateZakat(data)
      setResult(calculationResult)
    } catch (error) {
      console.error('Error calculating Zakat:', error)
    } finally {
      setIsCalculating(false)
    }
  }

  const formSections = [
    {
      title: 'Liabilities & Debts',
      icon: TrendingUp,
      fields: [
        { name: 'liabilities', label: 'Total Debts & Liabilities', placeholder: '0.00' }
      ]
    },
    {
      title: 'Cash & Liquid Assets',
      icon: DollarSign,
      fields: [
        { name: 'cash', label: 'Cash in Hand/Bank', placeholder: '0.00' },
        { name: 'receivables', label: 'Money Owed to You', placeholder: '0.00' },
        { name: 'stocks', label: 'Stocks & Bonds', placeholder: '0.00' },
        { name: 'retirement', label: 'Retirement Funds', placeholder: '0.00' }
      ]
    },
    {
      title: 'Precious Metals',
      icon: Calculator,
      fields: [
        { name: 'gold_weight', label: 'Gold Weight (grams)', placeholder: '0' },
        { name: 'gold_price_per_gram', label: 'Gold Price per Gram ($)', placeholder: '65.00' },
        { name: 'silver_weight', label: 'Silver Weight (grams)', placeholder: '0' },
        { name: 'silver_price_per_gram', label: 'Silver Price per Gram ($)', placeholder: '0.85' }
      ]
    },
    {
      title: 'Business & Investments',
      icon: TrendingUp,
      fields: [
        { name: 'business_goods', label: 'Business Inventory/Goods', placeholder: '0.00' },
        { name: 'agriculture_value', label: 'Agricultural Produce', placeholder: '0.00' },
        { name: 'investment_property', label: 'Investment Property', placeholder: '0.00' },
        { name: 'livestock', label: 'Livestock Value', placeholder: '0.00' }
      ]
    },
    {
      title: 'Other Assets',
      icon: DollarSign,
      fields: [
        { name: 'other_valuables', label: 'Other Valuable Assets', placeholder: '0.00' },
        { name: 'other_assets', label: 'Miscellaneous Assets', placeholder: '0.00' }
      ]
    }
  ]

  return (
    <div className="min-h-screen bg-gray-50 py-12">
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
            Our calculator follows traditional scholarly guidelines.
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
                              <span className="text-gray-500 sm:text-sm">$</span>
                            </div>
                            <input
                              type="number"
                              step="0.01"
                              placeholder={field.placeholder}
                              {...register(field.name as keyof ZakatCalculation, { valueAsNumber: true })}
                              className="input-field pl-7"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

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
                  <p className="text-gray-600">Based on your provided information</p>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center py-2 border-b border-primary-200">
                    <span className="text-gray-700">Wealth Zakat:</span>
                    <span className="font-semibold text-gray-900">${result.wealth.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-primary-200">
                    <span className="text-gray-700">Gold Zakat:</span>
                    <span className="font-semibold text-gray-900">${result.gold.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-primary-200">
                    <span className="text-gray-700">Silver Zakat:</span>
                    <span className="font-semibold text-gray-900">${result.silver.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-primary-200">
                    <span className="text-gray-700">Business Zakat:</span>
                    <span className="font-semibold text-gray-900">${result.business_goods.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-primary-200">
                    <span className="text-gray-700">Agriculture Zakat:</span>
                    <span className="font-semibold text-gray-900">${result.agriculture.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-4 bg-primary-100 rounded-lg px-4 mt-4">
                    <span className="text-lg font-bold text-gray-900">Total Zakat Due:</span>
                    <span className="text-2xl font-bold text-primary-600">${result.total.toFixed(2)}</span>
                  </div>
                </div>

                {result.total > 0 && (
                  <div className="mt-6">
                    <Link 
                      to={`/donate?zakat_amount=${result.total}`}
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
                  Zakat is one of the Five Pillars of Islam and represents 2.5% of your qualifying wealth 
                  that has been in your possession for a full lunar year.
                </p>
                <p>
                  <strong>Nisab Threshold:</strong> You must pay Zakat if your wealth exceeds the nisab 
                  (equivalent to 87.48 grams of gold or 612.36 grams of silver).
                </p>
                <p>
                  <strong>Current Nisab Values:</strong>
                  <br />Gold: ~$5,686 (87.48g × $65/g)
                  <br />Silver: ~$521 (612.36g × $0.85/g)
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
                <li>• Subtract any debts and liabilities</li>
                <li>• Use current market prices for gold/silver</li>
                <li>• Business inventory counts as zakatable wealth</li>
                <li>• Personal residence is typically not included</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ZakatCalculator
