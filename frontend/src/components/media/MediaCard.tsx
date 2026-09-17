import { Film, Image as ImageIcon, Lock, Clock, Globe } from 'lucide-react'
import { clsx } from 'clsx'
import { mediaLibraryApi, type MediaAsset } from '../../utils/mediaLibraryApi'

const STATUS_META = {
  private: { label: 'Private', icon: Lock, className: 'bg-gray-100 text-gray-700' },
  submitted: { label: 'In review', icon: Clock, className: 'bg-amber-100 text-amber-800' },
  public: { label: 'Public', icon: Globe, className: 'bg-emerald-100 text-emerald-800' },
} as const

/** Shared by the card, the drawer and the workspace sidebar — define it once here. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

interface MediaCardProps {
  asset: MediaAsset
  onSelect: (asset: MediaAsset) => void
}

const MediaCard = ({ asset, onSelect }: MediaCardProps) => {
  const status = STATUS_META[asset.status]
  const StatusIcon = status.icon
  const label = asset.title || asset.filename

  return (
    <button
      type="button"
      onClick={() => onSelect(asset)}
      aria-label={label}
      className="group text-left bg-white rounded-lg border border-gray-200 overflow-hidden hover:border-emerald-400 hover:shadow-md transition focus:outline-none focus:ring-2 focus:ring-emerald-500"
    >
      <div className="aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
        {asset.thumbnail_url ? (
          <img
            src={mediaLibraryApi.thumbUrl(asset.id, 400)}
            alt={label}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
          />
        ) : asset.media_type === 'video' ? (
          <Film className="w-10 h-10 text-gray-400" />
        ) : (
          <ImageIcon className="w-10 h-10 text-gray-400" />
        )}
      </div>

      <div className="p-2.5">
        <p className="text-sm font-medium text-gray-900 truncate" title={label}>
          {label}
        </p>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span
            className={clsx(
              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide',
              status.className
            )}
          >
            <StatusIcon className="w-3 h-3" />
            {status.label}
          </span>
          <span className="text-[11px] text-gray-500">{formatBytes(asset.size_bytes)}</span>
        </div>
      </div>
    </button>
  )
}

export default MediaCard
