import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Star, Trash2, Check, Image as ImageIcon, Video, User, Plus, Edit } from 'lucide-react'
import { testimonialsAPI, getStaticFileUrl } from '../../utils/api'
import { useConfirmation } from '../../hooks/useConfirmation'
import { getImageUrl, getVideoUrl } from '../../utils/mediaHelpers'
import type { Testimonial } from '../../types'
import MediaInput from '../../components/MediaInput'
import {
  PageHeader, Modal, LoadingBlock, ErrorState, EmptyState, StatusBadge, LongText, type StatusTone,
} from '../../components/admin'

interface TestimonialFormData {
  name: string
  country: string
  text: string
  rating: number
  video_file: File | null
  video_url: string
  category: string
  is_approved: boolean
  image_url: string
  remove_video: boolean
}

const AdminTestimonials = () => {
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('all')
  const [showForm, setShowForm] = useState(false)
  const [editingTestimonial, setEditingTestimonial] = useState<Testimonial | null>(null)
  const { confirm, ConfirmationDialog } = useConfirmation()
  const [formData, setFormData] = useState<TestimonialFormData>({
    name: '',
    country: '',
    text: '',
    rating: 5,
    video_file: null,
    video_url: '',
    category: 'donor',
    is_approved: false,
    image_url: '',
    remove_video: false
  })
  
  const queryClient = useQueryClient()
  
  const { data: testimonials, isLoading, isError, refetch } = useQuery('admin-testimonials', () => 
    testimonialsAPI.getAll(false) // Get all testimonials, not just approved
  )
  
  const createMutation = useMutation(testimonialsAPI.create, {
    onSuccess: () => {
      queryClient.invalidateQueries('admin-testimonials')
      resetForm()
    }
  })
  
  const updateMutation = useMutation(
    ({ id, data }: { id: number; data: any }) => testimonialsAPI.update(id, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('admin-testimonials')
        resetForm()
      }
    }
  )

  const approveMutation = useMutation(testimonialsAPI.approve, {
    onSuccess: () => {
      queryClient.invalidateQueries('admin-testimonials')
    }
  })
  
  const deleteMutation = useMutation(testimonialsAPI.delete, {
    onSuccess: () => {
      queryClient.invalidateQueries('admin-testimonials')
    }
  })

  const resetForm = () => {
    setFormData({
      name: '',
      country: '',
      text: '',
      rating: 5,
      video_file: null,
      video_url: '',
      category: 'donor',
      is_approved: false,
      image_url: '',
      remove_video: false
    })
    setEditingTestimonial(null)
    setShowForm(false)
  }

  const handleEdit = (testimonial: Testimonial) => {
    setEditingTestimonial(testimonial)
    setFormData({
      name: testimonial.name,
      country: testimonial.country || '',
      text: testimonial.text,
      rating: testimonial.rating || 5,
      video_file: null,
      video_url: testimonial.video_filename || '',
      category: testimonial.category || 'donor',
      is_approved: testimonial.is_approved,
      image_url: testimonial.image || '',
      remove_video: false
    })
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Backend expects multipart/form-data for testimonials
    const submitData = new FormData()
    submitData.append('name', formData.name)
    submitData.append('country', formData.country)
    submitData.append('text', formData.text)
    submitData.append('rating', formData.rating.toString())
    submitData.append('category', formData.category)
    submitData.append('is_approved', formData.is_approved.toString())
    
    // Handle image URL - send as image_url parameter
    if (formData.image_url && formData.image_url.trim()) {
      submitData.append('image_url', formData.image_url.trim())
    }
    
    // Handle video file upload
    if (formData.video_file) {
      submitData.append('video', formData.video_file)
    } else if (formData.video_url.trim()) {
      submitData.append('video_filename', formData.video_url.trim())
    }
    
    // Handle video removal
    if (formData.remove_video && editingTestimonial) {
      submitData.append('remove_video', 'true')
    }

    if (editingTestimonial) {
      updateMutation.mutate({ id: editingTestimonial.id, data: submitData })
    } else {
      createMutation.mutate(submitData)
    }
  }

  const handleApprove = (id: number) => {
    approveMutation.mutate(id)
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

  const handleDelete = async (id: number) => {
    const confirmed = await confirm({
      title: 'Delete Testimonial',
      message: 'Are you sure you want to delete this testimonial? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger'
    })
    if (confirmed) {
      deleteMutation.mutate(id)
    }
  }


  const filteredTestimonials = testimonials?.filter((testimonial: Testimonial) => {
    if (filter === 'pending') return !testimonial.is_approved
    if (filter === 'approved') return testimonial.is_approved
    return true
  }) || []

  const getCategoryTone = (category: string): StatusTone => {
    switch (category?.toLowerCase()) {
      case 'donor': return 'success'
      case 'recipient': return 'info'
      case 'volunteer': return 'accent'
      default: return 'neutral'
    }
  }

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`w-4 h-4 ${i < rating ? 'text-yellow-400 fill-current' : 'text-gray-300'}`}
      />
    ))
  }

  const saving = createMutation.isLoading || updateMutation.isLoading

  return (
    <div className="space-y-6">
      <PageHeader
        title="Testimonials"
        icon={Star}
        description="Approve community testimonials before they appear on the site."
        actions={
          <button onClick={() => setShowForm(true)} className="btn-primary gap-2">
            <Plus className="w-4 h-4" aria-hidden="true" />
            Add New Testimonial
          </button>
        }
      />

      {/* Filter Tabs */}
      <div>
        <div className="border-b border-gray-200 overflow-x-auto">
          <div role="tablist" aria-label="Filter testimonials" className="-mb-px flex gap-6 sm:gap-8">
            {[
              { key: 'all', label: 'All Testimonials', count: testimonials?.length || 0 },
              { key: 'pending', label: 'Pending Approval', count: testimonials?.filter((t: Testimonial) => !t.is_approved).length || 0 },
              { key: 'approved', label: 'Approved', count: testimonials?.filter((t: Testimonial) => t.is_approved).length || 0 },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={filter === tab.key}
                onClick={() => setFilter(tab.key as 'all' | 'pending' | 'approved')}
                className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  filter === tab.key
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Testimonial Form Modal */}
      {showForm && (
        <Modal
          title={editingTestimonial ? 'Edit Testimonial' : 'Add New Testimonial'}
          onClose={resetForm}
          size="lg"
          footer={
            <>
              <button type="button" onClick={resetForm} className="btn-secondary">
                Cancel
              </button>
              <button type="submit" form="testimonial-form" disabled={saving} className="btn-primary gap-2">
                {saving ? (
                  <>
                    <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" aria-hidden="true" />
                    {editingTestimonial ? 'Updating...' : 'Creating...'}
                  </>
                ) : (
                  editingTestimonial ? 'Update Testimonial' : 'Create Testimonial'
                )}
              </button>
            </>
          }
        >
            <form id="testimonial-form" onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="input-field"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Country
                  </label>
                  <input
                    type="text"
                    value={formData.country}
                    onChange={(e) => setFormData(prev => ({ ...prev, country: e.target.value }))}
                    className="input-field"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Testimonial Text *
                </label>
                <textarea
                  value={formData.text}
                  onChange={(e) => setFormData(prev => ({ ...prev, text: e.target.value }))}
                  rows={4}
                  className="input-field"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rating (1-5)
                  </label>
                  <select
                    value={formData.rating}
                    onChange={(e) => setFormData(prev => ({ ...prev, rating: parseInt(e.target.value) }))}
                    className="input-field"
                  >
                    {[1, 2, 3, 4, 5].map(num => (
                      <option key={num} value={num}>{num} Star{num > 1 ? 's' : ''}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Category
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                    className="input-field"
                  >
                    <option value="donor">Donor</option>
                    <option value="recipient">Recipient</option>
                    <option value="volunteer">Volunteer</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <MediaInput
                value={formData.image_url}
                onChange={(url) => setFormData(prev => ({ ...prev, image_url: url }))}
                type="images"
                label="Profile Photo URL"
                placeholder="Enter image URL or select from library"
              />

              <div>
                <MediaInput
                  value={formData.video_url}
                  onChange={(url) => setFormData(prev => ({ ...prev, video_url: url, video_file: null, remove_video: false }))}
                  type="videos"
                  label="Video URL (optional)"
                  placeholder="Enter video URL or select from library"
                />
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
                {editingTestimonial?.video_filename && !formData.video_file && !formData.video_url && !formData.remove_video && (
                  <div className="mt-2 flex items-center justify-between p-2 bg-gray-50 rounded border">
                    <div className="flex items-center">
                      <Video className="w-4 h-4 text-gray-600 mr-2" />
                      <span className="text-sm text-gray-700">{editingTestimonial.video_filename}</span>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        const confirmed = await confirm({
                          title: 'Delete Video',
                          message: 'Are you sure you want to delete this video? This will remove it from the testimonial.',
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
                    <p className="text-sm text-red-700">Video will be deleted when you save the testimonial.</p>
                  </div>
                )}
              </div>

              <div className="flex items-center">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.is_approved}
                    onChange={(e) => setFormData(prev => ({ ...prev, is_approved: e.target.checked }))}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="ml-2 text-sm font-medium text-gray-700">Approved</span>
                </label>
              </div>

            </form>
        </Modal>
      )}

      {/* Testimonials Table */}
      {isLoading ? (
        <LoadingBlock />
      ) : isError ? (
        <ErrorState message="Could not load testimonials." onRetry={() => refetch()} />
      ) : filteredTestimonials.length > 0 ? (
          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Person</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Testimonial</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Rating & Category</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Media</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Status</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-900">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTestimonials.map((testimonial: Testimonial) => (
                  <tr key={testimonial.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-4 px-4">
                      <div className="flex items-center">
                        {testimonial.image ? (() => {
                          // Check if it's a full URL or a filename
                          const imageUrl = testimonial.image.startsWith('http://') || testimonial.image.startsWith('https://')
                            ? testimonial.image
                            : getStaticFileUrl(`/api/uploads/testimonials/${testimonial.image}`)
                          return (
                            <img 
                              src={imageUrl} 
                              alt={testimonial.name}
                              className="w-10 h-10 object-cover rounded-full mr-3"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none'
                              }}
                            />
                          )
                        })() : (
                          <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center mr-3">
                            <User className="w-5 h-5 text-gray-400" />
                          </div>
                        )}
                        <div>
                          <p className="font-semibold text-gray-900">{testimonial.name}</p>
                          {testimonial.country && (
                            <p className="text-sm text-gray-600">{testimonial.country}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4 min-w-[16rem]">
                      <LongText text={testimonial.text} lines={2} />
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(testimonial.created_at).toLocaleDateString()}
                      </p>
                    </td>
                    <td className="py-4 px-4">
                      <div className="space-y-2">
                        {testimonial.rating && (
                          <div className="flex items-center">
                            {renderStars(testimonial.rating)}
                          </div>
                        )}
                        {testimonial.category && (
                          <StatusBadge tone={getCategoryTone(testimonial.category)}>
                            {testimonial.category.charAt(0).toUpperCase() + testimonial.category.slice(1)}
                          </StatusBadge>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center space-x-2">
                        {testimonial.image && (
                          <div className="flex items-center text-green-700">
                            <ImageIcon className="w-4 h-4" aria-hidden="true" />
                            <span className="ml-1 text-xs">Photo</span>
                          </div>
                        )}
                        {testimonial.video_filename && (
                          <div className="flex items-center text-primary-700">
                            <Video className="w-4 h-4" aria-hidden="true" />
                            <span className="ml-1 text-xs">Video</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <StatusBadge tone={testimonial.is_approved ? 'success' : 'warning'}>
                        {testimonial.is_approved ? 'Approved' : 'Pending'}
                      </StatusBadge>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={() => handleEdit(testimonial)}
                          className="text-primary-600 hover:text-primary-700 p-2 rounded-lg hover:bg-primary-50"
                          title="Edit testimonial"
                          aria-label="Edit testimonial"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        {!testimonial.is_approved && (
                          <button
                            onClick={() => handleApprove(testimonial.id)}
                            disabled={approveMutation.isLoading}
                            className="text-green-600 hover:text-green-700 p-2 rounded-lg hover:bg-green-50"
                            title="Approve testimonial"
                            aria-label="Approve testimonial"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(testimonial.id)}
                          disabled={deleteMutation.isLoading}
                          className="text-red-600 hover:text-red-700 p-2 rounded-lg hover:bg-red-50"
                          title="Delete testimonial"
                          aria-label="Delete testimonial"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      ) : (
        <EmptyState
          icon={Star}
          title={filter === 'pending' ? 'No pending testimonials' : filter === 'approved' ? 'No approved testimonials' : 'No testimonials yet'}
          body={filter === 'pending' ? 'All testimonials have been reviewed.' : filter === 'approved' ? 'No testimonials have been approved yet.' : 'Testimonials from your community will appear here.'}
        />
      )}

      <ConfirmationDialog />
    </div>
  )
}

export default AdminTestimonials
