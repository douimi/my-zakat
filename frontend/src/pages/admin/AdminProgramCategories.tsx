import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Upload, Video, Image as ImageIcon, Save, Link as LinkIcon, Loader2, Trash2, Plus, Edit2, FileCode, Eye } from 'lucide-react'
import { programCategoriesAPI, getStaticFileUrl } from '../../utils/api'
import { useToast } from '../../contexts/ToastContext'
import ConfirmationModal from '../../components/ConfirmationModal'
import { isValidImageUrl, isValidVideoUrl } from '../../utils/mediaHelpers'
import LazyVideo from '../../components/LazyVideo'
import VideoThumbnail from '../../components/VideoThumbnail'
import { Link } from 'react-router-dom'
import type { ProgramCategory } from '../../types'
import MediaInput from '../../components/MediaInput'

const AdminProgramCategories = () => {
  const [editingCategory, setEditingCategory] = useState<number | null>(null)
  const [activeTabs, setActiveTabs] = useState<{ [key: number]: 'html' | 'css' | 'js' }>({})
  const [showUrlInput, setShowUrlInput] = useState<{ categoryId: number; field: 'image' | 'video' } | null>(null)
  const [urlValue, setUrlValue] = useState('')
  const [uploadingItem, setUploadingItem] = useState<number | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ categoryId: number; categoryName: string } | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [categoryData, setCategoryData] = useState<{ [key: number]: Partial<ProgramCategory> }>({})
  const [newCategory, setNewCategory] = useState({
    name: '',
    slug: '',
    title: '',
    description: '',
    short_description: '',
    image_url: '',
    impact_text: '',
    html_content: '',
    css_content: '',
    js_content: '',
    display_order: 0,
    is_active: true
  })
  
  const queryClient = useQueryClient()
  const { showSuccess, showError } = useToast()
  
  const { data: categories, isLoading } = useQuery('program-categories', () => programCategoriesAPI.getAll())

  // Initialize category data when categories load
  useEffect(() => {
    if (categories && Object.keys(categoryData).length === 0) {
      const initialData: { [key: number]: Partial<ProgramCategory> } = {}
      categories.forEach((cat: ProgramCategory) => {
        initialData[cat.id] = {
          title: cat.title,
          description: cat.description || '',
          short_description: cat.short_description || '',
          impact_text: cat.impact_text || '',
          image_url: cat.image_url || '',
          html_content: cat.html_content || '',
          css_content: cat.css_content || '',
          js_content: cat.js_content || '',
          display_order: cat.display_order,
          is_active: cat.is_active
        }
      })
      setCategoryData(initialData)
    }
  }, [categories])

  const updateMutation = useMutation(
    ({ id, data }: { id: number; data: Partial<ProgramCategory> }) =>
      programCategoriesAPI.update(id, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('program-categories')
        queryClient.invalidateQueries('home-media-settings')
        setShowUrlInput(null)
        setUrlValue('')
        setEditingCategory(null)
        showSuccess('Success', 'Category updated successfully!')
      },
      onError: (error: any) => {
        showError('Error', error?.response?.data?.detail || 'Failed to update category')
      }
    }
  )

  const createMutation = useMutation(
    (data: typeof newCategory) => programCategoriesAPI.create(data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('program-categories')
        setShowCreateModal(false)
        setNewCategory({
          name: '',
          slug: '',
          title: '',
          description: '',
          short_description: '',
          image_url: '',
          impact_text: '',
          display_order: 0,
          is_active: true
        })
        showSuccess('Success', 'Category created successfully!')
      },
      onError: (error: any) => {
        showError('Error', error?.response?.data?.detail || 'Failed to create category')
      }
    }
  )

  const deleteMutation = useMutation(
    (id: number) => programCategoriesAPI.delete(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('program-categories')
        setDeleteConfirm(null)
        showSuccess('Success', 'Category deleted successfully!')
      },
      onError: (error: any) => {
        showError('Error', error?.response?.data?.detail || 'Failed to delete category')
      }
    }
  )

  const uploadVideoMutation = useMutation(
    ({ id, file }: { id: number; file: File }) => programCategoriesAPI.uploadVideo(id, file),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('program-categories')
        setUploadingItem(null)
        showSuccess('Success', 'Video uploaded successfully!')
      },
      onError: (error: any) => {
        setUploadingItem(null)
        showError('Upload Failed', error?.response?.data?.detail || 'Failed to upload video')
      }
    }
  )

  const handleFileUpload = async (categoryId: number, file: File | null) => {
    if (!file) return

    const isVideo = file.type.startsWith('video/')
    if (!isVideo) {
      showError('Invalid File', 'Only video files can be uploaded. Please use URL for images.')
      return
    }

    const maxVideoSize = 100 * 1024 * 1024 // 100MB
    if (file.size > maxVideoSize) {
      showError('File Too Large', `File must be less than ${maxVideoSize / (1024 * 1024)}MB`)
      return
    }

    setUploadingItem(categoryId)
    uploadVideoMutation.mutate({ id: categoryId, file })
  }

  const handleSaveCategory = async (categoryId: number) => {
    const data = categoryData[categoryId]
    if (!data) return

    // Ensure all content fields are included - send empty string explicitly to clear content
    const updateData = {
      ...data,
      html_content: data.html_content !== undefined ? data.html_content : undefined,
      css_content: data.css_content !== undefined ? data.css_content : undefined,
      js_content: data.js_content !== undefined ? data.js_content : undefined,
    }

    updateMutation.mutate({ id: categoryId, data: updateData })
  }

  const handleCreateCategory = () => {
    if (!newCategory.name || !newCategory.slug || !newCategory.title) {
      showError('Validation Error', 'Name, slug, and title are required')
      return
    }
    createMutation.mutate({
      name: newCategory.name,
      slug: newCategory.slug,
      title: newCategory.title,
      description: newCategory.description || undefined,
      short_description: newCategory.short_description || undefined,
      image_url: newCategory.image_url || undefined,
      impact_text: newCategory.impact_text || undefined,
      html_content: newCategory.html_content || undefined,
      css_content: newCategory.css_content || undefined,
      js_content: newCategory.js_content || undefined,
      display_order: newCategory.display_order,
      is_active: newCategory.is_active
    })
  }

  const handleDeleteCategory = (categoryId: number) => {
    const category = categories?.find((c: ProgramCategory) => c.id === categoryId)
    const categoryName = category?.title || `Category ${categoryId}`
    setDeleteConfirm({ categoryId, categoryName })
  }

  const confirmDeleteCategory = () => {
    if (!deleteConfirm) return
    deleteMutation.mutate(deleteConfirm.categoryId)
  }

  const handleUrlSubmit = (categoryId: number, field: 'image' | 'video') => {
    if (!urlValue.trim()) return
    
    const isValid = field === 'video' ? isValidVideoUrl(urlValue) : isValidImageUrl(urlValue)
    if (!isValid) {
      showError('Invalid URL', `Please enter a valid ${field === 'video' ? 'video' : 'image'} URL`)
      return
    }
    
    const updateData = field === 'video' 
      ? { video_filename: urlValue.trim() }
      : { image_url: urlValue.trim() }
    
    updateMutation.mutate({ id: categoryId, data: updateData })
  }

  const getVideoUrl = (filename?: string) => {
    if (!filename) return null
    if (filename.startsWith('http://') || filename.startsWith('https://')) {
      return filename
    }
    return getStaticFileUrl(`/api/uploads/program_categories/${filename}`)
  }

  const getImageUrl = (url?: string) => {
    if (!url) return null
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url
    }
    return url
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
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Program Categories Management</h1>
          <p className="text-gray-600 mt-2">Manage the program categories displayed in the "Our Work" section</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Add Category
        </button>
      </div>

      {/* Categories Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {categories?.map((category: ProgramCategory) => {
          const currentData = categoryData[category.id] || {
            title: category.title,
            description: category.description || '',
            short_description: category.short_description || '',
            impact_text: category.impact_text || '',
            image_url: category.image_url || '',
            display_order: category.display_order,
            is_active: category.is_active
          }
          const imageUrl = getImageUrl(category.image_url)
          const videoUrl = getVideoUrl(category.video_filename)
          const showImageInput = showUrlInput?.categoryId === category.id && showUrlInput?.field === 'image'
          const showVideoInput = showUrlInput?.categoryId === category.id && showUrlInput?.field === 'video'
          const isEditing = editingCategory === category.id

          return (
            <div key={category.id} className="card">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">{category.name}</h3>
                    <Link
                      to={`/categories/${category.slug}`}
                      target="_blank"
                      className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
                    >
                      <Eye className="w-3 h-3" />
                      View Page
                    </Link>
                  </div>
                  <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDeleteCategory(category.id)}
                    disabled={deleteMutation.isLoading}
                    className="btn-outline text-sm text-red-600 border-red-300 hover:bg-red-50 flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (isEditing) {
                        handleSaveCategory(category.id)
                      } else {
                        setEditingCategory(category.id)
                      }
                    }}
                    disabled={updateMutation.isLoading}
                    className="btn-primary flex items-center gap-2 text-sm"
                  >
                    {updateMutation.isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving...
                      </>
                    ) : isEditing ? (
                      <>
                        <Save className="w-4 h-4" />
                        Save
                      </>
                    ) : (
                      <>
                        <Edit2 className="w-4 h-4" />
                        Edit
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Media Section */}
              {videoUrl && !showVideoInput && !showImageInput && (
                <div className="mb-4">
                  <div className="w-full h-48 rounded-lg overflow-hidden bg-gray-200">
                    <VideoThumbnail
                      videoSrc={videoUrl}
                      className="w-full h-full"
                      alt={`${category.title} video`}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Video (takes priority over image)</p>
                </div>
              )}
              {!videoUrl && imageUrl && !showImageInput && !showVideoInput && (
                <div className="mb-4">
                  <img
                    src={imageUrl}
                    alt={category.title}
                    className="w-full h-48 object-cover rounded-lg"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                  <p className="text-xs text-gray-500 mt-1">Image</p>
                </div>
              )}

              {/* Video Upload/URL */}
              {isEditing && (
                <>
                  {showVideoInput ? (
                    <div className="mb-4 space-y-3">
                      <MediaInput
                        value={urlValue}
                        onChange={(url) => setUrlValue(url)}
                        type="videos"
                        label="Video URL"
                        placeholder="Enter video URL or select from library"
                        showPreview={false}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleUrlSubmit(category.id, 'video')}
                          disabled={!urlValue.trim() || !isValidVideoUrl(urlValue) || updateMutation.isLoading}
                          className="btn-primary flex-1 text-sm"
                        >
                          <Save className="w-4 h-4 mr-1" />
                          Save
                        </button>
                        <button
                          onClick={() => setShowUrlInput(null)}
                          className="btn-outline text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : showImageInput ? (
                    <div className="mb-4 space-y-3">
                      <MediaInput
                        value={urlValue}
                        onChange={(url) => setUrlValue(url)}
                        type="images"
                        label="Image URL"
                        placeholder="Enter image URL or select from library"
                        showPreview={false}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleUrlSubmit(category.id, 'image')}
                          disabled={!urlValue.trim() || !isValidImageUrl(urlValue) || updateMutation.isLoading}
                          className="btn-primary flex-1 text-sm"
                        >
                          <Save className="w-4 h-4 mr-1" />
                          Save
                        </button>
                        <button
                          onClick={() => setShowUrlInput(null)}
                          className="btn-outline text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mb-4 space-y-3">
                      {/* Video Section */}
                      <div className="border-2 border-dashed rounded-lg p-3 text-center">
                        <Video className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                        <p className="text-xs text-gray-600 mb-2">Video (optional, takes priority)</p>
                        <div className="flex gap-2 justify-center">
                          <label className="btn-outline text-xs cursor-pointer">
                            <Upload className="w-3 h-3 mr-1" />
                            Upload Video
                            <input
                              type="file"
                              accept="video/*"
                              onChange={(e) => handleFileUpload(category.id, e.target.files?.[0] || null)}
                              className="hidden"
                              disabled={uploadingItem === category.id}
                            />
                          </label>
                          <button
                            onClick={() => {
                              setUrlValue(category.video_filename || '')
                              setShowUrlInput({ categoryId: category.id, field: 'video' })
                            }}
                            className="btn-outline text-xs"
                          >
                            <LinkIcon className="w-3 h-3 mr-1" />
                            Video URL
                          </button>
                        </div>
                        {uploadingItem === category.id && (
                          <div className="mt-2 flex items-center justify-center">
                            <Loader2 className="w-3 h-3 text-primary-600 animate-spin mr-1" />
                            <span className="text-xs text-gray-600">Uploading...</span>
                          </div>
                        )}
                      </div>
                      {/* Image Section - URL Only */}
                      <div className="border-2 border-dashed rounded-lg p-3 text-center">
                        <ImageIcon className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                        <p className="text-xs text-gray-600 mb-2">Image URL (fallback if no video)</p>
                        <button
                          onClick={() => {
                            setUrlValue(category.image_url || '')
                            setShowUrlInput({ categoryId: category.id, field: 'image' })
                          }}
                          className="btn-outline text-xs w-full"
                        >
                          <LinkIcon className="w-3 h-3 mr-1" />
                          Set Image URL
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Category Details */}
              <div className="space-y-4 mt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={currentData.title || ''}
                      onChange={(e) => setCategoryData({
                        ...categoryData,
                        [category.id]: { ...currentData, title: e.target.value }
                      })}
                      className="input-field"
                      placeholder="Category title"
                    />
                  ) : (
                    <p className="text-gray-900">{category.title}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Short Description</label>
                  {isEditing ? (
                    <textarea
                      value={currentData.short_description || ''}
                      onChange={(e) => setCategoryData({
                        ...categoryData,
                        [category.id]: { ...currentData, short_description: e.target.value }
                      })}
                      className="input-field"
                      rows={2}
                      placeholder="Short description (shown on homepage)"
                    />
                  ) : (
                    <p className="text-gray-600 text-sm">{category.short_description || 'No description'}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  {isEditing ? (
                    <textarea
                      value={currentData.description || ''}
                      onChange={(e) => setCategoryData({
                        ...categoryData,
                        [category.id]: { ...currentData, description: e.target.value }
                      })}
                      className="input-field"
                      rows={3}
                      placeholder="Full description"
                    />
                  ) : (
                    <p className="text-gray-600 text-sm">{category.description || 'No description'}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Impact Text</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={currentData.impact_text || ''}
                      onChange={(e) => setCategoryData({
                        ...categoryData,
                        [category.id]: { ...currentData, impact_text: e.target.value }
                      })}
                      className="input-field"
                      placeholder="Impact text (e.g., 'Helped 1,200+ families')"
                    />
                  ) : (
                    <p className="text-gray-600 text-sm">{category.impact_text || 'No impact text'}</p>
                  )}
                </div>
                {isEditing && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Display Order</label>
                    <input
                      type="number"
                      value={currentData.display_order || 0}
                      onChange={(e) => setCategoryData({
                        ...categoryData,
                        [category.id]: { ...currentData, display_order: parseInt(e.target.value) || 0 }
                      })}
                      className="input-field"
                      placeholder="Display order"
                    />
                  </div>
                )}
                {isEditing && (
                  <>
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        checked={currentData.is_active ?? true}
                        onChange={(e) => setCategoryData({
                          ...categoryData,
                          [category.id]: { ...currentData, is_active: e.target.checked }
                        })}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <label className="ml-2 text-sm text-gray-700">Active</label>
                    </div>
                    
                    {/* Page Content Editor */}
                    <div className="mt-6 border-t pt-6">
                      <div className="flex items-center gap-2 mb-4">
                        <FileCode className="w-5 h-5 text-primary-600" />
                        <h4 className="text-lg font-semibold text-gray-900">Page Content Editor</h4>
                      </div>
                      <p className="text-sm text-gray-600 mb-4">
                        Customize the category page content with HTML, CSS, and JavaScript
                      </p>
                      
                      {/* Tabs */}
                      <div className="border border-gray-300 rounded-lg overflow-hidden mb-4">
                        <div className="flex border-b border-gray-300">
                          <button
                            type="button"
                            onClick={() => setActiveTabs({ ...activeTabs, [category.id]: 'html' })}
                            className={`px-4 py-2 text-sm font-medium ${
                              (activeTabs[category.id] || 'html') === 'html'
                                ? 'bg-primary-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            HTML
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveTabs({ ...activeTabs, [category.id]: 'css' })}
                            className={`px-4 py-2 text-sm font-medium ${
                              (activeTabs[category.id] || 'html') === 'css'
                                ? 'bg-primary-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            CSS
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveTabs({ ...activeTabs, [category.id]: 'js' })}
                            className={`px-4 py-2 text-sm font-medium ${
                              (activeTabs[category.id] || 'html') === 'js'
                                ? 'bg-primary-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            JavaScript
                          </button>
                        </div>

                        {/* Editor */}
                        <div className="bg-gray-50">
                          {(activeTabs[category.id] || 'html') === 'html' && (
                            <textarea
                              value={currentData.html_content || ''}
                              onChange={(e) => setCategoryData({
                                ...categoryData,
                                [category.id]: { ...currentData, html_content: e.target.value }
                              })}
                              rows={12}
                              className="w-full p-4 font-mono text-sm border-0 focus:ring-0 focus:outline-none bg-gray-50"
                              placeholder="Enter HTML content for category page..."
                            />
                          )}
                          {(activeTabs[category.id] || 'html') === 'css' && (
                            <textarea
                              value={currentData.css_content || ''}
                              onChange={(e) => setCategoryData({
                                ...categoryData,
                                [category.id]: { ...currentData, css_content: e.target.value }
                              })}
                              rows={12}
                              className="w-full p-4 font-mono text-sm border-0 focus:ring-0 focus:outline-none bg-gray-50"
                              placeholder="Enter CSS content for category page..."
                            />
                          )}
                          {(activeTabs[category.id] || 'html') === 'js' && (
                            <textarea
                              value={currentData.js_content || ''}
                              onChange={(e) => setCategoryData({
                                ...categoryData,
                                [category.id]: { ...currentData, js_content: e.target.value }
                              })}
                              rows={12}
                              className="w-full p-4 font-mono text-sm border-0 focus:ring-0 focus:outline-none bg-gray-50"
                              placeholder="Enter JavaScript content for category page..."
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Create Category Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Create New Category</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                  <input
                    type="text"
                    value={newCategory.name}
                    onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                    className="input-field"
                    placeholder="e.g., Emergency Relief"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Slug *</label>
                  <input
                    type="text"
                    value={newCategory.slug}
                    onChange={(e) => setNewCategory({ ...newCategory, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                    className="input-field"
                    placeholder="e.g., emergency-relief"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                  <input
                    type="text"
                    value={newCategory.title}
                    onChange={(e) => setNewCategory({ ...newCategory, title: e.target.value })}
                    className="input-field"
                    placeholder="Category title"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Short Description</label>
                  <textarea
                    value={newCategory.short_description}
                    onChange={(e) => setNewCategory({ ...newCategory, short_description: e.target.value })}
                    className="input-field"
                    rows={2}
                    placeholder="Short description (shown on homepage)"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={newCategory.description}
                    onChange={(e) => setNewCategory({ ...newCategory, description: e.target.value })}
                    className="input-field"
                    rows={3}
                    placeholder="Full description"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
                  <input
                    type="url"
                    value={newCategory.image_url}
                    onChange={(e) => setNewCategory({ ...newCategory, image_url: e.target.value })}
                    className="input-field"
                    placeholder="Image URL"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Impact Text</label>
                  <input
                    type="text"
                    value={newCategory.impact_text}
                    onChange={(e) => setNewCategory({ ...newCategory, impact_text: e.target.value })}
                    className="input-field"
                    placeholder="e.g., 'Helped 1,200+ families'"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">HTML Content</label>
                  <textarea
                    value={newCategory.html_content}
                    onChange={(e) => setNewCategory({ ...newCategory, html_content: e.target.value })}
                    className="input-field font-mono text-sm"
                    rows={6}
                    placeholder="HTML content for category page..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CSS Content</label>
                  <textarea
                    value={newCategory.css_content}
                    onChange={(e) => setNewCategory({ ...newCategory, css_content: e.target.value })}
                    className="input-field font-mono text-sm"
                    rows={6}
                    placeholder="CSS content for category page..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">JavaScript Content</label>
                  <textarea
                    value={newCategory.js_content}
                    onChange={(e) => setNewCategory({ ...newCategory, js_content: e.target.value })}
                    className="input-field font-mono text-sm"
                    rows={6}
                    placeholder="JavaScript content for category page..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Display Order</label>
                  <input
                    type="number"
                    value={newCategory.display_order}
                    onChange={(e) => setNewCategory({ ...newCategory, display_order: parseInt(e.target.value) || 0 })}
                    className="input-field"
                  />
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={newCategory.is_active}
                    onChange={(e) => setNewCategory({ ...newCategory, is_active: e.target.checked })}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <label className="ml-2 text-sm text-gray-700">Active</label>
                </div>
              </div>
              <div className="flex gap-4 mt-6">
                <button
                  onClick={handleCreateCategory}
                  disabled={createMutation.isLoading || !newCategory.name || !newCategory.slug || !newCategory.title}
                  className="btn-primary flex-1"
                >
                  {createMutation.isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Create Category
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="btn-outline"
                  disabled={createMutation.isLoading}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={confirmDeleteCategory}
        title="Delete Category"
        message={deleteConfirm ? `Are you sure you want to delete "${deleteConfirm.categoryName}"? This action cannot be undone.` : ''}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        isLoading={deleteMutation.isLoading}
      />
    </div>
  )
}

export default AdminProgramCategories

