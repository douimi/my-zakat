/**
 * /sponsor/thank-you?session_id=… — where Stripe sends a donor back.
 *
 * Stripe's webhook, not this page, is what starts a sponsorship. The page asks
 * for a few seconds whether it has arrived, so it can say "started" honestly
 * rather than assume it; if it has not arrived yet, it says the payment is
 * being confirmed and that an email will follow.
 */
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from 'react-query'
import { CheckCircle2, Clock } from 'lucide-react'
import SEOHead from '../../components/SEOHead'
import { defineMessages, useFormat, useT } from '../../i18n'
import { fetchCheckoutResult } from '../../utils/sponsorshipApi'

const M = defineMessages({
  title: { en: 'Thank you for your sponsorship', ar: 'جزاك الله خيرًا على كفالتك' },
  started: {
    en: 'Your sponsorship of {name} has started: {amount} a month. May Allah reward you and bless what you give.',
    ar: 'بدأت كفالتك لـ{name}: {amount} شهريًا. جزاك الله خيرًا وبارك في عطائك.',
  },
  confirming: {
    en: 'Your payment is being confirmed. You will receive an email as soon as your sponsorship of {name} has started.',
    ar: 'جارٍ تأكيد الدفع. ستصلك رسالة بالبريد الإلكتروني فور بدء كفالتك لـ{name}.',
  },
  unknown: {
    en: 'If you completed the payment, you will receive an email confirming your sponsorship shortly.',
    ar: 'إذا أتممت عملية الدفع، فستصلك قريبًا رسالة بالبريد الإلكتروني تؤكد كفالتك.',
  },
  next: { en: 'What happens now', ar: 'ماذا بعد؟' },
  next1: { en: 'A receipt arrives by email for every monthly payment.', ar: 'يصلك إيصال بالبريد الإلكتروني عن كل دفعة شهرية.' },
  next2: { en: 'Our team distributes the support and records each distribution.', ar: 'يوزّع فريقنا الدعم ويسجّل كل عملية صرف.' },
  next3: { en: 'You follow everything — and can stop at any time — from “My sponsorships”, with a code sent to your email.', ar: 'تتابع كل شيء — ويمكنك التوقف في أي وقت — من صفحة «كفالاتي» برمز يصل إلى بريدك.' },
  mySponsorships: { en: 'Open my sponsorships', ar: 'افتح صفحة كفالاتي' },
  another: { en: 'Sponsor someone else', ar: 'اكفل شخصًا آخر' },
})

const SponsorThankYou = () => {
  const t = useT()
  const { money } = useFormat()
  const [params] = useSearchParams()
  const sessionId = params.get('session_id') || ''
  const [attempts, setAttempts] = useState(0)

  const { data } = useQuery(['sponsorship-checkout', sessionId, attempts], () => fetchCheckoutResult(sessionId), {
    enabled: Boolean(sessionId),
    retry: false,
  })

  // Ask again a few times while the webhook is on its way.
  useEffect(() => {
    if (!data || data.status !== 'pending' || attempts >= 5) return
    const timer = setTimeout(() => setAttempts((a) => a + 1), 2500)
    return () => clearTimeout(timer)
  }, [data, attempts])

  const name = data?.display_name || data?.reference || ''
  const started = data && (data.status === 'active' || data.status === 'past_due')
  const message = !data
    ? t(M.unknown)
    : started
      ? t(M.started, { name, amount: money(data.monthly_amount_cents) })
      : t(M.confirming, { name })

  return (
    <div className="bg-gray-50 py-16">
      <SEOHead title={t(M.title)} noindex />
      <div className="section-container">
        <div className="card mx-auto max-w-xl text-center sm:p-10">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            {started || !data
              ? <CheckCircle2 aria-hidden="true" className="h-9 w-9 text-green-700" />
              : <Clock aria-hidden="true" className="h-9 w-9 text-green-700" />}
          </div>
          <h1 className="text-2xl font-heading font-bold text-gray-900 sm:text-3xl">{t(M.title)}</h1>
          <p className="mt-3 leading-relaxed text-gray-700" aria-live="polite">{message}</p>

          <div className="mt-8 text-start">
            <h2 className="font-semibold text-gray-900">{t(M.next)}</h2>
            <ol className="mt-2 list-decimal space-y-1 ps-5 text-gray-700">
              <li>{t(M.next1)}</li>
              <li>{t(M.next2)}</li>
              <li>{t(M.next3)}</li>
            </ol>
          </div>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/my-sponsorships" className="btn-primary">{t(M.mySponsorships)}</Link>
            <Link to="/sponsor" className="btn-secondary">{t(M.another)}</Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SponsorThankYou
