import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Link2, Unlink } from 'lucide-react'
import { StatusBadge } from '..'
import { useToast } from '../../../contexts/ToastContext'
import { sponsorshipAdmin, errorDetail, type StaffCase } from '../../../utils/sponsorshipApi'
import { DUPLICATE_REASON_LABEL, STATUS_LABEL, STATUS_TONE, fmtDate } from './format'
import { Panel, type CaseTabProps } from './ui'

const RelatedList = ({ items, empty }: { items: StaffCase['related']; empty: string }) =>
  items.length === 0 ? <p className="text-sm text-gray-600">{empty}</p> : (
    <ul className="divide-y divide-gray-100">
      {items.map((r) => (
        <li key={r.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
          <Link to={`/admin/sponsorship/cases/${r.id}`} className="link text-sm">
            {r.reference} · {r.kind === 'family' ? 'Family' : 'Orphan'}
          </Link>
          <StatusBadge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</StatusBadge>
        </li>
      ))}
    </ul>
  )

/** Family ↔ orphans, and possible duplicates with the "reviewed" action. */
const LinksTab = ({ case: c, onUpdated, refresh }: CaseTabProps) => {
  const { showError, showSuccess } = useToast()
  const [reference, setReference] = useState('')
  const [dupNote, setDupNote] = useState('')
  const [busy, setBusy] = useState(false)

  const family = c.related.filter((r) => r.relation === 'family')
  const siblings = c.related.filter((r) => r.relation === 'sibling')
  const orphans = c.related.filter((r) => r.relation === 'orphan')

  const link = async (ref: string | null) => {
    setBusy(true)
    try {
      onUpdated(await sponsorshipAdmin.link(c.id, ref))
      setReference('')
      showSuccess(ref ? `Linked to ${ref.toUpperCase()}` : 'Unlinked from its family')
    } catch (e) {
      showError(ref ? 'Could not link' : 'Could not unlink', errorDetail(e) || undefined)
    } finally {
      setBusy(false)
    }
  }

  const clearDuplicates = async () => {
    setBusy(true)
    try {
      await sponsorshipAdmin.clearDuplicates(c.id, dupNote.trim() || undefined)
      setDupNote('')
      showSuccess('Duplicates marked as reviewed')
      refresh()
    } catch (e) {
      showError('Could not record the review', errorDetail(e) || undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {c.kind === 'orphan' ? (
        <>
          <Panel title="Family">
            <RelatedList items={family} empty="Not linked to a family case." />
            <div className="mt-3 flex flex-col sm:flex-row gap-2 sm:items-end">
              <div className="flex-1 max-w-xs">
                <label htmlFor="link-ref" className="label">{family.length ? 'Link to another family (reference)' : 'Link to a family (reference)'}</label>
                <input id="link-ref" className="input uppercase" value={reference} maxLength={12}
                  onChange={(e) => setReference(e.target.value)} placeholder="e.g. F-7K2Q9M" />
              </div>
              <button type="button" className="btn-secondary btn-sm gap-1" disabled={busy || !reference.trim()} onClick={() => link(reference.trim())}>
                <Link2 className="w-4 h-4" aria-hidden="true" /> Link
              </button>
              {family.length > 0 && (
                <button type="button" className="btn-ghost btn-sm gap-1" disabled={busy} onClick={() => link(null)}>
                  <Unlink className="w-4 h-4" aria-hidden="true" /> Unlink
                </button>
              )}
            </div>
          </Panel>
          <Panel title={`Brothers and sisters (${siblings.length})`}>
            <RelatedList items={siblings} empty="No other orphan of the same family." />
          </Panel>
        </>
      ) : (
        <Panel title={`Orphans of this family (${orphans.length})`}>
          <RelatedList items={orphans} empty="No orphan case is linked to this family." />
          <p className="help-text">To link an orphan, open the orphan’s case and enter this family’s reference ({c.reference}).</p>
        </Panel>
      )}

      <Panel title="Possible duplicates">
        {c.duplicate_flags.length === 0 ? (
          <p className="text-sm text-gray-600">No other case looks like this one.</p>
        ) : (
          <div className="space-y-3">
            <ul className="divide-y divide-gray-100">
              {c.duplicate_flags.map((f, i) => (
                <li key={`${f.reference}-${i}`} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                  {f.case_id
                    ? <Link to={`/admin/sponsorship/cases/${f.case_id}`} className="link">{f.reference}</Link>
                    : <span>{f.reference}</span>}
                  <span className="text-gray-600">{DUPLICATE_REASON_LABEL[f.reason] ?? f.reason}</span>
                </li>
              ))}
            </ul>
            {c.duplicates_reviewed_at ? (
              <p className="text-sm text-green-800 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Reviewed on {fmtDate(c.duplicates_reviewed_at)}
              </p>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                <div className="flex-1">
                  <label htmlFor="dup-note" className="label">What you checked (optional, kept in the history)</label>
                  <input id="dup-note" className="input" value={dupNote} onChange={(e) => setDupNote(e.target.value)} maxLength={5000}
                    placeholder="e.g. Same family, filed by two associations: the other case is closed." />
                </div>
                <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={clearDuplicates}>Mark reviewed</button>
              </div>
            )}
          </div>
        )}
      </Panel>
    </div>
  )
}

export default LinksTab
