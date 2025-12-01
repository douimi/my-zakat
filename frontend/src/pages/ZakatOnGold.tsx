import { Info, Calculator } from 'lucide-react'

const ZakatOnGold = () => {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="section-container">
        <div className="bg-white rounded-xl shadow-lg p-8 md:p-12">
          <div className="flex items-center mb-8">
            <Info className="w-10 h-10 text-primary-600 mr-4" />
            <h1 className="text-4xl font-heading font-bold text-gray-900">Zakat on Gold</h1>
          </div>
          
          <div className="prose prose-lg max-w-none">
            <p className="text-xl text-gray-600 mb-8">
              Understanding how to calculate Zakat on gold and silver, including the Nisab threshold and calculation methods.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="card">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">Nisab for Gold</h2>
                <p className="text-gray-600 mb-4">
                  The Nisab (minimum threshold) for gold is 87.48 grams (approximately 7.5 tolas or 2.8125 troy ounces).
                </p>
                <p className="text-gray-600">
                  If you own gold equal to or exceeding this amount and have held it for one lunar year, Zakat is due at 2.5% of its value.
                </p>
              </div>
              
              <div className="card">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">Calculation Method</h2>
                <ol className="list-decimal list-inside text-gray-600 space-y-2">
                  <li>Determine the current market value of your gold</li>
                  <li>Check if it meets or exceeds the Nisab threshold</li>
                  <li>Calculate 2.5% of the total value</li>
                  <li>Pay this amount as Zakat</li>
                </ol>
              </div>
              
              <div className="card md:col-span-2">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">Important Notes</h2>
                <ul className="list-disc list-inside text-gray-600 space-y-2">
                  <li>Gold used for personal adornment (jewelry) may have different rulings - consult a scholar</li>
                  <li>Investment gold and gold bars are subject to Zakat</li>
                  <li>The value is calculated based on current market prices</li>
                  <li>Zakat is due after one lunar year of ownership</li>
                </ul>
              </div>
            </div>
            
            <div className="mt-8 text-center">
              <a
                href="/zakat-calculator"
                className="btn-primary inline-flex items-center"
              >
                <Calculator className="w-5 h-5 mr-2" />
                Use Zakat Calculator
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ZakatOnGold

