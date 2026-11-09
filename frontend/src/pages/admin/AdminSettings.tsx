import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useForm } from 'react-hook-form'
import { Settings as SettingsIcon, Save, Edit } from 'lucide-react'
import { PageHeader, LoadingBlock, Collapsible } from '../../components/admin'
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

  const impactStats = settings?.filter((s: Setting) => 
    ['meals_provided', 'families_supported', 'orphans_cared_for', 'total_raised'].includes(s.key)
  ) || []

  const stickyDonationBarSetting = settings?.find((s: Setting) => s.key === 'sticky_donation_bar_enabled')
  const emergencyBannerSettings = {
    enabled: settings?.find((s: Setting) => s.key === 'emergency_banner_enabled'),
    message: settings?.find((s: Setting) => s.key === 'emergency_banner_message'),
    ctaText: settings?.find((s: Setting) => s.key === 'emergency_banner_cta_text'),
    ctaUrl: settings?.find((s: Setting) => s.key === 'emergency_banner_cta_url'),
  }
  const impactSectionSettings = {
    homeEnabled: settings?.find((s: Setting) => s.key === 'home_impact_enabled'),
    aboutEnabled: settings?.find((s: Setting) => s.key === 'about_impact_enabled'),
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

  const save = (setting: Setting, value: string, fallbackDescription = '') =>
    updateMutation.mutate({
      key: setting.key,
      data: { value, description: setting.description || fallbackDescription },
    })

  if (isLoading) {
    return <LoadingBlock label="Loading settings…" />
  }

  const isOn = (setting?: Setting) => setting?.value === 'true'
  // The impact sections default to shown: only an explicit 'false' hides them.
  const isShown = (setting?: Setting) => !!setting && setting.value !== 'false'
  const onOff = (value: boolean) => (value ? 'On' : 'Off')
  const bannerMessage = emergencyBannerSettings.message?.value || ''
  const bannerPreview = emergencyBannerSettings.enabled
    ? `${onOff(isOn(emergencyBannerSettings.enabled))}${bannerMessage ? ` · "${bannerMessage.slice(0, 60)}${bannerMessage.length > 60 ? '…' : ''}"` : ''}`
    : 'Not set up'

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        icon={SettingsIcon}
        description="Site-wide switches and homepage figures. Changes go live immediately."
      />

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <Collapsible
          title="Impact statistics"
          preview={`${impactStats.length} figures shown in the "Our Impact" section`}
          defaultOpen
        >
          <ul className="divide-y divide-gray-100 -mt-1">
            {impactStats.map((setting: Setting) => (
              <li key={setting.id} className="py-3">
                {editingId === setting.id ? (
                  <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <input type="hidden" {...register('key')} />
                    <p className="text-sm font-semibold text-gray-900">{getDisplayName(setting.key)}</p>
                    <div>
                      <label htmlFor="setting-value" className="label">Value *</label>
                      <input
                        id="setting-value"
                        type="number"
                        {...register('value', { required: true })}
                        className="input-field"
                        placeholder="Enter numeric value"
                      />
                    </div>
                    <div>
                      <label htmlFor="setting-description" className="label">Description</label>
                      <textarea
                        id="setting-description"
                        {...register('description')}
                        rows={2}
                        className="input-field"
                        placeholder="Optional description"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="submit" disabled={updateMutation.isLoading} className="btn-primary btn-sm gap-2">
                        <Save className="w-4 h-4" aria-hidden="true" />
                        {updateMutation.isLoading ? 'Saving…' : 'Save Changes'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEditingId(null); reset() }}
                        className="btn-secondary btn-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-700">{getDisplayName(setting.key)}</p>
                      <p className="text-xl font-bold text-gray-900">
                        {setting.key === 'total_raised' ? `$${parseInt(setting.value).toLocaleString()}` : parseInt(setting.value).toLocaleString()}
                      </p>
                      {setting.description && <p className="text-xs text-gray-500">{setting.description}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleEdit(setting)}
                      className="p-2 rounded-lg text-primary-600 hover:bg-primary-50 hover:text-primary-700"
                      title={`Edit ${getDisplayName(setting.key)}`}
                      aria-label={`Edit ${getDisplayName(setting.key)}`}
                    >
                      <Edit className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Collapsible>

        <Collapsible title="Emergency banner" preview={bannerPreview}>
          {emergencyBannerSettings.enabled && (
            <ToggleRow
              label="Enable Emergency Banner"
              hint="Shown at the top of every page."
              checked={isOn(emergencyBannerSettings.enabled)}
              disabled={updateMutation.isLoading}
              onToggle={() => save(emergencyBannerSettings.enabled!, isOn(emergencyBannerSettings.enabled) ? 'false' : 'true')}
            />
          )}

          {emergencyBannerSettings.message && (
            <div>
              <label htmlFor="banner-message" className="label">Banner Message *</label>
              <textarea
                id="banner-message"
                defaultValue={emergencyBannerSettings.message.value}
                onBlur={(e) => {
                  if (e.target.value !== emergencyBannerSettings.message!.value) save(emergencyBannerSettings.message!, e.target.value)
                }}
                rows={2}
                className="input-field"
                placeholder="Emergency Relief Needed: Support families affected by the crisis."
              />
            </div>
          )}

          {emergencyBannerSettings.ctaText && (
            <div>
              <label htmlFor="banner-cta-text" className="label">Call-to-Action Button Text *</label>
              <input
                id="banner-cta-text"
                type="text"
                defaultValue={emergencyBannerSettings.ctaText.value}
                onBlur={(e) => {
                  if (e.target.value !== emergencyBannerSettings.ctaText!.value) save(emergencyBannerSettings.ctaText!, e.target.value)
                }}
                className="input-field"
                placeholder="Donate Now"
              />
            </div>
          )}

          {emergencyBannerSettings.ctaUrl && (
            <div>
              <label htmlFor="banner-cta-url" className="label">Call-to-Action Link URL *</label>
              <input
                id="banner-cta-url"
                type="text"
                defaultValue={emergencyBannerSettings.ctaUrl.value}
                onBlur={(e) => {
                  if (e.target.value !== emergencyBannerSettings.ctaUrl!.value) save(emergencyBannerSettings.ctaUrl!, e.target.value)
                }}
                className="input-field"
                placeholder="/donate"
              />
              <p className="help-text">For example /donate or /urgent-needs/crisis. Text fields save when you leave them.</p>
            </div>
          )}
        </Collapsible>

        {stickyDonationBarSetting && (
          <Collapsible title="Sticky donation bar" preview={onOff(isOn(stickyDonationBarSetting))}>
            <ToggleRow
              label="Enable Sticky Donation Bar"
              hint="A quick-donate bar along the bottom of every page."
              checked={isOn(stickyDonationBarSetting)}
              disabled={updateMutation.isLoading}
              onToggle={() => save(stickyDonationBarSetting, isOn(stickyDonationBarSetting) ? 'false' : 'true')}
            />
          </Collapsible>
        )}

        <Collapsible
          title={'"Our Impact" section'}
          preview={`Home: ${onOff(isShown(impactSectionSettings.homeEnabled))} · About: ${onOff(isShown(impactSectionSettings.aboutEnabled))}`}
        >
          {([
            ['home', 'Home', impactSectionSettings.homeEnabled],
            ['about', 'About', impactSectionSettings.aboutEnabled],
          ] as const).map(([id, page, setting]) => {
            const description = `Enable/disable Our Impact section on ${page} page`
            return (
              <ToggleRow
                key={id}
                label={`Show Impact Section on ${page} Page`}
                checked={isShown(setting)}
                disabled={updateMutation.isLoading}
                onToggle={() => setting
                  ? save(setting, setting.value === 'false' ? 'true' : 'false', description)
                  // Not stored yet: the first click creates it, switched on.
                  : updateMutation.mutate({ key: `${id}_impact_enabled`, data: { value: 'true', description } })}
              />
            )
          })}
        </Collapsible>
      </div>
    </div>
  )
}

/** On/off switch row. role="switch" so screen readers announce the state. */
const ToggleRow = ({ label, hint, checked, disabled, onToggle }: {
  label: string; hint?: string; checked: boolean; disabled?: boolean; onToggle: () => void
}) => (
  <div className="flex items-center justify-between gap-4 p-3 border border-gray-200 rounded-lg">
    <div className="min-w-0">
      <p className="text-sm font-medium text-gray-900">{label}</p>
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
        checked ? 'bg-primary-600' : 'bg-gray-300'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  </div>
)

export default AdminSettings
