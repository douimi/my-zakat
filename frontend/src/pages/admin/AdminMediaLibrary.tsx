import { useCallback, useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { useToast } from '../../contexts/ToastContext'
import { useAuthStore } from '../../store/authStore'
import MediaFilters from '../../components/media/MediaFilters'
import MediaGrid from '../../components/media/MediaGrid'
import MediaDetailDrawer from '../../components/media/MediaDetailDrawer'
import { formatBytes } from '../../components/media/MediaCard'
import {
  mediaLibraryApi,
  type ListQuery,
  type MediaAsset,
  type Workspace,
} from '../../utils/mediaLibraryApi'

const PAGE_SIZE = 48

const AdminMediaLibrary = () => {
  const { showError } = useToast()
  const { user } = useAuthStore()
  const [tab, setTab] = useState<'all' | 'review'>('all')
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [ownerId, setOwnerId] = useState<number | 'unassigned' | null>(null)
  const [query, setQuery] = useState<ListQuery>({
    q: '', type: 'all', status: 'all', sort: 'created_at', order: 'desc', page: 1,
  })
  const [items, setItems] = useState<MediaAsset[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const loadWorkspaces = useCallback(async () => {
    try {
      const data = await mediaLibraryApi.workspaces()
      setWorkspaces(data.workspaces)
    } catch {
      showError('Could not load workspaces.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await mediaLibraryApi.list({
        ...query,
        // The review queue is the submitted-status view of every workspace.
        status: tab === 'review' ? 'submitted' : query.status,
        ownerId: tab === 'review' ? null : ownerId,
        pageSize: PAGE_SIZE,
      })
      setItems(data.items)
      setTotal(data.total)
    } catch {
      showError('Could not load media.')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, ownerId, tab])

  useEffect(() => { loadWorkspaces() }, [loadWorkspaces])
  useEffect(() => { load() }, [load])

  const refresh = () => { load(); loadWorkspaces() }
  const patchQuery = (patch: Partial<ListQuery>) =>
    setQuery((current) => ({ ...current, ...patch, page: patch.page ?? 1 }))

  const pendingTotal = workspaces.reduce((sum, w) => sum + w.submitted_count, 0)
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">All Media</h1>
        <p className="text-sm text-gray-600 mt-1">Every workspace, and the queue waiting on review.</p>
      </header>

      <div className="flex gap-1 border-b border-gray-200">
        {(['all', 'review'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => { setTab(value); setQuery((c) => ({ ...c, page: 1 })) }}
            className={clsx(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px',
              tab === value
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            )}
          >
            {value === 'all' ? 'All media' : `Review queue${pendingTotal ? ` (${pendingTotal})` : ''}`}
          </button>
        ))}
      </div>

      <div className="flex gap-6 items-start">
        {tab === 'all' && (
          <nav className="w-56 shrink-0 space-y-1">
            <button type="button" onClick={() => setOwnerId(null)}
              className={clsx('w-full text-left px-3 py-2 rounded-lg text-sm',
                ownerId === null ? 'bg-emerald-50 text-emerald-800 font-medium' : 'hover:bg-gray-50')}>
              Every workspace
            </button>
            {workspaces.map((workspace) => {
              const value = workspace.owner_id ?? 'unassigned'
              return (
                <button key={String(value)} type="button" onClick={() => setOwnerId(value)}
                  className={clsx('w-full text-left px-3 py-2 rounded-lg text-sm',
                    ownerId === value ? 'bg-emerald-50 text-emerald-800 font-medium' : 'hover:bg-gray-50')}>
                  <span className="block truncate">{workspace.owner_name}</span>
                  <span className="block text-xs text-gray-500">
                    {workspace.asset_count} item{workspace.asset_count === 1 ? '' : 's'} · {formatBytes(workspace.total_bytes)}
                    {workspace.submitted_count > 0 && ` · ${workspace.submitted_count} in review`}
                  </span>
                </button>
              )
            })}
          </nav>
        )}

        <div className="flex-1 space-y-4 min-w-0">
          <MediaFilters query={query} onChange={patchQuery} showStatusFilter={tab === 'all'} />
          <p className="text-sm text-gray-500">{total} item{total === 1 ? '' : 's'}</p>

          <MediaGrid
            items={items}
            loading={loading}
            onSelect={(asset) => setSelectedId(asset.id)}
            emptyHint={tab === 'review' ? 'Nothing is waiting for review.' : 'No media matches these filters.'}
          />

          {pageCount > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button type="button" disabled={(query.page || 1) <= 1}
                onClick={() => setQuery((c) => ({ ...c, page: (c.page || 1) - 1 }))}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-40">
                Previous
              </button>
              <span className="text-sm text-gray-600">Page {query.page || 1} of {pageCount}</span>
              <button type="button" disabled={(query.page || 1) >= pageCount}
                onClick={() => setQuery((c) => ({ ...c, page: (c.page || 1) + 1 }))}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-40">
                Next
              </button>
            </div>
          )}
        </div>
      </div>

      {selectedId !== null && (
        // canReview is true here (every reviewer action is available across
        // every workspace), so the drawer's isOwner check is a real
        // comparison rather than an assumption — currentUserId must be
        // supplied, or a reviewer who also owns the selected asset loses
        // Submit/Withdraw/owner-Delete on their own upload.
        <MediaDetailDrawer
          assetId={selectedId}
          canReview
          workspaces={workspaces}
          currentUserId={user?.id ?? null}
          onClose={() => setSelectedId(null)}
          onChanged={refresh}
        />
      )}
    </div>
  )
}

export default AdminMediaLibrary
