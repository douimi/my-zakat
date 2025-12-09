import { useState } from 'react'
import { Calculator, Info, AlertCircle, Users, DollarSign, Calendar } from 'lucide-react'
import { Link } from 'react-router-dom'

const KaffarahCalculator = () => {
  const [daysMissed, setDaysMissed] = useState<number>(1)
  const [foodCostPerPerson, setFoodCostPerPerson] = useState<number>(10)
  const [calculationMethod, setCalculationMethod] = useState<'feeding' | 'monetary'>('monetary')
  const [result, setResult] = useState<{
    totalAmount: number
    peopleToFeed: number
    daysToFast: number
  } | null>(null)

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

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="section-container">
        <div className="bg-white rounded-xl shadow-lg p-8 md:p-12 max-w-4xl mx-auto">
          <div className="flex items-center mb-8">
            <Calculator className="w-10 h-10 text-primary-600 mr-4" />
            <h1 className="text-3xl md:text-4xl font-heading font-bold text-gray-900">Kaffarah Calculator</h1>
          </div>
          
          <div className="prose prose-lg max-w-none mb-8">
            <p className="text-xl text-gray-600 mb-6">
              Calculate the Kaffarah (expiation) for intentionally breaking religious obligations during Ramadan.
            </p>
            
            <div className="card bg-blue-50 border-blue-200 mb-8">
              <div className="flex items-start">
                <Info className="w-6 h-6 text-blue-600 mr-3 mt-1 flex-shrink-0" />
                <div>
                  <h3 className="text-lg font-semibold text-blue-900 mb-2">What is Kaffarah?</h3>
                  <p className="text-blue-800 mb-3">
                    Kaffarah is a form of atonement in Islam for intentionally breaking certain religious obligations, 
                    such as deliberately missing a Ramadan fast or breaking an oath. The atonement may involve:
                  </p>
                  <ul className="list-disc list-inside text-blue-800 space-y-1 mb-3">
                    <li>Fasting for two consecutive months (60 days)</li>
                    <li>Feeding 60 poor people</li>
                    <li>Paying the monetary equivalent if fasting is not possible</li>
                  </ul>
                  <p className="text-blue-800 text-sm">
                    <strong>Note:</strong> Kaffarah applies to intentional violations, unlike Fidyah, which is for those 
                    unable to fast due to valid reasons such as illness or old age.
                  </p>
                </div>
              </div>
            </div>

            <div className="card bg-yellow-50 border-yellow-200 mb-8">
              <div className="flex items-start">
                <AlertCircle className="w-6 h-6 text-yellow-600 mr-3 mt-1 flex-shrink-0" />
                <div>
                  <h3 className="text-lg font-semibold text-yellow-900 mb-2">Important Reminder</h3>
                  <p className="text-yellow-800">
                    Kaffarah is required for <strong>intentional</strong> violations. If you missed fasts due to 
                    illness, travel, or other valid reasons, you may only need to make up the fasts (Qada) or pay 
                    Fidyah, not Kaffarah. Please consult with a knowledgeable scholar for your specific situation.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Calculator Form */}
          <div className="card bg-gray-50 mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-6">Calculate Your Kaffarah</h2>
            
            <div className="space-y-6">
              {/* Days Missed */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Number of Days Missed (Intentionally)
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
                  Enter the number of days you intentionally broke your fast
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
                    <span className="text-gray-700">Monetary Payment (Recommended if fasting is not possible)</span>
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
                  Average cost of one meal for a poor person in your area
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

          {/* Results */}
          {result && (
            <div className="card bg-green-50 border-green-200 mb-8">
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
                  For {daysMissed} day{daysMissed > 1 ? 's' : ''} missed, your Kaffarah is:
                </p>
                <ul className="list-disc list-inside text-gray-700 space-y-1">
                  <li><strong>Feed {result.peopleToFeed} poor people</strong> (60 people × {daysMissed} day{daysMissed > 1 ? 's' : ''})</li>
                  <li><strong>Pay ${result.totalAmount.toFixed(2)}</strong> (monetary equivalent)</li>
                  {calculationMethod === 'monetary' && (
                    <li><strong>Fast for {result.daysToFast} consecutive days</strong> (alternative option)</li>
                  )}
                </ul>
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

          {/* Additional Information */}
          <div className="card bg-gray-50">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">How to Pay Kaffarah</h3>
            <div className="space-y-3 text-gray-700">
              <p>
                <strong>1. Feeding Poor People:</strong> You can provide two meals per day to 60 poor people 
                for each day missed, or provide one meal to 60 people for 60 days.
              </p>
              <p>
                <strong>2. Monetary Payment:</strong> Pay the equivalent cost of feeding 60 people. This amount 
                should be given to poor and needy Muslims who qualify to receive Zakat.
              </p>
              <p>
                <strong>3. Fasting:</strong> Fast for two consecutive months (approximately 60 days) without 
                interruption. If you break the fast during this period, you must start over.
              </p>
              <p className="text-sm text-gray-600 mt-4">
                <strong>Note:</strong> It is recommended to consult with a local Islamic scholar or mosque 
                to ensure you fulfill your Kaffarah correctly according to your specific circumstances.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default KaffarahCalculator
