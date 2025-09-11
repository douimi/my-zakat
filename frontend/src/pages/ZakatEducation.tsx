import { Link } from 'react-router-dom'
import { Book, Calculator, Heart, Users, Coins, Scale, CheckCircle, ArrowRight } from 'lucide-react'

const ZakatEducation = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-primary-600 to-primary-800 text-white py-20">
        <div className="section-container">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-5xl font-heading font-bold mb-6">Understanding Zakat</h1>
            <p className="text-xl text-primary-100 leading-relaxed mb-8">
              Learn about the principles, importance, and practical aspects of Zakat - 
              the third pillar of Islam and a fundamental act of worship and social responsibility.
            </p>
            <Link to="/zakat-calculator" className="btn-white inline-flex items-center">
              <Calculator className="w-5 h-5 mr-2" />
              Calculate Your Zakat
            </Link>
          </div>
        </div>
      </div>

      {/* What is Zakat */}
      <div className="section-container py-16">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-heading font-bold text-gray-900 mb-4">What is Zakat?</h2>
            <p className="text-gray-600 text-lg">
              Understanding the fundamental concept of Islamic charitable giving
            </p>
          </div>

          <div className="card mb-12">
            <div className="flex items-start mb-6">
              <Book className="w-8 h-8 text-primary-600 mr-4 mt-1" />
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">The Third Pillar of Islam</h3>
                <p className="text-gray-600 leading-relaxed">
                  Zakat is one of the Five Pillars of Islam, making it a fundamental religious obligation for 
                  every eligible Muslim. The word "Zakat" comes from the Arabic root meaning "to purify" and 
                  "to grow," signifying both the purification of wealth and the spiritual growth that comes 
                  from giving to those in need.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Spiritual Significance</h4>
                <ul className="text-gray-600 space-y-2">
                  <li>• Purifies wealth and the soul</li>
                  <li>• Develops empathy and compassion</li>
                  <li>• Strengthens community bonds</li>
                  <li>• Brings one closer to Allah</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Social Impact</h4>
                <ul className="text-gray-600 space-y-2">
                  <li>• Reduces poverty and inequality</li>
                  <li>• Supports economic circulation</li>
                  <li>• Provides social safety net</li>
                  <li>• Promotes social justice</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Who Must Pay Zakat */}
        <div className="max-w-4xl mx-auto mb-16">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-heading font-bold text-gray-900 mb-4">Who Must Pay Zakat?</h2>
            <p className="text-gray-600 text-lg">
              Understanding the conditions that make Zakat obligatory
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="card">
              <Users className="w-8 h-8 text-primary-600 mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Eligibility Conditions</h3>
              <ul className="space-y-3">
                <li className="flex items-start">
                  <CheckCircle className="w-5 h-5 text-green-500 mr-2 mt-0.5" />
                  <span className="text-gray-600">Must be a Muslim</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="w-5 h-5 text-green-500 mr-2 mt-0.5" />
                  <span className="text-gray-600">Must be of sound mind (adult)</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="w-5 h-5 text-green-500 mr-2 mt-0.5" />
                  <span className="text-gray-600">Must own wealth above Nisab threshold</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="w-5 h-5 text-green-500 mr-2 mt-0.5" />
                  <span className="text-gray-600">Wealth must be held for one lunar year</span>
                </li>
              </ul>
            </div>

            <div className="card">
              <Coins className="w-8 h-8 text-primary-600 mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Nisab Threshold</h3>
              <p className="text-gray-600 mb-4">
                Nisab is the minimum amount of wealth a Muslim must possess before Zakat becomes obligatory.
              </p>
              <div className="bg-primary-50 p-4 rounded-lg">
                <div className="text-sm text-gray-600 mb-2">Current Nisab (Gold Standard):</div>
                <div className="text-2xl font-bold text-primary-600">~$4,000 USD</div>
                <div className="text-xs text-gray-500 mt-1">*Based on 85g of gold</div>
              </div>
            </div>
          </div>
        </div>

        {/* Types of Wealth Subject to Zakat */}
        <div className="max-w-6xl mx-auto mb-16">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-heading font-bold text-gray-900 mb-4">Types of Wealth Subject to Zakat</h2>
            <p className="text-gray-600 text-lg">
              Different categories of wealth have different Zakat calculations
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="card text-center">
              <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Coins className="w-6 h-6 text-yellow-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Cash & Savings</h3>
              <p className="text-sm text-gray-600 mb-3">Money in bank accounts, cash at hand</p>
              <div className="text-primary-600 font-bold">2.5%</div>
            </div>

            <div className="card text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Scale className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Gold & Silver</h3>
              <p className="text-sm text-gray-600 mb-3">Jewelry, coins, bullion</p>
              <div className="text-primary-600 font-bold">2.5%</div>
            </div>

            <div className="card text-center">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Heart className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Investments</h3>
              <p className="text-sm text-gray-600 mb-3">Stocks, bonds, mutual funds</p>
              <div className="text-primary-600 font-bold">2.5%</div>
            </div>

            <div className="card text-center">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Business Assets</h3>
              <p className="text-sm text-gray-600 mb-3">Trade goods, inventory</p>
              <div className="text-primary-600 font-bold">2.5%</div>
            </div>
          </div>
        </div>

        {/* Call to Action */}
        <div className="text-center">
          <h2 className="text-3xl font-heading font-bold text-gray-900 mb-4">Ready to Calculate Your Zakat?</h2>
          <p className="text-gray-600 max-w-3xl mx-auto mb-8">
            Use our comprehensive Zakat calculator to determine your obligation and fulfill this important pillar of Islam.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/zakat-calculator" className="btn-primary inline-flex items-center">
              <Calculator className="w-5 h-5 mr-2" />
              Calculate Zakat
            </Link>
            <Link to="/donate" className="btn-outline inline-flex items-center">
              Pay Zakat Now
              <ArrowRight className="w-5 h-5 ml-2" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ZakatEducation