import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Upload, Video, Trash2, Play, Download, FileVideo, Loader2 } from 'lucide-react'
import { mediaAPI, getStaticFileUrl } from '../../utils/api'
import { useToast } from '../../contexts/ToastContext'
import { useConfirmation } from '../../hooks/useConfirmation'

interface VideoFile {
  filename: string
  path: string
  size: number
  created_at: string
  modified_at: string
  location?: string
  used_in?: string[]
}

const AdminVideos = () => {
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const { showSuccess, showError } = useToast()
  const { confirm, ConfirmationDialog } = useConfirmation()

  const { data: videos, isLoading } = useQuery('admin-videos', mediaAPI.listVideos)

  const deleteMutation = useMutation(mediaAPI.deleteVideo, {
    onSuccess: (data: any) => {
      queryClient.invalidateQueries('admin-videos')
      // Also invalidate queries that might show this video
      queryClient.invalidateQueries('admin-stories')
      queryClient.invalidateQueries('admin-testimonials')
      queryClient.invalidateQueries('admin-media-settings')
      queryClient.invalidateQueries('admin-settings')
      queryClient.invalidateQueries('home-media-settings')
      queryClient.invalidateQueries('admin-gallery')
      queryClient.invalidateQueries('public-gallery')
      
      // Show detailed success message
      let message = 'Video deleted successfully'
      if (data.affected_stories > 0 || data.affected_testimonials > 0 || data.affected_gallery_items > 0 || (data.cleared_settings && data.cleared_settings.length > 0)) {
        const parts = []
        if (data.affected_stories > 0) {
          parts.push(`${data.affected_stories} story/stories`)
        }
        if (data.affected_testimonials > 0) {
          parts.push(`${data.affected_testimonials} testimonial/testimonials`)
        }
        if (data.affected_gallery_items > 0) {
          parts.push(`${data.affected_gallery_items} gallery item(s)`)
        }
        if (data.cleared_settings && data.cleared_settings.length > 0) {
          const settingNames = data.cleared_settings.map((s: string) => {
            if (s === 'hero_video') return 'Hero Video'
            if (s.startsWith('gallery_item_')) return `Gallery Item ${s.replace('gallery_item_', '')}`
            return s
          })
          parts.push(`settings: ${settingNames.join(', ')}`)
        }
        message += `. Also removed from: ${parts.join(', ')}`
      }
      showSuccess('Video Deleted', message)
    },
    onError: (error: any) => {
      showError('Error', error?.response?.data?.detail || 'Failed to delete video')
    }
  })

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('video/')) {
      showError('Invalid File', 'Please select a video file')
      return
    }

    // Validate file size (100MB max)
    const maxSize = 100 * 1024 * 1024
    if (file.size > maxSize) {
      showError('File Too Large', 'Video file must be less than 100MB')
      return
    }

    setUploading(true)
    try {
      await mediaAPI.uploadVideo(file)
      queryClient.invalidateQueries('admin-videos')
      showSuccess('Success', 'Video uploaded successfully')
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (error: any) {
      showError('Upload Failed', error?.response?.data?.detail || 'Failed to upload video')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (filename: string) => {
    const confirmed = await confirm({
      title: 'Delete Video',
      message: `Are you sure you want to delete "${filename}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger'
    })
    if (confirmed) {
      deleteMutation.mutate(filename)
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString()
  }

  const getVideoUrl = (video: VideoFile): string => {
    // Use the path from the video object, which includes the correct directory
    if (video.path) {
      return getStaticFileUrl(video.path)
    }
    // Fallback: determine path based on location
    if (video.location === 'stories') {
      return getStaticFileUrl(`/api/uploads/stories/${video.filename}`)
    } else if (video.location === 'testimonials') {
      return getStaticFileUrl(`/api/uploads/testimonials/${video.filename}`)
    }
    // Default to media/videos
    return getStaticFileUrl(`/api/uploads/media/videos/${video.filename}`)
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

  return (
    <div className="section-container">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <Video className="w-8 h-8 text-primary-600 mr-3" />
            <h1 className="text-3xl font-bold text-gray-900">Video Management</h1>
          </div>
          <div className="flex items-center gap-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
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
                  Upload Video
                </>
              )}
            </button>
          </div>
        </div>
        <p className="text-gray-600">
          Upload and manage video files for use across the platform. Maximum file size: 100MB
        </p>
      </div>

      {/* Videos Grid */}
      {videos && videos.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {videos.map((video: VideoFile) => (
            <div key={video.filename} className="card hover:shadow-lg transition-shadow">
              {/* Video Preview */}
              <div className="aspect-video bg-gray-900 rounded-t-lg overflow-hidden relative group">
                <video
                  src={getVideoUrl(video)}
                  className="w-full h-full object-contain"
                  controls={true}
                  preload="metadata"
                  playsInline
                  muted
                >
                  <source src={getVideoUrl(video)} type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-200 flex items-center justify-center">
                  <a
                    href={getVideoUrl(video)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="opacity-0 group-hover:opacity-100 transition-opacity bg-white bg-opacity-90 rounded-full p-3 hover:bg-opacity-100"
                    title="Play video"
                  >
                    <Play className="w-6 h-6 text-primary-600 ml-0.5" fill="currentColor" />
                  </a>
                </div>
              </div>

              {/* Video Info */}
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate" title={video.filename}>
                      {video.filename}
                    </h3>
                  </div>
                </div>

                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex items-center">
                    <FileVideo className="w-4 h-4 mr-2" />
                    <span>{formatFileSize(video.size)}</span>
                  </div>
                  {video.location && (
                    <div className="text-xs text-gray-500">
                      Location: <span className="font-medium">{video.location}</span>
                    </div>
                  )}
                  {video.used_in && video.used_in.length > 0 && (
                    <div className="text-xs text-gray-500">
                      Used in: <span className="font-medium">{video.used_in.join(', ')}</span>
                    </div>
                  )}
                  <div className="text-xs text-gray-500">
                    Uploaded: {formatDate(video.created_at)}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-200">
                  <a
                    href={getVideoUrl(video)}
                    download={video.filename}
                    className="flex-1 btn-outline text-sm flex items-center justify-center"
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Download
                  </a>
                  <button
                    onClick={() => handleDelete(video.filename)}
                    disabled={deleteMutation.isLoading}
                    className="btn-outline text-sm text-red-600 border-red-300 hover:bg-red-50 flex items-center"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card text-center py-12">
          <Video className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Videos Uploaded</h3>
          <p className="text-gray-500 mb-6">
            Upload your first video to get started. Videos can be used in stories, testimonials, and other content.
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn-primary inline-flex items-center"
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload Video
          </button>
        </div>
      )}

      <ConfirmationDialog />
    </div>
  )
}

export default AdminVideos

