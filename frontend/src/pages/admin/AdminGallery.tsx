import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Upload, Trash2, GripVertical, Eye, EyeOff, Image as ImageIcon, Video, Loader2, X } from 'lucide-react'
import { galleryAPI, getStaticFileUrl } from '../../utils/api'
import { useToast } from '../../contexts/ToastContext'
import { useConfirmation } from '../../hooks/useConfirmation'
import VideoThumbnail from '../../components/VideoThumbnail'
import type { GalleryItem } from '../../types'

interface GalleryItemType extends GalleryItem {
  // Extended type
}

const AdminGallery = () => {
  const [uploading, setUploading] = useState(false)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [urlValue, setUrlValue] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const { showSuccess, showError } = useToast()
  const { confirm, ConfirmationDialog } = useConfirmation()

  const { data: galleryItems, isLoading } = useQuery('admin-gallery', () => galleryAPI.getAll(false))

  const uploadMutation = useMutation(galleryAPI.upload, {
    onSuccess: () => {
      queryClient.invalidateQueries('admin-gallery')
      queryClient.invalidateQueries('home-media-settings')
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      showSuccess('Success', 'Gallery item uploaded successfully!')
    },
    onError: (error: any) => {
      setUploading(false)
      showError('Upload Failed', error?.response?.data?.detail || 'Failed to upload gallery item')
    }
  })

  const createFromUrlMutation = useMutation(galleryAPI.create, {
    onSuccess: () => {
      queryClient.invalidateQueries('admin-gallery')
      queryClient.invalidateQueries('home-media-settings')
      setShowUrlInput(false)
      setUrlValue('')
      showSuccess('Success', 'Gallery item added successfully!')
    },
    onError: (error: any) => {
      showError('Error', error?.response?.data?.detail || 'Failed to add gallery item')
    }
  })

  const deleteMutation = useMutation(galleryAPI.delete, {
    onSuccess: () => {
      queryClient.invalidateQueries('admin-gallery')
      queryClient.invalidateQueries('home-media-settings')
      showSuccess('Success', 'Gallery item deleted successfully')
    },
    onError: (error: any) => {
      showError('Error', error?.response?.data?.detail || 'Failed to delete gallery item')
    }
  })

  const toggleActiveMutation = useMutation(
    ({ id, is_active }: { id: number; is_active: boolean }) => galleryAPI.update(id, { is_active }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('admin-gallery')
        queryClient.invalidateQueries('home-media-settings')
        showSuccess('Success', 'Gallery item updated')
      },
      onError: (error: any) => {
        showError('Error', error?.response?.data?.detail || 'Failed to update gallery item')
      }
    }
  )

  const reorderMutation = useMutation(galleryAPI.reorder, {
    onSuccess: () => {
      queryClient.invalidateQueries('admin-gallery')
      queryClient.invalidateQueries('home-media-settings')
      showSuccess('Success', 'Gallery items reordered')
    },
    onError: (error: any) => {
      showError('Error', error?.response?.data?.detail || 'Failed to reorder gallery items')
    }
  })

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const isImage = file.type.startsWith('image/')
    const isVideo = file.type.startsWith('video/')

    if (!isImage && !isVideo) {
      showError('Invalid File', 'Please select an image or video file')
      return
    }

    const maxImageSize = 5 * 1024 * 1024 // 5MB
    const maxVideoSize = 100 * 1024 * 1024 // 100MB
    const maxSize = isVideo ? maxVideoSize : maxImageSize

    if (file.size > maxSize) {
      showError('File Too Large', `File must be less than ${maxSize / (1024 * 1024)}MB`)
      return
    }

    setUploading(true)
    const maxOrder = galleryItems ? Math.max(...galleryItems.map((item: GalleryItemType) => item.display_order || 0), -1) : -1
    uploadMutation.mutate({ file, display_order: maxOrder + 1, is_active: true })
  }

  const handleUrlSubmit = () => {
    if (!urlValue.trim()) {
      showError('Error', 'Please enter a valid URL')
      return
    }

    // Validate URL format
    try {
      new URL(urlValue.trim())
    } catch {
      showError('Error', 'Please enter a valid URL (must start with http:// or https://)')
      return
    }

    const maxOrder = galleryItems ? Math.max(...galleryItems.map((item: GalleryItemType) => item.display_order || 0), -1) : -1
    createFromUrlMutation.mutate({
      media_filename: urlValue.trim(),
      display_order: maxOrder + 1,
      is_active: true
    })
  }

  const handleDelete = async (id: number) => {
    const confirmed = await confirm({
      title: 'Delete Gallery Item',
      message: 'Are you sure you want to delete this gallery item? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger'
    })
    if (confirmed) {
      deleteMutation.mutate(id)
    }
  }

  const handleToggleActive = (id: number, currentActive: boolean) => {
    toggleActiveMutation.mutate({ id, is_active: !currentActive })
  }

  const getMediaUrl = (filename: string): string => {
    if (filename.startsWith('http://') || filename.startsWith('https://')) {
      return filename
    }
    const isVideo = filename.match(/\.(mp4|webm|ogg|avi|mov)$/i)
    return isVideo
      ? getStaticFileUrl(`/api/uploads/media/videos/${filename}`)
      : getStaticFileUrl(`/api/uploads/media/images/${filename}`)
  }

  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
  }

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    if (draggedIndex === null || !galleryItems) return

    const items = [...galleryItems]
    const draggedItem = items[draggedIndex]
    items.splice(draggedIndex, 1)
    items.splice(dropIndex, 0, draggedItem)

    // Update display orders
    const reorderData = items.map((item, index) => ({
      id: item.id,
      display_order: index
    }))

    reorderMutation.mutate(reorderData)
    setDraggedIndex(null)
  }

  if (isLoading) {
    return (
      <div className="section-container">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      </div>
    )
  }

  const sortedItems = galleryItems ? [...galleryItems].sort((a, b) => (a.display_order || 0) - (b.display_order || 0)) : []

  return (
    <div className="section-container">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Operations Gallery</h1>
            <p className="text-gray-600 mt-2">Manage photos and videos for the "Our Work in Action" section</p>
          </div>
          <div className="flex items-center gap-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              onChange={handleFileSelect}
              className="hidden"
              disabled={uploading}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="btn-primary flex items-center"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload File
                </>
              )}
            </button>
            <button
              onClick={() => setShowUrlInput(!showUrlInput)}
              className="btn-outline flex items-center"
            >
              Add URL
            </button>
          </div>
        </div>

        {/* URL Input */}
        {showUrlInput && (
          <div className="mb-6 card bg-blue-50 border-blue-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-blue-900">Add Gallery Item from URL</h3>
              <button
                onClick={() => {
                  setShowUrlInput(false)
                  setUrlValue('')
                }}
                className="text-blue-600 hover:text-blue-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={urlValue}
                onChange={(e) => setUrlValue(e.target.value)}
                placeholder="https://example.com/image.jpg or https://example.com/video.mp4"
                className="input-field flex-1"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleUrlSubmit()
                  }
                }}
              />
              <button
                onClick={handleUrlSubmit}
                disabled={!urlValue.trim() || createFromUrlMutation.isLoading}
                className="btn-primary"
              >
                {createFromUrlMutation.isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  'Add'
                )}
              </button>
            </div>
            <p className="text-sm text-blue-700 mt-2">
              Enter a direct URL to an image or video file (must start with http:// or https://)
            </p>
          </div>
        )}
      </div>

      {sortedItems.length === 0 ? (
        <div className="card text-center py-12">
          <ImageIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">No gallery items yet</p>
          <button onClick={() => fileInputRef.current?.click()} className="btn-primary">
            Add Your First Item
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedItems.map((item: GalleryItemType, index: number) => {
            const mediaUrl = getMediaUrl(item.media_filename)
            const isVideo = item.media_filename.match(/\.(mp4|webm|ogg|avi|mov)$/i)

            return (
              <div
                key={item.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                className={`card hover:shadow-lg transition-all ${draggedIndex === index ? 'opacity-50' : ''}`}
              >
                {/* Media Preview */}
                <div className="aspect-square bg-gray-200 rounded-t-lg overflow-hidden relative group mb-4">
                  {isVideo ? (
                    <VideoThumbnail
                      videoSrc={mediaUrl}
                      className="w-full h-full"
                      alt={`Gallery video ${item.id}`}
                    />
                  ) : (
                    <img
                      src={mediaUrl}
                      alt={`Gallery item ${item.id}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  )}
                  <div className="absolute top-2 right-2 flex gap-2">
                    <button
                      onClick={() => handleToggleActive(item.id, item.is_active)}
                      className={`p-2 rounded-full ${
                        item.is_active
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-500 text-white'
                      }`}
                      title={item.is_active ? 'Active' : 'Inactive'}
                    >
                      {item.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="absolute top-2 left-2">
                    <div className="bg-black bg-opacity-50 text-white px-2 py-1 rounded text-xs flex items-center">
                      <GripVertical className="w-3 h-3 mr-1" />
                      {item.display_order + 1}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center text-sm text-gray-600">
                    {isVideo ? (
                      <Video className="w-4 h-4 mr-2" />
                    ) : (
                      <ImageIcon className="w-4 h-4 mr-2" />
                    )}
                    <span className="truncate max-w-[200px]" title={item.media_filename}>
                      {item.media_filename}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="text-red-600 hover:text-red-700 p-2 rounded-lg hover:bg-red-50"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
        )}

      <ConfirmationDialog />
    </div>
  )
}

export default AdminGallery

