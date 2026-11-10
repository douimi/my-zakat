/**
 * Families or orphans (same page, `kind` prop): status tabs with counts,
 * funding and attention filters, search. Filters live in the URL so the
 * overview can link straight to "published, partly sponsored" or "documents
 * to verify". A row opens the case page.
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from 'react-query'
import { AlertTriangle, Baby, Copy, FileClock, FileWarning, Home, RefreshCw } from 'lucide-react'
import { clsx } from 'clsx'
import { EmptyState, ErrorState, FilterBar, LoadingBlock, PageHeader, StatusBadge } from '../../../components/admin'
import { sponsorshipAdmin, type CaseStatus, type FundingState, type StaffCaseSummary } from '../../../utils/sponsorshipApi'
import CoverageBar from '../../../components/admin/sponsorship/CoverageBar'
import {
  CASE_STATUSES, FUNDING_LABEL, STATUS_LABEL, STATUS_TONE, docLabel, fmtDate, plural,
} from '../../../components/admin/sponsorship/format'

const FLAGS: { value: string; label: string }[] = [
  { value: 'unread', label: 'New activity' },
  { value: 'documents', label: 'Documents to verify' },
  { value: 'missing', label: 'Missing documents' },
  { value: 'duplicates', label: 'Possible duplicates' },
  { value: 'aging_out', label: 'Turning 18 soon' },
]

/** Attention icons for a row; each has a text equivalent for screen readers and a tooltip. */
const RowFlags = ({ r }: { r: StaffCaseSummary }) => {
  const items: { icon: typeof Copy; text: string; tone: string }[] = []
  if (r.docs_pending) items.push({ icon: FileClock, text: `${plural(r.docs_pending, 'document')} to verify`, tone: 'text-amber-700' })
  if (r.missing_documents.length && r.status !== 'closed' && r.status !== 'rejected') {
    items.push({ icon: FileWarning, text: `Missing: ${r.missing_documents.map(docLabel).join(', ')}`, tone: 'text-red-700' })
  }
  if (r.flags) items.push({ icon: Copy, text: `${plural(r.flags, 'possible duplicate')}`, tone: 'text-amber-700' })
  if (r.ages_out_on && r.status !== 'closed' && r.status !== 'rejected'
    && new Date(r.ages_out_on).getTime() - Date.now() < 90 * 86400_000) {
    items.push({ icon: AlertTriangle, text: `Turns 18 on ${fmtDate(r.ages_out_on)}`, tone: 'text-red-700' })
  }
  if (r.coverage.overfunded) items.push({ icon: AlertTriangle, text: 'Over-funded', tone: 'text-amber-700' })
  if (items.length === 0) return <span className="text-xs text-gray-500">—</span>
  return (
    <span className="flex items-center gap-1.5">
      {items.map((i) => (
        <span key={i.text} title={i.text} className={i.tone}>
          <i.icon className="w-4 h-4" aria-hidden="true" />
          <span className="sr-only">{i.text}</span>
        </span>
      ))}
    </span>
  )
}

const AdminSponsorshipCases = ({ kind }: { kind: 'family' | 'orphan' }) => {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const status = params.get('status') || ''
  const funding = (params.get('funding') || '') as FundingState | ''
  const flag = params.get('flag') || ''
  const q = params.get('q') || ''
  const [search, setSearch] = useState(q)

  const update = (patch: Record<string, string>) => {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v)
      else p.delete(k)
    }
    setParams(p, { replace: true })
  }

  // Debounce the search box into the URL (and so into the query).
  useEffect(() => { setSearch(q) }, [q])
  useEffect(() => {
    if (search === q) return
    // Not trimmed: trimming would eat the space someone is in the middle of typing. The API strips it.
    const t = window.setTimeout(() => update({ q: search.trim() ? search : '' }), 300)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const { data, isLoading, isError, isFetching, refetch } = useQuery(
    ['sponsorship-admin-cases', kind, status, funding, flag, q],
    () => sponsorshipAdmin.cases({
      kind, status: status || undefined, funding: funding || undefined, flag: flag || undefined, q: q || undefined,
    }),
    { keepPreviousData: true, staleTime: 0, refetchOnMount: 'always' },
  )

  const counts = data?.status_counts
  const totalAll = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : undefined
  const unread = data?.items.filter((r) => r.unread && r.status !== 'closed' && r.status !== 'rejected').length ?? 0
  const filtered = Boolean(status || funding || flag || q)
  const title = kind === 'family' ? 'Families' : 'Orphans'
  const Icon = kind === 'family' ? Home : Baby

  return (
    <div className="space-y-4">
      <PageHeader
        title={title}
        icon={Icon}
        count={totalAll}
        description={kind === 'family'
          ? 'Families who asked to be sponsored, from request to publication.'
          : 'Orphans who need a sponsor, from request to publication.'}
        actions={
          <button type="button" onClick={() => refetch()} className="btn-secondary btn-sm gap-2">
            <RefreshCw className={clsx('w-4 h-4', isFetching && 'animate-spin')} aria-hidden="true" /> Refresh
          </button>
        }
      />

      <div className="overflow-x-auto">
        <div role="group" aria-label="Filter by status" className="flex gap-1.5 min-w-max">
          {[{ value: '', label: 'All', n: totalAll }, ...CASE_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s], n: counts?.[s] }))].map((t) => {
            const active = status === t.value
            return (
              <button key={t.value || 'all'} type="button" aria-pressed={active}
                onClick={() => update({ status: t.value, ...(t.value && t.value !== 'published' ? { funding: '' } : {}) })}
                className={clsx('px-3 py-1.5 rounded-full text-sm font-medium border whitespace-nowrap',
                  active ? 'bg-primary-600 border-primary-600 text-white' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50')}>
                {t.label}{t.n !== undefined && <span className={clsx('ml-1.5 tabular-nums', active ? 'text-white/90' : 'text-gray-500')}>{t.n}</span>}
              </button>
            )
          })}
        </div>
      </div>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search by reference, name, email or association…"
        searchLabel={`Search ${title.toLowerCase()}`}
        trailing={data ? `${plural(data.total, 'case')}${unread ? ` · ${unread} with new activity` : ''}` : undefined}
      >
        <select className="input-field sm:w-48 py-2" aria-label="Funding" value={funding}
          onChange={(e) => update({ funding: e.target.value, ...(e.target.value ? { status: 'published' } : {}) })}>
          <option value="">Any funding</option>
          {(['unfunded', 'partial', 'full'] as FundingState[]).map((f) => <option key={f} value={f}>{FUNDING_LABEL[f]}</option>)}
        </select>
        <select className="input-field sm:w-52 py-2" aria-label="Needs attention" value={flag} onChange={(e) => update({ flag: e.target.value })}>
          <option value="">Any case</option>
          {FLAGS.filter((f) => kind === 'orphan' || f.value !== 'aging_out').map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        {filtered && (
          <button type="button" className="btn-ghost btn-sm" onClick={() => { setSearch(''); setParams(new URLSearchParams(), { replace: true }) }}>
            Clear filters
          </button>
        )}
      </FilterBar>

      {isLoading ? (
        <LoadingBlock label={`Loading ${title.toLowerCase()}…`} />
      ) : isError ? (
        <ErrorState message={`Could not load ${title.toLowerCase()}.`} onRetry={() => refetch()} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState icon={Icon} title={filtered ? 'No case matches' : `No ${kind === 'family' ? 'family' : 'orphan'} request yet`}
          body={filtered ? 'Try another status or clear the filters.' : 'Requests filed on the public site appear here.'} />
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reference</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Filed by</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">Location</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">Coverage</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Attention</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden xl:table-cell">Submitted</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.items.map((r) => {
                const href = `/admin/sponsorship/cases/${r.id}`
                const live = r.status === 'published' || r.status === 'paused'
                return (
                  <tr key={r.id} onClick={() => navigate(href)}
                    className={clsx('cursor-pointer', r.unread && r.status !== 'closed' && r.status !== 'rejected' ? 'bg-amber-50/60 hover:bg-amber-50' : 'hover:bg-gray-50')}>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      <span className="flex items-center gap-2">
                        {r.unread && r.status !== 'closed' && r.status !== 'rejected'
                          ? <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" title="New activity"><span className="sr-only">New activity</span></span>
                          : <span className="w-2 h-2 shrink-0" aria-hidden="true" />}
                        <Link to={href} className="link font-mono" onClick={(e) => e.stopPropagation()}>{r.reference}</Link>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="font-medium text-gray-900 max-w-[220px] truncate" title={r.name || undefined}>{r.name || '—'}</div>
                      <div className="text-xs text-gray-500">
                        {r.public_name ? `Public: ${r.public_name}` : kind === 'family'
                          ? (r.household_size ? plural(r.household_size, 'person', 'people') : '')
                          : (r.age != null ? `${r.age} years` : '')}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 hidden md:table-cell">
                      <div className="max-w-[200px] truncate">{r.submitter_type === 'organization' ? r.organization_name || 'Association' : 'The family'}</div>
                      <div className="text-xs text-gray-500 max-w-[200px] truncate" title={r.submitter_email}>{r.submitter_email}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 hidden lg:table-cell">{[r.city, r.country].filter(Boolean).join(', ')}</td>
                    <td className="px-4 py-3"><StatusBadge tone={STATUS_TONE[r.status as CaseStatus]}>{STATUS_LABEL[r.status as CaseStatus]}</StatusBadge></td>
                    <td className="px-4 py-3 hidden sm:table-cell">{live ? <CoverageBar coverage={r.coverage} compact /> : <span className="text-xs text-gray-500">—</span>}</td>
                    <td className="px-4 py-3"><RowFlags r={r} /></td>
                    <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap hidden xl:table-cell">{fmtDate(r.submitted_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default AdminSponsorshipCases
