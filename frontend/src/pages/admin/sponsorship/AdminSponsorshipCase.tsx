/**
 * One sponsorship case: the staff work surface.
 *
 * Header and the "next step" panel (status, blockers, the decision buttons)
 * stay above the tabs, so the one action that matters is visible whatever
 * tab is open. Each tab is its own component under
 * components/admin/sponsorship; every write returns the fresh case, which
 * replaces the cached copy here.
 */
import { useState, type KeyboardEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from 'react-query'
import { ArrowLeft, Bell, Baby, Home } from 'lucide-react'
import { clsx } from 'clsx'
import { ErrorState, LoadingBlock, PageHeader, StatusBadge } from '../../../components/admin'
import { useAuthStore } from '../../../store/authStore'
import { useToast } from '../../../contexts/ToastContext'
import { sponsorshipAdmin, type StaffAction, type StaffCase } from '../../../utils/sponsorshipApi'
import { ACTION_LABEL, STATUS_LABEL, STATUS_TONE, fmtDate, type CaseTab } from '../../../components/admin/sponsorship/format'
import NextStep from '../../../components/admin/sponsorship/NextStep'
import TransitionDialog from '../../../components/admin/sponsorship/TransitionDialog'
import OverviewTab from '../../../components/admin/sponsorship/OverviewTab'
import DossierTab from '../../../components/admin/sponsorship/DossierTab'
import DocumentsTab from '../../../components/admin/sponsorship/DocumentsTab'
import ProfileTab from '../../../components/admin/sponsorship/ProfileTab'
import SponsorshipsTab from '../../../components/admin/sponsorship/SponsorshipsTab'
import FundsTab from '../../../components/admin/sponsorship/FundsTab'
import UpdatesTab from '../../../components/admin/sponsorship/UpdatesTab'
import HistoryTab from '../../../components/admin/sponsorship/HistoryTab'
import LinksTab from '../../../components/admin/sponsorship/LinksTab'
import type { CaseTabProps } from '../../../components/admin/sponsorship/ui'

const TABS: { id: CaseTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'dossier', label: 'Dossier' },
  { id: 'documents', label: 'Documents' },
  { id: 'profile', label: 'Public profile' },
  { id: 'sponsorships', label: 'Sponsorships' },
  { id: 'funds', label: 'Funds' },
  { id: 'updates', label: 'Updates' },
  { id: 'history', label: 'History' },
  { id: 'links', label: 'Links' },
]

/** A small count or dot next to a tab name, when there is something there. */
const tabCount = (c: StaffCase, tab: CaseTab): { n: number; warn?: boolean } | null => {
  switch (tab) {
    case 'documents': return c.docs_pending ? { n: c.docs_pending, warn: true } : { n: c.documents.length }
    case 'sponsorships': return { n: c.sponsorships.length }
    case 'updates': return { n: c.updates.length }
    case 'history': return { n: c.history.length }
    case 'links': return c.flags ? { n: c.flags, warn: true } : null
    default: return null
  }
}

const caseQueryKey = (id: number) => ['sponsorship-admin-case', id]

const AdminSponsorshipCase = () => {
  const { id } = useParams()
  const caseId = Number(id)
  const [params, setParams] = useSearchParams()
  const requested = params.get('tab') as CaseTab | null
  const tab: CaseTab = requested && TABS.some((t) => t.id === requested) ? requested : 'overview'
  const isAdmin = useAuthStore((s) => s.isAdmin)
  const { showSuccess } = useToast()
  const queryClient = useQueryClient()
  const [action, setAction] = useState<StaffAction | null>(null)

  const { data: c, isLoading, isError, error, refetch } = useQuery(
    caseQueryKey(caseId),
    () => sponsorshipAdmin.get(caseId),
    { enabled: Number.isFinite(caseId), staleTime: 0, refetchOnMount: 'always' },
  )

  const goTo = (next: CaseTab) => {
    const p = new URLSearchParams(params)
    if (next === 'overview') p.delete('tab')
    else p.set('tab', next)
    setParams(p, { replace: true })
  }

  const onUpdated = (updated: StaffCase) => {
    queryClient.setQueryData(caseQueryKey(caseId), updated)
    // Lists and the overview counts are now stale.
    queryClient.invalidateQueries('sponsorship-admin-cases')
    queryClient.invalidateQueries('sponsorship-admin-overview')
  }
  const refresh = () => {
    refetch()
    queryClient.invalidateQueries('sponsorship-admin-cases')
    queryClient.invalidateQueries('sponsorship-admin-overview')
  }

  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const i = TABS.findIndex((t) => t.id === tab)
    const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]
    goTo(next.id)
    document.getElementById(`case-tab-${next.id}`)?.focus()
  }

  if (!Number.isFinite(caseId)) return <ErrorState message="This case link is not valid." />
  if (isLoading) return <LoadingBlock label="Loading the case…" />
  if (isError || !c) {
    const status = (error as { response?: { status?: number } })?.response?.status
    return (
      <div className="space-y-4">
        <Link to="/admin/sponsorship" className="link text-sm inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" aria-hidden="true" /> Sponsorship</Link>
        <ErrorState message={status === 404 ? 'This case does not exist.' : 'Could not load the case.'} onRetry={status === 404 ? undefined : () => refetch()} />
      </div>
    )
  }

  const listHref = c.kind === 'family' ? '/admin/sponsorship/families' : '/admin/sponsorship/orphans'
  const tabProps: CaseTabProps = { case: c, isAdmin, onUpdated, refresh }

  return (
    <div className="space-y-4">
      <Link to={listHref} className="link text-sm inline-flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" aria-hidden="true" /> {c.kind === 'family' ? 'Families' : 'Orphans'}
      </Link>

      <PageHeader
        title={`${c.reference} · ${c.name || 'Unnamed'}`}
        icon={c.kind === 'family' ? Home : Baby}
        badge={
          <>
            <StatusBadge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</StatusBadge>
            {c.unread && <StatusBadge tone="warning" icon={Bell}>New activity</StatusBadge>}
          </>
        }
        description={`${c.kind === 'family' ? 'Family' : 'Orphan'} · ${[c.city, c.country].filter(Boolean).join(', ')} · ${c.organization_name ? `filed by ${c.organization_name}` : 'filed by the family'} · ${fmtDate(c.submitted_at)}`}
      />

      <NextStep case={c} onAction={setAction} goTo={goTo} />

      <div className="border-b border-gray-200 overflow-x-auto">
        <div role="tablist" aria-label="Case sections" className="flex gap-1 min-w-max" onKeyDown={onTabKey}>
          {TABS.map((t) => {
            const count = tabCount(c, t.id)
            const selected = t.id === tab
            return (
              <button
                key={t.id}
                id={`case-tab-${t.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls="case-tabpanel"
                tabIndex={selected ? 0 : -1}
                onClick={() => goTo(t.id)}
                className={clsx(
                  'px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap inline-flex items-center gap-1.5',
                  selected ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300',
                )}
              >
                {t.label}
                {count && count.n > 0 && (
                  <span className={clsx('text-xs rounded-full px-1.5 py-0.5 leading-none', count.warn ? 'bg-amber-100 text-amber-800 font-semibold' : 'bg-gray-100 text-gray-600')}>
                    {count.n}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div id="case-tabpanel" role="tabpanel" aria-labelledby={`case-tab-${tab}`}>
        {tab === 'overview' && <OverviewTab {...tabProps} goTo={goTo} />}
        {tab === 'dossier' && <DossierTab {...tabProps} />}
        {tab === 'documents' && <DocumentsTab {...tabProps} />}
        {tab === 'profile' && <ProfileTab {...tabProps} />}
        {tab === 'sponsorships' && <SponsorshipsTab {...tabProps} />}
        {tab === 'funds' && <FundsTab {...tabProps} />}
        {tab === 'updates' && <UpdatesTab {...tabProps} />}
        {tab === 'history' && <HistoryTab {...tabProps} />}
        {tab === 'links' && <LinksTab {...tabProps} />}
      </div>

      {action && (
        <TransitionDialog
          action={action}
          case={c}
          isAdmin={isAdmin}
          onClose={() => setAction(null)}
          onDone={(updated) => {
            onUpdated(updated)
            setAction(null)
            showSuccess(`${ACTION_LABEL[action]}: done`, `The case is now ${STATUS_LABEL[updated.status].toLowerCase()}.`)
          }}
        />
      )}
    </div>
  )
}

export default AdminSponsorshipCase
