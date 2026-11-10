/**
 * The staff console's sponsorship vocabulary: status names and colours,
 * blockers and history lines in plain English, and money/date formatting.
 *
 * One place, so the overview, the lists and the case page name a thing the
 * same way. The applicant- and donor-facing wording lives in
 * components/sponsorship/labels.ts; admin is English-only.
 */
import type { StatusTone } from '../StatusBadge'
import type { CaseStatus, DocType, FundingState, SponsorshipStatus, StaffAction } from '../../../utils/sponsorshipApi'
import { DOC_LABELS, NEED_LABELS } from '../../sponsorship/labels'

// ── Money and dates ───────────────────────────────────────────────────

/** Integer cents → "$1,234" (or "$1,234.50" when there are cents). */
export const money = (cents: number | null | undefined): string => {
  if (cents == null || Number.isNaN(cents)) return '—'
  const whole = cents % 100 === 0
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2,
  }).format(cents / 100)
}

/** A dollars text field → integer cents, or null when blank/invalid. */
export const toCents = (dollars: string): number | null => {
  const n = Number(String(dollars).replace(/[$,\s]/g, ''))
  if (!dollars.trim() || !Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}

/** Integer cents → the value to put in a dollars text field. */
export const toDollars = (cents: number | null | undefined): string =>
  cents == null ? '' : (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)

export const fmtDate = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleDateString('en-US', { dateStyle: 'medium' }) : '—'

export const fmtDateTime = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—'

export const fmtBytes = (n: number): string =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// ── Statuses ──────────────────────────────────────────────────────────

export const CASE_STATUSES: CaseStatus[] = [
  'submitted', 'under_review', 'info_requested', 'approved', 'published', 'paused', 'rejected', 'closed',
]

export const STATUS_LABEL: Record<CaseStatus, string> = {
  submitted: 'Submitted',
  under_review: 'Under review',
  info_requested: 'Info requested',
  approved: 'Approved',
  published: 'Published',
  paused: 'Paused',
  rejected: 'Rejected',
  closed: 'Closed',
}

export const STATUS_TONE: Record<CaseStatus, StatusTone> = {
  submitted: 'info',
  under_review: 'accent',
  info_requested: 'warning',
  approved: 'success',
  published: 'success',
  paused: 'warning',
  rejected: 'danger',
  closed: 'neutral',
}

/** One line on what a status means for the reviewer: where the ball is. */
export const STATUS_HINT: Record<CaseStatus, string> = {
  submitted: 'New request. Start the review to take it on.',
  under_review: 'Verify the documents, then approve, ask for information or reject.',
  info_requested: 'Waiting for the applicant to answer. Their resubmission brings it back under review.',
  approved: 'Approved. Write the anonymous public profile, then publish it.',
  published: 'Visible to donors and open to sponsorship.',
  paused: 'Hidden from new donors. Existing sponsorships continue.',
  rejected: 'Not accepted. It can be reopened if the decision changes.',
  closed: 'Closed. It can be reopened.',
}

export const FUNDING_LABEL: Record<FundingState, string> = {
  full: 'Fully sponsored',
  partial: 'Partly sponsored',
  unfunded: 'No sponsor yet',
}

export const FUNDING_TONE: Record<FundingState, StatusTone> = {
  full: 'success', partial: 'warning', unfunded: 'danger',
}

export const SPONSORSHIP_STATUSES: SponsorshipStatus[] = ['active', 'past_due', 'pending', 'canceled', 'ended']

export const SPONSORSHIP_LABEL: Record<SponsorshipStatus, string> = {
  pending: 'Checkout open',
  active: 'Active',
  past_due: 'Past due',
  canceled: 'Cancelled by sponsor',
  ended: 'Ended',
  abandoned: 'Abandoned checkout',
}

export const SPONSORSHIP_TONE: Record<SponsorshipStatus, StatusTone> = {
  pending: 'neutral', active: 'success', past_due: 'warning', canceled: 'neutral', ended: 'neutral', abandoned: 'neutral',
}

/** A sponsorship staff can still end (the backend refuses the others). */
export const isRunning = (s: SponsorshipStatus) => s === 'active' || s === 'past_due' || s === 'pending'
/** A sponsorship that counts towards coverage. */
export const isCommitted = (s: SponsorshipStatus) => s === 'active' || s === 'past_due'

export const END_REASON_LABEL: Record<string, string> = {
  financial: 'Sponsor’s finances',
  changed_mind: 'Sponsor changed their mind',
  other_sponsorship: 'Sponsoring someone else',
  case_closed: 'Case closed',
  staff: 'Ended by staff',
  payment_failed: 'Payment failed',
  other: 'Other',
}

/** Reasons offered to staff when they end a sponsorship themselves. */
export const STAFF_END_REASONS = ['staff', 'payment_failed', 'financial', 'changed_mind', 'other_sponsorship', 'other'] as const

export const CLOSE_REASONS = ['aged_out', 'self_sufficient', 'moved', 'duplicate', 'deceased', 'withdrawn', 'other'] as const
export type CloseReason = typeof CLOSE_REASONS[number]

export const CLOSE_REASON_LABEL: Record<CloseReason, string> = {
  aged_out: 'Aged out (turned 18)',
  self_sufficient: 'Now self-sufficient',
  moved: 'Moved away / out of reach',
  duplicate: 'Duplicate of another case',
  deceased: 'Deceased',
  withdrawn: 'Withdrawn by the applicant',
  other: 'Other',
}

export const DUPLICATE_REASON_LABEL: Record<string, string> = {
  same_national_id: 'Same national ID',
  same_name_and_city: 'Same head of family name in the same city',
  same_child: 'Same child name and birth date',
}

// ── Actions ───────────────────────────────────────────────────────────

export const ACTION_LABEL: Record<StaffAction, string> = {
  start_review: 'Start review',
  request_info: 'Request information',
  approve: 'Approve',
  reject: 'Reject',
  publish: 'Publish',
  pause: 'Pause',
  close: 'Close case',
  reopen: 'Reopen',
}

/** The one button that moves the case forward, if the status has one. */
export const PRIMARY_ACTIONS: StaffAction[] = ['start_review', 'approve', 'publish', 'reopen']
/** Actions that end or refuse something: shown as danger. */
export const DANGER_ACTIONS: StaffAction[] = ['reject', 'close']

// ── Blockers ──────────────────────────────────────────────────────────

export type CaseTab = 'overview' | 'dossier' | 'documents' | 'profile' | 'sponsorships' | 'funds' | 'updates' | 'history' | 'links'

export const docLabel = (t: string) => DOC_LABELS[t as DocType]?.en ?? t.replace(/_/g, ' ')
export const needLabel = (c: string) => NEED_LABELS[c as keyof typeof NEED_LABELS]?.en ?? c

/** A blocker code from the API → a sentence, and the tab where it is fixed. */
export const explainBlocker = (code: string): { text: string; tab?: CaseTab } => {
  if (code.startsWith('document_not_verified:')) {
    const t = code.split(':')[1]
    return { text: `The required document “${docLabel(t)}” is not verified yet.`, tab: 'documents' }
  }
  switch (code) {
    case 'no_public_name': return { text: 'The public profile has no display name.', tab: 'profile' }
    case 'no_public_title': return { text: 'The public profile has no title.', tab: 'profile' }
    case 'no_public_story': return { text: 'The public profile has no story.', tab: 'profile' }
    case 'no_publication_consent': return { text: 'The applicant has not consented to publication.', tab: 'dossier' }
    case 'no_monthly_amount': return { text: 'No monthly amount is set.', tab: 'profile' }
    case 'duplicates_not_reviewed': return { text: 'Possible duplicates have not been reviewed yet.', tab: 'links' }
    case 'orphan_aged_out': return { text: 'The child is 18 or older: the case can no longer be published.' }
    case 'active_sponsorships': return { text: 'Sponsors are still giving to this case: confirm their sponsorships should end.', tab: 'sponsorships' }
    case 'message_required': return { text: 'Write the message the applicant will receive.' }
    case 'close_reason_required': return { text: 'Choose why the case is being closed.' }
    default: return { text: code.replace(/_/g, ' ') }
  }
}

// ── History ───────────────────────────────────────────────────────────

export const EVENT_LABEL: Record<string, string> = {
  submitted: 'Request filed',
  resubmitted: 'Applicant answered and resubmitted',
  start_review: 'Review started',
  request_info: 'Information requested',
  approve: 'Approved',
  reject: 'Rejected',
  publish: 'Published',
  pause: 'Paused',
  close: 'Closed',
  reopen: 'Reopened',
  document_uploaded: 'Document uploaded',
  document_reviewed: 'Document reviewed',
  edited: 'Case edited',
  note: 'Internal note',
  duplicates_flagged: 'Possible duplicates flagged',
  duplicates_reviewed: 'Duplicates reviewed',
  family_linked: 'Linked to a family',
  family_unlinked: 'Unlinked from its family',
  orphan_linked: 'Orphan linked to this family',
  photo_set: 'Public photo set',
  photo_removed: 'Public photo removed',
  disbursement_recorded: 'Disbursement recorded',
  update_posted: 'Update posted to sponsors',
  sponsorship_started: 'Sponsorship started',
  sponsorship_ended: 'Sponsorship ended',
  sponsorship_past_due: 'Sponsor payment failed',
  sponsorship_recovered: 'Sponsor payment recovered',
}

export const eventLabel = (type: string) => EVENT_LABEL[type] ?? type.replace(/_/g, ' ')

/** Groups for the history filter. */
export const EVENT_GROUPS: Record<string, { label: string; types: string[] }> = {
  decisions: { label: 'Decisions', types: ['submitted', 'resubmitted', 'start_review', 'request_info', 'approve', 'reject', 'publish', 'pause', 'close', 'reopen'] },
  documents: { label: 'Documents', types: ['document_uploaded', 'document_reviewed', 'photo_set', 'photo_removed'] },
  edits: { label: 'Edits and links', types: ['edited', 'duplicates_flagged', 'duplicates_reviewed', 'family_linked', 'family_unlinked', 'orphan_linked'] },
  money: { label: 'Money and sponsors', types: ['disbursement_recorded', 'sponsorship_started', 'sponsorship_ended', 'sponsorship_past_due', 'sponsorship_recovered', 'update_posted'] },
  notes: { label: 'Notes', types: ['note'] },
}

export const VISIBILITY_LABEL: Record<string, string> = {
  internal: 'Staff only',
  applicant: 'Shown to applicant',
  sponsor: 'Shown to sponsors',
}

/** Human names for dossier and profile fields, used in the edit diff. */
export const FIELD_LABEL: Record<string, string> = {
  submitter_name: 'Submitter name',
  submitter_phone: 'Submitter phone',
  organization_name: 'Association',
  organization_registration: 'Association registration',
  organization_contact_role: 'Contact role',
  country: 'Country',
  region: 'Region',
  city: 'City',
  address: 'Address',
  situation_category: 'Situation',
  situation_description: 'Situation description',
  monthly_income_cents: 'Monthly income',
  income_sources: 'Income sources',
  other_aid: 'Other aid',
  urgent_needs: 'Urgent needs',
  needs: 'Monthly needs',
  requested_monthly_cents: 'Requested monthly',
  consent_publication: 'Publication consent',
  head_full_name: 'Head of family',
  head_national_id: 'National ID',
  head_birth_year: 'Birth year',
  head_gender: 'Gender',
  head_marital_status: 'Marital status',
  head_occupation: 'Occupation',
  household_size: 'Household size',
  housing_status: 'Housing',
  monthly_rent_cents: 'Monthly rent',
  health_notes: 'Health notes',
  members: 'Household members',
  full_name: 'Full name',
  gender: 'Gender',
  birth_date: 'Birth date',
  orphan_type: 'Orphan of',
  father_name: 'Father’s name',
  father_death_date: 'Father’s death date',
  father_death_cause: 'Father’s death cause',
  mother_name: 'Mother’s name',
  mother_alive: 'Mother alive',
  mother_death_date: 'Mother’s death date',
  guardian_name: 'Guardian',
  guardian_relationship: 'Guardian relationship',
  guardian_national_id: 'Guardian national ID',
  guardian_phone: 'Guardian phone',
  lives_with: 'Lives with',
  school_level: 'School level',
  school_name: 'School',
  health_status: 'Health',
  interests: 'Interests',
  siblings_count: 'Siblings',
  public_name: 'Public name',
  public_title: 'Public title',
  public_title_ar: 'Public title (Arabic)',
  public_story: 'Public story',
  public_story_ar: 'Public story (Arabic)',
  approved_monthly_cents: 'Approved monthly',
  assigned_to: 'Assigned to',
  close_reason: 'Close reason',
  sponsorships_ended: 'Sponsorships ended',
  photo: 'Photo',
  review_status: 'Review status',
  doc_type: 'Document type',
  filename: 'File',
  amount_cents: 'Amount',
  category: 'Category',
  reason: 'Reason',
  family: 'Family',
  orphan: 'Orphan',
  flags: 'Flags',
  title: 'Title',
  monthly_amount_cents: 'Monthly amount',
}

export const fieldLabel = (f: string) => FIELD_LABEL[f] ?? f.replace(/_/g, ' ')

/** Render one value of a diff or a dossier field as short text. */
export const showValue = (field: string, value: unknown): string => {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number' && field.endsWith('_cents')) return money(value)
  if (field === 'needs' && Array.isArray(value)) {
    return value.map((n: any) => `${needLabel(n?.category)} ${money(n?.monthly_cents)}`).join(', ') || '—'
  }
  if (field === 'doc_type' && typeof value === 'string') return docLabel(value)
  if (field === 'category' && typeof value === 'string') return needLabel(value)
  if (Array.isArray(value)) return value.map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(', ') || '—'
  if (typeof value === 'object') return JSON.stringify(value)
  const text = String(value)
  // Enum values (shelter_camp, loss_of_breadwinner) read better as words.
  return /^[a-z]+(_[a-z]+)+$/.test(text) ? text.replace(/_/g, ' ') : text
}
