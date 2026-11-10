import { useState } from 'react'
import { Lock, Plus, Wallet } from 'lucide-react'
import { EmptyState, LongText, Modal } from '..'
import { useToast } from '../../../contexts/ToastContext'
import { sponsorshipAdmin, errorDetail, type NeedCategory, type StaffCase } from '../../../utils/sponsorshipApi'
import { NEED_CATEGORIES } from '../../sponsorship/labels'
import { docLabel, fmtDate, money, needLabel, toCents } from './format'
import { Panel, Stat, httpStatus, type CaseTabProps } from './ui'

/** Money in, money out, and (admins only) recording a disbursement. */
const FundsTab = ({ case: c, isAdmin, onUpdated }: CaseTabProps) => {
  const [recording, setRecording] = useState(false)
  const f = c.finances

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="Collected" value={money(f.collected_cents)} hint="Every sponsor payment for this case" />
        <Stat label="Distributed" value={money(f.disbursed_cents)} />
        <Stat label="Balance to distribute" value={money(f.balance_cents)} tone={f.balance_cents > 0 ? 'warning' : 'default'} />
      </div>

      <Panel
        title={`Disbursements (${c.disbursements.length})`}
        flush
        actions={isAdmin ? (
          <button type="button" className="btn-primary btn-sm gap-1" onClick={() => setRecording(true)}>
            <Plus className="w-4 h-4" aria-hidden="true" /> Record a disbursement
          </button>
        ) : undefined}
      >
        {!isAdmin && (
          <p className="px-4 sm:px-6 pt-3 text-xs text-gray-500 flex items-center gap-1">
            <Lock className="w-3.5 h-3.5" aria-hidden="true" /> Only an administrator can record a disbursement.
          </p>
        )}
        {c.disbursements.length === 0 ? (
          <div className="p-4"><EmptyState icon={Wallet} title="Nothing distributed yet" body="Each distribution is shown to the sponsors and the family." /></div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {c.disbursements.map((d) => (
              <li key={d.id} className="px-4 sm:px-6 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900">
                    {needLabel(d.category)} <span className="text-gray-500 font-normal">· {fmtDate(d.disbursed_at)}{d.period ? ` · for ${d.period}` : ''}</span>
                  </p>
                  <p className="text-sm font-semibold tabular-nums">{money(d.amount_cents)}</p>
                </div>
                <LongText text={d.description} />
                {d.description_ar && <p className="text-sm text-gray-700 mt-1" dir="rtl" lang="ar">{d.description_ar}</p>}
                {d.internal_note && <p className="text-xs text-gray-500 mt-1">Internal: {d.internal_note}</p>}
                {d.receipt_document_id && <p className="text-xs text-gray-500">Receipt: document #{d.receipt_document_id}</p>}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {recording && isAdmin && (
        <DisbursementDialog case={c} onClose={() => setRecording(false)} onDone={(u) => { onUpdated(u); setRecording(false) }} />
      )}
    </div>
  )
}

const DisbursementDialog = ({ case: c, onClose, onDone }: { case: StaffCase; onClose: () => void; onDone: (c: StaffCase) => void }) => {
  const { showSuccess } = useToast()
  const today = new Date().toISOString().slice(0, 10)
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<NeedCategory>('food')
  const [period, setPeriod] = useState(today.slice(0, 7))
  const [description, setDescription] = useState('')
  const [descriptionAr, setDescriptionAr] = useState('')
  const [internalNote, setInternalNote] = useState('')
  const [date, setDate] = useState(today)
  const [receipt, setReceipt] = useState('')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cents = toCents(amount)
  const amountBad = !cents || cents <= 0
  const descBad = description.trim().length < 3
  const periodBad = Boolean(period) && !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)
  const overBalance = cents != null && cents > c.finances.balance_cents

  const submit = async () => {
    setTouched(true)
    if (amountBad || descBad || periodBad) return
    setBusy(true)
    setError(null)
    try {
      const updated = await sponsorshipAdmin.addDisbursement(c.id, {
        amount_cents: cents!, category, period: period || undefined, description: description.trim(),
        description_ar: descriptionAr.trim() || undefined, internal_note: internalNote.trim() || undefined,
        disbursed_at: date || undefined, receipt_document_id: receipt ? Number(receipt) : undefined,
      })
      showSuccess('Disbursement recorded', 'Sponsors see it on their page.')
      onDone(updated)
    } catch (e) {
      setError(httpStatus(e) === 403 ? 'Only an administrator can record a disbursement.' : errorDetail(e) || 'Could not record the disbursement.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`Record a disbursement · ${c.reference}`} size="lg" onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn-primary btn-sm" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Record disbursement'}</button>
        </>
      }>
      <div className="space-y-4">
        <p className="text-sm text-gray-600">Balance to distribute: <strong>{money(c.finances.balance_cents)}</strong>. The public description is shown to sponsors and the family.</p>
        {error && <div role="alert" className="alert-error">{error}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="db-amount" className="label">Amount (USD)</label>
            <input id="db-amount" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={touched && amountBad} />
            {touched && amountBad && <p className="field-error">Enter a positive amount.</p>}
            {!amountBad && overBalance && <p className="help-text text-amber-800">More than the current balance.</p>}
          </div>
          <div>
            <label htmlFor="db-category" className="label">Spent on</label>
            <select id="db-category" className="input" value={category} onChange={(e) => setCategory(e.target.value as NeedCategory)}>
              {NEED_CATEGORIES.map((n) => <option key={n} value={n}>{needLabel(n)}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="db-period" className="label">For the month (YYYY-MM, optional)</label>
            <input id="db-period" className="input" placeholder="2026-11" value={period} onChange={(e) => setPeriod(e.target.value)} aria-invalid={touched && periodBad} />
            {touched && periodBad && <p className="field-error">Use the form YYYY-MM.</p>}
          </div>
          <div>
            <label htmlFor="db-date" className="label">Date distributed</label>
            <input id="db-date" className="input" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="db-desc" className="label">Public description (English)</label>
            <textarea id="db-desc" className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000}
              placeholder="e.g. Monthly food basket and school supplies" aria-invalid={touched && descBad} />
            {touched && descBad && <p className="field-error">Describe the distribution: sponsors and the family read it.</p>}
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="db-desc-ar" className="label">Public description (Arabic, optional)</label>
            <textarea id="db-desc-ar" className="input" rows={2} dir="rtl" lang="ar" value={descriptionAr} onChange={(e) => setDescriptionAr(e.target.value)} maxLength={2000} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="db-note" className="label">Internal note (optional, staff only)</label>
            <textarea id="db-note" className="input" rows={2} value={internalNote} onChange={(e) => setInternalNote(e.target.value)} maxLength={2000} />
          </div>
          {c.documents.length > 0 && (
            <div className="sm:col-span-2">
              <label htmlFor="db-receipt" className="label">Receipt (optional, from the case documents)</label>
              <select id="db-receipt" className="input" value={receipt} onChange={(e) => setReceipt(e.target.value)}>
                <option value="">None</option>
                {c.documents.map((d) => <option key={d.id} value={d.id}>{docLabel(d.doc_type)} · {d.filename}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

export default FundsTab
