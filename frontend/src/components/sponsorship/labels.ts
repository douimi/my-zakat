/**
 * The sponsorship vocabulary, in both languages. One place, so the form, the
 * profile, the applicant's space and the sponsor's space all name a thing the
 * same way. Admin pages use the `.en` side.
 */
import { defineMessages, type Message } from '../../i18n'
import type { CaseStatus, DocType, FundingState, NeedCategory } from '../../utils/sponsorshipApi'

export const NEED_LABELS: Record<NeedCategory, Message> = defineMessages({
  food: { en: 'Food', ar: 'الغذاء' },
  rent: { en: 'Rent', ar: 'الإيجار' },
  utilities: { en: 'Water, power & gas', ar: 'الماء والكهرباء والغاز' },
  education: { en: 'Education', ar: 'التعليم' },
  health: { en: 'Health care', ar: 'الرعاية الصحية' },
  clothing: { en: 'Clothing', ar: 'الملابس' },
  transport: { en: 'Transport', ar: 'المواصلات' },
  other: { en: 'Other', ar: 'أخرى' },
})

export const NEED_CATEGORIES = Object.keys(NEED_LABELS) as NeedCategory[]

export const DOC_LABELS: Record<DocType, Message> = defineMessages({
  id_document: { en: 'Identity document', ar: 'وثيقة الهوية' },
  death_certificate: { en: 'Death certificate of the parent', ar: 'شهادة وفاة الوالد/الوالدة' },
  birth_certificate: { en: 'Child’s birth certificate', ar: 'شهادة ميلاد الطفل' },
  guardianship: { en: 'Guardianship document', ar: 'وثيقة الوصاية أو الكفالة' },
  school_certificate: { en: 'School certificate', ar: 'الشهادة المدرسية' },
  medical_report: { en: 'Medical report', ar: 'تقرير طبي' },
  income_proof: { en: 'Proof of income or need', ar: 'إثبات الدخل أو الحاجة' },
  residence_proof: { en: 'Proof of residence', ar: 'إثبات السكن' },
  association_mandate: { en: 'Association mandate', ar: 'تفويض الجمعية' },
  photo: { en: 'Photo', ar: 'صورة' },
  receipt: { en: 'Receipt', ar: 'إيصال' },
  other: { en: 'Other document', ar: 'وثيقة أخرى' },
})

/** Which documents to suggest per kind, required ones first. */
export const SUGGESTED_DOCS: Record<'family' | 'orphan', { type: DocType; required: boolean }[]> = {
  family: [
    { type: 'id_document', required: true },
    { type: 'income_proof', required: false },
    { type: 'residence_proof', required: false },
    { type: 'medical_report', required: false },
    { type: 'association_mandate', required: false },
    { type: 'other', required: false },
  ],
  orphan: [
    { type: 'birth_certificate', required: true },
    { type: 'death_certificate', required: true },
    { type: 'guardianship', required: false },
    { type: 'school_certificate', required: false },
    { type: 'medical_report', required: false },
    { type: 'association_mandate', required: false },
    { type: 'photo', required: false },
    { type: 'other', required: false },
  ],
}

/** How a status is explained to the person who filed the request. */
export const APPLICANT_STATUS: Record<CaseStatus, { label: Message; explain: Message; tone: 'neutral' | 'info' | 'warning' | 'success' | 'danger' }> = {
  submitted: {
    label: { en: 'Received', ar: 'تم الاستلام' },
    explain: { en: 'We have your request. A reviewer will pick it up shortly.', ar: 'وصلنا طلبك، وسيتولى أحد أعضاء فريقنا دراسته قريبًا.' },
    tone: 'neutral',
  },
  under_review: {
    label: { en: 'Being reviewed', ar: 'قيد الدراسة' },
    explain: { en: 'Our team is verifying the information and the documents.', ar: 'يتحقق فريقنا من المعلومات والوثائق.' },
    tone: 'info',
  },
  info_requested: {
    label: { en: 'Information needed', ar: 'مطلوب معلومات إضافية' },
    explain: { en: 'We need something from you before we can continue. See the message below.', ar: 'نحتاج منك إلى بعض المعلومات قبل المتابعة. اطّلع على الرسالة أدناه.' },
    tone: 'warning',
  },
  approved: {
    label: { en: 'Approved', ar: 'تمت الموافقة' },
    explain: { en: 'Verified and approved. We are preparing the anonymous profile donors will see.', ar: 'تم التحقق والموافقة. نُعدّ الآن صفحة التعريف المجهولة الهوية التي سيطّلع عليها المتبرعون.' },
    tone: 'success',
  },
  published: {
    label: { en: 'Open to sponsors', ar: 'متاح للكفلاء' },
    explain: { en: 'Donors can now see the anonymous profile and sponsor it.', ar: 'أصبح بإمكان المتبرعين الاطلاع على الصفحة المجهولة الهوية وكفالتها.' },
    tone: 'success',
  },
  paused: {
    label: { en: 'Temporarily paused', ar: 'متوقف مؤقتًا' },
    explain: { en: 'The profile is hidden from new donors for now. Existing sponsorships continue.', ar: 'الصفحة مخفية عن المتبرعين الجدد مؤقتًا، وتستمر الكفالات القائمة.' },
    tone: 'warning',
  },
  rejected: {
    label: { en: 'Not accepted', ar: 'لم يُقبل' },
    explain: { en: 'We were not able to accept this request. The reason is below.', ar: 'لم نتمكن من قبول هذا الطلب، والسبب مذكور أدناه.' },
    tone: 'danger',
  },
  closed: {
    label: { en: 'Closed', ar: 'مغلق' },
    explain: { en: 'This request is closed.', ar: 'تم إغلاق هذا الطلب.' },
    tone: 'neutral',
  },
}

export const FUNDING_LABELS: Record<FundingState, Message> = defineMessages({
  unfunded: { en: 'Waiting for a sponsor', ar: 'بانتظار كفيل' },
  partial: { en: 'Partly sponsored', ar: 'مكفول جزئيًا' },
  full: { en: 'Fully sponsored', ar: 'مكفول بالكامل' },
})

/** Lines of the applicant's timeline. */
export const TIMELINE_LABELS: Record<string, Message> = defineMessages({
  submitted: { en: 'Request filed', ar: 'تم تقديم الطلب' },
  resubmitted: { en: 'You sent the requested information', ar: 'أرسلت المعلومات المطلوبة' },
  start_review: { en: 'Review started', ar: 'بدأت دراسة الطلب' },
  request_info: { en: 'We asked for more information', ar: 'طلبنا معلومات إضافية' },
  approve: { en: 'Request approved', ar: 'تمت الموافقة على الطلب' },
  reject: { en: 'Request not accepted', ar: 'لم يُقبل الطلب' },
  publish: { en: 'Profile opened to sponsors', ar: 'أصبحت الصفحة متاحة للكفلاء' },
  pause: { en: 'Profile paused', ar: 'تم إيقاف الصفحة مؤقتًا' },
  close: { en: 'Request closed', ar: 'تم إغلاق الطلب' },
  reopen: { en: 'Request reopened', ar: 'أُعيد فتح الطلب' },
  document_uploaded: { en: 'Document received', ar: 'تم استلام وثيقة' },
  document_reviewed: { en: 'Document checked', ar: 'تمت مراجعة وثيقة' },
  sponsorship_started: { en: 'A sponsor committed', ar: 'التزم كفيل بالكفالة' },
})

export const GENDER_LABELS = defineMessages({
  male: { en: 'Boy', ar: 'ولد' },
  female: { en: 'Girl', ar: 'بنت' },
})

export const RELATION_LABELS = defineMessages({
  family: { en: 'Their family', ar: 'أسرته' },
  sibling: { en: 'Brother or sister', ar: 'أخ أو أخت' },
  child: { en: 'A child of this family', ar: 'طفل من هذه الأسرة' },
})
