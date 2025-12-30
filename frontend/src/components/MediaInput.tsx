import { useState } from 'react'
import { Image as ImageIcon, Video, ExternalLink } from 'lucide-react'
import MediaPicker from './MediaPicker'
import { getStaticFileUrl } from '../utils/api'

interface MediaInputProps {
  value: string
  onChange: (url: string) => void
  type: 'images' | 'videos' | 'all'
  label?: string
  placeholder?: string
  required?: boolean
  showPreview?: boolean
}

const MediaInput = ({
  value,
  onChange,
  type,
  label,
  placeholder,
  required = false,
  showPreview = true,
}: MediaInputProps) => {
  const [isPickerOpen, setIsPickerOpen] = useState(false)

  const getMediaUrl = (url: string) => {
    if (!url) return ''
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url
    }
    return getStaticFileUrl(url)
  }

  const mediaUrl = getMediaUrl(value)

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      
      <div className="flex gap-2">
        <div className="flex-1">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder || `Enter ${type === 'images' ? 'image' : type === 'videos' ? 'video' : 'media'} URL or select from library`}
            className="input-field"
            required={required}
          />
        </div>
        <button
          type="button"
          onClick={() => setIsPickerOpen(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 whitespace-nowrap"
          title={`Select ${type === 'images' ? 'image' : type === 'videos' ? 'video' : 'media'} from library`}
        >
          {type === 'images' ? (
            <ImageIcon className="w-4 h-4" />
          ) : type === 'videos' ? (
            <Video className="w-4 h-4" />
          ) : (
            <ExternalLink className="w-4 h-4" />
          )}
          <span className="hidden sm:inline">Browse</span>
        </button>
      </div>

      {showPreview && value && (
        <div className="mt-2">
          {type === 'images' || type === 'all' ? (
            <div className="relative inline-block">
              <img
                src={mediaUrl}
                alt="Preview"
                className="max-w-xs max-h-48 object-cover rounded border border-gray-300"
                onError={(e) => {
                  const target = e.target as HTMLImageElement
                  target.style.display = 'none'
                }}
              />
            </div>
          ) : (
            <div className="relative inline-block max-w-xs">
              <video
                src={mediaUrl}
                className="max-w-xs max-h-48 object-cover rounded border border-gray-300"
                controls
                muted
                preload="metadata"
              />
            </div>
          )}
        </div>
      )}

      <MediaPicker
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onSelect={onChange}
        mediaType={type}
        currentValue={value}
      />
    </div>
  )
}

export default MediaInput

