import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { Mail, CheckCircle, XCircle, Loader } from 'lucide-react'
import SEOHead from '../components/SEOHead'

const VerifyEmail = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [resending, setResending] = useState(false)
  const [resendEmail, setResendEmail] = useState('')
  const [resendSuccess, setResendSuccess] = useState(false)

  useEffect(() => {
    const token = searchParams.get('token')
    
    if (!token) {
      setStatus('error')
      setMessage('Invalid verification link. No token provided.')
      return
    }

    verifyEmail(token)
  }, [searchParams])

  const verifyEmail = async (token: string) => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_URL}/api/auth/verify-email?token=${encodeURIComponent(token)}`, {
        method: 'GET',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Verification failed' }))
        throw new Error(errorData.detail || 'Verification failed')
      }

      const data = await response.json()
      setStatus('success')
      setMessage(data.message || 'Email verified successfully!')
      
      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate('/login', { state: { message: 'Email verified successfully! You can now log in.' } })
      }, 3000)
    } catch (err: any) {
      setStatus('error')
      setMessage(err.message || 'Failed to verify email. Please try again.')
    }
  }

  const handleResendVerification = async (e: React.FormEvent) => {
    e.preventDefault()
    setResending(true)
    setResendSuccess(false)

    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_URL}/api/auth/resend-verification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: resendEmail }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Failed to resend verification email' }))
        throw new Error(errorData.detail || 'Failed to resend verification email')
      }

      const data = await response.json()
      setResendSuccess(true)
      setMessage(data.message || 'Verification email sent successfully!')
    } catch (err: any) {
      setMessage(err.message || 'Failed to resend verification email. Please try again.')
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <SEOHead title="Verify your email" canonicalPath="/verify-email" noindex />
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <Link to="/" className="inline-block mb-6">
            <img src="/logo.png" alt="MyZakat home" className="h-12 mx-auto" />
          </Link>
          <h1 className="text-3xl font-heading font-bold text-gray-900 inline-flex items-center gap-2">
            {status === 'loading' && <Loader className="w-7 h-7 text-primary-600 animate-spin" aria-hidden="true" />}
            {status === 'success' && <CheckCircle className="w-7 h-7 text-green-700" aria-hidden="true" />}
            {status === 'error' && <XCircle className="w-7 h-7 text-red-700" aria-hidden="true" />}
            <span>
              {status === 'loading' && 'Verifying Email...'}
              {status === 'success' && 'Email Verified!'}
              {status === 'error' && 'Verification Failed'}
            </span>
          </h1>
        </div>

        <div className="card sm:p-8">
          {status === 'loading' && (
            <div className="text-center" role="status">
              <p className="text-gray-600">Please wait while we verify your email address...</p>
            </div>
          )}

          {status === 'success' && (
            <div className="text-center space-y-4" role="status">
              <p className="text-green-800 font-medium">{message}</p>
              <p className="text-sm text-gray-600">Redirecting to login page...</p>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-4">
              <div className="alert-error" role="alert">
                {message}
              </div>

              <div className="border-t pt-4">
                <p className="text-sm text-gray-600 mb-4">Didn't receive the verification email?</p>
                <form onSubmit={handleResendVerification} className="space-y-3">
                  <div>
                    <label htmlFor="verify-resend-email" className="label">
                      Email Address
                    </label>
                    <input
                      id="verify-resend-email"
                      type="email"
                      autoComplete="email"
                      value={resendEmail}
                      onChange={(e) => setResendEmail(e.target.value)}
                      required
                      className="input-field"
                      placeholder="Enter your email"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={resending}
                    className="btn-primary w-full"
                  >
                    {resending ? (
                      <>
                        <Loader className="w-5 h-5 mr-2 animate-spin" aria-hidden="true" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Mail className="w-5 h-5 mr-2" aria-hidden="true" />
                        Resend Verification Email
                      </>
                    )}
                  </button>
                </form>
                {resendSuccess && (
                  <div className="mt-3 alert-success" role="status">
                    Verification email sent! Please check your inbox.
                  </div>
                )}
              </div>

              <div className="mt-6 text-center">
                <Link to="/login" className="link">
                  Back to Login
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default VerifyEmail
