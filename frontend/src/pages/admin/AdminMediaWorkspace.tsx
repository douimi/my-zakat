import { useCallback, useEffect, useState } from 'react'
import { useToast } from '../../contexts/ToastContext'
import MediaFilters from '../../components/media/MediaFilters'
import MediaGrid from '../../components/media/MediaGrid'
import MediaUploader from '../../components/media/MediaUploader'
import MediaDetailDrawer from '../../components/media/MediaDetailDrawer'
import ProjectFolderList, { type FolderSelection } from '../../components/media/ProjectFolderList'
import { PageHeader } from '../../components/admin'
import { FolderOpen } from 'lucide-react'
import {
  mediaLibraryApi, type ListQuery, type MediaAsset, type ProjectFolder,
} from '../../utils/mediaLibraryApi'

const PAGE_SIZE = 48

const AdminMediaWorkspace = () => {
  const { showError } = useToast()
  const [query, setQuery] = useState<ListQuery>({
    q: '', type: 'all', status: 'all', sort: 'created_at', order: 'desc', page: 1,
  })
  const [items, setItems] = useState<MediaAsset[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [folders, setFolders] = useState<ProjectFolder[]>([])
  const [folder, setFolder] = useState<FolderSelection>(null)

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
      const data = await mediaLibraryApi.list({ ...query, projectId: folder, pageSize: PAGE_SIZE })
      setItems(data.items)
      setTotal(data.total)
    } catch {
      showError('Could not load your media.')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, folder])

  useEffect(() => { loadFolders() }, [loadFolders])
  useEffect(() => { load() }, [load])

  // Uploads, refiles and deletes all change folder counts as well as the grid.
  const refresh = () => { load(); loadFolders() }
  const openFolder = (value: FolderSelection) => {
    setFolder(value)
    setQuery((c) => ({ ...c, page: 1 }))
  }

  // Any filter change resets to page 1; an explicit page change does not.
  const patchQuery = (patch: Partial<ListQuery>) =>
    setQuery((current) => ({ ...current, ...patch, page: patch.page ?? 1 }))

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Workspace"
        icon={FolderOpen}
        description="Your photos and videos. Everything here is private until an admin publishes it."
      />

      {/* Phones: the folders become one scrolling row above the grid. */}
      <div className="flex flex-col md:flex-row gap-4 md:gap-6 md:items-start">
        <nav className="w-full md:w-56 md:shrink-0" aria-label="Projects">
          <ProjectFolderList folders={folders} selected={folder} onSelect={openFolder} allLabel="All my media" />
        </nav>

        <div className="flex-1 space-y-6 min-w-0">
          <MediaUploader
            onUploaded={refresh}
            projects={folders}
            projectId={typeof folder === 'number' ? folder : null}
          />

          <MediaFilters query={query} onChange={patchQuery} showStatusFilter />

          <p className="text-sm text-gray-500">
            {total} item{total === 1 ? '' : 's'}
          </p>

          <MediaGrid
            items={items}
            loading={loading}
            onSelect={(asset) => setSelectedId(asset.id)}
            emptyHint="Drop a photo or video above to add your first item."
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
        // canReview is always false here: My Workspace is the owner's own
        // uploads, never a review surface (that is All Media / the review
        // queue). Fixing it at false also means the drawer's isOwner check
        // never needs a currentUserId — every asset shown on this page
        // already belongs to the viewer.
        <MediaDetailDrawer
          assetId={selectedId}
          canReview={false}
          projects={folders}
          onClose={() => setSelectedId(null)}
          onChanged={refresh}
        />
      )}
    </div>
  )
}

export default AdminMediaWorkspace
