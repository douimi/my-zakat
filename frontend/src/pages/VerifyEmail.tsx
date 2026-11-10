import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { Mail, CheckCircle, XCircle, Loader } from 'lucide-react'
import SEOHead from '../components/SEOHead'
import { defineMessages, useLocale, useT } from '../i18n'
import { C } from '../i18n/common'

const M = defineMessages({
  noToken: { en: 'Invalid verification link. No token provided.', ar: 'رابط التحقق غير صالح: الرابط غير مكتمل.' },
  verificationFailed: { en: 'Verification failed', ar: 'تعذّر التحقق من بريدك الإلكتروني. قد يكون الرابط غير صالح أو منتهي الصلاحية.' },
  verifiedShort: { en: 'Email verified successfully!', ar: 'تم التحقق من بريدك الإلكتروني بنجاح!' },
  verifiedCanLogin: { en: 'Email verified successfully! You can now log in.', ar: 'تم التحقق من بريدك الإلكتروني بنجاح! يمكنك الآن تسجيل الدخول.' },
  verifyFailedRetry: { en: 'Failed to verify email. Please try again.', ar: 'تعذّر التحقق من بريدك الإلكتروني. يُرجى المحاولة مرة أخرى.' },
  resendFailed: { en: 'Failed to resend verification email', ar: 'تعذّر إرسال رسالة التحقق من جديد' },
  resendFailedRetry: {
    en: 'Failed to resend verification email. Please try again.',
    ar: 'تعذّر إرسال رسالة التحقق من جديد. يُرجى المحاولة مرة أخرى.',
  },
  resentShort: { en: 'Verification email sent successfully!', ar: 'أرسلنا إليك رسالة تحقق جديدة!' },
  seoTitle: { en: 'Verify your email', ar: 'تأكيد البريد الإلكتروني' },
  verifying: { en: 'Verifying Email...', ar: 'جارٍ التحقق من البريد...' },
  verified: { en: 'Email Verified!', ar: 'تم التحقق من البريد!' },
  failedTitle: { en: 'Verification Failed', ar: 'تعذّر التحقق' },
  pleaseWait: { en: 'Please wait while we verify your email address...', ar: 'يُرجى الانتظار قليلًا ريثما نتحقق من بريدك الإلكتروني...' },
  redirecting: { en: 'Redirecting to login page...', ar: 'جارٍ نقلك إلى صفحة تسجيل الدخول...' },
  didntReceive: { en: "Didn't receive the verification email?", ar: 'لم تصلك رسالة التحقق؟' },
  emailLabel: { en: 'Email Address', ar: 'البريد الإلكتروني' },
  emailPlaceholder: { en: 'Enter your email', ar: 'أدخل بريدك الإلكتروني' },
  sending: { en: 'Sending...', ar: 'جارٍ الإرسال...' },
  resend: { en: 'Resend Verification Email', ar: 'أعد إرسال رسالة التحقق' },
  resentInbox: { en: 'Verification email sent! Please check your inbox.', ar: 'أرسلنا رسالة التحقق! يُرجى تفقّد بريدك الوارد.' },
  backToLogin: { en: 'Back to Login', ar: 'العودة إلى تسجيل الدخول' },
})

const VerifyEmail = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [resending, setResending] = useState(false)
  const [resendEmail, setResendEmail] = useState('')
  const [resendSuccess, setResendSuccess] = useState(false)
  const t = useT()
  // Server messages are English: the Arabic site shows its own instead.
  const isAr = useLocale() === 'ar'

  useEffect(() => {
    const token = searchParams.get('token')
    
    if (!token) {
      setStatus('error')
      setMessage(t(M.noToken))
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
        const errorData = await response.json().catch(() => ({ detail: M.verificationFailed.en }))
        throw new Error((!isAr && errorData.detail) || t(M.verificationFailed))
      }

      const data = await response.json()
      setStatus('success')
      setMessage((!isAr && data.message) || t(M.verifiedShort))
      
      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate('/login', { state: { message: t(M.verifiedCanLogin) } })
      }, 3000)
    } catch (err: any) {
      setStatus('error')
      setMessage(isAr && err instanceof TypeError ? t(C.networkError) : err.message || t(M.verifyFailedRetry))
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
        const errorData = await response.json().catch(() => ({ detail: M.resendFailed.en }))
        throw new Error((!isAr && errorData.detail) || t(M.resendFailed))
      }

      const data = await response.json()
      setResendSuccess(true)
      setMessage((!isAr && data.message) || t(M.resentShort))
    } catch (err: any) {
      setMessage(isAr && err instanceof TypeError ? t(C.networkError) : err.message || t(M.resendFailedRetry))
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <SEOHead title={t(M.seoTitle)} canonicalPath="/verify-email" noindex />
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <Link to="/" className="inline-block mb-6">
            <img src="/logo.png" alt={t(C.homeLogoAlt)} className="h-12 mx-auto" />
          </Link>
          <h1 className="text-3xl font-heading font-bold text-gray-900 inline-flex items-center gap-2">
            {status === 'loading' && <Loader className="w-7 h-7 text-primary-600 animate-spin" aria-hidden="true" />}
            {status === 'success' && <CheckCircle className="w-7 h-7 text-green-700" aria-hidden="true" />}
            {status === 'error' && <XCircle className="w-7 h-7 text-red-700" aria-hidden="true" />}
            <span>
              {status === 'loading' && t(M.verifying)}
              {status === 'success' && t(M.verified)}
              {status === 'error' && t(M.failedTitle)}
            </span>
          </h1>
        </div>

        <div className="card sm:p-8">
          {status === 'loading' && (
            <div className="text-center" role="status">
              <p className="text-gray-600">{t(M.pleaseWait)}</p>
            </div>
          )}

          {status === 'success' && (
            <div className="text-center space-y-4" role="status">
              <p className="text-green-800 font-medium">{message}</p>
              <p className="text-sm text-gray-600">{t(M.redirecting)}</p>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-4">
              <div className="alert-error" role="alert">
                {message}
              </div>

              <div className="border-t pt-4">
                <p className="text-sm text-gray-600 mb-4">{t(M.didntReceive)}</p>
                <form onSubmit={handleResendVerification} className="space-y-3">
                  <div>
                    <label htmlFor="verify-resend-email" className="label">
                      {t(M.emailLabel)}
                    </label>
                    <input
                      id="verify-resend-email"
                      type="email"
                      autoComplete="email"
                      value={resendEmail}
                      onChange={(e) => setResendEmail(e.target.value)}
                      required
                      className="input-field"
                      placeholder={t(M.emailPlaceholder)}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={resending}
                    className="btn-primary w-full"
                  >
                    {resending ? (
                      <>
                        <Loader className="w-5 h-5 me-2 animate-spin" aria-hidden="true" />
                        {t(M.sending)}
                      </>
                    ) : (
                      <>
                        <Mail className="w-5 h-5 me-2" aria-hidden="true" />
                        {t(M.resend)}
                      </>
                    )}
                  </button>
                </form>
                {resendSuccess && (
                  <div className="mt-3 alert-success" role="status">
                    {t(M.resentInbox)}
                  </div>
                )}
              </div>

              <div className="mt-6 text-center">
                <Link to="/login" className="link">
                  {t(M.backToLogin)}
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
