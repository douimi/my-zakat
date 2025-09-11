import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Upload, Video, Image as ImageIcon, Trash2, Eye, Save, Link as LinkIcon, X } from 'lucide-react'
import { settingsAPI } from '../../utils/api'
import type { Setting } from '../../types'

interface MediaItem {
  key: string
  value: string
  description: string
  type: 'image' | 'video'
  displayName: string
}

const AdminMedia = () => {
  const [uploading, setUploading] = useState<string | null>(null)
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
        setUploading(null)
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
      description: 'Gallery image/video showcasing operations and aid activities',
      type: 'image',
      displayName: 'Gallery Item 1'
    },
    {
      key: 'gallery_item_2',
      value: settings?.find((s: Setting) => s.key === 'gallery_item_2')?.value || '',
      description: 'Gallery image/video showcasing operations and aid activities',
      type: 'image',
      displayName: 'Gallery Item 2'
    },
    {
      key: 'gallery_item_3',
      value: settings?.find((s: Setting) => s.key === 'gallery_item_3')?.value || '',
      description: 'Gallery image/video showcasing operations and aid activities',
      type: 'image',
      displayName: 'Gallery Item 3'
    },
    {
      key: 'gallery_item_4',
      value: settings?.find((s: Setting) => s.key === 'gallery_item_4')?.value || '',
      description: 'Gallery image/video showcasing operations and aid activities',
      type: 'image',
      displayName: 'Gallery Item 4'
    },
    {
      key: 'gallery_item_5',
      value: settings?.find((s: Setting) => s.key === 'gallery_item_5')?.value || '',
      description: 'Gallery image/video showcasing operations and aid activities',
      type: 'image',
      displayName: 'Gallery Item 5'
    },
    {
      key: 'gallery_item_6',
      value: settings?.find((s: Setting) => s.key === 'gallery_item_6')?.value || '',
      description: 'Gallery image/video showcasing operations and aid activities',
      type: 'image',
      displayName: 'Gallery Item 6'
    }
  ]

  const handleFileUpload = async (file: File, mediaKey: string, description: string) => {
    setUploading(mediaKey)
    
    try {
      // Get admin token
      const token = localStorage.getItem('admin_token')
      
      if (!token) {
        throw new Error('No admin token found. Please log in again.')
      }
      
      // Create FormData for file upload
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', mediaKey)
      
      // Upload file to media endpoint
      const response = await fetch('/api/admin/upload-media', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Upload failed: ${response.status} - ${errorText}`)
      }
      
      const result = await response.json()
      
      // Update setting with new file path
      updateMutation.mutate({
        key: mediaKey,
        data: {
          value: result.filename,
          description: description
        }
      })
    } catch (error) {
      console.error('Upload error:', error)
      alert(`Upload failed: ${error.message}`)
      setUploading(null)
    }
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
              isUploading={uploading === item.key}
              isUpdating={updateMutation.isLoading}
              showUrlInput={showUrlInput === item.key}
              urlValue={urlValue}
              onUpload={(file) => handleFileUpload(file, item.key, item.description)}
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
              isUploading={uploading === item.key}
              isUpdating={updateMutation.isLoading}
              showUrlInput={showUrlInput === item.key}
              urlValue={urlValue}
              onUpload={(file) => handleFileUpload(file, item.key, item.description)}
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
  isUploading: boolean
  isUpdating: boolean
  showUrlInput: boolean
  urlValue: string
  onUpload: (file: File) => void
  onRemove: () => void
  onUrlSubmit: () => void
  onOpenUrlInput: () => void
  onCloseUrlInput: () => void
  onUrlChange: (value: string) => void
}

const MediaCard = ({ 
  item, 
  isUploading, 
  isUpdating, 
  showUrlInput, 
  urlValue, 
  onUpload, 
  onRemove, 
  onUrlSubmit, 
  onOpenUrlInput, 
  onCloseUrlInput, 
  onUrlChange 
}: MediaCardProps) => {
  const [dragOver, setDragOver] = useState(false)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    
    const files = Array.from(e.dataTransfer.files)
    const file = files[0]
    
    if (file) {
      const isValidType = item.type === 'video' 
        ? file.type.startsWith('video/')
        : file.type.startsWith('image/')
      
      if (isValidType) {
        onUpload(file)
      } else {
        alert(`Please select a valid ${item.type} file`)
      }
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Validate file type
      const isValidType = item.type === 'video' 
        ? file.type.startsWith('video/')
        : file.type.startsWith('image/')
      
      if (!isValidType) {
        alert(`Please select a valid ${item.type} file`)
        return
      }
      
      onUpload(file)
    }
    
    // Reset the input value so the same file can be selected again
    e.target.value = ''
  }

  const isUrl = (value: string) => {
    return value.startsWith('http://') || value.startsWith('https://')
  }

  const getDisplayUrl = (value: string) => {
    if (isUrl(value)) return value
    if (!value) return null
    return `/api/uploads/media/${item.type === 'video' ? 'videos' : 'images'}/${value}`
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
            <h4 className="font-semibold text-blue-900">Add {item.type === 'video' ? 'Video' : 'Image'} URL</h4>
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
              placeholder={`Enter ${item.type} URL (https://...)`}
              className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex space-x-2">
              <button
                onClick={onUrlSubmit}
                disabled={!urlValue.trim() || isUpdating}
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
                    Save URL
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
          </div>
        </div>
      )}

      {/* Current Media Display */}
      {item.value && (
        <div className="mb-4">
          <div className="bg-gray-100 rounded-lg p-4">
            {item.type === 'video' ? (
              <div>
                <div className="flex items-center mb-3">
                  <Video className="w-6 h-6 text-gray-600 mr-2" />
                  <p className="font-medium text-gray-900">Current Video</p>
                  {isUrl(item.value) && <LinkIcon className="w-4 h-4 text-blue-600 ml-2" />}
                </div>
                {getDisplayUrl(item.value) && (
                  <div className="mb-3">
                    {isUrl(item.value) && isEmbeddableVideo(item.value) ? (
                      // Embedded video preview (YouTube, Vimeo, etc.)
                      <div className="aspect-video max-h-48">
                        <iframe
                          src={getEmbedVideoUrl(item.value)}
                          className="w-full h-full rounded"
                          frameBorder="0"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          title="Video Preview"
                        ></iframe>
                      </div>
                    ) : (
                      // Direct video file
                      <video 
                        src={getDisplayUrl(item.value)!}
                        controls
                        className="w-full max-h-48 rounded"
                        preload="metadata"
                      />
                    )}
                  </div>
                )}
                <p className="text-sm text-gray-600 break-all">{item.value}</p>
              </div>
            ) : (
              <div>
                <div className="flex items-center mb-3">
                  <ImageIcon className="w-6 h-6 text-gray-600 mr-2" />
                  <p className="font-medium text-gray-900">Current Image</p>
                  {isUrl(item.value) && <LinkIcon className="w-4 h-4 text-blue-600 ml-2" />}
                </div>
                {getDisplayUrl(item.value) && (
                  <div className="mb-3">
                    <img 
                      src={getDisplayUrl(item.value)!}
                      alt={item.displayName}
                      className="w-full max-h-48 object-cover rounded"
                    />
                  </div>
                )}
                <p className="text-sm text-gray-600 break-all">{item.value}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Upload Area */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragOver
            ? 'border-primary-400 bg-primary-50'
            : 'border-gray-300 hover:border-gray-400'
        } ${(isUploading || isUpdating) ? 'opacity-50 pointer-events-none' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isUploading ? (
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mb-4"></div>
            <p className="text-primary-600 font-medium">Uploading {item.type}...</p>
            <p className="text-gray-500 text-sm mt-1">Please wait while we process your file</p>
          </div>
        ) : isUpdating ? (
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-blue-600 font-medium">Updating media...</p>
          </div>
        ) : (
          <>
            <div className="flex justify-center mb-4">
              {item.type === 'video' ? (
                <Video className="w-12 h-12 text-gray-400" />
              ) : (
                <ImageIcon className="w-12 h-12 text-gray-400" />
              )}
            </div>
            <p className="text-gray-600 mb-2">
              Drag and drop your {item.type} here, or
            </p>
            <div className="flex flex-col space-y-2">
              <label className="btn-primary inline-flex items-center cursor-pointer">
                <Upload className="w-4 h-4 mr-2" />
                Choose {item.type === 'video' ? 'Video' : 'Image'}
                <input
                  type="file"
                  className="hidden"
                  accept={item.type === 'video' ? 'video/*' : 'image/*'}
                  onChange={handleFileSelect}
                />
              </label>
              <p className="text-gray-500 text-sm">or use the URL button above to add a link</p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default AdminMedia
