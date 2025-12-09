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
        queryClient.invalidateQueries('header-settings') // Invalidate header settings cache
        setEditingId(null)
        reset()
      }
    }
  )

  const impactSettings = settings?.filter((s: Setting) => 
    ['meals_provided', 'families_supported', 'orphans_cared_for', 'total_raised'].includes(s.key)
  ) || []

  const stickyDonationBarSetting = settings?.find((s: Setting) => s.key === 'sticky_donation_bar_enabled')
  const emergencyBannerSettings = {
    enabled: settings?.find((s: Setting) => s.key === 'emergency_banner_enabled'),
    message: settings?.find((s: Setting) => s.key === 'emergency_banner_message'),
    ctaText: settings?.find((s: Setting) => s.key === 'emergency_banner_cta_text'),
    ctaUrl: settings?.find((s: Setting) => s.key === 'emergency_banner_cta_url'),
  }

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
          <SettingsIcon className="w-6 h-6 sm:w-8 sm:h-8 text-primary-600 mr-2 sm:mr-3" />
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Impact Statistics Settings</h1>
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

      {/* Emergency Banner Settings */}
      <div className="mt-8 card">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">Emergency Banner</h2>
        <p className="text-gray-600 mb-6">
          Configure the emergency banner displayed at the top of all pages
        </p>

        {/* Enable/Disable Toggle */}
        {emergencyBannerSettings.enabled && (
          <div className="mb-6 flex items-center justify-between p-4 border border-gray-200 rounded-lg">
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">Enable Emergency Banner</h3>
              <p className="text-sm text-gray-600">
                Show the emergency banner at the top of all pages
              </p>
            </div>
            <button
              onClick={() => {
                const newValue = emergencyBannerSettings.enabled.value === 'true' ? 'false' : 'true'
                updateMutation.mutate({
                  key: emergencyBannerSettings.enabled.key,
                  data: {
                    value: newValue,
                    description: emergencyBannerSettings.enabled.description || ''
                  }
                })
              }}
              disabled={updateMutation.isLoading}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                emergencyBannerSettings.enabled.value === 'true' ? 'bg-primary-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  emergencyBannerSettings.enabled.value === 'true' ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        )}

        {/* Banner Message */}
        {emergencyBannerSettings.message && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Banner Message *
            </label>
            <textarea
              defaultValue={emergencyBannerSettings.message.value}
              onBlur={(e) => {
                if (e.target.value !== emergencyBannerSettings.message.value) {
                  updateMutation.mutate({
                    key: emergencyBannerSettings.message.key,
                    data: {
                      value: e.target.value,
                      description: emergencyBannerSettings.message.description || ''
                    }
                  })
                }
              }}
              rows={2}
              className="input-field"
              placeholder="Emergency Relief Needed: Support families affected by the crisis."
            />
            <p className="mt-1 text-xs text-gray-500">
              The message displayed in the emergency banner
            </p>
          </div>
        )}

        {/* CTA Text */}
        {emergencyBannerSettings.ctaText && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Call-to-Action Button Text *
            </label>
            <input
              type="text"
              defaultValue={emergencyBannerSettings.ctaText.value}
              onBlur={(e) => {
                if (e.target.value !== emergencyBannerSettings.ctaText.value) {
                  updateMutation.mutate({
                    key: emergencyBannerSettings.ctaText.key,
                    data: {
                      value: e.target.value,
                      description: emergencyBannerSettings.ctaText.description || ''
                    }
                  })
                }
              }}
              className="input-field"
              placeholder="Donate Now"
            />
            <p className="mt-1 text-xs text-gray-500">
              The text displayed on the call-to-action button
            </p>
          </div>
        )}

        {/* CTA URL */}
        {emergencyBannerSettings.ctaUrl && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Call-to-Action Link URL *
            </label>
            <input
              type="text"
              defaultValue={emergencyBannerSettings.ctaUrl.value}
              onBlur={(e) => {
                if (e.target.value !== emergencyBannerSettings.ctaUrl.value) {
                  updateMutation.mutate({
                    key: emergencyBannerSettings.ctaUrl.key,
                    data: {
                      value: e.target.value,
                      description: emergencyBannerSettings.ctaUrl.description || ''
                    }
                  })
                }
              }}
              className="input-field"
              placeholder="/donate"
            />
            <p className="mt-1 text-xs text-gray-500">
              The URL where the button should link (e.g., /donate, /urgent-needs/crisis)
            </p>
          </div>
        )}
      </div>

      {/* Sticky Donation Bar Setting */}
      {stickyDonationBarSetting && (
        <div className="mt-8 card">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Sticky Donation Bar</h2>
          <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">Enable Sticky Donation Bar</h3>
              <p className="text-sm text-gray-600">
                Show a sticky donation bar at the bottom of the page for quick donations
              </p>
            </div>
            <button
              onClick={() => {
                const newValue = stickyDonationBarSetting.value === 'true' ? 'false' : 'true'
                updateMutation.mutate({
                  key: stickyDonationBarSetting.key,
                  data: {
                    value: newValue,
                    description: stickyDonationBarSetting.description || ''
                  }
                })
              }}
              disabled={updateMutation.isLoading}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                stickyDonationBarSetting.value === 'true' ? 'bg-primary-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  stickyDonationBarSetting.value === 'true' ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      )}

      {/* Help Text */}
      <div className="mt-8 card bg-blue-50 border-blue-200">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">How it works</h3>
        <ul className="text-blue-800 space-y-1 text-sm">
          <li>• These statistics are displayed on your homepage to show impact</li>
          <li>• Values should be updated regularly to reflect your organization's current impact</li>
          <li>• The "Total Raised" value is displayed in the impact statistics section</li>
          <li>• Changes take effect immediately on the frontend</li>
          <li>• The sticky donation bar appears at the bottom of all pages when enabled</li>
        </ul>
      </div>
    </div>
  )
}

export default AdminSettings
