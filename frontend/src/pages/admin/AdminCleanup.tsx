import { useState } from 'react'
import { useMutation } from 'react-query'
import { Trash2, RefreshCw, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'
import { useConfirmation } from '../../hooks/useConfirmation'
import axios from 'axios'

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

interface CleanupResult {
  orphaned_count: number
  deleted_count: number
  summary: {
    gallery_items: number
    stories: number
    testimonials: number
    events: number
    programs: number
    program_categories: number
    slideshow_slides: number
  }
  orphaned_items: {
    gallery_items: Array<{ id: number; media_filename: string; type: string }>
    stories: Array<{ id: number; title: string; video_filename: string }>
    testimonials: Array<{ id: number; name: string; video_filename?: string; image?: string }>
    events: Array<{ id: number; title: string; image: string }>
    programs: Array<{ id: number; title: string; video_filename?: string; image_url?: string }>
    program_categories: Array<{ id: number; name: string; video_filename?: string; image_url?: string }>
    slideshow_slides: Array<{ id: number; title: string; image: string }>
  }
}

const AdminCleanup = () => {
  const [scanResult, setScanResult] = useState<CleanupResult | null>(null)
  const { showSuccess, showError } = useToast()
  const { confirm, ConfirmationDialog } = useConfirmation()

  const scanMutation = useMutation(
    async () => {
      const response = await api.post('/api/cleanup/orphaned-media', null, {
        params: { auto_delete: false }
      })
      return response.data as CleanupResult
    },
    {
      onSuccess: (data) => {
        setScanResult(data)
        if (data.orphaned_count > 0) {
          showSuccess('Scan Complete', `Found ${data.orphaned_count} orphaned media entries`)
        } else {
          showSuccess('Scan Complete', 'No orphaned media found')
        }
      },
      onError: (error: any) => {
        showError('Scan Failed', error?.response?.data?.detail || 'Failed to scan for orphaned media')
      }
    }
  )

  const cleanupMutation = useMutation(
    async () => {
      const response = await api.post('/api/cleanup/auto-cleanup')
      return response.data as CleanupResult
    },
    {
      onSuccess: (data) => {
        setScanResult(data)
        showSuccess('Cleanup Complete', `Deleted ${data.deleted_count} orphaned media entries`)
      },
      onError: (error: any) => {
        showError('Cleanup Failed', error?.response?.data?.detail || 'Failed to cleanup orphaned media')
      }
    }
  )

  const handleScan = () => {
    scanMutation.mutate()
  }

  const handleCleanup = async () => {
    const confirmed = await confirm({
      title: 'Delete Orphaned Media',
      message: `Are you sure you want to delete ${scanResult?.orphaned_count || 0} orphaned media entries? This action cannot be undone.`,
      confirmText: 'Delete All',
      cancelText: 'Cancel',
      variant: 'danger'
    })
    if (confirmed) {
      cleanupMutation.mutate()
    }
  }

  return (
    <div className="section-container">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <Trash2 className="w-8 h-8 text-primary-600 mr-3" />
            <h1 className="text-3xl font-bold text-gray-900">Media Cleanup</h1>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={handleScan}
              disabled={scanMutation.isLoading}
              className="btn-outline flex items-center"
            >
              {scanMutation.isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Scan for Orphaned Media
                </>
              )}
            </button>
            {scanResult && scanResult.orphaned_count > 0 && (
              <button
                onClick={handleCleanup}
                disabled={cleanupMutation.isLoading}
                className="btn-primary bg-red-600 hover:bg-red-700 flex items-center"
              >
                {cleanupMutation.isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Cleaning...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete All Orphaned ({scanResult.orphaned_count})
                  </>
                )}
              </button>
            )}
          </div>
        </div>
        <p className="text-gray-600">
          Scan for media files that have been deleted from S3 but still have database entries.
          Orphaned entries are automatically cleaned up when files are deleted from S3.
        </p>
      </div>

      {scanResult && (
        <div className="card">
          <div className="mb-6">
            <div className="flex items-center gap-4 mb-4">
              {scanResult.orphaned_count > 0 ? (
                <>
                  <AlertTriangle className="w-8 h-8 text-yellow-600" />
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">
                      Found {scanResult.orphaned_count} Orphaned Media Entries
                    </h2>
                    <p className="text-gray-600">
                      These files have been deleted from S3 but still exist in the database.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <CheckCircle className="w-8 h-8 text-green-600" />
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">No Orphaned Media Found</h2>
                    <p className="text-gray-600">All media files in the database exist in S3.</p>
                  </div>
                </>
              )}
            </div>

            {scanResult.deleted_count > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                <div className="flex items-center">
                  <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
                  <span className="text-green-800 font-medium">
                    Successfully deleted {scanResult.deleted_count} orphaned entries
                  </span>
                </div>
              </div>
            )}
          </div>

          {scanResult.orphaned_count > 0 && (
            <div className="space-y-6">
              {/* Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {scanResult.summary.gallery_items > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="text-2xl font-bold text-yellow-800">{scanResult.summary.gallery_items}</div>
                    <div className="text-sm text-yellow-600">Gallery Items</div>
                  </div>
                )}
                {scanResult.summary.stories > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="text-2xl font-bold text-yellow-800">{scanResult.summary.stories}</div>
                    <div className="text-sm text-yellow-600">Stories</div>
                  </div>
                )}
                {scanResult.summary.testimonials > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="text-2xl font-bold text-yellow-800">{scanResult.summary.testimonials}</div>
                    <div className="text-sm text-yellow-600">Testimonials</div>
                  </div>
                )}
                {scanResult.summary.events > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="text-2xl font-bold text-yellow-800">{scanResult.summary.events}</div>
                    <div className="text-sm text-yellow-600">Events</div>
                  </div>
                )}
                {scanResult.summary.programs > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="text-2xl font-bold text-yellow-800">{scanResult.summary.programs}</div>
                    <div className="text-sm text-yellow-600">Programs</div>
                  </div>
                )}
                {scanResult.summary.program_categories > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="text-2xl font-bold text-yellow-800">{scanResult.summary.program_categories}</div>
                    <div className="text-sm text-yellow-600">Categories</div>
                  </div>
                )}
                {scanResult.summary.slideshow_slides > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="text-2xl font-bold text-yellow-800">{scanResult.summary.slideshow_slides}</div>
                    <div className="text-sm text-yellow-600">Slideshow</div>
                  </div>
                )}
              </div>

              {/* Detailed List */}
              <div className="space-y-4">
                {scanResult.orphaned_items.gallery_items.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Gallery Items ({scanResult.orphaned_items.gallery_items.length})</h3>
                    <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                      {scanResult.orphaned_items.gallery_items.map((item) => (
                        <div key={item.id} className="text-sm text-gray-700">
                          <span className="font-medium">#{item.id}</span>: {item.media_filename} ({item.type})
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {scanResult.orphaned_items.stories.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Stories ({scanResult.orphaned_items.stories.length})</h3>
                    <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                      {scanResult.orphaned_items.stories.map((story) => (
                        <div key={story.id} className="text-sm text-gray-700">
                          <span className="font-medium">#{story.id}</span>: {story.title} - {story.video_filename}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {scanResult.orphaned_items.testimonials.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Testimonials ({scanResult.orphaned_items.testimonials.length})</h3>
                    <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                      {scanResult.orphaned_items.testimonials.map((testimonial) => (
                        <div key={testimonial.id} className="text-sm text-gray-700">
                          <span className="font-medium">#{testimonial.id}</span>: {testimonial.name} - {testimonial.video_filename || testimonial.image}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {scanResult.orphaned_items.events.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Events ({scanResult.orphaned_items.events.length})</h3>
                    <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                      {scanResult.orphaned_items.events.map((event) => (
                        <div key={event.id} className="text-sm text-gray-700">
                          <span className="font-medium">#{event.id}</span>: {event.title} - {event.image}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {scanResult.orphaned_items.programs.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Programs ({scanResult.orphaned_items.programs.length})</h3>
                    <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                      {scanResult.orphaned_items.programs.map((program) => (
                        <div key={program.id} className="text-sm text-gray-700">
                          <span className="font-medium">#{program.id}</span>: {program.title} - {program.video_filename || program.image_url}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {scanResult.orphaned_items.program_categories.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Program Categories ({scanResult.orphaned_items.program_categories.length})</h3>
                    <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                      {scanResult.orphaned_items.program_categories.map((category) => (
                        <div key={category.id} className="text-sm text-gray-700">
                          <span className="font-medium">#{category.id}</span>: {category.name} - {category.video_filename || category.image_url}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {scanResult.orphaned_items.slideshow_slides.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Slideshow Slides ({scanResult.orphaned_items.slideshow_slides.length})</h3>
                    <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                      {scanResult.orphaned_items.slideshow_slides.map((slide) => (
                        <div key={slide.id} className="text-sm text-gray-700">
                          <span className="font-medium">#{slide.id}</span>: {slide.title} - {slide.image}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmationDialog />
    </div>
  )
}

export default AdminCleanup

