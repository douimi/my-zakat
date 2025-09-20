import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Plus, Edit, Trash2, BookOpen, Image as ImageIcon, Video, Eye, EyeOff, Star } from 'lucide-react'
import { storiesAPI } from '../../utils/api'
import type { Story } from '../../types'

interface StoryFormData {
  title: string
  summary: string
  content: string
  is_active: boolean
  is_featured: boolean
  video_url: string
  image_url: string
}

const AdminStories = () => {
  const [showForm, setShowForm] = useState(false)
  const [editingStory, setEditingStory] = useState<Story | null>(null)
  const [formData, setFormData] = useState<StoryFormData>({
    title: '',
    summary: '',
    content: '',
    is_active: true,
    is_featured: false,
    video_url: '',
    image_url: ''
  })
  
  const queryClient = useQueryClient()
  
  const { data: stories, isLoading } = useQuery('admin-stories', () => 
    storiesAPI.getAll(false, false) // Get all stories, not just active/featured
  )
  
  const createMutation = useMutation(storiesAPI.create, {
    onSuccess: () => {
      queryClient.invalidateQueries('admin-stories')
      resetForm()
    }
  })
  
  const updateMutation = useMutation(
    ({ id, data }: { id: number; data: any }) => storiesAPI.update(id, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('admin-stories')
        resetForm()
      }
    }
  )
  
  const deleteMutation = useMutation(storiesAPI.delete, {
    onSuccess: () => {
      queryClient.invalidateQueries('admin-stories')
    }
  })

  const resetForm = () => {
    setFormData({
      title: '',
      summary: '',
      content: '',
      is_active: true,
      is_featured: false,
      video_url: '',
      image_url: ''
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
      video_url: story.video_url || '',
      image_url: story.image_filename || ''
    })
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const submitData = {
      title: formData.title,
      summary: formData.summary,
      content: formData.content,
      is_active: formData.is_active,
      is_featured: formData.is_featured,
      video_url: formData.video_url,
      image_filename: formData.image_url
    }

    if (editingStory) {
      updateMutation.mutate({ id: editingStory.id, data: submitData })
    } else {
      createMutation.mutate(submitData)
    }
  }

  const handleDelete = (id: number) => {
    if (window.confirm('Are you sure you want to delete this story?')) {
      deleteMutation.mutate(id)
    }
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
            <h1 className="text-3xl font-bold text-gray-900">Manage Stories</h1>
            <p className="text-gray-600 mt-2">Create and manage inspiring stories</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="btn-primary flex items-center"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add New Story
          </button>
        </div>
      </div>

      {/* Story Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              {editingStory ? 'Edit Story' : 'Add New Story'}
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Story Photo URL
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
                        alt="Story preview" 
                        className="w-20 h-20 object-cover rounded mt-1"
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
                    Video URL (optional)
                  </label>
                  <input
                    type="url"
                    value={formData.video_url}
                    onChange={(e) => setFormData(prev => ({ ...prev, video_url: e.target.value }))}
                    className="input-field"
                    placeholder="https://... or videos/story1.mp4"
                  />
                </div>
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
                      {editingStory ? 'Updating...' : 'Creating...'}
                    </>
                  ) : (
                    <>
                      {editingStory ? 'Update Story' : 'Create Story'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stories Table */}
      <div className="card">
        {stories && stories.length > 0 ? (
          <div className="overflow-x-auto">
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
                {stories.map((story: Story) => (
                  <tr key={story.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-4 px-4">
                      <div>
                        <h3 className="font-semibold text-gray-900">{story.title}</h3>
                        <p className="text-sm text-gray-600 mt-1">
                          {story.summary.length > 100 
                            ? `${story.summary.substring(0, 100)}...`
                            : story.summary
                          }
                        </p>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center space-x-2">
                        <div className="flex items-center">
                          {story.is_active ? (
                            <Eye className="w-4 h-4 text-green-600" />
                          ) : (
                            <EyeOff className="w-4 h-4 text-gray-400" />
                          )}
                          <span className={`ml-1 text-sm ${story.is_active ? 'text-green-600' : 'text-gray-400'}`}>
                            {story.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        {story.is_featured && (
                          <div className="flex items-center text-yellow-600">
                            <Star className="w-4 h-4" />
                            <span className="ml-1 text-sm">Featured</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center space-x-4">
                        {story.image_filename ? (
                          <img 
                            src={`/api/uploads/stories/${story.image_filename}`} 
                            alt={story.title}
                            className="w-16 h-16 object-cover rounded"
                          />
                        ) : (
                          <div className="w-16 h-16 bg-gray-200 rounded flex items-center justify-center">
                            <ImageIcon className="w-6 h-6 text-gray-400" />
                          </div>
                        )}
                        {story.video_url && (
                          <div className="flex items-center text-purple-600">
                            <Video className="w-4 h-4" />
                            <span className="ml-1 text-sm">Video</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={() => handleEdit(story)}
                          className="text-primary-600 hover:text-primary-700 p-2 rounded-lg hover:bg-primary-50"
                          title="Edit story"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(story.id)}
                          disabled={deleteMutation.isLoading}
                          className="text-red-600 hover:text-red-700 p-2 rounded-lg hover:bg-red-50"
                          title="Delete story"
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
            <BookOpen className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No stories yet</h3>
            <p className="text-gray-600 mb-4">Create your first inspiring story to get started</p>
            <button
              onClick={() => setShowForm(true)}
              className="btn-primary flex items-center mx-auto"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add New Story
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default AdminStories

