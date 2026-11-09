import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MessageCircle, CheckCircle2, AlertCircle, ShieldCheck, Phone } from 'lucide-react'
import SEOHead from '../components/SEOHead'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// TCR / 10DLC-compliant disclosure. Matches the RingCentral TCR template
// verbatim — the message category must be exactly "Customer care" because
// that is the campaign use case we registered. Any broader wording puts
// the campaign out of scope with the carrier.
//
// This exact string is stored on the subscription row alongside the
// timestamp and IP so we can prove later exactly what the subscriber
// agreed to. If you edit the visible label, update this constant
// verbatim to keep the audit trail truthful.
const CONSENT_TEXT = (
  'By checking this box, I agree to receive SMS messages about Customer ' +
  'care from MyZakat at the phone number provided above. Message ' +
  'frequency may vary. Message and data rates may apply. Text HELP to ' +
  '1-833-699-2528 for assistance. Reply STOP to opt out of receiving ' +
  'SMS messages.'
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
  // Remembered from the last submit so the success screen can show either
  // the "you're subscribed" or the "you didn't opt in" variant.
  const [submittedWithConsent, setSubmittedWithConsent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Per 10DLC / TCR the SMS consent box is optional and this form must
    // submit whether or not it's ticked. The backend accepts consent=false
    // as a no-op (no subscription created, no consent trail recorded) and
    // returns a friendly success message the confirmation view repeats.
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
      setSuccessMessage(data.message || (consent ? "You're subscribed." : 'Your submission was received.'))
      setSubmittedWithConsent(consent)
      setStatus('success')
    } catch {
      setErrorMessage('Network error. Please check your connection and try again.')
      setStatus('error')
    }
  }

  // ── Success view ──────────────────────────────────────────────
  //
  // Two shapes: an opted-in confirmation (green check, opt-out instructions)
  // and a no-opt-in acknowledgement (neutral primary icon, no opt-out
  // instructions because there's nothing to opt out of).
  if (status === 'success') {
    return (
      <div className="min-h-[70vh] bg-gray-50 py-12 sm:py-16">
        <SEOHead
          title={submittedWithConsent ? 'SMS Subscription Confirmed' : 'SMS Subscription'}
          description="MyZakat SMS Subscription."
          canonicalPath="/sms-opt-in"
        />
        <div className="section-container">
          <div className="card sm:p-10 max-w-xl mx-auto text-center">
            <div className="mb-5">
              {submittedWithConsent
                ? <CheckCircle2 className="w-10 h-10 mx-auto text-accent-600" aria-hidden="true" />
                : <MessageCircle className="w-10 h-10 mx-auto text-primary-600" aria-hidden="true" />}
            </div>
            <h1 className="text-2xl sm:text-3xl font-heading font-bold text-gray-900 mb-3">
              {submittedWithConsent ? "You're subscribed!" : 'Thanks for stopping by'}
            </h1>
            <p className="text-gray-600 leading-relaxed mb-6">
              {successMessage}
            </p>
            {submittedWithConsent && (
              <p className="text-sm text-gray-500 mb-8">
                You can opt out at any time by replying <strong>STOP</strong> to any of our
                messages, emailing <a href="mailto:info@myzakat.org" className="link">info@myzakat.org</a>,
                or calling 1-833-MYZAKAT.
              </p>
            )}
            <Link to="/" className="btn-primary">
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
        title="SMS Subscription"
        description="Subscribe to customer care text messages from MyZakat. The SMS consent box is optional — you can submit the form without opting in."
        canonicalPath="/sms-opt-in"
      />
      <div className="section-container">
        <div className="max-w-2xl mx-auto">

          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl sm:text-4xl font-heading font-bold text-gray-900 mb-3">
              SMS Subscription
            </h1>
            <p className="text-lg text-gray-600 max-w-xl mx-auto">
              Receive customer care text messages from MyZakat directly on your phone.
              No app, no spam, opt out any time.
            </p>
          </div>

          {/* What you'll get */}
          <div className="card mb-6">
            <h2 className="text-base font-semibold text-gray-900 mb-3 flex items-center">
              <ShieldCheck className="w-5 h-5 text-primary-600 mr-2" aria-hidden="true" />
              What you can expect
            </h2>
            <ul className="text-sm text-gray-700 space-y-2 leading-relaxed">
              <li>• Customer care messages from the MyZakat team</li>
              <li>• Message frequency may vary</li>
              <li>• Reply <strong>STOP</strong> at any time to unsubscribe</li>
              <li>• Reply <strong>HELP</strong> for support</li>
              <li>• Message &amp; data rates may apply (your carrier's standard rates)</li>
            </ul>
          </div>

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className="card sm:p-8 space-y-5"
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
                className="input-field"
                placeholder="Your full name"
                autoComplete="name"
              />
            </div>

            <div>
              <label htmlFor="optin-phone" className="block text-sm font-medium text-gray-700 mb-1">
                Mobile phone number <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                <input
                  id="optin-phone"
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="input-field pl-9"
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
                Email <span className="text-gray-500 text-xs">(optional)</span>
              </label>
              <input
                id="optin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>

            {/* The consent checkbox — 10DLC / TCR requires it to be optional
                and unchecked by default. The submit button is never disabled
                on the checkbox state; runtime validation shows a friendly
                message if the user submits without opting in. */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-2">
                SMS consent (optional)
              </p>
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
              <div className="alert-error" role="alert">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
                <span>{errorMessage}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={status === 'submitting'}
              className="btn-primary w-full gap-2"
            >
              {status === 'submitting' ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Submitting...
                </>
              ) : (
                'Submit'
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
