/**
 * Every sponsorship across cases: who gives, to which case, how much, since
 * when, and in total. Admins can end one (cancels the Stripe subscription).
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from 'react-query'
import { HeartHandshake, RefreshCw } from 'lucide-react'
import { clsx } from 'clsx'
import { EmptyState, ErrorState, FilterBar, LoadingBlock, PageHeader, StatusBadge } from '../../../components/admin'
import { useAuthStore } from '../../../store/authStore'
import { useToast } from '../../../contexts/ToastContext'
import { sponsorshipAdmin, type SponsorshipStatus } from '../../../utils/sponsorshipApi'
import EndSponsorshipDialog, { type EndableSponsorship } from '../../../components/admin/sponsorship/EndSponsorshipDialog'
import {
  END_REASON_LABEL, SPONSORSHIP_LABEL, SPONSORSHIP_STATUSES, SPONSORSHIP_TONE, fmtDate, isCommitted, isRunning, money, plural,
} from '../../../components/admin/sponsorship/format'

type Row = Awaited<ReturnType<typeof sponsorshipAdmin.sponsorships>>['items'][number]

const AdminSponsorships = () => {
  const isAdmin = useAuthStore((s) => s.isAdmin)
  const { showSuccess } = useToast()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [ending, setEnding] = useState<(EndableSponsorship & { reference: string }) | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => setQ(search.trim()), 300)
    return () => window.clearTimeout(t)
  }, [search])

  const { data, isLoading, isError, isFetching, refetch } = useQuery(
    ['sponsorship-admin-sponsorships', status, q],
    () => sponsorshipAdmin.sponsorships({ status: status || undefined, q: q || undefined }),
    { keepPreviousData: true, staleTime: 0, refetchOnMount: 'always' },
  )

  const items: Row[] = data?.items ?? []
  const committed = items.filter((r) => isCommitted(r.status))
  const mrr = committed.reduce((s, r) => s + r.monthly_amount_cents, 0)
  const given = items.reduce((s, r) => s + r.total_given_cents, 0)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sponsors"
        icon={HeartHandshake}
        count={data ? items.length : undefined}
        description="Every monthly sponsorship of a family or an orphan."
        actions={
          <button type="button" onClick={() => refetch()} className="btn-secondary btn-sm gap-2">
            <RefreshCw className={clsx('w-4 h-4', isFetching && 'animate-spin')} aria-hidden="true" /> Refresh
          </button>
        }
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search by sponsor name, email or case reference…"
        searchLabel="Search sponsorships"
        trailing={data ? `${plural(committed.length, 'running sponsorship')} · ${money(mrr)} a month · ${money(given)} given` : undefined}
      >
        <select className="input-field sm:w-52 py-2" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All (except abandoned)</option>
          <option value="active,past_due">Running (active or past due)</option>
          {SPONSORSHIP_STATUSES.map((s) => <option key={s} value={s}>{SPONSORSHIP_LABEL[s]}</option>)}
          <option value="abandoned">{SPONSORSHIP_LABEL.abandoned}</option>
        </select>
      </FilterBar>

      {isLoading ? <LoadingBlock label="Loading sponsorships…" />
        : isError ? <ErrorState message="Could not load sponsorships." onRetry={() => refetch()} />
          : items.length === 0 ? (
            <EmptyState icon={HeartHandshake} title={status || q ? 'No sponsorship matches' : 'No sponsorship yet'}
              body={status || q ? 'Try another status or search.' : 'Sponsorships appear here once donors sponsor a published case.'} />
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sponsor</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Case</th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Monthly</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Since</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">Last payment</th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Given</th>
                    {isAdmin && <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"><span className="sr-only">Actions</span></th>}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {items.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-3 text-sm">
                        <div className="font-medium text-gray-900">{r.sponsor_name}</div>
                        <a className="text-xs text-gray-500 hover:underline" href={`mailto:${r.sponsor_email}`}>{r.sponsor_email}</a>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <Link to={`/admin/sponsorship/cases/${r.case_id}?tab=sponsorships`} className="link font-mono">{r.reference}</Link>
                        <div className="text-xs text-gray-500">{r.kind === 'family' ? 'Family' : 'Orphan'}{r.public_name ? ` · ${r.public_name}` : ''}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-right tabular-nums whitespace-nowrap">{money(r.monthly_amount_cents)}</td>
                      <td className="px-4 py-3 text-sm">
                        <StatusBadge tone={SPONSORSHIP_TONE[r.status as SponsorshipStatus]}>{SPONSORSHIP_LABEL[r.status as SponsorshipStatus] ?? r.status}</StatusBadge>
                        {r.ended_at && (
                          <div className="text-xs text-gray-500 mt-0.5">
                            {fmtDate(r.ended_at)}{r.end_reason ? ` · ${END_REASON_LABEL[r.end_reason] ?? r.end_reason}` : ''}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap hidden md:table-cell">{fmtDate(r.started_at || r.created_at)}</td>
                      <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap hidden lg:table-cell">{fmtDate(r.last_payment_at)}</td>
                      <td className="px-4 py-3 text-sm text-right tabular-nums whitespace-nowrap">{money(r.total_given_cents)}</td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-right">
                          {isRunning(r.status as SponsorshipStatus) && (
                            <button type="button" className="btn-ghost btn-sm text-red-700 whitespace-nowrap"
                              onClick={() => setEnding({ ...r, reference: r.reference })}>
                              End<span className="sr-only"> sponsorship of {r.sponsor_name}</span>
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

      {ending && (
        <EndSponsorshipDialog sponsorship={ending} reference={ending.reference} onClose={() => setEnding(null)}
          onDone={() => {
            setEnding(null)
            showSuccess('Sponsorship ended')
            refetch()
            queryClient.invalidateQueries('sponsorship-admin-overview')
          }} />
      )}
    </div>
  )
}

export default AdminSponsorships
