import { useState } from 'react'
import { useMutation } from 'react-query'
import { Heart, Users, Globe, Clock, CheckCircle, ArrowRight } from 'lucide-react'
import { volunteersAPI } from '../utils/api'

const Volunteer = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    interest: ''
  })
  const [submitted, setSubmitted] = useState(false)

  const submitMutation = useMutation(volunteersAPI.create, {
    onSuccess: () => {
      setSubmitted(true)
      setFormData({ name: '', email: '', interest: '' })
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    submitMutation.mutate(formData)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }))
  }

  const volunteerOpportunities = [
    {
      icon: Heart,
      title: 'Food Distribution',
      description: 'Help distribute meals and food packages to families in need',
      commitment: '4-6 hours/week',
      color: 'text-red-600'
    },
    {
      icon: Users,
      title: 'Community Outreach',
      description: 'Connect with communities to identify needs and provide support',
      commitment: '3-5 hours/week',
      color: 'text-blue-600'
    },
    {
      icon: Globe,
      title: 'Educational Support',
      description: 'Assist with educational programs and mentoring for children',
      commitment: '2-4 hours/week',
      color: 'text-green-600'
    },
    {
      icon: Clock,
      title: 'Event Organization',
      description: 'Help organize fundraising events and awareness campaigns',
      commitment: 'Flexible',
      color: 'text-purple-600'
    }
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-primary-600 to-primary-800 text-white py-20">
        <div className="section-container">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-5xl font-heading font-bold mb-6">Volunteer With Us</h1>
            <p className="text-xl text-primary-100 leading-relaxed mb-8">
              Join our community of dedicated volunteers making a real difference in the lives of those who need it most. 
              Your time and skills can help transform communities.
            </p>
            <div className="flex items-center justify-center space-x-4 text-primary-100">
              <CheckCircle className="w-5 h-5" />
              <span>🤝 Join 500+ active volunteers worldwide</span>
            </div>
          </div>
        </div>
      </div>

      {/* Why Volunteer */}
      <div className="section-container py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-heading font-bold text-gray-900 mb-4">Why Volunteer With MyZakat?</h2>
          <p className="text-gray-600 max-w-3xl mx-auto">
            Volunteering with us means being part of a mission that creates lasting impact in communities around the world
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          <div className="card text-center">
            <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Heart className="w-8 h-8 text-primary-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-3">Make a Real Impact</h3>
            <p className="text-gray-600">
              See the direct results of your efforts in the lives of families and communities you help support.
            </p>
          </div>

          <div className="card text-center">
            <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-primary-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-3">Join a Community</h3>
            <p className="text-gray-600">
              Connect with like-minded individuals who share your passion for helping others and creating positive change.
            </p>
          </div>

          <div className="card text-center">
            <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Globe className="w-8 h-8 text-primary-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-3">Grow Personally</h3>
            <p className="text-gray-600">
              Develop new skills, gain valuable experience, and grow personally while serving your community.
            </p>
          </div>
        </div>
      </div>

      {/* Volunteer Opportunities */}
      <div className="bg-white py-16">
        <div className="section-container">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-heading font-bold text-gray-900 mb-4">Volunteer Opportunities</h2>
            <p className="text-gray-600 max-w-3xl mx-auto">
              Choose from various volunteer roles that match your interests, skills, and availability
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {volunteerOpportunities.map((opportunity, index) => (
              <div key={index} className="card hover:shadow-lg transition-shadow duration-300">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0">
                    <opportunity.icon className={`w-8 h-8 ${opportunity.color}`} />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">{opportunity.title}</h3>
                    <p className="text-gray-600 mb-3">{opportunity.description}</p>
                    <div className="flex items-center text-sm text-gray-500">
                      <Clock className="w-4 h-4 mr-1" />
                      <span>Time commitment: {opportunity.commitment}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Volunteer Form */}
      <div className="section-container py-16">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-heading font-bold text-gray-900 mb-4">Ready to Get Started?</h2>
            <p className="text-gray-600">
              Fill out the form below and we'll get in touch with you about volunteer opportunities that match your interests.
            </p>
          </div>

          {submitted ? (
            <div className="card text-center">
              <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
              <h3 className="text-2xl font-semibold text-gray-900 mb-2">Thank You!</h3>
              <p className="text-gray-600 mb-6">
                Your volunteer application has been submitted successfully. We'll be in touch with you soon to discuss opportunities.
              </p>
              <button
                onClick={() => setSubmitted(false)}
                className="btn-outline"
              >
                Submit Another Application
              </button>
            </div>
          ) : (
            <div className="card">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Enter your full name"
                  />
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Enter your email address"
                  />
                </div>

                <div>
                  <label htmlFor="interest" className="block text-sm font-medium text-gray-700 mb-2">
                    Area of Interest *
                  </label>
                  <select
                    id="interest"
                    name="interest"
                    value={formData.interest}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">Select your area of interest</option>
                    <option value="Food Distribution">Food Distribution</option>
                    <option value="Community Outreach">Community Outreach</option>
                    <option value="Educational Support">Educational Support</option>
                    <option value="Event Organization">Event Organization</option>
                    <option value="Administrative Support">Administrative Support</option>
                    <option value="Social Media & Marketing">Social Media & Marketing</option>
                    <option value="Fundraising">Fundraising</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={submitMutation.isLoading}
                  className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitMutation.isLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Submitting...
                    </>
                  ) : (
                    <>
                      Submit Application
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Call to Action */}
      <div className="bg-primary-50 py-16">
        <div className="section-container text-center">
          <h2 className="text-3xl font-heading font-bold text-gray-900 mb-4">
            Have Questions About Volunteering?
          </h2>
          <p className="text-gray-600 max-w-3xl mx-auto mb-8">
            We're here to help you find the perfect volunteer opportunity that matches your skills and interests.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="/contact" className="btn-primary">
              Contact Us
            </a>
            <a href="/about" className="btn-outline">
              Learn More About Us
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Volunteer
