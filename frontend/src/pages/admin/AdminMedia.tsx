import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Upload, Video, Image as ImageIcon, Trash2, Eye, Save, Link as LinkIcon, X } from 'lucide-react'
import { settingsAPI } from '../../utils/api'
import type { Setting } from '../../types'

interface MediaItem {
  key: string
  value: string
  description: string
  type: 'image' | 'video' | 'mixed'
  displayName: string
}

const AdminMedia = () => {
  const [showUrlInput, setShowUrlInput] = useState<string | null>(null)
  const [urlValue, setUrlValue] = useState('')
  
  const queryClient = useQueryClient()
  
  const { data: settings, isLoading } = useQuery('admin-media-settings', settingsAPI.getAll)
  
  const updateMutation = useMutation(
    ({ key, data }: { key: string; data: { value: string; description?: string } }) =>
      settingsAPI.update(key, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('admin-media-settings')
        queryClient.invalidateQueries('admin-settings')
        queryClient.invalidateQueries('home-media-settings') // Refresh home page
        setShowUrlInput(null)
        setUrlValue('')
      }
    }
  )

  const mediaItems: MediaItem[] = [
    {
      key: 'hero_video',
      value: settings?.find((s: Setting) => s.key === 'hero_video')?.value || '',
      description: 'Main video displayed on the homepage hero section',
      type: 'video',
      displayName: 'Hero Video'
    },
    {
      key: 'program_image_1',
      value: settings?.find((s: Setting) => s.key === 'program_image_1')?.value || '',
      description: 'First program image on homepage',
      type: 'image',
      displayName: 'Program Image 1'
    },
    {
      key: 'program_image_2',
      value: settings?.find((s: Setting) => s.key === 'program_image_2')?.value || '',
      description: 'Second program image on homepage',
      type: 'image',
      displayName: 'Program Image 2'
    },
    {
      key: 'program_image_3',
      value: settings?.find((s: Setting) => s.key === 'program_image_3')?.value || '',
      description: 'Third program image on homepage',
      type: 'image',
      displayName: 'Program Image 3'
    }
  ]

  const galleryItems: MediaItem[] = [
    {
      key: 'gallery_item_1',
      value: settings?.find((s: Setting) => s.key === 'gallery_item_1')?.value || '',
      description: 'Gallery photo or YouTube video showcasing operations and aid activities',
      type: 'mixed',
      displayName: 'Gallery Item 1'
    },
    {
      key: 'gallery_item_2',
      value: settings?.find((s: Setting) => s.key === 'gallery_item_2')?.value || '',
      description: 'Gallery photo or YouTube video showcasing operations and aid activities',
      type: 'mixed',
      displayName: 'Gallery Item 2'
    },
    {
      key: 'gallery_item_3',
      value: settings?.find((s: Setting) => s.key === 'gallery_item_3')?.value || '',
      description: 'Gallery photo or YouTube video showcasing operations and aid activities',
      type: 'mixed',
      displayName: 'Gallery Item 3'
    },
    {
      key: 'gallery_item_4',
      value: settings?.find((s: Setting) => s.key === 'gallery_item_4')?.value || '',
      description: 'Gallery photo or YouTube video showcasing operations and aid activities',
      type: 'mixed',
      displayName: 'Gallery Item 4'
    },
    {
      key: 'gallery_item_5',
      value: settings?.find((s: Setting) => s.key === 'gallery_item_5')?.value || '',
      description: 'Gallery photo or YouTube video showcasing operations and aid activities',
      type: 'mixed',
      displayName: 'Gallery Item 5'
    },
    {
      key: 'gallery_item_6',
      value: settings?.find((s: Setting) => s.key === 'gallery_item_6')?.value || '',
      description: 'Gallery photo or YouTube video showcasing operations and aid activities',
      type: 'mixed',
      displayName: 'Gallery Item 6'
    }
  ]

  const isValidImageUrl = (url: string) => {
    if (!url) return true // Empty URL is valid
    try {
      const validUrl = new URL(url)
      const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']
      const hasValidExtension = validExtensions.some(ext => 
        validUrl.pathname.toLowerCase().includes(ext)
      )
      const isValidDomain = validUrl.protocol === 'http:' || validUrl.protocol === 'https:'
      return isValidDomain && (hasValidExtension || url.includes('unsplash') || url.includes('pexels') || url.includes('pixabay'))
    } catch {
      return false
    }
  }

  const isValidVideoUrl = (url: string) => {
    if (!url) return true // Empty URL is valid
    try {
      const validUrl = new URL(url)
      const isValidDomain = validUrl.protocol === 'http:' || validUrl.protocol === 'https:'
      
      // Check for YouTube URLs
      const isYoutube = url.includes('youtube.com') || url.includes('youtu.be')
      
      // Check for Vimeo URLs
      const isVimeo = url.includes('vimeo.com')
      
      // Check for direct video file extensions
      const videoExtensions = ['.mp4', '.webm', '.ogg', '.avi', '.mov']
      const hasVideoExtension = videoExtensions.some(ext => 
        validUrl.pathname.toLowerCase().includes(ext)
      )
      
      return isValidDomain && (isYoutube || isVimeo || hasVideoExtension)
    } catch {
      return false
    }
  }

  const isValidMixedUrl = (url: string) => {
    return isValidImageUrl(url) || isValidVideoUrl(url)
  }

  const getValidationFunction = (type: string) => {
    switch (type) {
      case 'image': return isValidImageUrl
      case 'video': return isValidVideoUrl
      case 'mixed': return isValidMixedUrl
      default: return isValidImageUrl
    }
  }

  const getEmbedVideoUrl = (url: string) => {
    // YouTube URL conversion
    if (url.includes('youtube.com/watch?v=')) {
      const videoId = url.split('v=')[1].split('&')[0]
      return `https://www.youtube.com/embed/${videoId}`
    }
    if (url.includes('youtu.be/')) {
      const videoId = url.split('youtu.be/')[1].split('?')[0]
      return `https://www.youtube.com/embed/${videoId}`
    }
    
    // Vimeo URL conversion
    if (url.includes('vimeo.com/')) {
      const videoId = url.split('vimeo.com/')[1].split('?')[0]
      return `https://player.vimeo.com/video/${videoId}`
    }
    
    // Return original URL for direct video files
    return url
  }

  const isEmbeddableVideo = (url: string) => {
    return url.includes('youtube.com') || url.includes('youtu.be') || url.includes('vimeo.com')
  }

  const isVideoUrl = (url: string) => {
    return isValidVideoUrl(url) && url.trim() !== ''
  }

  const handleRemoveMedia = (mediaKey: string, description: string) => {
    if (window.confirm('Are you sure you want to remove this media?')) {
      updateMutation.mutate({
        key: mediaKey,
        data: {
          value: '',
          description: description
        }
      })
    }
  }

  const handleUrlSubmit = (mediaKey: string, description: string) => {
    if (!urlValue.trim()) return
    
    updateMutation.mutate({
      key: mediaKey,
      data: {
        value: urlValue.trim(),
        description: description
      }
    })
  }

  const openUrlInput = (mediaKey: string) => {
    const currentValue = mediaItems.find(item => item.key === mediaKey)?.value || ''
    setUrlValue(currentValue)
    setShowUrlInput(mediaKey)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Media Management</h1>
        <p className="text-gray-600 mt-2">Manage homepage video, program images, and gallery content</p>
      </div>

      {/* Homepage Media */}
      <div className="mb-12">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">Homepage Media</h2>
          <p className="text-gray-600">Manage the main video and program images displayed on the homepage</p>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {mediaItems.map((item) => (
            <MediaCard
              key={item.key}
              item={item}
              isUpdating={updateMutation.isLoading}
              showUrlInput={showUrlInput === item.key}
              urlValue={urlValue}
              onRemove={() => handleRemoveMedia(item.key, item.description)}
              onUrlSubmit={() => handleUrlSubmit(item.key, item.description)}
              onOpenUrlInput={() => openUrlInput(item.key)}
              onCloseUrlInput={() => setShowUrlInput(null)}
              onUrlChange={setUrlValue}
            />
          ))}
        </div>
      </div>

      {/* Gallery Media */}
      <div className="mb-12">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">Operations Gallery</h2>
          <p className="text-gray-600">Showcase photos and videos of your aid activities and operations</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {galleryItems.map((item) => (
            <MediaCard
              key={item.key}
              item={item}
              isUpdating={updateMutation.isLoading}
              showUrlInput={showUrlInput === item.key}
              urlValue={urlValue}
              onRemove={() => handleRemoveMedia(item.key, item.description)}
              onUrlSubmit={() => handleUrlSubmit(item.key, item.description)}
              onOpenUrlInput={() => openUrlInput(item.key)}
              onCloseUrlInput={() => setShowUrlInput(null)}
              onUrlChange={setUrlValue}
            />
          ))}
        </div>
      </div>

      {/* Instructions */}
      <div className="mt-12 card bg-blue-50 border-blue-200">
        <h3 className="text-lg font-semibold text-blue-900 mb-4">Media Guidelines</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <h4 className="font-semibold text-blue-800 mb-2">Hero Video</h4>
            <ul className="text-blue-700 text-sm space-y-1">
              <li>• Recommended format: MP4</li>
              <li>• Max file size: 50MB</li>
              <li>• Aspect ratio: 16:9</li>
              <li>• Duration: 30-60 seconds</li>
              <li>• Supports URLs (YouTube, Vimeo, etc.)</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-blue-800 mb-2">Program Images</h4>
            <ul className="text-blue-700 text-sm space-y-1">
              <li>• Recommended format: JPG, PNG</li>
              <li>• Max file size: 5MB each</li>
              <li>• Aspect ratio: 4:3 or 16:9</li>
              <li>• Resolution: 1200x800 or higher</li>
              <li>• Supports image URLs</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-blue-800 mb-2">URL Support</h4>
            <ul className="text-blue-700 text-sm space-y-1">
              <li>• Click the <LinkIcon className="w-3 h-3 inline mx-1" /> button to add URLs</li>
              <li>• URLs must start with https://</li>
              <li>• Works with external media services</li>
              <li>• Faster loading than uploads</li>
              <li>• Changes reflect immediately</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

interface MediaCardProps {
  item: MediaItem
  isUpdating: boolean
  showUrlInput: boolean
  urlValue: string
  onRemove: () => void
  onUrlSubmit: () => void
  onOpenUrlInput: () => void
  onCloseUrlInput: () => void
  onUrlChange: (value: string) => void
}

const MediaCard = ({ 
  item, 
  isUpdating, 
  showUrlInput, 
  urlValue, 
  onRemove, 
  onUrlSubmit, 
  onOpenUrlInput, 
  onCloseUrlInput, 
  onUrlChange 
}: MediaCardProps) => {

  const isUrl = (value: string) => {
    return value.startsWith('http://') || value.startsWith('https://')
  }

  const getDisplayUrl = (value: string) => {
    if (!value) return null
    return value // All values should be URLs now
  }

  const getEmbedVideoUrl = (url: string) => {
    // YouTube URL conversion
    if (url.includes('youtube.com/watch?v=')) {
      const videoId = url.split('v=')[1].split('&')[0]
      return `https://www.youtube.com/embed/${videoId}`
    }
    if (url.includes('youtu.be/')) {
      const videoId = url.split('youtu.be/')[1].split('?')[0]
      return `https://www.youtube.com/embed/${videoId}`
    }
    
    // Vimeo URL conversion
    if (url.includes('vimeo.com/')) {
      const videoId = url.split('vimeo.com/')[1].split('?')[0]
      return `https://player.vimeo.com/video/${videoId}`
    }
    
    // Return original URL for direct video files
    return url
  }

  const isEmbeddableVideo = (url: string) => {
    return url.includes('youtube.com') || url.includes('youtu.be') || url.includes('vimeo.com')
  }

  const isValidImageUrl = (url: string) => {
    if (!url) return true
    try {
      const validUrl = new URL(url)
      const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']
      const hasValidExtension = validExtensions.some(ext => 
        validUrl.pathname.toLowerCase().includes(ext)
      )
      const isValidDomain = validUrl.protocol === 'http:' || validUrl.protocol === 'https:'
      return isValidDomain && (hasValidExtension || url.includes('unsplash') || url.includes('pexels') || url.includes('pixabay'))
    } catch {
      return false
    }
  }

  const isValidVideoUrl = (url: string) => {
    if (!url) return true
    try {
      const validUrl = new URL(url)
      const isValidDomain = validUrl.protocol === 'http:' || validUrl.protocol === 'https:'
      
      const isYoutube = url.includes('youtube.com') || url.includes('youtu.be')
      const isVimeo = url.includes('vimeo.com')
      const videoExtensions = ['.mp4', '.webm', '.ogg', '.avi', '.mov']
      const hasVideoExtension = videoExtensions.some(ext => 
        validUrl.pathname.toLowerCase().includes(ext)
      )
      
      return isValidDomain && (isYoutube || isVimeo || hasVideoExtension)
    } catch {
      return false
    }
  }

  const isValidMixedUrl = (url: string) => {
    return isValidImageUrl(url) || isValidVideoUrl(url)
  }

  const getValidationFunction = () => {
    switch (item.type) {
      case 'image': return isValidImageUrl
      case 'video': return isValidVideoUrl
      case 'mixed': return isValidMixedUrl
      default: return isValidImageUrl
    }
  }

  const isValidUrl = getValidationFunction()
  const isVideoContent = isValidVideoUrl(urlValue) && urlValue.trim() !== ''


  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold text-gray-900">{item.displayName}</h3>
        <div className="flex items-center space-x-2">
          <button
            onClick={onOpenUrlInput}
            className="text-blue-600 hover:text-blue-700 p-2 rounded-lg hover:bg-blue-50"
            title="Add URL"
            disabled={isUpdating}
          >
            <LinkIcon className="w-4 h-4" />
          </button>
          {item.value && (
            <button
              onClick={onRemove}
              className="text-red-600 hover:text-red-700 p-2 rounded-lg hover:bg-red-50"
              title="Remove media"
              disabled={isUpdating}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <p className="text-gray-600 text-sm mb-4">{item.description}</p>

      {/* URL Input Modal */}
      {showUrlInput && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-blue-900">
              Add {item.type === 'video' ? 'Video' : item.type === 'mixed' ? 'Photo/Video' : 'Photo'} URL
            </h4>
            <button
              onClick={onCloseUrlInput}
              className="text-blue-600 hover:text-blue-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-3">
            <input
              type="url"
              value={urlValue}
              onChange={(e) => onUrlChange(e.target.value)}
              placeholder={
                item.type === 'video' 
                  ? "Enter video URL (https://youtube.com/watch?v=...)" 
                  : item.type === 'mixed'
                  ? "Enter photo or YouTube video URL"
                  : "Enter photo URL (https://example.com/photo.jpg)"
              }
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                !isValidUrl(urlValue) && urlValue ? 'border-red-300' : 'border-blue-300'
              }`}
            />
            {!isValidUrl(urlValue) && urlValue && (
              <p className="text-red-600 text-sm">
                {item.type === 'video' 
                  ? "Please enter a valid video URL (YouTube, Vimeo, or direct video file)"
                  : item.type === 'mixed'
                  ? "Please enter a valid photo URL (jpg, jpeg, png, gif, webp, svg) or YouTube video URL"
                  : "Please enter a valid photo URL (jpg, jpeg, png, gif, webp, svg)"
                }
              </p>
            )}
            {urlValue && isValidUrl(urlValue) && (
              <div className="mt-2">
                <p className="text-sm text-gray-600 mb-2">Preview:</p>
                {isVideoContent && isEmbeddableVideo(urlValue) ? (
                  <iframe
                    src={getEmbedVideoUrl(urlValue)}
                    className="w-full h-32 rounded"
                    frameBorder="0"
                    allowFullScreen
                    title="Video Preview"
                  />
                ) : isVideoContent ? (
                  <video 
                    src={urlValue} 
                    controls
                    className="w-full h-32 rounded"
                    preload="metadata"
                  />
                ) : (
                  <img 
                    src={urlValue} 
                    alt="Preview" 
                    className="w-24 h-24 object-cover rounded"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                )}
              </div>
            )}
            <div className="flex space-x-2">
              <button
                onClick={onUrlSubmit}
                disabled={!urlValue.trim() || !isValidUrl(urlValue) || isUpdating}
                className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUpdating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save {item.type === 'video' ? 'Video' : item.type === 'mixed' ? 'Media' : 'Photo'} URL
                  </>
                )}
              </button>
              <button
                onClick={onCloseUrlInput}
                className="btn-outline"
              >
                Cancel
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {item.type === 'video' 
                ? "Supports: YouTube, Vimeo, MP4, WebM, OGG"
                : item.type === 'mixed'
                ? "Supports: Photos (JPG, PNG, GIF, WebP, SVG) and YouTube videos"
                : "Supports: JPG, JPEG, PNG, GIF, WebP, SVG from any website"
              }
            </p>
          </div>
        </div>
      )}

      {/* Current Media Display */}
      {item.value && (
        <div className="mb-4">
          <div className="bg-gray-100 rounded-lg p-4">
            <div>
              <div className="flex items-center mb-3">
                {isValidVideoUrl(item.value) && item.value.trim() !== '' ? (
                  <Video className="w-6 h-6 text-gray-600 mr-2" />
                ) : (
                  <ImageIcon className="w-6 h-6 text-gray-600 mr-2" />
                )}
                <p className="font-medium text-gray-900">
                  Current {isValidVideoUrl(item.value) && item.value.trim() !== '' ? 'Video' : 'Photo'}
                </p>
                {isUrl(item.value) && <LinkIcon className="w-4 h-4 text-blue-600 ml-2" />}
              </div>
              {getDisplayUrl(item.value) && (
                <div className="mb-3">
                  {isValidVideoUrl(item.value) && item.value.trim() !== '' ? (
                    isEmbeddableVideo(item.value) ? (
                      <iframe
                        src={getEmbedVideoUrl(item.value)}
                        className="w-full h-48 rounded"
                        frameBorder="0"
                        allowFullScreen
                        title="Current Video"
                      />
                    ) : (
                      <video 
                        src={getDisplayUrl(item.value)!}
                        controls
                        className="w-full max-h-48 rounded"
                        preload="metadata"
                      />
                    )
                  ) : (
                    <img 
                      src={getDisplayUrl(item.value)!}
                      alt={item.displayName}
                      className="w-full max-h-48 object-cover rounded"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  )}
                </div>
              )}
              <p className="text-sm text-gray-600 break-all">{item.value}</p>
            </div>
          </div>
        </div>
      )}

      {/* Media URL Input Area */}
      <div className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors border-gray-300 hover:border-gray-400 ${isUpdating ? 'opacity-50 pointer-events-none' : ''}`}>
        {isUpdating ? (
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-blue-600 font-medium">Updating {item.type === 'video' ? 'video' : 'media'}...</p>
          </div>
        ) : (
          <>
            <div className="flex justify-center mb-4">
              {item.type === 'video' ? (
                <Video className="w-12 h-12 text-gray-400" />
              ) : item.type === 'mixed' ? (
                <div className="flex space-x-2">
                  <ImageIcon className="w-12 h-12 text-gray-400" />
                  <Video className="w-12 h-12 text-gray-400" />
                </div>
              ) : (
                <ImageIcon className="w-12 h-12 text-gray-400" />
              )}
            </div>
            <p className="text-gray-600 mb-4">
              {item.type === 'video' 
                ? "Enter a video URL to set this video"
                : item.type === 'mixed'
                ? "Enter a photo or YouTube video URL"
                : "Enter a photo URL to set this image"
              }
            </p>
            <button
              onClick={onOpenUrlInput}
              className="btn-primary inline-flex items-center"
            >
              <LinkIcon className="w-4 h-4 mr-2" />
              Add {item.type === 'video' ? 'Video' : item.type === 'mixed' ? 'Media' : 'Photo'} URL
            </button>
            <p className="text-gray-500 text-sm mt-2">
              {item.type === 'video' 
                ? "Supports: YouTube, Vimeo, MP4, WebM, OGG"
                : item.type === 'mixed'
                ? "Supports: Photos (JPG, PNG, GIF, WebP, SVG) and YouTube videos"
                : "Supports: JPG, JPEG, PNG, GIF, WebP, SVG"
              }
            </p>
          </>
        )}
      </div>
    </div>
  )
}

export default AdminMedia
