import { ImageOff } from 'lucide-react'
import MediaCard from './MediaCard'
import type { MediaAsset } from '../../utils/mediaLibraryApi'

interface MediaGridProps {
  items: MediaAsset[]
  loading: boolean
  onSelect: (asset: MediaAsset) => void
  emptyHint?: string
}

const MediaGrid = ({ items, loading, onSelect, emptyHint }: MediaGridProps) => {
  if (loading) {
    return (
      <div
        data-testid="media-grid-loading"
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4"
      >
        {Array.from({ length: 12 }).map((_, index) => (
          <div key={index} className="bg-gray-100 rounded-lg aspect-square animate-pulse" />
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <ImageOff className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-600 font-medium">No media yet</p>
        <p className="text-sm text-gray-500 mt-1">
          {emptyHint || 'Upload a photo or video to get started.'}
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
      {items.map((asset) => (
        <MediaCard key={asset.id} asset={asset} onSelect={onSelect} />
      ))}
    </div>
  )
}

export default MediaGrid
