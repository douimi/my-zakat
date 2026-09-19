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
