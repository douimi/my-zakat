import { Heart, Users, Globe } from 'lucide-react'

const CharityInIslam = () => {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="section-container">
        <div className="bg-white rounded-xl shadow-lg p-8 md:p-12">
          <div className="flex items-center mb-8">
            <Heart className="w-10 h-10 text-primary-600 mr-4" />
            <h1 className="text-4xl font-heading font-bold text-gray-900">Charity in Islam</h1>
          </div>
          
          <div className="prose prose-lg max-w-none">
            <p className="text-xl text-gray-600 mb-8">
              Understanding the importance and types of charity in Islam, including Zakat, Sadaqah, and their impact on society.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="card">
                <div className="flex items-center mb-4">
                  <Heart className="w-8 h-8 text-primary-600 mr-3" />
                  <h2 className="text-2xl font-semibold text-gray-900">Zakat</h2>
                </div>
                <p className="text-gray-600 mb-4">
                  Zakat is one of the Five Pillars of Islam, an obligatory charity that purifies wealth and helps those in need.
                </p>
                <ul className="list-disc list-inside text-gray-600 space-y-2">
                  <li>2.5% of eligible wealth annually</li>
                  <li>Given to specific categories of recipients</li>
                  <li>Purifies and increases wealth</li>
                </ul>
              </div>
              
              <div className="card">
                <div className="flex items-center mb-4">
                  <Users className="w-8 h-8 text-primary-600 mr-3" />
                  <h2 className="text-2xl font-semibold text-gray-900">Sadaqah</h2>
                </div>
                <p className="text-gray-600 mb-4">
                  Voluntary charity that can be given at any time, in any amount, bringing blessings and rewards.
                </p>
                <ul className="list-disc list-inside text-gray-600 space-y-2">
                  <li>Voluntary acts of giving</li>
                  <li>Can be money, time, or good deeds</li>
                  <li>Rewarded in this life and the next</li>
                </ul>
              </div>
              
              <div className="card md:col-span-2">
                <div className="flex items-center mb-4">
                  <Globe className="w-8 h-8 text-primary-600 mr-3" />
                  <h2 className="text-2xl font-semibold text-gray-900">Impact of Charity</h2>
                </div>
                <p className="text-gray-600">
                  Charity in Islam serves multiple purposes: it purifies wealth, helps those in need, strengthens community bonds, 
                  and brings spiritual rewards. Through Zakat and Sadaqah, Muslims contribute to social justice and economic 
                  balance, ensuring that resources are distributed fairly and those less fortunate receive support.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CharityInIslam

