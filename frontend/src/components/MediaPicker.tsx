import { useState, useEffect } from 'react'
import { useQuery } from 'react-query'
import { X, Search, Upload, Image as ImageIcon, Video, Loader2, Check } from 'lucide-react'
import { mediaAPI, getStaticFileUrl } from '../utils/api'

interface MediaItem {
  filename: string
  url: string
  path: string
  size: number
  created_at: string
  location?: string
  used_in?: string[]
}

interface MediaPickerProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (url: string) => void
  mediaType: 'images' | 'videos' | 'all'
  currentValue?: string
}

const MediaPicker = ({ isOpen, onClose, onSelect, mediaType, currentValue }: MediaPickerProps) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTab, setSelectedTab] = useState<'images' | 'videos'>(mediaType === 'images' ? 'images' : mediaType === 'videos' ? 'videos' : 'images')

  const { data: mediaData, isLoading } = useQuery(
    ['media-picker', mediaType],
    () => mediaAPI.getMediaPicker(mediaType === 'all' ? 'all' : mediaType),
    {
      enabled: isOpen,
      staleTime: 30000, // Cache for 30 seconds
    }
  )

  useEffect(() => {
    if (mediaType === 'all' && mediaData) {
      // Auto-select tab based on available media
      if (mediaData.images && mediaData.images.length > 0) {
        setSelectedTab('images')
      } else if (mediaData.videos && mediaData.videos.length > 0) {
        setSelectedTab('videos')
      }
    }
  }, [mediaData, mediaType])

  if (!isOpen) return null

  const images = mediaData?.images || []
  const videos = mediaData?.videos || []

  const filteredImages = images.filter((img: MediaItem) =>
    img.filename.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredVideos = videos.filter((vid: MediaItem) =>
    vid.filename.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const getMediaUrl = (item: MediaItem) => {
    if (item.url.startsWith('http://') || item.url.startsWith('https://')) {
      return item.url
    }
    return getStaticFileUrl(item.url)
  }

  const handleSelect = (item: MediaItem) => {
    const url = getMediaUrl(item)
    onSelect(url)
    onClose()
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Select Media</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs (only show if mediaType is 'all') */}
        {mediaType === 'all' && (
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setSelectedTab('images')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                selectedTab === 'images'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <ImageIcon className="w-4 h-4" />
                Images ({images.length})
              </div>
            </button>
            <button
              onClick={() => setSelectedTab('videos')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                selectedTab === 'videos'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <Video className="w-4 h-4" />
                Videos ({videos.length})
              </div>
            </button>
          </div>
        )}

        {/* Search */}
        <div className="p-4 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder={`Search ${selectedTab}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Media Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : (
            <>
              {selectedTab === 'images' && (
                <>
                  {filteredImages.length === 0 ? (
                    <div className="text-center py-12">
                      <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600">No images found</p>
                      {searchQuery && (
                        <p className="text-sm text-gray-500 mt-2">Try a different search term</p>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {filteredImages.map((image: MediaItem) => {
                        const imageUrl = getMediaUrl(image)
                        const isSelected = currentValue === imageUrl || currentValue === image.url
                        return (
                          <div
                            key={image.url}
                            className={`relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                              isSelected
                                ? 'border-blue-600 ring-2 ring-blue-200'
                                : 'border-gray-200 hover:border-blue-400'
                            }`}
                            onClick={() => handleSelect(image)}
                          >
                            <div className="aspect-square bg-gray-100 relative">
                              <img
                                src={imageUrl}
                                alt={image.filename}
                                className="w-full h-full object-cover"
                                crossOrigin="anonymous"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement
                                  // Hide broken image instead of trying to load non-existent placeholder
                                  target.style.display = 'none'
                                  // Show error indicator
                                  const parent = target.parentElement
                                  if (parent) {
                                    parent.innerHTML = '<div class="w-full h-full bg-gray-200 flex items-center justify-center"><span class="text-gray-400 text-xs">Image unavailable</span></div>'
                                  }
                                }}
                              />
                              {isSelected && (
                                <div className="absolute top-2 right-2 bg-blue-600 rounded-full p-1">
                                  <Check className="w-4 h-4 text-white" />
                                </div>
                              )}
                            </div>
                            <div className="p-2 bg-white">
                              <p className="text-xs text-gray-600 truncate" title={image.filename}>
                                {image.filename}
                              </p>
                              <p className="text-xs text-gray-400 mt-1">
                                {formatFileSize(image.size)}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}

              {selectedTab === 'videos' && (
                <>
                  {filteredVideos.length === 0 ? (
                    <div className="text-center py-12">
                      <Video className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600">No videos found</p>
                      {searchQuery && (
                        <p className="text-sm text-gray-500 mt-2">Try a different search term</p>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {filteredVideos.map((video: MediaItem) => {
                        const videoUrl = getMediaUrl(video)
                        const isSelected = currentValue === videoUrl || currentValue === video.url
                        return (
                          <div
                            key={video.url}
                            className={`relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                              isSelected
                                ? 'border-blue-600 ring-2 ring-blue-200'
                                : 'border-gray-200 hover:border-blue-400'
                            }`}
                            onClick={() => handleSelect(video)}
                          >
                            <div className="aspect-video bg-gray-900 relative">
                              <video
                                src={videoUrl}
                                className="w-full h-full object-cover"
                                muted
                                preload="metadata"
                              />
                              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30">
                                <Video className="w-12 h-12 text-white opacity-75" />
                              </div>
                              {isSelected && (
                                <div className="absolute top-2 right-2 bg-blue-600 rounded-full p-1">
                                  <Check className="w-4 h-4 text-white" />
                                </div>
                              )}
                            </div>
                            <div className="p-2 bg-white">
                              <p className="text-xs text-gray-600 truncate" title={video.filename}>
                                {video.filename}
                              </p>
                              <p className="text-xs text-gray-400 mt-1">
                                {formatFileSize(video.size)}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 flex items-center justify-between">
          <p className="text-sm text-gray-600">
            {selectedTab === 'images'
              ? `${filteredImages.length} image${filteredImages.length !== 1 ? 's' : ''}`
              : `${filteredVideos.length} video${filteredVideos.length !== 1 ? 's' : ''}`}
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default MediaPicker

