import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { UserPlus, Mail } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import SEOHead from '../components/SEOHead'

interface RegisterForm {
  email: string
  password: string
  confirmPassword: string
  name: string
}

const UserRegister = () => {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null)
  const { register, handleSubmit, watch, formState: { errors } } = useForm<RegisterForm>()
  const { isAuthenticated, userType } = useAuthStore()
  const navigate = useNavigate()

  const password = watch('password')

  if (isAuthenticated && userType === 'user') {
    return <Navigate to="/dashboard" replace />
  }

  const onSubmit = async (data: RegisterForm) => {
    setIsLoading(true)
    setError('')
    
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          name: data.name,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Registration failed')
      }

      // Show verification message
      setRegisteredEmail(data.email)
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleResendVerification = async () => {
    if (!registeredEmail) return
    
    setIsLoading(true)
    setError('')
    
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_URL}/api/auth/resend-verification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: registeredEmail }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to resend verification email')
      }

      setError('')
      // Success will be shown via toast if available, or user will see success message
    } catch (err: any) {
      setError(err.message || 'Failed to resend verification email. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const logo = (
    <Link to="/" className="inline-block mb-6">
      <img src="/logo.png" alt="MyZakat home" className="h-12 mx-auto" />
    </Link>
  )

  // Show verification message after successful registration
  if (registeredEmail) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <SEOHead title="Check your email" canonicalPath="/register" noindex />
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            {logo}
            <h1 className="text-3xl font-heading font-bold text-gray-900">Registration Successful!</h1>
            <p className="mt-2 text-sm text-gray-600">
              Please verify your email address to continue
            </p>
          </div>

          <div className="card sm:p-8">
            <div className="space-y-4">
              <div className="alert-info">
                <div>
                  <p className="font-medium mb-1">We've sent a verification email to:</p>
                  <p className="font-semibold break-all">{registeredEmail}</p>
                </div>
              </div>

              <p className="text-gray-600 text-sm">
                Click the link in that email to activate your account. The link expires in 7 days.
              </p>

              {error && (
                <div className="alert-error" role="alert">
                  {error}
                </div>
              )}

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={isLoading}
                  className="btn-secondary w-full"
                >
                  {isLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600 mr-2" aria-hidden="true"></div>
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="w-5 h-5 mr-2" aria-hidden="true" />
                      Resend Verification Email
                    </>
                  )}
                </button>

                <div className="text-center">
                  <Link to="/login" className="link text-sm">
                    Back to Login
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <SEOHead title="Create an account" canonicalPath="/register" noindex />
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          {logo}
          <h1 className="text-3xl font-heading font-bold text-gray-900">Create Account</h1>
          <p className="mt-2 text-sm text-gray-600">
            Join us to manage your donations and subscriptions
          </p>
        </div>

        <div className="card sm:p-8">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {error && (
              <div className="alert-error" role="alert">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="register-name" className="label">
                Full Name
              </label>
              <input
                id="register-name"
                type="text"
                autoComplete="name"
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={errors.name ? 'register-name-error' : undefined}
                {...register('name', { required: 'Name is required' })}
                className="input-field"
                placeholder="Enter your full name"
              />
              {errors.name && (
                <p id="register-name-error" className="field-error">{errors.name.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="register-email" className="label">
                Email Address
              </label>
              <input
                id="register-email"
                type="email"
                autoComplete="email"
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? 'register-email-error' : undefined}
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
                <p id="register-email-error" className="field-error">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="register-password" className="label">
                Password
              </label>
              <input
                id="register-password"
                type="password"
                autoComplete="new-password"
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={errors.password ? 'register-password-error' : undefined}
                {...register('password', {
                  required: 'Password is required',
                  minLength: {
                    value: 6,
                    message: 'Password must be at least 6 characters',
                  },
                  maxLength: {
                    value: 72,
                    message: 'Password cannot exceed 72 characters',
                  },
                })}
                className="input-field"
                placeholder="Create a password (6-72 characters)"
              />
              {errors.password && (
                <p id="register-password-error" className="field-error">{errors.password.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="register-confirm-password" className="label">
                Confirm Password
              </label>
              <input
                id="register-confirm-password"
                type="password"
                autoComplete="new-password"
                aria-invalid={errors.confirmPassword ? true : undefined}
                aria-describedby={errors.confirmPassword ? 'register-confirm-password-error' : undefined}
                {...register('confirmPassword', {
                  required: 'Please confirm your password',
                  validate: (value) => value === password || 'Passwords do not match',
                })}
                className="input-field"
                placeholder="Confirm your password"
              />
              {errors.confirmPassword && (
                <p id="register-confirm-password-error" className="field-error">{errors.confirmPassword.message}</p>
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
                  Creating account...
                </>
              ) : (
                <>
                  <UserPlus className="w-5 h-5 mr-2" aria-hidden="true" />
                  Create Account
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Already have an account?{' '}
              <Link to="/login" className="link">
                Sign in
              </Link>
            </p>
          </div>
        </div>

        <p className="text-center text-sm text-gray-600">
          <Link to="/" className="link">Back to the website</Link>
        </p>
      </div>
    </div>
  )
}

export default UserRegister
