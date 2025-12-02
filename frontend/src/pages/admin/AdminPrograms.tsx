import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Upload, Video, Image as ImageIcon, Save, Link as LinkIcon, X, Loader2, Trash2 } from 'lucide-react'
import { settingsAPI, adminAPI, getStaticFileUrl } from '../../utils/api'
import { useToast } from '../../contexts/ToastContext'
import ConfirmationModal from '../../components/ConfirmationModal'
import { isValidImageUrl, isValidVideoUrl, getImageUrl, getVideoUrl } from '../../utils/mediaHelpers'
import type { Setting } from '../../types'

interface Program {
  id: number
  title: string
  description: string
  image: string
  video: string
  impact: string
}

const AdminPrograms = () => {
  const [showUrlInput, setShowUrlInput] = useState<{ program: number; field: 'image' | 'video' } | null>(null)
  const [urlValue, setUrlValue] = useState('')
  const [uploadingItem, setUploadingItem] = useState<string | null>(null)
  const [programData, setProgramData] = useState<{ [key: number]: { title: string; description: string; impact: string } }>({})
  const [deleteConfirm, setDeleteConfirm] = useState<{ programId: number; programName: string } | null>(null)
  
  const queryClient = useQueryClient()
  const { showSuccess, showError } = useToast()
  
  const { data: settings, isLoading } = useQuery('admin-programs-settings', settingsAPI.getAll)

  const getSettingValue = (key: string): string => {
    return settings?.find((s: Setting) => s.key === key)?.value || ''
  }

  // Initialize program data when settings load
  useEffect(() => {
    if (settings && Object.keys(programData).length === 0) {
      const initialData: { [key: number]: { title: string; description: string; impact: string } } = {}
      for (let i = 1; i <= 3; i++) {
        initialData[i] = {
          title: getSettingValue(`program_title_${i}`),
          description: getSettingValue(`program_description_${i}`),
          impact: getSettingValue(`program_impact_${i}`)
        }
      }
      setProgramData(initialData)
    }
  }, [settings])
  
  const updateMutation = useMutation(
    ({ key, data }: { key: string; data: { value: string; description?: string } }) =>
      settingsAPI.update(key, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('admin-programs-settings')
        queryClient.invalidateQueries('admin-settings')
        queryClient.invalidateQueries('home-media-settings')
        setShowUrlInput(null)
        setUrlValue('')
      },
      onError: (error: any) => {
        showError('Error', error?.response?.data?.detail || 'Failed to update program')
      }
    }
  )

  const uploadMediaMutation = useMutation(
    ({ file, type }: { file: File; type: string }) => adminAPI.uploadMedia(file, type),
    {
      onSuccess: (data, variables) => {
        let description = ''
        if (variables.type.startsWith('program_video_')) {
          const programNum = variables.type.split('_')[2]
          description = `Video for Program ${programNum}`
        } else if (variables.type.startsWith('program_image_')) {
          const programNum = variables.type.split('_')[2]
          description = `Image for Program ${programNum}`
        }
        
        updateMutation.mutate({
          key: variables.type,
          data: {
            value: data.filename,
            description
          }
        })
        setUploadingItem(null)
        showSuccess('Success', 'Media uploaded successfully!')
      },
      onError: (error: any) => {
        setUploadingItem(null)
        showError('Upload Failed', error?.response?.data?.detail || 'Failed to upload media')
      }
    }
  )

  const handleFileUpload = async (itemKey: string, file: File | null) => {
    if (!file) return

    // Only allow video uploads (images must use URLs)
    const isVideo = file.type.startsWith('video/')
    
    if (!isVideo) {
      showError('Invalid File', 'Only video files can be uploaded. Please use URL for images.')
      return
    }

    // Only handle video uploads
    if (!itemKey.startsWith('program_video_')) {
      showError('Invalid Operation', 'Only videos can be uploaded. Please use URL for images.')
      return
    }

    const maxVideoSize = 100 * 1024 * 1024 // 100MB
    
    if (file.size > maxVideoSize) {
      showError('File Too Large', `File must be less than ${maxVideoSize / (1024 * 1024)}MB`)
      return
    }

    setUploadingItem(itemKey)
    uploadMediaMutation.mutate({ file, type: itemKey })
  }

  const programs: Program[] = [
    {
      id: 1,
      title: getSettingValue('program_title_1'),
      description: getSettingValue('program_description_1'),
      image: getSettingValue('program_image_1'),
      video: getSettingValue('program_video_1'),
      impact: getSettingValue('program_impact_1')
    },
    {
      id: 2,
      title: getSettingValue('program_title_2'),
      description: getSettingValue('program_description_2'),
      image: getSettingValue('program_image_2'),
      video: getSettingValue('program_video_2'),
      impact: getSettingValue('program_impact_2')
    },
    {
      id: 3,
      title: getSettingValue('program_title_3'),
      description: getSettingValue('program_description_3'),
      image: getSettingValue('program_image_3'),
      video: getSettingValue('program_video_3'),
      impact: getSettingValue('program_impact_3')
    }
  ]

  const handleSaveProgram = async (programId: number) => {
    const data = programData[programId]
    if (!data) return

    const currentProgram = programs.find(p => p.id === programId)
    if (!currentProgram) return

    const updates: Array<{ key: string; data: { value: string; description: string } }> = []
    
    if (data.title !== undefined && data.title !== currentProgram.title) {
      updates.push({
        key: `program_title_${programId}`,
        data: { value: data.title, description: `Title for Program ${programId}` }
      })
    }
    if (data.description !== undefined && data.description !== currentProgram.description) {
      updates.push({
        key: `program_description_${programId}`,
        data: { value: data.description, description: `Description for Program ${programId}` }
      })
    }
    if (data.impact !== undefined && data.impact !== currentProgram.impact) {
      updates.push({
        key: `program_impact_${programId}`,
        data: { value: data.impact, description: `Impact text for Program ${programId}` }
      })
    }

    if (updates.length === 0) {
      showSuccess('Info', 'No changes to save')
      return
    }

    // Save all updates
    try {
      await Promise.all(updates.map(update => 
        new Promise<void>((resolve, reject) => {
          updateMutation.mutate(update, {
            onSettled: (data, error) => {
              if (error) reject(error)
              else resolve()
            }
          })
        })
      ))
      showSuccess('Success', 'Program updated successfully!')
    } catch (error) {
      showError('Error', 'Failed to update program')
    }
  }

  const handleDeleteProgram = (programId: number) => {
    const program = programs.find(p => p.id === programId)
    const programName = program?.title || `Program ${programId}`
    setDeleteConfirm({ programId, programName })
  }

  const confirmDeleteProgram = async () => {
    if (!deleteConfirm) return
    
    const { programId } = deleteConfirm
    setDeleteConfirm(null)

    // Clear all settings for this program
    const settingsToClear = [
      `program_title_${programId}`,
      `program_description_${programId}`,
      `program_impact_${programId}`,
      `program_image_${programId}`,
      `program_video_${programId}`
    ]

    try {
      await Promise.all(settingsToClear.map(key => 
        new Promise<void>((resolve, reject) => {
          updateMutation.mutate({
            key,
            data: { value: '', description: `Cleared for Program ${programId}` }
          }, {
            onSettled: (data, error) => {
              if (error) reject(error)
              else resolve()
            }
          })
        })
      ))
      
      // Clear the program data from state
      setProgramData(prev => {
        const newData = { ...prev }
        delete newData[programId]
        return newData
      })
      
      showSuccess('Success', `Program ${programId} deleted successfully!`)
    } catch (error) {
      showError('Error', 'Failed to delete program')
    }
  }

  const handleUrlSubmit = (key: string) => {
    if (!urlValue.trim()) return
    
    const isVideoKey = key.startsWith('program_video_')
    const isValid = isVideoKey ? isValidVideoUrl(urlValue) : isValidImageUrl(urlValue)
    if (!isValid) {
      showError('Invalid URL', `Please enter a valid ${isVideoKey ? 'video' : 'image'} URL`)
      return
    }
    
    const description = key.startsWith('program_video_')
      ? `Video for Program ${key.split('_')[2]}`
      : key.startsWith('program_image_')
      ? `Image for Program ${key.split('_')[2]}`
      : ''
    
    updateMutation.mutate({
      key,
      data: {
        value: urlValue.trim(),
        description
      }
    }, {
      onSuccess: () => {
        setShowUrlInput(null)
        setUrlValue('')
      }
    })
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
        <h1 className="text-3xl font-bold text-gray-900">Programs Management</h1>
        <p className="text-gray-600 mt-2">Manage the programs displayed on the homepage</p>
      </div>

      {/* Programs */}
      <div className="mb-12">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">Programs</h2>
          <p className="text-gray-600">Manage the three programs displayed on the homepage</p>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {programs.map((program) => {
            const currentData = programData[program.id] || {
              title: program.title,
              description: program.description,
              impact: program.impact
            }
            const imageUrl = getImageUrl(program.image, 'media/images')
            const videoUrl = getVideoUrl(program.video, 'media/videos')
            const showImageInput = showUrlInput?.program === program.id && showUrlInput?.field === 'image'
            const showVideoInput = showUrlInput?.program === program.id && showUrlInput?.field === 'video'
            const hasMedia = imageUrl || videoUrl

            return (
              <div key={program.id} className="card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-semibold text-gray-900">Program {program.id}</h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDeleteProgram(program.id)}
                      disabled={updateMutation.isLoading}
                      className="btn-outline text-sm text-red-600 border-red-300 hover:bg-red-50 flex items-center gap-2"
                      title="Delete Program"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                    <button
                      onClick={() => handleSaveProgram(program.id)}
                      disabled={updateMutation.isLoading}
                      className="btn-primary flex items-center gap-2"
                      title="Save Changes"
                    >
                      {updateMutation.isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          Save Changes
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Program Media - Video takes priority */}
                {videoUrl && !showVideoInput && !showImageInput && (
                  <div className="mb-4">
                    <video
                      src={videoUrl}
                      controls
                      className="w-full h-48 object-cover rounded-lg"
                      preload="none"
                      playsInline
                      loading="lazy"
                    />
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

                {/* Video Upload/URL */}
                {showVideoInput ? (
                  <div className="mb-4 space-y-3">
                    <input
                      type="url"
                      value={urlValue}
                      onChange={(e) => setUrlValue(e.target.value)}
                      placeholder="Enter video URL"
                      className={`input-field ${!isValidVideoUrl(urlValue) && urlValue ? 'border-red-300' : ''}`}
                    />
                    {!isValidVideoUrl(urlValue) && urlValue && (
                      <p className="text-red-600 text-sm">Please enter a valid video URL</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleUrlSubmit(`program_video_${program.id}`)}
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
                    <input
                      type="url"
                      value={urlValue}
                      onChange={(e) => setUrlValue(e.target.value)}
                      placeholder="Enter image URL"
                      className={`input-field ${!isValidImageUrl(urlValue) && urlValue ? 'border-red-300' : ''}`}
                    />
                    {!isValidImageUrl(urlValue) && urlValue && (
                      <p className="text-red-600 text-sm">Please enter a valid image URL</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleUrlSubmit(`program_image_${program.id}`)}
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
                            onChange={(e) => handleFileUpload(`program_video_${program.id}`, e.target.files?.[0] || null)}
                            className="hidden"
                            disabled={uploadingItem === `program_video_${program.id}`}
                          />
                        </label>
                        <button
                          onClick={() => {
                            setUrlValue(program.video || '')
                            setShowUrlInput({ program: program.id, field: 'video' })
                          }}
                          className="btn-outline text-xs"
                        >
                          <LinkIcon className="w-3 h-3 mr-1" />
                          Video URL
                        </button>
                      </div>
                      {uploadingItem === `program_video_${program.id}` && (
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
                          setUrlValue(program.image || '')
                          setShowUrlInput({ program: program.id, field: 'image' })
                        }}
                        className="btn-outline text-xs w-full"
                      >
                        <LinkIcon className="w-3 h-3 mr-1" />
                        Set Image URL
                      </button>
                    </div>
                  </div>
                )}

                {/* Program Details - Always Editable */}
                <div className="space-y-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                    <input
                      type="text"
                      value={currentData.title}
                      onChange={(e) => setProgramData({
                        ...programData,
                        [program.id]: { ...currentData, title: e.target.value }
                      })}
                      className="input-field"
                      placeholder="Program title (e.g., 'Emergency Relief')"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      value={currentData.description}
                      onChange={(e) => setProgramData({
                        ...programData,
                        [program.id]: { ...currentData, description: e.target.value }
                      })}
                      className="input-field"
                      rows={3}
                      placeholder="Program description (e.g., 'Immediate assistance for families in crisis situations')"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Impact Text</label>
                    <input
                      type="text"
                      value={currentData.impact}
                      onChange={(e) => setProgramData({
                        ...programData,
                        [program.id]: { ...currentData, impact: e.target.value }
                      })}
                      className="input-field"
                      placeholder="Impact text (e.g., 'Helped 1,200+ families this year')"
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={confirmDeleteProgram}
        title="Delete Program"
        message={deleteConfirm ? `Are you sure you want to delete "${deleteConfirm.programName}"? This will remove all program data including title, description, impact text, image, and video.` : ''}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        isLoading={updateMutation.isLoading}
      />
    </div>
  )
}

export default AdminPrograms

