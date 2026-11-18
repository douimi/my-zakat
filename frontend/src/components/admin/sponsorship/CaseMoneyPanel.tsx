import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Coins, Plus } from 'lucide-react'
import { Modal, StatusBadge } from '..'
import { useToast } from '../../../contexts/ToastContext'
import { errorDetail, sponsorshipAdmin, type CreditMethod, type StaffCase } from '../../../utils/sponsorshipApi'
import { fmtDate, money, toCents } from './format'
import { Panel } from './ui'

const CREDIT_METHODS: { value: CreditMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'check', label: 'Check' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'other', label: 'Other' },
]
const PAYOUT_TONE = { planned: 'warning', confirmed: 'success', cancelled: 'neutral' } as const
const PAYOUT_LABEL = { planned: 'To send', confirmed: 'Received', cancelled: 'Cancelled' } as const

/** Money added by hand, and the case's monthly transfers. Admin only. */
const CaseMoneyPanel = ({ case: c, onUpdated }: { case: StaffCase; onUpdated: (c: StaffCase) => void }) => {
  const { showError, showSuccess } = useToast()
  const [adding, setAdding] = useState(false)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<CreditMethod>('cash')
  const [donor, setDonor] = useState('')
  const [receivedOn, setReceivedOn] = useState(new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const f = c.finances
  const credits = c.manual_credits || []
  const payouts = c.payouts || []

  const save = async () => {
    const cents = toCents(amount)
    if (!cents) { showError('Amount', 'Enter a positive amount.'); return }
    setBusy(true)
    try {
      onUpdated(await sponsorshipAdmin.addManualFunds(c.id, {
        amount_cents: cents, method, donor_name: donor.trim() || undefined,
        note: note.trim() || undefined, received_on: receivedOn,
      }))
      showSuccess('Money added', `${money(cents)} added to ${c.reference}'s balance.`)
      setAdding(false); setAmount(''); setDonor(''); setNote('')
    } catch (err) {
      showError('Could not add it', errorDetail(err) || 'Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Panel
        title="Money for this case"
        actions={
          <button type="button" className="btn-secondary btn-sm gap-1" onClick={() => setAdding(true)}>
            <Plus className="w-4 h-4" aria-hidden="true" /> Add money by hand
          </button>
        }
      >
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div><dt className="text-xs text-gray-500">From sponsors online</dt><dd className="font-semibold">{money(f.online_cents ?? f.collected_cents)}</dd></div>
          <div><dt className="text-xs text-gray-500">Added by hand</dt><dd className="font-semibold">{money(f.manual_cents ?? 0)}</dd></div>
          <div><dt className="text-xs text-gray-500">Prepared, not yet received</dt><dd className="font-semibold">{money(f.planned_cents ?? 0)}</dd></div>
          <div><dt className="text-xs text-gray-500">Available for next transfer</dt><dd className="font-semibold text-green-800">{money(f.available_cents ?? f.balance_cents)}</dd></div>
        </dl>
        <p className="mt-2 text-xs text-gray-500">
          Monthly amount {money(c.approved_monthly_cents)} · transfers are prepared in{' '}
          <Link to="/admin/sponsorship/transfers" className="link">Monthly transfers</Link>.
        </p>

        {payouts.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-semibold text-gray-900 mb-1">Transfers</p>
            <ul className="divide-y divide-gray-100 text-sm">
              {payouts.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <span>{p.period}{p.received_on ? ` · received ${fmtDate(p.received_on)}` : ''}{p.reference ? ` · ${p.reference}` : ''}</span>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums font-medium">{money(p.amount_cents)}</span>
                    <StatusBadge tone={PAYOUT_TONE[p.status]}>{PAYOUT_LABEL[p.status]}</StatusBadge>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {credits.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-semibold text-gray-900 mb-1">Added by hand</p>
            <ul className="divide-y divide-gray-100 text-sm">
              {credits.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <span className="text-gray-700">
                    {fmtDate(m.received_on)} · {CREDIT_METHODS.find((x) => x.value === m.method)?.label}
                    {m.donor_name ? ` · ${m.donor_name}` : ''}{m.note ? ` — ${m.note}` : ''}
                  </span>
                  <span className="tabular-nums font-medium">{money(m.amount_cents)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      {adding && (
        <Modal
          title={`Add money to ${c.reference}`}
          onClose={() => setAdding(false)}
          size="sm"
          footer={<>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setAdding(false)}>Cancel</button>
            <button type="button" className="btn-primary btn-sm gap-1" onClick={save} disabled={busy}>
              <Coins className="w-4 h-4" aria-hidden="true" /> {busy ? 'Saving…' : 'Add to balance'}
            </button>
          </>}
        >
          <div className="space-y-3">
            <p className="text-sm text-gray-600">For money received outside the site for this family: cash, a cheque, a partner's transfer. It becomes available for the next monthly transfer.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="mf-amount" className="label">Amount (USD)</label>
                <input id="mf-amount" className="input-field" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div>
                <label htmlFor="mf-method" className="label">Received as</label>
                <select id="mf-method" className="input-field" value={method} onChange={(e) => setMethod(e.target.value as CreditMethod)}>
                  {CREDIT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="mf-donor" className="label">From (optional, never shown to the family)</label>
              <input id="mf-donor" className="input-field" value={donor} maxLength={200} onChange={(e) => setDonor(e.target.value)} />
            </div>
            <div>
              <label htmlFor="mf-date" className="label">Received on</label>
              <input id="mf-date" type="date" className="input-field" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} />
            </div>
            <div>
              <label htmlFor="mf-note" className="label">Note (optional)</label>
              <input id="mf-note" className="input-field" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

export default CaseMoneyPanel
