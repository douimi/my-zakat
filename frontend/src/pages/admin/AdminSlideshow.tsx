import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useForm } from 'react-hook-form'
import { Image as ImageIcon, Edit, Trash2, Save, X, ArrowUp, ArrowDown, Eye, EyeOff } from 'lucide-react'
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
          <ImageIcon className="w-8 h-8 text-primary-600 mr-3" />
          <h1 className="text-3xl font-bold text-gray-900">Slideshow Management</h1>
        </div>
        <p className="text-gray-600">
          Manage the slideshow displayed on your homepage. Add, edit, and reorder slides.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Slides List */}
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Slideshow Slides</h2>
          <div className="space-y-4">
            {slides && slides.length > 0 ? (
              [...slides]
                .sort((a, b) => a.display_order - b.display_order)
                .map((slide: SlideshowSlide) => (
                  <div
                    key={slide.id}
                    className={`border rounded-lg p-4 transition-colors ${
                      slide.is_active
                        ? 'border-gray-200 bg-white'
                        : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <div className={`flex items-start space-x-4 ${!slide.is_active ? 'opacity-60' : ''}`}>
                      {/* Image Preview */}
                      <div className="flex-shrink-0">
                        {slide.image_url || slide.image_filename ? (
                          <img
                            src={slide.image_url || (slide.image_filename ? `/api/uploads/media/images/${slide.image_filename}` : '')}
                            alt={slide.title}
                            className={`w-24 h-16 object-cover rounded ${!slide.is_active ? 'grayscale' : ''}`}
                            onError={(e) => {
                              e.currentTarget.src = ''
                              e.currentTarget.style.display = 'none'
                            }}
                          />
                        ) : (
                          <div className="w-24 h-16 bg-gray-200 rounded flex items-center justify-center">
                            <ImageIcon className="w-6 h-6 text-gray-400" />
                          </div>
                        )}
                      </div>

                      {/* Slide Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-2 gap-2">
                          <h3 className="font-semibold text-gray-900 truncate flex-1">{slide.title}</h3>
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                              slide.is_active
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-200 text-gray-600'
                            }`}
                          >
                            {slide.is_active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                            {slide.is_active ? 'Active' : 'Inactive'}
                          </span>
                          <div className="flex items-center space-x-1">
                            <button
                              onClick={() => handleOrderChange(slide.id, 'up')}
                              className="p-1 text-gray-600 hover:text-primary-600"
                              title="Move up"
                            >
                              <ArrowUp className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleOrderChange(slide.id, 'down')}
                              className="p-1 text-gray-600 hover:text-primary-600"
                              title="Move down"
                            >
                              <ArrowDown className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        {slide.description && (
                          <p className="text-sm text-gray-600 mb-2 line-clamp-2">{slide.description}</p>
                        )}
                        <div className="flex items-center space-x-4 text-xs text-gray-500">
                          <span>Order: {slide.display_order}</span>
                          {!slide.is_active && (
                            <span className="italic text-gray-400">Hidden from homepage slideshow</span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col space-y-2">
                        <button
                          onClick={() => toggleActiveMutation.mutate({ id: slide.id, is_active: !slide.is_active })}
                          disabled={toggleActiveMutation.isLoading}
                          className={`p-2 rounded transition-colors ${
                            slide.is_active
                              ? 'text-amber-600 hover:text-amber-700 hover:bg-amber-50'
                              : 'text-green-600 hover:text-green-700 hover:bg-green-50'
                          }`}
                          title={slide.is_active ? 'Disable slide (hide from homepage)' : 'Enable slide (show on homepage)'}
                        >
                          {slide.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => handleEdit(slide)}
                          className="p-2 text-gray-600 hover:text-primary-600 hover:bg-gray-100 rounded"
                          title="Edit slide"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(slide.id)}
                          className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded"
                          title="Delete slide"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
            ) : (
              <p className="text-gray-500 text-center py-8">No slides yet. Create your first slide below.</p>
            )}
          </div>
        </div>

        {/* Create/Edit Form */}
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">
            {editingId ? 'Edit Slide' : 'Create New Slide'}
          </h2>
          
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Title *
              </label>
              <input
                {...register('title', { required: true })}
                className="input-field"
                placeholder="Enter slide title"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Call-to-Action Button Text
              </label>
              <input
                {...register('cta_text')}
                className="input-field"
                placeholder="e.g., Donate Now"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Call-to-Action URL
              </label>
              <input
                {...register('cta_url')}
                className="input-field"
                placeholder="e.g., /donate"
              />
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
                    {editingId ? 'Update Slide' : 'Create Slide'}
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
              <strong>Note:</strong> Enter the full URL of the image you want to use for each slide.
              Slides are displayed in order of their "Display Order" value (lower numbers appear first).
            </p>
          </div>
        </div>
      </div>

      <ConfirmationDialog />
    </div>
  )
}

export default AdminSlideshow

