import { useState } from 'react'
import { AlertTriangle, FileWarning, Copy, UserCheck } from 'lucide-react'
import { useAuthStore } from '../../../store/authStore'
import { useToast } from '../../../contexts/ToastContext'
import { sponsorshipAdmin, errorDetail } from '../../../utils/sponsorshipApi'
import CoverageBar from './CoverageBar'
import { CLOSE_REASON_LABEL, docLabel, fmtDate, money, plural, type CaseTab, type CloseReason } from './format'
import { Fact, Facts, Panel, type CaseTabProps } from './ui'

/** Key facts at a glance; the decision buttons live in the page's next-step panel. */
const OverviewTab = ({ case: c, onUpdated, goTo }: CaseTabProps & { goTo: (tab: CaseTab) => void }) => {
  const userId = useAuthStore((s) => s.user?.id)
  const userEmail = useAuthStore((s) => s.user?.email)
  const { showError, showSuccess } = useToast()
  const [busy, setBusy] = useState(false)

  const assign = async (to: number | null) => {
    setBusy(true)
    try {
      const res = await sponsorshipAdmin.edit(c.id, { assigned_to: to })
      onUpdated(res.case)
      showSuccess(to ? 'Assigned to you' : 'Unassigned')
    } catch (e) {
      showError('Could not change the assignment', errorDetail(e) || undefined)
    } finally {
      setBusy(false)
    }
  }

  const live = c.status === 'published' || c.status === 'paused'
  const attention = [
    c.docs_pending > 0 && { icon: FileWarning, text: `${plural(c.docs_pending, 'document')} awaiting verification`, tab: 'documents' as CaseTab },
    c.missing_documents.length > 0 && { icon: FileWarning, text: `Missing: ${c.missing_documents.map(docLabel).join(', ')}`, tab: 'documents' as CaseTab },
    c.flags > 0 && { icon: Copy, text: `${plural(c.flags, 'possible duplicate')} to review`, tab: 'links' as CaseTab },
    c.ages_out_on && live && new Date(c.ages_out_on).getTime() - Date.now() < 90 * 86400_000 && {
      icon: AlertTriangle, text: `Turns 18 on ${fmtDate(c.ages_out_on)}`, tab: undefined,
    },
    c.coverage.overfunded && { icon: AlertTriangle, text: 'Over-funded: sponsors commit more than the approved need', tab: 'sponsorships' as CaseTab },
  ].filter(Boolean) as { icon: typeof AlertTriangle; text: string; tab?: CaseTab }[]

  return (
    <div className="space-y-4">
      {attention.length > 0 && (
        <div className="alert-warning flex-col gap-1">
          {attention.map((a) => (
            <p key={a.text} className="flex items-center gap-2">
              <a.icon className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{a.text}</span>
              {a.tab && (
                <button type="button" className="link text-sm" onClick={() => goTo(a.tab!)}>Open</button>
              )}
            </p>
          ))}
        </div>
      )}

      <Panel title="Key facts">
        <Facts>
          <Fact label="Kind">{c.kind === 'family' ? 'Family' : 'Orphan'}</Fact>
          <Fact label="Name">{c.name || '—'}</Fact>
          <Fact label="Public name">{c.public_name || '—'}</Fact>
          {c.kind === 'family'
            ? <Fact label="Household size">{c.household_size ?? '—'}</Fact>
            : <Fact label="Age">{c.age ?? '—'}{c.ages_out_on ? ` (turns 18 on ${fmtDate(c.ages_out_on)})` : ''}</Fact>}
          <Fact label="Location">{[c.city, c.dossier.region, c.country].filter(Boolean).join(', ')}</Fact>
          <Fact label="Preferred language">{c.preferred_language === 'ar' ? 'Arabic' : 'English'}</Fact>
          <Fact label="Submitted">{fmtDate(c.submitted_at)}</Fact>
          <Fact label="Last change">{fmtDate(c.updated_at)}</Fact>
          {c.approved_at && <Fact label="Approved">{fmtDate(c.approved_at)}</Fact>}
          {c.published_at && <Fact label="Published">{fmtDate(c.published_at)}</Fact>}
          {c.closed_at && (
            <Fact label="Closed">
              {fmtDate(c.closed_at)}{c.close_reason ? ` · ${CLOSE_REASON_LABEL[c.close_reason as CloseReason] ?? c.close_reason}` : ''}
            </Fact>
          )}
          <Fact label="Publication consent">{c.consent.publication ? 'Given' : <span className="text-amber-800 font-medium">Not given</span>}</Fact>
        </Facts>
      </Panel>

      <Panel title="Submitted by">
        <Facts>
          <Fact label="Filed as">{c.submitter_type === 'organization' ? 'Association' : c.submitter_type === 'staff' ? 'Staff' : 'The family itself'}</Fact>
          <Fact label="Name">{c.submitter_name}</Fact>
          <Fact label="Email"><a className="link" href={`mailto:${c.submitter_email}`}>{c.submitter_email}</a></Fact>
          <Fact label="Phone">{c.submitter_phone || '—'}</Fact>
          {c.organization_name && <Fact label="Association">{c.organization_name}</Fact>}
          {c.organization_registration && <Fact label="Registration">{c.organization_registration}</Fact>}
          {c.organization_contact_role && <Fact label="Contact role">{c.organization_contact_role}</Fact>}
        </Facts>
      </Panel>

      <Panel title="Money">
        <Facts cols={4}>
          <Fact label="Requested a month">{money(c.requested_monthly_cents)}</Fact>
          <Fact label="Approved a month">{money(c.approved_monthly_cents)}</Fact>
          <Fact label="Collected">{money(c.finances.collected_cents)}</Fact>
          <Fact label="Balance to distribute">{money(c.finances.balance_cents)}</Fact>
        </Facts>
        {live && (
          <div className="mt-4 max-w-md">
            <p className="text-xs font-medium text-gray-500 mb-1">Coverage · {plural(c.coverage.sponsors, 'sponsor')}</p>
            <CoverageBar coverage={c.coverage} />
          </div>
        )}
      </Panel>

      <Panel title="Assignment">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-gray-800 flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-gray-500" aria-hidden="true" />
            {c.assigned_to
              ? <>Assigned to <strong>{c.assigned_to_email || (c.assigned_to === userId ? userEmail : `user #${c.assigned_to}`)}</strong></>
              : 'Nobody is assigned.'}
          </p>
          {userId && c.assigned_to !== userId && (
            <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => assign(userId)}>Assign to me</button>
          )}
          {c.assigned_to && (
            <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => assign(null)}>Unassign</button>
          )}
        </div>
      </Panel>
    </div>
  )
}

export default OverviewTab
