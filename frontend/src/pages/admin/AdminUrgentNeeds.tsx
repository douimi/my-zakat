import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useForm } from 'react-hook-form'
import { AlertCircle, Edit, Trash2, Save, X, ArrowUp, ArrowDown, Eye } from 'lucide-react'
import { urgentNeedsAPI } from '../../utils/api'
import { useToast } from '../../contexts/ToastContext'
import { useConfirmation } from '../../hooks/useConfirmation'
import { Link } from 'react-router-dom'

interface UrgentNeed {
  id: number
  title: string
  slug: string
  short_description?: string
  html_content?: string
  css_content?: string
  js_content?: string
  image_url?: string
  display_order: number
  is_active: boolean
}

interface UrgentNeedForm {
  title: string
  slug: string
  short_description: string
  html_content: string
  css_content: string
  js_content: string
  image_url: string
  display_order: number
  is_active: boolean
}

const AdminUrgentNeeds = () => {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<'html' | 'css' | 'js'>('html')
  const queryClient = useQueryClient()
  const { showSuccess, showError } = useToast()
  
  const { data: needs, isLoading } = useQuery('admin-urgent-needs', () => urgentNeedsAPI.getAll(false))
  
  const { register, handleSubmit, reset, setValue, watch } = useForm<UrgentNeedForm>()
  
  const createMutation = useMutation(
    (data: UrgentNeedForm) => urgentNeedsAPI.create({
      title: data.title,
      slug: data.slug || data.title.toLowerCase().replace(/\s+/g, '-'),
      short_description: data.short_description || undefined,
      html_content: data.html_content || undefined,
      css_content: data.css_content || undefined,
      js_content: data.js_content || undefined,
      image_url: data.image_url || undefined,
      display_order: data.display_order,
      is_active: data.is_active,
    }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('admin-urgent-needs')
        queryClient.invalidateQueries('urgent-needs-nav')
        reset()
        showSuccess('Success', 'Urgent need created successfully')
      },
      onError: () => {
        showError('Error', 'Failed to create urgent need')
      }
    }
  )

  const updateMutation = useMutation(
    ({ id, data }: { id: number; data: Partial<UrgentNeedForm> }) => urgentNeedsAPI.update(id, {
      title: data.title,
      slug: data.slug,
      short_description: data.short_description || undefined,
      html_content: data.html_content || undefined,
      css_content: data.css_content || undefined,
      js_content: data.js_content || undefined,
      image_url: data.image_url || undefined,
      display_order: data.display_order,
      is_active: data.is_active,
    }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('admin-urgent-needs')
        queryClient.invalidateQueries('urgent-needs-nav')
        setEditingId(null)
        reset()
        showSuccess('Success', 'Urgent need updated successfully')
      },
      onError: () => {
        showError('Error', 'Failed to update urgent need')
      }
    }
  )

  const deleteMutation = useMutation(
    (id: number) => urgentNeedsAPI.delete(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('admin-urgent-needs')
        queryClient.invalidateQueries('urgent-needs-nav')
        showSuccess('Success', 'Urgent need deleted successfully')
      },
      onError: () => {
        showError('Error', 'Failed to delete urgent need')
      }
    }
  )

  const handleEdit = (need: UrgentNeed) => {
    setEditingId(need.id)
    setValue('title', need.title)
    setValue('slug', need.slug)
    setValue('short_description', need.short_description || '')
    setValue('html_content', need.html_content || '')
    setValue('css_content', need.css_content || '')
    setValue('js_content', need.js_content || '')
    setValue('image_url', need.image_url || '')
    setValue('display_order', need.display_order)
    setValue('is_active', need.is_active)
  }

  const handleCancel = () => {
    setEditingId(null)
    reset()
  }

  const onSubmit = (data: UrgentNeedForm) => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, data })
    } else {
      createMutation.mutate(data)
    }
  }

  const { confirm, ConfirmationDialog } = useConfirmation()

  const handleDelete = async (id: number) => {
    const confirmed = await confirm({
      title: 'Delete Urgent Need',
      message: 'Are you sure you want to delete this urgent need? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger'
    })
    if (confirmed) {
      deleteMutation.mutate(id)
    }
  }

  const handleOrderChange = async (needId: number, direction: 'up' | 'down') => {
    const need = needs?.find((n: UrgentNeed) => n.id === needId)
    if (!need) return

    const sortedNeeds = [...(needs || [])].sort((a, b) => a.display_order - b.display_order)
    const currentIndex = sortedNeeds.findIndex((n) => n.id === needId)
    
    if (direction === 'up' && currentIndex > 0) {
      const targetNeed = sortedNeeds[currentIndex - 1]
      await Promise.all([
        urgentNeedsAPI.update(needId, { display_order: targetNeed.display_order }),
        urgentNeedsAPI.update(targetNeed.id, { display_order: need.display_order }),
      ])
      queryClient.invalidateQueries('admin-urgent-needs')
    } else if (direction === 'down' && currentIndex < sortedNeeds.length - 1) {
      const targetNeed = sortedNeeds[currentIndex + 1]
      await Promise.all([
        urgentNeedsAPI.update(needId, { display_order: targetNeed.display_order }),
        urgentNeedsAPI.update(targetNeed.id, { display_order: need.display_order }),
      ])
      queryClient.invalidateQueries('admin-urgent-needs')
    }
  }

  const htmlContent = watch('html_content')
  const cssContent = watch('css_content')
  const jsContent = watch('js_content')

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
        <div className="flex items-center mb-4">
          <AlertCircle className="w-8 h-8 text-primary-600 mr-3" />
          <h1 className="text-3xl font-bold text-gray-900">Urgent Needs Management</h1>
        </div>
        <p className="text-gray-600">
          Create and manage urgent cause pages with custom HTML, CSS, and JavaScript content.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Needs List */}
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Urgent Needs</h2>
          <div className="space-y-4">
            {needs && needs.length > 0 ? (
              [...needs]
                .sort((a, b) => a.display_order - b.display_order)
                .map((need: UrgentNeed) => (
                  <div key={need.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold text-gray-900 truncate">{need.title}</h3>
                          <div className="flex items-center space-x-2 ml-2">
                            <button
                              onClick={() => handleOrderChange(need.id, 'up')}
                              className="p-1 text-gray-600 hover:text-primary-600"
                              title="Move up"
                            >
                              <ArrowUp className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleOrderChange(need.id, 'down')}
                              className="p-1 text-gray-600 hover:text-primary-600"
                              title="Move down"
                            >
                              <ArrowDown className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        {need.short_description && (
                          <p className="text-sm text-gray-600 mb-2 line-clamp-2">{need.short_description}</p>
                        )}
                        <div className="flex items-center space-x-4 text-xs text-gray-500">
                          <span>Order: {need.display_order}</span>
                          <span className={need.is_active ? 'text-green-600' : 'text-gray-400'}>
                            {need.is_active ? 'Active' : 'Inactive'}
                          </span>
                          <Link
                            to={`/urgent-needs/${need.slug}`}
                            target="_blank"
                            className="text-blue-600 hover:text-blue-700 flex items-center"
                          >
                            <Eye className="w-3 h-3 mr-1" />
                            View
                          </Link>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col space-y-2 ml-4">
                        <button
                          onClick={() => handleEdit(need)}
                          className="p-2 text-gray-600 hover:text-primary-600 hover:bg-gray-100 rounded"
                          title="Edit"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(need.id)}
                          className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
            ) : (
              <p className="text-gray-500 text-center py-8">No urgent needs yet. Create your first one below.</p>
            )}
          </div>
        </div>

        {/* Create/Edit Form */}
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">
            {editingId ? 'Edit Urgent Need' : 'Create New Urgent Need'}
          </h2>
          
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Title *
              </label>
              <input
                {...register('title', { 
                  required: true,
                  onChange: (e) => {
                    if (!editingId) {
                      // Auto-generate slug from title for new items
                      const slug = e.target.value.toLowerCase()
                        .replace(/[^\w\s-]/g, '')
                        .replace(/[-\s]+/g, '-')
                        .trim()
                        .replace(/^-+|-+$/g, '')
                      setValue('slug', slug)
                    }
                  }
                })}
                className="input-field"
                placeholder="Enter urgent need title"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                URL Slug *
              </label>
              <input
                {...register('slug', { required: true })}
                className="input-field"
                placeholder="url-friendly-slug"
              />
              <p className="mt-1 text-xs text-gray-500">
                Used in URL: /urgent-needs/[slug] (auto-generated from title)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Short Description
              </label>
              <textarea
                {...register('short_description')}
                rows={2}
                className="input-field"
                placeholder="Brief description shown in dropdown"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Image URL
              </label>
              <input
                {...register('image_url')}
                type="url"
                className="input-field"
                placeholder="https://example.com/image.jpg"
              />
            </div>

            {/* Code Editors */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Content Editor
              </label>
              <div className="border border-gray-300 rounded-lg overflow-hidden">
                {/* Tabs */}
                <div className="flex border-b border-gray-300">
                  <button
                    type="button"
                    onClick={() => setActiveTab('html')}
                    className={`px-4 py-2 text-sm font-medium ${
                      activeTab === 'html'
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    HTML
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('css')}
                    className={`px-4 py-2 text-sm font-medium ${
                      activeTab === 'css'
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    CSS
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('js')}
                    className={`px-4 py-2 text-sm font-medium ${
                      activeTab === 'js'
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    JavaScript
                  </button>
                </div>

                {/* Editor */}
                <div className="bg-gray-50">
                  {activeTab === 'html' && (
                    <textarea
                      {...register('html_content')}
                      rows={12}
                      className="w-full p-4 font-mono text-sm border-0 focus:ring-0 focus:outline-none bg-gray-50"
                      placeholder="Enter HTML content..."
                    />
                  )}
                  {activeTab === 'css' && (
                    <textarea
                      {...register('css_content')}
                      rows={12}
                      className="w-full p-4 font-mono text-sm border-0 focus:ring-0 focus:outline-none bg-gray-50"
                      placeholder="Enter CSS content..."
                    />
                  )}
                  {activeTab === 'js' && (
                    <textarea
                      {...register('js_content')}
                      rows={12}
                      className="w-full p-4 font-mono text-sm border-0 focus:ring-0 focus:outline-none bg-gray-50"
                      placeholder="Enter JavaScript content..."
                    />
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Display Order
              </label>
              <input
                type="number"
                {...register('display_order', { valueAsNumber: true })}
                className="input-field"
                placeholder="0"
              />
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                {...register('is_active')}
                className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
              <label className="ml-2 text-sm text-gray-700">Active</label>
            </div>

            <div className="flex gap-4">
              <button
                type="submit"
                disabled={createMutation.isLoading || updateMutation.isLoading}
                className="btn-primary flex items-center"
              >
                {(createMutation.isLoading || updateMutation.isLoading) ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    {editingId ? 'Update Need' : 'Create Need'}
                  </>
                )}
              </button>
              
              {editingId && (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="btn-outline flex items-center"
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </button>
              )}
            </div>
          </form>

          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Note:</strong> Use HTML, CSS, and JavaScript to create custom content for each urgent need page. 
              The content will be rendered on the public page at /urgent-needs/[slug].
            </p>
          </div>
        </div>
      </div>

      <ConfirmationDialog />
    </div>
  )
}

export default AdminUrgentNeeds

