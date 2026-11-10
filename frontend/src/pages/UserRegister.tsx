import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { UserPlus, Mail } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import SEOHead from '../components/SEOHead'
import { defineMessages, useLocale, useT } from '../i18n'
import { C } from '../i18n/common'

const M = defineMessages({
  registrationFailed: { en: 'Registration failed', ar: 'تعذّر إنشاء الحساب. يُرجى المحاولة مرة أخرى.' },
  registrationFailedRetry: { en: 'Registration failed. Please try again.', ar: 'تعذّر إنشاء الحساب. يُرجى المحاولة مرة أخرى.' },
  resendFailed: { en: 'Failed to resend verification email', ar: 'تعذّر إرسال رسالة التحقق من جديد' },
  resendFailedRetry: {
    en: 'Failed to resend verification email. Please try again.',
    ar: 'تعذّر إرسال رسالة التحقق من جديد. يُرجى المحاولة مرة أخرى.',
  },
  checkEmailSeo: { en: 'Check your email', ar: 'تفقّد بريدك الإلكتروني' },
  successTitle: { en: 'Registration Successful!', ar: 'تم إنشاء حسابك!' },
  successLead: { en: 'Please verify your email address to continue', ar: 'يُرجى تأكيد بريدك الإلكتروني للمتابعة' },
  sentTo: { en: "We've sent a verification email to:", ar: 'أرسلنا رسالة تحقق إلى:' },
  clickLink: {
    en: 'Click the link in that email to activate your account. The link expires in 7 days.',
    ar: 'اضغط على الرابط الموجود في تلك الرسالة لتفعيل حسابك. تنتهي صلاحية الرابط بعد 7 أيام.',
  },
  sending: { en: 'Sending...', ar: 'جارٍ الإرسال...' },
  resend: { en: 'Resend Verification Email', ar: 'أعد إرسال رسالة التحقق' },
  backToLogin: { en: 'Back to Login', ar: 'العودة إلى تسجيل الدخول' },
  createAccountSeo: { en: 'Create an account', ar: 'إنشاء حساب' },
  createAccount: { en: 'Create Account', ar: 'إنشاء حساب' },
  lead: { en: 'Join us to manage your donations and subscriptions', ar: 'انضم إلينا لإدارة تبرعاتك واشتراكاتك' },
  fullName: { en: 'Full Name', ar: 'الاسم الكامل' },
  nameRequired: { en: 'Name is required', ar: 'الاسم مطلوب' },
  namePlaceholder: { en: 'Enter your full name', ar: 'أدخل اسمك الكامل' },
  emailLabel: { en: 'Email Address', ar: 'البريد الإلكتروني' },
  emailRequired: { en: 'Email is required', ar: 'البريد الإلكتروني مطلوب' },
  emailInvalid: { en: 'Invalid email address', ar: 'عنوان البريد الإلكتروني غير صحيح' },
  emailPlaceholder: { en: 'Enter your email', ar: 'أدخل بريدك الإلكتروني' },
  passwordLabel: { en: 'Password', ar: 'كلمة المرور' },
  passwordRequired: { en: 'Password is required', ar: 'كلمة المرور مطلوبة' },
  passwordMin: { en: 'Password must be at least 6 characters', ar: 'يجب أن تتكون كلمة المرور من 6 أحرف على الأقل' },
  passwordMax: { en: 'Password cannot exceed 72 characters', ar: 'يجب ألا تتجاوز كلمة المرور 72 حرفًا' },
  passwordPlaceholder: { en: 'Create a password (6-72 characters)', ar: 'اختر كلمة مرور (من 6 إلى 72 حرفًا)' },
  confirmLabel: { en: 'Confirm Password', ar: 'تأكيد كلمة المرور' },
  confirmRequired: { en: 'Please confirm your password', ar: 'يُرجى تأكيد كلمة المرور' },
  mismatch: { en: 'Passwords do not match', ar: 'كلمتا المرور غير متطابقتين' },
  confirmPlaceholder: { en: 'Confirm your password', ar: 'أعد كتابة كلمة المرور' },
  creating: { en: 'Creating account...', ar: 'جارٍ إنشاء الحساب...' },
  haveAccount: { en: 'Already have an account?', ar: 'لديك حساب بالفعل؟' },
  signIn: { en: 'Sign in', ar: 'سجّل الدخول' },
  backToWebsite: { en: 'Back to the website', ar: 'العودة إلى الموقع' },
})

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
  const t = useT()
  // Server messages are English: the Arabic site shows its own instead.
  const isAr = useLocale() === 'ar'

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
        throw new Error((!isAr && errorData.detail) || t(M.registrationFailed))
      }

      // Show verification message
      setRegisteredEmail(data.email)
    } catch (err: any) {
      setError(isAr && err instanceof TypeError ? t(C.networkError) : err.message || t(M.registrationFailedRetry))
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
        throw new Error((!isAr && errorData.detail) || t(M.resendFailed))
      }

      setError('')
      // Success will be shown via toast if available, or user will see success message
    } catch (err: any) {
      setError(isAr && err instanceof TypeError ? t(C.networkError) : err.message || t(M.resendFailedRetry))
    } finally {
      setIsLoading(false)
    }
  }

  const logo = (
    <Link to="/" className="inline-block mb-6">
      <img src="/logo.png" alt={t(C.homeLogoAlt)} className="h-12 mx-auto" />
    </Link>
  )

  // Show verification message after successful registration
  if (registeredEmail) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <SEOHead title={t(M.checkEmailSeo)} canonicalPath="/register" noindex />
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            {logo}
            <h1 className="text-3xl font-heading font-bold text-gray-900">{t(M.successTitle)}</h1>
            <p className="mt-2 text-sm text-gray-600">
              {t(M.successLead)}
            </p>
          </div>

          <div className="card sm:p-8">
            <div className="space-y-4">
              <div className="alert-info">
                <div>
                  <p className="font-medium mb-1">{t(M.sentTo)}</p>
                  <p dir="ltr" className="font-semibold break-all">{registeredEmail}</p>
                </div>
              </div>

              <p className="text-gray-600 text-sm">
                {t(M.clickLink)}
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
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600 me-2" aria-hidden="true"></div>
                      {t(M.sending)}
                    </>
                  ) : (
                    <>
                      <Mail className="w-5 h-5 me-2" aria-hidden="true" />
                      {t(M.resend)}
                    </>
                  )}
                </button>

                <div className="text-center">
                  <Link to="/login" className="link text-sm">
                    {t(M.backToLogin)}
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
      <SEOHead title={t(M.createAccountSeo)} canonicalPath="/register" noindex />
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          {logo}
          <h1 className="text-3xl font-heading font-bold text-gray-900">{t(M.createAccount)}</h1>
          <p className="mt-2 text-sm text-gray-600">
            {t(M.lead)}
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
                {t(M.fullName)}
              </label>
              <input
                id="register-name"
                type="text"
                autoComplete="name"
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={errors.name ? 'register-name-error' : undefined}
                {...register('name', { required: t(M.nameRequired) })}
                className="input-field"
                placeholder={t(M.namePlaceholder)}
              />
              {errors.name && (
                <p id="register-name-error" className="field-error">{errors.name.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="register-email" className="label">
                {t(M.emailLabel)}
              </label>
              <input
                id="register-email"
                type="email"
                autoComplete="email"
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? 'register-email-error' : undefined}
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
                <p id="register-email-error" className="field-error">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="register-password" className="label">
                {t(M.passwordLabel)}
              </label>
              <input
                id="register-password"
                type="password"
                autoComplete="new-password"
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={errors.password ? 'register-password-error' : undefined}
                {...register('password', {
                  required: t(M.passwordRequired),
                  minLength: {
                    value: 6,
                    message: t(M.passwordMin),
                  },
                  maxLength: {
                    value: 72,
                    message: t(M.passwordMax),
                  },
                })}
                className="input-field"
                placeholder={t(M.passwordPlaceholder)}
              />
              {errors.password && (
                <p id="register-password-error" className="field-error">{errors.password.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="register-confirm-password" className="label">
                {t(M.confirmLabel)}
              </label>
              <input
                id="register-confirm-password"
                type="password"
                autoComplete="new-password"
                aria-invalid={errors.confirmPassword ? true : undefined}
                aria-describedby={errors.confirmPassword ? 'register-confirm-password-error' : undefined}
                {...register('confirmPassword', {
                  required: t(M.confirmRequired),
                  validate: (value) => value === password || t(M.mismatch),
                })}
                className="input-field"
                placeholder={t(M.confirmPlaceholder)}
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
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white me-2" aria-hidden="true"></div>
                  {t(M.creating)}
                </>
              ) : (
                <>
                  <UserPlus className="w-5 h-5 me-2" aria-hidden="true" />
                  {t(M.createAccount)}
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              {t(M.haveAccount)}{' '}
              <Link to="/login" className="link">
                {t(M.signIn)}
              </Link>
            </p>
          </div>
        </div>

        <p className="text-center text-sm text-gray-600">
          <Link to="/" className="link">{t(M.backToWebsite)}</Link>
        </p>
      </div>
    </div>
  )
}

export default UserRegister
