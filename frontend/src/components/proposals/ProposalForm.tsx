/**
 * The four-section project-proposal form, shared by two callers.
 *
 *   mode="create"  — the public /submit-proposal page, empty, email editable.
 *   mode="revise"  — the /my-proposals portal, prefilled from the current
 *                    version, email locked because it is the dossier's identity
 *                    key and the portal's access key.
 *
 * The component owns the wizard step, the field values and client-side
 * completeness. The parent owns submission: it receives a ready payload, and
 * hands back `submitting`, `fieldErrors` and `genericError`. That split is what
 * lets the portal keep the filled-in values when a 30-minute token expires
 * mid-edit — it re-authenticates and calls onSubmit again with the same form
 * still mounted.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, Check, User as UserIcon, ClipboardList, ListChecks,
  DollarSign, Loader2, Send, AlertCircle,
} from 'lucide-react'
import { defineMessages, useFormat, useLocale, useT, type Message } from '../../i18n'
import { C } from '../../i18n/common'

/**
 * Strings of the proposal form. Exported because the portal (MyProposals)
 * shows the same field names when it lists a version's content.
 */
export const PROPOSAL_FORM_MESSAGES = defineMessages({
  stepDone: { en: 'Step {n} done', ar: 'اكتملت الخطوة {n}' },
  step: { en: 'Step {n}', ar: 'الخطوة {n}' },
  stepPersonal: { en: 'Personal', ar: 'بياناتك' },
  stepProject: { en: 'Project', ar: 'المشروع' },
  stepPlan: { en: 'Plan', ar: 'الخطة' },
  stepBudget: { en: 'Budget', ar: 'الميزانية' },
  resubmit: { en: 'Resubmit proposal', ar: 'أعد إرسال المقترح' },
  submit: { en: 'Submit proposal', ar: 'أرسل المقترح' },
  continue: { en: 'Continue', ar: 'متابعة' },
  back: { en: 'Back', ar: 'رجوع' },
  submitting: { en: 'Submitting…', ar: 'جارٍ الإرسال…' },
  // Step 1
  personalTitle: { en: 'Personal information', ar: 'المعلومات الشخصية' },
  personalLead: { en: 'Tell us about you — the applicant responsible for this project.', ar: 'عرّفنا بنفسك، فأنت مقدّم الطلب والمسؤول عن هذا المشروع.' },
  fullName: { en: 'Full name', ar: 'الاسم الكامل' },
  nationalId: { en: 'National ID number', ar: 'رقم بطاقة الهوية الوطنية' },
  birthYear: { en: 'Date of birth (year)', ar: 'سنة الميلاد' },
  birthYearPlaceholder: { en: 'e.g. 1992', ar: 'مثال: 1992' },
  residence: { en: 'Place of residence', ar: 'مكان الإقامة' },
  residencePlaceholder: { en: 'City / Governorate', ar: 'المدينة / المحافظة' },
  mobile: { en: 'Mobile number', ar: 'رقم الجوال' },
  mobilePlaceholder: { en: 'With country code', ar: 'مع رمز الدولة' },
  smsConsent: { en: 'SMS consent', ar: 'الموافقة على الرسائل النصية' },
  optional: { en: 'Optional', ar: 'اختياري' },
  /**
   * Translation of meaning of PROPOSAL_SMS_CONSENT_TEXT. The English text is
   * still shown verbatim under it, and it is the English text that is stored
   * as the record of consent (it is the wording registered with the carrier).
   */
  smsConsentAr: {
    en: '',
    ar: 'بتحديد هذا المربع، أوافق على تلقي رسائل نصية (SMS) من ماي زكاة بخصوص خدمة العملاء على رقم الجوال المذكور أعلاه. قد يختلف عدد الرسائل، وقد تُطبَّق رسوم الرسائل والبيانات. أرسل HELP إلى الرقم 1-833-699-2528 للحصول على المساعدة، وأرسل STOP لإيقاف الرسائل.',
  },
  smsConsentOfficial: { en: '', ar: 'النص الرسمي للموافقة (بالإنجليزية):' },
  pleaseReview: { en: 'Please review our', ar: 'يُرجى الاطلاع على' },
  and: { en: 'and', ar: 'و' },
  restating: {
    en: 'You opted in to SMS messages on your previous submission, so this box starts ticked. Untick it to withdraw your consent.',
    ar: 'وافقت على تلقي الرسائل النصية في طلبك السابق، لذلك يظهر هذا المربع محددًا. أزل التحديد إن أردت سحب موافقتك.',
  },
  withoutOptIn: { en: 'You can submit your proposal without opting in.', ar: 'يمكنك إرسال مقترحك دون الموافقة على الرسائل النصية.' },
  email: { en: 'Email', ar: 'البريد الإلكتروني' },
  emailLocked: {
    en: 'Contact us if you need to change the email on your application.',
    ar: 'تواصل معنا إذا احتجت إلى تغيير البريد الإلكتروني في طلبك.',
  },
  education: { en: 'Educational level', ar: 'المستوى التعليمي' },
  educationPlaceholder: { en: 'e.g. Bachelor of Business Administration', ar: 'مثال: بكالوريوس إدارة الأعمال' },
  // Step 2
  projectTitle: { en: 'Project information', ar: 'معلومات المشروع' },
  projectLead: { en: 'Describe what the project does and who it helps.', ar: 'صِف ما يقدّمه المشروع ومن يستفيد منه.' },
  projectName: { en: 'Project name', ar: 'اسم المشروع' },
  projectNamePlaceholder: { en: 'e.g. Fresh Chicken Food Parcels Project', ar: 'مثال: مشروع سلال غذائية من الدجاج الطازج' },
  projectDescription: { en: 'Project idea description', ar: 'وصف فكرة المشروع' },
  projectDescriptionHint: { en: 'A short paragraph summarizing what the project does.', ar: 'فقرة قصيرة تلخّص ما يقدّمه المشروع.' },
  problemSolved: { en: 'What problem does the project solve?', ar: 'ما المشكلة التي يحلّها المشروع؟' },
  targetBeneficiaries: { en: 'Target beneficiaries', ar: 'الفئة المستفيدة' },
  targetBeneficiariesHint: {
    en: 'Include number and description of who benefits (e.g. 250 displaced families).',
    ar: 'اذكر عدد المستفيدين ووصفهم (مثال: 250 أسرة نازحة).',
  },
  communityImpact: { en: 'How will the project serve the community?', ar: 'كيف سيخدم المشروع المجتمع؟' },
  expectedImpact: { en: 'Expected economic or social impact', ar: 'الأثر الاقتصادي أو الاجتماعي المتوقع' },
  // Step 3
  planTitle: { en: 'Project plan', ar: 'خطة المشروع' },
  planLead: { en: "How you'll run it.", ar: 'كيف ستنفّذ المشروع.' },
  steps: { en: 'Implementation steps', ar: 'خطوات التنفيذ' },
  stepsHint: {
    en: 'One step per line. The PDF will render these as a bulleted list.',
    ar: 'اكتب كل خطوة في سطر مستقل. ستظهر في ملف PDF على شكل قائمة نقطية.',
  },
  stepsPlaceholder: {
    en: 'Planning and identifying target families\nPurchasing supplies\nDistributing parcels\nDocumenting the project',
    ar: 'التخطيط وتحديد الأسر المستهدفة\nشراء المستلزمات\nتوزيع السلال\nتوثيق المشروع',
  },
  location: { en: 'Where will the project be implemented?', ar: 'أين سيُنفَّذ المشروع؟' },
  materials: { en: 'Required materials or equipment', ar: 'المواد أو المعدات المطلوبة' },
  materialsHint: { en: 'One item per line.', ar: 'اكتب كل عنصر في سطر مستقل.' },
  materialsPlaceholder: {
    en: 'Fresh chicken\nPackaging bags\nTransportation\nAdministrative materials',
    ar: 'دجاج طازج\nأكياس تغليف\nنقل\nمستلزمات إدارية',
  },
  duration: { en: 'Expected duration to start implementation', ar: 'المدة المتوقعة لبدء التنفيذ' },
  durationPlaceholder: { en: 'e.g. Within one day after procurement is complete', ar: 'مثال: خلال يوم واحد بعد إتمام الشراء' },
  continuity: { en: 'How will the project continue after funding?', ar: 'كيف سيستمر المشروع بعد انتهاء التمويل؟' },
  feasibility: { en: 'Why is it feasible under current conditions?', ar: 'لماذا يمكن تنفيذه في الظروف الحالية؟' },
  challenges: { en: 'Expected challenges and how to address them', ar: 'التحديات المتوقعة وكيف ستتعامل معها' },
  challengesHint: { en: 'One challenge per line, with your mitigation for each.', ar: 'اكتب كل تحدٍّ في سطر مستقل، مع طريقة التعامل معه.' },
  challengesPlaceholder: {
    en: 'Difficulty reaching families: coordinate with local committees\nCrowding at distribution: allocate time slots',
    ar: 'صعوبة الوصول إلى الأسر: التنسيق مع اللجان المحلية\nالازدحام أثناء التوزيع: تحديد مواعيد لكل مجموعة',
  },
  // Step 4
  budgetTitle: { en: 'Required budget', ar: 'الميزانية المطلوبة' },
  budgetLead: { en: "We'll calculate the total for you as you fill in the breakdown.", ar: 'سنحسب المبلغ الإجمالي تلقائيًا أثناء إدخالك للتفاصيل.' },
  beneficiariesCount: { en: 'Beneficiaries (count)', ar: 'عدد المستفيدين' },
  costPerUnit: { en: 'Cost per unit (USD)', ar: 'تكلفة الوحدة (بالدولار الأمريكي)' },
  unitType: { en: 'Unit type', ar: 'نوع الوحدة' },
  unitTypeHint: { en: "What you're counting: family, parcel, person, etc.", ar: 'ما الذي تَعُدّه: أسرة، سلة، شخص، إلخ.' },
  additionalExpenses: { en: 'Additional expenses (USD)', ar: 'مصاريف إضافية (بالدولار الأمريكي)' },
  additionalExpensesHint: { en: 'Transportation, packaging, admin costs, etc.', ar: 'النقل، التغليف، المصاريف الإدارية، إلخ.' },
  additionalWhat: { en: 'What are those additional expenses?', ar: 'ما هذه المصاريف الإضافية؟' },
  additionalWhatPlaceholder: { en: 'e.g. Transportation & packaging', ar: 'مثال: النقل والتغليف' },
  /** Arabic only: the English line pluralises the unit by adding "s". */
  breakdown: { en: '', ar: '{count} {unit} × {cost}' },
  unit: { en: 'unit', ar: 'وحدة' },
  additionalLine: { en: 'Additional expenses', ar: 'مصاريف إضافية' },
  totalRequired: { en: 'Total required amount', ar: 'المبلغ الإجمالي المطلوب' },
  stepLabel: { en: 'Step {n} · {label}:', ar: 'الخطوة {n} · {label}:' },
  confirmAccurate: {
    en: 'By submitting you confirm the information is accurate. Our team will review your proposal and reach out via {email}.',
    ar: 'بإرسال الطلب، تؤكد أن المعلومات صحيحة. سيدرس فريقنا مقترحك ويتواصل معك عبر {email}.',
  },
  theEmailAbove: { en: 'the email above', ar: 'البريد الإلكتروني المذكور أعلاه' },
  // Character counter (Arabic only; English keeps its template literal)
  charsOk: { en: '', ar: '✓ {count}' },
  charsProgress: { en: '', ar: '{current} من {min} أحرف — {remaining}' },
})
const PM = PROPOSAL_FORM_MESSAGES

/** Field names in Arabic, keyed like FIELD_INFO, for server-side error rows. */
const FIELD_LABELS_AR: Record<string, string> = {
  full_name: 'الاسم الكامل',
  national_id: 'رقم الهوية الوطنية',
  date_of_birth_year: 'سنة الميلاد',
  place_of_residence: 'مكان الإقامة',
  mobile_number: 'رقم الجوال',
  email: 'البريد الإلكتروني',
  educational_level: 'المستوى التعليمي',
  project_name: 'اسم المشروع',
  project_description: 'وصف المشروع',
  problem_solved: 'المشكلة التي يحلّها المشروع',
  target_beneficiaries: 'الفئة المستفيدة',
  community_impact: 'خدمة المجتمع',
  expected_impact: 'الأثر المتوقع',
  implementation_steps: 'خطوات التنفيذ',
  implementation_location: 'مكان التنفيذ',
  required_materials: 'المواد المطلوبة',
  expected_duration: 'المدة المتوقعة',
  continuity_plan: 'خطة الاستمرارية',
  feasibility: 'إمكانية التنفيذ',
  expected_challenges: 'التحديات المتوقعة',
  number_of_beneficiaries: 'عدد المستفيدين',
  cost_per_unit_usd: 'تكلفة الوحدة',
  unit_type: 'نوع الوحدة',
  total_amount_usd: 'المبلغ الإجمالي',
}

/**
 * Arabic for the plain-English messages humanizePydanticError produces. Takes
 * its output, so the exported English helpers stay exactly as they are.
 */
export function arabicFieldMessage(msg: string): string {
  const atLeast = msg.match(/^needs at least (\d+) characters$/)
  if (atLeast) return `يجب أن يتكون من ${atLeast[1]} أحرف على الأقل`
  const tooLong = msg.match(/^too long \(max (\d+) characters\)$/)
  if (tooLong) return `النص طويل جدًا (الحد الأقصى ${tooLong[1]} حرفًا)`
  if (msg === 'not a valid email address') return 'عنوان البريد الإلكتروني غير صحيح'
  if (msg === 'must be greater than zero') return 'يجب أن تكون القيمة أكبر من صفر'
  return msg
}

export type StepIndex = 1 | 2 | 3 | 4

export interface ProposalFormValues {
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

export const EMPTY_PROPOSAL_FORM: ProposalFormValues = {
  full_name: '', national_id: '', date_of_birth_year: '', place_of_residence: '',
  mobile_number: '', email: '', educational_level: '',
  project_name: '', project_description: '', problem_solved: '', target_beneficiaries: '',
  community_impact: '', expected_impact: '',
  implementation_steps: '', implementation_location: '', required_materials: '',
  expected_duration: '', continuity_plan: '', feasibility: '', expected_challenges: '',
  number_of_beneficiaries: '', cost_per_unit_usd: '', unit_type: 'family',
  additional_expenses_usd: '0', additional_expenses_description: '',
}

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
const MIN_LEN: Partial<Record<keyof ProposalFormValues, number>> = {
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

export function humanizePydanticError(msg: string): string {
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

export interface FieldError { field: string; label: string; step: 1 | 2 | 3 | 4; msg: string }

/** Turn a FastAPI 422 body into step-scoped rows the form can jump to. */
export function parseFieldErrors(detail: unknown): FieldError[] {
  if (!Array.isArray(detail)) return []
  return detail.map((e: any) => {
    const key = String(e.loc?.[e.loc.length - 1] ?? 'field')
    const info = FIELD_INFO[key] || { label: key, step: 1 as StepIndex }
    return { field: key, label: info.label, step: info.step, msg: humanizePydanticError(e.msg || 'Invalid value') }
  })
}

const num = (v: string) => {
  const parsed = parseFloat(v || '0')
  return Number.isNaN(parsed) ? 0 : parsed
}

/** The exact JSON body both POST / and PUT /portal/{id} expect. */
export function buildProposalPayload(form: ProposalFormValues, smsConsent: boolean) {
  return {
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
    total_amount_usd: num(form.number_of_beneficiaries) * num(form.cost_per_unit_usd) + num(form.additional_expenses_usd),
    sms_consent: smsConsent,
    sms_consent_text: smsConsent ? PROPOSAL_SMS_CONSENT_TEXT : null,
  }
}

const Field = ({ label, required, children, hint, htmlFor }: { label: string; required?: boolean; children: React.ReactNode; hint?: string; htmlFor?: string }) => (
  <div>
    <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700 mb-1">
      {label}{required && <span className="text-red-500 ms-1">*</span>}
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
  const t = useT()
  const isAr = useLocale() === 'ar'
  const fmt = useFormat()
  if (!min) return null
  const ok = current >= min
  const arText = ok
    ? t(PM.charsOk, {
        count: fmt.plural(current, {
          zero: 'لا أحرف', one: 'حرف واحد', two: 'حرفان', few: '{count} أحرف', many: '{count} حرفًا', other: '{count} حرف',
        }),
      })
    : t(PM.charsProgress, {
        current,
        min,
        remaining: fmt.plural(min - current, {
          one: 'بقي حرف واحد', two: 'بقي حرفان', few: 'بقيت {count} أحرف', many: 'بقي {count} حرفًا', other: 'بقي {count} حرف',
        }),
      })
  return (
    <p className={`text-xs mt-1 ${ok ? 'text-green-700' : 'text-amber-700'}`}>
      {isAr
        ? arText
        : ok
        ? `✓ ${current} characters`
        : `${current} of ${min} characters — needs ${min - current} more`}
    </p>
  )
}

interface ProposalFormProps {
  mode: 'create' | 'revise'
  initialValues?: Partial<ProposalFormValues>
  /**
   * Seeds the SMS opt-in checkbox. Honoured in `revise` mode only.
   *
   * A revision rewrites the consent columns from whatever the form posts, so a
   * form that always posts `false` silently withdraws an opt-in the applicant
   * gave on an earlier version -- a 10DLC record destroyed by a typo fix. In
   * `create` mode this is ignored outright: a pre-ticked box is not consent.
   */
  initialSmsConsent?: boolean
  onSubmit: (payload: ReturnType<typeof buildProposalPayload>) => void | Promise<void>
  submitting: boolean
  fieldErrors: FieldError[]
  genericError: string
}

const ProposalForm = ({ mode, initialValues, initialSmsConsent = false, onSubmit, submitting, fieldErrors, genericError }: ProposalFormProps) => {
  const [step, setStep] = useState<StepIndex>(1)
  const t = useT()
  const isAr = useLocale() === 'ar'
  const fmt = useFormat()
  // English keeps its original rendering; Arabic goes through Intl.
  const usd = (value: number) =>
    isAr ? fmt.money(Math.round(value * 100)) : `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
  const [form, setForm] = useState<ProposalFormValues>({ ...EMPTY_PROPOSAL_FORM, ...initialValues })
  // Optional SMS opt-in. Must not gate submission — applicants can submit
  // without it.
  //
  // First collection (`create`) is never pre-ticked: 10DLC requires the
  // applicant's own affirmative act, so the seed is refused structurally here
  // rather than trusted to every caller. A revision is different: the box
  // restates consent the applicant already gave on the previous version, which
  // is legitimate as long as it is visible and can be undone — see the notice
  // under the checkbox.
  const restatingConsent = mode === 'revise' && initialSmsConsent
  const [smsConsent, setSmsConsent] = useState(restatingConsent)

  const emailLocked = mode === 'revise'
  const submitLabel = mode === 'revise' ? t(PM.resubmit) : t(PM.submit)

  // Server-side errors name a field; send the applicant to the first step that
  // has one so they see the inputs to fix rather than a list far from them.
  useEffect(() => {
    if (fieldErrors.length === 0) return
    const first = Math.min(...fieldErrors.map((e) => e.step)) as StepIndex
    if (first >= 1 && first <= 4) setStep(first)
  }, [fieldErrors])

  // Helper: is `key` filled AND at least the required min length?
  const meets = (key: keyof ProposalFormValues): boolean => {
    const value = (form[key] || '').trim()
    if (!value) return false
    const min = MIN_LEN[key] || 0
    return value.length >= min
  }

  const set = <K extends keyof ProposalFormValues>(key: K) => (v: string) => setForm((f) => ({ ...f, [key]: v }))

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

  const steps: { n: StepIndex; label: string; icon: any }[] = [
    { n: 1, label: t(PM.stepPersonal), icon: UserIcon },
    { n: 2, label: t(PM.stepProject),  icon: ClipboardList },
    { n: 3, label: t(PM.stepPlan),     icon: ListChecks },
    { n: 4, label: t(PM.stepBudget),   icon: DollarSign },
  ]
  const [confirmBefore, confirmAfter = ''] = t(PM.confirmAccurate).split('{email}')

  return (
    <div className="space-y-6" data-testid="proposal-form" data-mode={mode}>

        {/* Step indicator. On phones the other steps shrink to their number,
            so the current one has room for its name. */}
        <ol className="flex gap-2 text-xs sm:text-sm">
          {steps.map(({ n, label, icon: Icon }) => {
            const active = step === n
            const done = step > n
            return (
              <li key={n} aria-current={active ? 'step' : undefined}
                className={`items-center gap-2 rounded-lg p-2 sm:p-3 border flex ${
                  active ? 'flex-1 min-w-0' : 'flex-none sm:flex-1'} ${
                  active ? 'border-primary-500 bg-primary-50 text-primary-800'
                  : done ? 'border-green-300 bg-green-50 text-green-800'
                  : 'border-gray-200 bg-white text-gray-600'
              }`}>
                <span className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center font-semibold ${
                  active ? 'bg-primary-600 text-white' : done ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-600'
                }`}>{done ? <><Check className="w-4 h-4" aria-hidden="true" /><span className="sr-only">{t(PM.stepDone, { n })}</span></> : n}</span>
                <span className={`flex-col leading-tight min-w-0 ${active ? 'flex' : 'hidden sm:flex'}`}>
                  <span className="font-semibold flex items-center gap-1"><Icon className="w-3.5 h-3.5" aria-hidden="true" /> {t(PM.step, { n })}</span>
                  <span className="truncate">{label}</span>
                </span>
              </li>
            )
          })}
        </ol>

        {/* Submission errors that are not tied to a field. Shown outside the
            step panels because the parent can raise one (an expired portal
            token, a network failure) while the applicant is on any step. */}
        {genericError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{genericError}</span>
          </div>
        )}

        {/* ── STEP 1 — Personal ────────────────────────────── */}
        {step === 1 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{t(PM.personalTitle)}</h2>
              <p className="text-sm text-gray-500 mt-1">{t(PM.personalLead)}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field htmlFor="proposal-full_name" label={t(PM.fullName)} required>
                <input id="proposal-full_name" required value={form.full_name} onChange={(e) => set('full_name')(e.target.value)} className="input-field" />
              </Field>
              <Field htmlFor="proposal-national_id" label={t(PM.nationalId)} required>
                <input id="proposal-national_id" required value={form.national_id} onChange={(e) => set('national_id')(e.target.value)} className="input-field" />
              </Field>
              <Field htmlFor="proposal-date_of_birth_year" label={t(PM.birthYear)} required>
                <input id="proposal-date_of_birth_year" required type="number" min={1900} max={CURRENT_YEAR - 5} value={form.date_of_birth_year} onChange={(e) => set('date_of_birth_year')(e.target.value)} className="input-field" placeholder={t(PM.birthYearPlaceholder)} />
              </Field>
              <Field htmlFor="proposal-place_of_residence" label={t(PM.residence)} required>
                <input id="proposal-place_of_residence" required value={form.place_of_residence} onChange={(e) => set('place_of_residence')(e.target.value)} className="input-field" placeholder={t(PM.residencePlaceholder)} />
              </Field>
              <Field htmlFor="proposal-mobile_number" label={t(PM.mobile)} required>
                <input id="proposal-mobile_number" required value={form.mobile_number} onChange={(e) => set('mobile_number')(e.target.value)} className="input-field" placeholder={t(PM.mobilePlaceholder)} dir={isAr ? 'ltr' : undefined} />
              </Field>

              {/* Optional SMS opt-in — 10DLC / TCR compliance.
                  Must be unchecked by default, must never block form
                  submission (see canContinue1 / canSubmit), and the
                  disclosure must be presented alongside the checkbox. */}
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-baseline justify-between mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {t(PM.smsConsent)}
                  </p>
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
                    {t(PM.optional)}
                  </span>
                </div>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={smsConsent}
                    onChange={(e) => setSmsConsent(e.target.checked)}
                    className="mt-1 w-4 h-4 text-primary-600 rounded border-gray-400 focus:ring-2 focus:ring-primary-500 flex-shrink-0"
                    aria-describedby="proposal-sms-consent"
                  />
                  <span id="proposal-sms-consent" className="text-sm text-gray-700 leading-relaxed">
                    {isAr ? t(PM.smsConsentAr) : PROPOSAL_SMS_CONSENT_TEXT} {t(PM.pleaseReview)}{' '}
                    <Link to="/privacy-policy" className="text-primary-700 font-medium hover:underline">
                      {t(C.privacyPolicy)}
                    </Link>{' '}
                    {t(PM.and)}{isAr ? '' : ' '}
                    <Link to="/terms-of-service" className="text-primary-700 font-medium hover:underline">
                      {t(C.termsOfService)}
                    </Link>.
                    {/* The record of consent is the English text: show it verbatim too. */}
                    {isAr && (
                      <span className="mt-2 block text-xs text-gray-600">
                        {t(PM.smsConsentOfficial)}{' '}
                        <span lang="en" dir="ltr" className="block text-start">{PROPOSAL_SMS_CONSENT_TEXT}</span>
                      </span>
                    )}
                  </span>
                </label>
                {restatingConsent && (
                  <p className="text-xs text-gray-600 mt-2 ms-7">
                    {t(PM.restating)}
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-2 ms-7">
                  {t(PM.withoutOptIn)}
                </p>
              </div>

              <Field
                label={t(PM.email)}
                required
                htmlFor="proposal-email"
                hint={emailLocked ? t(PM.emailLocked) : undefined}
              >
                <input
                  required
                  type="email"
                  id="proposal-email"
                  value={form.email}
                  disabled={emailLocked}
                  onChange={(e) => set('email')(e.target.value)}
                  className={`input-field ${emailLocked ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
                />
              </Field>
              <Field htmlFor="proposal-educational_level" label={t(PM.education)} required>
                <input id="proposal-educational_level" required value={form.educational_level} onChange={(e) => set('educational_level')(e.target.value)} className="input-field" placeholder={t(PM.educationPlaceholder)} />
              </Field>
            </div>
            <div className="flex justify-end pt-4 border-t border-gray-100">
              <button onClick={() => setStep(2)} disabled={!canContinue1} className="px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white font-semibold rounded-lg inline-flex items-center gap-2">{t(PM.continue)} <ArrowRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}

        {/* ── STEP 2 — Project ─────────────────────────────── */}
        {step === 2 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{t(PM.projectTitle)}</h2>
              <p className="text-sm text-gray-500 mt-1">{t(PM.projectLead)}</p>
            </div>
            <Field htmlFor="proposal-project_name" label={t(PM.projectName)} required>
              <input id="proposal-project_name" required value={form.project_name} onChange={(e) => set('project_name')(e.target.value)} className="input-field" placeholder={t(PM.projectNamePlaceholder)} />
            </Field>
            <Field htmlFor="proposal-project_description" label={t(PM.projectDescription)} required hint={t(PM.projectDescriptionHint)}>
              <textarea id="proposal-project_description" required rows={4} value={form.project_description} onChange={(e) => set('project_description')(e.target.value)} className="input-field" />
              <CharCount current={form.project_description.trim().length} min={MIN_LEN.project_description} />
            </Field>
            <Field htmlFor="proposal-problem_solved" label={t(PM.problemSolved)} required>
              <textarea id="proposal-problem_solved" required rows={3} value={form.problem_solved} onChange={(e) => set('problem_solved')(e.target.value)} className="input-field" />
              <CharCount current={form.problem_solved.trim().length} min={MIN_LEN.problem_solved} />
            </Field>
            <Field htmlFor="proposal-target_beneficiaries" label={t(PM.targetBeneficiaries)} required hint={t(PM.targetBeneficiariesHint)}>
              <textarea id="proposal-target_beneficiaries" required rows={3} value={form.target_beneficiaries} onChange={(e) => set('target_beneficiaries')(e.target.value)} className="input-field" />
              <CharCount current={form.target_beneficiaries.trim().length} min={MIN_LEN.target_beneficiaries} />
            </Field>
            <Field htmlFor="proposal-community_impact" label={t(PM.communityImpact)} required>
              <textarea id="proposal-community_impact" required rows={3} value={form.community_impact} onChange={(e) => set('community_impact')(e.target.value)} className="input-field" />
              <CharCount current={form.community_impact.trim().length} min={MIN_LEN.community_impact} />
            </Field>
            <Field htmlFor="proposal-expected_impact" label={t(PM.expectedImpact)} required>
              <textarea id="proposal-expected_impact" required rows={3} value={form.expected_impact} onChange={(e) => set('expected_impact')(e.target.value)} className="input-field" />
              <CharCount current={form.expected_impact.trim().length} min={MIN_LEN.expected_impact} />
            </Field>
            <div className="flex items-center justify-between pt-4 border-t border-gray-100">
              <button onClick={() => setStep(1)} className="px-4 py-2 text-gray-600 inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> {t(PM.back)}</button>
              <button onClick={() => setStep(3)} disabled={!canContinue2} className="px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white font-semibold rounded-lg inline-flex items-center gap-2">{t(PM.continue)} <ArrowRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}

        {/* ── STEP 3 — Plan ────────────────────────────────── */}
        {step === 3 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{t(PM.planTitle)}</h2>
              <p className="text-sm text-gray-500 mt-1">{t(PM.planLead)}</p>
            </div>
            <Field htmlFor="proposal-implementation_steps" label={t(PM.steps)} required hint={t(PM.stepsHint)}>
              <textarea id="proposal-implementation_steps" required rows={5} value={form.implementation_steps} onChange={(e) => set('implementation_steps')(e.target.value)} className="input-field" placeholder={t(PM.stepsPlaceholder)} />
              <CharCount current={form.implementation_steps.trim().length} min={MIN_LEN.implementation_steps} />
            </Field>
            <Field htmlFor="proposal-implementation_location" label={t(PM.location)} required>
              <textarea id="proposal-implementation_location" required rows={2} value={form.implementation_location} onChange={(e) => set('implementation_location')(e.target.value)} className="input-field" />
              <CharCount current={form.implementation_location.trim().length} min={MIN_LEN.implementation_location} />
            </Field>
            <Field htmlFor="proposal-required_materials" label={t(PM.materials)} required hint={t(PM.materialsHint)}>
              <textarea id="proposal-required_materials" required rows={4} value={form.required_materials} onChange={(e) => set('required_materials')(e.target.value)} className="input-field" placeholder={t(PM.materialsPlaceholder)} />
              <CharCount current={form.required_materials.trim().length} min={MIN_LEN.required_materials} />
            </Field>
            <Field htmlFor="proposal-expected_duration" label={t(PM.duration)} required>
              <input id="proposal-expected_duration" required value={form.expected_duration} onChange={(e) => set('expected_duration')(e.target.value)} className="input-field" placeholder={t(PM.durationPlaceholder)} />
            </Field>
            <Field htmlFor="proposal-continuity_plan" label={t(PM.continuity)} required>
              <textarea id="proposal-continuity_plan" required rows={3} value={form.continuity_plan} onChange={(e) => set('continuity_plan')(e.target.value)} className="input-field" />
              <CharCount current={form.continuity_plan.trim().length} min={MIN_LEN.continuity_plan} />
            </Field>
            <Field htmlFor="proposal-feasibility" label={t(PM.feasibility)} required>
              <textarea id="proposal-feasibility" required rows={3} value={form.feasibility} onChange={(e) => set('feasibility')(e.target.value)} className="input-field" />
              <CharCount current={form.feasibility.trim().length} min={MIN_LEN.feasibility} />
            </Field>
            <Field htmlFor="proposal-expected_challenges" label={t(PM.challenges)} required hint={t(PM.challengesHint)}>
              <textarea id="proposal-expected_challenges" required rows={4} value={form.expected_challenges} onChange={(e) => set('expected_challenges')(e.target.value)} className="input-field" placeholder={t(PM.challengesPlaceholder)} />
              <CharCount current={form.expected_challenges.trim().length} min={MIN_LEN.expected_challenges} />
            </Field>
            <div className="flex items-center justify-between pt-4 border-t border-gray-100">
              <button onClick={() => setStep(2)} className="px-4 py-2 text-gray-600 inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> {t(PM.back)}</button>
              <button onClick={() => setStep(4)} disabled={!canContinue3} className="px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white font-semibold rounded-lg inline-flex items-center gap-2">{t(PM.continue)} <ArrowRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}

        {/* ── STEP 4 — Budget + review ─────────────────────── */}
        {step === 4 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{t(PM.budgetTitle)}</h2>
              <p className="text-sm text-gray-500 mt-1">{t(PM.budgetLead)}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field htmlFor="proposal-number_of_beneficiaries" label={t(PM.beneficiariesCount)} required>
                <input id="proposal-number_of_beneficiaries" required type="number" min={1} value={form.number_of_beneficiaries} onChange={(e) => set('number_of_beneficiaries')(e.target.value)} className="input-field" placeholder="200" />
              </Field>
              <Field htmlFor="proposal-cost_per_unit_usd" label={t(PM.costPerUnit)} required>
                <input id="proposal-cost_per_unit_usd" required type="number" min={0.01} step="0.01" value={form.cost_per_unit_usd} onChange={(e) => set('cost_per_unit_usd')(e.target.value)} className="input-field" placeholder="20" />
              </Field>
              <Field htmlFor="proposal-unit_type" label={t(PM.unitType)} required hint={t(PM.unitTypeHint)}>
                <input id="proposal-unit_type" required value={form.unit_type} onChange={(e) => set('unit_type')(e.target.value)} className="input-field" placeholder="family" />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field htmlFor="proposal-additional_expenses_usd" label={t(PM.additionalExpenses)} hint={t(PM.additionalExpensesHint)}>
                <input id="proposal-additional_expenses_usd" type="number" min={0} step="0.01" value={form.additional_expenses_usd} onChange={(e) => set('additional_expenses_usd')(e.target.value)} className="input-field" placeholder="0" />
              </Field>
              <Field htmlFor="proposal-additional_expenses_description" label={t(PM.additionalWhat)}>
                <input id="proposal-additional_expenses_description" value={form.additional_expenses_description} onChange={(e) => set('additional_expenses_description')(e.target.value)} className="input-field" placeholder={t(PM.additionalWhatPlaceholder)} />
              </Field>
            </div>

            {/* Live total */}
            <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-primary-800">
                  {isAr
                    ? t(PM.breakdown, {
                        count: form.number_of_beneficiaries || 0,
                        unit: form.unit_type || t(PM.unit),
                        cost: usd(parseFloat(form.cost_per_unit_usd || '0') || 0),
                      })
                    : <>{form.number_of_beneficiaries || 0} {form.unit_type || 'unit'}s × ${parseFloat(form.cost_per_unit_usd || '0').toLocaleString(undefined, { maximumFractionDigits: 2 })}</>}
                </span>
                <span className="font-semibold text-primary-800">{usd(subtotal)}</span>
              </div>
              {additional > 0 && (
                <div className="flex items-center justify-between text-sm mt-1">
                  <span className="text-primary-800">{t(PM.additionalLine)}</span>
                  <span className="font-semibold text-primary-800">{usd(additional)}</span>
                </div>
              )}
              <div className="border-t border-primary-300 my-2" />
              <div className="flex items-center justify-between">
                <span className="text-primary-900 font-semibold">{t(PM.totalRequired)}</span>
                {/* The Arabic amount already names the currency (US$). */}
                <span className="text-2xl font-bold text-primary-900">{usd(total)}{!isAr && <> <span className="text-sm font-normal">USD</span></>}</span>
              </div>
            </div>

            {fieldErrors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm space-y-2">
                <div className="font-semibold text-red-900 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  {isAr
                    ? fmt.plural(fieldErrors.length, {
                        one: 'يُرجى تصحيح هذا البند قبل الإرسال:',
                        two: 'يُرجى تصحيح هذين البندين قبل الإرسال:',
                        few: 'يُرجى تصحيح هذه البنود الـ{count} قبل الإرسال:',
                        many: 'يُرجى تصحيح هذه البنود الـ{count} قبل الإرسال:',
                        other: 'يُرجى تصحيح هذه البنود الـ{count} قبل الإرسال:',
                      })
                    : <>Please fix {fieldErrors.length === 1 ? 'this item' : `these ${fieldErrors.length} items`} before submitting:</>}
                </div>
                <ul className="text-red-800 space-y-1 ps-6">
                  {fieldErrors.map((e, i) => (
                    <li key={i} className="list-disc">
                      <button
                        type="button"
                        onClick={() => setStep(e.step)}
                        className="text-start underline hover:text-red-900 focus:outline-none focus:ring-2 focus:ring-red-500 rounded"
                      >
                        <strong>{t(PM.stepLabel, { n: e.step, label: isAr ? FIELD_LABELS_AR[e.field] ?? e.label : e.label })}</strong> {isAr ? arabicFieldMessage(e.msg) : e.msg}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-xs text-gray-600">
              {confirmBefore}<strong>{form.email || t(PM.theEmailAbove)}</strong>{confirmAfter}
            </p>

            <div className="flex items-center justify-between pt-4 border-t border-gray-100">
              <button onClick={() => setStep(3)} className="px-4 py-2 text-gray-600 inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> {t(PM.back)}</button>
              <button
                onClick={() => onSubmit(buildProposalPayload(form, smsConsent))}
                disabled={!canSubmit || submitting}
                className="px-8 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white font-semibold rounded-lg inline-flex items-center gap-2"
              >
                {submitting
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> {t(PM.submitting)}</>
                  : <><Send className="w-4 h-4" /> {submitLabel}</>}
              </button>
            </div>
          </div>
        )}
    </div>
  )
}

export default ProposalForm
