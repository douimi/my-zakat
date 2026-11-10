import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { KeyRound, Mail } from 'lucide-react'
import { defineMessages, useLocale, useT } from '../../i18n'
import { requestPortalCode, verifyPortalCode } from '../../utils/sponsorshipApi'

const M = defineMessages({
  addressLabel: { en: 'The address you used', ar: 'البريد الإلكتروني الذي استخدمته' },
  sendCode: { en: 'Send me a sign-in code', ar: 'أرسل لي رمز الدخول' },
  sending: { en: 'Sending…', ar: 'جارٍ الإرسال…' },
  noAccount: {
    en: 'No account or password: we email you a six-digit code.',
    ar: 'لا حاجة إلى حساب أو كلمة مرور: نرسل إليك رمزًا من ستة أرقام.',
  },
  codeSent: { en: 'We sent a six-digit code to {email}. It is valid for 10 minutes.', ar: 'أرسلنا رمزًا من ستة أرقام إلى {email}، وهو صالح لمدة 10 دقائق.' },
  codeLabel: { en: 'Six-digit code', ar: 'الرمز المكوّن من ستة أرقام' },
  verify: { en: 'Sign in', ar: 'دخول' },
  verifying: { en: 'Checking…', ar: 'جارٍ التحقق…' },
  otherAddress: { en: 'Use another address', ar: 'استخدام بريد آخر' },
  resend: { en: 'Send a new code', ar: 'إرسال رمز جديد' },
  noRequest: {
    en: 'We have no request filed under this address. Check it for a typo, or try the address of the association that filed it.',
    ar: 'لا يوجد طلب مسجّل بهذا البريد. تحقّق من صحة كتابته، أو جرّب بريد الجمعية التي قدّمت الطلب.',
  },
  noSponsorship: {
    en: 'We have no sponsorship under this address. Use the email you gave at checkout.',
    ar: 'لا توجد كفالة مسجّلة بهذا البريد. استخدم البريد الذي أدخلته عند الدفع.',
  },
  fileOne: { en: 'Request sponsorship', ar: 'تقديم طلب كفالة' },
  sponsorOne: { en: 'Find someone to sponsor', ar: 'اختر من تكفله' },
  tooMany: {
    en: 'Too many codes were requested. Please wait a few minutes and try again.',
    ar: 'تم طلب عدد كبير من الرموز. يُرجى الانتظار بضع دقائق ثم المحاولة مجددًا.',
  },
  badCode: { en: 'That code is not valid. Request a new one and try again.', ar: 'الرمز غير صحيح. اطلب رمزًا جديدًا وحاول مرة أخرى.' },
  failed: { en: 'Something went wrong. Please try again.', ar: 'حدث خطأ ما. يُرجى المحاولة مرة أخرى.' },
})

interface Props {
  audience: 'applicant' | 'sponsor'
  onSignedIn: (email: string) => void
  /** Pre-fill, e.g. the address of a session that just lapsed. */
  initialEmail?: string
}

const status = (error: unknown) => (error as { response?: { status?: number } })?.response?.status

const PortalSignIn = ({ audience, onSignedIn, initialEmail = '' }: Props) => {
  const t = useT()
  const locale = useLocale()
  const [email, setEmail] = useState(initialEmail)
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<'none' | 'notFound' | 'tooMany' | 'badCode' | 'failed'>('none')

  const sendCode = async (event?: FormEvent) => {
    event?.preventDefault()
    setBusy(true)
    setError('none')
    try {
      await requestPortalCode(email.trim(), audience, locale)
      setStep('code')
      setCode('')
    } catch (err) {
      const s = status(err)
      setError(s === 404 ? 'notFound' : s === 429 ? 'tooMany' : 'failed')
    } finally {
      setBusy(false)
    }
  }

  const verify = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('none')
    try {
      await verifyPortalCode(email.trim(), code.trim())
      onSignedIn(email.trim())
    } catch (err) {
      setError(status(err) === 401 ? 'badCode' : 'failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card mx-auto max-w-md sm:p-8">
      {step === 'email' ? (
        <form onSubmit={sendCode} className="space-y-4" noValidate>
          <div>
            <label htmlFor="portal-address" className="label">{t(M.addressLabel)}</label>
            <input
              id="portal-address"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
            />
            <p className="help-text">{t(M.noAccount)}</p>
          </div>
          {error === 'notFound' && (
            <div className="alert-warning" role="alert">
              <div>
                <p>{t(audience === 'applicant' ? M.noRequest : M.noSponsorship)}</p>
                <Link to={audience === 'applicant' ? '/sponsor/apply' : '/sponsor'} className="link mt-1 inline-block">
                  {t(audience === 'applicant' ? M.fileOne : M.sponsorOne)}
                </Link>
              </div>
            </div>
          )}
          {error === 'tooMany' && <p className="alert-warning" role="alert">{t(M.tooMany)}</p>}
          {error === 'failed' && <p className="alert-error" role="alert">{t(M.failed)}</p>}
          <button type="submit" className="btn-primary w-full gap-2" disabled={busy || !email.includes('@')}>
            <Mail aria-hidden="true" className="h-4 w-4" />
            {busy ? t(M.sending) : t(M.sendCode)}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-4">
          <p className="text-sm text-gray-700">{t(M.codeSent, { email })}</p>
          <div>
            <label htmlFor="portal-code" className="label">{t(M.codeLabel)}</label>
            <input
              id="portal-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="input text-center text-2xl tracking-[0.5em]"
            />
          </div>
          {error === 'badCode' && <p className="alert-error" role="alert">{t(M.badCode)}</p>}
          {error === 'failed' && <p className="alert-error" role="alert">{t(M.failed)}</p>}
          <button type="submit" className="btn-primary w-full gap-2" disabled={busy || code.length < 6}>
            <KeyRound aria-hidden="true" className="h-4 w-4" />
            {busy ? t(M.verifying) : t(M.verify)}
          </button>
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <button type="button" className="link" onClick={() => { setStep('email'); setError('none') }}>
              {t(M.otherAddress)}
            </button>
            <button type="button" className="link" onClick={() => sendCode()} disabled={busy}>
              {t(M.resend)}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

export default PortalSignIn
