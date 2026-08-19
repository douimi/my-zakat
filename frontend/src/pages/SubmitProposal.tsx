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
 * The wizard state lives entirely in local component state. Only after the
 * final submit does anything hit the backend.
 */
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, Check, User as UserIcon, ClipboardList, ListChecks,
  DollarSign, Loader2, CheckCircle2, Info, Send, AlertCircle,
} from 'lucide-react'
import SEOHead from '../components/SEOHead'

type StepIndex = 1 | 2 | 3 | 4

interface Form {
  // Section 1
  full_name: string
  national_id: string
  date_of_birth_year: string
  place_of_residence: string
  mobile_number: string
  email: string
  educational_level: string
  // Section 2
  project_name: string
  project_description: string
  problem_solved: string
  target_beneficiaries: string
  community_impact: string
  expected_impact: string
  // Section 3
  implementation_steps: string
  implementation_location: string
  required_materials: string
  expected_duration: string
  continuity_plan: string
  feasibility: string
  expected_challenges: string
  // Section 4
  number_of_beneficiaries: string
  cost_per_unit_usd: string
  unit_type: string
  additional_expenses_usd: string
  additional_expenses_description: string
}

const EMPTY: Form = {
  full_name: '', national_id: '', date_of_birth_year: '', place_of_residence: '',
  mobile_number: '', email: '', educational_level: '',
  project_name: '', project_description: '', problem_solved: '', target_beneficiaries: '',
  community_impact: '', expected_impact: '',
  implementation_steps: '', implementation_location: '', required_materials: '',
  expected_duration: '', continuity_plan: '', feasibility: '', expected_challenges: '',
  number_of_beneficiaries: '', cost_per_unit_usd: '', unit_type: 'family',
  additional_expenses_usd: '0', additional_expenses_description: '',
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const CURRENT_YEAR = new Date().getFullYear()

// TCR / 10DLC-compliant SMS opt-in disclosure. The message category must
// be exactly "Customer care" because that is the campaign use case we
// registered with the carrier — anything more specific (e.g. naming the
// proposal review flow) puts messages sent through this line out of scope.
//
// Stored verbatim with the proposal row when the applicant ticks the box
// so we can prove later exactly what they agreed to. Keep this wording
// in sync with what the checkbox actually shows.
const PROPOSAL_SMS_CONSENT_TEXT = (
  'By checking this box, I agree to receive SMS messages about Customer ' +
  'care from MyZakat at the mobile number provided above. Message ' +
  'frequency may vary. Message and data rates may apply. Text HELP to ' +
  '1-833-699-2528 for assistance. Reply STOP to opt out of receiving ' +
  'SMS messages.'
)

// Minimum-character rules match the backend Pydantic Field(min_length=...) on
// routers/project_proposals.py. Keeping the map in one place makes it trivial
// to keep both sides in sync and to render field-specific "X of Y characters"
// hints under each textarea.
const MIN_LEN: Partial<Record<keyof Form, number>> = {
  project_description: 10,
  problem_solved: 10,
  target_beneficiaries: 5,
  community_impact: 10,
  expected_impact: 10,
  implementation_steps: 5,
  implementation_location: 5,
  required_materials: 5,
  continuity_plan: 10,
  feasibility: 10,
  expected_challenges: 10,
}

// Human labels + which step each field lives on. Used to turn opaque Pydantic
// errors (which name fields by their snake_case key) into a friendly
// "Step 2 · Project description: needs at least 10 characters" list.
const FIELD_INFO: Record<string, { label: string; step: 1 | 2 | 3 | 4 }> = {
  full_name:              { label: 'Full name',              step: 1 },
  national_id:            { label: 'National ID',            step: 1 },
  date_of_birth_year:     { label: 'Date of birth',          step: 1 },
  place_of_residence:     { label: 'Place of residence',     step: 1 },
  mobile_number:          { label: 'Mobile number',          step: 1 },
  email:                  { label: 'Email',                  step: 1 },
  educational_level:      { label: 'Educational level',      step: 1 },
  project_name:           { label: 'Project name',           step: 2 },
  project_description:    { label: 'Project description',    step: 2 },
  problem_solved:         { label: 'Problem the project solves', step: 2 },
  target_beneficiaries:   { label: 'Target beneficiaries',   step: 2 },
  community_impact:       { label: 'Community impact',       step: 2 },
  expected_impact:        { label: 'Expected impact',        step: 2 },
  implementation_steps:   { label: 'Implementation steps',   step: 3 },
  implementation_location:{ label: 'Location',               step: 3 },
  required_materials:     { label: 'Required materials',     step: 3 },
  expected_duration:      { label: 'Expected duration',      step: 3 },
  continuity_plan:        { label: 'Continuity plan',        step: 3 },
  feasibility:            { label: 'Feasibility',            step: 3 },
  expected_challenges:    { label: 'Expected challenges',    step: 3 },
  number_of_beneficiaries:{ label: 'Beneficiaries count',    step: 4 },
  cost_per_unit_usd:      { label: 'Cost per unit',          step: 4 },
  unit_type:              { label: 'Unit type',              step: 4 },
  total_amount_usd:       { label: 'Total amount',           step: 4 },
}

function humanizePydanticError(msg: string): string {
  // Common patterns → plain English.
  const shortMatch = msg.match(/at least (\d+) character/i)
  if (shortMatch) return `needs at least ${shortMatch[1]} characters`
  const longMatch = msg.match(/at most (\d+) character/i)
  if (longMatch) return `too long (max ${longMatch[1]} characters)`
  if (/valid email/i.test(msg)) return 'not a valid email address'
  if (/greater than 0/i.test(msg)) return 'must be greater than zero'
  if (/greater than or equal to/i.test(msg)) return msg.replace(/^.*?(greater than.+)$/i, '$1')
  return msg.replace(/^(Value error, )/, '')
}

interface FieldError { field: string; label: string; step: 1 | 2 | 3 | 4; msg: string }

const Field = ({ label, required, children, hint }: { label: string; required?: boolean; children: React.ReactNode; hint?: string }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">
      {label}{required && <span className="text-red-500 ml-1">*</span>}
    </label>
    {children}
    {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
  </div>
)

/**
 * Live character-count helper shown under a textarea that has a minimum.
 * Turns green once the minimum is reached so people can see they're safe.
 */
const CharCount = ({ current, min }: { current: number; min: number | undefined }) => {
  if (!min) return null
  const ok = current >= min
  return (
    <p className={`text-xs mt-1 ${ok ? 'text-green-700' : 'text-amber-700'}`}>
      {ok
        ? `✓ ${current} characters`
        : `${current} of ${min} characters — needs ${min - current} more`}
    </p>
  )
}

const SubmitProposal = () => {
  const navigate = useNavigate()
  const [step, setStep] = useState<StepIndex>(1)
  const [form, setForm] = useState<Form>(EMPTY)
  const [submitting, setSubmitting] = useState(false)
  const [submittedId, setSubmittedId] = useState<number | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([])
  const [genericError, setGenericError] = useState<string>('')
  // Optional SMS opt-in. Must default to false (never pre-selected) per 10DLC
  // rules, and must not gate form submission — applicants can submit without it.
  const [smsConsent, setSmsConsent] = useState(false)

  // Helper: is `key` filled AND at least the required min length?
  const meets = (key: keyof Form): boolean => {
    const value = (form[key] || '').trim()
    if (!value) return false
    const min = MIN_LEN[key] || 0
    return value.length >= min
  }

  const set = <K extends keyof Form>(key: K) => (v: string) => setForm((f) => ({ ...f, [key]: v }))

  const subtotal = useMemo(() => {
    const n = parseFloat(form.number_of_beneficiaries || '0')
    const c = parseFloat(form.cost_per_unit_usd || '0')
    return isNaN(n) || isNaN(c) ? 0 : n * c
  }, [form.number_of_beneficiaries, form.cost_per_unit_usd])
  const additional = useMemo(() => {
    const a = parseFloat(form.additional_expenses_usd || '0')
    return isNaN(a) ? 0 : a
  }, [form.additional_expenses_usd])
  const total = subtotal + additional

  const canContinue1 = meets('full_name') && meets('national_id') && meets('date_of_birth_year') && meets('place_of_residence') && meets('mobile_number') && meets('email') && meets('educational_level')
  const canContinue2 = meets('project_name') && meets('project_description') && meets('problem_solved') && meets('target_beneficiaries') && meets('community_impact') && meets('expected_impact')
  const canContinue3 = meets('implementation_steps') && meets('implementation_location') && meets('required_materials') && meets('expected_duration') && meets('continuity_plan') && meets('feasibility') && meets('expected_challenges')
  const canSubmit = canContinue1 && canContinue2 && canContinue3 && meets('number_of_beneficiaries') && meets('cost_per_unit_usd') && meets('unit_type') && total > 0

  const handleSubmit = async () => {
    setSubmitting(true); setGenericError(''); setFieldErrors([])
    try {
      const payload = {
        full_name: form.full_name.trim(),
        national_id: form.national_id.trim(),
        date_of_birth_year: parseInt(form.date_of_birth_year),
        place_of_residence: form.place_of_residence.trim(),
        mobile_number: form.mobile_number.trim(),
        email: form.email.trim(),
        educational_level: form.educational_level.trim(),
        project_name: form.project_name.trim(),
        project_description: form.project_description.trim(),
        problem_solved: form.problem_solved.trim(),
        target_beneficiaries: form.target_beneficiaries.trim(),
        community_impact: form.community_impact.trim(),
        expected_impact: form.expected_impact.trim(),
        implementation_steps: form.implementation_steps.trim(),
        implementation_location: form.implementation_location.trim(),
        required_materials: form.required_materials.trim(),
        expected_duration: form.expected_duration.trim(),
        continuity_plan: form.continuity_plan.trim(),
        feasibility: form.feasibility.trim(),
        expected_challenges: form.expected_challenges.trim(),
        number_of_beneficiaries: parseInt(form.number_of_beneficiaries),
        cost_per_unit_usd: parseFloat(form.cost_per_unit_usd),
        unit_type: form.unit_type.trim(),
        additional_expenses_usd: parseFloat(form.additional_expenses_usd || '0'),
        additional_expenses_description: form.additional_expenses_description.trim() || null,
        total_amount_usd: total,
        sms_consent: smsConsent,
        sms_consent_text: smsConsent ? PROPOSAL_SMS_CONSENT_TEXT : null,
      }
      const resp = await fetch(`${API_URL}/api/project-proposals/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: 'Submission failed' }))
        if (Array.isArray(err.detail)) {
          // FastAPI validation payload — turn every error into a field-scoped row.
          const parsed: FieldError[] = err.detail.map((e: any) => {
            const key = (e.loc?.[e.loc.length - 1] || 'field') as keyof Form
            const info = FIELD_INFO[key] || { label: String(key), step: 1 as const }
            return {
              field: String(key),
              label: info.label,
              step: info.step,
              msg: humanizePydanticError(e.msg || 'Invalid value'),
            }
          })
          setFieldErrors(parsed)
          // Jump to the first offending step so the user immediately sees the fields to fix.
          const firstBrokenStep = Math.min(...parsed.map((p) => p.step)) as 1 | 2 | 3 | 4
          if (firstBrokenStep >= 1 && firstBrokenStep <= 4) setStep(firstBrokenStep)
          return  // keep submitting=false via finally
        }
        setGenericError(typeof err.detail === 'string' ? err.detail : 'Please check your entries and try again.')
        return
      }
      const data = await resp.json()
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
      <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-blue-50 py-16">
        <SEOHead title="Proposal Submitted" description="Your project proposal has been received." canonicalPath="/submit-proposal" />
        <div className="section-container">
          <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-lg p-8 sm:p-10 text-center">
            <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-6">
              <CheckCircle2 className="w-9 h-9 text-green-600" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-heading font-bold text-gray-900 mb-3">Proposal received</h1>
            <p className="text-gray-600 leading-relaxed mb-6">
              Thank you for submitting your project proposal. Our review team will study your
              request and get back to you at <strong>{form.email}</strong>.
            </p>
            <p className="text-sm text-gray-500 mb-8">
              Reference number: <strong>#{submittedId}</strong>
            </p>
            <button onClick={() => navigate('/')} className="inline-block bg-primary-600 hover:bg-primary-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors">
              Back to Home
            </button>
          </div>
        </div>
      </div>
    )
  }

  const steps: { n: StepIndex; label: string; icon: any }[] = [
    { n: 1, label: 'Personal',  icon: UserIcon },
    { n: 2, label: 'Project',   icon: ClipboardList },
    { n: 3, label: 'Plan',      icon: ListChecks },
    { n: 4, label: 'Budget',    icon: DollarSign },
  ]

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
            Apply for funding support from the <strong>Zakat Distribution Foundation</strong>. Four short sections —
            we'll email you a copy and follow up after review.
          </p>
        </div>

        {/* Step indicator */}
        <ol className="grid grid-cols-4 gap-2 text-xs sm:text-sm">
          {steps.map(({ n, label, icon: Icon }) => {
            const active = step === n
            const done = step > n
            return (
              <li key={n} className={`flex items-center gap-2 rounded-lg p-3 border ${
                active ? 'border-primary-500 bg-primary-50 text-primary-800'
                : done ? 'border-green-300 bg-green-50 text-green-800'
                : 'border-gray-200 bg-white text-gray-500'
              }`}>
                <span className={`w-7 h-7 rounded-full flex items-center justify-center font-semibold ${
                  active ? 'bg-primary-600 text-white' : done ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-600'
                }`}>{done ? <Check className="w-4 h-4" /> : n}</span>
                <span className="flex flex-col leading-tight">
                  <span className="font-semibold flex items-center gap-1"><Icon className="w-3.5 h-3.5" /> Step {n}</span>
                  <span className="hidden sm:inline">{label}</span>
                </span>
              </li>
            )
          })}
        </ol>

        {/* ── STEP 1 — Personal ────────────────────────────── */}
        {step === 1 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Personal information</h2>
              <p className="text-sm text-gray-500 mt-1">Tell us about you — the applicant responsible for this project.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Full name" required>
                <input required value={form.full_name} onChange={(e) => set('full_name')(e.target.value)} className="input-field" />
              </Field>
              <Field label="National ID number" required>
                <input required value={form.national_id} onChange={(e) => set('national_id')(e.target.value)} className="input-field" />
              </Field>
              <Field label="Date of birth (year)" required>
                <input required type="number" min={1900} max={CURRENT_YEAR - 5} value={form.date_of_birth_year} onChange={(e) => set('date_of_birth_year')(e.target.value)} className="input-field" placeholder="e.g. 1992" />
              </Field>
              <Field label="Place of residence" required>
                <input required value={form.place_of_residence} onChange={(e) => set('place_of_residence')(e.target.value)} className="input-field" placeholder="City / Governorate" />
              </Field>
              <Field label="Mobile number" required>
                <input required value={form.mobile_number} onChange={(e) => set('mobile_number')(e.target.value)} className="input-field" placeholder="With country code" />
              </Field>

              {/* Optional SMS opt-in — 10DLC / TCR compliance. Must be
                  unchecked by default, must not block form submission, and
                  the disclosure must be presented alongside the checkbox. */}
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={smsConsent}
                    onChange={(e) => setSmsConsent(e.target.checked)}
                    className="mt-1 w-4 h-4 text-primary-600 rounded border-gray-400 focus:ring-2 focus:ring-primary-500 flex-shrink-0"
                    aria-describedby="proposal-sms-consent"
                  />
                  <span id="proposal-sms-consent" className="text-sm text-gray-700 leading-relaxed">
                    {PROPOSAL_SMS_CONSENT_TEXT} Please review our{' '}
                    <Link to="/privacy-policy" className="text-primary-700 font-medium hover:underline">
                      Privacy Policy
                    </Link>{' '}
                    and{' '}
                    <Link to="/terms-of-service" className="text-primary-700 font-medium hover:underline">
                      Terms of Service
                    </Link>.
                  </span>
                </label>
                <p className="text-xs text-gray-500 mt-2 ml-7">
                  Optional. You can submit your proposal without opting in.
                </p>
              </div>

              <Field label="Email" required>
                <input required type="email" value={form.email} onChange={(e) => set('email')(e.target.value)} className="input-field" />
              </Field>
              <Field label="Educational level" required>
                <input required value={form.educational_level} onChange={(e) => set('educational_level')(e.target.value)} className="input-field" placeholder="e.g. Bachelor of Business Administration" />
              </Field>
            </div>
            <div className="flex justify-end pt-4 border-t border-gray-100">
              <button onClick={() => setStep(2)} disabled={!canContinue1} className="px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white font-semibold rounded-lg inline-flex items-center gap-2">Continue <ArrowRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}

        {/* ── STEP 2 — Project ─────────────────────────────── */}
        {step === 2 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Project information</h2>
              <p className="text-sm text-gray-500 mt-1">Describe what the project does and who it helps.</p>
            </div>
            <Field label="Project name" required>
              <input required value={form.project_name} onChange={(e) => set('project_name')(e.target.value)} className="input-field" placeholder="e.g. Fresh Chicken Food Parcels Project" />
            </Field>
            <Field label="Project idea description" required hint="A short paragraph summarizing what the project does.">
              <textarea required rows={4} value={form.project_description} onChange={(e) => set('project_description')(e.target.value)} className="input-field" />
              <CharCount current={form.project_description.trim().length} min={MIN_LEN.project_description} />
            </Field>
            <Field label="What problem does the project solve?" required>
              <textarea required rows={3} value={form.problem_solved} onChange={(e) => set('problem_solved')(e.target.value)} className="input-field" />
              <CharCount current={form.problem_solved.trim().length} min={MIN_LEN.problem_solved} />
            </Field>
            <Field label="Target beneficiaries" required hint="Include number and description of who benefits (e.g. 250 displaced families).">
              <textarea required rows={3} value={form.target_beneficiaries} onChange={(e) => set('target_beneficiaries')(e.target.value)} className="input-field" />
              <CharCount current={form.target_beneficiaries.trim().length} min={MIN_LEN.target_beneficiaries} />
            </Field>
            <Field label="How will the project serve the community?" required>
              <textarea required rows={3} value={form.community_impact} onChange={(e) => set('community_impact')(e.target.value)} className="input-field" />
              <CharCount current={form.community_impact.trim().length} min={MIN_LEN.community_impact} />
            </Field>
            <Field label="Expected economic or social impact" required>
              <textarea required rows={3} value={form.expected_impact} onChange={(e) => set('expected_impact')(e.target.value)} className="input-field" />
              <CharCount current={form.expected_impact.trim().length} min={MIN_LEN.expected_impact} />
            </Field>
            <div className="flex items-center justify-between pt-4 border-t border-gray-100">
              <button onClick={() => setStep(1)} className="px-4 py-2 text-gray-600 inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Back</button>
              <button onClick={() => setStep(3)} disabled={!canContinue2} className="px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white font-semibold rounded-lg inline-flex items-center gap-2">Continue <ArrowRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}

        {/* ── STEP 3 — Plan ────────────────────────────────── */}
        {step === 3 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Project plan</h2>
              <p className="text-sm text-gray-500 mt-1">How you'll actually run it. For bullet lists, put each item on its own line — we'll format it in the PDF.</p>
            </div>
            <Field label="Implementation steps" required hint="One step per line. The PDF will render these as a bulleted list.">
              <textarea required rows={5} value={form.implementation_steps} onChange={(e) => set('implementation_steps')(e.target.value)} className="input-field" placeholder={"Planning and identifying target families\nPurchasing supplies\nDistributing parcels\nDocumenting the project"} />
              <CharCount current={form.implementation_steps.trim().length} min={MIN_LEN.implementation_steps} />
            </Field>
            <Field label="Where will the project be implemented?" required>
              <textarea required rows={2} value={form.implementation_location} onChange={(e) => set('implementation_location')(e.target.value)} className="input-field" />
              <CharCount current={form.implementation_location.trim().length} min={MIN_LEN.implementation_location} />
            </Field>
            <Field label="Required materials or equipment" required hint="One item per line.">
              <textarea required rows={4} value={form.required_materials} onChange={(e) => set('required_materials')(e.target.value)} className="input-field" placeholder={"Fresh chicken\nPackaging bags\nTransportation\nAdministrative materials"} />
              <CharCount current={form.required_materials.trim().length} min={MIN_LEN.required_materials} />
            </Field>
            <Field label="Expected duration to start implementation" required>
              <input required value={form.expected_duration} onChange={(e) => set('expected_duration')(e.target.value)} className="input-field" placeholder="e.g. Within one day after procurement is complete" />
            </Field>
            <Field label="How will the project continue after funding?" required>
              <textarea required rows={3} value={form.continuity_plan} onChange={(e) => set('continuity_plan')(e.target.value)} className="input-field" />
              <CharCount current={form.continuity_plan.trim().length} min={MIN_LEN.continuity_plan} />
            </Field>
            <Field label="Why is it feasible under current conditions?" required>
              <textarea required rows={3} value={form.feasibility} onChange={(e) => set('feasibility')(e.target.value)} className="input-field" />
              <CharCount current={form.feasibility.trim().length} min={MIN_LEN.feasibility} />
            </Field>
            <Field label="Expected challenges and how to address them" required hint="One challenge per line, with your mitigation for each.">
              <textarea required rows={4} value={form.expected_challenges} onChange={(e) => set('expected_challenges')(e.target.value)} className="input-field" placeholder={"Difficulty reaching families: coordinate with local committees\nCrowding at distribution: allocate time slots"} />
              <CharCount current={form.expected_challenges.trim().length} min={MIN_LEN.expected_challenges} />
            </Field>
            <div className="flex items-center justify-between pt-4 border-t border-gray-100">
              <button onClick={() => setStep(2)} className="px-4 py-2 text-gray-600 inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Back</button>
              <button onClick={() => setStep(4)} disabled={!canContinue3} className="px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white font-semibold rounded-lg inline-flex items-center gap-2">Continue <ArrowRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}

        {/* ── STEP 4 — Budget + review ─────────────────────── */}
        {step === 4 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Required budget</h2>
              <p className="text-sm text-gray-500 mt-1">We'll calculate the total for you as you fill in the breakdown.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Beneficiaries (count)" required>
                <input required type="number" min={1} value={form.number_of_beneficiaries} onChange={(e) => set('number_of_beneficiaries')(e.target.value)} className="input-field" placeholder="200" />
              </Field>
              <Field label="Cost per unit (USD)" required>
                <input required type="number" min={0.01} step="0.01" value={form.cost_per_unit_usd} onChange={(e) => set('cost_per_unit_usd')(e.target.value)} className="input-field" placeholder="20" />
              </Field>
              <Field label="Unit type" required hint="What you're counting: family, parcel, person, etc.">
                <input required value={form.unit_type} onChange={(e) => set('unit_type')(e.target.value)} className="input-field" placeholder="family" />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Additional expenses (USD)" hint="Transportation, packaging, admin costs, etc.">
                <input type="number" min={0} step="0.01" value={form.additional_expenses_usd} onChange={(e) => set('additional_expenses_usd')(e.target.value)} className="input-field" placeholder="0" />
              </Field>
              <Field label="What are those additional expenses?">
                <input value={form.additional_expenses_description} onChange={(e) => set('additional_expenses_description')(e.target.value)} className="input-field" placeholder="e.g. Transportation & packaging" />
              </Field>
            </div>

            {/* Live total */}
            <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-primary-800">
                  {form.number_of_beneficiaries || 0} {form.unit_type || 'unit'}s × ${parseFloat(form.cost_per_unit_usd || '0').toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
                <span className="font-semibold text-primary-800">${subtotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </div>
              {additional > 0 && (
                <div className="flex items-center justify-between text-sm mt-1">
                  <span className="text-primary-800">Additional expenses</span>
                  <span className="font-semibold text-primary-800">${additional.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                </div>
              )}
              <div className="border-t border-primary-300 my-2" />
              <div className="flex items-center justify-between">
                <span className="text-primary-900 font-semibold">Total required amount</span>
                <span className="text-2xl font-bold text-primary-900">${total.toLocaleString(undefined, { maximumFractionDigits: 2 })} <span className="text-sm font-normal">USD</span></span>
              </div>
            </div>

            {fieldErrors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm space-y-2">
                <div className="font-semibold text-red-900 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Please fix {fieldErrors.length === 1 ? 'this item' : `these ${fieldErrors.length} items`} before submitting:
                </div>
                <ul className="text-red-800 space-y-1 pl-6">
                  {fieldErrors.map((e, i) => (
                    <li key={i} className="list-disc">
                      <button
                        type="button"
                        onClick={() => setStep(e.step)}
                        className="text-left underline hover:text-red-900 focus:outline-none focus:ring-2 focus:ring-red-500 rounded"
                      >
                        <strong>Step {e.step} · {e.label}:</strong> {e.msg}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {genericError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{genericError}</span>
              </div>
            )}

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600 flex items-start gap-2">
              <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-400" />
              <span>By submitting you confirm the information is accurate. Our team will review your proposal and reach out via <strong>{form.email || 'the email above'}</strong>.</span>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-gray-100">
              <button onClick={() => setStep(3)} className="px-4 py-2 text-gray-600 inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Back</button>
              <button onClick={handleSubmit} disabled={!canSubmit || submitting} className="px-8 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white font-semibold rounded-lg inline-flex items-center gap-2">
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : <><Send className="w-4 h-4" /> Submit proposal</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default SubmitProposal
