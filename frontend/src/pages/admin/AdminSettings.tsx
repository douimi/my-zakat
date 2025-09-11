import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useForm } from 'react-hook-form'
import { Settings as SettingsIcon, Save, Edit, Trash2 } from 'lucide-react'
import { settingsAPI } from '../../utils/api'
import type { Setting } from '../../types'

interface SettingForm {
  key: string
  value: string
  description: string
}

const AdminSettings = () => {
  const [editingId, setEditingId] = useState<number | null>(null)
  const queryClient = useQueryClient()
  
  const { data: settings, isLoading } = useQuery('admin-settings', settingsAPI.getAll)
  
  const { register, handleSubmit, reset, setValue } = useForm<SettingForm>()
  
  const updateMutation = useMutation(
    ({ key, data }: { key: string; data: { value: string; description?: string } }) =>
      settingsAPI.update(key, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('admin-settings')
        setEditingId(null)
        reset()
      }
    }
  )

  const impactSettings = settings?.filter((s: Setting) => 
    ['meals_provided', 'families_supported', 'orphans_cared_for', 'total_raised'].includes(s.key)
  ) || []

  const handleEdit = (setting: Setting) => {
    setEditingId(setting.id)
    setValue('key', setting.key)
    setValue('value', setting.value)
    setValue('description', setting.description || '')
  }

  const onSubmit = (data: SettingForm) => {
    if (editingId) {
      updateMutation.mutate({
        key: data.key,
        data: {
          value: data.value,
          description: data.description
        }
      })
    }
  }

  const getDisplayName = (key: string) => {
    const names: Record<string, string> = {
      'meals_provided': 'Meals Provided',
      'families_supported': 'Families Supported',
      'orphans_cared_for': 'Orphans Cared For',
      'total_raised': 'Total Raised ($)'
    }
    return names[key] || key
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="section-container">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="section-container">
      <div className="mb-8">
        <div className="flex items-center mb-4">
          <SettingsIcon className="w-8 h-8 text-primary-600 mr-3" />
          <h1 className="text-3xl font-bold text-gray-900">Impact Statistics Settings</h1>
        </div>
        <p className="text-gray-600">
          Manage the impact statistics displayed on your homepage
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Settings List */}
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Current Statistics</h2>
          <div className="space-y-4">
            {impactSettings.map((setting: Setting) => (
              <div key={setting.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-900">
                    {getDisplayName(setting.key)}
                  </h3>
                  <button
                    onClick={() => handleEdit(setting)}
                    className="text-primary-600 hover:text-primary-700"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                </div>
                <div className="text-2xl font-bold text-primary-600 mb-2">
                  {setting.key === 'total_raised' ? `$${parseInt(setting.value).toLocaleString()}` : parseInt(setting.value).toLocaleString()}
                </div>
                {setting.description && (
                  <p className="text-sm text-gray-600">{setting.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Edit Form */}
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">
            {editingId ? 'Edit Setting' : 'Select a setting to edit'}
          </h2>
          
          {editingId ? (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Setting Name
                </label>
                <input
                  {...register('key')}
                  className="input-field bg-gray-100"
                  disabled
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Value *
                </label>
                <input
                  type="number"
                  {...register('value', { required: true })}
                  className="input-field"
                  placeholder="Enter numeric value"
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
                  placeholder="Optional description"
                />
              </div>

              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={updateMutation.isLoading}
                  className="btn-primary flex items-center"
                >
                  {updateMutation.isLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </button>
                
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null)
                    reset()
                  }}
                  className="btn-outline"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <SettingsIcon className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p>Click the edit icon next to any setting to modify its value</p>
            </div>
          )}
        </div>
      </div>

      {/* Help Text */}
      <div className="mt-8 card bg-blue-50 border-blue-200">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">How it works</h3>
        <ul className="text-blue-800 space-y-1 text-sm">
          <li>• These statistics are displayed on your homepage to show impact</li>
          <li>• Values should be updated regularly to reflect your organization's current impact</li>
          <li>• The "Total Raised" value is displayed in the impact statistics section</li>
          <li>• Changes take effect immediately on the frontend</li>
        </ul>
      </div>
    </div>
  )
}

export default AdminSettings
