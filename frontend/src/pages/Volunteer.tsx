import { useState } from 'react'
import { useMutation } from 'react-query'
import { CheckCircle, ArrowRight } from 'lucide-react'
import { volunteersAPI } from '../utils/api'
import SEOHead from '../components/SEOHead'
import PageHeader from '../components/ui/PageHeader'

const VOLUNTEER_ROLES = [
  { title: 'Food Distribution', description: 'Pack and hand out meals and food parcels to families in need.' },
  { title: 'Community Outreach', description: 'Help us find the families and communities who need support.' },
  { title: 'Educational Support', description: 'Assist with educational programs and mentoring for children.' },
  { title: 'Event Organization', description: 'Help run fundraising events and awareness campaigns.' },
]

const INTEREST_OPTIONS = [
  'Food Distribution',
  'Community Outreach',
  'Educational Support',
  'Event Organization',
  'Administrative Support',
  'Social Media & Marketing',
  'Fundraising',
  'Other',
]

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

  return (
    <div className="min-h-screen bg-white">
      <SEOHead
        title="Volunteer With Us"
        description="Join MyZakat as a volunteer. Contribute your time and skills to help distribute Zakat, support community programs, and make a difference."
        canonicalPath="/volunteer"
      />
      <PageHeader
        title="Volunteer With Us"
        description="Help pack food, run events, or do outreach in your community. Tell us what you'd like to do and we'll get back to you."
      />

      <div className="section-container section">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 lg:gap-14">
          {/* The form comes first: it is the one thing to do on this page. */}
          <div className="lg:col-span-3">
            {submitted ? (
              <div className="card text-center" role="status">
                <CheckCircle className="w-12 h-12 text-green-700 mx-auto mb-4" aria-hidden="true" />
                <h2 className="text-2xl font-semibold text-gray-900 mb-2">Thank You!</h2>
                <p className="text-gray-600 mb-6">
                  Your volunteer application has been sent. We'll be in touch soon.
                </p>
                <button
                  type="button"
                  onClick={() => setSubmitted(false)}
                  className="btn-secondary"
                >
                  Submit Another Application
                </button>
              </div>
            ) : (
              <div className="card sm:p-8">
                <h2 className="text-xl font-semibold text-gray-900 mb-6">Volunteer application</h2>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label htmlFor="name" className="label">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      autoComplete="name"
                      className="input-field"
                      placeholder="Enter your full name"
                    />
                  </div>

                  <div>
                    <label htmlFor="email" className="label">
                      Email Address *
                    </label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      required
                      autoComplete="email"
                      className="input-field"
                      placeholder="Enter your email address"
                    />
                  </div>

                  <div>
                    <label htmlFor="interest" className="label">
                      Area of Interest *
                    </label>
                    <select
                      id="interest"
                      name="interest"
                      value={formData.interest}
                      onChange={handleChange}
                      required
                      className="input-field"
                    >
                      <option value="">Select your area of interest</option>
                      {INTEREST_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>

                  {submitMutation.isError && (
                    <p className="alert-error" role="alert">
                      We could not send your application. Please try again, or email us at info@myzakat.org.
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={submitMutation.isLoading}
                    className="w-full btn-primary gap-2"
                  >
                    {submitMutation.isLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" aria-hidden="true"></div>
                        Submitting...
                      </>
                    ) : (
                      <>
                        Submit Application
                        <ArrowRight className="w-4 h-4" aria-hidden="true" />
                      </>
                    )}
                  </button>
                </form>
              </div>
            )}

            <p className="mt-6 text-sm text-gray-600">
              Questions? Email{' '}
              <a href="mailto:info@myzakat.org" className="link">info@myzakat.org</a>.
            </p>
          </div>

          {/* Compact list of roles */}
          <section className="lg:col-span-2" aria-labelledby="volunteer-roles">
            <h2 id="volunteer-roles" className="text-lg font-semibold text-gray-900 mb-4">Ways to help</h2>
            <ul className="divide-y divide-gray-200 border-y border-gray-200">
              {VOLUNTEER_ROLES.map((role) => (
                <li key={role.title} className="py-4">
                  <h3 className="font-medium text-gray-900">{role.title}</h3>
                  <p className="mt-1 text-sm text-gray-600">{role.description}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}

export default Volunteer
