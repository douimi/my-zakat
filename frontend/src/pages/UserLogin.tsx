import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { LogIn, Mail, Lock } from 'lucide-react'
import { useAuthStore, User } from '../store/authStore'

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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-full mb-6">
            <LogIn className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900">Welcome Back</h2>
          <p className="mt-2 text-sm text-gray-600">
            Sign in to manage your donations
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-8">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {successMessage && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
                {successMessage}
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
                {error}
                {unverifiedEmail && (
                  <div className="mt-3 pt-3 border-t border-red-200">
                    <p className="mb-2">Need a new verification email?</p>
                    <button
                      type="button"
                      onClick={handleResendVerification}
                      disabled={resending}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition duration-200 text-sm"
                    >
                      {resending ? 'Sending...' : 'Resend Verification Email'}
                    </button>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Mail className="w-4 h-4 inline mr-1" />
                Email Address
              </label>
              <input
                type="email"
                {...register('email', {
                  required: 'Email is required',
                  pattern: {
                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                    message: 'Invalid email address',
                  },
                })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter your email"
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Lock className="w-4 h-4 inline mr-1" />
                Password
              </label>
              <input
                type="password"
                {...register('password', { required: 'Password is required' })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter your password"
              />
              {errors.password && (
                <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition duration-200 flex items-center justify-center"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn className="w-5 h-5 mr-2" />
                  Sign In
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Don't have an account?{' '}
              <Link to="/register" className="text-blue-600 hover:text-blue-700 font-medium">
                Create one
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default UserLogin

