import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import MediaFilters from './MediaFilters'
import MediaGrid from './MediaGrid'
import { mediaLibraryApi, type ListQuery, type MediaAsset } from '../../utils/mediaLibraryApi'

const PAGE_SIZE = 48

interface MediaPickerDialogProps {
  open: boolean
  onClose: () => void
  /** `asset.url` is already `/api/media-library/{id}/file` — pass it through
   *  verbatim. `get_media_usage` on the backend matches content-table URLs
   *  by exact string equality, so anything else silently disables the
   *  delete/unpublish in-use guards for this asset. */
  onPick: (url: string, asset: MediaAsset) => void
}

/**
 * Lets an admin attach a photo or video already in the media library to a
 * Story, Event or Gallery item, instead of uploading a duplicate.
 *
 * The query is pinned to `status: 'public'` and never exposes a status
 * filter: an unpublished asset placed on a public page would 404 for
 * visitors, and worse, could put a private beneficiary photo on the site.
 */
const MediaPickerDialog = ({ open, onClose, onPick }: MediaPickerDialogProps) => {
  const [query, setQuery] = useState<ListQuery>({
    q: '', type: 'all', sort: 'created_at', order: 'desc', page: 1,
  })
  const [items, setItems] = useState<MediaAsset[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const data = await mediaLibraryApi.list({ ...query, status: 'public', pageSize: PAGE_SIZE })
      setItems(data.items)
      setTotal(data.total)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  useEffect(() => {
    if (!open) return
    load()
  }, [open, load])

  if (!open) return null

  const patchQuery = (patch: Partial<ListQuery>) =>
    setQuery((current) => ({ ...current, ...patch, page: patch.page ?? 1 }))

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choose from media library"
        className="relative bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[85vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Choose from media library</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <MediaFilters query={query} onChange={patchQuery} showStatusFilter={false} />

          {error && (
            <p className="text-sm text-red-600">Could not load the media library.</p>
          )}

          <p className="text-sm text-gray-500">
            {total} published item{total === 1 ? '' : 's'}
          </p>

          <MediaGrid
            items={items}
            loading={loading}
            onSelect={(asset) => onPick(asset.url, asset)}
            emptyHint="Nothing has been published to the site yet. Publish a photo or video in the media library first."
          />

          {pageCount > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                disabled={(query.page || 1) <= 1}
                onClick={() => setQuery((c) => ({ ...c, page: (c.page || 1) - 1 }))}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {query.page || 1} of {pageCount}
              </span>
              <button
                type="button"
                disabled={(query.page || 1) >= pageCount}
                onClick={() => setQuery((c) => ({ ...c, page: (c.page || 1) + 1 }))}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default MediaPickerDialog
