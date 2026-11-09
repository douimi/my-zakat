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

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const SubmitProposal = () => {
  const navigate = useNavigate()
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
        const err = await resp.json().catch(() => ({ detail: 'Submission failed' }))
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
          setBlockedMessage(detail)
          window.scrollTo({ top: 0, behavior: 'smooth' })
          return
        }
        setGenericError(detail || 'Please check your entries and try again.')
        return
      }
      const data = await resp.json()
      setSubmittedEmail(payload.email)
      setSubmittedId(data.id)
    } catch (exc: any) {
      setGenericError(exc?.message || 'Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Success state ─────────────────────────────────────────
  if (submittedId !== null) {
    return (
      <div className="min-h-screen bg-gray-50 py-16">
        <SEOHead title="Proposal Submitted" description="Your project proposal has been received." canonicalPath="/submit-proposal" />
        <div className="section-container">
          <div className="max-w-xl mx-auto card sm:p-10 text-center">
            <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-6">
              <CheckCircle2 className="w-9 h-9 text-green-700" aria-hidden="true" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-heading font-bold text-gray-900 mb-3">Proposal received</h1>
            <p className="text-gray-600 leading-relaxed mb-6">
              Thank you for submitting your project proposal. Our review team will study your
              request and get back to you at <strong>{submittedEmail}</strong>.
            </p>
            <p className="text-sm text-gray-500 mb-6">
              Reference number: <strong>#{submittedId}</strong>
            </p>
            <p className="text-sm text-gray-600 mb-8">
              You can check its status at any time from{' '}
              <Link to="/my-proposals" className="text-primary-700 font-medium hover:underline">My proposals</Link>{' '}
              — we will email you a sign-in code, no account needed.
            </p>
            <button onClick={() => navigate('/')} className="btn-primary">
              Back to Home
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 sm:py-12">
      <SEOHead
        title="Submit a Project Proposal"
        description="Apply for funding support from the Zakat Distribution Foundation. Fill in the four-section form to describe your project, its beneficiaries, plan, and budget."
        canonicalPath="/submit-proposal"
      />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-6">

        {/* Header */}
        <div className="text-center">
          <Link to="/" className="text-sm text-gray-500 hover:text-gray-800 inline-flex items-center gap-1 mb-4"><ArrowLeft className="w-4 h-4" /> Back to Home</Link>
          <h1 className="text-3xl sm:text-4xl font-heading font-bold text-gray-900">Submit a Project Proposal</h1>
          <p className="text-gray-600 mt-2 max-w-2xl mx-auto">
            Apply for funding support from the <strong>Zakat Distribution Foundation</strong>.
            We'll email you a reference number and follow up after review.
          </p>
        </div>

        {blockedMessage && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
            <h2 className="text-base font-bold text-amber-900 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              One of your projects still needs a completion report
            </h2>
            <p className="text-sm text-amber-900 mt-2">{blockedMessage}</p>
            <Link
              to="/my-proposals"
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg"
            >
              Go to my proposals <ArrowRight className="w-4 h-4" />
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
