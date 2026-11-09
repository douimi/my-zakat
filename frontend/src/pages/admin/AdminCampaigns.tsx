import { useEffect, useState } from 'react'
import { Megaphone, Plus, Pencil, Trash2, Power, PowerOff, ExternalLink } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useToast } from '../../contexts/ToastContext'
import { useConfirmation } from '../../hooks/useConfirmation'
import { PageHeader, LoadingBlock, ErrorState, EmptyState, StatusBadge, Modal } from '../../components/admin'

interface Campaign {
  id: number
  title: string
  description?: string | null
  image_url?: string | null
  amount: number
  cta_text: string
  redirect_url?: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

type FormState = {
  title: string
  description: string
  image_url: string
  amount: string
  cta_text: string
  redirect_url: string
  is_active: boolean
}

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  image_url: '',
  amount: '',
  cta_text: 'Donate Now',
  redirect_url: '',
  is_active: false,
}

const AdminCampaigns = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const token = useAuthStore((s) => s.token)
  const { showSuccess, showError } = useToast()
  const { confirm, ConfirmationDialog } = useConfirmation()
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  const fetchCampaigns = async () => {
    setLoadError(false)
    try {
      const resp = await fetch(`${API_URL}/api/campaigns/`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (resp.ok) {
        setCampaigns(await resp.json())
      } else {
        setLoadError(true)
        showError('Error', 'Failed to load popups')
      }
    } catch {
      setLoadError(true)
      showError('Error', 'Network error while loading popups')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCampaigns()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openCreate = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  const openEdit = (camp: Campaign) => {
    setEditingId(camp.id)
    setForm({
      title: camp.title,
      description: camp.description || '',
      image_url: camp.image_url || '',
      amount: String(camp.amount ?? ''),
      cta_text: camp.cta_text,
      redirect_url: camp.redirect_url || '',
      is_active: camp.is_active,
    })
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) {
      showError('Validation', 'Title is required')
      return
    }
    const amount = parseFloat(form.amount) || 0
    if (amount < 0) {
      showError('Validation', 'Amount cannot be negative')
      return
    }

    setSaving(true)
    try {
      const body = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        image_url: form.image_url.trim() || null,
        amount,
        cta_text: form.cta_text.trim() || 'Donate Now',
        redirect_url: form.redirect_url.trim() || null,
        is_active: form.is_active,
      }
      const url = editingId
        ? `${API_URL}/api/campaigns/${editingId}`
        : `${API_URL}/api/campaigns/`
      const resp = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      if (resp.ok) {
        showSuccess('Success', editingId ? 'Popup updated' : 'Popup created')
        closeForm()
        fetchCampaigns()
      } else {
        const err = await resp.json().catch(() => ({ detail: 'Failed' }))
        showError('Error', err.detail || 'Failed to save popup')
      }
    } catch {
      showError('Error', 'Network error while saving campaign')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (camp: Campaign) => {
    const url = `${API_URL}/api/campaigns/${camp.id}/${camp.is_active ? 'deactivate' : 'activate'}`
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (resp.ok) {
        showSuccess(
          'Success',
          camp.is_active
            ? 'Popup deactivated'
            : 'Popup activated — any other live popup was turned off',
        )
        fetchCampaigns()
      } else {
        const err = await resp.json().catch(() => ({ detail: 'Failed' }))
        showError('Error', err.detail || 'Failed to toggle popup')
      }
    } catch {
      showError('Error', 'Network error')
    }
  }

  const confirmDelete = async (camp: Campaign) => {
    const ok = await confirm({
      title: 'Delete popup?',
      message: `"${camp.title}"${camp.is_active ? ' (currently live)' : ''} will be permanently deleted. This cannot be undone.`,
      confirmText: 'Delete',
      variant: 'danger',
    })
    if (!ok) return
    try {
      const resp = await fetch(`${API_URL}/api/campaigns/${camp.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (resp.ok) {
        showSuccess('Success', 'Popup deleted')
        fetchCampaigns()
      } else {
        const err = await resp.json().catch(() => ({ detail: 'Failed' }))
        showError('Error', err.detail || 'Failed to delete popup')
      }
    } catch {
      showError('Error', 'Network error while deleting')
    }
  }

  if (loading) return <LoadingBlock />

  const activeCount = campaigns.filter((c) => c.is_active).length

  const newButton = (
    <button onClick={openCreate} className="btn-primary gap-2">
      <Plus className="w-4 h-4" aria-hidden="true" />
      New popup
    </button>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Homepage popups"
        icon={Megaphone}
        count={campaigns.length}
        badge={activeCount > 0 ? <StatusBadge tone="success">{activeCount} live</StatusBadge> : undefined}
        description="One popup can be live at a time; activating one turns off the others."
        actions={newButton}
      />

      {loadError && <ErrorState message="Could not load popups." onRetry={fetchCampaigns} />}

      {campaigns.length === 0 ? (
        !loadError && (
          <EmptyState
            icon={Megaphone}
            title="No popups yet"
            body="For example Eid Al Adha, Ramadan or an emergency appeal."
            action={newButton}
          />
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {campaigns.map((camp) => (
            <div
              key={camp.id}
              className={`bg-white rounded-lg border-2 overflow-hidden flex flex-col ${
                camp.is_active ? 'border-green-400' : 'border-gray-200'
              }`}
            >
              {camp.image_url && (
                <div className="w-full h-36 bg-gray-100 overflow-hidden">
                  <img src={camp.image_url} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="p-4 flex-1 flex flex-col">
                <div className="flex items-start justify-between mb-2 gap-2">
                  <h2 className="font-semibold text-gray-900 text-lg leading-tight">
                    {camp.title}
                  </h2>
                  {camp.is_active ? (
                    <StatusBadge tone="success">● Live</StatusBadge>
                  ) : (
                    <StatusBadge tone="neutral">Inactive</StatusBadge>
                  )}
                </div>
                {camp.description && (
                  <p className="text-sm text-gray-600 mb-3 line-clamp-3">{camp.description}</p>
                )}
                <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                  {camp.amount > 0 && (
                    <span className="font-semibold text-primary-700">
                      ${camp.amount.toLocaleString()}
                    </span>
                  )}
                  <span className="text-xs">{camp.cta_text}</span>
                </div>
                {camp.redirect_url && (
                  <p className="text-xs text-gray-500 mb-3 flex items-center gap-1 break-all">
                    <ExternalLink className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                    {camp.redirect_url}
                  </p>
                )}
                <div className="mt-auto flex items-center gap-2 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => toggleActive(camp)}
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium ${
                      camp.is_active
                        ? 'bg-yellow-100 hover:bg-yellow-200 text-yellow-800'
                        : 'bg-green-100 hover:bg-green-200 text-green-800'
                    }`}
                  >
                    {camp.is_active ? <PowerOff className="w-3.5 h-3.5" aria-hidden="true" /> : <Power className="w-3.5 h-3.5" aria-hidden="true" />}
                    {camp.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    onClick={() => openEdit(camp)}
                    className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded"
                    title="Edit"
                    aria-label={`Edit ${camp.title}`}
                  >
                    <Pencil className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    onClick={() => confirmDelete(camp)}
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                    title="Delete"
                    aria-label={`Delete ${camp.title}`}
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit form */}
      {showForm && (
        <Modal
          title={editingId ? 'Edit popup' : 'New popup'}
          onClose={closeForm}
          footer={
            <>
              <button type="button" onClick={closeForm} className="btn-secondary">Cancel</button>
              <button type="submit" form="popup-form" disabled={saving} className="btn-primary">
                {saving ? 'Saving...' : editingId ? 'Save changes' : 'Create popup'}
              </button>
            </>
          }
        >
          <form id="popup-form" onSubmit={submitForm} className="space-y-4">
            <div>
              <label htmlFor="popup-title" className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
              <input
                id="popup-title"
                type="text"
                required
                maxLength={200}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="input-field"
                placeholder="e.g. Eid Al Adha — Qurban 2026"
              />
            </div>

            <div>
              <label htmlFor="popup-description" className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                id="popup-description"
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="input-field"
                placeholder="Short message shown in the popup body"
              />
            </div>

            <div>
              <label htmlFor="popup-image" className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
              <input
                id="popup-image"
                type="url"
                value={form.image_url}
                onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                className="input-field"
                placeholder="https://... (use the Gallery / S3 browser to copy a URL)"
              />
              {form.image_url && (
                <img src={form.image_url} alt="" className="mt-2 max-h-32 rounded border border-gray-200" />
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="popup-amount" className="block text-sm font-medium text-gray-700 mb-1">Donation amount (USD)</label>
                <input
                  id="popup-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="input-field"
                  placeholder="300"
                />
                <p className="text-xs text-gray-500 mt-1">Pre-fills the donation page. Use 0 to skip.</p>
              </div>
              <div>
                <label htmlFor="popup-cta" className="block text-sm font-medium text-gray-700 mb-1">Button text *</label>
                <input
                  id="popup-cta"
                  type="text"
                  required
                  maxLength={100}
                  value={form.cta_text}
                  onChange={(e) => setForm({ ...form, cta_text: e.target.value })}
                  className="input-field"
                  placeholder="Donate Now"
                />
              </div>
            </div>

            <div>
              <label htmlFor="popup-redirect" className="block text-sm font-medium text-gray-700 mb-1">Custom redirect URL (optional)</label>
              <input
                id="popup-redirect"
                type="text"
                value={form.redirect_url}
                onChange={(e) => setForm({ ...form, redirect_url: e.target.value })}
                className="input-field"
                placeholder="/donate or https://... (defaults to /donate?amount=X&purpose=<title>)"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer pt-2">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                className="w-4 h-4 text-primary-600 rounded"
              />
              <span className="text-sm text-gray-700">
                Make this the live popup (any other live popup is turned off)
              </span>
            </label>
          </form>
        </Modal>
      )}

      <ConfirmationDialog />
    </div>
  )
}

export default AdminCampaigns
