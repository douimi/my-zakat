import { Globe, BookOpen } from 'lucide-react'

const UmrahGuidelines = () => {
  const steps = [
    { step: 1, title: 'Ihram', description: 'Enter the state of Ihram at the designated Miqat point before reaching Makkah' },
    { step: 2, title: 'Tawaf', description: 'Perform seven circuits around the Kaaba, starting and ending at the Black Stone' },
    { step: 3, title: 'Sa\'i', description: 'Walk seven times between Safa and Marwah hills' },
    { step: 4, title: 'Halq or Taqsir', description: 'Shave head (Halq) or trim hair (Taqsir) to complete Umrah' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="section-container">
        <div className="bg-white rounded-xl shadow-lg p-8 md:p-12">
          <div className="flex items-center mb-8">
            <Globe className="w-10 h-10 text-primary-600 mr-4" />
            <h1 className="text-4xl font-heading font-bold text-gray-900">Umrah Guidelines</h1>
          </div>
          
          <div className="prose prose-lg max-w-none">
            <p className="text-xl text-gray-600 mb-8">
              Essential guidelines and steps for performing Umrah, the lesser pilgrimage to Makkah.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {steps.map((item) => (
                <div key={item.step} className="card">
                  <div className="flex items-start">
                    <div className="w-10 h-10 bg-primary-600 text-white rounded-full flex items-center justify-center font-bold text-lg mr-4 flex-shrink-0">
                      {item.step}
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900 mb-2">{item.title}</h3>
                      <p className="text-gray-600">{item.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="card bg-blue-50 border-blue-200">
              <h3 className="text-lg font-semibold text-blue-900 mb-4">Important Reminders</h3>
              <ul className="list-disc list-inside text-blue-800 space-y-2">
                <li>Umrah can be performed at any time of the year</li>
                <li>Ensure you have valid travel documents and visas</li>
                <li>Follow all health and safety guidelines</li>
                <li>Respect the sanctity of the holy sites</li>
                <li>Consult with knowledgeable guides or scholars for detailed procedures</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default UmrahGuidelines

