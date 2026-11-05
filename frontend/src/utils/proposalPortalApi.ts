/**
 * HTTP client for the submitter portal — deliberately isolated from utils/api.
 *
 * The shared client attaches localStorage `auth_token` to every request and, on
 * a 401, clears that token and redirects. A submitter has no staff session, and
 * a staff member using the portal must not have theirs destroyed by an expired
 * six-digit-code session. So this is its own axios instance with its own token,
 * in sessionStorage: the portal session dies with the tab, which is the right
 * lifetime for a passwordless login.
 */
import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const PORTAL_BASE = '/api/project-proposals/portal'

export const PORTAL_TOKEN_KEY = 'proposal_portal_token'

export const portalApi = axios.create({ baseURL: API_BASE_URL })

portalApi.interceptors.request.use((config) => {
  const token = sessionStorage.getItem(PORTAL_TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export const hasPortalToken = (): boolean => Boolean(sessionStorage.getItem(PORTAL_TOKEN_KEY))
export const clearPortalToken = (): void => sessionStorage.removeItem(PORTAL_TOKEN_KEY)

export interface PortalReportAttachment {
  id: number
  filename: string
  kind: 'image' | 'video' | 'document'
  size_bytes: number
}

export interface PortalReport {
  report_no: number
  narrative: string
  submitted_at: string
  decision: 'approved' | 'changes_requested' | null
  /** Why it was sent back — the only thing telling the team what to fix. */
  decision_comment: string | null
  decided_at: string | null
  attachments: PortalReportAttachment[]
}

export interface PortalProposal {
  id: number
  project_name: string | null
  status: string
  editable: boolean
  submitted_at: string
  updated_at: string
  version_no: number | null
  decision_comment: string | null
  content: Record<string, unknown>
  /** Whether a completion report may be filed right now. Computed by the
   *  backend so the form is never shown for a submission it would refuse. */
  may_submit_report: boolean
  awaiting_report_review: boolean
  completed: boolean
  report: PortalReport | null
}

export const requestPortalCode = async (email: string): Promise<{ message: string }> => {
  const { data } = await portalApi.post(`${PORTAL_BASE}/request-code`, { email })
  return data
}

export const verifyPortalCode = async (email: string, code: string): Promise<void> => {
  const { data } = await portalApi.post(`${PORTAL_BASE}/verify-code`, { email, code })
  sessionStorage.setItem(PORTAL_TOKEN_KEY, data.token)
}

export interface PortalDossiers {
  email: string
  items: PortalProposal[]
}

export const fetchMyProposals = async (): Promise<PortalDossiers> => {
  const { data } = await portalApi.get(`${PORTAL_BASE}/me`)
  // The address comes back with the list on purpose: it is the only way a
  // reloaded tab -- which still holds the token but has lost all React state --
  // can learn whose proposals it is showing, and therefore where to send a
  // fresh code when the token lapses mid-revision.
  return { email: data.email ?? '', items: data.items ?? [] }
}

export const submitRevision = async (
  proposalId: number, payload: Record<string, unknown>,
): Promise<PortalProposal> => {
  const { data } = await portalApi.put(`${PORTAL_BASE}/${proposalId}`, payload)
  return data
}

/** True when the backend said no proposal is filed under the address tried. */
export const isNoProposalForAddress = (error: unknown): boolean =>
  (error as { response?: { status?: number } })?.response?.status === 404

/**
 * File a completion report for a funded project.
 *
 * Multipart, not JSON: the agreement asks for receipts and photographs. The
 * browser sets the multipart boundary itself, so Content-Type is deliberately
 * left unset — naming it here produces a request the server cannot parse.
 */
export const submitCompletionReport = async (
  proposalId: number,
  narrative: string,
  files: File[],
): Promise<{ status: string; attachments_stored: number; attachments_offered: number; report: PortalReport }> => {
  const form = new FormData()
  form.append('narrative', narrative)
  files.forEach((file) => form.append('files', file))
  const { data } = await portalApi.post(
    `/api/project-proposals/portal/${proposalId}/report`, form)
  return data
}

/** A funded project's report attachment, for the team to re-read. */
export const reportAttachmentUrl = (proposalId: number, attachmentId: number): string =>
  `${API_BASE_URL}/api/project-proposals/portal/${proposalId}/report/attachments/${attachmentId}`
