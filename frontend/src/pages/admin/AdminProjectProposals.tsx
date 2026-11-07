/**
 * Admin review of incoming project proposals.
 *
 * List with status filter → detail modal showing every field in the same
 * order as the PDF → walk the dossier's version history, change status,
 * write the applicant's message and the internal note, download PDFs, delete.
 */
import { useEffect, useState } from 'react'
import {
  FolderKanban, Download, Trash2, Eye, RefreshCw, Filter, X, AlertTriangle,
  CheckCircle2, XCircle, Search, FileText, Bell,
  Banknote, Paperclip, ClipboardCheck, Hourglass, Ban, ArrowRight, Mail, ExternalLink,
} from 'lucide-react'
import { PORTAL_HANDOFF_PREFIX } from '../../utils/proposalPortalApi'
import { clsx } from 'clsx'
import { useAuthStore } from '../../store/authStore'
import { useToast } from '../../contexts/ToastContext'

interface ProposalVersionSummary {
  id: number
  version_no: number
  submitted_at: string
  submitted_ip: string | null
  /** The admin who filed this from the portal for the team; null if the team did. */
  submitted_by_staff?: string | null
  decision: string | null
  decision_comment: string | null
  internal_note: string | null
  decided_at: string | null
  decided_by: number | null
}

/**
 * A dossier as the admin API returns it.
 *
 * Every field below the dossier's own identity comes from the CURRENT VERSION's
 * content, and the backend's `serialize_for_admin` deliberately returns all of
 * them as null when a dossier has no version yet. That is why they are nullable
 * here: the type is the contract, and the page has to render it.
 */
interface Proposal {
  id: number
  full_name: string | null
  national_id: string | null
  date_of_birth_year: number | null
  place_of_residence: string | null
  mobile_number: string | null
  email: string
  educational_level: string | null
  project_name: string | null
  project_description: string | null
  problem_solved: string | null
  target_beneficiaries: string | null
  community_impact: string | null
  expected_impact: string | null
  implementation_steps: string | null
  implementation_location: string | null
  required_materials: string | null
  expected_duration: string | null
  continuity_plan: string | null
  feasibility: string | null
  expected_challenges: string | null
  number_of_beneficiaries: number | null
  cost_per_unit_usd: number | null
  unit_type: string | null
  additional_expenses_usd: number | null
  additional_expenses_description: string | null
  total_amount_usd: number | null
  status: string
  decision_comment: string | null
  internal_note: string | null
  version_count: number
  current_version_no: number | null
  versions: ProposalVersionSummary[]
  /** Nobody has opened the dossier since its latest submission. */
  is_unread: boolean
  has_report: boolean
  awaiting_report_review: boolean
  report_unread: boolean
  /** More than one version exists, so an unread row is a CHANGE, not a new arrival. */
  is_revision: boolean
  reviewed_at: string | null
  reviewed_by: number | null
  submitted_ip: string | null
  submitted_at: string
  updated_at: string
}

const STATUS_BADGE: Record<string, string> = {
  submitted:                'bg-blue-100 text-blue-800',
  under_review:             'bg-amber-100 text-amber-800',
  changes_requested:        'bg-orange-100 text-orange-900',
  approved:                 'bg-green-100 text-green-800',
  rejected:                 'bg-red-100 text-red-800',
  funded:                   'bg-emerald-100 text-emerald-800',
  report_submitted:         'bg-indigo-100 text-indigo-800',
  report_changes_requested: 'bg-orange-100 text-orange-900',
  completed:                'bg-slate-200 text-slate-800',
}
const STATUS_LABEL: Record<string, string> = {
  funded: 'Funded',
  report_submitted: 'Report filed',
  report_changes_requested: 'Report sent back',
  completed: 'Completed',
  submitted: 'Submitted',
  under_review: 'Under review',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  rejected: 'Rejected',
}

/**
 * The lifecycle, declared once.
 *
 * The drawer used to show nine always-open sections and five status buttons at
 * all times, which left the reviewer to work out for themselves where a dossier
 * stood and what to do with it. Everything below exists so the UI can answer
 * those two questions outright: a stepper that shows the position, and a single
 * panel that shows the one action the position allows.
 */
const LIFECYCLE = [
  { key: 'received', label: 'Received' },
  { key: 'review', label: 'Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'funded', label: 'Funded' },
  { key: 'report', label: 'Report' },
  { key: 'completed', label: 'Completed' },
] as const

/**
 * Where each status sits on that line, and whether it is stalled there.
 *
 * The branches are not extra steps. `changes_requested` is the Review step
 * waiting on the applicant; `report_changes_requested` is the Report step
 * waiting on the team; `rejected` is the Review step, stopped. Modelling them
 * as positions-with-a-state keeps the stepper a straight line, which is the
 * only reason it reads at a glance.
 */
const STATUS_STEP: Record<string, { index: number; waitingOn?: string; stopped?: boolean }> = {
  submitted:                { index: 0 },
  under_review:             { index: 1 },
  changes_requested:        { index: 1, waitingOn: 'the applicant' },
  rejected:                 { index: 1, stopped: true },
  approved:                 { index: 2 },
  funded:                   { index: 3, waitingOn: 'the team' },
  report_submitted:         { index: 4 },
  report_changes_requested: { index: 4, waitingOn: 'the team' },
  completed:                { index: 5 },
}

/** What the reviewer should do next, per status. One sentence, no jargon. */
const NEXT_STEP: Record<string, { title: string; body: string; waiting?: boolean }> = {
  submitted: {
    title: 'A new application to review',
    body: 'Read the dossier, then approve it, ask for changes, or decline it.',
  },
  under_review: {
    title: 'Your decision',
    body: 'Approve this application, ask the applicant for changes, or decline it.',
  },
  changes_requested: {
    title: 'Waiting on the applicant',
    body: 'They have been emailed what to change. The dossier comes back here when they resubmit.',
    waiting: true,
  },
  rejected: {
    title: 'Declined',
    body: 'The applicant has been told. You can reopen it for a second look if that was wrong.',
    waiting: true,
  },
  approved: {
    title: 'Prepare the agreement, then release the funds',
    body: 'Fill in the funding agreement and send it to be signed. Mark the project funded once the money has actually left.',
  },
  funded: {
    title: 'Waiting on the team',
    body: 'They are implementing the project, and owe a completion report. They cannot apply for anything else until it is accepted.',
    waiting: true,
  },
  report_submitted: {
    title: 'A completion report to review',
    body: 'Read what they sent and the files attached, then accept it to close the project, or send it back saying what is missing.',
  },
  report_changes_requested: {
    title: 'Waiting on the team',
    body: 'They have been emailed what is still needed, and will submit a corrected report.',
    waiting: true,
  },
  completed: {
    title: 'Closed',
    body: 'The report was accepted. The team is free to apply for a new project.',
    waiting: true,
  },
}

/**
 * The lifecycle as a single line of dots.
 *
 * Deliberately not colour-only: the current step carries its label in bold and
 * the stalled state is spelled out underneath, so the position is readable
 * without distinguishing green from grey.
 */
const Lifecycle = ({ status }: { status: string }) => {
  const here = STATUS_STEP[status] ?? { index: 0 }
  return (
    <div>
      <ol className="flex items-center gap-1 overflow-x-auto pb-1">
        {LIFECYCLE.map((step, i) => {
          const done = i < here.index
          const current = i === here.index
          const stopped = current && here.stopped
          return (
            <li key={step.key} className="flex items-center gap-1 shrink-0">
              <span
                className={clsx(
                  'w-2.5 h-2.5 rounded-full shrink-0',
                  stopped ? 'bg-red-500'
                    : current ? 'bg-primary-600 ring-2 ring-primary-200'
                    : done ? 'bg-primary-400' : 'bg-gray-300',
                )}
                aria-hidden
              />
              <span className={clsx(
                'text-xs whitespace-nowrap',
                current ? 'font-bold text-gray-900' : done ? 'text-gray-600' : 'text-gray-400',
              )}>
                {step.label}
              </span>
              {i < LIFECYCLE.length - 1 && (
                <span className={clsx('w-5 h-px mx-1 shrink-0', done ? 'bg-primary-300' : 'bg-gray-200')} aria-hidden />
              )}
            </li>
          )
        })}
      </ol>
      {here.waitingOn && (
        <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
          <Hourglass className="w-3 h-3" /> Waiting on {here.waitingOn}
        </p>
      )}
      {here.stopped && (
        <p className="text-xs text-red-700 mt-1 flex items-center gap-1">
          <Ban className="w-3 h-3" /> Stopped here
        </p>
      )}
    </div>
  )
}

/**
 * The single thing a row is waiting on, or null.
 *
 * A row could previously carry five marks at once — unread dot, New/Modified,
 * version count, "Report to review", and the status badge — which between them
 * said less than one clear sentence. The status badge keeps saying WHERE the
 * dossier is; this says only whether it needs YOU, and the detail stays in the
 * drawer.
 *
 * Ordered by urgency: a dossier that is both unread and owes a report review is
 * reported as the report, because that is the action with money already spent
 * behind it.
 */
const attentionFor = (r: { is_unread: boolean; is_revision: boolean; awaiting_report_review: boolean; report_unread: boolean }):
  { label: string; tone: string } | null => {
  if (r.awaiting_report_review) return { label: 'Review report', tone: 'bg-indigo-100 text-indigo-800' }
  if (r.is_unread && r.is_revision) return { label: 'Changed — reread', tone: 'bg-amber-100 text-amber-800' }
  if (r.is_unread) return { label: 'New', tone: 'bg-blue-100 text-blue-800' }
  return null
}

// Statuses the applicant must be given a reason for — the backend enforces
// this too (400 without a comment); mirroring it here keeps the reviewer from
// losing a click.
const COMMENT_REQUIRED = new Set(['rejected', 'changes_requested'])
interface ReportAttachment {
  id: number
  filename: string
  content_type: string
  kind: 'image' | 'video' | 'document'
  size_bytes: number
}

/** One submission of a completion report, staff shape. */
interface CompletionReport {
  id: number
  report_no: number
  narrative: string
  submitted_at: string
  decision: 'approved' | 'changes_requested' | null
  decision_comment: string | null
  decided_at: string | null
  internal_note: string | null
  submitted_ip: string | null
  /** The admin who filed this from the portal for the team; null if the team did. */
  submitted_by_staff?: string | null
  attachments: ReportAttachment[]
}

/** The funding agreement issued after approval. Mirrors the backend payload. */
interface Agreement {
  project_title: string
  location: string
  field_representative: string
  approved_funding_usd: number | string
  target_count: number | string
  target_label: string
  distribution_per_beneficiary: string
  total_planned_distribution: string
  extra_fund_uses: string
  issued_at?: string | null
}

const EMPTY_AGREEMENT: Agreement = {
  project_title: '', location: '', field_representative: '',
  approved_funding_usd: '', target_count: '', target_label: '',
  distribution_per_beneficiary: '', total_planned_distribution: '',
  extra_fund_uses: '',
}

// Statuses that decide the current version, and so email the applicant.
const DECISION_STATUSES = new Set(['approved', 'rejected', 'changes_requested'])

/** Every status from approval on carries the agreement. Only `approved` may
 *  still change it: once funded, the money left under those terms, and the
 *  server refuses edits (proposal_service.save_agreement). */
const AGREEMENT_STATUSES = new Set(['approved', 'funded', 'report_submitted', 'report_changes_requested', 'completed'])

/** The email "Resend" sends for each status. Mirrors _NOTIFICATION_FOR_STATUS
 *  in routers/project_proposals.py, which is what actually decides. */
const NOTIFICATION_LABEL: Record<string, string> = {
  submitted: 'Submission received',
  under_review: 'Submission received',
  changes_requested: 'Changes requested',
  rejected: 'Decision: not funded',
  approved: 'Approved',
  funded: 'Funded: how to send the report',
  report_submitted: 'Report received',
  report_changes_requested: 'Report needs more detail',
  completed: 'Project closed',
}

interface SentEmail {
  id: number
  template: string
  subject: string
  status: string
  error: string | null
  resent: boolean
  created_at: string
  sent_at: string | null
}

const EMAIL_STATUS: Record<string, { label: string; className: string }> = {
  sent: { label: 'Sent', className: 'bg-green-100 text-green-800' },
  pending: { label: 'Queued', className: 'bg-gray-100 text-gray-700' },
  sending: { label: 'Sending', className: 'bg-gray-100 text-gray-700' },
  failed: { label: 'Failed', className: 'bg-red-100 text-red-800' },
  suppressed: { label: 'Blocked', className: 'bg-amber-100 text-amber-900' },
}

const AdminProjectProposals = () => {
  const [rows, setRows] = useState<Proposal[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Proposal | null>(null)
  const [deleting, setDeleting] = useState<Proposal | null>(null)
  const [commentDraft, setCommentDraft] = useState('')
  const [noteDraft, setNoteDraft] = useState('')
  const [openVersion, setOpenVersion] = useState<number | null>(null)
  const [versionDetail, setVersionDetail] = useState<Record<string, any> | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [agreement, setAgreement] = useState<Agreement | null>(null)
  const [agreementExists, setAgreementExists] = useState(false)
  const [versionDrifted, setVersionDrifted] = useState(false)
  const [agreementBusy, setAgreementBusy] = useState(false)
  const [reports, setReports] = useState<CompletionReport[] | null>(null)
  const [reportComment, setReportComment] = useState('')
  const [reportNote, setReportNote] = useState('')
  const [reportBusy, setReportBusy] = useState(false)
  const [sentEmails, setSentEmails] = useState<SentEmail[] | null>(null)
  const [resending, setResending] = useState(false)
  type DrawerTab = 'dossier' | 'report' | 'agreement' | 'history'
  const [tab, setTab] = useState<DrawerTab>('dossier')
  // Past approval the funds left under these terms; the server refuses edits.
  const agreementLocked = !!selected && selected.status !== 'approved'

  const token = useAuthStore((s) => s.token)
  const { showSuccess, showError } = useToast()
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  const fetchRows = async () => {
    setLoading(true)
    try {
      const qs = statusFilter ? `?status_filter=${encodeURIComponent(statusFilter)}` : ''
      const resp = await fetch(`${API_URL}/api/project-proposals/${qs}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!resp.ok) throw new Error('fetch failed')
      const data = await resp.json()
      setRows(data.items || [])
      setTotal(data.total || 0)
    } catch { showError('Error', 'Failed to load proposals') }
    finally { setLoading(false) }
  }
  const fetchUnreadCount = async () => {
    try {
      const resp = await fetch(`${API_URL}/api/project-proposals/unread-count`, { headers: { Authorization: `Bearer ${token}` } })
      if (resp.ok) setUnreadCount((await resp.json()).count || 0)
    } catch { /* the badge is not worth a toast */ }
  }

  useEffect(() => { fetchRows() }, [statusFilter])  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fetchUnreadCount() }, [])       // eslint-disable-line react-hooks/exhaustive-deps

  const openDetail = (p: Proposal) => {
    setSelected(p)
    setCommentDraft(p.decision_comment || '')
    setNoteDraft(p.internal_note || '')
    // The latest version is what the reviewer came to read, so it opens
    // expanded; the older ones stay collapsed behind "View content".
    setOpenVersion(p.current_version_no)
    setVersionDetail(null)
    if (p.current_version_no != null) fetchVersion(p.id, p.current_version_no)
    setTab('dossier')
    markSeen(p)
    loadAgreement(p)
    loadReports(p)
    loadSentEmails(p)
  }
  const closeDetail = () => {
    setSelected(null)
    setCommentDraft('')
    setNoteDraft('')
    setOpenVersion(null)
    setVersionDetail(null)
    setAgreement(null)
    setAgreementExists(false)
    setVersionDrifted(false)
    setReports(null)
    setReportComment('')
    setReportNote('')
    setSentEmails(null)
  }

  /** What the applicant has actually been sent, and whether it arrived. Read
   *  before resending: a blocked address will not be fixed by trying again. */
  const loadSentEmails = async (p: Proposal) => {
    setSentEmails(null)
    try {
      const resp = await fetch(`${API_URL}/api/project-proposals/${p.id}/notifications`, { headers: { Authorization: `Bearer ${token}` } })
      if (!resp.ok) throw new Error('fetch failed')
      setSentEmails((await resp.json()).items || [])
    } catch { setSentEmails([]) }
  }

  /**
   * Open the submitter portal as this dossier's applicant, in a new tab, to
   * act for a team that cannot sign in. The tab is opened before the request,
   * synchronously with the click, because a window opened after an await is
   * treated as a pop-up and blocked.
   */
  const openPortalAsApplicant = async () => {
    if (!selected) return
    const tab = window.open('', '_blank')
    try {
      const resp = await fetch(`${API_URL}/api/project-proposals/${selected.id}/portal-session`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      })
      const body = await resp.json().catch(() => ({}))
      if (!resp.ok || !body.token) throw new Error(typeof body.detail === 'string' ? body.detail : 'Could not open the portal.')
      // The token rides in the fragment: never sent to a server, so never in a log.
      const url = `${window.location.origin}/my-proposals?proposal=${selected.id}${PORTAL_HANDOFF_PREFIX}${encodeURIComponent(body.token)}`
      if (tab) {
        tab.opener = null
        tab.location.href = url
      } else {
        showError('Pop-up blocked', 'Allow pop-ups for this site, then try again.')
      }
    } catch (err) {
      tab?.close()
      showError('Error', err instanceof Error ? err.message : 'Could not open the portal.')
    }
  }

  const resendNotification = async () => {
    if (!selected) return
    const label = NOTIFICATION_LABEL[selected.status]
    if (!label) return
    if (!window.confirm(`Send ${selected.email} the "${label}" email again?`)) return
    setResending(true)
    try {
      const resp = await fetch(`${API_URL}/api/project-proposals/${selected.id}/resend-notification`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      })
      const body = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'The email could not be sent.')
      showSuccess('Email queued', `"${body.notification}" is on its way to ${body.to}.`)
      loadSentEmails(selected)
    } catch (err) {
      showError('Not sent', err instanceof Error ? err.message : 'The email could not be sent.')
    } finally {
      setResending(false)
    }
  }

  /**
   * Record that this dossier's current version has been read, and clear its
   * marker locally rather than refetching the whole list — the row the
   * reviewer just clicked should stop shouting immediately.
   */
  const markSeen = async (p: Proposal) => {
    if (!p.is_unread) return
    try {
      const resp = await fetch(`${API_URL}/api/project-proposals/${p.id}/seen`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) return
      const body = await resp.json()
      setUnreadCount(body.unread_count ?? 0)
      setRows((prev) => prev.map((r) => (r.id === p.id ? { ...r, is_unread: false } : r)))
      setSelected((prev) => (prev && prev.id === p.id ? { ...prev, is_unread: false } : prev))
    } catch { /* a failed mark-seen must never block the drawer */ }
  }

  /** The whole completion-report history for the open dossier. */
  const loadReports = async (p: Proposal) => {
    setReports(null)
    if (!p.has_report) { setReports([]); return }
    try {
      const resp = await fetch(`${API_URL}/api/project-proposals/${p.id}/reports`, { headers: { Authorization: `Bearer ${token}` } })
      if (!resp.ok) { setReports([]); return }
      const body = await resp.json()
      setReports(body.reports || [])
      // Pre-fill from the current report so a note saved earlier is not lost
      // by reopening the drawer.
      const current = (body.reports || []).slice(-1)[0]
      setReportComment(current?.decision_comment || '')
      setReportNote(current?.internal_note || '')
    } catch { showError('Error', 'Could not load the completion report') }
  }

  const markFunded = async () => {
    if (!selected) return
    setReportBusy(true)
    try {
      const resp = await fetch(`${API_URL}/api/project-proposals/${selected.id}/funded`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) {
        const body = await resp.json().catch(() => null)
        showError('Error', body?.detail || 'Could not mark this project funded')
        return
      }
      const updated = await resp.json()
      setSelected(updated)
      showSuccess('Funded', 'The team has been emailed, including the reporting requirement.')
      fetchRows()
      fetchUnreadCount()
    } catch { showError('Error', 'Network error') }
    finally { setReportBusy(false) }
  }

  const decideReport = async (decision: 'approved' | 'changes_requested') => {
    if (!selected) return
    if (decision === 'changes_requested' && !reportComment.trim()) {
      showError('A message is required',
        'Tell the team what is missing — it goes out in the email and is the only thing they can act on.')
      return
    }
    setReportBusy(true)
    try {
      const resp = await fetch(`${API_URL}/api/project-proposals/${selected.id}/report-decision`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          decision_comment: reportComment.trim() || null,
          internal_note: reportNote.trim() || null,
        }),
      })
      if (!resp.ok) {
        const body = await resp.json().catch(() => null)
        showError('Error', body?.detail || 'Could not record the decision')
        return
      }
      const updated = await resp.json()
      setSelected(updated)
      await loadReports(updated)
      showSuccess(
        decision === 'approved' ? 'Project closed' : 'Report sent back',
        decision === 'approved'
          ? 'The team has been emailed and may now apply for a new project.'
          : 'The team has been emailed with what is still needed.',
      )
      fetchRows()
      fetchUnreadCount()
    } catch { showError('Error', 'Network error') }
    finally { setReportBusy(false) }
  }

  const reportAttachmentHref = (reportId: number, attachmentId: number) =>
    `${API_URL}/api/project-proposals/${selected?.id}/reports/${reportId}/attachments/${attachmentId}`

  /** Load the saved agreement, or the pre-filled draft when none exists yet. */
  const loadAgreement = async (p: Proposal) => {
    setAgreement(null)
    setAgreementExists(false)
    setVersionDrifted(false)
    // Not only `approved`: from funding on, the tab used to sit on "Loading…"
    // for good, and the contract could no longer be downloaded at all.
    if (!AGREEMENT_STATUSES.has(p.status)) return
    try {
      const resp = await fetch(`${API_URL}/api/project-proposals/${p.id}/agreement`, { headers: { Authorization: `Bearer ${token}` } })
      if (!resp.ok) return
      const body = await resp.json()
      setAgreement({ ...EMPTY_AGREEMENT, ...(body.agreement || {}) })
      setAgreementExists(!!body.exists)
      setVersionDrifted(!!body.version_drifted)
    } catch { showError('Error', 'Could not load the funding agreement') }
  }

  const setAgreementField = (field: keyof Agreement, value: string) =>
    setAgreement((prev) => (prev ? { ...prev, [field]: value } : prev))

  const saveAgreement = async (): Promise<boolean> => {
    if (!selected || !agreement) return false
    setAgreementBusy(true)
    try {
      const resp = await fetch(`${API_URL}/api/project-proposals/${selected.id}/agreement`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...agreement,
          approved_funding_usd: Number(agreement.approved_funding_usd) || 0,
          target_count: Number(agreement.target_count) || 1,
        }),
      })
      if (!resp.ok) {
        const body = await resp.json().catch(() => null)
        showError('Could not save', body?.detail || 'The agreement was not saved.')
        return false
      }
      const body = await resp.json()
      setAgreement({ ...EMPTY_AGREEMENT, ...(body.agreement || {}) })
      setAgreementExists(true)
      setVersionDrifted(!!body.version_drifted)
      showSuccess('Saved', 'Funding agreement saved.')
      return true
    } catch {
      showError('Error', 'Network error')
      return false
    } finally { setAgreementBusy(false) }
  }

  /**
   * Always save before rendering. The PDF is generated from the stored row, so
   * downloading without saving would hand over a document that does not match
   * what is on screen.
   */
  const downloadAgreementPdf = async () => {
    if (!selected) return
    // A locked agreement is downloaded as stored. Saving first, as the
    // editable one must, is refused by the server after approval, and that
    // refusal used to cancel the download.
    if (selected.status === 'approved' && !(await saveAgreement())) return
    setAgreementBusy(true)
    try {
      const resp = await fetch(`${API_URL}/api/project-proposals/${selected.id}/agreement/pdf`, { headers: { Authorization: `Bearer ${token}` } })
      if (!resp.ok) {
        const body = await resp.json().catch(() => null)
        showError('Error', body?.detail || 'Could not generate the agreement')
        return
      }
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `agreement-project-${selected.id}.pdf`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
      loadAgreement(selected)   // pick up issued_at
    } catch { showError('Error', 'Could not download the agreement') }
    finally { setAgreementBusy(false) }
  }

  /**
   * The single write path: the same endpoint serves a decision and a
   * notes-only save. The backend emails the applicant only when the status
   * actually changes, so re-sending the current status saves both comments
   * without notifying anyone.
   */
  const patchStatus = async (nextStatus: string, successMessage: string) => {
    if (!selected) return
    if (COMMENT_REQUIRED.has(nextStatus) && !commentDraft.trim()) {
      showError('A message is required', 'Tell the applicant why — it goes out in the email.')
      return
    }
    try {
      const resp = await fetch(`${API_URL}/api/project-proposals/${selected.id}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: nextStatus,
          decision_comment: commentDraft.trim() || null,
          internal_note: noteDraft.trim() || null,
        }),
      })
      if (resp.ok) {
        const updated = await resp.json()
        setSelected(updated)
        setCommentDraft(updated.decision_comment || '')
        setNoteDraft(updated.internal_note || '')
        showSuccess('Updated', successMessage)
        fetchRows()
      } else {
        const body = await resp.json().catch(() => null)
        showError('Error', body?.detail || 'Failed to update status')
      }
    } catch { showError('Error', 'Network error') }
  }

  const changeStatus = (nextStatus: string) => {
    const label = STATUS_LABEL[nextStatus] || nextStatus
    const notifies = DECISION_STATUSES.has(nextStatus) && nextStatus !== selected?.status
    patchStatus(nextStatus, notifies ? `Marked as ${label} — the applicant has been emailed.` : `Marked as ${label}`)
  }

  const saveNotes = () => {
    if (!selected) return
    patchStatus(selected.status, 'Notes saved')
  }

  /** Fetch one version's content. Separate from the toggle below so opening
   *  the drawer can load the latest version without closing it again. */
  const fetchVersion = async (proposalId: number, versionNo: number) => {
    try {
      const resp = await fetch(`${API_URL}/api/project-proposals/${proposalId}/versions/${versionNo}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!resp.ok) throw new Error('fetch failed')
      setVersionDetail(await resp.json())
    } catch {
      setOpenVersion(null)
      showError('Error', 'Could not load that version')
    }
  }

  const loadVersion = async (versionNo: number) => {
    if (!selected) return
    if (openVersion === versionNo) { setOpenVersion(null); setVersionDetail(null); return }
    setOpenVersion(versionNo)
    setVersionDetail(null)
    fetchVersion(selected.id, versionNo)
  }

  const downloadPdf = async (p: Proposal) => {
    try {
      const resp = await fetch(`${API_URL}/api/project-proposals/${p.id}/pdf`, { headers: { Authorization: `Bearer ${token}` } })
      if (!resp.ok) throw new Error('PDF fetch failed')
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `proposal-${p.id}-${(p.project_name || 'untitled').replace(/[^a-z0-9]+/gi, '-').slice(0, 40).toLowerCase()}.pdf`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch { showError('Error', 'Could not download PDF') }
  }

  const downloadVersionPdf = async (p: Proposal, versionNo: number) => {
    try {
      const resp = await fetch(`${API_URL}/api/project-proposals/${p.id}/versions/${versionNo}/pdf`, { headers: { Authorization: `Bearer ${token}` } })
      if (!resp.ok) throw new Error('PDF fetch failed')
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `proposal-${p.id}-v${versionNo}.pdf`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch { showError('Error', 'Could not download PDF') }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      const resp = await fetch(`${API_URL}/api/project-proposals/${deleting.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      if (resp.ok) { showSuccess('Deleted', 'Proposal removed'); setDeleting(null); fetchRows() }
      else showError('Error', 'Failed to delete')
    } catch { showError('Error', 'Network error') }
  }

  const filtered = rows.filter((r) => {
    if (!search.trim()) return true
    const s = search.toLowerCase()
    return (r.project_name || '').toLowerCase().includes(s)
      || (r.full_name || '').toLowerCase().includes(s)
      || r.email.toLowerCase().includes(s)
  })

  const formatDate = (iso: string | null) => iso ? new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
  /**
   * The null check is load-bearing — do not simplify it away.
   *
   * `serialize_for_admin` returns every content field as null for a dossier
   * that has no version yet (the migration-32 deployment window, and any
   * dossier awaiting backfill). Calling .toLocaleString() straight on that null
   * threw inside render and took the whole admin console down with an error
   * boundary. An absent amount is an em dash, like every other absent field.
   */
  const formatMoney = (n: number | null | undefined, maximumFractionDigits = 0) =>
    n == null ? '—' : `$${n.toLocaleString(undefined, { maximumFractionDigits })}`

  return (
    <div className="space-y-6 px-4 sm:px-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center">
          <FolderKanban className="w-6 h-6 sm:w-8 sm:h-8 mr-2 sm:mr-3 text-primary-600" />
          Project Proposals
          <span className="ml-3 text-sm bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{total}</span>
          {/* Icon + number + the word "to review": never a bare coloured
              count, which says nothing to anyone who has not seen it before. */}
          {unreadCount > 0 && (
            <span
              className="ml-2 inline-flex items-center gap-1.5 text-sm font-semibold bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full"
              title="Proposals nobody has opened since their latest submission"
            >
              <Bell className="w-3.5 h-3.5" />
              {unreadCount} to review
            </span>
          )}
        </h1>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500">
            <option value="">All statuses</option>
            <option value="submitted">Submitted</option>
            <option value="under_review">Under review</option>
            <option value="changes_requested">Changes requested</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <button onClick={fetchRows} className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg" title="Refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <p className="text-sm text-gray-600">
        Funding requests submitted through the public <code>/submit-proposal</code> form. Click a row to review
        every section of the application, read its version history, change its status, or download the reconstructed PDF.
      </p>

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
        <div className="relative max-w-sm">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, project, or email…"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500" />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Project</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Applicant</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Attention</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">Submitted</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filtered.map((r) => (
                <tr key={r.id} className={r.is_unread ? 'bg-amber-50/60 hover:bg-amber-50' : 'hover:bg-gray-50'}>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex items-start gap-2">
                      {/* Colour never alone: the dot repeats what the badge in
                          the Attention column spells out in words. */}
                      {attentionFor(r) && (
                        <span className="mt-1.5 w-2 h-2 rounded-full bg-amber-500 shrink-0" aria-hidden />
                      )}
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900 max-w-[260px] truncate" title={r.project_name || undefined}>{r.project_name || '—'}</div>
                        {/* Version number inline, not a pill: it is reference
                            information, not something to act on. */}
                        <div className="text-xs text-gray-500">
                          Ref #{r.id}{r.version_count > 1 && ` · v${r.current_version_no}`}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 hidden md:table-cell">
                    <div>{r.full_name || '—'}</div>
                    <div className="text-xs text-gray-500 truncate max-w-[200px]" title={r.email}>{r.email}</div>
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-primary-700 text-right whitespace-nowrap">{formatMoney(r.total_amount_usd)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${STATUS_BADGE[r.status] || 'bg-gray-100'}`}>
                      {STATUS_LABEL[r.status] || r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {(() => {
                      const a = attentionFor(r)
                      return a
                        ? <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${a.tone}`}>{a.label}</span>
                        : <span className="text-xs text-gray-400">—</span>
                    })()}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600 hidden lg:table-cell whitespace-nowrap">{formatDate(r.submitted_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openDetail(r)} className="text-primary-600 hover:text-primary-800 p-1.5 rounded hover:bg-primary-50" title="Review"><Eye className="w-4 h-4" /></button>
                      <button onClick={() => downloadPdf(r)} className="text-indigo-600 hover:text-indigo-800 p-1.5 rounded hover:bg-indigo-50" title="Download PDF"><Download className="w-4 h-4" /></button>
                      <button onClick={() => setDeleting(r)} className="text-red-600 hover:text-red-800 p-1.5 rounded hover:bg-red-50" title="Delete"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-500">No proposals match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-gray-900 truncate">{selected.project_name || '—'}</h3>
                <p className="text-xs text-gray-500 truncate">Ref #{selected.id} · {selected.full_name || '—'} · <a href={`mailto:${selected.email}`} className="text-primary-600 hover:underline">{selected.email}</a></p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${STATUS_BADGE[selected.status]}`}>{STATUS_LABEL[selected.status]}</span>
                <button onClick={openPortalAsApplicant} title="See the portal as this applicant sees it, and act for them" className="text-xs inline-flex items-center gap-1 px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded"><ExternalLink className="w-3.5 h-3.5" /> Open portal as applicant</button>
                <button onClick={() => downloadPdf(selected)} className="text-xs inline-flex items-center gap-1 px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded"><Download className="w-3.5 h-3.5" /> PDF</button>
                <button onClick={closeDetail} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>
            </div>

            {/* Where the dossier stands, and the single action that stands
                open. Together these replace nine always-expanded sections and a
                permanent row of five status buttons. */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 space-y-3">
              <Lifecycle status={selected.status} />

              {(() => {
                const step = NEXT_STEP[selected.status]
                if (!step) return null
                return (
                  <div className={clsx(
                    'rounded-lg border p-3',
                    step.waiting ? 'border-gray-200 bg-white' : 'border-primary-200 bg-primary-50',
                  )}>
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                      {step.waiting ? 'Where it stands' : 'Next step'}
                    </p>
                    <p className="text-sm font-semibold text-gray-900 mt-1">{step.title}</p>
                    <p className="text-sm text-gray-700 mt-0.5">{step.body}</p>

                    {/* Review verdicts. Shown only where a verdict is the next
                        move, so "Mark submitted" can no longer appear on a
                        closed dossier. */}
                    {['submitted', 'under_review'].includes(selected.status) && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        <button onClick={() => changeStatus('approved')} className="text-sm px-3 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded inline-flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Approve</button>
                        <button onClick={() => changeStatus('changes_requested')} className="text-sm px-3 py-2 bg-orange-100 hover:bg-orange-200 text-orange-900 font-semibold rounded inline-flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> Ask for changes</button>
                        <button onClick={() => changeStatus('rejected')} className="text-sm px-3 py-2 bg-white border border-red-200 hover:bg-red-50 text-red-800 font-semibold rounded inline-flex items-center gap-1.5"><XCircle className="w-4 h-4" /> Decline</button>
                        {selected.status === 'submitted' && (
                          <button onClick={() => changeStatus('under_review')} className="text-sm px-3 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded">Mark under review</button>
                        )}
                      </div>
                    )}

                    {/* Approved: the agreement, then the money. */}
                    {selected.status === 'approved' && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        <button onClick={() => setTab('agreement')} className="text-sm px-3 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 font-semibold rounded inline-flex items-center gap-1.5"><FileText className="w-4 h-4" /> Funding agreement <ArrowRight className="w-3.5 h-3.5" /></button>
                        <button onClick={markFunded} disabled={reportBusy} className="text-sm px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded inline-flex items-center gap-1.5 disabled:opacity-50"><Banknote className="w-4 h-4" /> {reportBusy ? 'Working…' : 'Mark as funded'}</button>
                      </div>
                    )}

                    {/* A report is waiting: send them to it rather than make
                        them find it among the tabs. */}
                    {selected.status === 'report_submitted' && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        <button onClick={() => setTab('report')} className="text-sm px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded inline-flex items-center gap-1.5"><ClipboardCheck className="w-4 h-4" /> Read the report <ArrowRight className="w-3.5 h-3.5" /></button>
                      </div>
                    )}

                    {/* Reopening a dossier that was closed in error. */}
                    {['rejected', 'changes_requested'].includes(selected.status) && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        <button onClick={() => changeStatus('under_review')} className="text-sm px-3 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded inline-flex items-center gap-1.5"><RefreshCw className="w-3.5 h-3.5" /> Reopen for review</button>
                      </div>
                    )}

                    {/* For the team who lost the email, never got it, or cannot
                        find the portal. Says what was last sent first, so a
                        blocked address is seen before anyone clicks. */}
                    {NOTIFICATION_LABEL[selected.status] && (
                      <div className="mt-3 pt-3 border-t border-gray-200 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-gray-600 min-w-0" data-testid="last-email">
                          {(() => {
                            if (sentEmails === null) return 'Checking emails sent…'
                            const last = sentEmails.find((e) => e.template !== 'proposal_access_code')
                            if (!last) return 'No status email on record for this dossier.'
                            const state = EMAIL_STATUS[last.status]?.label || last.status
                            return `Last email: "${last.subject}", ${state.toLowerCase()} ${formatDate(last.sent_at || last.created_at)}.`
                          })()}
                        </p>
                        <button onClick={resendNotification} disabled={resending}
                          className="text-sm px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 rounded inline-flex items-center gap-1.5 disabled:opacity-50">
                          <Mail className="w-3.5 h-3.5" /> {resending ? 'Sending…' : `Resend "${NOTIFICATION_LABEL[selected.status]}"`}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>

            {/* Everything else, behind tabs. The agreement and report tabs only
                exist once they can hold anything. */}
            <div className="px-6 pt-3 border-b border-gray-200 flex gap-1 overflow-x-auto">
              {([
                ['dossier', 'Application', true],
                ['report', 'Report', selected.has_report || ['funded', 'report_submitted', 'report_changes_requested', 'completed'].includes(selected.status)],
                ['agreement', 'Agreement', ['approved', 'funded', 'report_submitted', 'report_changes_requested', 'completed'].includes(selected.status)],
                ['history', `History (${selected.version_count})`, true],
              ] as [DrawerTab, string, boolean][])
                .filter(([, , show]) => show)
                .map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    className={clsx(
                      'px-3 py-2 text-sm font-semibold rounded-t-lg border-b-2 whitespace-nowrap',
                      tab === key
                        ? 'border-primary-600 text-primary-700'
                        : 'border-transparent text-gray-500 hover:text-gray-800',
                    )}
                  >
                    {label}
                    {key === 'report' && selected.awaiting_report_review && (
                      <span className="ml-1.5 w-2 h-2 rounded-full bg-indigo-500 inline-block align-middle" aria-label="awaiting review" />
                    )}
                  </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto">
              {tab === 'dossier' && (<>
              {/* Section 1 */}
              <Section title="1. Personal information">
                <KV rows={[
                  ['Full name', selected.full_name],
                  ['National ID', selected.national_id],
                  ['Year of birth', selected.date_of_birth_year ? String(selected.date_of_birth_year) : null],
                  ['Residence', selected.place_of_residence],
                  ['Mobile', selected.mobile_number],
                  ['Email', selected.email],
                  ['Education', selected.educational_level],
                ]} />
              </Section>

              {/* Section 2 */}
              <Section title="2. Project information">
                <Paragraph label="Project name" text={selected.project_name} />
                <Paragraph label="Description" text={selected.project_description} />
                <Paragraph label="Problem solved" text={selected.problem_solved} />
                <Paragraph label="Target beneficiaries" text={selected.target_beneficiaries} />
                <Paragraph label="Community impact" text={selected.community_impact} />
                <Paragraph label="Expected impact" text={selected.expected_impact} />
              </Section>

              {/* Section 3 */}
              <Section title="3. Project plan">
                <Paragraph label="Implementation steps" text={selected.implementation_steps} bullets />
                <Paragraph label="Location" text={selected.implementation_location} />
                <Paragraph label="Required materials" text={selected.required_materials} bullets />
                <Paragraph label="Expected duration" text={selected.expected_duration} />
                <Paragraph label="Continuity plan" text={selected.continuity_plan} />
                <Paragraph label="Feasibility" text={selected.feasibility} />
                <Paragraph label="Expected challenges" text={selected.expected_challenges} bullets />
              </Section>

              {/* Section 4 */}
              <Section title="4. Required budget">
                <div className="bg-primary-50 border border-primary-200 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm text-primary-900">
                    <span>{selected.number_of_beneficiaries ?? '—'} {selected.unit_type || 'unit'}s × {formatMoney(selected.cost_per_unit_usd, 2)}</span>
                    <span className="font-semibold">
                      {formatMoney(
                        selected.number_of_beneficiaries != null && selected.cost_per_unit_usd != null
                          ? selected.number_of_beneficiaries * selected.cost_per_unit_usd
                          : null,
                        2,
                      )}
                    </span>
                  </div>
                  {(selected.additional_expenses_usd ?? 0) > 0 && (
                    <div className="flex justify-between text-sm text-primary-900">
                      <span>Additional {selected.additional_expenses_description ? `— ${selected.additional_expenses_description}` : ''}</span>
                      <span className="font-semibold">{formatMoney(selected.additional_expenses_usd, 2)}</span>
                    </div>
                  )}
                  <div className="border-t border-primary-300 pt-2 flex justify-between items-center">
                    <span className="text-primary-900 font-semibold">Total</span>
                    <span className="text-2xl font-bold text-primary-900">{formatMoney(selected.total_amount_usd, 2)} <span className="text-sm font-normal">USD</span></span>
                  </div>
                </div>
              </Section>

              {/* The applicant's own message and the staff note live with the
                  application, since that is what they are about. */}
              <Section title="Review notes">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Message to the applicant <span className="text-gray-400">— goes out in the email</span>
                  </label>
                  <textarea rows={3} value={commentDraft} onChange={(e) => setCommentDraft(e.target.value)}
                    placeholder="What the applicant will read — the reason for the decision, or what to change."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500" />
                  <p className="text-xs text-gray-500 mt-1">Required to decline or ask for changes.</p>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Internal note <span className="text-gray-400">— staff only, never sent</span>
                  </label>
                  <textarea rows={2} value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="Notes for admins and managers. The applicant never sees this."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500" />
                </div>
                <div className="flex items-center justify-between gap-2">
                  {selected.reviewed_at
                    ? <p className="text-xs text-gray-500">Last reviewed {formatDate(selected.reviewed_at)}</p>
                    : <span />}
                  <button onClick={saveNotes} className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded shrink-0">Save without notifying</button>
                </div>
              </Section>
              </>)}

              {tab === 'history' && (<>
              {/* Version history — the current version opens expanded (see
                  openDetail); older ones stay collapsed behind "View content". */}
              <Section title={`Version history (${selected.version_count})`}>
                {selected.version_count > 1 && (
                  <p className="text-xs text-gray-500 -mt-1">
                    The current version is shown in full below. Earlier versions are collapsed — open any of them to compare.
                  </p>
                )}
                {[...selected.versions].reverse().map((v) => (
                  <div key={v.id} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">Version {v.version_no}</span>
                      {v.version_no === selected.current_version_no && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary-100 text-primary-800">current</span>
                      )}
                      <span className="text-xs text-gray-500">{formatDate(v.submitted_at)}</span>
                      {v.submitted_by_staff && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-800">
                          Filed by {v.submitted_by_staff} for the applicant
                        </span>
                      )}
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${v.decision ? (STATUS_BADGE[v.decision] || 'bg-gray-100 text-gray-600') : 'bg-gray-100 text-gray-600'}`}>
                        {v.decision ? (STATUS_LABEL[v.decision] || v.decision) : 'Awaiting review'}
                      </span>
                      <div className="ml-auto flex items-center gap-2">
                        <button onClick={() => loadVersion(v.version_no)} className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded">
                          {openVersion === v.version_no ? 'Hide' : 'View content'}
                        </button>
                        <button onClick={() => downloadVersionPdf(selected, v.version_no)} className="text-xs inline-flex items-center gap-1 px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded"><Download className="w-3.5 h-3.5" /> PDF</button>
                      </div>
                    </div>

                    {v.decision_comment && (
                      <div className="mt-3">
                        <div className="text-xs text-gray-500 mb-1">Sent to the applicant{v.decided_at ? ` on ${formatDate(v.decided_at)}` : ''}</div>
                        <p className="text-sm text-gray-800 whitespace-pre-wrap">{v.decision_comment}</p>
                      </div>
                    )}
                    {v.internal_note && (
                      <div className="mt-3">
                        <div className="text-xs text-gray-500 mb-1">Internal note</div>
                        <p className="text-sm text-gray-800 whitespace-pre-wrap">{v.internal_note}</p>
                      </div>
                    )}

                    {openVersion === v.version_no && (
                      <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
                        {!versionDetail ? (
                          <p className="text-sm text-gray-500">Loading…</p>
                        ) : (
                          <>
                            <Paragraph label="Project name" text={versionDetail.project_name} />
                            <Paragraph label="Description" text={versionDetail.project_description} />
                            <Paragraph label="Problem solved" text={versionDetail.problem_solved} />
                            <Paragraph label="Target beneficiaries" text={versionDetail.target_beneficiaries} />
                            <Paragraph label="Community impact" text={versionDetail.community_impact} />
                            <Paragraph label="Expected impact" text={versionDetail.expected_impact} />
                            <Paragraph label="Implementation steps" text={versionDetail.implementation_steps} bullets />
                            <Paragraph label="Location" text={versionDetail.implementation_location} />
                            <Paragraph label="Required materials" text={versionDetail.required_materials} bullets />
                            <Paragraph label="Expected duration" text={versionDetail.expected_duration} />
                            <Paragraph label="Continuity plan" text={versionDetail.continuity_plan} />
                            <Paragraph label="Feasibility" text={versionDetail.feasibility} />
                            <Paragraph label="Expected challenges" text={versionDetail.expected_challenges} bullets />
                            <Paragraph label="Total" text={`$${Number(versionDetail.total_amount_usd || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} USD`} />
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </Section>

              <Section title="Emails sent to the applicant">
                {sentEmails === null ? (
                  <p className="text-sm text-gray-500">Loading…</p>
                ) : sentEmails.length === 0 ? (
                  <p className="text-sm text-gray-500">Nothing on record for {selected.email}.</p>
                ) : (
                  <ul className="divide-y divide-gray-100" data-testid="sent-emails">
                    {sentEmails.map((e) => {
                      const state = EMAIL_STATUS[e.status] || { label: e.status, className: 'bg-gray-100 text-gray-700' }
                      return (
                        <li key={e.id} className="py-2 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-gray-900">
                              {e.template === 'proposal_access_code' ? 'Sign-in code' : e.subject}
                            </span>
                            {e.resent && <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">resent</span>}
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${state.className}`}>{state.label}</span>
                            <span className="text-xs text-gray-500 ml-auto">{formatDate(e.sent_at || e.created_at)}</span>
                          </div>
                          {e.error && <p className="text-xs text-red-700 mt-0.5">{e.error}</p>}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </Section>

              </>)}

              {/* Disbursement moved into the Next step panel above — it is the
                  action an approved dossier is waiting for, so it belongs where
                  the reviewer is already looking rather than in a section of
                  its own further down. */}
              {false && (
                <Section title="Disbursement">
                  <p className="text-xs text-gray-500">
                    Mark this once the funds have actually been released. It emails the team —
                    and that email is what tells them a completion report is required before
                    they can apply again.
                  </p>
                  <button
                    onClick={markFunded}
                    disabled={reportBusy}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                  >
                    <Banknote className="w-4 h-4" />
                    {reportBusy ? 'Working…' : 'Mark as funded'}
                  </button>
                </Section>
              )}

              {/* Completion report */}
              {tab === 'report' && (
                <Section title="Completion report">
                  {selected.status === 'funded' && !selected.has_report && (
                    <p className="text-sm text-gray-500">
                      Waiting for the team to file their report. They cannot apply for another
                      project until it has been submitted and accepted.
                    </p>
                  )}

                  {reports === null && selected.has_report && (
                    <p className="text-sm text-gray-500">Loading…</p>
                  )}

                  {reports?.map((report) => (
                    <div key={report.id} className="border border-gray-200 rounded-lg p-3 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">
                          Report {report.report_no}
                        </span>
                        <span className="text-xs text-gray-500">{formatDate(report.submitted_at)}</span>
                        {report.submitted_by_staff && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-800">
                            Filed by {report.submitted_by_staff} for the team
                          </span>
                        )}
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${report.decision ? (STATUS_BADGE[report.decision] || 'bg-gray-100 text-gray-600') : 'bg-indigo-100 text-indigo-800'}`}>
                          {report.decision === 'approved' ? 'Accepted'
                            : report.decision === 'changes_requested' ? 'Sent back'
                            : 'Awaiting review'}
                        </span>
                      </div>

                      <p className="text-sm text-gray-800 whitespace-pre-wrap">{report.narrative}</p>

                      {report.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {report.attachments.map((a) => (
                            <a
                              key={a.id}
                              href={reportAttachmentHref(report.id, a.id)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 px-2 py-1 text-xs bg-gray-50 border border-gray-200 rounded hover:border-primary-300 text-gray-700"
                              title={`${a.content_type} · ${Math.round(a.size_bytes / 1024)} KB`}
                            >
                              <Paperclip className="w-3 h-3" />
                              {a.filename}
                            </a>
                          ))}
                        </div>
                      )}

                      {report.decision_comment && (
                        <div>
                          <div className="text-xs text-gray-500 mb-1">
                            Sent to the team{report.decided_at ? ` on ${formatDate(report.decided_at)}` : ''}
                          </div>
                          <p className="text-sm text-gray-800 whitespace-pre-wrap">{report.decision_comment}</p>
                        </div>
                      )}
                      {report.internal_note && (
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Internal note</div>
                          <p className="text-sm text-gray-800 whitespace-pre-wrap">{report.internal_note}</p>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* The verdict, only while one is actually awaiting review */}
                  {selected.awaiting_report_review && (
                    <div className="pt-2 border-t border-gray-100 space-y-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          Message to the team <span className="text-gray-400">— required when sending it back</span>
                        </label>
                        <textarea
                          rows={3}
                          value={reportComment}
                          onChange={(e) => setReportComment(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                          placeholder="Attach the purchase receipts and the beneficiary list."
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          Internal note <span className="text-gray-400">— staff only, never emailed</span>
                        </label>
                        <textarea
                          rows={2}
                          value={reportNote}
                          onChange={(e) => setReportNote(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => decideReport('approved')}
                          disabled={reportBusy}
                          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-4 h-4" /> Accept and close the project
                        </button>
                        <button
                          onClick={() => decideReport('changes_requested')}
                          disabled={reportBusy}
                          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-orange-100 hover:bg-orange-200 text-orange-900 disabled:opacity-50"
                        >
                          <AlertTriangle className="w-4 h-4" /> Send back for more detail
                        </button>
                      </div>
                      <p className="text-xs text-gray-500">
                        Accepting closes the project and releases the team to apply again.
                      </p>
                    </div>
                  )}
                </Section>
              )}

              {/* Funding agreement — the tab only exists from `approved`
                  onwards, and the backend refuses to save one before then
                  anyway: an agreement commits money. */}
              {tab === 'agreement' && (
                <Section title="Funding agreement">
                  {!agreement ? (
                    <p className="text-sm text-gray-500">Loading…</p>
                  ) : (
                    <>
                      {versionDrifted && (
                        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                          <p className="text-xs text-amber-900">
                            This agreement was drawn from an earlier version. The applicant has submitted a newer one since —
                            check the figures below still match what you approved.
                          </p>
                        </div>
                      )}
                      {selected.status !== 'approved' ? (
                        <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-2">
                          {agreementExists
                            ? <>The project is funded, so this agreement is locked: the funds were released under these terms.
                              {agreement.issued_at && <> First issued on {formatDate(agreement.issued_at)}.</>}</>
                            : <>No agreement was saved before this project was funded, so there is no contract on file to download.</>}
                        </p>
                      ) : agreement.issued_at ? (
                        <p className="text-xs text-gray-500">
                          Issued on {formatDate(agreement.issued_at)}. Re-generating produces an updated document.
                        </p>
                      ) : (
                        <p className="text-xs text-gray-500">
                          Pre-filled from the approved application. The two distribution lines cannot be derived from the
                          form — fill them in, as the agreement quotes them again in sections 3, 4 and 7.
                        </p>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Field disabled={agreementLocked} label="Project" value={agreement.project_title} onChange={(v) => setAgreementField('project_title', v)} />
                        <Field disabled={agreementLocked} label="Location" value={agreement.location} onChange={(v) => setAgreementField('location', v)} />
                        <Field disabled={agreementLocked} label="Field representative" value={agreement.field_representative} onChange={(v) => setAgreementField('field_representative', v)} />
                        <Field disabled={agreementLocked} label="Approved funding (USD)" type="number" value={String(agreement.approved_funding_usd ?? '')} onChange={(v) => setAgreementField('approved_funding_usd', v)} />
                        <Field disabled={agreementLocked} label="Target count" type="number" value={String(agreement.target_count ?? '')} onChange={(v) => setAgreementField('target_count', v)} />
                        <Field disabled={agreementLocked} label="Target label" hint="e.g. displaced families" value={agreement.target_label} onChange={(v) => setAgreementField('target_label', v)} />
                      </div>

                      <Field
                        disabled={agreementLocked}
                        label="Distribution per beneficiary"
                        hint="e.g. 10 kg rice + 10 kg potatoes — leave blank to omit this line"
                        value={agreement.distribution_per_beneficiary}
                        onChange={(v) => setAgreementField('distribution_per_beneficiary', v)}
                      />
                      <Field
                        disabled={agreementLocked}
                        label="Total planned distribution"
                        hint="e.g. 500 kg rice + 500 kg potatoes"
                        value={agreement.total_planned_distribution}
                        onChange={(v) => setAgreementField('total_planned_distribution', v)}
                      />
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          Extra lines under “Use of Funds” <span className="text-gray-400">— one per line</span>
                        </label>
                        <textarea
                          rows={2}
                          value={agreement.extra_fund_uses}
                          disabled={agreementLocked}
                          onChange={(e) => setAgreementField('extra_fund_uses', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-50 disabled:text-gray-600"
                          placeholder="Purchase of rice and potatoes"
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {!agreementLocked && (
                          <button
                            onClick={saveAgreement}
                            disabled={agreementBusy}
                            className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 disabled:opacity-50"
                          >
                            {agreementExists ? 'Save changes' : 'Save draft'}
                          </button>
                        )}
                        {(!agreementLocked || agreementExists) && (
                          <button
                            onClick={downloadAgreementPdf}
                            disabled={agreementBusy}
                            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-50"
                          >
                            {agreementLocked ? <Download className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                            {agreementBusy ? 'Working…' : agreementLocked ? 'Download agreement PDF' : 'Generate agreement PDF'}
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </Section>
              )}

            </div>

            {/* The footer carries only what is true at every step. The verdicts
                live in the Next step panel, where they are shown for the one
                status that allows them. */}
            <div className="border-t border-gray-200 p-4 flex flex-wrap items-center justify-between gap-2">
              <button onClick={() => setDeleting(selected)} className="text-sm px-3 py-2 text-red-700 hover:bg-red-50 rounded inline-flex items-center gap-1.5">
                <Trash2 className="w-4 h-4" /> Delete
              </button>
              <button onClick={closeDetail} className="text-sm px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold rounded">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {deleting && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-start mb-4">
              <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mr-3"><AlertTriangle className="w-5 h-5 text-red-600" /></div>
              <div><h3 className="text-lg font-bold text-gray-900">Delete proposal?</h3><p className="text-sm text-gray-500 mt-1">"{deleting.project_name || `Ref #${deleting.id}`}" from {deleting.full_name || deleting.email}. This cannot be undone.</p></div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleting(null)} className="px-4 py-2 text-gray-600">Cancel</button>
              <button onClick={handleDelete} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="px-6 py-5 border-b border-gray-100 last:border-b-0">
    <h4 className="text-sm font-semibold uppercase text-gray-500 tracking-wide mb-3">{title}</h4>
    <div className="space-y-3">{children}</div>
  </div>
)

/** One labelled single-line input for the agreement form. */
const Field = ({ label, value, onChange, hint, type = 'text', disabled = false }: {
  label: string
  value: string
  onChange: (v: string) => void
  hint?: string
  type?: string
  disabled?: boolean
}) => (
  <div>
    <label className="block text-xs text-gray-500 mb-1">
      {label}{hint && <span className="text-gray-400"> — {hint}</span>}
    </label>
    <input
      type={type}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-50 disabled:text-gray-600"
    />
  </div>
)

const KV = ({ rows }: { rows: [string, string | null | undefined][] }) => (
  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
    {rows.map(([k, v]) => (
      <div key={k}>
        <dt className="text-xs text-gray-500">{k}</dt>
        <dd className="text-gray-900 break-words">{v || '—'}</dd>
      </div>
    ))}
  </dl>
)

// `text` is nullable for the same reason the Proposal fields are: a dossier
// without a version has no content to show, and a null must render as an em
// dash rather than throw on .split().
const Paragraph = ({ label, text, bullets }: { label: string; text: string | null | undefined; bullets?: boolean }) => {
  const lines = bullets ? (text || '').split('\n').map((l) => l.trim().replace(/^[-•*]\s*/, '')).filter(Boolean) : []
  return (
    <div>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      {bullets && lines.length > 1
        ? <ul className="list-disc list-inside text-sm text-gray-800 space-y-0.5">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
        : <p className="text-sm text-gray-800 whitespace-pre-wrap">{text || '—'}</p>}
    </div>
  )
}

export default AdminProjectProposals
