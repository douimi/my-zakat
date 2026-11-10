import { useState } from 'react'
import { HeartHandshake } from 'lucide-react'
import { Collapsible, EmptyState, StatusBadge } from '..'
import { useToast } from '../../../contexts/ToastContext'
import type { StaffSponsorship } from '../../../utils/sponsorshipApi'
import CoverageBar from './CoverageBar'
import EndSponsorshipDialog from './EndSponsorshipDialog'
import {
  END_REASON_LABEL, SPONSORSHIP_LABEL, SPONSORSHIP_TONE, fmtDate, isRunning, money, plural,
} from './format'
import { Panel, type CaseTabProps } from './ui'

/** Who sponsors this case, how much, since when, and every payment. */
const SponsorshipsTab = ({ case: c, isAdmin, refresh }: CaseTabProps) => {
  const { showSuccess } = useToast()
  const [ending, setEnding] = useState<StaffSponsorship | null>(null)

  return (
    <div className="space-y-4">
      {(c.status === 'published' || c.status === 'paused') && (
        <Panel title="Coverage">
          <div className="max-w-md"><CoverageBar coverage={c.coverage} /></div>
          <p className="mt-2 text-sm text-gray-600">
            {plural(c.coverage.sponsors, 'active sponsor')} · {money(c.coverage.remaining_cents)} a month still needed
            {c.coverage.available_cents !== c.coverage.remaining_cents && ` (${money(c.coverage.available_cents)} after open checkouts)`}
          </p>
        </Panel>
      )}

      {c.sponsorships.length === 0 ? (
        <EmptyState icon={HeartHandshake} title="No sponsorship yet"
          body={c.status === 'published' ? 'Donors can sponsor this case from its public page.' : 'Sponsorships start once the case is published.'} />
      ) : (
        <Panel title={`Sponsorships (${c.sponsorships.length})`} flush>
          {c.sponsorships.map((s) => {
            const total = s.payments.reduce((sum, p) => sum + p.amount_cents, 0)
            return (
              <div key={s.id} className="border-b border-gray-100 last:border-b-0">
                <div className="px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 flex flex-wrap items-center gap-2">
                      {s.sponsor_name}
                      <StatusBadge tone={SPONSORSHIP_TONE[s.status]}>{SPONSORSHIP_LABEL[s.status]}</StatusBadge>
                    </p>
                    <p className="text-xs text-gray-500">
                      <a className="link" href={`mailto:${s.sponsor_email}`}>{s.sponsor_email}</a>
                      {' · '}{money(s.monthly_amount_cents)} a month
                      {' · '}since {fmtDate(s.started_at || s.created_at)}
                      {s.last_payment_at && <> · last paid {fmtDate(s.last_payment_at)}</>}
                      {' · '}given {money(total)}
                    </p>
                    {s.ended_at && (
                      <p className="text-xs text-gray-600 mt-0.5">
                        Ended {fmtDate(s.ended_at)}{s.end_reason ? ` · ${END_REASON_LABEL[s.end_reason] ?? s.end_reason}` : ''}
                        {s.ended_by ? ` · by ${s.ended_by}` : ''}{s.end_note ? ` · “${s.end_note}”` : ''}
                      </p>
                    )}
                  </div>
                  {isAdmin && isRunning(s.status) && (
                    <button type="button" className="btn-ghost btn-sm text-red-700" onClick={() => setEnding(s)}>End sponsorship</button>
                  )}
                </div>
                {s.payments.length > 0 && (
                  <Collapsible title={`Payments (${s.payments.length})`}
                    preview={s.payments.slice(0, 3).map((p) => `${fmtDate(p.paid_at)} ${money(p.amount_cents)}`).join(' · ')}>
                    <ul className="text-sm divide-y divide-gray-100">
                      {s.payments.map((p) => (
                        <li key={p.donation_id} className="py-1 flex justify-between gap-4">
                          <span>{fmtDate(p.paid_at)} <span className="text-gray-500">· donation #{p.donation_id}</span></span>
                          <span className="tabular-nums">{money(p.amount_cents)}</span>
                        </li>
                      ))}
                    </ul>
                  </Collapsible>
                )}
              </div>
            )
          })}
        </Panel>
      )}

      {!isAdmin && c.sponsorships.some((s) => isRunning(s.status)) && (
        <p className="text-xs text-gray-500">Only an administrator can end a sponsorship.</p>
      )}

      {ending && (
        <EndSponsorshipDialog sponsorship={ending} reference={c.reference} onClose={() => setEnding(null)}
          onDone={() => { setEnding(null); showSuccess('Sponsorship ended'); refresh() }} />
      )}
    </div>
  )
}

export default SponsorshipsTab
