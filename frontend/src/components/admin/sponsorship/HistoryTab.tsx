import { useMemo, useState } from 'react'
import { ArrowRight, ChevronRight, History } from 'lucide-react'
import { clsx } from 'clsx'
import { EmptyState, StatusBadge } from '..'
import { useToast } from '../../../contexts/ToastContext'
import { sponsorshipAdmin, errorDetail, type CaseStatus, type StaffEvent } from '../../../utils/sponsorshipApi'
import {
  EVENT_GROUPS, STATUS_LABEL, VISIBILITY_LABEL, eventLabel, fieldLabel, fmtDateTime, showValue,
} from './format'
import { Panel, firstLine, type CaseTabProps } from './ui'

/** Keys whose value is an [old, new] pair even outside an "edited" event. */
const PAIR_KEYS = new Set(['review_status', 'family', 'photo', 'approved_monthly_cents'])

const actorOf = (e: StaffEvent): string => {
  switch (e.actor_type) {
    case 'staff': return e.actor_email || e.actor_label || 'Staff'
    case 'applicant': return `Applicant${e.actor_label ? ` (${e.actor_label})` : ''}`
    case 'sponsor': return `Sponsor${e.actor_label ? ` (${e.actor_label})` : ''}`
    default: return e.actor_label === 'stripe' ? 'Stripe' : 'System'
  }
}

const statusName = (s: string | null) => (s ? STATUS_LABEL[s as CaseStatus] ?? s : '—')

/** The `changes` of an event: a field-by-field diff for edits, plain facts otherwise. */
const Changes = ({ e }: { e: StaffEvent }) => {
  const entries = Object.entries(e.changes || {})
  if (entries.length === 0) return null
  const isDiff = (k: string, v: unknown) =>
    Array.isArray(v) && v.length === 2 && (e.type === 'edited' || e.type === 'resubmitted' || PAIR_KEYS.has(k))
  return (
    <dl className="text-sm space-y-1">
      {entries.map(([k, v]) => (
        <div key={k} className="grid grid-cols-1 sm:grid-cols-[10rem_1fr] gap-x-3">
          <dt className="text-xs font-medium text-gray-500 sm:pt-0.5">{fieldLabel(k)}</dt>
          <dd className="min-w-0 break-words">
            {isDiff(k, v) ? (
              <span className="inline-flex flex-wrap items-start gap-1.5">
                <del className="text-red-800 bg-red-50 px-1 rounded whitespace-pre-wrap">{showValue(k, (v as unknown[])[0])}</del>
                <ArrowRight className="w-3.5 h-3.5 mt-1 text-gray-400 shrink-0" aria-label="changed to" />
                <ins className="text-green-800 bg-green-50 px-1 rounded no-underline whitespace-pre-wrap">{showValue(k, (v as unknown[])[1])}</ins>
              </span>
            ) : k === 'flags' && Array.isArray(v) ? (
              v.map((f: any) => f?.reference ?? JSON.stringify(f)).join(', ')
            ) : showValue(k, v)}
          </dd>
        </div>
      ))}
    </dl>
  )
}

const EventRow = ({ e }: { e: StaffEvent }) => {
  const [open, setOpen] = useState(false)
  const hasDetail = Boolean(e.message || e.note || Object.keys(e.changes || {}).length)
  const summary = e.message ? firstLine(e.message, 90) : e.note ? firstLine(e.note, 90) : ''
  return (
    <li className="border-b border-gray-100 last:border-b-0">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={hasDetail ? open : undefined}
        disabled={!hasDetail}
        className={clsx('w-full text-left px-4 sm:px-6 py-2.5 flex items-start gap-2', hasDetail && 'hover:bg-gray-50')}>
        <ChevronRight className={clsx('w-4 h-4 mt-0.5 shrink-0 transition-transform', hasDetail ? 'text-gray-400' : 'text-transparent', open && 'rotate-90')} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
            <span className="font-medium text-gray-900">{eventLabel(e.type)}</span>
            {(e.from_status || e.to_status) && (
              <span className="text-xs text-gray-600">{statusName(e.from_status)} → {statusName(e.to_status)}</span>
            )}
            {e.visibility !== 'internal' && <StatusBadge tone="info">{VISIBILITY_LABEL[e.visibility]}</StatusBadge>}
          </span>
          <span className="block text-xs text-gray-500">{fmtDateTime(e.created_at)} · {actorOf(e)}</span>
          {!open && summary && <span className="block text-xs text-gray-600 truncate">{summary}</span>}
        </span>
      </button>
      {open && (
        <div className="px-4 sm:px-6 pb-3 pl-10 sm:pl-12 space-y-2">
          {e.message && (
            <div>
              <p className="text-xs font-medium text-gray-500">
                Message {e.visibility === 'sponsor' ? 'shown to sponsors' : e.visibility === 'applicant' ? 'sent to the applicant' : ''}
              </p>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{e.message}</p>
            </div>
          )}
          {e.note && (
            <div>
              <p className="text-xs font-medium text-gray-500">Internal note</p>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{e.note}</p>
            </div>
          )}
          <Changes e={e} />
        </div>
      )}
    </li>
  )
}

/** Every event on the case, newest first, folded to one line each. */
const HistoryTab = ({ case: c, refresh }: CaseTabProps) => {
  const { showError, showSuccess } = useToast()
  const [group, setGroup] = useState('')
  const [visibility, setVisibility] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const events = useMemo(() => c.history.filter((e) =>
    (!group || EVENT_GROUPS[group].types.includes(e.type)) && (!visibility || e.visibility === visibility),
  ), [c.history, group, visibility])

  const addNote = async () => {
    if (!note.trim()) return
    setBusy(true)
    try {
      await sponsorshipAdmin.note(c.id, note.trim())
      setNote('')
      showSuccess('Note added')
      refresh()
    } catch (e) {
      showError('Could not add the note', errorDetail(e) || undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <Panel title="Add an internal note">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <div className="flex-1">
            <label htmlFor="hist-note" className="label">Note (staff only)</label>
            <textarea id="hist-note" className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={5000}
              placeholder="A call with the guardian, a visit, something a colleague should know…" />
          </div>
          <button type="button" className="btn-secondary btn-sm" onClick={addNote} disabled={busy || !note.trim()}>Add note</button>
        </div>
      </Panel>

      <Panel
        title={`History (${events.length}${events.length !== c.history.length ? ` of ${c.history.length}` : ''})`}
        flush
        actions={
          <>
            <label htmlFor="hist-group" className="sr-only">Filter by kind of event</label>
            <select id="hist-group" className="input py-1.5 text-sm w-auto" value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="">All events</option>
              {Object.entries(EVENT_GROUPS).map(([k, g]) => <option key={k} value={k}>{g.label}</option>)}
            </select>
            <label htmlFor="hist-vis" className="sr-only">Filter by who can see it</label>
            <select id="hist-vis" className="input py-1.5 text-sm w-auto" value={visibility} onChange={(e) => setVisibility(e.target.value)}>
              <option value="">Any visibility</option>
              {Object.entries(VISIBILITY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </>
        }
      >
        {events.length === 0
          ? <div className="p-4"><EmptyState icon={History} title="No event matches" /></div>
          : <ul>{events.map((e) => <EventRow key={e.id} e={e} />)}</ul>}
      </Panel>
    </div>
  )
}

export default HistoryTab
