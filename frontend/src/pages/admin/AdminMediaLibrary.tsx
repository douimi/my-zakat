import { useCallback, useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { useToast } from '../../contexts/ToastContext'
import { useAuthStore } from '../../store/authStore'
import MediaFilters from '../../components/media/MediaFilters'
import MediaGrid from '../../components/media/MediaGrid'
import MediaDetailDrawer from '../../components/media/MediaDetailDrawer'
import { formatBytes } from '../../components/media/MediaCard'
import ProjectFolderList, { type FolderSelection } from '../../components/media/ProjectFolderList'
import { PageHeader } from '../../components/admin'
import { Layers } from 'lucide-react'
import {
  mediaLibraryApi,
  type ListQuery,
  type MediaAsset,
  type ProjectFolder,
  type Workspace,
} from '../../utils/mediaLibraryApi'

const PAGE_SIZE = 48

const AdminMediaLibrary = () => {
  const { showError } = useToast()
  const { user } = useAuthStore()
  const [tab, setTab] = useState<'all' | 'review'>('all')
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [ownerId, setOwnerId] = useState<number | 'unassigned' | null>(null)
  // Projects first: people look for "the rice distribution photos", not for
  // whoever happened to take them. By-person stays for reassigning legacy media.
  const [browseBy, setBrowseBy] = useState<'project' | 'person'>('project')
  const [folders, setFolders] = useState<ProjectFolder[]>([])
  const [folder, setFolder] = useState<FolderSelection>(null)
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

  const loadFolders = useCallback(async () => {
    try {
      const data = await mediaLibraryApi.projects()
      setFolders(data.projects)
    } catch {
      showError('Could not load projects.')
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
        projectId: tab === 'review' ? null : folder,
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
  }, [query, ownerId, folder, tab])

  useEffect(() => { loadWorkspaces() }, [loadWorkspaces])
  useEffect(() => { loadFolders() }, [loadFolders])
  useEffect(() => { load() }, [load])

  const refresh = () => { load(); loadWorkspaces(); loadFolders() }

  // One axis at a time. Switching clears the other filter, so the grid never
  // silently shows "this project AND this person" with only one of them visible.
  const switchBrowse = (value: 'project' | 'person') => {
    setBrowseBy(value)
    setFolder(null)
    setOwnerId(null)
    setQuery((c) => ({ ...c, page: 1 }))
  }
  const openFolder = (value: FolderSelection) => {
    setFolder(value)
    setQuery((c) => ({ ...c, page: 1 }))
  }
  const patchQuery = (patch: Partial<ListQuery>) =>
    setQuery((current) => ({ ...current, ...patch, page: patch.page ?? 1 }))

  const pendingTotal = workspaces.reduce((sum, w) => sum + w.submitted_count, 0)
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-6">
      <PageHeader
        title="All Media"
        icon={Layers}
        description="Every project folder, and the queue waiting on review."
      />

      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {(['all', 'review'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => { setTab(value); setQuery((c) => ({ ...c, page: 1 })) }}
            className={clsx(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap',
              tab === value
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            )}
          >
            {value === 'all' ? 'All media' : `Review queue${pendingTotal ? ` (${pendingTotal})` : ''}`}
          </button>
        ))}
      </div>

      {/* Phones: the folder / people picker becomes a scrolling row above the grid. */}
      <div className="flex flex-col md:flex-row gap-4 md:gap-6 md:items-start">
        {tab === 'all' && (
          <nav className="w-full md:w-56 md:shrink-0 space-y-3" aria-label="Browse media">
            <div className="flex rounded-lg border border-gray-200 p-0.5 text-sm" role="group" aria-label="Browse by">
              {(['project', 'person'] as const).map((value) => (
                <button key={value} type="button" aria-pressed={browseBy === value}
                  onClick={() => switchBrowse(value)}
                  className={clsx('flex-1 rounded-md py-1.5',
                    browseBy === value ? 'bg-primary-600 text-white' : 'text-gray-600 hover:text-gray-900')}>
                  {value === 'project' ? 'Projects' : 'People'}
                </button>
              ))}
            </div>

            {browseBy === 'project' ? (
              <ProjectFolderList folders={folders} selected={folder} onSelect={openFolder} />
            ) : (
            <div className="flex gap-2 overflow-x-auto pb-1 md:block md:space-y-1 md:overflow-visible md:pb-0">
            <button type="button" onClick={() => setOwnerId(null)}
              className={clsx('shrink-0 md:w-full text-left px-3 py-2 rounded-lg text-sm border md:border-0 whitespace-nowrap md:whitespace-normal',
                ownerId === null ? 'bg-primary-50 text-primary-800 font-medium border-primary-200' : 'border-gray-200 hover:bg-gray-50')}>
              Every workspace
            </button>
            {workspaces.map((workspace) => {
              const value = workspace.owner_id ?? 'unassigned'
              return (
                <button key={String(value)} type="button" onClick={() => setOwnerId(value)}
                  className={clsx('shrink-0 max-w-[14rem] md:max-w-none md:w-full text-left px-3 py-2 rounded-lg text-sm border md:border-0',
                    ownerId === value ? 'bg-primary-50 text-primary-800 font-medium border-primary-200' : 'border-gray-200 hover:bg-gray-50')}>
                  <span className="block truncate">{workspace.owner_name}</span>
                  <span className="block text-xs text-gray-500">
                    {workspace.asset_count} item{workspace.asset_count === 1 ? '' : 's'} · {formatBytes(workspace.total_bytes)}
                    {workspace.submitted_count > 0 && ` · ${workspace.submitted_count} in review`}
                  </span>
                </button>
              )
            })}
            </div>
            )}
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
                className="btn-secondary btn-sm">
                Previous
              </button>
              <span className="text-sm text-gray-600">Page {query.page || 1} of {pageCount}</span>
              <button type="button" disabled={(query.page || 1) >= pageCount}
                onClick={() => setQuery((c) => ({ ...c, page: (c.page || 1) + 1 }))}
                className="btn-secondary btn-sm">
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
          projects={folders}
          currentUserId={user?.id ?? null}
          onClose={() => setSelectedId(null)}
          onChanged={refresh}
        />
      )}
    </div>
  )
}

export default AdminMediaLibrary
