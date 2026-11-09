import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Plus, Edit2, Trash2, Save, Loader2, Eye, Video, Upload, Link as LinkIcon, Image as ImageIcon, TrendingUp } from 'lucide-react'
import { clsx } from 'clsx'
import { PageHeader, LoadingBlock, EmptyState, StatusBadge, LongText, Modal } from '../../components/admin'
import { programsAPI, programCategoriesAPI, getStaticFileUrl } from '../../utils/api'
import { useToast } from '../../contexts/ToastContext'
import ConfirmationModal from '../../components/ConfirmationModal'
import { isValidImageUrl, isValidVideoUrl } from '../../utils/mediaHelpers'
import VideoThumbnail from '../../components/VideoThumbnail'
import { Link } from 'react-router-dom'
import type { Program, ProgramCategory } from '../../types'
import MediaInput from '../../components/MediaInput'

const AdminPrograms = () => {
  const [editingProgram, setEditingProgram] = useState<number | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showUrlInput, setShowUrlInput] = useState<{ programId: number; field: 'image' | 'video' } | null>(null)
  const [urlValue, setUrlValue] = useState('')
  const [uploadingItem, setUploadingItem] = useState<number | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ programId: number; programName: string } | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)
  const [programData, setProgramData] = useState<{ [key: number]: Partial<Program> }>({})
  const [newProgram, setNewProgram] = useState({
    category_id: 0,
    title: '',
    slug: '',
    description: '',
    short_description: '',
    image_url: '',
    impact_text: '',
    display_order: 0,
    is_active: true
  })
  
  const queryClient = useQueryClient()
  const { showSuccess, showError } = useToast()
  
  const { data: categories } = useQuery('program-categories', () => programCategoriesAPI.getAll())
  const { data: programs, isLoading } = useQuery(
    ['programs', selectedCategory],
    () => programsAPI.getAll(selectedCategory ? selectedCategory : undefined, false),
    {
      enabled: true, // Always enabled
    }
  )

  // Initialize program data when programs load
  useEffect(() => {
    if (programs && Object.keys(programData).length === 0) {
      const initialData: { [key: number]: Partial<Program> } = {}
      programs.forEach((prog: Program) => {
        initialData[prog.id] = {
          title: prog.title,
          slug: prog.slug,
          description: prog.description || '',
          short_description: prog.short_description || '',
          impact_text: prog.impact_text || '',
          image_url: prog.image_url || '',
          display_order: prog.display_order,
          is_active: prog.is_active,
          category_id: prog.category_id
        }
      })
      setProgramData(initialData)
    }
  }, [programs])

  const createMutation = useMutation(
    (data: typeof newProgram) => programsAPI.create(data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('programs')
        setShowCreateModal(false)
        setNewProgram({
          category_id: 0,
          title: '',
          slug: '',
          description: '',
          short_description: '',
          image_url: '',
          impact_text: '',
          display_order: 0,
          is_active: true
        })
        showSuccess('Success', 'Program created successfully!')
      },
      onError: (error: any) => {
        showError('Error', error?.response?.data?.detail || 'Failed to create program')
      }
    }
  )

  const updateMutation = useMutation(
    ({ id, data }: { id: number; data: Partial<Program> }) => programsAPI.update(id, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('programs')
        setEditingProgram(null)
        showSuccess('Success', 'Program updated successfully!')
      },
      onError: (error: any) => {
        showError('Error', error?.response?.data?.detail || 'Failed to update program')
      }
    }
  )

  const deleteMutation = useMutation(
    (id: number) => programsAPI.delete(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('programs')
        setDeleteConfirm(null)
        showSuccess('Success', 'Program deleted successfully!')
      },
      onError: (error: any) => {
        showError('Error', error?.response?.data?.detail || 'Failed to delete program')
      }
    }
  )

  const uploadVideoMutation = useMutation(
    ({ id, file }: { id: number; file: File }) => programsAPI.uploadVideo(id, file),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('programs')
        setUploadingItem(null)
        showSuccess('Success', 'Video uploaded successfully!')
      },
      onError: (error: any) => {
        setUploadingItem(null)
        showError('Upload Failed', error?.response?.data?.detail || 'Failed to upload video')
      }
    }
  )

  const handleFileUpload = async (programId: number, file: File | null) => {
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

    setUploadingItem(programId)
    uploadVideoMutation.mutate({ id: programId, file })
  }

  const handleSaveProgram = async (programId: number) => {
    const data = programData[programId]
    if (!data) return
    updateMutation.mutate({ id: programId, data })
  }

  const handleCreateProgram = () => {
    if (!newProgram.category_id || !newProgram.title || !newProgram.slug) {
      showError('Validation Error', 'Category, title, and slug are required')
      return
    }
    createMutation.mutate(newProgram)
  }

  const handleDeleteProgram = (programId: number) => {
    const program = programs?.find((p: Program) => p.id === programId)
    const programName = program?.title || `Program ${programId}`
    setDeleteConfirm({ programId, programName })
  }

  const confirmDeleteProgram = () => {
    if (!deleteConfirm) return
    deleteMutation.mutate(deleteConfirm.programId)
  }

  const handleUrlSubmit = (programId: number, field: 'image' | 'video') => {
    if (!urlValue.trim()) return
    
    const isValid = field === 'video' ? isValidVideoUrl(urlValue) : isValidImageUrl(urlValue)
    if (!isValid) {
      showError('Invalid URL', `Please enter a valid ${field === 'video' ? 'video' : 'image'} URL`)
      return
    }
    
    const updateData = field === 'video' 
      ? { video_filename: urlValue.trim() }
      : { image_url: urlValue.trim() }
    
    updateMutation.mutate({ id: programId, data: updateData })
    setShowUrlInput(null)
    setUrlValue('')
  }

  const getVideoUrl = (filename?: string) => {
    if (!filename) return null
    if (filename.startsWith('http://') || filename.startsWith('https://')) {
      return filename
    }
    return getStaticFileUrl(`/api/uploads/programs/${filename}`)
  }

  const getImageUrl = (url?: string) => {
    if (!url) return null
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url
    }
    return url
  }

  const getCategoryName = (categoryId: number) => {
    return categories?.find((c: ProgramCategory) => c.id === categoryId)?.name || 'Unknown'
  }

  const resetProgramData = (program: Program) => {
    setProgramData({
      ...programData,
      [program.id]: {
        title: program.title,
        slug: program.slug,
        description: program.description || '',
        short_description: program.short_description || '',
        impact_text: program.impact_text || '',
        image_url: program.image_url || '',
        display_order: program.display_order,
        is_active: program.is_active,
        category_id: program.category_id
      }
    })
  }

  if (isLoading) {
    return <LoadingBlock label="Loading programs…" />
  }

  const filteredPrograms = selectedCategory
    ? programs?.filter((p: Program) => p.category_id === selectedCategory)
    : programs

  return (
    <div className="space-y-6">
      <PageHeader
        title="Programs"
        icon={TrendingUp}
        count={filteredPrograms?.length}
        actions={
          <>
            <label htmlFor="program-category-filter" className="sr-only">Filter by category</label>
            <select
              id="program-category-filter"
              value={selectedCategory || ''}
              onChange={(e) => setSelectedCategory(e.target.value ? parseInt(e.target.value) : null)}
              className="input-field w-auto min-w-[12rem]"
            >
              <option value="">All Categories</option>
              {categories?.map((cat: ProgramCategory) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary gap-2"
            >
              <Plus className="w-5 h-5" aria-hidden="true" />
              Add Program
            </button>
          </>
        }
      />

      {/* Programs List: compact cards; the full form opens only on Edit. */}
      {filteredPrograms && filteredPrograms.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredPrograms.map((program: Program) => {
            const currentData = programData[program.id] || {
              title: program.title,
              slug: program.slug,
              description: program.description || '',
              short_description: program.short_description || '',
              impact_text: program.impact_text || '',
              image_url: program.image_url || '',
              display_order: program.display_order,
              is_active: program.is_active,
              category_id: program.category_id
            }
            const imageUrl = getImageUrl(program.image_url)
            const videoUrl = getVideoUrl(program.video_filename)
            const showImageInput = showUrlInput?.programId === program.id && showUrlInput?.field === 'image'
            const showVideoInput = showUrlInput?.programId === program.id && showUrlInput?.field === 'video'
            const isEditing = editingProgram === program.id
            const field = (id: string) => `program-${program.id}-${id}`

            return (
              <div
                key={program.id}
                className={clsx('bg-white rounded-xl border border-gray-200 shadow-sm p-4', isEditing && 'sm:col-span-2 xl:col-span-3')}
              >
                <div className="flex gap-4">
                  {/* Thumbnail */}
                  <div className="w-20 h-20 shrink-0 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center">
                    {videoUrl ? (
                      <VideoThumbnail videoSrc={videoUrl} className="w-full h-full" alt={`${program.title} video`} />
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
                        <p className="font-semibold text-gray-900 truncate" title={program.title}>{program.title}</p>
                        <p className="text-xs text-gray-500 truncate">{getCategoryName(program.category_id)} · /{program.slug}</p>
                      </div>
                      <StatusBadge tone={program.is_active ? 'success' : 'neutral'}>
                        {program.is_active ? 'Active' : 'Inactive'}
                      </StatusBadge>
                    </div>
                    {!isEditing && (program.short_description || program.description) && (
                      <div className="mt-2">
                        <LongText text={program.short_description || program.description} lines={2} />
                      </div>
                    )}
                    {!isEditing && program.impact_text && (
                      <p className="mt-2"><span className="badge-primary">{program.impact_text}</span></p>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                  <Link
                    to={`/programs/${program.slug}`}
                    target="_blank"
                    className="btn-ghost btn-sm gap-1.5"
                  >
                    <Eye className="w-4 h-4" aria-hidden="true" />
                    View
                  </Link>
                  <button
                    onClick={() => handleDeleteProgram(program.id)}
                    disabled={deleteMutation.isLoading}
                    className="p-2 rounded-lg text-red-600 hover:bg-red-50"
                    title="Delete program"
                    aria-label={`Delete ${program.title}`}
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                  {isEditing && (
                    <button
                      onClick={() => { setEditingProgram(null); setShowUrlInput(null); resetProgramData(program) }}
                      className="btn-secondary btn-sm"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (isEditing) {
                        handleSaveProgram(program.id)
                      } else {
                        setEditingProgram(program.id)
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
                  <div className="mt-4 pt-4 border-t border-gray-100 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
                    {/* Program Details */}
                    <div className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label htmlFor={field('category')} className="label">Category</label>
                          <select
                            id={field('category')}
                            value={currentData.category_id || 0}
                            onChange={(e) => setProgramData({
                              ...programData,
                              [program.id]: { ...currentData, category_id: parseInt(e.target.value) }
                            })}
                            className="input-field"
                          >
                            <option value="0">Select Category</option>
                            {categories?.map((cat: ProgramCategory) => (
                              <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label htmlFor={field('title')} className="label">Title</label>
                          <input
                            id={field('title')}
                            type="text"
                            value={currentData.title || ''}
                            onChange={(e) => setProgramData({
                              ...programData,
                              [program.id]: { ...currentData, title: e.target.value }
                            })}
                            className="input-field"
                            placeholder="Program title"
                          />
                        </div>
                        <div>
                          <label htmlFor={field('slug')} className="label">Slug</label>
                          <input
                            id={field('slug')}
                            type="text"
                            value={currentData.slug || ''}
                            onChange={(e) => setProgramData({
                              ...programData,
                              [program.id]: { ...currentData, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') }
                            })}
                            className="input-field"
                            placeholder="program-slug"
                          />
                        </div>
                        <div>
                          <label htmlFor={field('impact')} className="label">Impact Text</label>
                          <input
                            id={field('impact')}
                            type="text"
                            value={currentData.impact_text || ''}
                            onChange={(e) => setProgramData({
                              ...programData,
                              [program.id]: { ...currentData, impact_text: e.target.value }
                            })}
                            className="input-field"
                            placeholder="e.g., 'Helped 1,200+ families'"
                          />
                        </div>
                      </div>
                      <div>
                        <label htmlFor={field('short')} className="label">Short Description</label>
                        <textarea
                          id={field('short')}
                          value={currentData.short_description || ''}
                          onChange={(e) => setProgramData({
                            ...programData,
                            [program.id]: { ...currentData, short_description: e.target.value }
                          })}
                          className="input-field"
                          rows={2}
                          placeholder="Short description (shown on category page)"
                        />
                      </div>
                      <div>
                        <label htmlFor={field('description')} className="label">Description</label>
                        <textarea
                          id={field('description')}
                          value={currentData.description || ''}
                          onChange={(e) => setProgramData({
                            ...programData,
                            [program.id]: { ...currentData, description: e.target.value }
                          })}
                          className="input-field"
                          rows={4}
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
                            onChange={(e) => setProgramData({
                              ...programData,
                              [program.id]: { ...currentData, display_order: parseInt(e.target.value) || 0 }
                            })}
                            className="input-field w-28"
                          />
                        </div>
                        <label className="flex items-center gap-2 text-sm text-gray-700 pb-3">
                          <input
                            type="checkbox"
                            checked={currentData.is_active ?? true}
                            onChange={(e) => setProgramData({
                              ...programData,
                              [program.id]: { ...currentData, is_active: e.target.checked }
                            })}
                            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          />
                          Active
                        </label>
                      </div>
                    </div>

                    {/* Video/Image Upload/URL */}
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
                              onClick={() => handleUrlSubmit(program.id, showVideoInput ? 'video' : 'image')}
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
                                  onChange={(e) => handleFileUpload(program.id, e.target.files?.[0] || null)}
                                  className="hidden"
                                  disabled={uploadingItem === program.id}
                                />
                              </label>
                              <button
                                onClick={() => {
                                  setUrlValue(program.video_filename || '')
                                  setShowUrlInput({ programId: program.id, field: 'video' })
                                }}
                                className="btn-secondary btn-sm gap-1"
                              >
                                <LinkIcon className="w-3 h-3" aria-hidden="true" />
                                Video URL
                              </button>
                            </div>
                            {uploadingItem === program.id && (
                              <div className="mt-2 flex items-center justify-center">
                                <Loader2 className="w-3 h-3 text-primary-600 animate-spin mr-1" aria-hidden="true" />
                                <span className="text-xs text-gray-600">Uploading...</span>
                              </div>
                            )}
                          </div>
                          <div className="border-2 border-dashed rounded-lg p-3 text-center">
                            <ImageIcon className="w-6 h-6 text-gray-400 mx-auto mb-2" aria-hidden="true" />
                            <p className="text-xs text-gray-600 mb-2">Image URL (fallback if no video)</p>
                            <button
                              onClick={() => {
                                setUrlValue(program.image_url || '')
                                setShowUrlInput({ programId: program.id, field: 'image' })
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
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState
          icon={TrendingUp}
          title={`No programs found${selectedCategory ? ' for this category' : ''}.`}
          action={
            <button onClick={() => setShowCreateModal(true)} className="btn-primary gap-2">
              <Plus className="w-5 h-5" aria-hidden="true" />
              Add Program
            </button>
          }
        />
      )}

      {/* Create Program Modal */}
      <Modal
        open={showCreateModal}
        title="Create New Program"
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
              onClick={handleCreateProgram}
              disabled={createMutation.isLoading || !newProgram.category_id || !newProgram.title || !newProgram.slug}
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
                  Create Program
                </>
              )}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="new-program-category" className="label">Category *</label>
              <select
                id="new-program-category"
                value={newProgram.category_id}
                onChange={(e) => setNewProgram({ ...newProgram, category_id: parseInt(e.target.value) })}
                className="input-field"
              >
                <option value="0">Select Category</option>
                {categories?.map((cat: ProgramCategory) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="new-program-title" className="label">Title *</label>
              <input
                id="new-program-title"
                type="text"
                value={newProgram.title}
                onChange={(e) => setNewProgram({ ...newProgram, title: e.target.value })}
                className="input-field"
                placeholder="Program title"
              />
            </div>
            <div>
              <label htmlFor="new-program-slug" className="label">Slug *</label>
              <input
                id="new-program-slug"
                type="text"
                value={newProgram.slug}
                onChange={(e) => setNewProgram({ ...newProgram, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                className="input-field"
                placeholder="program-slug"
              />
            </div>
            <div>
              <label htmlFor="new-program-impact" className="label">Impact Text</label>
              <input
                id="new-program-impact"
                type="text"
                value={newProgram.impact_text}
                onChange={(e) => setNewProgram({ ...newProgram, impact_text: e.target.value })}
                className="input-field"
                placeholder="e.g., 'Helped 1,200+ families'"
              />
            </div>
          </div>
          <div>
            <label htmlFor="new-program-short" className="label">Short Description</label>
            <textarea
              id="new-program-short"
              value={newProgram.short_description}
              onChange={(e) => setNewProgram({ ...newProgram, short_description: e.target.value })}
              className="input-field"
              rows={2}
              placeholder="Short description"
            />
          </div>
          <div>
            <label htmlFor="new-program-description" className="label">Description</label>
            <textarea
              id="new-program-description"
              value={newProgram.description}
              onChange={(e) => setNewProgram({ ...newProgram, description: e.target.value })}
              className="input-field"
              rows={4}
              placeholder="Full description"
            />
          </div>
          <div>
            <label htmlFor="new-program-image" className="label">Image URL</label>
            <input
              id="new-program-image"
              type="url"
              value={newProgram.image_url}
              onChange={(e) => setNewProgram({ ...newProgram, image_url: e.target.value })}
              className="input-field"
              placeholder="Image URL"
            />
          </div>
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <label htmlFor="new-program-order" className="label">Display Order</label>
              <input
                id="new-program-order"
                type="number"
                value={newProgram.display_order}
                onChange={(e) => setNewProgram({ ...newProgram, display_order: parseInt(e.target.value) || 0 })}
                className="input-field w-28"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 pb-3">
              <input
                type="checkbox"
                checked={newProgram.is_active}
                onChange={(e) => setNewProgram({ ...newProgram, is_active: e.target.checked })}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              Active
            </label>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={confirmDeleteProgram}
        title="Delete Program"
        message={deleteConfirm ? `Are you sure you want to delete "${deleteConfirm.programName}"? This action cannot be undone.` : ''}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        isLoading={deleteMutation.isLoading}
      />
    </div>
  )
}

export default AdminPrograms
