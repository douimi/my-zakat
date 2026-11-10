import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import SEOHead from '../components/SEOHead'
import { defineMessages, useLocale, useT } from '../i18n'
import { C } from '../i18n/common'

const M = defineMessages({
  seoTitle: { en: 'Unsubscribe', ar: 'إلغاء الاشتراك' },
  seoDescription: { en: 'Unsubscribe from MyZakat emails.', ar: 'إلغاء الاشتراك في رسائل ماي زكاة الإلكترونية.' },
  noToken: { en: 'No unsubscribe token provided.', ar: 'رابط إلغاء الاشتراك غير مكتمل.' },
  unsubscribed: { en: 'You have been unsubscribed.', ar: 'تم إلغاء اشتراكك، ولن تصلك رسائلنا التسويقية بعد الآن.' },
  invalidLink: { en: 'This unsubscribe link is invalid or expired.', ar: 'رابط إلغاء الاشتراك هذا غير صالح أو انتهت صلاحيته.' },
  networkError: {
    en: 'Network error. Please try again or contact us at info@myzakat.org.',
    ar: 'تعذّر الاتصال. يُرجى المحاولة مرة أخرى أو مراسلتنا على info@myzakat.org.',
  },
  processing: { en: 'Processing your request…', ar: 'جارٍ تنفيذ طلبك…' },
  successTitle: { en: "You're unsubscribed", ar: 'تم إلغاء اشتراكك' },
  changedMind: {
    en: 'Changed your mind? You can re-subscribe anytime from our website.',
    ar: 'غيّرت رأيك؟ يمكنك الاشتراك من جديد في أي وقت من موقعنا.',
  },
  errorTitle: { en: 'Something went wrong', ar: 'حدث خطأ ما' },
  /** {email} is replaced by the info@ mail link. */
  stillReceiving: {
    en: "If you continue to receive emails, email {email} directly and we'll remove you manually.",
    ar: 'إذا استمرت رسائلنا في الوصول إليك، راسلنا مباشرة على {email} وسنزيل عنوانك يدويًا.',
  },
})

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

type Status = 'pending' | 'success' | 'error'

const Unsubscribe = () => {
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState<Status>('pending')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const t = useT()
  // The API answers in English: on the Arabic site its messages are replaced
  // by ours; on the English site they are shown exactly as before.
  const isAr = useLocale() === 'ar'

  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) {
      setStatus('error')
      setMessage(t(M.noToken))
      return
    }
    ;(async () => {
      try {
        const resp = await fetch(`${API_URL}/api/marketing/unsubscribe?token=${encodeURIComponent(token)}`)
        if (resp.ok) {
          const data = await resp.json()
          setEmail(data.email || '')
          setMessage(isAr ? t(M.unsubscribed) : data.message || t(M.unsubscribed))
          setStatus('success')
        } else {
          const err = await resp.json().catch(() => ({ detail: 'Invalid link' }))
          setMessage(!isAr && typeof err.detail === 'string' ? err.detail : t(M.invalidLink))
          setStatus('error')
        }
      } catch {
        setMessage(t(M.networkError))
        setStatus('error')
      }
    })()
  }, [searchParams, t, isAr])

  const [mailBefore, mailAfter = ''] = t(M.stillReceiving).split('{email}')

  return (
    <div className="min-h-[70vh] bg-gray-50 py-12 sm:py-16">
      <SEOHead title={t(M.seoTitle)} description={t(M.seoDescription)} canonicalPath="/unsubscribe" />
      <div className="section-container">
        <div className="card sm:p-8 max-w-md mx-auto text-center" aria-live="polite">
          {status === 'pending' && (
            <>
              <Loader2 className="w-10 h-10 mx-auto text-primary-600 animate-spin mb-4" aria-hidden="true" />
              <h1 className="text-xl font-heading font-bold text-gray-900">{t(M.processing)}</h1>
            </>
          )}
          {status === 'success' && (
            <>
              <CheckCircle2 className="w-10 h-10 mx-auto text-accent-600 mb-4" aria-hidden="true" />
              <h1 className="text-2xl font-heading font-bold text-gray-900 mb-3">{t(M.successTitle)}</h1>
              {email && <p dir="ltr" className="text-sm text-gray-500 mb-2">{email}</p>}
              <p className="text-gray-600 leading-relaxed mb-6">{message}</p>
              <p className="text-sm text-gray-500 mb-6">
                {t(M.changedMind)}
              </p>
              <Link to="/" className="btn-primary">
                {t(C.backToHome)}
              </Link>
            </>
          )}
          {status === 'error' && (
            <>
              <AlertCircle className="w-10 h-10 mx-auto text-red-600 mb-4" aria-hidden="true" />
              <h1 className="text-2xl font-heading font-bold text-gray-900 mb-3">{t(M.errorTitle)}</h1>
              <p className="text-gray-600 leading-relaxed mb-6">{message}</p>
              <p className="text-sm text-gray-500 mb-6">
                {mailBefore}<a href="mailto:info@myzakat.org" dir="ltr" className="link">info@myzakat.org</a>{mailAfter}
              </p>
              <Link to="/" className="btn-secondary">
                {t(C.backToHome)}
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default Unsubscribe
