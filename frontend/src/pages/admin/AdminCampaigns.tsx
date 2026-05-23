import { useEffect, useState } from 'react'
import { Megaphone, Plus, Pencil, Trash2, X, Power, PowerOff, ExternalLink, AlertTriangle } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useToast } from '../../contexts/ToastContext'

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
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null)
  const [deleting, setDeleting] = useState(false)

  const token = useAuthStore((s) => s.token)
  const { showSuccess, showError } = useToast()
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  const fetchCampaigns = async () => {
    try {
      const resp = await fetch(`${API_URL}/api/campaigns/`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (resp.ok) {
        setCampaigns(await resp.json())
      } else {
        showError('Error', 'Failed to load campaigns')
      }
    } catch {
      showError('Error', 'Network error while loading campaigns')
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
        showSuccess('Success', editingId ? 'Campaign updated' : 'Campaign created')
        closeForm()
        fetchCampaigns()
      } else {
        const err = await resp.json().catch(() => ({ detail: 'Failed' }))
        showError('Error', err.detail || 'Failed to save campaign')
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
            ? 'Campaign deactivated'
            : 'Campaign activated — any other active campaign was turned off',
        )
        fetchCampaigns()
      } else {
        const err = await resp.json().catch(() => ({ detail: 'Failed' }))
        showError('Error', err.detail || 'Failed to toggle campaign')
      }
    } catch {
      showError('Error', 'Network error')
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const resp = await fetch(`${API_URL}/api/campaigns/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (resp.ok) {
        showSuccess('Success', 'Campaign deleted')
        setDeleteTarget(null)
        fetchCampaigns()
      } else {
        const err = await resp.json().catch(() => ({ detail: 'Failed' }))
        showError('Error', err.detail || 'Failed to delete campaign')
      }
    } catch {
      showError('Error', 'Network error while deleting')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  const activeCount = campaigns.filter((c) => c.is_active).length

  return (
    <div className="space-y-6 px-4 sm:px-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center">
          <Megaphone className="w-6 h-6 sm:w-8 sm:h-8 mr-2 sm:mr-3 text-purple-600" />
          Campaigns
          <span className="ml-3 text-sm bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
            {campaigns.length}
          </span>
          {activeCount > 0 && (
            <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-semibold">
              {activeCount} live
            </span>
          )}
        </h1>
        <button
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          <Plus className="w-5 h-5" />
          New Campaign
        </button>
      </div>

      <p className="text-sm text-gray-600">
        Only <strong>one campaign</strong> can be active at a time. When you activate a new one,
        any currently active campaign is automatically turned off. The active campaign appears
        as a centered popup on the homepage for visitors.
      </p>

      {/* Campaigns list */}
      {campaigns.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg shadow-sm">
          <Megaphone className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No campaigns yet</h3>
          <p className="text-gray-500 mb-4">Create your first campaign — e.g. Eid Al Adha, Ramadan, Emergency Relief.</p>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium"
          >
            <Plus className="w-5 h-5" />
            New Campaign
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {campaigns.map((camp) => (
            <div
              key={camp.id}
              className={`bg-white rounded-lg shadow-sm border-2 overflow-hidden flex flex-col ${
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
                  <h3 className="font-semibold text-gray-900 text-lg leading-tight">
                    {camp.title}
                  </h3>
                  {camp.is_active ? (
                    <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full font-semibold whitespace-nowrap">
                      ● Live
                    </span>
                  ) : (
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full whitespace-nowrap">
                      Inactive
                    </span>
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
                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
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
                    {camp.is_active ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                    {camp.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    onClick={() => openEdit(camp)}
                    className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded"
                    title="Edit"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(camp)}
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <form onSubmit={submitForm} className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900 flex items-center">
                  <Megaphone className="w-5 h-5 mr-2 text-purple-600" />
                  {editingId ? 'Edit Campaign' : 'New Campaign'}
                </h3>
                <button type="button" onClick={closeForm} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                  <input
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    rows={3}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="input-field"
                    placeholder="Short message shown in the popup body"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
                  <input
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Donation amount (USD)</label>
                    <input
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Button text *</label>
                    <input
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Custom redirect URL (optional)</label>
                  <input
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
                    className="w-4 h-4 text-green-600 rounded"
                  />
                  <span className="text-sm text-gray-700">
                    Make this the active campaign (any other active campaign will be turned off)
                  </span>
                </label>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={closeForm}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg font-medium"
                >
                  {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Campaign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-start mb-4">
              <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mr-3">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Delete Campaign</h3>
                <p className="text-sm text-gray-500 mt-1">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-gray-700 mb-6">
              You are about to permanently delete <strong>{deleteTarget.title}</strong>
              {deleteTarget.is_active && ' (currently live)'}.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-medium inline-flex items-center"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminCampaigns
