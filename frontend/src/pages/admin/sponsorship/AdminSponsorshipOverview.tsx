/**
 * Sponsorship at a glance: the alerts that need someone (first), the review
 * pipeline per kind, coverage of published cases, sponsorships, money and
 * timing. Every count links to the filtered list behind it.
 */
import { Link } from 'react-router-dom'
import { useQuery } from 'react-query'
import { Baby, Bell, CheckCircle2, HeartHandshake, Home, RefreshCw, Users } from 'lucide-react'
import { clsx } from 'clsx'
import { Collapsible, ErrorState, LoadingBlock, PageHeader, StatusBadge } from '../../../components/admin'
import { sponsorshipAdmin, type Kind, type Overview } from '../../../utils/sponsorshipApi'
import {
  CASE_STATUSES, END_REASON_LABEL, FUNDING_LABEL, STATUS_LABEL, STATUS_TONE, fmtDate, money, plural,
} from '../../../components/admin/sponsorship/format'
import { Panel, Stat } from '../../../components/admin/sponsorship/ui'

const caseHref = (id: number) => `/admin/sponsorship/cases/${id}`
const listHref = (kind: Kind, query: string) => `/admin/sponsorship/${kind === 'family' ? 'families' : 'orphans'}${query ? `?${query}` : ''}`

type AlertKey = keyof Overview['alerts']

/** Each alert: what it means, and how to show one entry. */
const ALERTS: { key: AlertKey; title: string; detail: (a: any) => string; tab?: string }[] = [
  { key: 'documents_pending', title: 'Documents awaiting verification', detail: (a) => plural(a.count, 'document'), tab: 'documents' },
  { key: 'duplicates', title: 'Possible duplicates to review', detail: (a) => plural(a.flags, 'match', 'matches'), tab: 'links' },
  { key: 'past_due', title: 'Sponsor payments failing (past due)', detail: () => 'payment failed', tab: 'sponsorships' },
  { key: 'aging_out', title: 'Orphans turning 18 within 90 days', detail: (a) => `turns 18 on ${fmtDate(a.ages_out_on)}` },
  { key: 'idle_funds', title: 'Funds received, nothing distributed for 60 days', detail: (a) => `${money(a.balance_cents)} waiting`, tab: 'funds' },
  { key: 'overfunded', title: 'Over-funded cases', detail: (a) => `${money(a.excess_cents)} a month over the need`, tab: 'sponsorships' },
  { key: 'no_recent_update', title: 'Sponsored cases with no update for 90 days', detail: (a) => `last ${fmtDate(a.since)}`, tab: 'updates' },
]

const AlertsPanel = ({ alerts }: { alerts: Overview['alerts'] }) => {
  const active = ALERTS.filter((a) => (alerts[a.key] as unknown[]).length > 0)
  if (active.length === 0) {
    return (
      <Panel title="Alerts">
        <p className="text-sm text-green-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Nothing needs attention.
        </p>
      </Panel>
    )
  }
  return (
    <Panel title={`Alerts (${active.length})`} flush>
      {active.map((a) => {
        const items = alerts[a.key] as { id: number; case_id?: number; reference: string | null }[]
        return (
          <Collapsible key={a.key} title={`${a.title} · ${items.length}`}
            preview={items.slice(0, 6).map((i) => i.reference || `#${i.id}`).join(', ') + (items.length > 6 ? '…' : '')}>
            <ul className="divide-y divide-gray-100">
              {items.map((i) => {
                const id = i.case_id ?? i.id
                return (
                  <li key={`${a.key}-${i.id}`} className="py-1.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <Link className="link font-mono" to={`${caseHref(id)}${a.tab ? `?tab=${a.tab}` : ''}`}>{i.reference || `Case #${id}`}</Link>
                    <span className="text-gray-600">{a.detail(i)}</span>
                  </li>
                )
              })}
            </ul>
          </Collapsible>
        )
      })}
    </Panel>
  )
}

const Pipeline = ({ kind, counts }: { kind: Kind; counts: Overview['pipeline'][Kind] }) => {
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const Icon = kind === 'family' ? Home : Baby
  return (
    <Panel
      title={<span className="flex items-center gap-2"><Icon className="w-4 h-4 text-primary-600" aria-hidden="true" />{kind === 'family' ? 'Families' : 'Orphans'} · {total}</span>}
      actions={<Link className="link text-sm" to={listHref(kind, '')}>Open list</Link>}
    >
      <ul className="grid grid-cols-2 gap-2">
        {CASE_STATUSES.map((s) => (
          <li key={s}>
            <Link to={listHref(kind, `status=${s}`)}
              className={clsx('flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-gray-50',
                counts[s] ? 'border-gray-200' : 'border-gray-100 text-gray-500')}>
              <StatusBadge tone={counts[s] ? STATUS_TONE[s] : 'neutral'}>{STATUS_LABEL[s]}</StatusBadge>
              <span className="font-semibold tabular-nums text-gray-900">{counts[s]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

const AdminSponsorshipOverview = () => {
  const { data, isLoading, isError, isFetching, refetch } = useQuery(
    'sponsorship-admin-overview', sponsorshipAdmin.overview, { staleTime: 0, refetchOnMount: 'always' },
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sponsorship"
        icon={HeartHandshake}
        badge={data && data.unread > 0 ? (
          <StatusBadge tone="warning" icon={Bell} title="New or resubmitted cases nobody has opened yet">
            {data.unread} with new activity
          </StatusBadge>
        ) : undefined}
        description="Families and orphans sponsored monthly: review, publication, sponsors and the use of funds."
        actions={
          <>
            <Link to="/admin/sponsorship/families" className="btn-secondary btn-sm">Families</Link>
            <Link to="/admin/sponsorship/orphans" className="btn-secondary btn-sm">Orphans</Link>
            <Link to="/admin/sponsorship/sponsors" className="btn-secondary btn-sm">Sponsors</Link>
            <button type="button" onClick={() => refetch()} className="btn-ghost btn-sm gap-1" aria-label="Refresh">
              <RefreshCw className={clsx('w-4 h-4', isFetching && 'animate-spin')} aria-hidden="true" />
            </button>
          </>
        }
      />

      {isLoading ? <LoadingBlock label="Loading the overview…" />
        : isError || !data ? <ErrorState message="Could not load the sponsorship overview." onRetry={() => refetch()} />
          : <OverviewBody o={data} />}
    </div>
  )
}

const OverviewBody = ({ o }: { o: Overview }) => {
  const sp = o.sponsorships
  const reasons = Object.entries(sp.end_reasons).sort((a, b) => b[1] - a[1])
  return (
    <div className="space-y-6">
      <AlertsPanel alerts={o.alerts} />

      <section aria-labelledby="pipeline-h" className="space-y-3">
        <h2 id="pipeline-h" className="text-base font-semibold text-gray-900">Review pipeline</h2>
        {o.unread > 0 && (
          <p className="text-sm text-gray-700">
            {plural(o.unread, 'case')} with new activity:{' '}
            <Link className="link" to={listHref('family', 'flag=unread')}>families</Link> ·{' '}
            <Link className="link" to={listHref('orphan', 'flag=unread')}>orphans</Link>
          </p>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Pipeline kind="family" counts={o.pipeline.family} />
          <Pipeline kind="orphan" counts={o.pipeline.orphan} />
        </div>
      </section>

      <section aria-labelledby="coverage-h" className="space-y-3">
        <h2 id="coverage-h" className="text-base font-semibold text-gray-900">Coverage of published cases</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {(['full', 'partial', 'unfunded'] as const).map((f) => (
            <div key={f} className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-xs font-medium text-gray-500">{FUNDING_LABEL[f]}</p>
              <p className={clsx('mt-1 text-2xl font-bold tabular-nums', f === 'unfunded' && o.funding[f] ? 'text-red-700' : 'text-gray-900')}>{o.funding[f]}</p>
              <p className="mt-0.5 text-xs">
                <Link className="link" to={listHref('family', `status=published&funding=${f}`)}>families</Link>
                {' · '}
                <Link className="link" to={listHref('orphan', `status=published&funding=${f}`)}>orphans</Link>
              </p>
            </div>
          ))}
          <div className="rounded-lg border border-gray-200 bg-white p-4 col-span-2 lg:col-span-1">
            <p className="text-xs font-medium text-gray-500">Monthly need covered</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{o.coverage_percent}%</p>
            <div className="mt-2 h-2 rounded-full bg-gray-200 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100}
              aria-valuenow={o.coverage_percent} aria-label={`${o.coverage_percent}% of the monthly need is committed`}>
              <div className="h-full bg-green-600" style={{ width: `${Math.min(100, o.coverage_percent)}%` }} />
            </div>
            <p className="mt-1 text-xs text-gray-500">{money(o.monthly_committed_cents)} of {money(o.monthly_need_cents)} a month</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="sp-h" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="sp-h" className="text-base font-semibold text-gray-900">Sponsorships</h2>
          <Link className="link text-sm inline-flex items-center gap-1" to="/admin/sponsorship/sponsors"><Users className="w-4 h-4" aria-hidden="true" /> All sponsors</Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Active" value={sp.active} hint={`${plural(sp.sponsors, 'distinct sponsor')}`} />
          <Stat label="Past due" value={sp.past_due} tone={sp.past_due ? 'warning' : 'default'} hint="Payment failed, Stripe retrying" />
          <Stat label="Monthly recurring" value={money(sp.monthly_recurring_cents)} hint="Active and past due" />
          <Stat label="This month" value={<span>+{sp.started_this_month} <span className="text-gray-400">/</span> −{sp.ended_this_month}</span>} hint="Started / ended" />
        </div>
        {reasons.length > 0 && (
          <Panel flush>
            <Collapsible title="Why sponsorships ended (all time)" preview={reasons.slice(0, 3).map(([r, n]) => `${END_REASON_LABEL[r] ?? r} ${n}`).join(' · ')}>
              <ul className="text-sm divide-y divide-gray-100">
                {reasons.map(([r, n]) => (
                  <li key={r} className="py-1 flex justify-between gap-4"><span>{END_REASON_LABEL[r] ?? r}</span><span className="tabular-nums">{n}</span></li>
                ))}
              </ul>
            </Collapsible>
          </Panel>
        )}
      </section>

      <section aria-labelledby="money-h" className="space-y-3">
        <h2 id="money-h" className="text-base font-semibold text-gray-900">Money</h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Stat label="Collected this month" value={money(o.money.collected_this_month_cents)} />
          <Stat label="Distributed this month" value={money(o.money.disbursed_this_month_cents)} />
          <Stat label="Collected, all time" value={money(o.money.collected_total_cents)} />
          <Stat label="Distributed, all time" value={money(o.money.disbursed_total_cents)} />
          <Stat label="Not yet distributed" value={money(o.money.undistributed_cents)} tone={o.money.undistributed_cents > 0 ? 'warning' : 'default'} />
        </div>
      </section>

      <section aria-labelledby="timing-h" className="space-y-3">
        <h2 id="timing-h" className="text-base font-semibold text-gray-900">Timing</h2>
        <div className="grid grid-cols-2 gap-3 max-w-xl">
          <Stat label="Average review" value={o.timing.avg_review_days == null ? '—' : `${o.timing.avg_review_days} d`} hint="Submission to approval" />
          <Stat label="Average wait for a sponsor" value={o.timing.avg_wait_for_sponsor_days == null ? '—' : `${o.timing.avg_wait_for_sponsor_days} d`} hint="Publication to first sponsor" />
        </div>
      </section>
    </div>
  )
}

export default AdminSponsorshipOverview
