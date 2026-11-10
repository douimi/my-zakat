/**
 * The submitter portal — /my-proposals.
 *
 * Applicants have no account. They prove who they are with a six-digit code we
 * email to the address on their dossier, and the resulting portal token lives
 * in sessionStorage for thirty minutes (see utils/proposalPortalApi, which is
 * deliberately a separate axios instance so a staff member's session is never
 * touched by this flow).
 *
 * Five views:
 *   email — "the email address you applied with"; POST /portal/request-code.
 *   not-found — the server answered 404: nothing is filed under that address,
 *           so no code was sent and saying one was would be a lie.
 *   code  — the six digits; POST /portal/verify-code stores the token.
 *   list  — GET /portal/me, one card per dossier, with "Fix and resubmit" on
 *           the ones the reviewers marked editable.
 *   edit  — ProposalForm in mode="revise", prefilled from the current version;
 *           PUT /portal/{id} appends a new version.
 *
 * ── Why the pending-payload dance exists ──────────────────────────────────
 * The portal token dies after thirty minutes. Revising twenty-five fields
 * takes longer than that more often than you would think, so the PUT is the
 * single most likely request to come back 401 — and it is the one carrying
 * work the applicant cannot be asked to retype.
 *
 * So a 401 on the PUT never unmounts the form. We stash the payload the form
 * just handed us in `pendingPayload`, ask the server for a fresh code, and
 * swap the *visible* panel to the code step while the form stays mounted
 * (hidden, its twenty-five useState values untouched) underneath. When the new
 * token lands, we replay that exact same payload automatically. The applicant
 * types six digits and their work goes through; they never see the form reset.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AlertCircle, ArrowLeft, Banknote, CheckCircle2, Clock, Eye, FileText, Inbox,
  ChevronDown, KeyRound, Loader2, Mail, MessageSquare, Paperclip, PencilLine,
  Upload, XCircle,
} from 'lucide-react'
import SEOHead from '../components/SEOHead'
import ReportForm, { type ReportResult } from '../components/proposals/ReportForm'
import AddReportFiles from '../components/proposals/AddReportFiles'
import FilePreview, { previewOf, type PreviewFile } from '../components/FilePreview'
import ProposalForm, {
  EMPTY_PROPOSAL_FORM,
  parseFieldErrors,
  type FieldError,
  type ProposalFormValues,
  type buildProposalPayload,
} from '../components/proposals/ProposalForm'
import {
  adoptPortalTokenFromHash,
  clearPortalToken,
  fetchMyProposals,
  portalActor,
  hasPortalToken,
  isNoProposalForAddress,
  fetchReportAttachment,
  requestPortalCode,
  submitRevision,
  verifyPortalCode,
  type PortalProposal,
} from '../utils/proposalPortalApi'
import { defineMessages, useFormat, useLocale, useT, type Message } from '../i18n'
import { C } from '../i18n/common'

const M = defineMessages({
  // Statuses, as the applicant reads them
  stSubmitted: { en: 'Submitted', ar: 'تم التقديم' },
  stUnderReview: { en: 'Under review', ar: 'قيد المراجعة' },
  stChangesRequested: { en: 'Changes requested', ar: 'مطلوب تعديلات' },
  stApproved: { en: 'Approved', ar: 'مقبول' },
  stRejected: { en: 'Not funded', ar: 'لم يُموَّل' },
  stFunded: { en: 'Funded — in progress', ar: 'مُموَّل — قيد التنفيذ' },
  stReportSubmitted: { en: 'Report under review', ar: 'التقرير قيد المراجعة' },
  stReportChanges: { en: 'Report needs more detail', ar: 'التقرير يحتاج إلى تفاصيل إضافية' },
  stCompleted: { en: 'Completed', ar: 'مكتمل' },
  hintSubmitted: { en: 'Received. Waiting for our review.', ar: 'وصلنا طلبك، وهو في انتظار المراجعة.' },
  hintUnderReview: { en: 'Our team is reviewing it.', ar: 'يراجع فريقنا طلبك الآن.' },
  hintChangesRequested: { en: 'We asked for changes. Open it to see what to fix.', ar: 'طلبنا بعض التعديلات. افتح الطلب لترى ما يجب تصحيحه.' },
  hintApproved: { en: 'Approved. We will be in touch about funding.', ar: 'تمت الموافقة على طلبك. سنتواصل معك بشأن التمويل.' },
  hintRejected: { en: 'Not funded. Open it to read our reason.', ar: 'لم يُموَّل هذا الطلب. افتحه لتقرأ السبب.' },
  hintFunded: {
    en: 'Funded. Send your completion report when the project is done.',
    ar: 'تم تمويل مشروعك. أرسل تقرير الإنجاز عند انتهاء المشروع.',
  },
  hintReportSubmitted: { en: 'Your report is with our review team.', ar: 'تقريرك لدى فريق المراجعة.' },
  hintReportChanges: {
    en: 'Your report needs more detail. Open it to see what to add.',
    ar: 'تقريرك يحتاج إلى تفاصيل إضافية. افتحه لترى ما يجب إضافته.',
  },
  hintCompleted: { en: 'Closed. You are free to apply again.', ar: 'أُغلق الملف، ويمكنك التقدّم بطلب جديد.' },

  // Errors and notices
  adminExpired: {
    en: 'Your admin view of this portal has expired. Reopen it from the dossier in the admin console.',
    ar: 'انتهت صلاحية عرض المسؤول لهذه البوابة. أعد فتحه من ملف الطلب في لوحة الإدارة.',
  },
  sessionExpired: { en: 'Your sign-in session has expired. Please request a new code.', ar: 'انتهت جلسة تسجيل الدخول. يُرجى طلب رمز جديد.' },
  loadFailed: { en: 'We could not load your proposals. Please try again.', ar: 'تعذّر تحميل مقترحاتك. يُرجى المحاولة مرة أخرى.' },
  codeOnItsWay: { en: '', ar: 'رمز تسجيل الدخول في طريقه إلى {email}.' },
  noLongerFind: {
    en: 'We can no longer find a proposal under this address. Your changes are still on screen — copy anything you need before leaving this page.',
    ar: 'لم نعد نجد أي مقترح مسجّل بهذا العنوان. تعديلاتك ما زالت ظاهرة على الشاشة، فانسخ ما تحتاج إليه قبل مغادرة هذه الصفحة.',
  },
  tooManyCodes: {
    en: 'Too many sign-in codes requested. Please wait and try again later. This usually clears within 15 minutes, or up to an hour if you share a network connection with other applicants.',
    ar: 'طلبت عددًا كبيرًا من رموز الدخول. يُرجى الانتظار والمحاولة لاحقًا. يزول هذا المنع عادةً خلال 15 دقيقة، أو خلال ساعة إذا كنت تتشارك الاتصال بالإنترنت مع متقدّمين آخرين.',
  },
  codeSendFailed: {
    en: 'We could not send the code. Please check the address and try again.',
    ar: 'تعذّر إرسال الرمز. يُرجى التحقق من العنوان والمحاولة مرة أخرى.',
  },
  revisionSent: { en: 'Your updated proposal has been sent to the review team.', ar: 'أرسلنا مقترحك المعدَّل إلى فريق المراجعة.' },
  adminExpiredNothingSent: {
    en: 'Your admin view of this portal has expired, so nothing was sent. Reopen it from the dossier in the admin console; your changes are still on screen to copy across.',
    ar: 'انتهت صلاحية عرض المسؤول لهذه البوابة، لذلك لم يُرسَل شيء. أعد فتحه من ملف الطلب في لوحة الإدارة؛ تعديلاتك ما زالت على الشاشة لتنسخها.',
  },
  expiredWhileWriting: {
    en: 'Your sign-in session expired while you were writing. We have emailed you a new code — enter it and we will send your proposal straight through. Nothing you typed has been lost.',
    ar: 'انتهت جلسة تسجيل الدخول أثناء الكتابة. أرسلنا إليك رمزًا جديدًا عبر البريد الإلكتروني؛ أدخله وسنرسل مقترحك مباشرة. لم يضِع شيء مما كتبته.',
  },
  noAddressInTab: {
    en: 'Your sign-in session expired and this tab no longer knows which address to email a code to. Everything you typed is still here — please do not reload this tab. Open My Proposals in a new tab, sign in there, and copy your answers across from here.',
    ar: 'انتهت جلسة تسجيل الدخول، ولم تعد هذه الصفحة تعرف العنوان الذي نرسل إليه الرمز. كل ما كتبته ما زال هنا، فيُرجى عدم إعادة تحميل هذه الصفحة. افتح صفحة «مقترحاتي» في علامة تبويب جديدة، وسجّل الدخول هناك، ثم انسخ إجاباتك من هنا.',
  },
  expiredCouldNotEmail: {
    en: 'Your session expired and we could not email a new code. Please try again in a few minutes.',
    ar: 'انتهت جلستك وتعذّر إرسال رمز جديد إلى بريدك. يُرجى المحاولة بعد بضع دقائق.',
  },
  noLongerOpen: { en: 'This proposal is no longer open for changes.', ar: 'لم يعد هذا المقترح متاحًا للتعديل.' },
  saveFailed: { en: 'We could not save your changes. Please try again.', ar: 'تعذّر حفظ تعديلاتك. يُرجى المحاولة مرة أخرى.' },
  codeInvalid: {
    en: 'That code is not valid or has expired. Request a new one below.',
    ar: 'هذا الرمز غير صحيح أو انتهت صلاحيته. اطلب رمزًا جديدًا من الأسفل.',
  },
  codeVerifyFailed: { en: 'We could not verify that code. Please try again.', ar: 'تعذّر التحقق من الرمز. يُرجى المحاولة مرة أخرى.' },
  noFileOnIt: { en: 'No file is attached to it.', ar: 'لم يُرفق به أي ملف.' },
  filesReceived: { en: 'Files received: {list}.', ar: 'الملفات التي وصلتنا: {list}.' },
  reportPartly: {
    en: 'Report submitted, but {missing} of {offered} files could not be stored. {received} Add the missing ones from the report below.',
    ar: 'تم إرسال التقرير، لكن تعذّر حفظ بعض الملفات ({missing} من أصل {offered}). {received} أضف الملفات الناقصة من التقرير أدناه.',
  },
  reportOk: {
    en: 'Your completion report has been submitted. {received} We will be in touch once it has been reviewed.',
    ar: 'تم إرسال تقرير الإنجاز. {received} سنتواصل معك بعد مراجعته.',
  },
  filesPartly: {
    en: '{missing} of {offered} files could not be stored. Please try those again. {received}',
    ar: 'تعذّر حفظ بعض الملفات ({missing} من أصل {offered}). يُرجى إعادة المحاولة بها. {received}',
  },
  filesOk: { en: 'Added to your report. {received}', ar: 'أُضيفت الملفات إلى تقريرك. {received}' },
  fileSessionExpired: { en: 'Your session has expired. Sign in again to open your files.', ar: 'انتهت جلستك. سجّل الدخول من جديد لفتح ملفاتك.' },
  fileOpenFailed: { en: 'That file could not be opened. Please try again.', ar: 'تعذّر فتح هذا الملف. يُرجى المحاولة مرة أخرى.' },

  // Page chrome
  seoTitle: { en: 'My Proposals', ar: 'مقترحاتي' },
  seoDescription: {
    en: 'Check the status of the project proposals you submitted to the Zakat Distribution Foundation, and resubmit the ones the review team asked you to revise.',
    ar: 'تابع حالة مقترحات المشاريع التي قدّمتها إلى مؤسسة توزيع الزكاة، وأعد إرسال ما طلب فريق المراجعة تعديله.',
  },
  title: { en: 'My Proposals', ar: 'مقترحاتي' },
  lead: {
    en: 'Track your application, send requested changes and your completion report. We email you a sign-in code.',
    ar: 'تابع طلب التمويل، وأرسل التعديلات المطلوبة وتقرير الإنجاز. سنرسل إليك رمز الدخول عبر البريد الإلكتروني.',
  },
  adminViewTitle: { en: 'Admin view.', ar: 'عرض المسؤول.' },
  /** {title}, {email} and {actor} are shown in bold. */
  adminViewBody: {
    en: '{title} You are seeing the portal as {email}. Anything you send from here is filed in their record as sent by {actor} on their behalf.',
    ar: '{title} تعرض البوابة كما يراها {email}. كل ما ترسله من هنا يُسجَّل في ملفه على أنه مُرسَل من {actor} نيابةً عنه.',
  },
  thisApplicant: { en: 'this applicant', ar: 'هذا المتقدّم' },
  leaveAdminView: { en: 'Leave admin view', ar: 'الخروج من عرض المسؤول' },

  // Sign-in
  signInTitle: { en: 'Sign in to your proposals', ar: 'سجّل الدخول إلى مقترحاتك' },
  fromEmailLink: {
    en: 'Sign in with the address our email reached you at. We will send you a six-digit code, then take you straight to proposal #{id}.',
    ar: 'سجّل الدخول بالعنوان الذي وصلتك عليه رسالتنا. سنرسل إليك رمزًا من ست خانات، ثم ننقلك مباشرة إلى المقترح رقم #{id}.',
  },
  emailLabel: { en: 'The email address you applied with', ar: 'البريد الإلكتروني الذي قدّمت به طلبك' },
  sending: { en: 'Sending…', ar: 'جارٍ الإرسال…' },
  emailMeACode: { en: 'Email me a code', ar: 'أرسل لي رمزًا عبر البريد' },
  notYetApplied: { en: "Haven't applied yet?", ar: 'لم تقدّم طلبًا بعد؟' },
  submitProjectProposal: { en: 'Submit a project proposal', ar: 'قدّم مقترح مشروع' },
  notFoundTitle: { en: 'No proposal filed under this address', ar: 'لا يوجد مقترح مسجّل بهذا العنوان' },
  /** {email} is shown in bold. */
  notFoundBody: {
    en: 'We looked for {email} and found nothing. The most common reason is that the application was sent from a different email address.',
    ar: 'بحثنا عن {email} ولم نجد شيئًا. السبب الأكثر شيوعًا أن الطلب أُرسل من عنوان بريد إلكتروني آخر.',
  },
  tryDifferentAddress: { en: 'Try a different address', ar: 'جرّب عنوانًا آخر' },
  neverSentOne: { en: 'Never sent one?', ar: 'لم ترسل مقترحًا من قبل؟' },
  submitAProposal: { en: 'Submit a proposal', ar: 'قدّم مقترحًا' },

  // Code
  confirmItsYou: { en: "Just confirm it's you", ar: 'أكّد هويتك فقط' },
  checkInbox: { en: 'Check your inbox', ar: 'تفقّد بريدك الوارد' },
  enterCode: { en: 'Enter the six-digit code we sent to {email}', ar: 'أدخل الرمز المكوّن من ست خانات الذي أرسلناه إلى {email}' },
  checking: { en: 'Checking…', ar: 'جارٍ التحقق…' },
  confirmAndSend: { en: 'Confirm and send my proposal', ar: 'أكّد وأرسل مقترحي' },
  signIn: { en: 'Sign in', ar: 'تسجيل الدخول' },
  newCode: { en: 'Send me a new code', ar: 'أرسل لي رمزًا جديدًا' },
  differentEmail: { en: 'Use a different email address', ar: 'استخدم بريدًا إلكترونيًا آخر' },
  discardsEdits: { en: '(discards the edits in progress)', ar: '(ستفقد التعديلات التي لم تُرسَل بعد)' },

  // List
  loadingProposals: { en: 'Loading your proposals…', ar: 'جارٍ تحميل مقترحاتك…' },
  noProposals: { en: 'No proposals yet', ar: 'لا توجد مقترحات بعد' },
  nothingFiled: { en: 'There is nothing filed under {email} yet.', ar: 'لا يوجد أي طلب مسجّل باسم {email} حتى الآن.' },
  thisAddress: { en: 'this address', ar: 'هذا العنوان' },
  actionChanges: { en: 'Action needed: our review team asked for changes', ar: 'مطلوب منك إجراء: طلب فريق المراجعة بعض التعديلات' },
  untitled: { en: 'Untitled proposal', ar: 'مقترح بدون عنوان' },
  nameAndRef: { en: '{name} (#{id}).', ar: '{name} (#{id}).' },
  fixAndResubmit: { en: 'Fix and resubmit', ar: 'صحّح وأعد الإرسال' },
  actionCorrectedReport: { en: 'Action needed: send a corrected report', ar: 'مطلوب منك إجراء: أرسل تقريرًا مصحَّحًا' },
  actionReport: { en: 'Action needed: send your completion report', ar: 'مطلوب منك إجراء: أرسل تقرير الإنجاز' },
  cannotApplyUntil: {
    en: '{name} (#{id}). You cannot apply for another project until it has been accepted.',
    ar: '{name} (#{id}). لا يمكنك التقدّم بمشروع آخر قبل قبول هذا التقرير.',
  },
  sendCorrectedReport: { en: 'Send the corrected report', ar: 'أرسل التقرير المصحَّح' },
  sendTheReport: { en: 'Send the report', ar: 'أرسل التقرير' },
  refSubmitted: { en: 'Reference #{id} · Submitted {date}', ar: 'الرقم المرجعي #{id} · قُدِّم في {date}' },
  version: { en: ' · Version {n}', ar: ' · النسخة {n}' },
  fromReviewTeam: { en: 'From the review team', ar: 'من فريق المراجعة' },
  completionReport: { en: 'Completion report', ar: 'تقرير الإنجاز' },
  reportSubmittedOn: { en: 'submitted {date}', ar: 'أُرسل في {date}' },
  noFileOnReport: { en: 'No file is attached to this report.', ar: 'لم يُرفق أي ملف بهذا التقرير.' },
  stillToAdd: { en: 'What still needs to be added', ar: 'ما يجب إضافته' },
  reportWithTeam: {
    en: 'Your report is with our review team. There is nothing more to do for now — we will write to you once it has been reviewed.',
    ar: 'تقريرك لدى فريق المراجعة. لا يلزمك فعل أي شيء الآن، وسنراسلك بعد مراجعته.',
  },
  projectClosed: { en: 'This project is closed, and you are free to apply for a new one.', ar: 'أُغلق هذا المشروع، ويمكنك التقدّم بمشروع جديد.' },
  sendCorrectedHint: { en: 'Send a corrected report; your previous one stays on record.', ar: 'أرسل تقريرًا مصحَّحًا، وسيبقى تقريرك السابق محفوظًا في السجل.' },
  sendWhatWasDone: { en: 'Send what was done, with receipts, invoices and photographs.', ar: 'أرسل ما تم إنجازه، مع الإيصالات والفواتير والصور.' },
  sendCompletionReport: { en: 'Send the completion report', ar: 'أرسل تقرير الإنجاز' },
  signOut: { en: 'Sign out of this portal', ar: 'تسجيل الخروج من البوابة' },

  // Edit
  reference: { en: '· Reference #{id}', ar: '· الرقم المرجعي #{id}' },
  reviewTeamAsked: { en: 'What the review team asked for', ar: 'ما طلبه فريق المراجعة' },
  updateAndResubmit: {
    en: 'Update anything you need to and resubmit — we keep every version of your application.',
    ar: 'عدّل ما تحتاج إليه ثم أعد الإرسال، فنحن نحتفظ بكل نسخة من طلبك.',
  },
  backToProposals: { en: 'Back to my proposals', ar: 'العودة إلى مقترحاتي' },
})

/** Render a message whose {placeholders} are React nodes (bold text, links). */
const rich = (text: string, nodes: Record<string, ReactNode>): ReactNode[] =>
  text.split(/\{(\w+)\}/).map((part, i) => (i % 2 ? <Fragment key={i}>{nodes[part]}</Fragment> : part))

type View = 'email' | 'code' | 'list' | 'edit' | 'not-found'
type ProposalPayload = ReturnType<typeof buildProposalPayload>

const STATUS_BADGE: Record<string, string> = {
  submitted:                'bg-blue-100 text-blue-800',
  under_review:             'bg-amber-100 text-amber-800',
  changes_requested:        'bg-orange-100 text-orange-800',
  approved:                 'bg-green-100 text-green-800',
  rejected:                 'bg-red-100 text-red-800',
  funded:                   'bg-emerald-100 text-emerald-800',
  report_submitted:         'bg-indigo-100 text-indigo-800',
  report_changes_requested: 'bg-orange-100 text-orange-800',
  completed:                'bg-slate-200 text-slate-800',
}

const STATUS_LABEL: Record<string, Message> = {
  submitted:                M.stSubmitted,
  under_review:             M.stUnderReview,
  changes_requested:        M.stChangesRequested,
  approved:                 M.stApproved,
  // Deliberately gentler than the admin-side "Rejected": this is the wording
  // the applicant reads about their own application.
  rejected:                 M.stRejected,
  funded:                   M.stFunded,
  report_submitted:         M.stReportSubmitted,
  report_changes_requested: M.stReportChanges,
  completed:                M.stCompleted,
}

const STATUS_ICON: Record<string, typeof Clock> = {
  submitted:                Clock,
  under_review:             Eye,
  changes_requested:        PencilLine,
  approved:                 CheckCircle2,
  rejected:                 XCircle,
  funded:                   Banknote,
  report_submitted:         Eye,
  report_changes_requested: PencilLine,
  completed:                CheckCircle2,
}

/** One line on a folded card: where the dossier stands and what, if anything,
 *  the team has to do. The detail is one click away. */
const STATUS_HINT: Record<string, Message> = {
  submitted:                M.hintSubmitted,
  under_review:             M.hintUnderReview,
  changes_requested:        M.hintChangesRequested,
  approved:                 M.hintApproved,
  rejected:                 M.hintRejected,
  funded:                   M.hintFunded,
  report_submitted:         M.hintReportSubmitted,
  report_changes_requested: M.hintReportChanges,
  completed:                M.hintCompleted,
}

const StatusBadge = ({ status }: { status: string }) => {
  const t = useT()
  const Icon = STATUS_ICON[status] || FileText
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full ${STATUS_BADGE[status] || 'bg-gray-100 text-gray-700'}`}>
      <Icon className="w-3.5 h-3.5" />
      {STATUS_LABEL[status] ? t(STATUS_LABEL[status]) : status}
    </span>
  )
}

/** `tag` is undefined on the English site, which keeps the browser's own format there. */
const formatDate = (value: string, tag?: string): string => {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(tag, { year: 'numeric', month: 'long', day: 'numeric' })
}

/**
 * The portal hands back `content` with API types — numbers for the budget
 * fields, null for the optional ones. ProposalFormValues is all strings, so
 * every value is stringified and null/undefined becomes ''.
 */
const toFormValues = (content: Record<string, unknown>): ProposalFormValues => {
  const out = { ...EMPTY_PROPOSAL_FORM }
  ;(Object.keys(EMPTY_PROPOSAL_FORM) as (keyof ProposalFormValues)[]).forEach((key) => {
    const raw = content?.[key]
    out[key] = raw === null || raw === undefined ? '' : String(raw)
  })
  return out
}

/**
 * Thrown instead of posting an empty address to /portal/request-code.
 *
 * An empty `email` earns a 422 from the backend, and the generic failure
 * handling that used to follow swapped the applicant onto the code panel --
 * a panel no code can ever satisfy, because none was ever sent. A distinct
 * error type lets the 401 handler treat "we have no address" differently from
 * "the address is fine but the send failed", which is the difference between
 * an unrecoverable dead end and a retry.
 */
class MissingPortalEmailError extends Error {
  constructor() {
    super('No email address to send a portal sign-in code to.')
    this.name = 'MissingPortalEmailError'
  }
}

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const statusOf = (error: any): number | undefined => error?.response?.status

const detailOf = (error: any): unknown => error?.response?.data?.detail

const MyProposals = () => {
  const t = useT()
  // Server messages are English: the Arabic site shows its own instead.
  const isAr = useLocale() === 'ar'
  const fmt = useFormat()
  const dateTag = isAr ? fmt.tag : undefined
  const [view, setView] = useState<View>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [flash, setFlash] = useState('')

  const [items, setItems] = useState<PortalProposal[]>([])
  // Which dossier's report form is open. One at a time, keyed by id: two
  // half-typed reports would be easy to file against the wrong project. The
  // form owns its own contents (see components/proposals/ReportForm).
  const [reportFor, setReportFor] = useState<number | null>(null)
  const [editing, setEditing] = useState<PortalProposal | null>(null)
  // Dossiers start folded to their status line; these are the ones opened.
  const [expanded, setExpanded] = useState<number[]>([])
  const toggle = (id: number) =>
    setExpanded((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  const expand = (id: number) => setExpanded((prev) => (prev.includes(id) ? prev : [...prev, id]))

  // `?proposal=ID`, the link in the funding and report emails. After sign-in
  // the portal goes straight to that dossier and, if a report is what it
  // needs, opens the form, instead of leaving the team to find its own way.
  const [searchParams] = useSearchParams()
  const focusId = Number(searchParams.get('proposal')) || null
  const focusedRef = useRef(false)

  // The revision the applicant already submitted once, held across a
  // re-authentication so we can replay it without touching the form.
  const [pendingPayload, setPendingPayload] = useState<ProposalPayload | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([])
  const [genericError, setGenericError] = useState('')

  // Keeps the auto-replay effect from firing twice for one token.
  const replayingRef = useRef(false)

  const reauthenticating = view === 'code' && pendingPayload !== null

  const loadList = useCallback(async () => {
    setBusy(true); setError('')
    try {
      const { email: tokenEmail, items: dossiers } = await fetchMyProposals()
      // Adopt the address the token was issued for. After a same-tab reload
      // `email` is '' -- the mount effect goes straight to the list and the
      // sign-in input never runs -- and without this the 401 handler in
      // sendRevision would have nowhere to send a fresh code, and the code
      // panel's "we sent it to ..." label would render blank.
      if (tokenEmail) setEmail(tokenEmail)
      setItems(dossiers)
      setView('list')
    } catch (exc: any) {
      if (statusOf(exc) === 401) {
        const wasAdminView = portalActor() !== null
        clearPortalToken()
        setView('email')
        setError(wasAdminView
          ? t(M.adminExpired)
          : t(M.sessionExpired))
      } else {
        // Set the view explicitly. Leaving it alone let the render chain fall
        // through to the sign-in panel, so an applicant holding a perfectly
        // valid token was asked to sign in again beside a load error -- and,
        // after a successful revision, beside the green "your proposal has
        // been sent" flash too. Stay on the list, where the error belongs.
        setError(t(M.loadFailed))
        setView('list')
      }
    } finally {
      setBusy(false)
    }
  }, [t])

  // A token already in sessionStorage (a reload within the same tab) skips
  // straight to the list.
  // So does an admin arriving from the console's "Open portal as applicant",
  // whose token comes in the URL fragment.
  useEffect(() => {
    if (adoptPortalTokenFromHash() || hasPortalToken()) void loadList()
  }, [loadList])

  // ── Step: ask for a code ─────────────────────────────────────────────
  const askForCode = async (target: string, opts?: { silent?: boolean }) => {
    // Never post an empty address, and never move to the code panel without
    // one: the applicant would be staring at an input for a code that was
    // never sent, with no way out that keeps their work.
    if (!target.trim()) throw new MissingPortalEmailError()
    const { message } = await requestPortalCode(target.trim())
    if (!opts?.silent) setNotice(isAr ? t(M.codeOnItsWay, { email: target.trim() }) : message)
    setCode('')
    setView('code')
  }

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(''); setNotice(''); setFlash('')
    try {
      await askForCode(email.trim())
    } catch (exc: any) {
      if (isNoProposalForAddress(exc)) {
        if (pendingPayload) {
          // Mid-revision: the dossier vanished under us. Do not swap the view
          // out from under a form that still holds the applicant's edits --
          // keep them where they are and say what happened.
          setError(t(M.noLongerFind))
          return
        }
        // Not an error the applicant caused -- most often they used a
        // different address than the one on the application. Say so, and
        // give them somewhere to go.
        setView('not-found')
      } else if (statusOf(exc) === 429) {
        setError((isAr ? undefined : exc?.response?.data?.detail)
          ?? t(M.tooManyCodes))
      } else {
        setError(t(M.codeSendFailed))
      }
    } finally {
      setBusy(false)
    }
  }

  // ── The PUT, shared by the first attempt and the post-re-auth replay ──
  const sendRevision = useCallback(async (proposalId: number, payload: ProposalPayload) => {
    setBusy(true); setFieldErrors([]); setGenericError('')
    try {
      await submitRevision(proposalId, payload as unknown as Record<string, unknown>)
      setPendingPayload(null)
      setEditing(null)
      setFlash(t(M.revisionSent))
      await loadList()
    } catch (exc: any) {
      const status = statusOf(exc)
      if (status === 401 && portalActor() !== null) {
        // An admin acting for the team. Asking for a code here would email
        // the TEAM a code they never asked for, and the admin could not read
        // it anyway. The form stays on screen with everything in it.
        setGenericError(t(M.adminExpiredNothingSent))
        return
      }
      if (status === 401) {
        // The thirty minutes ran out mid-edit. Hold on to everything the
        // applicant just wrote, get a fresh code, and replay it after.
        setPendingPayload(payload)
        clearPortalToken()
        try {
          await askForCode(email.trim(), { silent: true })
          setNotice(t(M.expiredWhileWriting))
        } catch (codeExc: any) {
          // This is the one path where the applicant's unsaved work is at
          // stake: the form below holds the only copy of a twenty-six field
          // revision, and it cannot be copied out of a hidden panel. So when we
          // cannot get a code to them we keep `view = 'edit'`, which leaves the
          // form visible (`reauthenticating` stays false), and keep
          // pendingPayload so a token arriving by any route still replays it.
          if (codeExc instanceof MissingPortalEmailError) {
            // No address at all -- a reloaded tab whose /portal/me answer we
            // never got, so `email` was never adopted. Asking for a code is
            // impossible here and "Send me a new code" would fail identically,
            // so do not offer the code panel. Say what happened and point at a
            // second tab, which leaves this one -- and everything typed into
            // it -- untouched.
            setGenericError(t(M.noAddressInTab))
            return
          }
          if (isNoProposalForAddress(codeExc)) {
            // The dossier is gone from under the applicant. The code panel
            // would promise "enter the six-digit code we sent to ..." when
            // nothing was sent, so stay on the form -- it is still mounted and
            // still holds the only copy of what they wrote.
            setGenericError(t(M.noLongerFind))
            return
          }
          // The address is good and the send failed (rate limit, network). The
          // code panel is still the way through, and "Send me a new code"
          // genuinely works from it, so offer it -- the form stays mounted
          // behind it and the payload is replayed once a token lands.
          setError(t(M.expiredCouldNotEmail))
          setView('code')
        }
        return
      }
      if (status === 422) {
        setFieldErrors(parseFieldErrors(detailOf(exc)))
        return
      }
      if (status === 409) {
        setGenericError(t(M.noLongerOpen))
        return
      }
      const detail = detailOf(exc)
      setGenericError(!isAr && typeof detail === 'string' ? detail : t(M.saveFailed))
    } finally {
      setBusy(false)
    }
  }, [email, loadList, isAr, t])

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await verifyPortalCode(email.trim(), code)
      setNotice('')
      if (pendingPayload && editing) {
        // The auto-replay effect below picks it up now that a token exists.
        replayingRef.current = false
        setView('edit')
      } else {
        await loadList()
      }
    } catch (exc: any) {
      if (statusOf(exc) === 401) {
        setError(t(M.codeInvalid))
      } else {
        setError(t(M.codeVerifyFailed))
      }
    } finally {
      setBusy(false)
    }
  }

  // Auto-resubmit the held payload the moment a fresh token exists.
  useEffect(() => {
    if (view !== 'edit' || !pendingPayload || !editing) return
    if (!hasPortalToken() || replayingRef.current) return
    replayingRef.current = true
    void sendRevision(editing.id, pendingPayload)
  }, [view, pendingPayload, editing, sendRevision])

  const handleFormSubmit = async (payload: ProposalPayload) => {
    if (!editing) return
    replayingRef.current = true  // this attempt is the applicant's own
    await sendRevision(editing.id, payload)
  }

  const startEditing = (proposal: PortalProposal) => {
    setEditing(proposal)
    setPendingPayload(null)
    setFieldErrors([])
    setGenericError('')
    setFlash('')
    replayingRef.current = false
    setView('edit')
  }

  const scrollToDossier = (id: number) => {
    // After render, so the open form is part of what scrolls into view.
    // Optional call: jsdom and some old browsers lack scrollIntoView.
    window.setTimeout(() => {
      document.getElementById(`proposal-${id}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  const openReportForm = (proposal: PortalProposal) => {
    setReportFor(proposal.id)
    expand(proposal.id)
    setFlash('')
    scrollToDossier(proposal.id)
  }

  const closeReportForm = () => setReportFor(null)

  /** Says exactly which files arrived: "is my PDF there?" is the question
   *  teams were left asking. */
  const receivedFiles = (result: ReportResult): string => {
    const files = result.report?.attachments || []
    if (files.length === 0) return t(M.noFileOnIt)
    return t(M.filesReceived, { list: files.map((a) => `${a.filename} (${formatBytes(a.size_bytes)})`).join(isAr ? '، ' : ', ') })
  }

  const onReportSubmitted = async (result: ReportResult) => {
    closeReportForm()
    await loadList()
    const missing = result.attachments_offered - result.attachments_stored
    setFlash(
      missing > 0
        // Said plainly rather than hidden: the report is filed, but they
        // need to know some evidence did not arrive.
        ? t(M.reportPartly, { missing, offered: result.attachments_offered, received: receivedFiles(result) })
        : t(M.reportOk, { received: receivedFiles(result) }),
    )
    window.scrollTo?.({ top: 0, behavior: 'smooth' })
  }

  const onFilesAdded = async (result: ReportResult) => {
    await loadList()
    const missing = result.attachments_offered - result.attachments_stored
    setFlash(missing > 0
      ? t(M.filesPartly, { missing, offered: result.attachments_offered, received: receivedFiles(result) })
      : t(M.filesOk, { received: receivedFiles(result) }))
    window.scrollTo?.({ top: 0, behavior: 'smooth' })
  }

  const [preview, setPreview] = useState<PreviewFile | null>(null)
  const [openingFile, setOpeningFile] = useState<number | null>(null)

  const openFile = async (proposalId: number, attachmentId: number, filename: string) => {
    setOpeningFile(attachmentId)
    try {
      setPreview(previewOf(await fetchReportAttachment(proposalId, attachmentId), filename))
    } catch (exc: any) {
      setError(statusOf(exc) === 401
        ? t(M.fileSessionExpired)
        : t(M.fileOpenFailed))
    } finally {
      setOpeningFile(null)
    }
  }

  // Arriving from an email link: once the list is in, go to that dossier, and
  // open the report form if a report is what it is waiting for. Once only, so
  // closing the form is not undone by the next list refresh.
  useEffect(() => {
    if (view !== 'list' || !focusId || focusedRef.current) return
    const target = items.find((p) => p.id === focusId)
    if (!target) return
    focusedRef.current = true
    expand(target.id)
    if (target.may_submit_report) setReportFor(target.id)
    scrollToDossier(target.id)
  }, [view, items, focusId])

  const backToEmail = () => {
    clearPortalToken()
    setEditing(null)
    setPendingPayload(null)
    setCode('')
    setNotice(''); setError(''); setFlash('')
    setView('email')
  }

  const initialValues = useMemo(
    () => (editing ? toFormValues(editing.content) : undefined),
    [editing],
  )

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-gray-50 py-8 sm:py-12">
      <SEOHead
        title={t(M.seoTitle)}
        description={t(M.seoDescription)}
        canonicalPath="/my-proposals"
      />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-6">
        <div className="text-center">
          <Link to="/" className="text-sm text-gray-500 hover:text-gray-800 inline-flex items-center gap-1 mb-4">
            <ArrowLeft className="w-4 h-4" /> {t(C.backToHome)}
          </Link>
          <h1 className="text-3xl sm:text-4xl font-heading font-bold text-gray-900">{t(M.title)}</h1>
          <p className="text-gray-600 mt-2 max-w-2xl mx-auto">
            {t(M.lead)}
          </p>
        </div>
        {children}
      </div>
    </div>
  )

  const actor = portalActor()

  const alerts = (
    <>
      {actor && (
        // Impossible to miss, because everything filed from here goes into the
        // team's record under the admin's name.
        <div role="status" className="bg-indigo-50 border border-indigo-300 rounded-lg p-4 text-sm text-indigo-900 flex flex-wrap items-start justify-between gap-3">
          <span>
            {rich(t(M.adminViewBody), {
              title: <strong>{t(M.adminViewTitle)}</strong>,
              email: <strong>{email || t(M.thisApplicant)}</strong>,
              actor: <strong>{actor}</strong>,
            })}
          </span>
          <button onClick={() => { backToEmail(); window.close() }}
            className="px-3 py-1.5 bg-white border border-indigo-300 rounded-lg text-indigo-800 font-semibold hover:bg-indigo-100">
            {t(M.leaveAdminView)}
          </button>
        </div>
      )}
      {flash && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-900 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{flash}</span>
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </>
  )

  // ── View: enter your email ───────────────────────────────────────────
  const emailPanel = (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8 space-y-4 max-w-lg mx-auto">
      <div className="flex items-center gap-2 text-primary-700">
        <Mail className="w-5 h-5" />
        <h2 className="text-lg font-bold text-gray-900">{t(M.signInTitle)}</h2>
      </div>
      {focusId && (
        // Arrived from an email link. The one thing that trips people here is
        // typing a different address from the one the dossier is filed under.
        <p className="text-sm text-gray-700 bg-primary-50 border border-primary-100 rounded-lg p-3">
          {t(M.fromEmailLink, { id: focusId })}
        </p>
      )}
      <form onSubmit={handleEmailSubmit} className="space-y-4">
        <div>
          <label htmlFor="portal-email" className="block text-sm font-medium text-gray-700 mb-1">
            {t(M.emailLabel)}
          </label>
          <input
            id="portal-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-field"
            placeholder="you@example.com"
          />
        </div>
        <button
          type="submit"
          disabled={busy || !email.trim()}
          className="w-full px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white font-semibold rounded-lg inline-flex items-center justify-center gap-2"
        >
          {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> {t(M.sending)}</> : <>{t(M.emailMeACode)}</>}
        </button>
      </form>
      <p className="text-xs text-gray-500">
        {t(M.notYetApplied)}{' '}
        <Link to="/submit-proposal" className="text-primary-700 font-medium hover:underline">{t(M.submitProjectProposal)}</Link>.
      </p>
    </div>
  )

  // ── View: nothing is filed under that address ────────────────────────
  //
  // Reached only from the sign-in panel, where the backend answers 404 rather
  // than the opaque 202 it used to. Before that, an unknown address landed on
  // the code panel reading "enter the code we sent to ..." — a sentence that
  // was simply untrue.
  const notFoundPanel = (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8 max-w-md mx-auto space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
          <AlertCircle className="w-5 h-5 text-amber-700" />
        </div>
        <div>
          <h2 className="font-semibold text-gray-900">{t(M.notFoundTitle)}</h2>
          <p className="text-sm text-gray-600 mt-1">
            {rich(t(M.notFoundBody), {
              email: <strong className="text-gray-900 break-all">{email.trim()}</strong>,
            })}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => { setView('email'); setError(''); setNotice('') }}
        className="w-full px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg"
      >
        {t(M.tryDifferentAddress)}
      </button>
      <p className="text-sm text-gray-600 text-center">
        {t(M.neverSentOne)}{' '}
        <Link to="/submit-proposal" className="text-primary-700 font-medium hover:underline">
          {t(M.submitAProposal)}
        </Link>
      </p>
    </div>
  )

  // ── View: enter the six-digit code ───────────────────────────────────
  const codePanel = (
    <div className={`bg-white rounded-xl shadow-sm border p-6 sm:p-8 space-y-4 max-w-lg mx-auto ${reauthenticating ? 'border-amber-300' : 'border-gray-200'}`}>
      <div className="flex items-center gap-2 text-primary-700">
        <KeyRound className="w-5 h-5" />
        <h2 className="text-lg font-bold text-gray-900">
          {reauthenticating ? t(M.confirmItsYou) : t(M.checkInbox)}
        </h2>
      </div>
      {notice && (
        <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3">{notice}</p>
      )}
      <form onSubmit={handleCodeSubmit} className="space-y-4">
        <div>
          <label htmlFor="portal-code" className="block text-sm font-medium text-gray-700 mb-1">
            {t(M.enterCode, { email: email.trim() })}
          </label>
          <input
            id="portal-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="input-field tracking-[0.4em] text-center text-lg font-semibold"
            placeholder="000000"
          />
        </div>
        <button
          type="submit"
          disabled={busy || code.length !== 6}
          className="w-full px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white font-semibold rounded-lg inline-flex items-center justify-center gap-2"
        >
          {busy
            ? <><Loader2 className="w-4 h-4 animate-spin" /> {t(M.checking)}</>
            : reauthenticating ? <>{t(M.confirmAndSend)}</> : <>{t(M.signIn)}</>}
        </button>
      </form>
      <div className="flex items-center justify-between text-xs text-gray-500">
        <button
          type="button"
          onClick={() => void handleEmailSubmit({ preventDefault: () => {} } as React.FormEvent)}
          disabled={busy}
          className="text-primary-700 font-medium hover:underline disabled:text-gray-400"
        >
          {t(M.newCode)}
        </button>
        <button type="button" onClick={backToEmail} className="hover:underline">
          {t(M.differentEmail)}
          {reauthenticating && <span className="block text-gray-500">{t(M.discardsEdits)}</span>}
        </button>
      </div>
    </div>
  )

  // ── View: the dashboard ──────────────────────────────────────────────
  const listPanel = (
    <div className="space-y-4">
      {busy && items.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500 inline-flex items-center justify-center gap-2 w-full">
          <Loader2 className="w-4 h-4 animate-spin" /> {t(M.loadingProposals)}
        </div>
      )}

      {/* A failed load leaves `items` empty too, and "No proposals yet" would
          then be a guess dressed up as a fact. Offer the retry instead. */}
      {!busy && items.length === 0 && error && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <button
            onClick={() => void loadList()}
            className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg"
          >
            {t(C.tryAgain)}
          </button>
        </div>
      )}

      {!busy && items.length === 0 && !error && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center space-y-3">
          <Inbox className="w-10 h-10 mx-auto text-gray-300" />
          <h2 className="text-lg font-bold text-gray-900">{t(M.noProposals)}</h2>
          <p className="text-sm text-gray-600">
            {t(M.nothingFiled, { email: email.trim() || t(M.thisAddress) })}
          </p>
          <Link
            to="/submit-proposal"
            className="inline-block px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg"
          >
            {t(M.submitProjectProposal)}
          </Link>
        </div>
      )}

      {/* What the team has to do, before anything else on the page. A funded
          team owes a report, and the button for it used to sit at the bottom
          of a card among others. */}
      {items.filter((p) => p.editable).map((p) => (
        <div key={`edit-${p.id}`} role="alert"
          className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-amber-900">
            <p className="font-semibold">{t(M.actionChanges)}</p>
            <p>{t(M.nameAndRef, { name: p.project_name || t(M.untitled), id: p.id })}</p>
          </div>
          <button onClick={() => startEditing(p)}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg inline-flex items-center gap-2">
            <PencilLine className="w-4 h-4" /> {t(M.fixAndResubmit)}
          </button>
        </div>
      ))}

      {items.filter((p) => p.may_submit_report && reportFor !== p.id).map((p) => (
        <div key={`action-${p.id}`} role="alert"
          className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-amber-900">
            <p className="font-semibold">
              {p.status === 'report_changes_requested' ? t(M.actionCorrectedReport) : t(M.actionReport)}
            </p>
            <p>
              {t(M.cannotApplyUntil, { name: p.project_name || t(M.untitled), id: p.id })}
            </p>
          </div>
          <button onClick={() => openReportForm(p)}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg inline-flex items-center gap-2">
            <Upload className="w-4 h-4" /> {p.status === 'report_changes_requested' ? t(M.sendCorrectedReport) : t(M.sendTheReport)}
          </button>
        </div>
      ))}

      {items.map((p) => {
        const open = expanded.includes(p.id) || reportFor === p.id
        return (
        <div key={p.id} id={`proposal-${p.id}`}
          className={`bg-white rounded-xl shadow-sm border scroll-mt-6 ${
            focusId === p.id || reportFor === p.id ? 'border-primary-400 ring-2 ring-primary-100' : 'border-gray-200'}`}>
          <button type="button" onClick={() => toggle(p.id)} aria-expanded={open}
            className="w-full text-start p-5 sm:p-6 flex items-start justify-between gap-3 hover:bg-gray-50 rounded-xl">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900">{p.project_name || t(M.untitled)}</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {t(M.refSubmitted, { id: p.id, date: formatDate(p.submitted_at, dateTag) })}
                {p.version_no && p.version_no > 1 && <>{t(M.version, { n: p.version_no })}</>}
              </p>
              <p className="text-sm text-gray-700 mt-2">{STATUS_HINT[p.status] ? t(STATUS_HINT[p.status]) : ''}</p>
            </div>
            <span className="flex items-center gap-2 shrink-0">
              <StatusBadge status={p.status} />
              <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
            </span>
          </button>

          {open && (
          <div className="px-5 sm:px-6 pb-6 space-y-3">

          {p.decision_comment && (
            <blockquote className="border-s-4 border-amber-300 bg-amber-50 rounded-e-lg p-3 text-sm text-amber-900">
              <span className="flex items-center gap-1.5 font-semibold mb-1">
                <MessageSquare className="w-3.5 h-3.5" /> {t(M.fromReviewTeam)}
              </span>
              <span className="whitespace-pre-line">{p.decision_comment}</span>
            </blockquote>
          )}

          {/* ── The report that was already filed ── */}
          {p.report && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-gray-700">
                  {t(M.completionReport)} {p.report.report_no > 1 && `#${p.report.report_no}`}
                </span>
                <span className="text-xs text-gray-500">
                  {t(M.reportSubmittedOn, { date: formatDate(p.report.submitted_at, dateTag) })}
                </span>
              </div>
              <p className="text-sm text-gray-800 whitespace-pre-line">{p.report.narrative}</p>
              {p.report.attachments.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {p.report.attachments.map((a) => (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => void openFile(p.id, a.id, a.filename)}
                        className="inline-flex items-center gap-1.5 px-2 py-1 text-xs bg-white border border-gray-200 rounded hover:border-primary-300 text-gray-700"
                      >
                        {openingFile === a.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paperclip className="w-3 h-3" />}
                        <span dir="auto">{a.filename}</span>
                        <span className="text-gray-500">{formatBytes(a.size_bytes)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {p.report.attachments.length === 0 && (
                <p className="text-xs text-amber-800">{t(M.noFileOnReport)}</p>
              )}
              {p.awaiting_report_review && !p.report.decision && (
                <AddReportFiles
                  proposalId={p.id}
                  existingCount={p.report.attachments.length}
                  existingBytes={p.report.attachments.reduce((sum, a) => sum + a.size_bytes, 0)}
                  onAdded={(result) => void onFilesAdded(result)}
                />
              )}
              {/* The reason it was sent back. The only thing telling them what
                  to fix, so it is never collapsed behind anything. */}
              {p.report.decision === 'changes_requested' && p.report.decision_comment && (
                <blockquote className="border-s-4 border-orange-300 bg-orange-50 rounded-e-lg p-3 text-sm text-orange-900">
                  <span className="flex items-center gap-1.5 font-semibold mb-1">
                    <MessageSquare className="w-3.5 h-3.5" /> {t(M.stillToAdd)}
                  </span>
                  <span className="whitespace-pre-line">{p.report.decision_comment}</span>
                </blockquote>
              )}
            </div>
          )}

          {p.awaiting_report_review && (
            <p className="text-sm text-indigo-800 bg-indigo-50 border border-indigo-100 rounded-lg p-3 flex items-start gap-2">
              <Eye className="w-4 h-4 mt-0.5 shrink-0" />
              {t(M.reportWithTeam)}
            </p>
          )}

          {p.completed && (
            <p className="text-sm text-emerald-900 bg-emerald-50 border border-emerald-100 rounded-lg p-3 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              {t(M.projectClosed)}
            </p>
          )}

          {/* ── Filing (or re-filing) a report ── */}
          {p.may_submit_report && reportFor !== p.id && (
            <div className="pt-2 border-t border-gray-100 space-y-2">
              <p className="text-sm text-gray-600">
                {p.status === 'report_changes_requested'
                  ? t(M.sendCorrectedHint)
                  : t(M.sendWhatWasDone)}
              </p>
              <button
                onClick={() => openReportForm(p)}
                className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg inline-flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                {p.status === 'report_changes_requested' ? t(M.sendCorrectedReport) : t(M.sendCompletionReport)}
              </button>
            </div>
          )}

          {reportFor === p.id && (
            <ReportForm
              proposal={p}
              email={email}
              onSubmitted={(result) => void onReportSubmitted(result)}
              onCancel={closeReportForm}
              adminView={actor !== null}
            />
          )}

          {p.editable && (
            <div className="pt-2 border-t border-gray-100">
              <button
                onClick={() => startEditing(p)}
                className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white font-semibold rounded-lg inline-flex items-center gap-2"
              >
                <PencilLine className="w-4 h-4" /> {t(M.fixAndResubmit)}
              </button>
            </div>
          )}
          </div>
          )}
        </div>
        )
      })}

      {items.length > 0 && (
        <div className="text-center">
          <button onClick={backToEmail} className="text-sm text-gray-500 hover:text-gray-800 hover:underline">
            {t(M.signOut)}
          </button>
        </div>
      )}
    </div>
  )

  // ── View: revise ─────────────────────────────────────────────────────
  //
  // Rendered whenever a dossier is open for editing — INCLUDING while we are
  // re-authenticating after a 401, when the code panel sits on top and the
  // form below is merely hidden. Conditionally rendering the form here would
  // throw away the twenty-five values it holds in its own state, which is
  // exactly what this whole dance exists to prevent.
  const editPanel = editing && (
    <div className="space-y-6">
      {reauthenticating && codePanel}

      <div className={reauthenticating ? 'hidden' : 'space-y-6'} aria-hidden={reauthenticating}>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-gray-900">
              {editing.project_name || t(M.untitled)}{' '}
              <span className="text-sm font-normal text-gray-500">{t(M.reference, { id: editing.id })}</span>
            </h2>
            <StatusBadge status={editing.status} />
          </div>
          {editing.decision_comment ? (
            <blockquote className="border-s-4 border-amber-300 bg-amber-50 rounded-e-lg p-3 text-sm text-amber-900">
              <span className="flex items-center gap-1.5 font-semibold mb-1">
                <MessageSquare className="w-3.5 h-3.5" /> {t(M.reviewTeamAsked)}
              </span>
              <span className="whitespace-pre-line">{editing.decision_comment}</span>
            </blockquote>
          ) : (
            <p className="text-sm text-gray-600">
              {t(M.updateAndResubmit)}
            </p>
          )}
          <button
            onClick={() => { setEditing(null); setPendingPayload(null); setView('list') }}
            className="text-sm text-gray-500 hover:text-gray-800 inline-flex items-center gap-1 pt-1"
          >
            <ArrowLeft className="w-4 h-4" /> {t(M.backToProposals)}
          </button>
        </div>

        <ProposalForm
          mode="revise"
          initialValues={initialValues}
          // Read defensively: `serialize_for_portal`'s content dict is built
          // from PROPOSAL_CONTENT_FIELDS, which does not include sms_consent,
          // so this is `undefined` today and the box stays unticked. The moment
          // the backend adds the field to that payload, an existing opt-in is
          // restated by the revision instead of being silently revoked.
          initialSmsConsent={Boolean((editing.content as any).sms_consent)}
          onSubmit={handleFormSubmit}
          submitting={busy}
          fieldErrors={fieldErrors}
          genericError={genericError}
        />
      </div>
    </div>
  )

  if (editing) return shell(<>{alerts}{editPanel}</>)
  if (view === 'not-found') return shell(notFoundPanel)
  if (view === 'code') return shell(<>{alerts}{codePanel}</>)
  if (view === 'list') {
    return shell(<>
      {alerts}{listPanel}
      {preview && <FilePreview file={preview} onClose={() => setPreview(null)} />}
    </>)
  }
  return shell(<>{alerts}{emailPanel}</>)
}

export default MyProposals
