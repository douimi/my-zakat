import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { LogIn } from 'lucide-react'
import { useAuthStore, User } from '../store/authStore'
import SEOHead from '../components/SEOHead'

interface LoginForm {
  email: string
  password: string
}

const UserLogin = () => {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null)
  const [resending, setResending] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>()
  const { login, isAuthenticated, isAdmin } = useAuthStore()
  const location = useLocation()

  useEffect(() => {
    // Check for success message from registration
    if (location.state?.message) {
      setSuccessMessage(location.state.message)
    }
  }, [location])

  if (isAuthenticated) {
    // Redirect to home page after login
    return <Navigate to="/" replace />
  }

  const handleResendVerification = async () => {
    if (!unverifiedEmail) return
    
    setResending(true)
    setError('')
    
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_URL}/api/auth/resend-verification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: unverifiedEmail }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Failed to resend verification email' }))
        throw new Error(errorData.detail || 'Failed to resend verification email')
      }

      setError('')
      setSuccessMessage('Verification email sent successfully! Please check your inbox.')
      setUnverifiedEmail(null)
    } catch (err: any) {
      setError(err.message || 'Failed to resend verification email. Please try again.')
    } finally {
      setResending(false)
    }
  }

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true)
    setError('')
    setSuccessMessage('')
    setUnverifiedEmail(null)
    
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
      
      // Login request
      const loginResponse = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })

      if (!loginResponse.ok) {
        const errorData = await loginResponse.json().catch(() => ({ detail: 'Login failed' }))
        
        if (loginResponse.status === 422) {
          // Validation error
          if (errorData.detail && Array.isArray(errorData.detail)) {
            // Pydantic validation errors
            const validationErrors = errorData.detail.map((error: any) => error.msg).join(', ')
            throw new Error(`Validation error: ${validationErrors}`)
          } else {
            throw new Error('Please check your email format and try again')
          }
        } else if (loginResponse.status === 401) {
          throw new Error('Incorrect email or password')
        } else if (loginResponse.status === 403) {
          // Check if it's an unverified email error
          if (errorData.detail && errorData.detail.includes('Email not verified')) {
            setUnverifiedEmail(data.email)
            throw new Error('Email not verified. Please check your email for the verification link.')
          } else {
            throw new Error('Account is inactive. Please contact support.')
          }
        } else {
          throw new Error(errorData.detail || 'Login failed')
        }
      }

      const loginData = await loginResponse.json()
      
      // Fetch user details
      const userResponse = await fetch(`${API_URL}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${loginData.access_token}`,
        },
      })

      if (!userResponse.ok) {
        throw new Error('Failed to fetch user details')
      }

      const userData: User = await userResponse.json()
      
      // Store user data and token
      login(userData, loginData.access_token)
    } catch (err: any) {
      console.error('Login error:', err)
      setError(err.message || 'An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <SEOHead title="Sign in" canonicalPath="/login" noindex />
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <Link to="/" className="inline-block mb-6">
            <img src="/logo.png" alt="MyZakat home" className="h-12 mx-auto" />
          </Link>
          <h1 className="text-3xl font-heading font-bold text-gray-900">Welcome Back</h1>
          <p className="mt-2 text-sm text-gray-600">
            Sign in to manage your donations
          </p>
        </div>

        <div className="card sm:p-8">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {successMessage && (
              <div className="alert-success" role="status">
                {successMessage}
              </div>
            )}

            {error && (
              <div className="alert-error" role="alert">
                <div className="flex-1">
                  {error}
                  {unverifiedEmail && (
                    <div className="mt-3 pt-3 border-t border-red-200">
                      <p className="mb-2">Need a new verification email?</p>
                      <button
                        type="button"
                        onClick={handleResendVerification}
                        disabled={resending}
                        className="btn-primary btn-sm w-full"
                      >
                        {resending ? 'Sending...' : 'Resend Verification Email'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div>
              <label htmlFor="login-email" className="label">
                Email Address
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? 'login-email-error' : undefined}
                {...register('email', {
                  required: 'Email is required',
                  pattern: {
                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                    message: 'Invalid email address',
                  },
                })}
                className="input-field"
                placeholder="Enter your email"
              />
              {errors.email && (
                <p id="login-email-error" className="field-error">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="login-password" className="label">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={errors.password ? 'login-password-error' : undefined}
                {...register('password', { required: 'Password is required' })}
                className="input-field"
                placeholder="Enter your password"
              />
              {errors.password && (
                <p id="login-password-error" className="field-error">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2" aria-hidden="true"></div>
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn className="w-5 h-5 mr-2" aria-hidden="true" />
                  Sign In
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Don't have an account?{' '}
              <Link to="/register" className="link">
                Create one
              </Link>
            </p>
          </div>
        </div>

        {/* Partner teams who applied for funding land here too: point them to their portal. */}
        <div className="text-center space-y-2 text-sm text-gray-600">
          <p>
            Applied for project funding?{' '}
            <Link to="/my-proposals" className="link">Check your proposal</Link>
          </p>
          <p>
            <Link to="/" className="link">Back to the website</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default UserLogin

