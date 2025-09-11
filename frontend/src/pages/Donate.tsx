import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useSearchParams } from 'react-router-dom'
import { useStripe, useElements, CardElement } from '@stripe/react-stripe-js'
import { Heart, Shield, CheckCircle, CreditCard } from 'lucide-react'
import { donationsAPI } from '../utils/api'

interface DonationForm {
  name: string
  email: string
  amount: number
  frequency: string
  purpose: string
}

const Donate = () => {
  const [searchParams] = useSearchParams()
  const [isProcessing, setIsProcessing] = useState(false)
  const [selectedAmount, setSelectedAmount] = useState<number | null>(
    searchParams.get('zakat_amount') ? parseFloat(searchParams.get('zakat_amount')!) : null
  )
  
  const stripe = useStripe()
  const elements = useElements()

  const { register, handleSubmit, setValue, watch } = useForm<DonationForm>({
    defaultValues: {
      name: '',
      email: '',
      amount: selectedAmount || 0,
      frequency: 'One-Time',
      purpose: searchParams.get('zakat_amount') ? 'Zakat' : 'General Donation'
    }
  })

  const watchedAmount = watch('amount')

  const quickAmounts = [25, 50, 100, 250, 500, 1000]
  const purposes = [
    'General Donation',
    'Zakat',
    'Emergency Relief',
    'Orphan Care',
    'Food & Water Aid',
    'Education',
    'Healthcare'
  ]

  const onSubmit = async (data: DonationForm) => {
    if (!stripe || !elements) return

    setIsProcessing(true)
    try {
      // Create payment session
      const session = await donationsAPI.createPaymentSession({
        amount: data.amount,
        name: data.name,
        email: data.email,
        purpose: data.purpose,
        frequency: data.frequency
      })

      // Redirect to Stripe Checkout
      const { error } = await stripe.redirectToCheckout({
        sessionId: session.id
      })

      if (error) {
        console.error('Stripe error:', error)
      }
    } catch (error) {
      console.error('Payment error:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="section-container">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-600 rounded-full mb-6">
            <Heart className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl lg:text-5xl font-heading font-bold text-gray-900 mb-4">
            Make a Donation
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Your generosity creates real change. Every donation, no matter the size, 
            makes a meaningful difference in someone's life.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Donation Form */}
          <div className="lg:col-span-2">
            <div className="card">
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                {/* Amount Selection */}
                <div>
                  <label className="block text-lg font-semibold text-gray-900 mb-4">
                    Donation Amount
                  </label>
                  
                  {/* Quick Amount Buttons */}
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4">
                    {quickAmounts.map((amount) => (
                      <button
                        key={amount}
                        type="button"
                        onClick={() => {
                          setSelectedAmount(amount)
                          setValue('amount', amount)
                        }}
                        className={`py-3 px-4 rounded-lg border-2 font-semibold transition-all ${
                          selectedAmount === amount
                            ? 'border-primary-600 bg-primary-50 text-primary-600'
                            : 'border-gray-300 hover:border-primary-300 text-gray-700'
                        }`}
                      >
                        ${amount}
                      </button>
                    ))}
                  </div>

                  {/* Custom Amount */}
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <span className="text-gray-500 text-lg">$</span>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      placeholder="Enter custom amount"
                      {...register('amount', { required: true, min: 1, valueAsNumber: true })}
                      className="input-field pl-8 text-lg"
                      onChange={(e) => {
                        const value = parseFloat(e.target.value)
                        setSelectedAmount(isNaN(value) ? null : value)
                      }}
                    />
                  </div>
                </div>

                {/* Purpose */}
                <div>
                  <label className="block text-lg font-semibold text-gray-900 mb-2">
                    Purpose
                  </label>
                  <select {...register('purpose')} className="input-field">
                    {purposes.map((purpose) => (
                      <option key={purpose} value={purpose}>
                        {purpose}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Frequency */}
                <div>
                  <label className="block text-lg font-semibold text-gray-900 mb-2">
                    Frequency
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {['One-Time', 'Monthly', 'Annually'].map((freq) => (
                      <label key={freq} className="flex items-center">
                        <input
                          type="radio"
                          value={freq}
                          {...register('frequency')}
                          className="mr-3 text-primary-600"
                        />
                        <span className="text-gray-700">{freq}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Personal Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      {...register('name', { required: true })}
                      className="input-field"
                      placeholder="Enter your full name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email Address *
                    </label>
                    <input
                      type="email"
                      {...register('email', { required: true })}
                      className="input-field"
                      placeholder="Enter your email"
                    />
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isProcessing || !watchedAmount || watchedAmount < 1}
                  className="btn-primary w-full text-lg py-4 flex items-center justify-center"
                >
                  {isProcessing ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                      Processing...
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-5 h-5 mr-2" />
                      Proceed to Payment
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Impact Preview */}
            {watchedAmount > 0 && (
              <div className="card bg-gradient-to-br from-primary-50 to-blue-50 border-primary-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Impact</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-700">Meals provided:</span>
                    <span className="font-semibold">{Math.floor(watchedAmount / 5)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">Families helped:</span>
                    <span className="font-semibold">{Math.floor(watchedAmount / 100)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">Children supported:</span>
                    <span className="font-semibold">{Math.floor(watchedAmount / 50)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Security & Trust */}
            <div className="card">
              <div className="flex items-center mb-4">
                <Shield className="w-6 h-6 text-green-600 mr-3" />
                <h3 className="text-lg font-semibold text-gray-900">Secure & Trusted</h3>
              </div>
              <div className="space-y-3 text-sm text-gray-600">
                <div className="flex items-center">
                  <CheckCircle className="w-4 h-4 text-green-600 mr-2" />
                  <span>256-bit SSL encryption</span>
                </div>
                <div className="flex items-center">
                  <CheckCircle className="w-4 h-4 text-green-600 mr-2" />
                  <span>PCI DSS compliant</span>
                </div>
                <div className="flex items-center">
                  <CheckCircle className="w-4 h-4 text-green-600 mr-2" />
                  <span>100% transparent usage</span>
                </div>
                <div className="flex items-center">
                  <CheckCircle className="w-4 h-4 text-green-600 mr-2" />
                  <span>Instant tax receipt</span>
                </div>
              </div>
            </div>

            {/* Recent Donations */}
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Donations</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Sarah M.</span>
                  <span className="font-semibold text-green-600">$250</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Ahmed K.</span>
                  <span className="font-semibold text-green-600">$100</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Anonymous</span>
                  <span className="font-semibold text-green-600">$500</span>
                </div>
                <div className="text-center pt-3 border-t border-gray-200">
                  <span className="text-primary-600 font-medium">Join 10,000+ donors</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Donate
