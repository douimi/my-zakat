import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MessageCircle, CheckCircle2, AlertCircle, ShieldCheck, Phone } from 'lucide-react'
import SEOHead from '../components/SEOHead'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// IMPORTANT: this exact wording is also stored in the subscriptions table
// alongside the user's consent so we can prove later exactly what they agreed
// to. If you change the visible disclosure, copy the new wording here verbatim.
const CONSENT_TEXT = (
  'By checking this box and submitting this form, I agree to receive recurring ' +
  'text messages from MyZakat at the mobile number provided, including donation ' +
  'receipts, campaign updates, urgent-need appeals, and event reminders. Message ' +
  'frequency varies (typically up to 4 messages per month). Message and data ' +
  'rates may apply. Reply HELP for help and STOP to opt out at any time. My ' +
  'consent is not required as a condition of purchasing any goods or services, ' +
  'or of making a donation.'
)

type Status = 'idle' | 'submitting' | 'success' | 'error'

const SmsOptIn = () => {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [consent, setConsent] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!consent) {
      setErrorMessage('Please check the consent box to confirm you agree to receive text messages.')
      setStatus('error')
      return
    }

    setStatus('submitting')
    setErrorMessage('')

    try {
      const resp = await fetch(`${API_URL}/api/subscriptions/sms-opt-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          consent,
          agreed_to_text: CONSENT_TEXT,
        }),
      })

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({ detail: 'Submission failed' }))
        const detail = typeof data.detail === 'string'
          ? data.detail
          : 'We couldn\'t submit your request. Please try again.'
        setErrorMessage(detail)
        setStatus('error')
        return
      }

      const data = await resp.json()
      setSuccessMessage(data.message || 'You\'re subscribed.')
      setStatus('success')
    } catch {
      setErrorMessage('Network error. Please check your connection and try again.')
      setStatus('error')
    }
  }

  // ── Success view ──────────────────────────────────────────────
  if (status === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-blue-50 py-16">
        <SEOHead
          title="SMS Subscription Confirmed"
          description="You're subscribed to text-message updates from MyZakat."
          canonicalPath="/sms-opt-in"
        />
        <div className="section-container">
          <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-lg p-8 sm:p-10 text-center">
            <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-6">
              <CheckCircle2 className="w-9 h-9 text-green-600" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-heading font-bold text-gray-900 mb-3">
              You're subscribed!
            </h1>
            <p className="text-gray-600 leading-relaxed mb-6">
              {successMessage}
            </p>
            <p className="text-sm text-gray-500 mb-8">
              You can opt out at any time by replying <strong>STOP</strong> to any of our
              messages, emailing <a href="mailto:info@myzakat.org" className="text-primary-600 hover:underline">info@myzakat.org</a>,
              or calling 1-833-MYZAKAT.
            </p>
            <Link
              to="/"
              className="inline-block bg-primary-600 hover:bg-primary-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ── Form view ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <SEOHead
        title="Subscribe to SMS Updates"
        description="Opt in to receive text-message updates from MyZakat: donation receipts, campaign news, urgent-need appeals, and event reminders."
        canonicalPath="/sms-opt-in"
      />
      <div className="section-container">
        <div className="max-w-2xl mx-auto">

          {/* Header */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-600 rounded-full mb-5 shadow-md">
              <MessageCircle className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-heading font-bold text-gray-900 mb-3">
              Get Text Updates from MyZakat
            </h1>
            <p className="text-lg text-gray-600 max-w-xl mx-auto">
              Receive donation receipts, campaign updates, urgent-need appeals, and event
              reminders directly to your phone — no app, no spam, opt out any time.
            </p>
          </div>

          {/* What you'll get */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
            <h2 className="text-base font-semibold text-gray-900 mb-3 flex items-center">
              <ShieldCheck className="w-5 h-5 text-primary-600 mr-2" />
              What you can expect
            </h2>
            <ul className="text-sm text-gray-700 space-y-2 leading-relaxed">
              <li>• Up to ~4 messages per month — message frequency varies</li>
              <li>• Donation receipts, campaign news, and urgent-need appeals</li>
              <li>• Reply <strong>STOP</strong> at any time to unsubscribe</li>
              <li>• Reply <strong>HELP</strong> for support</li>
              <li>• Message &amp; data rates may apply (your carrier's standard rates)</li>
            </ul>
          </div>

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-xl shadow-md border border-gray-100 p-6 sm:p-8 space-y-5"
            aria-label="SMS opt-in form"
          >
            <div>
              <label htmlFor="optin-name" className="block text-sm font-medium text-gray-700 mb-1">
                Full name <span className="text-red-500">*</span>
              </label>
              <input
                id="optin-name"
                type="text"
                required
                minLength={2}
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="Your full name"
                autoComplete="name"
              />
            </div>

            <div>
              <label htmlFor="optin-phone" className="block text-sm font-medium text-gray-700 mb-1">
                Mobile phone number <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="optin-phone"
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="(555) 123-4567"
                  autoComplete="tel-national"
                  inputMode="tel"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                US mobile numbers only. Standard formats accepted.
              </p>
            </div>

            <div>
              <label htmlFor="optin-email" className="block text-sm font-medium text-gray-700 mb-1">
                Email <span className="text-gray-400 text-xs">(optional)</span>
              </label>
              <input
                id="optin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>

            {/* The consent checkbox — must be unchecked by default for compliance */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-1 w-4 h-4 text-primary-600 rounded border-gray-400 focus:ring-2 focus:ring-primary-500 flex-shrink-0"
                  aria-describedby="consent-text"
                />
                <span id="consent-text" className="text-sm text-gray-800 leading-relaxed">
                  {CONSENT_TEXT} View our{' '}
                  <Link to="/privacy-policy" className="text-primary-700 font-medium hover:underline">
                    Privacy Policy
                  </Link>{' '}
                  and{' '}
                  <Link to="/terms-of-service" className="text-primary-700 font-medium hover:underline">
                    Terms of Service
                  </Link>.
                </span>
              </label>
            </div>

            {status === 'error' && errorMessage && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={status === 'submitting' || !consent}
              className="w-full bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {status === 'submitting' ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Subscribing...
                </>
              ) : (
                'Opt In to Text Messages'
              )}
            </button>

            <p className="text-xs text-center text-gray-500">
              Already subscribed? Reply <strong>STOP</strong> to any message to unsubscribe.
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}

export default SmsOptIn
