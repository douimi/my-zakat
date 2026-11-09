import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useForm } from 'react-hook-form'
import { Image as ImageIcon, Edit, Trash2, Save, Plus, ArrowUp, ArrowDown, Eye, EyeOff } from 'lucide-react'
import { PageHeader, LoadingBlock, EmptyState, StatusBadge, Modal } from '../../components/admin'
import { slideshowAPI } from '../../utils/api'
import { useToast } from '../../contexts/ToastContext'
import { useConfirmation } from '../../hooks/useConfirmation'
import MediaInput from '../../components/MediaInput'

interface SlideshowSlide {
  id: number
  title: string
  description?: string
  image_filename?: string
  image_url?: string
  cta_text?: string
  cta_url?: string
  display_order: number
  is_active: boolean
}

interface SlideForm {
  title: string
  description: string
  image_url: string
  cta_text: string
  cta_url: string
  display_order: number
  is_active: boolean
}

const AdminSlideshow = () => {
  const [editingId, setEditingId] = useState<number | null>(null)
  // The form lives in a dialog, so the list gets the full width.
  const [showForm, setShowForm] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccess, showError } = useToast()
  
  const { data: slides, isLoading } = useQuery('admin-slideshow', () => slideshowAPI.getAll(false))
  
  const { register, handleSubmit, reset, setValue, watch } = useForm<SlideForm>()
  
  const createMutation = useMutation(
    (data: SlideForm) => slideshowAPI.create({
      title: data.title,
      description: data.description || undefined,
      image_url: data.image_url || undefined,
      cta_text: data.cta_text || undefined,
      cta_url: data.cta_url || undefined,
      display_order: data.display_order,
      is_active: data.is_active,
    }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('admin-slideshow')
        reset()
        setShowForm(false)
        showSuccess('Success', 'Slide created successfully')
      },
      onError: () => {
        showError('Error', 'Failed to create slide')
      }
    }
  )

  const updateMutation = useMutation(
    ({ id, data }: { id: number; data: Partial<SlideForm> }) => slideshowAPI.update(id, {
      title: data.title,
      description: data.description || undefined,
      image_url: data.image_url || undefined,
      cta_text: data.cta_text || undefined,
      cta_url: data.cta_url || undefined,
      display_order: data.display_order,
      is_active: data.is_active,
    }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('admin-slideshow')
        setEditingId(null)
        reset()
        setShowForm(false)
        showSuccess('Success', 'Slide updated successfully')
      },
      onError: () => {
        showError('Error', 'Failed to update slide')
      }
    }
  )

  const deleteMutation = useMutation(
    (id: number) => slideshowAPI.delete(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('admin-slideshow')
        showSuccess('Success', 'Slide deleted successfully')
      },
      onError: () => {
        showError('Error', 'Failed to delete slide')
      }
    }
  )

  // One-click enable / disable a slide without opening the edit form. Mirrors
  // the same UX pattern used in the Gallery admin (Eye / EyeOff toggle).
  const toggleActiveMutation = useMutation(
    ({ id, is_active }: { id: number; is_active: boolean }) =>
      slideshowAPI.update(id, { is_active }),
    {
      onSuccess: (_data, variables) => {
        queryClient.invalidateQueries('admin-slideshow')
        showSuccess(
          'Success',
          variables.is_active ? 'Slide enabled — visible on the homepage' : 'Slide disabled — hidden from the homepage',
        )
      },
      onError: () => {
        showError('Error', 'Failed to update slide status')
      },
    }
  )

  const handleEdit = (slide: SlideshowSlide) => {
    setEditingId(slide.id)
    setValue('title', slide.title)
    setValue('description', slide.description || '')
    setValue('image_url', slide.image_url || slide.image_filename ? (slide.image_url || `/api/uploads/media/images/${slide.image_filename}`) : '')
    setValue('cta_text', slide.cta_text || '')
    setValue('cta_url', slide.cta_url || '')
    setValue('display_order', slide.display_order)
    setValue('is_active', slide.is_active)
  }

  const handleCancel = () => {
    setEditingId(null)
    reset()
  }

  const onSubmit = (data: SlideForm) => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, data })
    } else {
      createMutation.mutate(data)
    }
  }

  const { confirm, ConfirmationDialog } = useConfirmation()

  const handleDelete = async (id: number) => {
    const confirmed = await confirm({
      title: 'Delete Slide',
      message: 'Are you sure you want to delete this slide? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger'
    })
    if (confirmed) {
      deleteMutation.mutate(id)
    }
  }


  const handleOrderChange = async (slideId: number, direction: 'up' | 'down') => {
    const slide = slides?.find((s: SlideshowSlide) => s.id === slideId)
    if (!slide) return

    const sortedSlides = [...(slides || [])].sort((a, b) => a.display_order - b.display_order)
    const currentIndex = sortedSlides.findIndex((s) => s.id === slideId)
    
    if (direction === 'up' && currentIndex > 0) {
      const targetSlide = sortedSlides[currentIndex - 1]
      await Promise.all([
        slideshowAPI.update(slideId, { display_order: targetSlide.display_order }),
        slideshowAPI.update(targetSlide.id, { display_order: slide.display_order }),
      ])
      queryClient.invalidateQueries('admin-slideshow')
    } else if (direction === 'down' && currentIndex < sortedSlides.length - 1) {
      const targetSlide = sortedSlides[currentIndex + 1]
      await Promise.all([
        slideshowAPI.update(slideId, { display_order: targetSlide.display_order }),
        slideshowAPI.update(targetSlide.id, { display_order: slide.display_order }),
      ])
      queryClient.invalidateQueries('admin-slideshow')
    }
  }

  const saving = createMutation.isLoading || updateMutation.isLoading

  const openCreate = () => {
    setEditingId(null)
    reset()
    setShowForm(true)
  }

  const closeForm = () => {
    handleCancel()
    setShowForm(false)
  }

  if (isLoading) {
    return <LoadingBlock label="Loading slides…" />
  }

  const newButton = (
    <button type="button" onClick={openCreate} className="btn-primary gap-2">
      <Plus className="w-5 h-5" aria-hidden="true" />
      New slide
    </button>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Slideshow"
        icon={ImageIcon}
        count={slides?.length}
        description="Homepage slides, shown in display order (lowest first)."
        actions={newButton}
      />

      {slides && slides.length > 0 ? (
        <ul className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
          {[...slides]
            .sort((a, b) => a.display_order - b.display_order)
            .map((slide: SlideshowSlide) => (
              <li key={slide.id} className={`flex items-start gap-3 p-4 ${slide.is_active ? '' : 'bg-gray-50'}`}>
                <div className="flex flex-col">
                  <button
                    onClick={() => handleOrderChange(slide.id, 'up')}
                    className="p-1 text-gray-500 hover:text-primary-600"
                    title="Move up"
                    aria-label={`Move ${slide.title} up`}
                  >
                    <ArrowUp className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    onClick={() => handleOrderChange(slide.id, 'down')}
                    className="p-1 text-gray-500 hover:text-primary-600"
                    title="Move down"
                    aria-label={`Move ${slide.title} down`}
                  >
                    <ArrowDown className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>

                {/* Image Preview */}
                <div className={`shrink-0 ${!slide.is_active ? 'opacity-60' : ''}`}>
                  {slide.image_url || slide.image_filename ? (
                    <img
                      src={slide.image_url || (slide.image_filename ? `/api/uploads/media/images/${slide.image_filename}` : '')}
                      alt=""
                      className={`w-24 h-16 object-cover rounded ${!slide.is_active ? 'grayscale' : ''}`}
                      onError={(e) => {
                        e.currentTarget.src = ''
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  ) : (
                    <div className="w-24 h-16 bg-gray-200 rounded flex items-center justify-center">
                      <ImageIcon className="w-6 h-6 text-gray-400" aria-hidden="true" />
                    </div>
                  )}
                </div>

                {/* Slide Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-gray-900 truncate">{slide.title}</p>
                    <StatusBadge tone={slide.is_active ? 'success' : 'neutral'} icon={slide.is_active ? Eye : EyeOff}>
                      {slide.is_active ? 'Active' : 'Inactive'}
                    </StatusBadge>
                  </div>
                  {slide.description && (
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">{slide.description}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-500">
                    Order {slide.display_order}
                    {!slide.is_active && ' · Hidden from homepage slideshow'}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => toggleActiveMutation.mutate({ id: slide.id, is_active: !slide.is_active })}
                    disabled={toggleActiveMutation.isLoading}
                    className={`p-2 rounded transition-colors ${
                      slide.is_active
                        ? 'text-amber-600 hover:text-amber-700 hover:bg-amber-50'
                        : 'text-green-600 hover:text-green-700 hover:bg-green-50'
                    }`}
                    title={slide.is_active ? 'Disable slide (hide from homepage)' : 'Enable slide (show on homepage)'}
                    aria-label={slide.is_active ? `Hide ${slide.title} from homepage` : `Show ${slide.title} on homepage`}
                  >
                    {slide.is_active ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                  </button>
                  <button
                    onClick={() => { handleEdit(slide); setShowForm(true) }}
                    className="p-2 text-gray-600 hover:text-primary-600 hover:bg-gray-100 rounded"
                    title="Edit slide"
                    aria-label={`Edit ${slide.title}`}
                  >
                    <Edit className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    onClick={() => handleDelete(slide.id)}
                    className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded"
                    title="Delete slide"
                    aria-label={`Delete ${slide.title}`}
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
        </ul>
      ) : (
        <EmptyState icon={ImageIcon} title="No slides yet." action={newButton} />
      )}

      {/* Create/Edit Form */}
      <Modal
        open={showForm}
        title={editingId ? 'Edit Slide' : 'Create New Slide'}
        size="lg"
        onClose={closeForm}
        footer={
          <>
            <button type="button" onClick={closeForm} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" form="slide-form" disabled={saving} className="btn-primary gap-2">
              <Save className="w-4 h-4" aria-hidden="true" />
              {saving ? 'Saving...' : editingId ? 'Update Slide' : 'Create Slide'}
            </button>
          </>
        }
      >
        <form id="slide-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div>
            <label htmlFor="slide-title" className="label">Title *</label>
            <input
              id="slide-title"
              {...register('title', { required: true })}
              className="input-field"
              placeholder="Enter slide title"
            />
          </div>

          <div>
            <label htmlFor="slide-description" className="label">Description</label>
            <textarea
              id="slide-description"
              {...register('description')}
              rows={3}
              className="input-field"
              placeholder="Enter slide description"
            />
          </div>

          <MediaInput
            value={watch('image_url') || ''}
            onChange={(url) => setValue('image_url', url)}
            type="images"
            label="Image URL"
            placeholder="Enter image URL or select from library"
            required={true}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="slide-cta-text" className="label">Call-to-Action Button Text</label>
              <input
                id="slide-cta-text"
                {...register('cta_text')}
                className="input-field"
                placeholder="e.g., Donate Now"
              />
            </div>
            <div>
              <label htmlFor="slide-cta-url" className="label">Call-to-Action URL</label>
              <input
                id="slide-cta-url"
                {...register('cta_url')}
                className="input-field"
                placeholder="e.g., /donate"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-6">
            <div>
              <label htmlFor="slide-order" className="label">Display Order</label>
              <input
                id="slide-order"
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
        </form>
      </Modal>

      <ConfirmationDialog />
    </div>
  )
}

export default AdminSlideshow

