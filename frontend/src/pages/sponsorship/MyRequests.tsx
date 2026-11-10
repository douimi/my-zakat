/**
 * /my-requests — "Follow my request", for families, guardians and associations.
 *
 * One question per request, answered first: where does it stand, and is
 * anything expected from me? The status line and the team's last message are
 * always visible; documents, the timeline and what was distributed are folded
 * until asked for, so an association with twenty requests still gets a page it
 * can read.
 */
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle, CheckCircle2, Clock, FileText, Lock, LogOut, MessageSquare, Pencil, Plus, Upload, XCircle,
} from 'lucide-react'
import { clsx } from 'clsx'
import SEOHead from '../../components/SEOHead'
import Disclosure from '../../components/ui/Disclosure'
import PortalSignIn from '../../components/sponsorship/PortalSignIn'
import { APPLICANT_STATUS, DOC_LABELS, FUNDING_LABELS, NEED_LABELS, TIMELINE_LABELS } from '../../components/sponsorship/labels'
import { useCounts } from '../../components/sponsorship/useCounts'
import { defineMessages, useFormat, usePick, useT } from '../../i18n'
import { C } from '../../i18n/common'
import {
  clearSponsorshipPortalToken, fetchMyRequests, fetchOwnDocument, hasSponsorshipPortalToken, resubmitRequest,
  uploadRequestDocuments, type ApplicantCase, type DocType,
} from '../../utils/sponsorshipApi'
import { Wizard, formFromCase } from './SponsorApply'

const M = defineMessages({
  title: { en: 'Follow my request', ar: 'متابعة طلبي' },
  lead: {
    en: 'See where your sponsorship requests stand, answer our questions and send documents.',
    ar: 'اطّلع على حالة طلبات الكفالة، وأجب عن أسئلتنا، وأرسل الوثائق.',
  },
  signedInAs: { en: 'Requests filed with {email}', ar: 'الطلبات المقدّمة بالبريد {email}' },
  signOut: { en: 'Sign out', ar: 'خروج' },
  none: { en: 'No request is filed under this address yet.', ar: 'لا يوجد طلب مقدّم بهذا البريد بعد.' },
  newRequest: { en: 'File a new request', ar: 'تقديم طلب جديد' },
  family: { en: 'Family', ar: 'أسرة' },
  orphan: { en: 'Orphan', ar: 'يتيم' },
  filedOn: { en: 'Filed {date}', ar: 'قُدّم بتاريخ {date}' },
  newSince: { en: '{count} new', ar: 'جديد: {count}' },
  ourMessage: { en: 'Message from our team', ar: 'رسالة من فريقنا' },
  update: { en: 'Update my request', ar: 'تحديث طلبي' },
  missingTitle: { en: 'Documents we still need', ar: 'وثائق ما زلنا نحتاجها' },
  refused: { en: 'Not accepted: {reason}', ar: 'لم تُقبل: {reason}' },
  verified: { en: 'Verified', ar: 'تم التحقق' },
  refusedBadge: { en: 'Refused', ar: 'مرفوضة' },
  pending: { en: 'Waiting to be checked', ar: 'بانتظار المراجعة' },
  documents: { en: 'Documents', ar: 'الوثائق' },
  documentsSummary: { en: '{count} sent', ar: 'تم إرسال {count}' },
  open: { en: 'Open', ar: 'فتح' },
  sendDocument: { en: 'Send a document', ar: 'إرسال وثيقة' },
  documentType: { en: 'Type of document', ar: 'نوع الوثيقة' },
  chooseFile: { en: 'Choose a file', ar: 'اختر ملفًا' },
  uploading: { en: 'Sending… {percent}%', ar: 'جارٍ الإرسال… {percent}%' },
  uploaded: { en: 'Received — thank you.', ar: 'تم الاستلام — شكرًا لك.' },
  uploadFailed: { en: 'The file could not be sent. Check it is a PDF or a photo under 15 MB, then try again.', ar: 'تعذّر إرسال الملف. تأكد أنه بصيغة PDF أو صورة وحجمه أقل من 15 ميغابايت، ثم حاول مجددًا.' },
  history: { en: 'History', ar: 'السجل' },
  historySummary: { en: 'Last update {date}', ar: 'آخر تحديث {date}' },
  byYou: { en: 'you', ar: 'أنت' },
  byTeam: { en: 'our team', ar: 'فريقنا' },
  sponsorship: { en: 'Sponsorship', ar: 'الكفالة' },
  monthlyCovered: { en: '{committed} of {need} per month is covered', ar: 'تمت تغطية {committed} من أصل {need} شهريًا' },
  sponsorPrivacy: { en: 'Sponsors stay anonymous to you, as you stay anonymous to them.', ar: 'يبقى الكفلاء مجهولي الهوية بالنسبة لك، كما تبقى هويتك مجهولة بالنسبة لهم.' },
  received: { en: 'What you have received', ar: 'ما استلمتموه' },
  receivedTotal: { en: '{amount} in total', ar: 'المجموع {amount}' },
  linkedOrphans: { en: 'Orphan requests linked to this family', ar: 'طلبات كفالة الأيتام المرتبطة بهذه الأسرة' },
  addOrphan: { en: 'File an orphan request for a child of this family', ar: 'قدّم طلب كفالة يتيم لطفل من هذه الأسرة' },
  linkedFamily: { en: 'Linked to family request {reference}', ar: 'مرتبط بطلب الأسرة {reference}' },
  sessionExpired: { en: 'Your session has ended. Sign in again to continue.', ar: 'انتهت الجلسة. سجّل الدخول من جديد للمتابعة.' },
  loadFailed: { en: 'We could not load your requests.', ar: 'تعذّر تحميل طلباتك.' },
  updateSent: { en: 'Thank you — your updated request is back with our team.', ar: 'شكرًا لك — عاد طلبك المحدّث إلى فريقنا.' },
  needs: { en: 'Monthly needs you listed', ar: 'الاحتياجات الشهرية التي ذكرتها' },
})

const STATUS_ICON = { neutral: Clock, info: Clock, warning: AlertTriangle, success: CheckCircle2, danger: XCircle } as const
const TONE_CLASS = {
  neutral: 'bg-gray-50 border-gray-200 text-gray-800',
  info: 'bg-primary-50 border-primary-200 text-primary-900',
  warning: 'bg-amber-50 border-amber-200 text-amber-900',
  success: 'bg-green-50 border-green-200 text-green-800',
  danger: 'bg-red-50 border-red-200 text-red-800',
} as const

const httpStatus = (e: unknown) => (e as { response?: { status?: number } })?.response?.status

/** Upload one document of a chosen type. */
const DocumentUploader = ({ request, suggested, onDone }: {
  request: ApplicantCase; suggested?: DocType; onDone: (updated: ApplicantCase) => void
}) => {
  const t = useT()
  const [docType, setDocType] = useState<DocType>(suggested || request.missing_documents[0] || 'other')
  const [progress, setProgress] = useState<number | null>(null)
  const [state, setState] = useState<'idle' | 'ok' | 'error'>('idle')

  const send = async (file: File) => {
    setState('idle')
    setProgress(0)
    try {
      const res = await uploadRequestDocuments(request.id, [{ file, docType }], (l, tot) => setProgress(Math.round((l / tot) * 100)))
      setState('ok')
      onDone(res.request)
    } catch {
      setState('error')
    } finally {
      setProgress(null)
    }
  }

  const types = Array.from(new Set<DocType>([...request.missing_documents, ...request.required_documents,
    'school_certificate', 'medical_report', 'income_proof', 'residence_proof', 'guardianship', 'other']))

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="sm:flex-1">
          <label htmlFor={`doc-type-${request.id}-${suggested || 'any'}`} className="label">{t(M.documentType)}</label>
          <select id={`doc-type-${request.id}-${suggested || 'any'}`} className="input py-2" value={docType}
            onChange={(e) => setDocType(e.target.value as DocType)}>
            {types.map((d) => <option key={d} value={d}>{t(DOC_LABELS[d])}</option>)}
          </select>
        </div>
        <label className={clsx('btn-primary btn-sm cursor-pointer gap-1.5', progress !== null && 'pointer-events-none opacity-60')}>
          <Upload aria-hidden="true" className="h-4 w-4" />
          {progress !== null ? t(M.uploading, { percent: progress }) : t(M.chooseFile)}
          <input type="file" className="sr-only" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) send(f); e.target.value = '' }} />
        </label>
      </div>
      {state === 'ok' && <p className="text-sm text-green-700" role="status">{t(M.uploaded)}</p>}
      {state === 'error' && <p className="field-error" role="alert">{t(M.uploadFailed)}</p>}
    </div>
  )
}

const RequestCard = ({ request, onChange, onEdit, email }: {
  request: ApplicantCase; onChange: (r: ApplicantCase) => void; onEdit: () => void; email: string
}) => {
  const t = useT()
  const pick = usePick()
  const { date, money } = useFormat()
  const counts = useCounts()
  const status = APPLICANT_STATUS[request.status]
  const StatusIcon = STATUS_ICON[status.tone]
  const name = request.kind === 'family' ? request.details.head_full_name : request.details.full_name

  const openDocument = async (docId: number) => {
    const blob = await fetchOwnDocument(request.id, docId)
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  return (
    <article className="card space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-gray-600">
            <span className="badge-neutral me-2">{t(request.kind === 'family' ? M.family : M.orphan)}</span>
            <span className="ltr-nums font-mono" dir="ltr">{request.reference}</span>
          </p>
          <h2 className="mt-1 truncate text-lg font-heading font-semibold text-gray-900">{name}</h2>
          <p className="text-sm text-gray-500">{t(M.filedOn, { date: date(request.submitted_at) })}</p>
        </div>
        {request.unread > 0 && <span className="badge-primary">{t(M.newSince, { count: request.unread })}</span>}
      </header>

      <div className={clsx('flex items-start gap-3 rounded-lg border p-3', TONE_CLASS[status.tone])}>
        <StatusIcon aria-hidden="true" className="mt-0.5 h-5 w-5 flex-shrink-0" />
        <div>
          <p className="font-semibold">{t(status.label)}</p>
          <p className="text-sm">{t(status.explain)}</p>
        </div>
      </div>

      {request.last_message && (request.status === 'info_requested' || request.status === 'rejected') && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <MessageSquare aria-hidden="true" className="h-4 w-4" />{t(M.ourMessage)}
          </p>
          <p className="mt-2 whitespace-pre-line text-gray-800" dir="auto">{request.last_message}</p>
          {request.editable && (
            <button type="button" className="btn-primary btn-sm mt-3 gap-1.5" onClick={onEdit}>
              <Pencil aria-hidden="true" className="h-4 w-4" />{t(M.update)}
            </button>
          )}
        </div>
      )}

      {request.missing_documents.length > 0 && request.may_upload && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="font-semibold text-amber-900">{t(M.missingTitle)}</p>
          <ul className="mb-3 mt-1 list-disc ps-5 text-sm text-amber-900">
            {request.missing_documents.map((d) => <li key={d}>{t(DOC_LABELS[d])}</li>)}
          </ul>
          <DocumentUploader request={request} suggested={request.missing_documents[0]} onDone={onChange} />
        </div>
      )}

      {request.sponsorship && (
        <div className={clsx('rounded-lg border p-4', request.sponsorship.state === 'unfunded'
          ? 'border-gray-200 bg-gray-50 text-gray-800' : 'border-accent-200 bg-accent-50 text-accent-800')}>
          <p className="font-semibold">{t(M.sponsorship)} · {t(FUNDING_LABELS[request.sponsorship.state])}</p>
          {request.sponsorship.committed_cents > 0 && (
            <p className="mt-1 text-sm">
              {t(M.monthlyCovered, { committed: money(request.sponsorship.committed_cents), need: money(request.sponsorship.monthly_need_cents) })}
              {' · '}{counts.sponsors(request.sponsorship.sponsors)}
            </p>
          )}
          <p className="mt-1 text-xs">{t(M.sponsorPrivacy)}</p>
        </div>
      )}

      <div className="space-y-2">
        <Disclosure
          variant="plain"
          title={t(M.documents)}
          summary={t(M.documentsSummary, { count: request.documents.length })}
        >
          <ul className="divide-y divide-gray-100">
            {request.documents.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">{t(DOC_LABELS[d.doc_type])}</p>
                  <p className="truncate text-xs text-gray-500" dir="auto">{d.filename} · {date(d.uploaded_at)}</p>
                  {d.review_status === 'rejected' && d.review_note && (
                    <p className="text-sm text-red-700" dir="auto">{t(M.refused, { reason: d.review_note })}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={d.review_status === 'verified' ? 'badge-success' : d.review_status === 'rejected' ? 'badge-danger' : 'badge-neutral'}>
                    {d.review_status === 'verified' ? t(M.verified) : d.review_status === 'rejected' ? t(M.refusedBadge) : t(M.pending)}
                  </span>
                  <button type="button" className="btn-ghost btn-sm gap-1" onClick={() => openDocument(d.id)}>
                    <FileText aria-hidden="true" className="h-4 w-4" />{t(M.open)}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {request.may_upload && (
            <div className="border-t border-gray-100 pt-3">
              <p className="mb-2 text-sm font-semibold text-gray-900">{t(M.sendDocument)}</p>
              <DocumentUploader request={request} onDone={onChange} />
            </div>
          )}
        </Disclosure>

        <Disclosure variant="plain" title={t(M.needs)}
          summary={money(request.dossier.requested_monthly_cents || 0)}>
          <ul className="text-sm text-gray-700">
            {(request.dossier.needs || []).map((n: { category: keyof typeof NEED_LABELS; monthly_cents: number }) => (
              <li key={n.category} className="flex justify-between py-1">
                <span>{t(NEED_LABELS[n.category])}</span><span className="ltr-nums">{money(n.monthly_cents)}</span>
              </li>
            ))}
          </ul>
        </Disclosure>

        {request.disbursements.length > 0 && (
          <Disclosure variant="plain" title={t(M.received)} summary={t(M.receivedTotal, { amount: money(request.received_cents) })}>
            <ul className="divide-y divide-gray-100 text-sm">
              {request.disbursements.map((d) => (
                <li key={d.id} className="flex justify-between gap-3 py-2">
                  <span>
                    <span className="font-medium text-gray-900">{t(NEED_LABELS[d.category])}</span>
                    <span className="block text-gray-600">{pick(d.description, d.description_ar)} · {date(d.disbursed_at)}</span>
                  </span>
                  <span className="ltr-nums font-semibold">{money(d.amount_cents)}</span>
                </li>
              ))}
            </ul>
          </Disclosure>
        )}

        <Disclosure variant="plain" title={t(M.history)}
          summary={t(M.historySummary, { date: date(request.timeline[0]?.created_at || request.updated_at) })}>
          <ol className="space-y-3">
            {request.timeline.map((e) => (
              <li key={e.id} className="border-s-2 border-gray-200 ps-3">
                <p className="text-sm font-medium text-gray-900">
                  {t(TIMELINE_LABELS[e.type] || { en: e.type, ar: e.type })}
                  {e.doc_type && <span className="font-normal text-gray-600"> · {t(DOC_LABELS[e.doc_type])}</span>}
                  {e.type === 'sponsorship_started' && e.monthly_amount_cents
                    ? <span className="font-normal text-gray-600"> · {money(e.monthly_amount_cents)}</span> : null}
                </p>
                <p className="text-xs text-gray-500">
                  {date(e.created_at)} · {e.by === 'you' ? t(M.byYou) : t(M.byTeam)}
                </p>
                {e.message && <p className="mt-1 whitespace-pre-line text-sm text-gray-700" dir="auto">{e.message}</p>}
              </li>
            ))}
          </ol>
        </Disclosure>
      </div>

      {request.kind === 'family' && (
        <div className="border-t border-gray-100 pt-3 text-sm">
          {request.linked_orphans.length > 0 && (
            <p className="text-gray-700">
              {t(M.linkedOrphans)}:{' '}
              {request.linked_orphans.map((o) => (
                <span key={o.reference} className="me-2 inline-flex items-center gap-1">
                  <span className="ltr-nums font-mono" dir="ltr">{o.reference}</span>
                  <span className="text-gray-500">({t(APPLICANT_STATUS[o.status].label)})</span>
                </span>
              ))}
            </p>
          )}
          {request.may_upload && (
            <Link to={`/sponsor/apply/orphan?family=${request.reference}&email=${encodeURIComponent(email)}`}
              className="link mt-1 inline-flex items-center gap-1">
              <Plus aria-hidden="true" className="h-4 w-4" />{t(M.addOrphan)}
            </Link>
          )}
        </div>
      )}
      {request.kind === 'orphan' && request.family_reference && (
        <p className="border-t border-gray-100 pt-3 text-sm text-gray-600">{t(M.linkedFamily, { reference: request.family_reference })}</p>
      )}
    </article>
  )
}

const MyRequests = () => {
  const t = useT()
  const [signedIn, setSignedIn] = useState(hasSponsorshipPortalToken())
  const [email, setEmail] = useState('')
  const [items, setItems] = useState<ApplicantCase[] | null>(null)
  const [error, setError] = useState<'none' | 'expired' | 'failed'>('none')
  const [editing, setEditing] = useState<ApplicantCase | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await fetchMyRequests()
      setEmail(data.email)
      setItems(data.items)
      setError('none')
    } catch (err) {
      if (httpStatus(err) === 401) {
        clearSponsorshipPortalToken()
        setSignedIn(false)
        setError('expired')
      } else {
        setError('failed')
      }
    }
  }, [])

  useEffect(() => { if (signedIn) load() }, [signedIn, load])

  const replace = (updated: ApplicantCase) =>
    setItems((list) => (list || []).map((r) => (r.id === updated.id ? updated : r)))

  const signOut = () => {
    clearSponsorshipPortalToken()
    setSignedIn(false)
    setItems(null)
  }

  if (editing) {
    return (
      <Wizard
        kind={editing.kind}
        edit={{
          reference: editing.reference,
          email,
          initial: formFromCase(editing),
          onCancel: () => setEditing(null),
          onSubmit: async (payload, files, onProgress) => {
            await resubmitRequest(editing.id, payload)
            if (files.length) {
              await uploadRequestDocuments(editing.id, files, (l, tot) => onProgress(Math.round((l / tot) * 100)))
            }
            setEditing(null)
            setNotice(t(M.updateSent))
            await load()
            window.scrollTo({ top: 0, behavior: 'smooth' })
          },
        }}
      />
    )
  }

  return (
    <div className="bg-gray-50 pb-16">
      <SEOHead title={t(M.title)} description={t(M.lead)} canonicalPath="/my-requests" noindex />
      <div className="page-header bg-white">
        <div className="section-container">
          <h1 className="page-title">{t(M.title)}</h1>
          <p className="page-lead">{t(M.lead)}</p>
        </div>
      </div>

      <div className="section-container mt-8 max-w-4xl">
        {!signedIn ? (
          <>
            {error === 'expired' && <p className="alert-warning mx-auto mb-4 max-w-md">{t(M.sessionExpired)}</p>}
            <PortalSignIn audience="applicant" initialEmail={email} onSignedIn={(e) => { setEmail(e); setSignedIn(true) }} />
          </>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-gray-600">{email && t(M.signedInAs, { email })}</p>
              <div className="flex gap-2">
                <Link to="/sponsor/apply" className="btn-secondary btn-sm gap-1.5"><Plus aria-hidden="true" className="h-4 w-4" />{t(M.newRequest)}</Link>
                <button type="button" className="btn-ghost btn-sm gap-1.5" onClick={signOut}><LogOut aria-hidden="true" className="h-4 w-4" />{t(M.signOut)}</button>
              </div>
            </div>
            {notice && <p className="alert-success" role="status">{notice}</p>}
            {error === 'failed' && (
              <div className="alert-error justify-between" role="alert">
                <span>{t(M.loadFailed)}</span>
                <button type="button" className="btn-secondary btn-sm" onClick={load}>{t(C.tryAgain)}</button>
              </div>
            )}
            {items === null && error === 'none' && <p role="status" className="py-10 text-center text-gray-600">{t(C.loading)}</p>}
            {items && items.length === 0 && <p className="card text-center text-gray-700">{t(M.none)}</p>}
            {items?.map((r) => (
              <RequestCard key={r.id} request={r} email={email} onChange={replace} onEdit={() => setEditing(r)} />
            ))}
            {items && items.length > 0 && (
              <p className="flex items-center gap-2 text-xs text-gray-500">
                <Lock aria-hidden="true" className="h-3.5 w-3.5" />
                {t({ en: 'Documents open in a new tab and are only visible to you and our team.', ar: 'تُفتح الوثائق في نافذة جديدة، ولا يطّلع عليها سواك وفريقنا.' })}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default MyRequests
