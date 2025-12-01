import { Calculator } from 'lucide-react'

const KaffarahCalculator = () => {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="section-container">
        <div className="bg-white rounded-xl shadow-lg p-8 md:p-12 max-w-3xl mx-auto">
          <div className="flex items-center mb-8">
            <Calculator className="w-10 h-10 text-primary-600 mr-4" />
            <h1 className="text-4xl font-heading font-bold text-gray-900">Kaffarah Calculator</h1>
          </div>
          
          <div className="prose prose-lg max-w-none">
            <p className="text-xl text-gray-600 mb-8">
              Calculate the Kaffarah (expiation) for breaking fasts during Ramadan without valid excuse.
            </p>
            
            <div className="card bg-blue-50 border-blue-200 mb-8">
              <h3 className="text-lg font-semibold text-blue-900 mb-2">What is Kaffarah?</h3>
              <p className="text-blue-800">
                Kaffarah is the expiation required when a Muslim intentionally breaks a fast during Ramadan without a valid excuse. 
                The amount is calculated based on feeding one person for each day missed.
              </p>
            </div>
            
            <div className="text-center py-8">
              <p className="text-gray-600 mb-4">Kaffarah Calculator coming soon...</p>
              <p className="text-sm text-gray-500">
                This tool will help you calculate the exact amount of Kaffarah based on current food prices.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default KaffarahCalculator

