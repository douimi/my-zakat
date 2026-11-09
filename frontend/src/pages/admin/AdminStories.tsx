import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Plus, Edit, Trash2, BookOpen, Image as ImageIcon, Video, Star, CheckCircle2, Clock, LibraryBig } from 'lucide-react'
import { storiesAPI, getStaticFileUrl } from '../../utils/api'
import { useToast } from '../../contexts/ToastContext'
import { useConfirmation } from '../../hooks/useConfirmation'
import { useAuthStore } from '../../store/authStore'
import type { Story } from '../../types'
import axios from 'axios'
import MediaInput from '../../components/MediaInput'
import MediaPickerDialog from '../../components/media/MediaPickerDialog'
import {
  PageHeader, Modal, Collapsible, LoadingBlock, ErrorState, EmptyState, StatusBadge, LongText,
} from '../../components/admin'

interface StoryFormData {
  title: string
  summary: string
  content: string
  is_active: boolean
  is_featured: boolean
  video_file: File | null
  video_url: string
  image_url: string
  remove_video: boolean
}

const AdminStories = () => {
  const [showForm, setShowForm] = useState(false)
  const [tab, setTab] = useState<'all' | 'pending' | 'published'>('all')
  const [editingStory, setEditingStory] = useState<Story | null>(null)
  // Which form field a "Choose from media library" click is filling in.
  const [mediaLibraryTarget, setMediaLibraryTarget] = useState<'image' | 'video' | null>(null)
  const { confirm, ConfirmationDialog } = useConfirmation()
  const [formData, setFormData] = useState<StoryFormData>({
    title: '',
    summary: '',
    content: '',
    is_active: true,
    is_featured: false,
    video_file: null,
    video_url: '',
    image_url: '',
    remove_video: false
  })
  
  const queryClient = useQueryClient()
  const { showSuccess, showError } = useToast()
  const { isAdmin, user: currentUser } = useAuthStore()

  // Staff listing returns: admins → everything; managers → approved stories + their own pending ones.
  const { data: stories, isLoading, isError, refetch } = useQuery('admin-stories', () =>
    storiesAPI.getAllForStaff(false)
  )

  const approveMutation = useMutation(storiesAPI.approve, {
    onSuccess: () => {
      queryClient.invalidateQueries('admin-stories')
      showSuccess('Approved', 'Story is now visible on the public site')
    },
    onError: (error: any) => {
      showError('Approval failed', parseErrorMessage(error))
    },
  })

  // Helper function to parse error messages from backend
  const parseErrorMessage = (error: any): string => {
    if (axios.isAxiosError(error)) {
      const response = error.response
      
      if (response?.status === 422) {
        // Validation error from FastAPI/Pydantic
        const detail = response.data?.detail
        
        if (Array.isArray(detail)) {
          // Pydantic validation errors format: [{ loc: ['field'], msg: 'message', type: 'type' }]
          const errors = detail.map((err: any) => {
            const field = err.loc && err.loc.length > 0 
              ? err.loc[err.loc.length - 1].toString().replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())
              : 'field'
            const message = err.msg || 'Invalid value'
            // Make field names more user-friendly
            const friendlyField = field === 'title' ? 'Title' 
              : field === 'summary' ? 'Summary'
              : field === 'content' ? 'Content'
              : field === 'image filename' ? 'Image'
              : field === 'video url' ? 'Video URL'
              : field
            return `${friendlyField}: ${message}`
          })
          return errors.join('. ')
        } else if (typeof detail === 'string') {
          return detail
        } else if (detail?.message) {
          return detail.message
        }
        
        return 'Please check all required fields are filled correctly'
      } else if (response?.status === 400) {
        return response.data?.detail || 'Invalid request. Please check your input.'
      } else if (response?.status === 401) {
        return 'You are not authorized to perform this action'
      } else if (response?.status === 403) {
        return 'You do not have permission to perform this action'
      } else if (response?.status === 404) {
        return 'Story not found'
      } else if (response?.status === 500) {
        return 'Server error. Please try again later.'
      }
      
      return response?.data?.detail || error.message || 'An error occurred. Please try again.'
    }
    
    return error?.message || 'An unexpected error occurred. Please try again.'
  }
  
  const createMutation = useMutation(
    (data: FormData) => storiesAPI.create(data),
    {
    onSuccess: () => {
      queryClient.invalidateQueries('admin-stories')
      resetForm()
      showSuccess('Success', 'Story created successfully!')
    },
    onError: (error: any) => {
      const errorMessage = parseErrorMessage(error)
      showError('Failed to Create Story', errorMessage)
    }
  })
  
  const updateMutation = useMutation(
    ({ id, data }: { id: number; data: FormData }) => storiesAPI.update(id, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('admin-stories')
        resetForm()
        showSuccess('Success', 'Story updated successfully!')
      },
      onError: (error: any) => {
        const errorMessage = parseErrorMessage(error)
        showError('Failed to Update Story', errorMessage)
      }
    }
  )
  
  const deleteMutation = useMutation(storiesAPI.delete, {
    onSuccess: () => {
      queryClient.invalidateQueries('admin-stories')
      showSuccess('Success', 'Story deleted successfully!')
    },
    onError: (error: any) => {
      const errorMessage = parseErrorMessage(error)
      showError('Failed to Delete Story', errorMessage)
    }
  })

  const resetForm = () => {
    setFormData({
      title: '',
      summary: '',
      content: '',
      is_active: true,
      is_featured: false,
      video_file: null,
      video_url: '',
      image_url: '',
      remove_video: false
    })
    setEditingStory(null)
    setShowForm(false)
  }

  const handleEdit = (story: Story) => {
    setEditingStory(story)
      setFormData({
        title: story.title,
        summary: story.summary,
        content: story.content,
        is_active: story.is_active,
        is_featured: story.is_featured,
        video_file: null,
        video_url: story.video_filename || '',
        image_url: story.image_filename || '',
        remove_video: false
      })
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Backend expects multipart/form-data
    const submitData = new FormData()
    submitData.append('title', formData.title.trim())
    submitData.append('summary', formData.summary.trim())
    submitData.append('content', formData.content.trim())
    submitData.append('is_active', formData.is_active.toString())
    submitData.append('is_featured', formData.is_featured.toString())
    
    if (formData.image_url && formData.image_url.trim()) {
      submitData.append('image_filename', formData.image_url.trim())
    }
    
    if (formData.video_file) {
      submitData.append('video', formData.video_file)
    } else if (formData.video_url && formData.video_url.trim()) {
      submitData.append('video_filename', formData.video_url.trim())
    }
    
    if (formData.remove_video && editingStory) {
      submitData.append('remove_video', 'true')
    }

    if (editingStory) {
      updateMutation.mutate({ id: editingStory.id, data: submitData })
    } else {
      createMutation.mutate(submitData)
    }
  }

  const handleDelete = async (id: number) => {
    const confirmed = await confirm({
      title: 'Delete Story',
      message: 'Are you sure you want to delete this story? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger'
    })
    if (confirmed) {
      deleteMutation.mutate(id)
    }
  }

  // Sets the same field the upload/paste flow sets (image_url or video_url),
  // with the URL passed through untouched from MediaPickerDialog.
  const handleMediaLibraryPick = (url: string) => {
    if (mediaLibraryTarget === 'image') {
      setFormData(prev => ({ ...prev, image_url: url }))
    } else if (mediaLibraryTarget === 'video') {
      setFormData(prev => ({ ...prev, video_url: url, video_file: null, remove_video: false }))
    }
    setMediaLibraryTarget(null)
  }

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

  const saving = createMutation.isLoading || updateMutation.isLoading
  const allStories: Story[] = stories || []
  const pendingCount = allStories.filter((s) => s.is_pending_approval).length
  const tabs: { key: typeof tab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: allStories.length },
    { key: 'pending', label: 'Pending approval', count: pendingCount },
    { key: 'published', label: 'Published', count: allStories.length - pendingCount },
  ]
  const visibleStories = allStories.filter((s) =>
    tab === 'pending' ? s.is_pending_approval : tab === 'published' ? !s.is_pending_approval : true,
  )

  const addButton = (
    <button onClick={() => setShowForm(true)} className="btn-primary gap-2">
      <Plus className="w-4 h-4" aria-hidden="true" />
      Add New Story
    </button>
  )

  return (
    <div className="space-y-6">
      <PageHeader title="Stories" icon={BookOpen} actions={addButton} />
      {!isAdmin && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-900 flex items-start gap-2">
          <Clock className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <span>Your stories go live after an admin approves them. Editing a published story sends it back for review.</span>
        </div>
      )}

      <div className="border-b border-gray-200 overflow-x-auto">
        <div role="tablist" aria-label="Filter stories" className="-mb-px flex gap-6 sm:gap-8">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                tab === t.key
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {t.label} ({t.count})
            </button>
          ))}
        </div>
      </div>

      {/* Story Form Modal */}
      {showForm && (
        <Modal
          title={editingStory ? 'Edit Story' : 'Add New Story'}
          // The library picker opens on top of this form; Escape there must not discard the form.
          onClose={() => { if (mediaLibraryTarget === null) resetForm() }}
          size="xl"
          footer={
            <>
              <button type="button" onClick={resetForm} className="btn-secondary">
                Cancel
              </button>
              <button type="submit" form="story-form" disabled={saving} className="btn-primary gap-2">
                {saving ? (
                  <>
                    <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" aria-hidden="true" />
                    {editingStory ? 'Updating...' : 'Creating...'}
                  </>
                ) : (
                  editingStory ? 'Update Story' : 'Create Story'
                )}
              </button>
            </>
          }
        >
            <form id="story-form" onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Title *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  className="input-field"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Summary *
                </label>
                <textarea
                  value={formData.summary}
                  onChange={(e) => setFormData(prev => ({ ...prev, summary: e.target.value }))}
                  rows={3}
                  className="input-field"
                  placeholder="Brief summary for story cards..."
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Full Content *
                </label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                  rows={8}
                  className="input-field"
                  placeholder="Full story content..."
                  required
                />
              </div>

              <div className="rounded-lg border border-gray-200 overflow-hidden">
              <Collapsible
                title="Media"
                preview={[
                  formData.image_url ? 'Photo set' : 'No photo',
                  formData.video_file || formData.video_url || (editingStory?.video_filename && !formData.remove_video) ? 'Video set' : 'No video',
                ].join(' · ')}
              >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <MediaInput
                    value={formData.image_url}
                    onChange={(url) => setFormData(prev => ({ ...prev, image_url: url }))}
                    type="images"
                    label="Story Photo URL"
                    placeholder="Enter image URL or select from library"
                  />
                  <button
                    type="button"
                    onClick={() => setMediaLibraryTarget('image')}
                    className="mt-2 btn-secondary btn-sm gap-2"
                  >
                    <LibraryBig className="w-4 h-4" aria-hidden="true" />
                    Choose from media library
                  </button>
                </div>

                <div>
                  <MediaInput
                    value={formData.video_url}
                    onChange={(url) => setFormData(prev => ({ ...prev, video_url: url, video_file: null, remove_video: false }))}
                    type="videos"
                    label="Video URL (optional)"
                    placeholder="Enter video URL or select from library"
                  />
                  <button
                    type="button"
                    onClick={() => setMediaLibraryTarget('video')}
                    className="mt-2 btn-secondary btn-sm gap-2"
                  >
                    <LibraryBig className="w-4 h-4" aria-hidden="true" />
                    Choose from media library
                  </button>
                  <div className="mt-3">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Or Upload Video File
                    </label>
                    <input
                      type="file"
                      accept="video/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null
                        setFormData(prev => ({ ...prev, video_file: file, video_url: '', remove_video: false }))
                      }}
                      className="input-field"
                    />
                    {formData.video_file && (
                      <p className="text-sm text-gray-600 mt-1">
                        Selected: {formData.video_file.name}
                      </p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      Upload a video file (MP4, WebM, etc.). Maximum size: 100MB
                    </p>
                  </div>
                  {editingStory?.video_filename && !formData.video_file && !formData.video_url && !formData.remove_video && (
                    <div className="mt-2 flex items-center justify-between p-2 bg-gray-50 rounded border">
                      <div className="flex items-center">
                        <Video className="w-4 h-4 text-gray-600 mr-2" />
                        <span className="text-sm text-gray-700">{editingStory.video_filename}</span>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          const confirmed = await confirm({
                            title: 'Delete Video',
                            message: 'Are you sure you want to delete this video? This will remove it from the story.',
                            confirmText: 'Delete',
                            cancelText: 'Cancel',
                            variant: 'danger'
                          })
                          if (confirmed) {
                            setFormData(prev => ({ ...prev, remove_video: true, video_file: null, video_url: '' }))
                          }
                        }}
                        className="text-red-600 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors"
                        title="Delete video"
                        aria-label="Delete video"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  {formData.remove_video && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
                      <p className="text-sm text-red-700">Video will be deleted when you save the story.</p>
                    </div>
                  )}
                </div>
              </div>
              </Collapsible>
              </div>

              <div className="flex items-center space-x-6">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="ml-2 text-sm font-medium text-gray-700">Active</span>
                </label>

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.is_featured}
                    onChange={(e) => setFormData(prev => ({ ...prev, is_featured: e.target.checked }))}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="ml-2 text-sm font-medium text-gray-700">Featured</span>
                </label>
              </div>

            </form>
        </Modal>
      )}

      {/* Stories Table */}
      {isLoading ? (
        <LoadingBlock />
      ) : isError ? (
        <ErrorState message="Could not load stories." onRetry={() => refetch()} />
      ) : visibleStories.length > 0 ? (
          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Story</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Status</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Media</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-900">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleStories.map((story: Story) => (
                  <tr key={story.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-4 px-4 min-w-[16rem]">
                      <p className="font-semibold text-gray-900">{story.title}</p>
                      <div className="mt-1">
                        <LongText text={story.summary} lines={2} />
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex flex-col gap-1">
                        {story.is_pending_approval ? (
                          <StatusBadge tone="warning" icon={Clock} className="w-fit">Pending approval</StatusBadge>
                        ) : (
                          <StatusBadge tone={story.is_active ? 'success' : 'neutral'} className="w-fit">
                            {story.is_active ? 'Active' : 'Inactive'}
                          </StatusBadge>
                        )}
                        {story.is_featured && (
                          <StatusBadge tone="accent" icon={Star} className="w-fit">Featured</StatusBadge>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center space-x-4">
                        {story.image_filename ? (
                          <img 
                            src={
                              story.image_filename.startsWith('http://') || story.image_filename.startsWith('https://')
                                ? story.image_filename
                                : getStaticFileUrl(`/api/uploads/stories/${story.image_filename}`)
                            }
                            alt={story.title}
                            className="w-16 h-16 object-cover rounded"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none'
                            }}
                          />
                        ) : (
                          <div className="w-16 h-16 bg-gray-200 rounded flex items-center justify-center">
                            <ImageIcon className="w-6 h-6 text-gray-400" />
                          </div>
                        )}
                        {story.video_filename && (
                          <div className="flex items-center text-primary-700">
                            <Video className="w-4 h-4" aria-hidden="true" />
                            <span className="ml-1 text-sm">Video</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex justify-end space-x-2">
                        {isAdmin && story.is_pending_approval && (
                          <button
                            onClick={() => approveMutation.mutate(story.id)}
                            disabled={approveMutation.isLoading}
                            className="text-green-700 hover:text-green-800 p-2 rounded-lg hover:bg-green-50 disabled:opacity-50"
                            title="Approve story"
                            aria-label="Approve story"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}
                        {(() => {
                          const canEdit = isAdmin || story.created_by_user_id === currentUser?.id
                          return (
                            <>
                              <button
                                onClick={() => canEdit && handleEdit(story)}
                                disabled={!canEdit}
                                className={
                                  canEdit
                                    ? 'text-primary-600 hover:text-primary-700 p-2 rounded-lg hover:bg-primary-50'
                                    : 'text-gray-300 p-2 cursor-not-allowed'
                                }
                                title={canEdit ? 'Edit story' : 'Only the creator or an admin can edit'}
                                aria-label={canEdit ? 'Edit story' : 'Only the creator or an admin can edit'}
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => canEdit && handleDelete(story.id)}
                                disabled={!canEdit || deleteMutation.isLoading}
                                className={
                                  canEdit
                                    ? 'text-red-600 hover:text-red-700 p-2 rounded-lg hover:bg-red-50'
                                    : 'text-gray-300 p-2 cursor-not-allowed'
                                }
                                title={canEdit ? 'Delete story' : 'Only the creator or an admin can delete'}
                                aria-label={canEdit ? 'Delete story' : 'Only the creator or an admin can delete'}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )
                        })()}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      ) : tab !== 'all' && allStories.length > 0 ? (
        <EmptyState
          icon={BookOpen}
          title={tab === 'pending' ? 'Nothing waiting for approval' : 'No published stories'}
        />
      ) : (
        <EmptyState
          icon={BookOpen}
          title="No stories yet"
          body="Create your first story to get started."
          action={addButton}
        />
      )}

      <MediaPickerDialog
        open={mediaLibraryTarget !== null}
        onClose={() => setMediaLibraryTarget(null)}
        onPick={handleMediaLibraryPick}
      />

      <ConfirmationDialog />
    </div>
  )
}

export default AdminStories

