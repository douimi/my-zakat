import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { Mail, CheckCircle, XCircle, Loader } from 'lucide-react'

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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-6 ${
            status === 'success' ? 'bg-green-500' : status === 'error' ? 'bg-red-500' : 'bg-blue-600'
          }`}>
            {status === 'loading' && <Loader className="w-8 h-8 text-white animate-spin" />}
            {status === 'success' && <CheckCircle className="w-8 h-8 text-white" />}
            {status === 'error' && <XCircle className="w-8 h-8 text-white" />}
          </div>
          <h2 className="text-3xl font-bold text-gray-900">
            {status === 'loading' && 'Verifying Email...'}
            {status === 'success' && 'Email Verified!'}
            {status === 'error' && 'Verification Failed'}
          </h2>
        </div>

        <div className="bg-white rounded-lg shadow-md p-8">
          {status === 'loading' && (
            <div className="text-center">
              <p className="text-gray-600">Please wait while we verify your email address...</p>
            </div>
          )}

          {status === 'success' && (
            <div className="text-center space-y-4">
              <p className="text-green-600 font-medium">{message}</p>
              <p className="text-sm text-gray-600">Redirecting to login page...</p>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
                {message}
              </div>

              <div className="border-t pt-4">
                <p className="text-sm text-gray-600 mb-4">Didn't receive the verification email?</p>
                <form onSubmit={handleResendVerification} className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <Mail className="w-4 h-4 inline mr-1" />
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={resendEmail}
                      onChange={(e) => setResendEmail(e.target.value)}
                      required
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Enter your email"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={resending}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition duration-200 flex items-center justify-center"
                  >
                    {resending ? (
                      <>
                        <Loader className="w-5 h-5 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Mail className="w-5 h-5 mr-2" />
                        Resend Verification Email
                      </>
                    )}
                  </button>
                </form>
                {resendSuccess && (
                  <div className="mt-3 bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-lg text-sm">
                    Verification email sent! Please check your inbox.
                  </div>
                )}
              </div>

              <div className="mt-6 text-center">
                <Link to="/login" className="text-blue-600 hover:text-blue-700 font-medium">
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

