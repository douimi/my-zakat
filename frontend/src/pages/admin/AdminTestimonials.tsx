import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Star, Trash2, Check, X, Image as ImageIcon, Video, User, Plus, Edit } from 'lucide-react'
import { testimonialsAPI, getStaticFileUrl } from '../../utils/api'
import { useConfirmation } from '../../hooks/useConfirmation'
import { getImageUrl, getVideoUrl } from '../../utils/mediaHelpers'
import type { Testimonial } from '../../types'

interface TestimonialFormData {
  name: string
  country: string
  text: string
  rating: number
  video_file: File | null
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
    category: 'donor',
    is_approved: false,
    image_url: '',
    remove_video: false
  })
  
  const queryClient = useQueryClient()
  
  const { data: testimonials, isLoading } = useQuery('admin-testimonials', () => 
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

  const getCategoryColor = (category: string) => {
    switch (category?.toLowerCase()) {
      case 'donor': return 'bg-green-100 text-green-800'
      case 'recipient': return 'bg-blue-100 text-blue-800'
      case 'volunteer': return 'bg-purple-100 text-purple-800'
      default: return 'bg-gray-100 text-gray-800'
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Manage Testimonials</h1>
            <p className="text-gray-600 mt-2">Review and approve testimonials from your community</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="btn-primary flex items-center"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add New Testimonial
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {[
              { key: 'all', label: 'All Testimonials', count: testimonials?.length || 0 },
              { key: 'pending', label: 'Pending Approval', count: testimonials?.filter((t: Testimonial) => !t.is_approved).length || 0 },
              { key: 'approved', label: 'Approved', count: testimonials?.filter((t: Testimonial) => t.is_approved).length || 0 },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key as 'all' | 'pending' | 'approved')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  filter === tab.key
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Testimonial Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              {editingTestimonial ? 'Edit Testimonial' : 'Add New Testimonial'}
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Profile Photo URL
                </label>
                <input
                  type="url"
                  value={formData.image_url}
                  onChange={(e) => setFormData(prev => ({ ...prev, image_url: e.target.value }))}
                  placeholder="https://example.com/photo.jpg"
                  className={`input-field ${!isValidImageUrl(formData.image_url) ? 'border-red-300' : ''}`}
                />
                {!isValidImageUrl(formData.image_url) && formData.image_url && (
                  <p className="text-red-600 text-sm mt-1">
                    Please enter a valid photo URL (jpg, jpeg, png, gif, webp, svg)
                  </p>
                )}
                {formData.image_url && isValidImageUrl(formData.image_url) && (
                  <div className="mt-2">
                    <p className="text-sm text-gray-600">Preview:</p>
                    <img 
                      src={formData.image_url} 
                      alt="Profile preview" 
                      className="w-20 h-20 object-cover rounded-full mt-1"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Enter a direct URL to a photo (supports jpg, jpeg, png, gif, webp, svg)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Video File (optional)
                </label>
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null
                    setFormData(prev => ({ ...prev, video_file: file, remove_video: false }))
                  }}
                  className="input-field"
                />
                {formData.video_file && (
                  <p className="text-sm text-gray-600 mt-1">
                    Selected: {formData.video_file.name}
                  </p>
                )}
                {editingTestimonial?.video_filename && !formData.video_file && !formData.remove_video && (
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
                          setFormData(prev => ({ ...prev, remove_video: true, video_file: null }))
                        }
                      }}
                      className="text-red-600 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors"
                      title="Delete video"
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
                <p className="text-xs text-gray-500 mt-1">
                  Upload a video file (MP4, WebM, etc.). Maximum size: 100MB
                </p>
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

              <div className="flex justify-end space-x-4 pt-4">
                <button
                  type="button"
                  onClick={resetForm}
                  className="btn-outline"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isLoading || updateMutation.isLoading}
                  className="btn-primary flex items-center"
                >
                  {(createMutation.isLoading || updateMutation.isLoading) ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      {editingTestimonial ? 'Updating...' : 'Creating...'}
                    </>
                  ) : (
                    <>
                      {editingTestimonial ? 'Update Testimonial' : 'Create Testimonial'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Testimonials Table */}
      <div className="card">
        {filteredTestimonials.length > 0 ? (
          <div className="overflow-x-auto">
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
                          <h3 className="font-semibold text-gray-900">{testimonial.name}</h3>
                          {testimonial.country && (
                            <p className="text-sm text-gray-600">{testimonial.country}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <p className="text-sm text-gray-900">
                        {testimonial.text.length > 150 
                          ? `${testimonial.text.substring(0, 150)}...`
                          : testimonial.text
                        }
                      </p>
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
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getCategoryColor(testimonial.category)}`}>
                            {testimonial.category.charAt(0).toUpperCase() + testimonial.category.slice(1)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center space-x-2">
                        {testimonial.image_filename && (
                          <div className="flex items-center text-green-600">
                            <ImageIcon className="w-4 h-4" />
                            <span className="ml-1 text-xs">Photo</span>
                          </div>
                        )}
                        {testimonial.video_filename && (
                          <div className="flex items-center text-purple-600">
                            <Video className="w-4 h-4" />
                            <span className="ml-1 text-xs">Video</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        testimonial.is_approved 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {testimonial.is_approved ? 'Approved' : 'Pending'}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={() => handleEdit(testimonial)}
                          className="text-primary-600 hover:text-primary-700 p-2 rounded-lg hover:bg-primary-50"
                          title="Edit testimonial"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        {!testimonial.is_approved && (
                          <button
                            onClick={() => handleApprove(testimonial.id)}
                            disabled={approveMutation.isLoading}
                            className="text-green-600 hover:text-green-700 p-2 rounded-lg hover:bg-green-50"
                            title="Approve testimonial"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(testimonial.id)}
                          disabled={deleteMutation.isLoading}
                          className="text-red-600 hover:text-red-700 p-2 rounded-lg hover:bg-red-50"
                          title="Delete testimonial"
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
          <div className="text-center py-12">
            <Star className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {filter === 'pending' && 'No pending testimonials'}
              {filter === 'approved' && 'No approved testimonials'}
              {filter === 'all' && 'No testimonials yet'}
            </h3>
            <p className="text-gray-600">
              {filter === 'pending' && 'All testimonials have been reviewed.'}
              {filter === 'approved' && 'No testimonials have been approved yet.'}
              {filter === 'all' && 'Testimonials from your community will appear here.'}
            </p>
          </div>
        )}
      </div>

      {/* Summary Stats */}
      {testimonials && testimonials.length > 0 && (
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="card">
            <div className="flex items-center">
              <Star className="w-8 h-8 text-yellow-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Testimonials</p>
                <p className="text-2xl font-bold text-gray-900">{testimonials.length}</p>
              </div>
            </div>
          </div>
          
          <div className="card">
            <div className="flex items-center">
              <Check className="w-8 h-8 text-green-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Approved</p>
                <p className="text-2xl font-bold text-gray-900">
                  {testimonials.filter((t: Testimonial) => t.is_approved).length}
                </p>
              </div>
            </div>
          </div>
          
          <div className="card">
            <div className="flex items-center">
              <X className="w-8 h-8 text-yellow-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Pending Review</p>
                <p className="text-2xl font-bold text-gray-900">
                  {testimonials.filter((t: Testimonial) => !t.is_approved).length}
                </p>
              </div>
            </div>
          </div>
        </div>
        )}

      <ConfirmationDialog />
    </div>
  )
}

export default AdminTestimonials
