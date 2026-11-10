/**
 * Public project-proposal submission wizard.
 *
 * Guided 4-step form that mirrors the paper funding request applicants used
 * to fax / email. Each step maps to a section of the PDF:
 *   1. Personal information
 *   2. Project information
 *   3. Project plan
 *   4. Budget & review
 *
 * The form itself lives in components/proposals/ProposalForm so the
 * submitter portal can reuse the exact same 25 fields when revising a
 * proposal. This page is only the public chrome around it: the SEO head,
 * the heading, the POST, and the success screen.
 */
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react'
import SEOHead from '../components/SEOHead'
import ProposalForm, {
  buildProposalPayload,
  parseFieldErrors,
  type FieldError,
} from '../components/proposals/ProposalForm'
import { defineMessages, useLocale, useT } from '../i18n'
import { C } from '../i18n/common'

const M = defineMessages({
  submissionFailed: { en: 'Submission failed', ar: 'تعذّر إرسال المقترح' },
  checkEntries: { en: 'Please check your entries and try again.', ar: 'يُرجى مراجعة المعلومات التي أدخلتها والمحاولة مرة أخرى.' },
  networkError: { en: 'Network error. Please try again.', ar: 'تعذّر الاتصال. يُرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.' },
  /** Arabic version of the server's 409 message; {id} is the blocking proposal number. */
  blockedAr: {
    en: '',
    ar: 'حصل المقترح رقم #{id} على التمويل، ولم يُقبل تقرير الإنجاز الخاص به بعد. يُرجى إرسال هذا التقرير وانتظار قبوله قبل تقديم طلب تمويل جديد.',
  },
  blockedArNoId: {
    en: '',
    ar: 'أحد مشاريعك الممولة لم يُقبل تقرير إنجازه بعد. يُرجى إرسال هذا التقرير وانتظار قبوله قبل تقديم طلب تمويل جديد.',
  },
  submittedSeoTitle: { en: 'Proposal Submitted', ar: 'تم إرسال المقترح' },
  submittedSeoDescription: { en: 'Your project proposal has been received.', ar: 'وصلنا مقترح مشروعك.' },
  received: { en: 'Proposal received', ar: 'وصلنا مقترحك' },
  /** {email} is shown in bold. */
  thankYou: {
    en: 'Thank you for submitting your project proposal. Our review team will study your request and get back to you at {email}.',
    ar: 'شكرًا لك على تقديم مقترح مشروعك. سيدرس فريق المراجعة طلبك ويتواصل معك على {email}.',
  },
  reference: { en: 'Reference number:', ar: 'الرقم المرجعي:' },
  /** {link} is the "My proposals" link. */
  checkStatus: {
    en: 'You can check its status at any time from {link} — we will email you a sign-in code, no account needed.',
    ar: 'يمكنك متابعة حالة طلبك في أي وقت من صفحة {link}. سنرسل إليك رمز التحقق عبر البريد الإلكتروني، ولا حاجة إلى إنشاء حساب.',
  },
  myProposals: { en: 'My proposals', ar: 'مقترحاتي' },
  seoTitle: { en: 'Submit a Project Proposal', ar: 'قدّم مقترح مشروع' },
  seoDescription: {
    en: 'Apply for funding support from the Zakat Distribution Foundation. Fill in the four-section form to describe your project, its beneficiaries, plan, and budget.',
    ar: 'اطلب دعمًا لتمويل مشروعك من مؤسسة توزيع الزكاة. املأ النموذج المكوّن من أربعة أقسام لتعريفنا بمشروعك والمستفيدين منه وخطته وميزانيته.',
  },
  title: { en: 'Submit a Project Proposal', ar: 'قدّم مقترح مشروع' },
  /** {org} is the foundation's name, shown in bold. */
  lead: {
    en: "Apply for funding support from the {org}. We'll email you a reference number and follow up after review.",
    ar: 'اطلب دعمًا لتمويل مشروعك من {org}. سنرسل إليك رقمًا مرجعيًا عبر البريد الإلكتروني، ونتواصل معك بعد دراسة طلبك.',
  },
  org: { en: 'Zakat Distribution Foundation', ar: 'مؤسسة توزيع الزكاة' },
  blockedTitle: { en: 'One of your projects still needs a completion report', ar: 'أحد مشاريعك ما زال بحاجة إلى تقرير الإنجاز' },
  goToProposals: { en: 'Go to my proposals', ar: 'اذهب إلى مقترحاتي' },
})

/** Split a message around one {placeholder} so a React node can sit in it. */
const around = (text: string, key: string): [string, string] => {
  const [before, after = ''] = text.split(`{${key}}`)
  return [before, after]
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const SubmitProposal = () => {
  const navigate = useNavigate()
  const t = useT()
  // Server messages are English: the Arabic site shows its own instead.
  const isAr = useLocale() === 'ar'
  const [submitting, setSubmitting] = useState(false)
  const [submittedId, setSubmittedId] = useState<number | null>(null)
  const [submittedEmail, setSubmittedEmail] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([])
  const [genericError, setGenericError] = useState<string>('')
  // A 409 means the applicant has funded work with no accepted report. It is
  // not a mistake in the form, so it gets its own panel above it — with a link
  // to the one place they can actually resolve it.
  const [blockedMessage, setBlockedMessage] = useState<string>('')

  const handleSubmit = async (payload: ReturnType<typeof buildProposalPayload>) => {
    setSubmitting(true); setGenericError(''); setFieldErrors([]); setBlockedMessage('')
    try {
      const resp = await fetch(`${API_URL}/api/project-proposals/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: M.submissionFailed.en }))
        if (Array.isArray(err.detail)) {
          // FastAPI validation payload — turn every error into a field-scoped
          // row. The form jumps to the first offending step on its own.
          setFieldErrors(parseFieldErrors(err.detail))
          return  // keep submitting=false via finally
        }
        const detail = typeof err.detail === 'string' ? err.detail : ''
        if (resp.status === 409 && detail) {
          // Nothing in the form can fix this, so do not phrase it as a
          // validation problem and do not scroll them back into the fields.
          if (isAr) {
            const id = detail.match(/#(\d+)/)?.[1]
            setBlockedMessage(id ? t(M.blockedAr, { id }) : t(M.blockedArNoId))
          } else {
            setBlockedMessage(detail)
          }
          window.scrollTo({ top: 0, behavior: 'smooth' })
          return
        }
        setGenericError((!isAr && detail) || t(M.checkEntries))
        return
      }
      const data = await resp.json()
      setSubmittedEmail(payload.email)
      setSubmittedId(data.id)
    } catch (exc: any) {
      setGenericError(isAr ? t(M.networkError) : exc?.message || t(M.networkError))
    } finally {
      setSubmitting(false)
    }
  }

  // ── Success state ─────────────────────────────────────────
  if (submittedId !== null) {
    const [thanksBefore, thanksAfter] = around(t(M.thankYou), 'email')
    const [statusBefore, statusAfter] = around(t(M.checkStatus), 'link')
    return (
      <div className="min-h-screen bg-gray-50 py-16">
        <SEOHead title={t(M.submittedSeoTitle)} description={t(M.submittedSeoDescription)} canonicalPath="/submit-proposal" />
        <div className="section-container">
          <div className="max-w-xl mx-auto card sm:p-10 text-center">
            <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-6">
              <CheckCircle2 className="w-9 h-9 text-green-700" aria-hidden="true" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-heading font-bold text-gray-900 mb-3">{t(M.received)}</h1>
            <p className="text-gray-600 leading-relaxed mb-6">
              {thanksBefore}<strong>{submittedEmail}</strong>{thanksAfter}
            </p>
            <p className="text-sm text-gray-500 mb-6">
              {t(M.reference)} <strong dir={isAr ? 'ltr' : undefined}>#{submittedId}</strong>
            </p>
            <p className="text-sm text-gray-600 mb-8">
              {statusBefore}
              <Link to="/my-proposals" className="text-primary-700 font-medium hover:underline">{t(M.myProposals)}</Link>
              {statusAfter}
            </p>
            <button onClick={() => navigate('/')} className="btn-primary">
              {t(C.backToHome)}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const [leadBefore, leadAfter] = around(t(M.lead), 'org')

  return (
    <div className="min-h-screen bg-gray-50 py-8 sm:py-12">
      <SEOHead
        title={t(M.seoTitle)}
        description={t(M.seoDescription)}
        canonicalPath="/submit-proposal"
      />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-6">

        {/* Header */}
        <div className="text-center">
          <Link to="/" className="text-sm text-gray-500 hover:text-gray-800 inline-flex items-center gap-1 mb-4"><ArrowLeft className="w-4 h-4" /> {t(C.backToHome)}</Link>
          <h1 className="text-3xl sm:text-4xl font-heading font-bold text-gray-900">{t(M.title)}</h1>
          <p className="text-gray-600 mt-2 max-w-2xl mx-auto">
            {leadBefore}<strong>{t(M.org)}</strong>{leadAfter}
          </p>
        </div>

        {blockedMessage && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
            <h2 className="text-base font-bold text-amber-900 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              {t(M.blockedTitle)}
            </h2>
            <p className="text-sm text-amber-900 mt-2">{blockedMessage}</p>
            <Link
              to="/my-proposals"
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg"
            >
              {t(M.goToProposals)} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        <ProposalForm
          mode="create"
          onSubmit={handleSubmit}
          submitting={submitting}
          fieldErrors={fieldErrors}
          genericError={genericError}
        />
      </div>
    </div>
  )
}

export default SubmitProposal
