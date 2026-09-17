import { useEffect, useState } from 'react'
import { Search, ArrowUpDown } from 'lucide-react'
import type { ListQuery } from '../../utils/mediaLibraryApi'

interface MediaFiltersProps {
  query: ListQuery
  onChange: (patch: Partial<ListQuery>) => void
  showStatusFilter: boolean
}

const SEARCH_DEBOUNCE_MS = 300

const MediaFilters = ({ query, onChange, showStatusFilter }: MediaFiltersProps) => {
  const [searchText, setSearchText] = useState(query.q || '')

  // Keep the box in step when the parent resets filters.
  useEffect(() => {
    setSearchText(query.q || '')
  }, [query.q])

  // Debounce: one request per pause in typing, not one per keystroke.
  useEffect(() => {
    if (searchText === (query.q || '')) return
    const timer = setTimeout(() => onChange({ q: searchText }), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText])

  const selectClass =
    'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500'

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex-1 min-w-[220px]">
        <label htmlFor="media-search" className="block text-xs font-medium text-gray-600 mb-1">
          Search
        </label>
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            id="media-search"
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search name, title, description or tags"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>
      </div>

      <div>
        <label htmlFor="media-type" className="block text-xs font-medium text-gray-600 mb-1">
          Type
        </label>
        <select
          id="media-type"
          value={query.type || 'all'}
          onChange={(e) => onChange({ type: e.target.value as ListQuery['type'] })}
          className={selectClass}
        >
          <option value="all">All types</option>
          <option value="image">Images</option>
          <option value="video">Videos</option>
        </select>
      </div>

      {showStatusFilter && (
        <div>
          <label htmlFor="media-status" className="block text-xs font-medium text-gray-600 mb-1">
            Status
          </label>
          <select
            id="media-status"
            value={query.status || 'all'}
            onChange={(e) => onChange({ status: e.target.value as ListQuery['status'] })}
            className={selectClass}
          >
            <option value="all">All statuses</option>
            <option value="private">Private</option>
            <option value="submitted">In review</option>
            <option value="public">Public</option>
          </select>
        </div>
      )}

      <div>
        <label htmlFor="media-sort" className="block text-xs font-medium text-gray-600 mb-1">
          Sort by
        </label>
        <div className="flex gap-1">
          <select
            id="media-sort"
            value={query.sort || 'created_at'}
            onChange={(e) => onChange({ sort: e.target.value as ListQuery['sort'] })}
            className={selectClass}
          >
            <option value="created_at">Date added</option>
            <option value="filename">File name</option>
            <option value="title">Title</option>
            <option value="size">Size</option>
            <option value="type">Type</option>
          </select>
          <button
            type="button"
            aria-label="Toggle sort direction"
            title={query.order === 'asc' ? 'Ascending' : 'Descending'}
            onClick={() => onChange({ order: query.order === 'asc' ? 'desc' : 'asc' })}
            className="px-2.5 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <ArrowUpDown className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default MediaFilters
