import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Modal } from '..'
import { sponsorshipAdmin, errorDetail, type StaffAction, type StaffCase } from '../../../utils/sponsorshipApi'
import {
  ACTION_LABEL, CLOSE_REASONS, CLOSE_REASON_LABEL, DANGER_ACTIONS, explainBlocker, isCommitted, money, plural,
  toCents, toDollars, type CloseReason,
} from './format'

/** What each action does, said before the reviewer commits to it. */
const INTRO: Record<StaffAction, string> = {
  start_review: 'You take this request on. The applicant sees that it is being reviewed.',
  request_info: 'The case goes back to the applicant, who can edit it and send more documents. They receive your message by email.',
  approve: 'The request is verified and accepted. Next you write the anonymous public profile and publish it.',
  reject: 'The request is refused. The applicant receives your message by email.',
  publish: 'The anonymous profile becomes visible to donors and open to sponsorship.',
  pause: 'The profile is hidden from new donors. Existing sponsorships continue.',
  close: 'The case is closed and leaves every list of open work.',
  reopen: 'The case comes back under review.',
}

const MESSAGE_REQUIRED: StaffAction[] = ['request_info', 'reject']

/**
 * The dialog behind every status button. Asks for what the action needs — a
 * message to the applicant (required to request information or reject), an
 * approved amount, a close reason and explicit consent to end sponsorships —
 * and shows the server's blockers if it still refuses.
 */
const TransitionDialog = ({ action, case: c, isAdmin, onClose, onDone }: {
  action: StaffAction
  case: StaffCase
  isAdmin: boolean
  onClose: () => void
  onDone: (updated: StaffCase) => void
}) => {
  const [message, setMessage] = useState('')
  const [note, setNote] = useState('')
  const [amount, setAmount] = useState(toDollars(c.approved_monthly_cents ?? c.requested_monthly_cents))
  const [closeReason, setCloseReason] = useState<CloseReason | ''>('')
  const [endSponsorships, setEndSponsorships] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [blockers, setBlockers] = useState<string[]>([])
  const [touched, setTouched] = useState(false)

  const active = c.sponsorships.filter((s) => isCommitted(s.status)).length
  const messageRequired = MESSAGE_REQUIRED.includes(action)
  const messageMissing = messageRequired && !message.trim()
  const amountCents = toCents(amount)
  const amountInvalid = action === 'approve' && (amountCents == null || amountCents <= 0)
  const closeMissing = action === 'close' && !closeReason
  const needsEndConsent = action === 'close' && active > 0
  const endBlocked = needsEndConsent && (!isAdmin || !endSponsorships)
  const invalid = messageMissing || amountInvalid || closeMissing || endBlocked

  const submit = async () => {
    setTouched(true)
    if (invalid) return
    setBusy(true)
    setError(null)
    setBlockers([])
    try {
      const updated = await sponsorshipAdmin.transition(c.id, {
        action,
        message: message.trim() || undefined,
        note: note.trim() || undefined,
        ...(action === 'approve' && amountCents ? { approved_monthly_cents: amountCents } : {}),
        ...(action === 'close' ? { close_reason: closeReason || undefined, end_sponsorships: needsEndConsent && endSponsorships } : {}),
      })
      onDone(updated)
    } catch (e) {
      const resp = (e as { response?: { status?: number; data?: { detail?: { blockers?: string[] } } } })?.response
      if (resp?.status === 403) setError('Only an administrator can end sponsorships.')
      else setError(errorDetail(e) || 'The change could not be made.')
      const list = resp?.data?.detail && typeof resp.data.detail === 'object' ? resp.data.detail.blockers : undefined
      if (Array.isArray(list)) setBlockers(list)
    } finally {
      setBusy(false)
    }
  }

  const danger = DANGER_ACTIONS.includes(action)

  return (
    <Modal
      title={`${ACTION_LABEL[action]} · ${c.reference}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className={danger ? 'btn-danger btn-sm' : 'btn-primary btn-sm'} onClick={submit}
            disabled={busy || (touched && invalid)}>
            {busy ? 'Saving…' : ACTION_LABEL[action]}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-700">{INTRO[action]}</p>

        {error && (
          <div role="alert" className="alert-error flex-col">
            <p className="font-semibold">{error}</p>
            {blockers.length > 0 && (
              <ul className="list-disc pl-5 space-y-0.5">
                {blockers.map((b) => <li key={b}>{explainBlocker(b).text}</li>)}
              </ul>
            )}
          </div>
        )}

        {action === 'approve' && (
          <div>
            <label htmlFor="tr-amount" className="label">Approved monthly amount (USD)</label>
            <input id="tr-amount" className="input" inputMode="decimal" value={amount}
              onChange={(e) => setAmount(e.target.value)} aria-invalid={touched && amountInvalid}
              aria-describedby="tr-amount-help" />
            <p id="tr-amount-help" className="help-text">Requested: {money(c.requested_monthly_cents)} a month. This is what donors will be asked to cover.</p>
            {touched && amountInvalid && <p className="field-error">Enter a positive amount.</p>}
          </div>
        )}

        {action === 'close' && (
          <>
            <div>
              <label htmlFor="tr-close" className="label">Why is the case closed?</label>
              <select id="tr-close" className="input" value={closeReason}
                onChange={(e) => setCloseReason(e.target.value as CloseReason)} aria-invalid={touched && closeMissing}>
                <option value="">Choose a reason…</option>
                {CLOSE_REASONS.map((r) => <option key={r} value={r}>{CLOSE_REASON_LABEL[r]}</option>)}
              </select>
              {touched && closeMissing && <p className="field-error">Choose a reason.</p>}
            </div>
            {needsEndConsent && (isAdmin ? (
              <div className="alert-warning">
                <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1" checked={endSponsorships}
                    onChange={(e) => setEndSponsorships(e.target.checked)} />
                  <span>
                    End the {plural(active, 'active sponsorship')} (their Stripe subscriptions are cancelled and sponsors emailed)
                  </span>
                </label>
              </div>
            ) : (
              <div role="alert" className="alert-warning">
                <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />
                <span>
                  This case has {plural(active, 'active sponsorship')}. Closing it ends them, which only an administrator can do.
                </span>
              </div>
            ))}
          </>
        )}

        <div>
          <label htmlFor="tr-message" className="label">
            Message to the applicant {messageRequired ? '(required)' : '(optional)'}
          </label>
          <textarea id="tr-message" className="input" rows={messageRequired ? 5 : 3} value={message}
            onChange={(e) => setMessage(e.target.value)} maxLength={5000}
            aria-invalid={touched && messageMissing} aria-describedby="tr-message-help" />
          <p id="tr-message-help" className="help-text">
            {action === 'request_info'
              ? 'Say exactly what is missing or needs correcting. They read it in their space and by email.'
              : action === 'reject'
                ? 'Explain the decision respectfully. They read it in their space and by email.'
                : 'Shown in the applicant’s timeline.'}
          </p>
          {touched && messageMissing && <p className="field-error">Write the message the applicant will receive.</p>}
        </div>

        <div>
          <label htmlFor="tr-note" className="label">Internal note (optional, staff only)</label>
          <textarea id="tr-note" className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={5000} />
        </div>
      </div>
    </Modal>
  )
}

export default TransitionDialog
