import { useState } from 'react'
import { Calculator, Info, AlertCircle, Users, DollarSign, Calendar, Gift } from 'lucide-react'
import { Link } from 'react-router-dom'

const ZakatAlFitrCalculator = () => {
  const [householdSize, setHouseholdSize] = useState<number>(1)
  const [foodPricePerKg, setFoodPricePerKg] = useState<number>(3)
  const [calculationMethod, setCalculationMethod] = useState<'food' | 'monetary'>('monetary')
  const [result, setResult] = useState<{
    totalAmount: number
    totalKg: number
    perPerson: number
  } | null>(null)

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

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="section-container">
        <div className="bg-white rounded-xl shadow-lg p-8 md:p-12 max-w-4xl mx-auto">
          <div className="flex items-center mb-8">
            <Gift className="w-10 h-10 text-primary-600 mr-4" />
            <h1 className="text-3xl md:text-4xl font-heading font-bold text-gray-900">Zakat al-Fitr Calculator</h1>
          </div>
          
          <div className="prose prose-lg max-w-none mb-8">
            <p className="text-xl text-gray-600 mb-6">
              Calculate the mandatory Zakat al-Fitr donation for your household at the end of Ramadan.
            </p>
            
            <div className="card bg-green-50 border-green-200 mb-8">
              <div className="flex items-start">
                <Info className="w-6 h-6 text-green-600 mr-3 mt-1 flex-shrink-0" />
                <div>
                  <h3 className="text-lg font-semibold text-green-900 mb-2">What is Zakat al-Fitr?</h3>
                  <p className="text-green-800 mb-3">
                    Zakat al-Fitr is a mandatory donation given at the end of Ramadan for every Muslim. 
                    It is paid by the head of the household on behalf of themselves and all dependents.
                  </p>
                  <ul className="list-disc list-inside text-green-800 space-y-1 mb-3">
                    <li>The required amount is approximately one saa (about 2.5–3 kg) of staple food per person</li>
                    <li>Must be given before the Eid prayer for it to count as Zakat al-Fitr</li>
                    <li>May be given as food or as the monetary equivalent</li>
                    <li>Payments made after the Eid prayer count as general charity, not Zakat al-Fitr</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="card bg-yellow-50 border-yellow-200 mb-8">
              <div className="flex items-start">
                <AlertCircle className="w-6 h-6 text-yellow-600 mr-3 mt-1 flex-shrink-0" />
                <div>
                  <h3 className="text-lg font-semibold text-yellow-900 mb-2">Important Timing</h3>
                  <p className="text-yellow-800">
                    Zakat al-Fitr must be paid <strong>before the Eid prayer</strong>. If paid after the Eid prayer, 
                    it is considered general charity (Sadaqah) rather than Zakat al-Fitr. It is recommended to pay 
                    it a few days before Eid to ensure it reaches those in need in time.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Calculator Form */}
          <div className="card bg-gray-50 mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-6">Calculate Your Zakat al-Fitr</h2>
            
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
                  Include yourself and all dependents (spouse, children, elderly parents, etc.)
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
                    <span className="text-gray-700">Monetary Payment (Recommended - allows recipients to buy what they need)</span>
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
                    <span className="text-gray-700">Food (Staple food like wheat, rice, dates, etc.)</span>
                  </label>
                </div>
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
                  Average price of staple food (wheat, rice, dates, etc.) per kilogram in your area
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

          {/* Results */}
          {result && (
            <div className="card bg-green-50 border-green-200 mb-8">
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
                  <li><strong>${result.totalAmount.toFixed(2)}</strong> monetary equivalent</li>
                </ul>
                <p className="text-sm text-gray-600 mt-3">
                  <strong>Remember:</strong> This must be paid <strong>before the Eid prayer</strong> to count as Zakat al-Fitr.
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

          {/* Additional Information */}
          <div className="card bg-gray-50">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">How to Pay Zakat al-Fitr</h3>
            <div className="space-y-3 text-gray-700">
              <p>
                <strong>1. Timing:</strong> Pay Zakat al-Fitr before the Eid prayer. It is recommended to pay 
                it a few days before Eid to ensure it reaches those in need in time.
              </p>
              <p>
                <strong>2. Recipients:</strong> Zakat al-Fitr should be given to poor and needy Muslims who 
                qualify to receive Zakat. It cannot be given to non-Muslims.
              </p>
              <p>
                <strong>3. Amount:</strong> Approximately 2.5-3 kg (one saa) of staple food per person, or 
                its monetary equivalent. Common staple foods include wheat, rice, dates, barley, or raisins.
              </p>
              <p>
                <strong>4. Responsibility:</strong> The head of the household pays on behalf of themselves 
                and all dependents, including children, elderly parents, and anyone else they are responsible for.
              </p>
              <p className="text-sm text-gray-600 mt-4">
                <strong>Note:</strong> Consult with your local mosque or Islamic organization to determine 
                the exact amount and best way to distribute Zakat al-Fitr in your area.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ZakatAlFitrCalculator

