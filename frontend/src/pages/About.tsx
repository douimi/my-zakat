import { Heart, Users, Target, Award, Globe, Shield } from 'lucide-react'

const About = () => {
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

      {/* Mission & Vision */}
      <div className="section-container py-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-16">
          <div className="card">
            <div className="flex items-center mb-6">
              <Target className="w-8 h-8 text-primary-600 mr-3" />
              <h2 className="text-2xl font-heading font-bold text-gray-900">Our Mission</h2>
            </div>
            <p className="text-gray-600 leading-relaxed">
              MyZakat – Zakat Distribution Foundation is committed to creating a world where no one suffers from poverty or hunger by facilitating the efficient 
              and transparent distribution of Islamic charitable donations. We strive to connect generous 
              hearts with those in need, following the principles of Zakat and Sadaqa as outlined in Islam.
            </p>
          </div>

          <div className="card">
            <div className="flex items-center mb-6">
              <Globe className="w-8 h-8 text-primary-600 mr-3" />
              <h2 className="text-2xl font-heading font-bold text-gray-900">Our Vision</h2>
            </div>
            <p className="text-gray-600 leading-relaxed">
              MyZakat – Zakat Distribution Foundation envisions being the leading platform for Islamic charitable giving, known for our transparency, 
              efficiency, and impact. We envision a global community where charitable giving is 
              accessible, trusted, and creates lasting positive change in communities worldwide.
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

        {/* What We Do */}
        <div className="text-center mb-12">
          <h2 className="text-3xl font-heading font-bold text-gray-900 mb-4">What We Do</h2>
          <p className="text-gray-600 max-w-3xl mx-auto">
            Our comprehensive approach to charitable giving ensures maximum impact and sustainable change
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
          <div className="card">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">Zakat Distribution</h3>
            <p className="text-gray-600 mb-4">
              We facilitate the proper calculation and distribution of Zakat according to Islamic guidelines, 
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
              to affected communities when they need it most.
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
              Investing in education to break the cycle of poverty, providing scholarships, school supplies, 
              and educational infrastructure to underserved communities.
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
              and emotional support to ensure they have the best possible future.
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
