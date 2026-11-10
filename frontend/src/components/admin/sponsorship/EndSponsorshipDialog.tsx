import { useState } from 'react'
import { Modal } from '..'
import { sponsorshipAdmin, errorDetail } from '../../../utils/sponsorshipApi'
import { END_REASON_LABEL, STAFF_END_REASONS, money } from './format'

export interface EndableSponsorship {
  id: number
  sponsor_name: string
  sponsor_email: string
  monthly_amount_cents: number
}

/**
 * Admin-only: end someone's sponsorship. Cancels the Stripe subscription
 * server-side, so it asks for a reason and says so plainly.
 */
const EndSponsorshipDialog = ({ sponsorship, reference, onClose, onDone }: {
  sponsorship: EndableSponsorship
  reference?: string
  onClose: () => void
  onDone: () => void
}) => {
  const [reason, setReason] = useState<string>('staff')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await sponsorshipAdmin.endSponsorship(sponsorship.id, { reason, note: note.trim() || undefined })
      onDone()
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status
      setError(status === 403 ? 'Only an administrator can end a sponsorship.' : errorDetail(e) || 'Could not end the sponsorship.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="End this sponsorship"
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn-danger btn-sm" onClick={submit} disabled={busy}>
            {busy ? 'Ending…' : 'End sponsorship'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-700">
          {sponsorship.sponsor_name} ({sponsorship.sponsor_email}) gives {money(sponsorship.monthly_amount_cents)} a month
          {reference ? <> to {reference}</> : null}. Their Stripe subscription is cancelled now; no further charges.
        </p>
        {error && <div role="alert" className="alert-error">{error}</div>}
        <div>
          <label htmlFor="end-reason" className="label">Reason</label>
          <select id="end-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
            {STAFF_END_REASONS.map((r) => <option key={r} value={r}>{END_REASON_LABEL[r]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="end-note" className="label">Internal note (optional)</label>
          <textarea id="end-note" className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
        </div>
      </div>
    </Modal>
  )
}

export default EndSponsorshipDialog
