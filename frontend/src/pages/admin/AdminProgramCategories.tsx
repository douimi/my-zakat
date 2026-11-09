import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Upload, Video, Image as ImageIcon, Save, Link as LinkIcon, Loader2, Trash2, Plus, Edit2, Eye, Layers } from 'lucide-react'
import { clsx } from 'clsx'
import { PageHeader, LoadingBlock, EmptyState, StatusBadge, LongText, Modal, Collapsible } from '../../components/admin'
import { programCategoriesAPI, getStaticFileUrl } from '../../utils/api'
import { useToast } from '../../contexts/ToastContext'
import ConfirmationModal from '../../components/ConfirmationModal'
import { isValidImageUrl, isValidVideoUrl } from '../../utils/mediaHelpers'
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
    (data: Parameters<typeof programCategoriesAPI.create>[0]) => programCategoriesAPI.create(data),
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
          html_content: '',
          css_content: '',
          js_content: '',
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

  const resetCategoryData = (cat: ProgramCategory) => {
    setCategoryData({
      ...categoryData,
      [cat.id]: {
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
  }

  if (isLoading) {
    return <LoadingBlock label="Loading categories…" />
  }

  const codeTabClass = (active: boolean) => clsx(
    'px-4 py-2 text-sm font-medium',
    active ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Program categories"
        icon={Layers}
        count={categories?.length}
        description={'The categories in the "Our Work" section.'}
        actions={
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary gap-2"
          >
            <Plus className="w-5 h-5" aria-hidden="true" />
            Add Category
          </button>
        }
      />

      {/* Categories Grid: compact cards; the full form opens only on Edit. */}
      {categories && categories.length > 0 ? (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {categories.map((category: ProgramCategory) => {
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
          const activeTab = activeTabs[category.id] || 'html'
          const field = (id: string) => `category-${category.id}-${id}`
          const hasCode = !!(category.html_content || category.css_content || category.js_content)

          return (
            <div
              key={category.id}
              className={clsx('bg-white rounded-xl border border-gray-200 shadow-sm p-4', isEditing && 'sm:col-span-2 xl:col-span-3')}
            >
              <div className="flex gap-4">
                {/* Thumbnail */}
                <div className="w-20 h-20 shrink-0 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center">
                  {videoUrl ? (
                    <VideoThumbnail videoSrc={videoUrl} className="w-full h-full" alt={`${category.title} video`} />
                  ) : imageUrl ? (
                    <img
                      src={imageUrl}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={(e) => { e.currentTarget.style.display = 'none' }}
                    />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-gray-300" aria-hidden="true" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate" title={category.name}>{category.name}</p>
                      <p className="text-xs text-gray-500 truncate" title={category.title}>{category.title}</p>
                    </div>
                    <StatusBadge tone={category.is_active ? 'success' : 'neutral'}>
                      {category.is_active ? 'Active' : 'Inactive'}
                    </StatusBadge>
                  </div>
                  {!isEditing && (category.short_description || category.description) && (
                    <div className="mt-2">
                      <LongText text={category.short_description || category.description} lines={2} />
                    </div>
                  )}
                  {!isEditing && (category.impact_text || hasCode) && (
                    <p className="mt-2 flex flex-wrap gap-1.5">
                      {category.impact_text && <span className="badge-primary">{category.impact_text}</span>}
                      {hasCode && <span className="badge-neutral">Custom page code</span>}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                <Link
                  to={`/categories/${category.slug}`}
                  target="_blank"
                  className="btn-ghost btn-sm gap-1.5"
                >
                  <Eye className="w-4 h-4" aria-hidden="true" />
                  View Page
                </Link>
                <button
                  onClick={() => handleDeleteCategory(category.id)}
                  disabled={deleteMutation.isLoading}
                  className="p-2 rounded-lg text-red-600 hover:bg-red-50"
                  title="Delete category"
                  aria-label={`Delete ${category.name}`}
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
                {isEditing && (
                  <button
                    onClick={() => { setEditingCategory(null); setShowUrlInput(null); resetCategoryData(category) }}
                    className="btn-secondary btn-sm"
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={() => {
                    if (isEditing) {
                      handleSaveCategory(category.id)
                    } else {
                      setEditingCategory(category.id)
                    }
                  }}
                  disabled={updateMutation.isLoading}
                  className={clsx(isEditing ? 'btn-primary' : 'btn-secondary', 'btn-sm gap-2')}
                >
                  {updateMutation.isLoading && isEditing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      Saving...
                    </>
                  ) : isEditing ? (
                    <>
                      <Save className="w-4 h-4" aria-hidden="true" />
                      Save
                    </>
                  ) : (
                    <>
                      <Edit2 className="w-4 h-4" aria-hidden="true" />
                      Edit
                    </>
                  )}
                </button>
              </div>

              {isEditing && (
                <div className="mt-4 pt-4 border-t border-gray-100 space-y-6">
                  <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
                    {/* Category Details */}
                    <div className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label htmlFor={field('title')} className="label">Title</label>
                          <input
                            id={field('title')}
                            type="text"
                            value={currentData.title || ''}
                            onChange={(e) => setCategoryData({
                              ...categoryData,
                              [category.id]: { ...currentData, title: e.target.value }
                            })}
                            className="input-field"
                            placeholder="Category title"
                          />
                        </div>
                        <div>
                          <label htmlFor={field('impact')} className="label">Impact Text</label>
                          <input
                            id={field('impact')}
                            type="text"
                            value={currentData.impact_text || ''}
                            onChange={(e) => setCategoryData({
                              ...categoryData,
                              [category.id]: { ...currentData, impact_text: e.target.value }
                            })}
                            className="input-field"
                            placeholder="Impact text (e.g., 'Helped 1,200+ families')"
                          />
                        </div>
                      </div>
                      <div>
                        <label htmlFor={field('short')} className="label">Short Description</label>
                        <textarea
                          id={field('short')}
                          value={currentData.short_description || ''}
                          onChange={(e) => setCategoryData({
                            ...categoryData,
                            [category.id]: { ...currentData, short_description: e.target.value }
                          })}
                          className="input-field"
                          rows={2}
                          placeholder="Short description (shown on homepage)"
                        />
                      </div>
                      <div>
                        <label htmlFor={field('description')} className="label">Description</label>
                        <textarea
                          id={field('description')}
                          value={currentData.description || ''}
                          onChange={(e) => setCategoryData({
                            ...categoryData,
                            [category.id]: { ...currentData, description: e.target.value }
                          })}
                          className="input-field"
                          rows={3}
                          placeholder="Full description"
                        />
                      </div>
                      <div className="flex flex-wrap items-end gap-6">
                        <div>
                          <label htmlFor={field('order')} className="label">Display Order</label>
                          <input
                            id={field('order')}
                            type="number"
                            value={currentData.display_order || 0}
                            onChange={(e) => setCategoryData({
                              ...categoryData,
                              [category.id]: { ...currentData, display_order: parseInt(e.target.value) || 0 }
                            })}
                            className="input-field w-28"
                            placeholder="Display order"
                          />
                        </div>
                        <label className="flex items-center gap-2 text-sm text-gray-700 pb-3">
                          <input
                            type="checkbox"
                            checked={currentData.is_active ?? true}
                            onChange={(e) => setCategoryData({
                              ...categoryData,
                              [category.id]: { ...currentData, is_active: e.target.checked }
                            })}
                            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          />
                          Active
                        </label>
                      </div>
                    </div>

                    {/* Video Upload/URL */}
                    <div className="space-y-3">
                      <p className="text-sm font-medium text-gray-700">Media</p>
                      {showVideoInput || showImageInput ? (
                        <div className="space-y-3">
                          <MediaInput
                            value={urlValue}
                            onChange={(url) => setUrlValue(url)}
                            type={showVideoInput ? 'videos' : 'images'}
                            label={showVideoInput ? 'Video URL' : 'Image URL'}
                            placeholder={showVideoInput ? 'Enter video URL or select from library' : 'Enter image URL or select from library'}
                            showPreview={false}
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleUrlSubmit(category.id, showVideoInput ? 'video' : 'image')}
                              disabled={
                                !urlValue.trim() ||
                                !(showVideoInput ? isValidVideoUrl(urlValue) : isValidImageUrl(urlValue)) ||
                                updateMutation.isLoading
                              }
                              className="btn-primary btn-sm flex-1 gap-1.5"
                            >
                              <Save className="w-4 h-4" aria-hidden="true" />
                              Save
                            </button>
                            <button
                              onClick={() => setShowUrlInput(null)}
                              className="btn-secondary btn-sm"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {/* Video Section */}
                          <div className="border-2 border-dashed rounded-lg p-3 text-center">
                            <Video className="w-6 h-6 text-gray-400 mx-auto mb-2" aria-hidden="true" />
                            <p className="text-xs text-gray-600 mb-2">Video (optional, takes priority)</p>
                            <div className="flex flex-wrap gap-2 justify-center">
                              <label className="btn-secondary btn-sm gap-1 cursor-pointer">
                                <Upload className="w-3 h-3" aria-hidden="true" />
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
                                className="btn-secondary btn-sm gap-1"
                              >
                                <LinkIcon className="w-3 h-3" aria-hidden="true" />
                                Video URL
                              </button>
                            </div>
                            {uploadingItem === category.id && (
                              <div className="mt-2 flex items-center justify-center">
                                <Loader2 className="w-3 h-3 text-primary-600 animate-spin mr-1" aria-hidden="true" />
                                <span className="text-xs text-gray-600">Uploading...</span>
                              </div>
                            )}
                          </div>
                          {/* Image Section - URL Only */}
                          <div className="border-2 border-dashed rounded-lg p-3 text-center">
                            <ImageIcon className="w-6 h-6 text-gray-400 mx-auto mb-2" aria-hidden="true" />
                            <p className="text-xs text-gray-600 mb-2">Image URL (fallback if no video)</p>
                            <button
                              onClick={() => {
                                setUrlValue(category.image_url || '')
                                setShowUrlInput({ categoryId: category.id, field: 'image' })
                              }}
                              className="btn-secondary btn-sm gap-1 w-full"
                            >
                              <LinkIcon className="w-3 h-3" aria-hidden="true" />
                              Set Image URL
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Page Content Editor: advanced, folded until asked for. */}
                  <div className="rounded-lg border border-gray-200 overflow-hidden">
                    <Collapsible
                      title="Advanced: custom page code"
                      preview={hasCode ? 'HTML · CSS · JS (this page has custom code)' : 'HTML · CSS · JS'}
                    >
                      <div className="border border-gray-300 rounded-lg overflow-hidden">
                        <div className="flex border-b border-gray-300" role="tablist" aria-label="Code language">
                          {([['html', 'HTML'], ['css', 'CSS'], ['js', 'JavaScript']] as const).map(([key, label]) => (
                            <button
                              key={key}
                              type="button"
                              role="tab"
                              aria-selected={activeTab === key}
                              onClick={() => setActiveTabs({ ...activeTabs, [category.id]: key })}
                              className={codeTabClass(activeTab === key)}
                            >
                              {label}
                            </button>
                          ))}
                        </div>

                        {/* Editor */}
                        <div className="bg-gray-50">
                          {activeTab === 'html' && (
                            <textarea
                              aria-label="HTML content"
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
                          {activeTab === 'css' && (
                            <textarea
                              aria-label="CSS content"
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
                          {activeTab === 'js' && (
                            <textarea
                              aria-label="JavaScript content"
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
                    </Collapsible>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
      ) : (
        <EmptyState
          icon={Layers}
          title="No categories yet."
          action={
            <button onClick={() => setShowCreateModal(true)} className="btn-primary gap-2">
              <Plus className="w-5 h-5" aria-hidden="true" />
              Add Category
            </button>
          }
        />
      )}

      {/* Create Category Modal */}
      <Modal
        open={showCreateModal}
        title="Create New Category"
        size="lg"
        onClose={() => { if (!createMutation.isLoading) setShowCreateModal(false) }}
        footer={
          <>
            <button
              onClick={() => setShowCreateModal(false)}
              className="btn-secondary"
              disabled={createMutation.isLoading}
            >
              Cancel
            </button>
            <button
              onClick={handleCreateCategory}
              disabled={createMutation.isLoading || !newCategory.name || !newCategory.slug || !newCategory.title}
              className="btn-primary gap-2"
            >
              {createMutation.isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  Create Category
                </>
              )}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="new-category-name" className="label">Name *</label>
              <input
                id="new-category-name"
                type="text"
                value={newCategory.name}
                onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                className="input-field"
                placeholder="e.g., Emergency Relief"
              />
            </div>
            <div>
              <label htmlFor="new-category-slug" className="label">Slug *</label>
              <input
                id="new-category-slug"
                type="text"
                value={newCategory.slug}
                onChange={(e) => setNewCategory({ ...newCategory, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                className="input-field"
                placeholder="e.g., emergency-relief"
              />
            </div>
            <div>
              <label htmlFor="new-category-title" className="label">Title *</label>
              <input
                id="new-category-title"
                type="text"
                value={newCategory.title}
                onChange={(e) => setNewCategory({ ...newCategory, title: e.target.value })}
                className="input-field"
                placeholder="Category title"
              />
            </div>
            <div>
              <label htmlFor="new-category-impact" className="label">Impact Text</label>
              <input
                id="new-category-impact"
                type="text"
                value={newCategory.impact_text}
                onChange={(e) => setNewCategory({ ...newCategory, impact_text: e.target.value })}
                className="input-field"
                placeholder="e.g., 'Helped 1,200+ families'"
              />
            </div>
          </div>
          <div>
            <label htmlFor="new-category-short" className="label">Short Description</label>
            <textarea
              id="new-category-short"
              value={newCategory.short_description}
              onChange={(e) => setNewCategory({ ...newCategory, short_description: e.target.value })}
              className="input-field"
              rows={2}
              placeholder="Short description (shown on homepage)"
            />
          </div>
          <div>
            <label htmlFor="new-category-description" className="label">Description</label>
            <textarea
              id="new-category-description"
              value={newCategory.description}
              onChange={(e) => setNewCategory({ ...newCategory, description: e.target.value })}
              className="input-field"
              rows={3}
              placeholder="Full description"
            />
          </div>
          <div>
            <label htmlFor="new-category-image" className="label">Image URL</label>
            <input
              id="new-category-image"
              type="url"
              value={newCategory.image_url}
              onChange={(e) => setNewCategory({ ...newCategory, image_url: e.target.value })}
              className="input-field"
              placeholder="Image URL"
            />
          </div>
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <label htmlFor="new-category-order" className="label">Display Order</label>
              <input
                id="new-category-order"
                type="number"
                value={newCategory.display_order}
                onChange={(e) => setNewCategory({ ...newCategory, display_order: parseInt(e.target.value) || 0 })}
                className="input-field w-28"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 pb-3">
              <input
                type="checkbox"
                checked={newCategory.is_active}
                onChange={(e) => setNewCategory({ ...newCategory, is_active: e.target.checked })}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              Active
            </label>
          </div>
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <Collapsible title="Advanced: custom page code" preview="HTML · CSS · JS">
              <div>
                <label htmlFor="new-category-html" className="label">HTML Content</label>
                <textarea
                  id="new-category-html"
                  value={newCategory.html_content}
                  onChange={(e) => setNewCategory({ ...newCategory, html_content: e.target.value })}
                  className="input-field font-mono text-sm"
                  rows={6}
                  placeholder="HTML content for category page..."
                />
              </div>
              <div>
                <label htmlFor="new-category-css" className="label">CSS Content</label>
                <textarea
                  id="new-category-css"
                  value={newCategory.css_content}
                  onChange={(e) => setNewCategory({ ...newCategory, css_content: e.target.value })}
                  className="input-field font-mono text-sm"
                  rows={6}
                  placeholder="CSS content for category page..."
                />
              </div>
              <div>
                <label htmlFor="new-category-js" className="label">JavaScript Content</label>
                <textarea
                  id="new-category-js"
                  value={newCategory.js_content}
                  onChange={(e) => setNewCategory({ ...newCategory, js_content: e.target.value })}
                  className="input-field font-mono text-sm"
                  rows={6}
                  placeholder="JavaScript content for category page..."
                />
              </div>
            </Collapsible>
          </div>
        </div>
      </Modal>

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

