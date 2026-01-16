import { Target, Award, Globe, Shield, TrendingUp, Heart, ArrowRight } from 'lucide-react'
import { useQuery } from 'react-query'
import { settingsAPI } from '../utils/api'

const About = () => {
  const { data: settings } = useQuery('about-settings', settingsAPI.getAll, {
    retry: 1,
    staleTime: 10 * 60 * 1000, // 10 minutes
  })

  const aboutImpactEnabled = settings?.find(s => s.key === 'about_impact_enabled')?.value !== 'false'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-primary-600 to-primary-800 text-white py-20">
        <div className="section-container">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-5xl font-heading font-bold mb-6">About MyZakat – Zakat Distribution Foundation</h1>
            <p className="text-xl text-primary-100 leading-relaxed">
              Empowering communities through transparent and efficient distribution of Zakat and Sadaqa donations, 
              creating meaningful change in the lives of those who need it most.
            </p>
          </div>
        </div>
      </div>

      {/* Our Foundation */}
      <div className="section-container py-16">
        <div className="max-w-5xl mx-auto mb-16">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary-100 text-primary-700 rounded-full text-sm font-semibold mb-6">
              <TrendingUp className="w-4 h-4" />
              <span>Our Foundation</span>
            </div>
            <h2 className="text-4xl lg:text-5xl font-heading font-bold text-gray-900 mb-6">
              Built on Personal Commitment
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
            <div className="bg-gradient-to-br from-primary-50 to-blue-50 rounded-2xl p-8 border border-primary-100 hover:shadow-xl transition-all duration-300">
              <div className="flex items-center mb-6">
                <div className="w-14 h-14 bg-primary-600 rounded-xl flex items-center justify-center mr-4 shadow-lg">
                  <Heart className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900">Personal Beginnings</h3>
              </div>
              <p className="text-gray-700 leading-relaxed text-lg">
                MyZakat Zakat Distribution Foundation emerged from a personal commitment to serving humanity. 
                What began as individual efforts to address immediate needs has grown into a dedicated platform for amplifying charitable impact.
              </p>
            </div>

            <div className="bg-gradient-to-br from-primary-50 to-blue-50 rounded-2xl p-8 border border-primary-100 hover:shadow-xl transition-all duration-300">
              <div className="flex items-center mb-6">
                <div className="w-14 h-14 bg-primary-600 rounded-xl flex items-center justify-center mr-4 shadow-lg">
                  <TrendingUp className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900">Authentic Stories</h3>
              </div>
              <p className="text-gray-700 leading-relaxed text-lg">
                The images and stories throughout our platform represent authentic moments of hope, transformation, 
                and community support, showcasing what can be achieved with personal resources and unwavering commitment.
              </p>
            </div>
          </div>

          <div className="bg-gradient-to-br from-primary-600 to-primary-800 rounded-2xl shadow-2xl p-8 md:p-10 border-2 border-primary-300">
            <div className="flex flex-col md:flex-row items-center gap-6">
              <div className="flex-shrink-0">
                <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center shadow-lg">
                  <Heart className="w-10 h-10 text-primary-600" />
                </div>
              </div>
              <div className="flex-1 text-center md:text-left">
                <p className="text-2xl font-bold text-white mb-2">
                  Look at what was accomplished using only personal resources.
                </p>
                <p className="text-xl text-primary-100">
                  Now imagine what we can achieve together with your support.
                </p>
              </div>
              <div className="flex-shrink-0">
                <a href="/donate" className="bg-white text-primary-600 hover:bg-primary-50 text-lg px-8 py-4 rounded-lg font-semibold flex items-center gap-2 group transition-all duration-300 shadow-lg">
                  Join Us
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mission & Vision */}
      <div className="section-container py-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-16">
          <div className="card">
            <div className="flex items-center mb-6">
              <Target className="w-8 h-8 text-primary-600 mr-3" />
              <h2 className="text-2xl font-heading font-bold text-gray-900">Our Mission</h2>
            </div>
            <p className="text-gray-600 leading-relaxed">
              The Zakat Distribution Foundation (ZDF) is dedicated to alleviating poverty, supporting those in distress, and empowering communities through Zakat and Sadaqa. Founded with a commitment to serving humanity, ZDF ensures that all contributions are used effectively to bring hope and relief to the most vulnerable individuals worldwide.
            </p>
          </div>

          <div className="card">
            <div className="flex items-center mb-6">
              <Globe className="w-8 h-8 text-primary-600 mr-3" />
              <h2 className="text-2xl font-heading font-bold text-gray-900">Our Vision</h2>
            </div>
            <p className="text-gray-600 leading-relaxed">
              To create a world where no one lives in poverty. We believe everyone deserves access to food, water, shelter, and dignity. No one should suffer while others live comfortably.
            </p>
          </div>
        </div>

        {/* Core Values */}
        <div className="text-center mb-12">
          <h2 className="text-3xl font-heading font-bold text-gray-900 mb-4">Our Core Values</h2>
          <p className="text-gray-600 max-w-3xl mx-auto mb-4">
            These fundamental principles guide everything we do and shape our approach to charitable giving
          </p>
          <p className="text-gray-700 font-semibold max-w-3xl mx-auto">
            MyZakat – Zakat Distribution Foundation
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          <div className="text-center">
            <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-primary-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-3">Transparency</h3>
            <p className="text-gray-600">
              Complete visibility into how donations are collected, managed, and distributed to ensure trust and accountability.
            </p>
          </div>

          <div className="text-center">
            <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Heart className="w-8 h-8 text-primary-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-3">Compassion</h3>
            <p className="text-gray-600">
              Treating every beneficiary with dignity and respect while understanding the unique challenges they face.
            </p>
          </div>

          <div className="text-center">
            <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Award className="w-8 h-8 text-primary-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-3">Excellence</h3>
            <p className="text-gray-600">
              Striving for the highest standards in service delivery, operational efficiency, and impact measurement.
            </p>
          </div>
        </div>


        {/* Impact Statistics */}
        {aboutImpactEnabled && (
          <div className="bg-primary-600 rounded-2xl text-white p-8 mb-16">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-heading font-bold mb-4">Our Impact</h2>
              <p className="text-primary-100">
                Together, we've made a significant difference in communities around the world
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              <div className="text-center">
                <div className="text-3xl font-bold mb-2">25,000+</div>
                <div className="text-primary-100">Meals Provided</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold mb-2">1,200+</div>
                <div className="text-primary-100">Families Supported</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold mb-2">800+</div>
                <div className="text-primary-100">Orphans Cared For</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold mb-2">$500K+</div>
                <div className="text-primary-100">Total Raised</div>
              </div>
            </div>
          </div>
        )}

        {/* What We Do */}
        <div className="text-center mb-12">
          <h2 className="text-3xl font-heading font-bold text-gray-900 mb-4">What We Do</h2>
          <p className="text-gray-600 max-w-3xl mx-auto">
            Our comprehensive approach ensures maximum impact and sustainable change
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
          <div className="card">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">Zakat Distribution</h3>
            <p className="text-gray-600 mb-4">
              Facilitating proper calculation and distribution of Zakat according to Islamic guidelines, 
              ensuring your religious obligation is fulfilled while maximizing impact.
            </p>
            <ul className="text-gray-600 space-y-2">
              <li>• Accurate Zakat calculation tools</li>
              <li>• Direct distribution to eligible recipients</li>
              <li>• Full transparency and reporting</li>
            </ul>
          </div>

          <div className="card">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">Emergency Relief</h3>
            <p className="text-gray-600 mb-4">
              Rapid response to natural disasters and humanitarian crises, providing immediate assistance 
              to affected communities.
            </p>
            <ul className="text-gray-600 space-y-2">
              <li>• Emergency food and water supplies</li>
              <li>• Temporary shelter assistance</li>
              <li>• Medical aid and healthcare</li>
            </ul>
          </div>

          <div className="card">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">Education Support</h3>
            <p className="text-gray-600 mb-4">
              Investing in education to break the cycle of poverty through scholarships, school supplies, 
              and educational infrastructure.
            </p>
            <ul className="text-gray-600 space-y-2">
              <li>• Scholarship programs</li>
              <li>• School infrastructure development</li>
              <li>• Educational material distribution</li>
            </ul>
          </div>

          <div className="card">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">Orphan Care</h3>
            <p className="text-gray-600 mb-4">
              Comprehensive support for orphaned children including housing, education, healthcare, 
              and emotional support.
            </p>
            <ul className="text-gray-600 space-y-2">
              <li>• Monthly sponsorship programs</li>
              <li>• Healthcare and nutrition</li>
              <li>• Educational and vocational training</li>
            </ul>
          </div>
        </div>

        {/* Call to Action */}
        <div className="text-center">
          <h2 className="text-3xl font-heading font-bold text-gray-900 mb-4">Join Our Mission</h2>
          <p className="text-gray-600 max-w-3xl mx-auto mb-8">
            Whether through donations, volunteering, or spreading awareness, there are many ways to 
            be part of our mission to create positive change in the world.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="/donate" className="btn-primary">
              Make a Donation
            </a>
            <a href="/volunteer" className="btn-outline">
              Become a Volunteer
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

export default About
