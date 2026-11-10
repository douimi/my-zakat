import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { LogIn } from 'lucide-react'
import { useAuthStore, User } from '../store/authStore'
import SEOHead from '../components/SEOHead'
import { defineMessages, useLocale, useT } from '../i18n'
import { C } from '../i18n/common'

const M = defineMessages({
  seoTitle: { en: 'Sign in', ar: 'تسجيل الدخول' },
  welcomeBack: { en: 'Welcome Back', ar: 'أهلًا بعودتك' },
  lead: { en: 'Sign in to manage your donations', ar: 'سجّل الدخول لإدارة تبرعاتك' },
  needNewEmail: { en: 'Need a new verification email?', ar: 'هل تحتاج إلى رسالة تحقق جديدة؟' },
  sending: { en: 'Sending...', ar: 'جارٍ الإرسال...' },
  resend: { en: 'Resend Verification Email', ar: 'أعد إرسال رسالة التحقق' },
  emailLabel: { en: 'Email Address', ar: 'البريد الإلكتروني' },
  emailRequired: { en: 'Email is required', ar: 'البريد الإلكتروني مطلوب' },
  emailInvalid: { en: 'Invalid email address', ar: 'عنوان البريد الإلكتروني غير صحيح' },
  emailPlaceholder: { en: 'Enter your email', ar: 'أدخل بريدك الإلكتروني' },
  passwordLabel: { en: 'Password', ar: 'كلمة المرور' },
  passwordRequired: { en: 'Password is required', ar: 'كلمة المرور مطلوبة' },
  passwordPlaceholder: { en: 'Enter your password', ar: 'أدخل كلمة المرور' },
  signingIn: { en: 'Signing in...', ar: 'جارٍ تسجيل الدخول...' },
  signIn: { en: 'Sign In', ar: 'تسجيل الدخول' },
  noAccount: { en: "Don't have an account?", ar: 'ليس لديك حساب؟' },
  createOne: { en: 'Create one', ar: 'أنشئ حسابًا' },
  appliedForFunding: { en: 'Applied for project funding?', ar: 'قدّمت طلب تمويل لمشروع؟' },
  checkProposal: { en: 'Check your proposal', ar: 'تابع مقترح مشروعك' },
  backToWebsite: { en: 'Back to the website', ar: 'العودة إلى الموقع' },
  resendSuccess: {
    en: 'Verification email sent successfully! Please check your inbox.',
    ar: 'أرسلنا إليك رسالة تحقق جديدة. يُرجى تفقّد بريدك الوارد.',
  },
  resendFailed: { en: 'Failed to resend verification email', ar: 'تعذّر إرسال رسالة التحقق من جديد' },
  resendFailedRetry: {
    en: 'Failed to resend verification email. Please try again.',
    ar: 'تعذّر إرسال رسالة التحقق من جديد. يُرجى المحاولة مرة أخرى.',
  },
  validationError: { en: 'Validation error: {details}', ar: 'يُرجى التحقق من صيغة البريد الإلكتروني والمحاولة مرة أخرى.' },
  checkEmailFormat: { en: 'Please check your email format and try again', ar: 'يُرجى التحقق من صيغة البريد الإلكتروني والمحاولة مرة أخرى.' },
  incorrect: { en: 'Incorrect email or password', ar: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' },
  notVerified: {
    en: 'Email not verified. Please check your email for the verification link.',
    ar: 'لم يتم التحقق من بريدك الإلكتروني بعد. يُرجى البحث في بريدك عن رابط التحقق.',
  },
  inactive: { en: 'Account is inactive. Please contact support.', ar: 'هذا الحساب غير مفعّل. يُرجى التواصل مع فريق الدعم.' },
  loginFailed: { en: 'Login failed', ar: 'تعذّر تسجيل الدخول. يُرجى المحاولة مرة أخرى.' },
  fetchUserFailed: { en: 'Failed to fetch user details', ar: 'تعذّر تحميل بيانات حسابك' },
  unexpected: { en: 'An unexpected error occurred', ar: 'حدث خطأ غير متوقع' },
})

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
  const t = useT()
  // Server messages are English: the Arabic site shows its own instead.
  const isAr = useLocale() === 'ar'

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
        const errorData = await response.json().catch(() => ({ detail: t(M.resendFailed) }))
        throw new Error((!isAr && errorData.detail) || t(M.resendFailed))
      }

      setError('')
      setSuccessMessage(t(M.resendSuccess))
      setUnverifiedEmail(null)
    } catch (err: any) {
      setError(isAr && err instanceof TypeError ? t(C.networkError) : err.message || t(M.resendFailedRetry))
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
        const errorData = await loginResponse.json().catch(() => ({ detail: M.loginFailed.en }))
        
        if (loginResponse.status === 422) {
          // Validation error
          if (errorData.detail && Array.isArray(errorData.detail)) {
            // Pydantic validation errors
            const validationErrors = errorData.detail.map((error: any) => error.msg).join(', ')
            throw new Error(t(M.validationError, { details: validationErrors }))
          } else {
            throw new Error(t(M.checkEmailFormat))
          }
        } else if (loginResponse.status === 401) {
          throw new Error(t(M.incorrect))
        } else if (loginResponse.status === 403) {
          // Check if it's an unverified email error
          if (errorData.detail && errorData.detail.includes('Email not verified')) {
            setUnverifiedEmail(data.email)
            throw new Error(t(M.notVerified))
          } else {
            throw new Error(t(M.inactive))
          }
        } else {
          throw new Error(isAr ? t(M.loginFailed) : errorData.detail || 'Login failed')
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
        throw new Error(t(M.fetchUserFailed))
      }

      const userData: User = await userResponse.json()
      
      // Store user data and token
      login(userData, loginData.access_token)
    } catch (err: any) {
      console.error('Login error:', err)
      setError(isAr && err instanceof TypeError ? t(C.networkError) : err.message || t(M.unexpected))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <SEOHead title={t(M.seoTitle)} canonicalPath="/login" noindex />
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <Link to="/" className="inline-block mb-6">
            <img src="/logo.png" alt={t(C.homeLogoAlt)} className="h-12 mx-auto" />
          </Link>
          <h1 className="text-3xl font-heading font-bold text-gray-900">{t(M.welcomeBack)}</h1>
          <p className="mt-2 text-sm text-gray-600">
            {t(M.lead)}
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
                      <p className="mb-2">{t(M.needNewEmail)}</p>
                      <button
                        type="button"
                        onClick={handleResendVerification}
                        disabled={resending}
                        className="btn-primary btn-sm w-full"
                      >
                        {resending ? t(M.sending) : t(M.resend)}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div>
              <label htmlFor="login-email" className="label">
                {t(M.emailLabel)}
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? 'login-email-error' : undefined}
                {...register('email', {
                  required: t(M.emailRequired),
                  pattern: {
                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                    message: t(M.emailInvalid),
                  },
                })}
                className="input-field"
                placeholder={t(M.emailPlaceholder)}
              />
              {errors.email && (
                <p id="login-email-error" className="field-error">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="login-password" className="label">
                {t(M.passwordLabel)}
              </label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={errors.password ? 'login-password-error' : undefined}
                {...register('password', { required: t(M.passwordRequired) })}
                className="input-field"
                placeholder={t(M.passwordPlaceholder)}
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
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white me-2" aria-hidden="true"></div>
                  {t(M.signingIn)}
                </>
              ) : (
                <>
                  <LogIn className="w-5 h-5 me-2" aria-hidden="true" />
                  {t(M.signIn)}
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              {t(M.noAccount)}{' '}
              <Link to="/register" className="link">
                {t(M.createOne)}
              </Link>
            </p>
          </div>
        </div>

        {/* Partner teams who applied for funding land here too: point them to their portal. */}
        <div className="text-center space-y-2 text-sm text-gray-600">
          <p>
            {t(M.appliedForFunding)}{' '}
            <Link to="/my-proposals" className="link">{t(M.checkProposal)}</Link>
          </p>
          <p>
            <Link to="/" className="link">{t(M.backToWebsite)}</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default UserLogin

