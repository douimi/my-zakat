import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { 
  Image as ImageIcon, 
  Video, 
  Trash2, 
  Search, 
  Filter, 
  Download, 
  Eye, 
  X, 
  Loader2,
  Grid3x3,
  List,
  Info,
  Play,
  Maximize2
} from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'
import { useConfirmation } from '../../hooks/useConfirmation'
import { getStaticFileUrl } from '../../utils/api'
import axios from 'axios'
import LazyVideo from '../../components/LazyVideo'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: API_BASE_URL,
})

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

interface MediaItem {
  object_key: string
  filename: string
  url: string
  size: number
  content_type: string
  last_modified: string | null
  type: 'image' | 'video' | 'other'
  usage: {
    gallery_items: Array<{ id: number; display_order: number }>
    stories: Array<{ id: number; title: string }>
    testimonials: Array<{ id: number; name: string }>
    events: Array<{ id: number; title: string }>
    programs: Array<{ id: number; title: string }>
    program_categories: Array<{ id: number; name: string }>
    slideshow_slides: Array<{ id: number; title: string }>
    settings: Array<{ key: string; value: string }>
  }
  usage_count: number
  prefix: string
}

interface BrowseResponse {
  media: MediaItem[]
  total: number
  filters: {
    media_type: string
    prefix: string
  }
}

const AdminS3Media = () => {
  const [mediaType, setMediaType] = useState<'all' | 'images' | 'videos'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null)
  const [previewMedia, setPreviewMedia] = useState<MediaItem | null>(null)
  const queryClient = useQueryClient()
  const { showSuccess, showError } = useToast()
  const { confirm, ConfirmationDialog } = useConfirmation()

  const { data: mediaData, isLoading, refetch } = useQuery<BrowseResponse>(
    ['s3-media', mediaType],
    async () => {
      const response = await api.get('/api/s3-media/browse', {
        params: { media_type: mediaType }
      })
      return response.data
    },
    {
      staleTime: 30000, // Cache for 30 seconds
    }
  )

  const deleteMutation = useMutation(
    async (objectKey: string) => {
      const encodedKey = encodeURIComponent(objectKey)
      const response = await api.delete(`/api/s3-media/${encodedKey}`, {
        params: { cleanup_db: true }
      })
      return response.data
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('s3-media')
        showSuccess('Deleted', 'Media file deleted successfully')
        if (selectedMedia) {
          setSelectedMedia(null)
        }
      },
      onError: (error: any) => {
        showError('Delete Failed', error?.response?.data?.detail || 'Failed to delete media file')
      }
    }
  )

  const handleDelete = async (media: MediaItem) => {
    if (media.usage_count > 0) {
      const usageDetails = Object.entries(media.usage)
        .filter(([_, items]) => items.length > 0)
        .map(([key, items]) => `${key}: ${items.length}`)
        .join(', ')
      
      const confirmed = await confirm({
        title: 'Delete Media File',
        message: `This file is used in ${media.usage_count} place(s): ${usageDetails}. Deleting it will also remove these references. Are you sure?`,
        confirmText: 'Delete Anyway',
        cancelText: 'Cancel',
        variant: 'danger'
      })
      if (!confirmed) return
    } else {
      const confirmed = await confirm({
        title: 'Delete Media File',
        message: `Are you sure you want to delete "${media.filename}"? This action cannot be undone.`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        variant: 'danger'
      })
      if (!confirmed) return
    }
    
    deleteMutation.mutate(media.object_key)
  }

  const filteredMedia = mediaData?.media.filter((item) =>
    item.filename.toLowerCase().includes(searchQuery.toLowerCase())
  ) || []

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return 'Unknown'
    return new Date(dateString).toLocaleString()
  }

  const getMediaUrl = (item: MediaItem): string => {
    if (item.url.startsWith('http://') || item.url.startsWith('https://')) {
      return item.url
    }
    return getStaticFileUrl(item.url)
  }

  if (isLoading) {
    return (
      <div className="section-container">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      </div>
    )
  }

  return (
    <div className="section-container">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <ImageIcon className="w-8 h-8 text-primary-600 mr-3" />
            <h1 className="text-3xl font-bold text-gray-900">S3 Media Browser</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
              className="btn-outline flex items-center"
              title={viewMode === 'grid' ? 'Switch to list view' : 'Switch to grid view'}
            >
              {viewMode === 'grid' ? <List className="w-4 h-4" /> : <Grid3x3 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Type:</span>
            <div className="flex gap-2">
              <button
                onClick={() => setMediaType('all')}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  mediaType === 'all'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setMediaType('images')}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${
                  mediaType === 'images'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <ImageIcon className="w-4 h-4" />
                Images
              </button>
              <button
                onClick={() => setMediaType('videos')}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${
                  mediaType === 'videos'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Video className="w-4 h-4" />
                Videos
              </button>
            </div>
          </div>

          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search media files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="text-sm text-gray-600">
            {filteredMedia.length} of {mediaData?.total || 0} files
          </div>
        </div>
      </div>

      {/* Media Grid/List */}
      {filteredMedia.length === 0 ? (
        <div className="card text-center py-12">
          <ImageIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Media Found</h3>
          <p className="text-gray-500">
            {searchQuery ? 'Try a different search term' : 'No media files found in S3'}
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {filteredMedia.map((item) => {
            const mediaUrl = getMediaUrl(item)
            return (
              <div
                key={item.object_key}
                className="card hover:shadow-lg transition-all group cursor-pointer"
                onClick={() => setSelectedMedia(item)}
              >
                {/* Media Preview */}
                <div className="aspect-square bg-gray-200 rounded-t-lg overflow-hidden relative mb-4">
                  {item.type === 'image' ? (
                    <img
                      src={mediaUrl}
                      alt={item.filename}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                      crossOrigin={mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://') ? 'anonymous' : undefined}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  ) : item.type === 'video' ? (
                    <div className="w-full h-full relative">
                      <video
                        src={mediaUrl}
                        className="w-full h-full object-cover"
                        muted
                        preload="metadata"
                        crossOrigin={mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://') ? 'anonymous' : undefined}
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30">
                        <Play className="w-12 h-12 text-white opacity-75" />
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-100">
                      <FileIcon className="w-12 h-12 text-gray-400" />
                    </div>
                  )}
                  
                  {/* Usage Badge */}
                  {item.usage_count > 0 && (
                    <div className="absolute top-2 left-2 bg-blue-600 text-white px-2 py-1 rounded text-xs font-medium">
                      Used {item.usage_count}x
                    </div>
                  )}
                  
                  {/* Actions Overlay */}
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setPreviewMedia(item)
                      }}
                      className="bg-white bg-opacity-90 hover:bg-opacity-100 rounded-full p-2"
                      title="Preview"
                    >
                      <Eye className="w-5 h-5 text-primary-600" />
                    </button>
                    <a
                      href={mediaUrl}
                      download={item.filename}
                      onClick={(e) => e.stopPropagation()}
                      className="bg-white bg-opacity-90 hover:bg-opacity-100 rounded-full p-2"
                      title="Download"
                    >
                      <Download className="w-5 h-5 text-primary-600" />
                    </a>
                  </div>
                </div>

                {/* File Info */}
                <div className="p-4">
                  <h3 className="font-semibold text-gray-900 truncate mb-1" title={item.filename}>
                    {item.filename}
                  </h3>
                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <span>{formatFileSize(item.size)}</span>
                    <span>{formatDate(item.last_modified)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="px-4 pb-4 flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedMedia(item)
                    }}
                    className="flex-1 btn-outline text-sm flex items-center justify-center"
                  >
                    <Info className="w-4 h-4 mr-1" />
                    Details
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(item)
                    }}
                    disabled={deleteMutation.isLoading}
                    className="btn-outline text-sm text-red-600 border-red-300 hover:bg-red-50 flex items-center"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="card">
          <div className="divide-y divide-gray-200">
            {filteredMedia.map((item) => {
              const mediaUrl = getMediaUrl(item)
              return (
                <div
                  key={item.object_key}
                  className="p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => setSelectedMedia(item)}
                >
                  <div className="flex items-center gap-4">
                    {/* Thumbnail */}
                    <div className="w-24 h-24 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0">
                      {item.type === 'image' ? (
                        <img
                          src={mediaUrl}
                          alt={item.filename}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          crossOrigin={mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://') ? 'anonymous' : undefined}
                        />
                      ) : item.type === 'video' ? (
                        <div className="w-full h-full relative">
                          <video
                            src={mediaUrl}
                            className="w-full h-full object-cover"
                            muted
                            preload="metadata"
                            crossOrigin={mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://') ? 'anonymous' : undefined}
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30">
                            <Play className="w-6 h-6 text-white" />
                          </div>
                        </div>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <FileIcon className="w-8 h-8 text-gray-400" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900 truncate">{item.filename}</h3>
                        {item.type === 'image' ? (
                          <ImageIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        ) : item.type === 'video' ? (
                          <Video className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        ) : null}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <span>{formatFileSize(item.size)}</span>
                        <span>•</span>
                        <span>{formatDate(item.last_modified)}</span>
                        {item.usage_count > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-blue-600 font-medium">Used {item.usage_count}x</span>
                          </>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {item.object_key}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setPreviewMedia(item)
                        }}
                        className="btn-outline text-sm"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <a
                        href={mediaUrl}
                        download={item.filename}
                        onClick={(e) => e.stopPropagation()}
                        className="btn-outline text-sm"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(item)
                        }}
                        disabled={deleteMutation.isLoading}
                        className="btn-outline text-sm text-red-600 border-red-300 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewMedia && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75" onClick={() => setPreviewMedia(null)}>
          <div className="relative max-w-7xl max-h-[90vh] m-4" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPreviewMedia(null)}
              className="absolute top-4 right-4 bg-white rounded-full p-2 hover:bg-gray-100 z-10"
            >
              <X className="w-6 h-6" />
            </button>
            {previewMedia.type === 'image' ? (
              <img
                src={getMediaUrl(previewMedia)}
                alt={previewMedia.filename}
                className="max-w-full max-h-[90vh] object-contain rounded-lg"
                crossOrigin={getMediaUrl(previewMedia).startsWith('http://') || getMediaUrl(previewMedia).startsWith('https://') ? 'anonymous' : undefined}
              />
            ) : previewMedia.type === 'video' ? (
              <div className="bg-black rounded-lg">
                <LazyVideo
                  src={getMediaUrl(previewMedia)}
                  className="w-full max-h-[90vh]"
                  controls={true}
                  playsInline={true}
                  autoPlay={false}
                />
              </div>
            ) : null}
            <div className="bg-white rounded-lg p-4 mt-4">
              <h3 className="font-semibold text-gray-900 mb-2">{previewMedia.filename}</h3>
              <div className="text-sm text-gray-600 space-y-1">
                <div>Size: {formatFileSize(previewMedia.size)}</div>
                <div>Type: {previewMedia.content_type}</div>
                <div>Modified: {formatDate(previewMedia.last_modified)}</div>
                <div>Object Key: {previewMedia.object_key}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {selectedMedia && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={() => setSelectedMedia(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-4xl max-h-[90vh] overflow-y-auto m-4" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Media Details</h2>
              <button
                onClick={() => setSelectedMedia(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6">
              {/* Preview */}
              <div className="mb-6">
                {selectedMedia.type === 'image' ? (
                  <img
                    src={getMediaUrl(selectedMedia)}
                    alt={selectedMedia.filename}
                    className="w-full max-h-96 object-contain rounded-lg bg-gray-100"
                    crossOrigin={getMediaUrl(selectedMedia).startsWith('http://') || getMediaUrl(selectedMedia).startsWith('https://') ? 'anonymous' : undefined}
                  />
                ) : selectedMedia.type === 'video' ? (
                  <div className="bg-black rounded-lg">
                    <LazyVideo
                      src={getMediaUrl(selectedMedia)}
                      className="w-full"
                      controls={true}
                      playsInline={true}
                      autoPlay={false}
                    />
                  </div>
                ) : null}
              </div>

              {/* File Information */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="text-sm font-medium text-gray-700">Filename</label>
                  <p className="text-gray-900">{selectedMedia.filename}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Size</label>
                  <p className="text-gray-900">{formatFileSize(selectedMedia.size)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Content Type</label>
                  <p className="text-gray-900">{selectedMedia.content_type}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Last Modified</label>
                  <p className="text-gray-900">{formatDate(selectedMedia.last_modified)}</p>
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium text-gray-700">Object Key</label>
                  <p className="text-gray-900 font-mono text-sm break-all">{selectedMedia.object_key}</p>
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium text-gray-700">URL</label>
                  <p className="text-gray-900 font-mono text-sm break-all">{selectedMedia.url}</p>
                </div>
              </div>

              {/* Usage Information */}
              {selectedMedia.usage_count > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Used In ({selectedMedia.usage_count})</h3>
                  <div className="space-y-3">
                    {selectedMedia.usage.gallery_items.length > 0 && (
                      <div>
                        <span className="text-sm font-medium text-gray-700">Gallery Items:</span>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {selectedMedia.usage.gallery_items.map((item) => (
                            <span key={item.id} className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm">
                              #{item.id} (Order: {item.display_order})
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {selectedMedia.usage.stories.length > 0 && (
                      <div>
                        <span className="text-sm font-medium text-gray-700">Stories:</span>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {selectedMedia.usage.stories.map((story) => (
                            <span key={story.id} className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm">
                              #{story.id}: {story.title}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {selectedMedia.usage.testimonials.length > 0 && (
                      <div>
                        <span className="text-sm font-medium text-gray-700">Testimonials:</span>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {selectedMedia.usage.testimonials.map((testimonial) => (
                            <span key={testimonial.id} className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-sm">
                              #{testimonial.id}: {testimonial.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {selectedMedia.usage.events.length > 0 && (
                      <div>
                        <span className="text-sm font-medium text-gray-700">Events:</span>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {selectedMedia.usage.events.map((event) => (
                            <span key={event.id} className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-sm">
                              #{event.id}: {event.title}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {selectedMedia.usage.programs.length > 0 && (
                      <div>
                        <span className="text-sm font-medium text-gray-700">Programs:</span>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {selectedMedia.usage.programs.map((program) => (
                            <span key={program.id} className="px-2 py-1 bg-indigo-100 text-indigo-800 rounded text-sm">
                              #{program.id}: {program.title}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {selectedMedia.usage.program_categories.length > 0 && (
                      <div>
                        <span className="text-sm font-medium text-gray-700">Program Categories:</span>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {selectedMedia.usage.program_categories.map((category) => (
                            <span key={category.id} className="px-2 py-1 bg-pink-100 text-pink-800 rounded text-sm">
                              #{category.id}: {category.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {selectedMedia.usage.slideshow_slides.length > 0 && (
                      <div>
                        <span className="text-sm font-medium text-gray-700">Slideshow Slides:</span>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {selectedMedia.usage.slideshow_slides.map((slide) => (
                            <span key={slide.id} className="px-2 py-1 bg-orange-100 text-orange-800 rounded text-sm">
                              #{slide.id}: {slide.title}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {selectedMedia.usage.settings.length > 0 && (
                      <div>
                        <span className="text-sm font-medium text-gray-700">Settings:</span>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {selectedMedia.usage.settings.map((setting, idx) => (
                            <span key={idx} className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-sm">
                              {setting.key}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-4 pt-6 border-t border-gray-200">
                <a
                  href={getMediaUrl(selectedMedia)}
                  download={selectedMedia.filename}
                  className="btn-primary flex items-center"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </a>
                <button
                  onClick={() => {
                    setPreviewMedia(selectedMedia)
                    setSelectedMedia(null)
                  }}
                  className="btn-outline flex items-center"
                >
                  <Maximize2 className="w-4 h-4 mr-2" />
                  Fullscreen Preview
                </button>
                <button
                  onClick={() => handleDelete(selectedMedia)}
                  disabled={deleteMutation.isLoading}
                  className="btn-outline text-red-600 border-red-300 hover:bg-red-50 flex items-center ml-auto"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmationDialog />
    </div>
  )
}

// File icon component
const FileIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
)

export default AdminS3Media

