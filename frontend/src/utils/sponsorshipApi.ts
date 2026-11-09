/**
 * HTTP clients for sponsorship (families and orphans).
 *
 * Three audiences, three clients, on purpose:
 *   publicApi   — anonymous: browse, profile, checkout, apply.
 *   portalApi   — "Follow my request" / "My sponsorships": its own token in
 *                 sessionStorage, like the proposal portal. A staff member using
 *                 it must not have their admin session destroyed by a lapsed
 *                 six-digit-code session, so it is not the shared client.
 *   adminApi    — the shared staff client from utils/api (bearer + 401 handling).
 *
 * Backend: backend/routers/sponsorship_{public,portal,admin}.py
 */
import axios from 'axios'
import api from './api'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const BASE = '/api/sponsorship'

export const SPONSORSHIP_PORTAL_TOKEN_KEY = 'sponsorship_portal_token'

const publicApi = axios.create({ baseURL: API_BASE_URL })
const portalApi = axios.create({ baseURL: API_BASE_URL })
portalApi.interceptors.request.use((config) => {
  const token = sessionStorage.getItem(SPONSORSHIP_PORTAL_TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export const hasSponsorshipPortalToken = () => Boolean(sessionStorage.getItem(SPONSORSHIP_PORTAL_TOKEN_KEY))
export const clearSponsorshipPortalToken = () => sessionStorage.removeItem(SPONSORSHIP_PORTAL_TOKEN_KEY)

// ── Shared types ──────────────────────────────────────────────────────

export type Kind = 'family' | 'orphan'
export type CaseStatus = 'submitted' | 'under_review' | 'info_requested' | 'approved' | 'published' | 'paused' | 'rejected' | 'closed'
export type FundingState = 'unfunded' | 'partial' | 'full'
export type NeedCategory = 'food' | 'rent' | 'utilities' | 'education' | 'health' | 'clothing' | 'transport' | 'other'
export type DocType = 'id_document' | 'death_certificate' | 'birth_certificate' | 'guardianship' | 'school_certificate'
  | 'medical_report' | 'income_proof' | 'residence_proof' | 'association_mandate' | 'photo' | 'receipt' | 'other'
export type SponsorshipStatus = 'pending' | 'active' | 'past_due' | 'canceled' | 'ended' | 'abandoned'

export interface Need {
  category: NeedCategory
  monthly_cents: number
  note?: string | null
}

export interface Coverage {
  monthly_need_cents?: number
  committed_cents: number
  remaining_cents: number
  available_cents: number
  percent: number
  state: FundingState
  sponsors: number
  overfunded?: boolean
}

export interface PublicCard {
  reference: string
  kind: Kind
  display_name: string | null
  title: string | null
  title_ar: string | null
  country: string
  region: string | null
  monthly_need_cents: number
  coverage: Coverage
  waiting_since: string | null
  verified_at: string | null
  photo_url: string | null
  needs: Need[]
  age?: number | null
  gender?: 'male' | 'female'
  household_size?: number
  relation?: 'family' | 'sibling' | 'child'
}

export interface PublicDetail extends PublicCard {
  story: string | null
  story_ar: string | null
  verified_documents: DocType[]
  distributed_cents: number
  related: PublicCard[]
  school_level?: string | null
  orphan_type?: 'father' | 'mother' | 'both'
}

export interface Stats {
  family: { published: number; waiting: number; fully_sponsored: number }
  orphan: { published: number; waiting: number; fully_sponsored: number }
  active_sponsorships: number
  distributed_cents: number
}

export interface Disbursement {
  id: number
  amount_cents: number
  category: NeedCategory
  period: string | null
  description: string
  description_ar: string | null
  disbursed_at: string
  internal_note?: string | null
  receipt_document_id?: number | null
}

export interface CaseUpdate {
  id: number
  title: string
  title_ar: string | null
  body: string
  body_ar: string | null
  photo_url: string | null
  created_at: string
}

export interface DocumentInfo {
  id: number
  doc_type: DocType
  filename: string
  kind: 'image' | 'document'
  size_bytes: number
  uploaded_at: string
  review_status: 'pending' | 'verified' | 'rejected'
  review_note: string | null
  reviewed_at: string | null
  uploaded_by?: 'applicant' | 'staff'
  uploaded_by_email?: string | null
  content_type?: string
}

// ── Public ────────────────────────────────────────────────────────────

export interface ListParams {
  kind?: Kind
  country?: string
  gender?: 'male' | 'female'
  age_min?: number
  age_max?: number
  needs_sponsor?: boolean
  sort?: 'waiting' | 'newest' | 'need'
  limit?: number
  offset?: number
}

export const fetchStats = async (): Promise<Stats> => (await publicApi.get(`${BASE}/stats`)).data

export const fetchCases = async (params: ListParams): Promise<{ total: number; countries: string[]; items: PublicCard[] }> =>
  (await publicApi.get(`${BASE}/cases`, { params })).data

export const fetchCase = async (ref: string): Promise<PublicDetail> =>
  (await publicApi.get(`${BASE}/cases/${encodeURIComponent(ref)}`)).data

export const startCheckout = async (
  ref: string, body: { name: string; email: string; monthly_amount_cents: number; lang: 'en' | 'ar' },
): Promise<{ id: string; url: string | null }> =>
  (await publicApi.post(`${BASE}/cases/${encodeURIComponent(ref)}/checkout`, body)).data

export const fetchCheckoutResult = async (sessionId: string): Promise<{
  status: SponsorshipStatus; monthly_amount_cents: number; reference: string; kind: Kind; display_name: string | null
}> => (await publicApi.get(`${BASE}/checkout/${encodeURIComponent(sessionId)}`)).data

/** Multipart: the form as JSON in `payload`, each file with its type in a parallel `doc_types` list. */
export const submitApplication = async (
  kind: Kind, payload: Record<string, unknown>, files: { file: File; docType: DocType }[],
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ reference: string; kind: Kind; documents_stored: number; documents_offered: number; missing_documents: DocType[] }> => {
  const form = new FormData()
  form.append('payload', JSON.stringify(payload))
  files.forEach(({ file, docType }) => {
    form.append('files', file)
    form.append('doc_types', docType)
  })
  const { data } = await publicApi.post(`${BASE}/apply/${kind}`, form, {
    onUploadProgress: (e) => { if (onProgress && e.total) onProgress(e.loaded, e.total) },
  })
  return data
}

/** Absolute URL for a photo path the API returned. */
export const assetUrl = (path: string | null | undefined): string | null =>
  !path ? null : path.startsWith('http') ? path : `${API_BASE_URL}${path}`

// ── Portal ────────────────────────────────────────────────────────────

export const requestPortalCode = async (email: string, audience: 'applicant' | 'sponsor', lang: 'en' | 'ar') =>
  (await portalApi.post(`${BASE}/portal/request-code`, { email, audience, lang })).data

export const verifyPortalCode = async (email: string, code: string): Promise<void> => {
  const { data } = await portalApi.post(`${BASE}/portal/verify-code`, { email, code })
  sessionStorage.setItem(SPONSORSHIP_PORTAL_TOKEN_KEY, data.token)
}

export interface TimelineEvent {
  id: number
  type: string
  from_status: string | null
  to_status: string | null
  message: string | null
  created_at: string
  by: 'you' | 'team' | 'sponsor'
  doc_type?: DocType | null
  review_status?: string | null
  monthly_amount_cents?: number | null
}

export interface ApplicantCase {
  id: number
  reference: string
  kind: Kind
  status: CaseStatus
  submitted_at: string
  updated_at: string
  editable: boolean
  may_upload: boolean
  last_message: string | null
  dossier: Record<string, any>
  details: Record<string, any>
  members: Record<string, any>[]
  documents: DocumentInfo[]
  missing_documents: DocType[]
  required_documents: DocType[]
  timeline: TimelineEvent[]
  unread: number
  family_reference: string | null
  linked_orphans: { reference: string; status: CaseStatus }[]
  sponsorship: { monthly_need_cents: number; committed_cents: number; sponsors: number; state: FundingState } | null
  disbursements: Disbursement[]
  received_cents: number
}

export const fetchMyRequests = async (): Promise<{ email: string; items: ApplicantCase[] }> =>
  (await portalApi.get(`${BASE}/portal/requests`)).data

export const resubmitRequest = async (id: number, body: Record<string, unknown>): Promise<ApplicantCase> =>
  (await portalApi.put(`${BASE}/portal/requests/${id}`, body)).data

export const uploadRequestDocuments = async (
  id: number, files: { file: File; docType: DocType }[],
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ stored: number; offered: number; request: ApplicantCase }> => {
  const form = new FormData()
  files.forEach(({ file, docType }) => { form.append('files', file); form.append('doc_types', docType) })
  const { data } = await portalApi.post(`${BASE}/portal/requests/${id}/documents`, form, {
    onUploadProgress: (e) => { if (onProgress && e.total) onProgress(e.loaded, e.total) },
  })
  return data
}

export const fetchOwnDocument = async (caseId: number, docId: number): Promise<Blob> =>
  (await portalApi.get(`${BASE}/portal/requests/${caseId}/documents/${docId}`, { responseType: 'blob' })).data

export interface SponsorshipView {
  id: number
  status: SponsorshipStatus
  monthly_amount_cents: number
  started_at: string | null
  ended_at: string | null
  end_reason: string | null
  total_given_cents: number
  payments: { donation_id: number; amount_cents: number; paid_at: string }[]
  case: PublicCard & { story: string | null; story_ar: string | null; case_status: CaseStatus }
  finances: { collected_cents: number; disbursed_cents: number; balance_cents: number }
  disbursements: Disbursement[]
  updates: CaseUpdate[]
}

export const fetchMySponsorships = async (): Promise<{ email: string; items: SponsorshipView[] }> =>
  (await portalApi.get(`${BASE}/portal/sponsorships`)).data

export const cancelMySponsorship = async (
  id: number, body: { reason?: 'financial' | 'changed_mind' | 'other_sponsorship' | 'other'; note?: string },
): Promise<SponsorshipView> => (await portalApi.post(`${BASE}/portal/sponsorships/${id}/cancel`, body)).data

export const fetchReceipt = async (sponsorshipId: number, donationId: number): Promise<Blob> =>
  (await portalApi.get(`${BASE}/portal/sponsorships/${sponsorshipId}/receipts/${donationId}`, { responseType: 'blob' })).data

/** The backend's "no request / no sponsorship under this address" answer. */
export const isNothingUnderAddress = (error: unknown) =>
  (error as { response?: { status?: number } })?.response?.status === 404

/** A detail string from an API error, or null. */
export const errorDetail = (error: unknown): string | null => {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object' && 'message' in (detail as Record<string, unknown>)) {
    return String((detail as Record<string, unknown>).message)
  }
  return null
}

// ── Admin ─────────────────────────────────────────────────────────────

export interface StaffCaseSummary {
  id: number
  reference: string
  kind: Kind
  status: CaseStatus
  name: string | null
  public_name: string | null
  submitter_type: 'self' | 'organization' | 'staff'
  submitter_email: string
  organization_name: string | null
  country: string
  city: string
  submitted_at: string
  updated_at: string
  published_at: string | null
  requested_monthly_cents: number
  approved_monthly_cents: number | null
  coverage: Coverage & { monthly_need_cents: number; overfunded: boolean }
  finances: { collected_cents: number; disbursed_cents: number; balance_cents: number }
  unread: boolean
  flags: number
  docs_pending: number
  missing_documents: DocType[]
  assigned_to: number | null
  household_size?: number
  age?: number | null
  family_case_id?: number | null
  ages_out_on?: string
}

export interface StaffEvent {
  id: number
  type: string
  from_status: string | null
  to_status: string | null
  message: string | null
  note: string | null
  created_at: string
  actor_type: 'staff' | 'applicant' | 'sponsor' | 'system'
  actor_label: string | null
  actor_user_id: number | null
  actor_email: string | null
  visibility: 'internal' | 'applicant' | 'sponsor'
  changes: Record<string, unknown>
}

export interface StaffSponsorship {
  id: number
  sponsor_name: string
  sponsor_email: string
  monthly_amount_cents: number
  status: SponsorshipStatus
  started_at: string | null
  last_payment_at: string | null
  ended_at: string | null
  end_reason: string | null
  end_note: string | null
  ended_by: string | null
  created_at: string
  payments: { donation_id: number; amount_cents: number; paid_at: string }[]
}

export type StaffAction = 'start_review' | 'request_info' | 'approve' | 'reject' | 'publish' | 'pause' | 'close' | 'reopen'

export interface StaffCase extends StaffCaseSummary {
  submitter_name: string
  submitter_phone: string | null
  organization_registration: string | null
  organization_contact_role: string | null
  preferred_language: 'en' | 'ar'
  dossier: Record<string, any>
  details: Record<string, any>
  members: Record<string, any>[]
  profile: {
    public_name: string | null
    public_title: string | null
    public_title_ar: string | null
    public_story: string | null
    public_story_ar: string | null
    approved_monthly_cents: number | null
  }
  photo_url: string | null
  consent: { verification: boolean; publication: boolean; text: string | null; at: string | null }
  duplicate_flags: { case_id: number | null; reference: string; reason: string }[]
  duplicates_reviewed_at: string | null
  close_reason: string | null
  approved_at: string | null
  closed_at: string | null
  assigned_to_email: string | null
  documents: DocumentInfo[]
  required_documents: DocType[]
  approval_blockers: string[]
  publish_blockers: string[]
  allowed_actions: StaffAction[]
  sponsorships: StaffSponsorship[]
  disbursements: Disbursement[]
  updates: CaseUpdate[]
  history: StaffEvent[]
  related: { id: number; reference: string; kind: Kind; status: CaseStatus; relation: 'family' | 'sibling' | 'orphan' }[]
}

export interface Overview {
  pipeline: Record<Kind, Record<CaseStatus, number>>
  unread: number
  funding: Record<FundingState, number>
  monthly_need_cents: number
  monthly_committed_cents: number
  coverage_percent: number
  sponsorships: {
    active: number; past_due: number; sponsors: number; started_this_month: number
    ended_this_month: number; end_reasons: Record<string, number>; monthly_recurring_cents: number
  }
  money: {
    collected_this_month_cents: number; disbursed_this_month_cents: number
    collected_total_cents: number; disbursed_total_cents: number; undistributed_cents: number
  }
  timing: { avg_review_days: number | null; avg_wait_for_sponsor_days: number | null }
  alerts: {
    documents_pending: { id: number; reference: string; count: number }[]
    duplicates: { id: number; reference: string; flags: number }[]
    overfunded: { id: number; reference: string; excess_cents: number }[]
    aging_out: { id: number; reference: string; ages_out_on: string }[]
    no_recent_update: { id: number; reference: string; since: string }[]
    idle_funds: { id: number; reference: string; balance_cents: number }[]
    past_due: { id: number; case_id: number; reference: string | null }[]
  }
}

const A = `${BASE}/admin`

export const sponsorshipAdmin = {
  overview: async (): Promise<Overview> => (await api.get(`${A}/overview`)).data,
  cases: async (params: { kind?: Kind; status?: string; funding?: FundingState; flag?: string; q?: string }):
    Promise<{ items: StaffCaseSummary[]; total: number; status_counts: Record<CaseStatus, number> }> =>
    (await api.get(`${A}/cases`, { params })).data,
  get: async (id: number): Promise<StaffCase> => (await api.get(`${A}/cases/${id}`)).data,
  preview: async (id: number): Promise<PublicDetail> => (await api.get(`${A}/cases/${id}/public-preview`)).data,
  edit: async (id: number, body: Record<string, unknown>): Promise<{ changed: string[]; case: StaffCase }> =>
    (await api.patch(`${A}/cases/${id}`, body)).data,
  transition: async (id: number, body: {
    action: StaffAction; message?: string; note?: string; approved_monthly_cents?: number
    close_reason?: string; end_sponsorships?: boolean
  }): Promise<StaffCase> => (await api.post(`${A}/cases/${id}/transition`, body)).data,
  note: async (id: number, note: string) => (await api.post(`${A}/cases/${id}/notes`, { note })).data,
  clearDuplicates: async (id: number, note?: string) =>
    (await api.post(`${A}/cases/${id}/duplicates/clear`, note ? { note } : undefined)).data,
  link: async (id: number, familyReference: string | null): Promise<StaffCase> =>
    (await api.post(`${A}/cases/${id}/link`, { family_reference: familyReference })).data,
  uploadDocuments: async (id: number, files: { file: File; docType: DocType }[]): Promise<{ stored: number; case: StaffCase }> => {
    const form = new FormData()
    files.forEach(({ file, docType }) => { form.append('files', file); form.append('doc_types', docType) })
    return (await api.post(`${A}/cases/${id}/documents`, form)).data
  },
  document: async (id: number, docId: number): Promise<Blob> =>
    (await api.get(`${A}/cases/${id}/documents/${docId}`, { responseType: 'blob' })).data,
  reviewDocument: async (id: number, docId: number, status: 'verified' | 'rejected' | 'pending', note?: string): Promise<StaffCase> =>
    (await api.post(`${A}/cases/${id}/documents/${docId}/review`, { status, note })).data,
  setPhoto: async (id: number, file: File): Promise<StaffCase> => {
    const form = new FormData()
    form.append('file', file)
    form.append('confirm_safe', 'true')
    return (await api.post(`${A}/cases/${id}/photo`, form)).data
  },
  removePhoto: async (id: number): Promise<StaffCase> => (await api.delete(`${A}/cases/${id}/photo`)).data,
  photo: async (id: number): Promise<Blob> => (await api.get(`${A}/cases/${id}/photo`, { responseType: 'blob' })).data,
  addDisbursement: async (id: number, body: {
    amount_cents: number; category: NeedCategory; period?: string; description: string
    description_ar?: string; internal_note?: string; disbursed_at?: string; receipt_document_id?: number
  }): Promise<StaffCase> => (await api.post(`${A}/cases/${id}/disbursements`, body)).data,
  postUpdate: async (id: number, body: { title: string; title_ar?: string; body: string; body_ar?: string; notify_sponsors: boolean }):
    Promise<StaffCase> => (await api.post(`${A}/cases/${id}/updates`, body)).data,
  sponsorships: async (params: { status?: string; q?: string }): Promise<{ items: (StaffSponsorship & {
    case_id: number; reference: string; kind: Kind; public_name: string | null; total_given_cents: number
  })[] }> => (await api.get(`${A}/sponsorships`, { params })).data,
  endSponsorship: async (id: number, body: { reason?: string; note?: string }) =>
    (await api.post(`${A}/sponsorships/${id}/end`, body)).data,
}
