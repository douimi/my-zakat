import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import SEOHead from '../components/SEOHead'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

type Status = 'pending' | 'success' | 'error'

const Unsubscribe = () => {
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState<Status>('pending')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) {
      setStatus('error')
      setMessage('No unsubscribe token provided.')
      return
    }
    ;(async () => {
      try {
        const resp = await fetch(`${API_URL}/api/marketing/unsubscribe?token=${encodeURIComponent(token)}`)
        if (resp.ok) {
          const data = await resp.json()
          setEmail(data.email || '')
          setMessage(data.message || 'You have been unsubscribed.')
          setStatus('success')
        } else {
          const err = await resp.json().catch(() => ({ detail: 'Invalid link' }))
          setMessage(typeof err.detail === 'string' ? err.detail : 'This unsubscribe link is invalid or expired.')
          setStatus('error')
        }
      } catch {
        setMessage('Network error. Please try again or contact us at info@myzakat.org.')
        setStatus('error')
      }
    })()
  }, [searchParams])

  return (
    <div className="min-h-[70vh] bg-gray-50 py-12 sm:py-16">
      <SEOHead title="Unsubscribe" description="Unsubscribe from MyZakat emails." canonicalPath="/unsubscribe" />
      <div className="section-container">
        <div className="card sm:p-8 max-w-md mx-auto text-center" aria-live="polite">
          {status === 'pending' && (
            <>
              <Loader2 className="w-10 h-10 mx-auto text-primary-600 animate-spin mb-4" aria-hidden="true" />
              <h1 className="text-xl font-heading font-bold text-gray-900">Processing your request…</h1>
            </>
          )}
          {status === 'success' && (
            <>
              <CheckCircle2 className="w-10 h-10 mx-auto text-accent-600 mb-4" aria-hidden="true" />
              <h1 className="text-2xl font-heading font-bold text-gray-900 mb-3">You're unsubscribed</h1>
              {email && <p className="text-sm text-gray-500 mb-2">{email}</p>}
              <p className="text-gray-600 leading-relaxed mb-6">{message}</p>
              <p className="text-sm text-gray-500 mb-6">
                Changed your mind? You can re-subscribe anytime from our website.
              </p>
              <Link to="/" className="btn-primary">
                Back to Home
              </Link>
            </>
          )}
          {status === 'error' && (
            <>
              <AlertCircle className="w-10 h-10 mx-auto text-red-600 mb-4" aria-hidden="true" />
              <h1 className="text-2xl font-heading font-bold text-gray-900 mb-3">Something went wrong</h1>
              <p className="text-gray-600 leading-relaxed mb-6">{message}</p>
              <p className="text-sm text-gray-500 mb-6">
                If you continue to receive emails, email <a href="mailto:info@myzakat.org" className="link">info@myzakat.org</a> directly and we'll remove you manually.
              </p>
              <Link to="/" className="btn-secondary">
                Back to Home
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default Unsubscribe
