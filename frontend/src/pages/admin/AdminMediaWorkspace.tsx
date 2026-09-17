import { useCallback, useEffect, useState } from 'react'
import { useToast } from '../../contexts/ToastContext'
import MediaFilters from '../../components/media/MediaFilters'
import MediaGrid from '../../components/media/MediaGrid'
import MediaUploader from '../../components/media/MediaUploader'
import MediaDetailDrawer from '../../components/media/MediaDetailDrawer'
import { mediaLibraryApi, type ListQuery, type MediaAsset } from '../../utils/mediaLibraryApi'

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

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await mediaLibraryApi.list({ ...query, pageSize: PAGE_SIZE })
      setItems(data.items)
      setTotal(data.total)
    } catch {
      showError('Could not load your media.')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  useEffect(() => { load() }, [load])

  // Any filter change resets to page 1; an explicit page change does not.
  const patchQuery = (patch: Partial<ListQuery>) =>
    setQuery((current) => ({ ...current, ...patch, page: patch.page ?? 1 }))

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">My Workspace</h1>
        <p className="text-sm text-gray-600 mt-1">
          Your photos and videos. Everything here is private until an admin publishes it.
        </p>
      </header>

      <MediaUploader onUploaded={load} />

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

      {selectedId !== null && (
        // canReview is always false here: My Workspace is the owner's own
        // uploads, never a review surface (that is All Media / the review
        // queue). Fixing it at false also means the drawer's isOwner check
        // never needs a currentUserId — every asset shown on this page
        // already belongs to the viewer.
        <MediaDetailDrawer
          assetId={selectedId}
          canReview={false}
          onClose={() => setSelectedId(null)}
          onChanged={load}
        />
      )}
    </div>
  )
}

export default AdminMediaWorkspace
