/**
 * /admin/sponsorship/transfers — the monthly transfers to sponsored families.
 *
 * The month's routine, in the order it happens:
 *   1. "Prepare this month": one line per family or orphan that holds money,
 *      for its monthly amount capped at what is left (so a case stops
 *      appearing on its own once its money runs out). Safe to run again.
 *   2. "Download Excel": who to pay, where, how much — the sheet to send from.
 *   3. "Confirm received", line by line or for a selection: only then does the
 *      amount leave the case's balance. It is recorded as a distribution, so
 *      the sponsors and the family see it.
 *
 * Admin-only, like every action that moves money.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from 'react-query'
import { Banknote, CheckCircle2, Download, Pencil, RefreshCw, Send, XCircle } from 'lucide-react'
import { EmptyState, ErrorState, LoadingBlock, Modal, PageHeader, StatusBadge } from '../../../components/admin'
import { useToast } from '../../../contexts/ToastContext'
import { useAuthStore } from '../../../store/authStore'
import {
  errorDetail, sponsorshipAdmin, type PayoutMethod, type PayoutPeriod, type PayoutRow,
} from '../../../utils/sponsorshipApi'
import { money, toCents } from '../../../components/admin/sponsorship/format'

const METHODS: { value: PayoutMethod; label: string }[] = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'mobile_money', label: 'Mobile money / money transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'check', label: 'Check' },
  { value: 'other', label: 'Other' },
]
const methodLabel = (m: string | null) => METHODS.find((x) => x.value === m)?.label ?? '—'

const thisMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const today = () => new Date().toISOString().slice(0, 10)

const STATUS = {
  planned: { label: 'To send', tone: 'warning' as const },
  confirmed: { label: 'Received', tone: 'success' as const },
  cancelled: { label: 'Cancelled', tone: 'neutral' as const },
}

const ConfirmDialog = ({ row, onClose, onDone }: { row: PayoutRow; onClose: () => void; onDone: (p: PayoutPeriod) => void }) => {
  const { showError } = useToast()
  const [method, setMethod] = useState<PayoutMethod>(row.method || 'bank_transfer')
  const [reference, setReference] = useState('')
  const [receivedOn, setReceivedOn] = useState(today())
  const [amount, setAmount] = useState(String(row.amount_cents / 100))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    const cents = toCents(amount)
    if (!cents || cents <= 0 || cents > row.amount_cents) {
      showError('Amount', `Enter an amount between $0 and ${money(row.amount_cents)}.`)
      return
    }
    setBusy(true)
    try {
      onDone(await sponsorshipAdmin.confirmPayout(row.payout_id, {
        method, reference: reference.trim() || undefined, received_on: receivedOn,
        amount_cents: cents, note: note.trim() || undefined,
      }))
    } catch (err) {
      showError('Could not confirm', errorDetail(err) || 'Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Confirm received — ${row.reference}`}
      onClose={onClose}
      size="sm"
      footer={<>
        <button type="button" className="btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary btn-sm gap-1" onClick={save} disabled={busy}>
          <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> {busy ? 'Saving…' : 'Confirm received'}
        </button>
      </>}
    >
      <div className="space-y-3">
        <p className="text-sm text-gray-700">{row.recipient}{row.child ? ` (for ${row.child})` : ''} · planned {money(row.amount_cents)}</p>
        <div>
          <label htmlFor="pc-method" className="label">How it was sent</label>
          <select id="pc-method" className="input-field" value={method} onChange={(e) => setMethod(e.target.value as PayoutMethod)}>
            {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="pc-amount" className="label">Amount received (USD)</label>
            <input id="pc-amount" className="input-field" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label htmlFor="pc-date" className="label">Received on</label>
            <input id="pc-date" type="date" className="input-field" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} />
          </div>
        </div>
        <div>
          <label htmlFor="pc-ref" className="label">Transfer reference (optional)</label>
          <input id="pc-ref" className="input-field" value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} />
        </div>
        <div>
          <label htmlFor="pc-note" className="label">Note (optional, staff only)</label>
          <input id="pc-note" className="input-field" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <p className="text-xs text-gray-500">
          A lower amount than planned records what actually arrived; the rest stays in the case's balance for next month.
        </p>
      </div>
    </Modal>
  )
}

const AdminSponsorshipTransfers = () => {
  const isAdmin = useAuthStore((s) => s.isAdmin)
  const { showSuccess, showError } = useToast()
  const queryClient = useQueryClient()
  const [period, setPeriod] = useState(thisMonth())
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkMethod, setBulkMethod] = useState<PayoutMethod>('bank_transfer')
  const [bulkDate, setBulkDate] = useState(today())
  const [confirming, setConfirming] = useState<PayoutRow | null>(null)
  const [busy, setBusy] = useState(false)

  const key = ['sponsorship-payouts', period]
  const { data, isLoading, isError, refetch } = useQuery(key, () => sponsorshipAdmin.payouts(period), { enabled: isAdmin })
  const setData = (next: PayoutPeriod) => {
    queryClient.setQueryData(key, next)
    setSelected(new Set())
  }

  const planned = useMemo(() => (data?.items || []).filter((r) => r.status === 'planned'), [data])

  const prepare = async () => {
    setBusy(true)
    try {
      const res = await sponsorshipAdmin.planPayouts(period)
      setData(res)
      showSuccess('Month prepared', res.created === 0
        ? 'Nothing new to add: every case with money already has a transfer this month.'
        : `${res.created} transfer${res.created === 1 ? '' : 's'} added.`)
    } catch (err) {
      showError('Could not prepare the month', errorDetail(err) || 'Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const download = async () => {
    try {
      const blob = await sponsorshipAdmin.exportPayouts(period)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `MyZakat_transfers_${period}.xlsx`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
    } catch (err) {
      showError('Could not export', errorDetail(err) || 'Please try again.')
    }
  }

  const confirmSelected = async () => {
    setBusy(true)
    try {
      const res = await sponsorshipAdmin.confirmPayouts([...selected], { method: bulkMethod, received_on: bulkDate })
      setData(res)
      if (res.refused.length) showError('Some lines were not confirmed', res.refused.map((r) => `#${r.id}: ${r.reason}`).join(' · '))
      else showSuccess('Confirmed', 'The amounts have left the families’ balances.')
    } catch (err) {
      showError('Could not confirm', errorDetail(err) || 'Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const editAmount = async (row: PayoutRow) => {
    const value = window.prompt(`New amount for ${row.reference} (USD)`, String(row.amount_cents / 100))
    if (value == null) return
    const cents = toCents(value)
    if (!cents) { showError('Amount', 'Enter a positive amount.'); return }
    try {
      setData(await sponsorshipAdmin.editPayout(row.payout_id, { amount_cents: cents }))
    } catch (err) {
      showError('Could not change it', errorDetail(err) || 'Please try again.')
    }
  }

  const cancel = async (row: PayoutRow) => {
    const note = window.prompt(`Cancel the transfer to ${row.reference}? Reason (optional)`, '')
    if (note == null) return
    try {
      setData(await sponsorshipAdmin.cancelPayout(row.payout_id, note || undefined))
    } catch (err) {
      showError('Could not cancel it', errorDetail(err) || 'Please try again.')
    }
  }

  if (!isAdmin) {
    return <EmptyState icon={Banknote} title="Administrators only" body="Monthly transfers move money, so only an administrator can prepare or confirm them." />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monthly transfers"
        icon={Send}
        count={data?.totals.lines}
        description="Prepare each month's transfers to sponsored families, export them, and confirm what was received."
        actions={<>
          <label className="sr-only" htmlFor="transfer-month">Month</label>
          <input id="transfer-month" type="month" className="input-field !w-auto !py-2" value={period}
            onChange={(e) => e.target.value && setPeriod(e.target.value)} />
          <button type="button" className="btn-primary btn-sm gap-1" onClick={prepare} disabled={busy}>
            <RefreshCw className="w-4 h-4" aria-hidden="true" /> Prepare this month
          </button>
          <button type="button" className="btn-secondary btn-sm gap-1" onClick={download} disabled={!data?.items.length}>
            <Download className="w-4 h-4" aria-hidden="true" /> Download Excel
          </button>
        </>}
        help={<>
          <p>Each case gets its approved monthly amount, capped at the money it still holds — sponsor payments plus anything added by hand, minus what was already received. A case with no money left simply does not appear.</p>
          <p>Preparing again adds only cases that are missing (for example after new money arrived). A cancelled line can be prepared again.</p>
          <p>Nothing leaves a balance until you confirm it was received. It is then recorded as a "Monthly support" distribution, visible to the sponsors and to the family.</p>
        </>}
      />

      {isLoading && <LoadingBlock />}
      {isError && <ErrorState message="Could not load the transfers." onRetry={() => refetch()} />}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="card !p-4"><p className="text-xs text-gray-500">Still to send</p><p className="text-xl font-bold">{money(data.totals.planned_cents)}</p></div>
            <div className="card !p-4"><p className="text-xs text-gray-500">Confirmed received</p><p className="text-xl font-bold text-green-800">{money(data.totals.confirmed_cents)}</p></div>
            <div className="card !p-4"><p className="text-xs text-gray-500">Lines</p><p className="text-xl font-bold">{data.totals.lines}</p></div>
          </div>

          {selected.size > 0 && (
            <div className="sticky top-2 z-10 flex flex-wrap items-end gap-3 rounded-lg border border-primary-200 bg-primary-50 p-3">
              <p className="text-sm font-semibold text-primary-900">{selected.size} selected</p>
              <div>
                <label htmlFor="bulk-method" className="block text-xs text-gray-700">Sent by</label>
                <select id="bulk-method" className="input-field !py-1.5" value={bulkMethod} onChange={(e) => setBulkMethod(e.target.value as PayoutMethod)}>
                  {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="bulk-date" className="block text-xs text-gray-700">Received on</label>
                <input id="bulk-date" type="date" className="input-field !py-1.5" value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} />
              </div>
              <button type="button" className="btn-primary btn-sm gap-1" onClick={confirmSelected} disabled={busy}>
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Confirm {selected.size} as received
              </button>
            </div>
          )}

          {data.items.length === 0 ? (
            <EmptyState icon={Banknote} title={`No transfers for ${period} yet`}
              body="Prepare the month to list every family and orphan that holds money." />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                  <tr>
                    <th className="px-3 py-2 text-start">
                      <input type="checkbox" aria-label="Select every transfer still to send"
                        checked={planned.length > 0 && planned.every((r) => selected.has(r.payout_id))}
                        onChange={(e) => setSelected(e.target.checked ? new Set(planned.map((r) => r.payout_id)) : new Set())} />
                    </th>
                    <th className="px-3 py-2 text-start">Case</th>
                    <th className="px-3 py-2 text-start">Recipient</th>
                    <th className="px-3 py-2 text-start">Where</th>
                    <th className="px-3 py-2 text-end">Monthly</th>
                    <th className="px-3 py-2 text-end">Balance</th>
                    <th className="px-3 py-2 text-end">To send</th>
                    <th className="px-3 py-2 text-start">Status</th>
                    <th className="px-3 py-2"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.items.map((r) => (
                    <tr key={r.payout_id} className={r.status === 'confirmed' ? 'bg-green-50/40' : ''}>
                      <td className="px-3 py-2">
                        {r.status === 'planned' && (
                          <input type="checkbox" aria-label={`Select ${r.reference}`} checked={selected.has(r.payout_id)}
                            onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(r.payout_id); else n.delete(r.payout_id); return n })} />
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <Link to={`/admin/sponsorship/cases/${r.case_id}?tab=funds`} className="font-mono text-primary-700 hover:underline">{r.reference}</Link>
                        <span className="block text-xs text-gray-500">{r.kind === 'family' ? 'Family' : 'Orphan'}{r.organization ? ` · ${r.organization}` : ''}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-medium text-gray-900" dir="auto">{r.recipient}</span>
                        {r.child && <span className="block text-xs text-gray-500" dir="auto">for {r.child}</span>}
                        {r.phone && <span className="block text-xs text-gray-500" dir="ltr">{r.phone}</span>}
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        <span dir="auto">{[r.city, r.country].filter(Boolean).join(', ')}</span>
                        {r.address && <span className="block max-w-[14rem] truncate text-xs text-gray-500" dir="auto" title={r.address}>{r.address}</span>}
                      </td>
                      <td className="px-3 py-2 text-end tabular-nums">{money(r.monthly_cents)}</td>
                      <td className="px-3 py-2 text-end tabular-nums text-gray-600">
                        {money(r.balance_before_cents)}
                        <span className="block text-xs">→ {money(r.balance_after_cents)}</span>
                      </td>
                      <td className="px-3 py-2 text-end font-semibold tabular-nums">{money(r.amount_cents)}</td>
                      <td className="px-3 py-2">
                        <StatusBadge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</StatusBadge>
                        {r.status === 'confirmed' && (
                          <span className="block text-xs text-gray-500">{methodLabel(r.method)}{r.received_on ? ` · ${r.received_on}` : ''}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-end">
                        {r.status === 'planned' && (
                          <span className="inline-flex gap-1">
                            <button type="button" className="btn-primary btn-sm !px-2" onClick={() => setConfirming(r)}>Received</button>
                            <button type="button" className="btn-ghost btn-sm !px-2" aria-label={`Change the amount for ${r.reference}`} onClick={() => editAmount(r)}>
                              <Pencil className="w-4 h-4" aria-hidden="true" />
                            </button>
                            <button type="button" className="btn-ghost btn-sm !px-2 text-red-700" aria-label={`Cancel the transfer to ${r.reference}`} onClick={() => cancel(r)}>
                              <XCircle className="w-4 h-4" aria-hidden="true" />
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {confirming && (
        <ConfirmDialog row={confirming} onClose={() => setConfirming(null)}
          onDone={(p) => { setData(p); setConfirming(null); showSuccess('Confirmed', 'The amount has left the balance.') }} />
      )}
    </div>
  )
}

export default AdminSponsorshipTransfers
