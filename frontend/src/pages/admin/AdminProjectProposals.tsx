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
  CheckCircle2, XCircle, ClipboardList, Search,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useToast } from '../../contexts/ToastContext'

interface ProposalVersionSummary {
  id: number
  version_no: number
  submitted_at: string
  submitted_ip: string | null
  decision: string | null
  decision_comment: string | null
  internal_note: string | null
  decided_at: string | null
  decided_by: number | null
}

interface Proposal {
  id: number
  full_name: string
  national_id: string
  date_of_birth_year: number
  place_of_residence: string
  mobile_number: string
  email: string
  educational_level: string
  project_name: string
  project_description: string
  problem_solved: string
  target_beneficiaries: string
  community_impact: string
  expected_impact: string
  implementation_steps: string
  implementation_location: string
  required_materials: string
  expected_duration: string
  continuity_plan: string
  feasibility: string
  expected_challenges: string
  number_of_beneficiaries: number
  cost_per_unit_usd: number
  unit_type: string
  additional_expenses_usd: number
  additional_expenses_description: string | null
  total_amount_usd: number
  status: string
  decision_comment: string | null
  internal_note: string | null
  version_count: number
  current_version_no: number | null
  versions: ProposalVersionSummary[]
  reviewed_at: string | null
  reviewed_by: number | null
  submitted_ip: string | null
  submitted_at: string
  updated_at: string
}

const STATUS_BADGE: Record<string, string> = {
  submitted:         'bg-blue-100 text-blue-800',
  under_review:      'bg-amber-100 text-amber-800',
  changes_requested: 'bg-orange-100 text-orange-900',
  approved:          'bg-green-100 text-green-800',
  rejected:          'bg-red-100 text-red-800',
}
const STATUS_LABEL: Record<string, string> = {
  submitted: 'Submitted',
  under_review: 'Under review',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  rejected: 'Rejected',
}

// Statuses the applicant must be given a reason for — the backend enforces
// this too (400 without a comment); mirroring it here keeps the reviewer from
// losing a click.
const COMMENT_REQUIRED = new Set(['rejected', 'changes_requested'])
// Statuses that decide the current version, and so email the applicant.
const DECISION_STATUSES = new Set(['approved', 'rejected', 'changes_requested'])

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
  useEffect(() => { fetchRows() }, [statusFilter])  // eslint-disable-line react-hooks/exhaustive-deps

  const openDetail = (p: Proposal) => {
    setSelected(p)
    setCommentDraft(p.decision_comment || '')
    setNoteDraft(p.internal_note || '')
    setOpenVersion(null)
    setVersionDetail(null)
  }
  const closeDetail = () => {
    setSelected(null)
    setCommentDraft('')
    setNoteDraft('')
    setOpenVersion(null)
    setVersionDetail(null)
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

  const loadVersion = async (versionNo: number) => {
    if (!selected) return
    if (openVersion === versionNo) { setOpenVersion(null); setVersionDetail(null); return }
    setOpenVersion(versionNo)
    setVersionDetail(null)
    try {
      const resp = await fetch(`${API_URL}/api/project-proposals/${selected.id}/versions/${versionNo}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!resp.ok) throw new Error('fetch failed')
      setVersionDetail(await resp.json())
    } catch {
      setOpenVersion(null)
      showError('Error', 'Could not load that version')
    }
  }

  const downloadPdf = async (p: Proposal) => {
    try {
      const resp = await fetch(`${API_URL}/api/project-proposals/${p.id}/pdf`, { headers: { Authorization: `Bearer ${token}` } })
      if (!resp.ok) throw new Error('PDF fetch failed')
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `proposal-${p.id}-${p.project_name.replace(/[^a-z0-9]+/gi, '-').slice(0, 40).toLowerCase()}.pdf`
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
    return r.project_name.toLowerCase().includes(s) || r.full_name.toLowerCase().includes(s) || r.email.toLowerCase().includes(s)
  })

  const formatDate = (iso: string | null) => iso ? new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
  const formatMoney = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`

  return (
    <div className="space-y-6 px-4 sm:px-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center">
          <FolderKanban className="w-6 h-6 sm:w-8 sm:h-8 mr-2 sm:mr-3 text-primary-600" />
          Project Proposals
          <span className="ml-3 text-sm bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{total}</span>
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
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">Submitted</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm">
                    <div className="font-medium text-gray-900 max-w-[280px] truncate" title={r.project_name}>{r.project_name}</div>
                    <div className="text-xs text-gray-500">Ref #{r.id}</div>
                    {r.version_count > 1 && (
                      <span className="inline-flex mt-1 px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600">
                        v{r.current_version_no} · {r.version_count} versions
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 hidden md:table-cell">
                    <div>{r.full_name}</div>
                    <div className="text-xs text-gray-500 truncate max-w-[200px]" title={r.email}>{r.email}</div>
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-primary-700 text-right whitespace-nowrap">{formatMoney(r.total_amount_usd)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${STATUS_BADGE[r.status] || 'bg-gray-100'}`}>
                      {STATUS_LABEL[r.status] || r.status}
                    </span>
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
                <h3 className="text-lg font-bold text-gray-900 truncate">{selected.project_name}</h3>
                <p className="text-xs text-gray-500 truncate">Ref #{selected.id} · {selected.full_name} · <a href={`mailto:${selected.email}`} className="text-primary-600 hover:underline">{selected.email}</a></p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${STATUS_BADGE[selected.status]}`}>{STATUS_LABEL[selected.status]}</span>
                <button onClick={() => downloadPdf(selected)} className="text-xs inline-flex items-center gap-1 px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded"><Download className="w-3.5 h-3.5" /> PDF</button>
                <button onClick={closeDetail} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Section 1 */}
              <Section title="1. Personal information">
                <KV rows={[
                  ['Full name', selected.full_name],
                  ['National ID', selected.national_id],
                  ['Year of birth', String(selected.date_of_birth_year)],
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
                    <span>{selected.number_of_beneficiaries} {selected.unit_type}s × ${selected.cost_per_unit_usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    <span className="font-semibold">${(selected.number_of_beneficiaries * selected.cost_per_unit_usd).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                  </div>
                  {selected.additional_expenses_usd > 0 && (
                    <div className="flex justify-between text-sm text-primary-900">
                      <span>Additional {selected.additional_expenses_description ? `— ${selected.additional_expenses_description}` : ''}</span>
                      <span className="font-semibold">${selected.additional_expenses_usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  <div className="border-t border-primary-300 pt-2 flex justify-between items-center">
                    <span className="text-primary-900 font-semibold">Total</span>
                    <span className="text-2xl font-bold text-primary-900">${selected.total_amount_usd.toLocaleString(undefined, { maximumFractionDigits: 2 })} <span className="text-sm font-normal">USD</span></span>
                  </div>
                </div>
              </Section>

              {/* Version history */}
              <Section title={`Version history (${selected.version_count})`}>
                {[...selected.versions].reverse().map((v) => (
                  <div key={v.id} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">Version {v.version_no}</span>
                      {v.version_no === selected.current_version_no && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary-100 text-primary-800">current</span>
                      )}
                      <span className="text-xs text-gray-500">{formatDate(v.submitted_at)}</span>
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

              {/* Decision */}
              <Section title="Decision">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Message to the applicant <span className="text-gray-400">— goes out in the email</span>
                  </label>
                  <textarea rows={4} value={commentDraft} onChange={(e) => setCommentDraft(e.target.value)}
                    placeholder="What the applicant will read — the reason for the decision, or what to change."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500" />
                  <p className="text-xs text-gray-500 mt-1">Required to reject or request changes.</p>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Internal note <span className="text-gray-400">— staff only, never sent</span>
                  </label>
                  <textarea rows={3} value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="Notes for admins and managers. The applicant never sees this."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500" />
                </div>
                <div className="flex justify-end">
                  <button onClick={saveNotes} className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded">Save without notifying</button>
                </div>
                {selected.reviewed_at && (
                  <p className="text-xs text-gray-500">Last reviewed on {formatDate(selected.reviewed_at)}</p>
                )}
              </Section>
            </div>

            {/* Status action bar */}
            <div className="border-t border-gray-200 p-4 flex flex-wrap items-center justify-end gap-2">
              <button onClick={() => changeStatus('submitted')} className="text-sm px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-800 rounded inline-flex items-center gap-1"><ClipboardList className="w-4 h-4" /> Mark submitted</button>
              <button onClick={() => changeStatus('under_review')} className="text-sm px-3 py-2 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded inline-flex items-center gap-1">Mark under review</button>
              <button onClick={() => changeStatus('changes_requested')} className="text-sm px-3 py-2 bg-orange-100 hover:bg-orange-200 text-orange-900 rounded inline-flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> Request changes</button>
              <button onClick={() => changeStatus('rejected')} className="text-sm px-3 py-2 bg-red-100 hover:bg-red-200 text-red-800 rounded inline-flex items-center gap-1"><XCircle className="w-4 h-4" /> Reject</button>
              <button onClick={() => changeStatus('approved')} className="text-sm px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded inline-flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Approve</button>
            </div>
          </div>
        </div>
      )}

      {deleting && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-start mb-4">
              <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mr-3"><AlertTriangle className="w-5 h-5 text-red-600" /></div>
              <div><h3 className="text-lg font-bold text-gray-900">Delete proposal?</h3><p className="text-sm text-gray-500 mt-1">"{deleting.project_name}" from {deleting.full_name}. This cannot be undone.</p></div>
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

const KV = ({ rows }: { rows: [string, string][] }) => (
  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
    {rows.map(([k, v]) => (
      <div key={k}>
        <dt className="text-xs text-gray-500">{k}</dt>
        <dd className="text-gray-900 break-words">{v || '—'}</dd>
      </div>
    ))}
  </dl>
)

const Paragraph = ({ label, text, bullets }: { label: string; text: string; bullets?: boolean }) => {
  const lines = bullets ? text.split('\n').map((l) => l.trim().replace(/^[-•*]\s*/, '')).filter(Boolean) : []
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
