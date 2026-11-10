import { useRef, useState } from 'react'
import { CheckCircle2, Eye, FileText, RotateCcw, Upload, XCircle } from 'lucide-react'
import { EmptyState, Modal, StatusBadge, type StatusTone } from '..'
import FilePreview, { previewOf, type PreviewFile } from '../../FilePreview'
import { useToast } from '../../../contexts/ToastContext'
import { sponsorshipAdmin, errorDetail, type DocType, type DocumentInfo } from '../../../utils/sponsorshipApi'
import { DOC_LABELS } from '../../sponsorship/labels'
import { docLabel, fmtBytes, fmtDate } from './format'
import { Panel, type CaseTabProps } from './ui'

const REVIEW_LABEL: Record<DocumentInfo['review_status'], string> = { pending: 'To verify', verified: 'Verified', rejected: 'Refused' }
const REVIEW_TONE: Record<DocumentInfo['review_status'], StatusTone> = { pending: 'warning', verified: 'success', rejected: 'danger' }
const DOC_TYPES = Object.keys(DOC_LABELS) as DocType[]

/** The checklist of required documents, every file with view/verify/refuse, and staff upload. */
const DocumentsTab = ({ case: c, onUpdated }: CaseTabProps) => {
  const { showError, showSuccess } = useToast()
  const [preview, setPreview] = useState<PreviewFile | null>(null)
  const [refusing, setRefusing] = useState<DocumentInfo | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  const view = async (doc: DocumentInfo) => {
    setBusyId(doc.id)
    try {
      const blob = await sponsorshipAdmin.document(c.id, doc.id)
      setPreview(previewOf(blob, doc.filename, doc.content_type))
    } catch (e) {
      showError('Could not open the document', errorDetail(e) || undefined)
    } finally {
      setBusyId(null)
    }
  }

  const review = async (doc: DocumentInfo, status: 'verified' | 'pending') => {
    setBusyId(doc.id)
    try {
      onUpdated(await sponsorshipAdmin.reviewDocument(c.id, doc.id, status))
      showSuccess(status === 'verified' ? 'Document verified' : 'Back to “to verify”')
    } catch (e) {
      showError('Could not record the review', errorDetail(e) || undefined)
    } finally {
      setBusyId(null)
    }
  }

  const checklist = c.required_documents.map((t) => {
    const docs = c.documents.filter((d) => d.doc_type === t)
    const state = docs.some((d) => d.review_status === 'verified') ? 'verified'
      : docs.some((d) => d.review_status === 'pending') ? 'pending'
        : docs.length ? 'rejected' : 'missing'
    return { type: t, state }
  })
  const CHECK_LABEL: Record<string, [string, StatusTone]> = {
    verified: ['Verified', 'success'], pending: ['Received, to verify', 'warning'],
    rejected: ['Refused, waiting for a new one', 'danger'], missing: ['Missing', 'danger'],
  }

  return (
    <div className="space-y-4">
      <Panel title="Required documents">
        <ul className="space-y-1.5">
          {checklist.map((r) => (
            <li key={r.type} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-gray-900">{docLabel(r.type)}</span>
              <StatusBadge tone={CHECK_LABEL[r.state][1]}>{CHECK_LABEL[r.state][0]}</StatusBadge>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title={`Files (${c.documents.length})`} flush>
        {c.documents.length === 0 ? (
          <div className="p-4"><EmptyState icon={FileText} title="No documents yet" body="The applicant can send them from their space, or you can add one below." /></div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {c.documents.map((d) => (
              <li key={d.id} className="px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 flex flex-wrap items-center gap-2">
                    {docLabel(d.doc_type)}
                    <StatusBadge tone={REVIEW_TONE[d.review_status]}>{REVIEW_LABEL[d.review_status]}</StatusBadge>
                  </p>
                  <p className="text-xs text-gray-500 truncate" title={d.filename}>
                    {d.filename} · {fmtBytes(d.size_bytes)} · {fmtDate(d.uploaded_at)} · by {d.uploaded_by === 'staff' ? (d.uploaded_by_email || 'staff') : 'applicant'}
                  </p>
                  {d.review_status === 'rejected' && d.review_note && (
                    <p className="text-xs text-red-700 mt-0.5">Refused: {d.review_note}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="btn-secondary btn-sm gap-1" onClick={() => view(d)} disabled={busyId === d.id}>
                    <Eye className="w-4 h-4" aria-hidden="true" /> View
                  </button>
                  {d.review_status !== 'verified' && (
                    <button type="button" className="btn-primary btn-sm gap-1" onClick={() => review(d, 'verified')} disabled={busyId === d.id}>
                      <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Verify
                    </button>
                  )}
                  {d.review_status !== 'rejected' && (
                    <button type="button" className="btn-ghost btn-sm gap-1 text-red-700" onClick={() => setRefusing(d)} disabled={busyId === d.id}>
                      <XCircle className="w-4 h-4" aria-hidden="true" /> Refuse
                    </button>
                  )}
                  {d.review_status !== 'pending' && (
                    <button type="button" className="btn-ghost btn-sm gap-1" onClick={() => review(d, 'pending')} disabled={busyId === d.id}>
                      <RotateCcw className="w-4 h-4" aria-hidden="true" /> Undo
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <StaffUpload caseId={c.id} onUpdated={onUpdated} />

      {preview && <FilePreview file={preview} onClose={() => setPreview(null)} />}
      {refusing && (
        <RefuseDialog caseId={c.id} doc={refusing} onClose={() => setRefusing(null)}
          onDone={(u) => { onUpdated(u); setRefusing(null); showSuccess('Document refused', 'The applicant is emailed the reason.') }} />
      )}
    </div>
  )
}

const RefuseDialog = ({ caseId, doc, onClose, onDone }: {
  caseId: number
  doc: DocumentInfo
  onClose: () => void
  onDone: (u: Awaited<ReturnType<typeof sponsorshipAdmin.reviewDocument>>) => void
}) => {
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const missing = !reason.trim()

  const submit = async () => {
    setTouched(true)
    if (missing) return
    setBusy(true)
    setError(null)
    try {
      onDone(await sponsorshipAdmin.reviewDocument(caseId, doc.id, 'rejected', reason.trim()))
    } catch (e) {
      setError(errorDetail(e) || 'Could not refuse the document.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`Refuse “${docLabel(doc.doc_type)}”`} size="sm" onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn-danger btn-sm" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Refuse document'}</button>
        </>
      }>
      <div className="space-y-3">
        <p className="text-sm text-gray-700">The applicant is emailed this reason and asked for another document.</p>
        {error && <div role="alert" className="alert-error">{error}</div>}
        <div>
          <label htmlFor="refuse-reason" className="label">Reason (required)</label>
          <textarea id="refuse-reason" className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
            maxLength={2000} aria-invalid={touched && missing} placeholder="e.g. The photo is blurred: the dates cannot be read." />
          {touched && missing && <p className="field-error">Say why: the applicant needs to know what to send instead.</p>}
        </div>
      </div>
    </Modal>
  )
}

const StaffUpload = ({ caseId, onUpdated }: { caseId: number; onUpdated: CaseTabProps['onUpdated'] }) => {
  const { showError, showSuccess } = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [docType, setDocType] = useState<DocType>('other')
  const [busy, setBusy] = useState(false)

  const upload = async () => {
    if (!file) return
    setBusy(true)
    try {
      const res = await sponsorshipAdmin.uploadDocuments(caseId, [{ file, docType }])
      onUpdated(res.case)
      setFile(null)
      if (input.current) input.current.value = ''
      if (res.stored) showSuccess('Document added')
      else showError('The file was not accepted', 'Use a PDF or an image under 15 MB.')
    } catch (e) {
      showError('Could not upload', errorDetail(e) || undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="Add a document received another way">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_14rem_auto] gap-3 items-end">
        <div>
          <label htmlFor="staff-doc-file" className="label">File</label>
          <input id="staff-doc-file" ref={input} type="file" accept="application/pdf,image/*"
            className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-medium"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        <div>
          <label htmlFor="staff-doc-type" className="label">Document type</label>
          <select id="staff-doc-type" className="input" value={docType} onChange={(e) => setDocType(e.target.value as DocType)}>
            {DOC_TYPES.map((t) => <option key={t} value={t}>{docLabel(t)}</option>)}
          </select>
        </div>
        <button type="button" className="btn-secondary btn-sm gap-1" onClick={upload} disabled={!file || busy}>
          <Upload className="w-4 h-4" aria-hidden="true" /> {busy ? 'Uploading…' : 'Upload'}
        </button>
      </div>
      <p className="help-text">For a paper copy, a WhatsApp photo or a document collected on a visit. It still needs verifying.</p>
    </Panel>
  )
}

export default DocumentsTab
