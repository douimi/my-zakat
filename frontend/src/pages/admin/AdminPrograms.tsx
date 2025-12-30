import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Plus, Edit2, Trash2, Save, X, Loader2, Eye, Video, Upload, Link as LinkIcon, Image as ImageIcon } from 'lucide-react'
import { programsAPI, programCategoriesAPI, getStaticFileUrl } from '../../utils/api'
import { useToast } from '../../contexts/ToastContext'
import ConfirmationModal from '../../components/ConfirmationModal'
import { isValidImageUrl, isValidVideoUrl } from '../../utils/mediaHelpers'
import LazyVideo from '../../components/LazyVideo'
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  const filteredPrograms = selectedCategory 
    ? programs?.filter((p: Program) => p.category_id === selectedCategory)
    : programs

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Programs Management</h1>
          <p className="text-gray-600 mt-2">Manage programs and link them to categories</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Add Program
        </button>
      </div>

      {/* Category Filter */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Category</label>
        <select
          value={selectedCategory || ''}
          onChange={(e) => setSelectedCategory(e.target.value ? parseInt(e.target.value) : null)}
          className="input-field max-w-xs"
        >
          <option value="">All Categories</option>
          {categories?.map((cat: ProgramCategory) => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
      </div>

      {/* Programs List */}
      <div className="space-y-6">
        {filteredPrograms && filteredPrograms.length > 0 ? (
          filteredPrograms.map((program: Program) => {
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

            return (
              <div key={program.id} className="card">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">{program.title}</h3>
                    <p className="text-sm text-gray-500">Category: {getCategoryName(program.category_id)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/programs/${program.slug}`}
                      target="_blank"
                      className="btn-outline text-sm flex items-center gap-2"
                    >
                      <Eye className="w-4 h-4" />
                      View
                    </Link>
                    <button
                      onClick={() => handleDeleteProgram(program.id)}
                      disabled={deleteMutation.isLoading}
                      className="btn-outline text-sm text-red-600 border-red-300 hover:bg-red-50 flex items-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (isEditing) {
                          handleSaveProgram(program.id)
                        } else {
                          setEditingProgram(program.id)
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
                        alt={`${program.title} video`}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Video (takes priority over image)</p>
                  </div>
                )}
                {!videoUrl && imageUrl && !showImageInput && !showVideoInput && (
                  <div className="mb-4">
                    <img
                      src={imageUrl}
                      alt={program.title}
                      className="w-full h-48 object-cover rounded-lg"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                    <p className="text-xs text-gray-500 mt-1">Image</p>
                  </div>
                )}

                {/* Video/Image Upload/URL */}
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
                            onClick={() => handleUrlSubmit(program.id, 'video')}
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
                            onClick={() => handleUrlSubmit(program.id, 'image')}
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
                              className="btn-outline text-xs"
                            >
                              <LinkIcon className="w-3 h-3 mr-1" />
                              Video URL
                            </button>
                          </div>
                          {uploadingItem === program.id && (
                            <div className="mt-2 flex items-center justify-center">
                              <Loader2 className="w-3 h-3 text-primary-600 animate-spin mr-1" />
                              <span className="text-xs text-gray-600">Uploading...</span>
                            </div>
                          )}
                        </div>
                        <div className="border-2 border-dashed rounded-lg p-3 text-center">
                          <ImageIcon className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                          <p className="text-xs text-gray-600 mb-2">Image URL (fallback if no video)</p>
                          <button
                            onClick={() => {
                              setUrlValue(program.image_url || '')
                              setShowUrlInput({ programId: program.id, field: 'image' })
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

                {/* Program Details */}
                <div className="space-y-4 mt-4">
                  {isEditing ? (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                        <select
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
                        <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                        <input
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
                        <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
                        <input
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
                        <label className="block text-sm font-medium text-gray-700 mb-1">Short Description</label>
                        <textarea
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
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <textarea
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
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Impact Text</label>
                        <input
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
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Display Order</label>
                        <input
                          type="number"
                          value={currentData.display_order || 0}
                          onChange={(e) => setProgramData({
                            ...programData,
                            [program.id]: { ...currentData, display_order: parseInt(e.target.value) || 0 }
                          })}
                          className="input-field"
                        />
                      </div>
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          checked={currentData.is_active ?? true}
                          onChange={(e) => setProgramData({
                            ...programData,
                            [program.id]: { ...currentData, is_active: e.target.checked }
                          })}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <label className="ml-2 text-sm text-gray-700">Active</label>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <p className="text-sm text-gray-600"><strong>Category:</strong> {getCategoryName(program.category_id)}</p>
                        <p className="text-sm text-gray-600"><strong>Slug:</strong> {program.slug}</p>
                        {program.short_description && (
                          <p className="text-gray-600 mt-2">{program.short_description}</p>
                        )}
                        {program.description && (
                          <p className="text-gray-600 mt-2">{program.description}</p>
                        )}
                        {program.impact_text && (
                          <div className="mt-3">
                            <span className="inline-block bg-primary-100 text-primary-700 px-3 py-1 rounded-full text-sm font-semibold">
                              {program.impact_text}
                            </span>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )
          })
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500">No programs found{selectedCategory ? ' for this category' : ''}.</p>
          </div>
        )}
      </div>

      {/* Create Program Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Create New Program</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                  <select
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                  <input
                    type="text"
                    value={newProgram.title}
                    onChange={(e) => setNewProgram({ ...newProgram, title: e.target.value })}
                    className="input-field"
                    placeholder="Program title"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Slug *</label>
                  <input
                    type="text"
                    value={newProgram.slug}
                    onChange={(e) => setNewProgram({ ...newProgram, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                    className="input-field"
                    placeholder="program-slug"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Short Description</label>
                  <textarea
                    value={newProgram.short_description}
                    onChange={(e) => setNewProgram({ ...newProgram, short_description: e.target.value })}
                    className="input-field"
                    rows={2}
                    placeholder="Short description"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={newProgram.description}
                    onChange={(e) => setNewProgram({ ...newProgram, description: e.target.value })}
                    className="input-field"
                    rows={4}
                    placeholder="Full description"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
                  <input
                    type="url"
                    value={newProgram.image_url}
                    onChange={(e) => setNewProgram({ ...newProgram, image_url: e.target.value })}
                    className="input-field"
                    placeholder="Image URL"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Impact Text</label>
                  <input
                    type="text"
                    value={newProgram.impact_text}
                    onChange={(e) => setNewProgram({ ...newProgram, impact_text: e.target.value })}
                    className="input-field"
                    placeholder="e.g., 'Helped 1,200+ families'"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Display Order</label>
                  <input
                    type="number"
                    value={newProgram.display_order}
                    onChange={(e) => setNewProgram({ ...newProgram, display_order: parseInt(e.target.value) || 0 })}
                    className="input-field"
                  />
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={newProgram.is_active}
                    onChange={(e) => setNewProgram({ ...newProgram, is_active: e.target.checked })}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <label className="ml-2 text-sm text-gray-700">Active</label>
                </div>
              </div>
              <div className="flex gap-4 mt-6">
                <button
                  onClick={handleCreateProgram}
                  disabled={createMutation.isLoading || !newProgram.category_id || !newProgram.title || !newProgram.slug}
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
                      Create Program
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
