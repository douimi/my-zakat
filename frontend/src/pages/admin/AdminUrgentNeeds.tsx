import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useForm } from 'react-hook-form'
import { AlertCircle, Edit, Trash2, Save, Plus, ArrowUp, ArrowDown, Eye } from 'lucide-react'
import { PageHeader, LoadingBlock, EmptyState, StatusBadge, Modal, Collapsible } from '../../components/admin'
import { urgentNeedsAPI } from '../../utils/api'
import { useToast } from '../../contexts/ToastContext'
import { useConfirmation } from '../../hooks/useConfirmation'
import { Link } from 'react-router-dom'
import MediaInput from '../../components/MediaInput'

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
  // The form lives in a dialog, so the list gets the full width.
  const [showForm, setShowForm] = useState(false)
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
        setShowForm(false)
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
        setShowForm(false)
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
  const hasCode = !!(htmlContent || cssContent || jsContent)
  const saving = createMutation.isLoading || updateMutation.isLoading

  const openCreate = () => {
    setEditingId(null)
    reset()
    setActiveTab('html')
    setShowForm(true)
  }

  const closeForm = () => {
    handleCancel()
    setShowForm(false)
  }

  if (isLoading) {
    return <LoadingBlock label="Loading urgent needs…" />
  }

  const newButton = (
    <button type="button" onClick={openCreate} className="btn-primary gap-2">
      <Plus className="w-5 h-5" aria-hidden="true" />
      New urgent need
    </button>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Urgent Needs"
        icon={AlertCircle}
        count={needs?.length}
        description="Cause pages shown under Urgent Needs."
        actions={newButton}
        help={
          <p>
            Each need gets a public page at /urgent-needs/[slug]. Its body is the custom HTML, CSS and
            JavaScript you write under "Custom page code" in the form.
          </p>
        }
      />

      {needs && needs.length > 0 ? (
        <ul className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
          {[...needs]
            .sort((a, b) => a.display_order - b.display_order)
            .map((need: UrgentNeed) => (
              <li key={need.id} className="flex items-start gap-3 p-4">
                <div className="flex flex-col">
                  <button
                    onClick={() => handleOrderChange(need.id, 'up')}
                    className="p-1 text-gray-500 hover:text-primary-600"
                    title="Move up"
                    aria-label={`Move ${need.title} up`}
                  >
                    <ArrowUp className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    onClick={() => handleOrderChange(need.id, 'down')}
                    className="p-1 text-gray-500 hover:text-primary-600"
                    title="Move down"
                    aria-label={`Move ${need.title} down`}
                  >
                    <ArrowDown className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-gray-900 truncate">{need.title}</p>
                    <StatusBadge tone={need.is_active ? 'success' : 'neutral'}>
                      {need.is_active ? 'Active' : 'Inactive'}
                    </StatusBadge>
                  </div>
                  {need.short_description && (
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">{need.short_description}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-500">/urgent-needs/{need.slug} · Order {need.display_order}</p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <Link
                    to={`/urgent-needs/${need.slug}`}
                    target="_blank"
                    className="p-2 text-gray-600 hover:text-primary-600 hover:bg-gray-100 rounded"
                    title="View page"
                    aria-label={`View ${need.title}`}
                  >
                    <Eye className="w-4 h-4" aria-hidden="true" />
                  </Link>
                  <button
                    onClick={() => { handleEdit(need); setActiveTab('html'); setShowForm(true) }}
                    className="p-2 text-gray-600 hover:text-primary-600 hover:bg-gray-100 rounded"
                    title="Edit"
                    aria-label={`Edit ${need.title}`}
                  >
                    <Edit className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    onClick={() => handleDelete(need.id)}
                    className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded"
                    title="Delete"
                    aria-label={`Delete ${need.title}`}
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
        </ul>
      ) : (
        <EmptyState icon={AlertCircle} title="No urgent needs yet." action={newButton} />
      )}

      {/* Create/Edit Form */}
      <Modal
        open={showForm}
        title={editingId ? 'Edit Urgent Need' : 'Create New Urgent Need'}
        size="xl"
        onClose={closeForm}
        footer={
          <>
            <button type="button" onClick={closeForm} className="btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              form="urgent-need-form"
              disabled={saving}
              className="btn-primary gap-2"
            >
              <Save className="w-4 h-4" aria-hidden="true" />
              {saving ? 'Saving...' : editingId ? 'Update Need' : 'Create Need'}
            </button>
          </>
        }
      >
        <form id="urgent-need-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="need-title" className="label">Title *</label>
              <input
                id="need-title"
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
              <label htmlFor="need-slug" className="label">URL Slug *</label>
              <input
                id="need-slug"
                {...register('slug', { required: true })}
                className="input-field"
                placeholder="url-friendly-slug"
              />
              <p className="help-text">/urgent-needs/[slug], filled in from the title.</p>
            </div>
          </div>

          <div>
            <label htmlFor="need-short" className="label">Short Description</label>
            <textarea
              id="need-short"
              {...register('short_description')}
              rows={2}
              className="input-field"
              placeholder="Brief description shown in dropdown"
            />
          </div>

          <MediaInput
            value={watch('image_url') || ''}
            onChange={(url) => setValue('image_url', url)}
            type="images"
            label="Image URL"
            placeholder="Enter image URL or select from library"
          />

          <div className="flex flex-wrap items-end gap-6">
            <div>
              <label htmlFor="need-order" className="label">Display Order</label>
              <input
                id="need-order"
                type="number"
                {...register('display_order', { valueAsNumber: true })}
                className="input-field w-28"
                placeholder="0"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 pb-3">
              <input
                type="checkbox"
                {...register('is_active')}
                className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
              Active
            </label>
          </div>

          {/* Code Editors: open straight away only when the need already has code. */}
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <Collapsible
              key={editingId ?? 'new'}
              title="Custom page code"
              preview={hasCode ? 'HTML · CSS · JS (this page has custom code)' : 'HTML · CSS · JS'}
              defaultOpen={!!editingId && hasCode}
            >
              <div className="border border-gray-300 rounded-lg overflow-hidden">
                <div className="flex border-b border-gray-300" role="tablist" aria-label="Code language">
                  {([['html', 'HTML'], ['css', 'CSS'], ['js', 'JavaScript']] as const).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={activeTab === key}
                      onClick={() => setActiveTab(key)}
                      className={`px-4 py-2 text-sm font-medium ${
                        activeTab === key
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
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
                      {...register('html_content')}
                      rows={12}
                      className="w-full p-4 font-mono text-sm border-0 focus:ring-0 focus:outline-none bg-gray-50"
                      placeholder="Enter HTML content..."
                    />
                  )}
                  {activeTab === 'css' && (
                    <textarea
                      aria-label="CSS content"
                      {...register('css_content')}
                      rows={12}
                      className="w-full p-4 font-mono text-sm border-0 focus:ring-0 focus:outline-none bg-gray-50"
                      placeholder="Enter CSS content..."
                    />
                  )}
                  {activeTab === 'js' && (
                    <textarea
                      aria-label="JavaScript content"
                      {...register('js_content')}
                      rows={12}
                      className="w-full p-4 font-mono text-sm border-0 focus:ring-0 focus:outline-none bg-gray-50"
                      placeholder="Enter JavaScript content..."
                    />
                  )}
                </div>
              </div>
            </Collapsible>
          </div>
        </form>
      </Modal>

      <ConfirmationDialog />
    </div>
  )
}

export default AdminUrgentNeeds

