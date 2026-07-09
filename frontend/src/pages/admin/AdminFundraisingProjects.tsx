/**
 * Admin CRUD for fundraising projects.
 *
 * The card list is designed for the common workflow: "I raised more money for
 * project X, let me bump the spent amount." The inline "+$…" quick-add button
 * hits the `/adjust-spent` endpoint with a delta and refreshes without opening
 * the full edit form. Full edit is one click away for everything else.
 */
import { useEffect, useState } from 'react'
import {
  HeartHandshake, Plus, Edit, Trash2, Save, X, AlertTriangle, Sparkles, Target,
  Wallet, TrendingUp, ArrowUpCircle, Eye, EyeOff, Loader2,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useToast } from '../../contexts/ToastContext'
import MediaInput from '../../components/MediaInput'

interface Project {
  id: number
  title: string
  slug: string
  short_description: string
  description: string | null
  image_url: string | null
  goal_amount: number
  spent_amount: number
  remaining_amount: number
  progress_percent: number
  currency: string
  suggested_donation: number | null
  deadline: string | null
  status: string
  display_order: number
  is_active: boolean
  is_featured: boolean
  category: string | null
}

const EMPTY_FORM = {
  title: '',
  slug: '',
  short_description: '',
  description: '',
  image_url: '',
  goal_amount: '',
  spent_amount: '0',
  currency: 'USD',
  suggested_donation: '',
  deadline: '',
  status: 'active',
  display_order: '0',
  is_active: true,
  is_featured: false,
  category: '',
}

const slugify = (v: string) =>
  v.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

const AdminFundraisingProjects = () => {
  const [items, setItems] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)
  const [deleting, setDeleting] = useState<Project | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [quickAmount, setQuickAmount] = useState<Record<number, string>>({})
  const [busyId, setBusyId] = useState<number | null>(null)

  const token = useAuthStore((s) => s.token)
  const { showSuccess, showError } = useToast()
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  const fetchItems = async () => {
    setLoading(true)
    try {
      const resp = await fetch(`${API_URL}/api/fundraising-projects/admin/list`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (resp.ok) setItems(await resp.json())
      else showError('Error', 'Failed to load projects')
    } catch { showError('Error', 'Network error') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchItems() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const resetForm = () => { setForm({ ...EMPTY_FORM }); setEditing(null); setShowForm(false) }

  const openCreate = () => { resetForm(); setShowForm(true) }
  const openEdit = (p: Project) => {
    setEditing(p)
    setForm({
      title: p.title,
      slug: p.slug,
      short_description: p.short_description,
      description: p.description || '',
      image_url: p.image_url || '',
      goal_amount: String(p.goal_amount),
      spent_amount: String(p.spent_amount),
      currency: p.currency,
      suggested_donation: p.suggested_donation ? String(p.suggested_donation) : '',
      deadline: p.deadline ? p.deadline.slice(0, 10) : '',
      status: p.status,
      display_order: String(p.display_order),
      is_active: p.is_active,
      is_featured: p.is_featured,
      category: p.category || '',
    })
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim() || !form.short_description.trim() || !form.goal_amount) {
      showError('Missing fields', 'Title, short description, and goal amount are required')
      return
    }
    setSaving(true)
    try {
      const body: any = {
        title: form.title.trim(),
        slug: (form.slug || slugify(form.title)).trim() || slugify(form.title),
        short_description: form.short_description.trim(),
        description: form.description.trim() || null,
        image_url: form.image_url.trim() || null,
        goal_amount: parseFloat(form.goal_amount),
        spent_amount: parseFloat(form.spent_amount) || 0,
        currency: form.currency.toUpperCase() || 'USD',
        suggested_donation: form.suggested_donation ? parseFloat(form.suggested_donation) : null,
        deadline: form.deadline ? new Date(form.deadline).toISOString() : null,
        status: form.status,
        display_order: parseInt(form.display_order) || 0,
        is_active: form.is_active,
        is_featured: form.is_featured,
        category: form.category.trim() || null,
      }
      const url = editing
        ? `${API_URL}/api/fundraising-projects/${editing.id}`
        : `${API_URL}/api/fundraising-projects/`
      const resp = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (resp.ok) {
        showSuccess('Saved', editing ? 'Project updated' : 'Project created')
        resetForm(); fetchItems()
      } else {
        const err = await resp.json().catch(() => ({ detail: 'Failed' }))
        showError('Error', err.detail || 'Failed to save project')
      }
    } catch { showError('Error', 'Network error') }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      const resp = await fetch(`${API_URL}/api/fundraising-projects/${deleting.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (resp.ok) {
        showSuccess('Deleted', 'Project removed')
        setDeleting(null); fetchItems()
      } else showError('Error', 'Failed to delete')
    } catch { showError('Error', 'Network error') }
  }

  const handleQuickAdd = async (project: Project) => {
    const raw = quickAmount[project.id]
    const delta = parseFloat(raw || '0')
    if (!delta || delta <= 0) return
    setBusyId(project.id)
    try {
      const resp = await fetch(`${API_URL}/api/fundraising-projects/${project.id}/adjust-spent`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta_amount: delta }),
      })
      if (resp.ok) {
        showSuccess('Updated', `Added ${new Intl.NumberFormat('en-US', { style: 'currency', currency: project.currency, maximumFractionDigits: 0 }).format(delta)} to spent`)
        setQuickAmount((s) => ({ ...s, [project.id]: '' }))
        fetchItems()
      } else showError('Error', 'Failed to adjust')
    } catch { showError('Error', 'Network error') }
    finally { setBusyId(null) }
  }

  const toggleActive = async (project: Project) => {
    setBusyId(project.id)
    try {
      const resp = await fetch(`${API_URL}/api/fundraising-projects/${project.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !project.is_active }),
      })
      if (resp.ok) { showSuccess('Updated', project.is_active ? 'Hidden from homepage' : 'Now visible on homepage'); fetchItems() }
      else showError('Error', 'Failed to toggle')
    } catch { showError('Error', 'Network error') }
    finally { setBusyId(null) }
  }

  const fm = (v: number, currency: string) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: v < 100 ? 2 : 0 }).format(v)

  return (
    <div className="space-y-6 px-4 sm:px-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center">
          <HeartHandshake className="w-6 h-6 sm:w-8 sm:h-8 mr-2 sm:mr-3 text-primary-600" />
          Fundraising Projects
          <span className="ml-3 text-sm bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{items.length}</span>
        </h1>
        <button onClick={openCreate} className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium">
          <Plus className="w-4 h-4" /> New project
        </button>
      </div>
      <p className="text-sm text-gray-600">
        Active projects appear on the homepage with an animated progress bar and a Donate button that
        pre-fills the donation form. Use the quick <strong>+ $</strong> box on each card to bump the
        spent amount without opening the edit form.
      </p>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg shadow-sm">
          <HeartHandshake className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">No projects yet</h3>
          <p className="text-gray-500 mt-1 mb-4">Create your first project — visitors will see it on the homepage.</p>
          <button onClick={openCreate} className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-lg font-medium">
            <Plus className="w-4 h-4" /> Create project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {items.map((p) => {
            const busy = busyId === p.id
            const isCompleted = p.progress_percent >= 100 || p.status === 'completed'
            return (
              <div key={p.id} className={`bg-white rounded-lg shadow-sm border p-4 flex flex-col ${p.is_active ? 'border-gray-200' : 'border-dashed border-gray-300 bg-gray-50 opacity-80'}`}>
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-gradient-to-br from-primary-500 to-blue-600">
                    {p.image_url && <img src={p.image_url} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900 leading-tight truncate flex-1">{p.title}</h3>
                      {p.is_featured && <span className="bg-amber-100 text-amber-800 text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full inline-flex items-center gap-1"><Sparkles className="w-2.5 h-2.5" /> Featured</span>}
                    </div>
                    <p className="text-xs text-gray-500 truncate">slug: {p.slug} · order: {p.display_order}</p>
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">{p.short_description}</p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden mb-2">
                  <div className={`h-full bg-gradient-to-r ${isCompleted ? 'from-green-500 to-green-600' : 'from-primary-500 to-blue-600'} transition-all duration-500`} style={{ width: `${Math.min(100, p.progress_percent)}%` }} />
                </div>
                <p className="text-xs font-medium text-gray-700 mb-3">{p.progress_percent}% funded</p>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
                  <div className="text-center bg-blue-50 border border-blue-100 rounded p-1.5">
                    <p className="text-blue-900 font-semibold uppercase text-[10px] flex items-center justify-center gap-0.5"><Target className="w-3 h-3" /> Goal</p>
                    <p className="text-blue-900 font-bold text-sm">{fm(p.goal_amount, p.currency)}</p>
                  </div>
                  <div className="text-center bg-emerald-50 border border-emerald-100 rounded p-1.5">
                    <p className="text-emerald-900 font-semibold uppercase text-[10px] flex items-center justify-center gap-0.5"><Wallet className="w-3 h-3" /> Spent</p>
                    <p className="text-emerald-900 font-bold text-sm">{fm(p.spent_amount, p.currency)}</p>
                  </div>
                  <div className={`text-center border rounded p-1.5 ${isCompleted ? 'bg-gray-50 border-gray-200' : 'bg-amber-50 border-amber-100'}`}>
                    <p className={`font-semibold uppercase text-[10px] flex items-center justify-center gap-0.5 ${isCompleted ? 'text-gray-500' : 'text-amber-900'}`}><TrendingUp className="w-3 h-3" /> Needed</p>
                    <p className={`font-bold text-sm ${isCompleted ? 'text-gray-500' : 'text-amber-900'}`}>{fm(p.remaining_amount, p.currency)}</p>
                  </div>
                </div>

                {/* Quick + $ */}
                <div className="flex items-center gap-2 mb-3 bg-emerald-50 border border-emerald-200 rounded-lg p-2">
                  <span className="text-emerald-800 font-semibold text-xs whitespace-nowrap">Quick add spent:</span>
                  <span className="text-emerald-800 font-bold">+ $</span>
                  <input
                    type="number" min="1" step="1"
                    value={quickAmount[p.id] || ''}
                    onChange={(e) => setQuickAmount((s) => ({ ...s, [p.id]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleQuickAdd(p) } }}
                    placeholder="0"
                    className="flex-1 px-2 py-1 border border-emerald-300 rounded text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 max-w-[100px]"
                  />
                  <button onClick={() => handleQuickAdd(p)} disabled={busy || !quickAmount[p.id]} className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white px-3 py-1 rounded text-sm font-medium">
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowUpCircle className="w-3.5 h-3.5" />} Add
                  </button>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                  <button onClick={() => toggleActive(p)} disabled={busy} className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded ${p.is_active ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`} title={p.is_active ? 'Hide from homepage' : 'Show on homepage'}>
                    {p.is_active ? <><Eye className="w-3.5 h-3.5" /> Live</> : <><EyeOff className="w-3.5 h-3.5" /> Hidden</>}
                  </button>
                  <span className="flex-1" />
                  <button onClick={() => openEdit(p)} className="inline-flex items-center gap-1 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded"><Edit className="w-3.5 h-3.5" /> Edit</button>
                  <button onClick={() => setDeleting(p)} className="text-red-600 hover:text-red-700 p-1 rounded hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Editor modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[92vh] overflow-y-auto">
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-900">{editing ? `Edit "${editing.title}"` : 'New fundraising project'}</h3>
                <button type="button" onClick={resetForm} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                  <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value, slug: form.slug || slugify(e.target.value) })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" placeholder="Feed a family of five for Ramadan" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Slug (URL-safe)</label>
                  <input value={form.slug} onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 font-mono text-sm" placeholder="auto-filled from title" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Short description *</label>
                  <textarea required rows={2} value={form.short_description} onChange={(e) => setForm({ ...form, short_description: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" placeholder="One or two lines shown on the card" />
                </div>
                <div className="sm:col-span-2">
                  <MediaInput value={form.image_url} onChange={(url) => setForm({ ...form, image_url: url })} type="images" label="Image" placeholder="Pick a hero image from S3 or paste a URL" />
                </div>
              </div>

              {/* Money — spotlight section */}
              <div className="bg-primary-50 border border-primary-200 rounded-lg p-4 space-y-3">
                <p className="text-xs font-semibold uppercase text-primary-800 tracking-wider">Funding</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Goal *</label>
                    <div className="flex">
                      <span className="inline-flex items-center px-2.5 bg-white border border-r-0 border-gray-300 rounded-l text-sm text-gray-500">$</span>
                      <input required type="number" min="1" step="1" value={form.goal_amount} onChange={(e) => setForm({ ...form, goal_amount: e.target.value })} className="w-full px-2 py-1.5 border border-gray-300 rounded-r focus:ring-2 focus:ring-primary-500" placeholder="220" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Already spent</label>
                    <div className="flex">
                      <span className="inline-flex items-center px-2.5 bg-white border border-r-0 border-gray-300 rounded-l text-sm text-gray-500">$</span>
                      <input type="number" min="0" step="1" value={form.spent_amount} onChange={(e) => setForm({ ...form, spent_amount: e.target.value })} className="w-full px-2 py-1.5 border border-gray-300 rounded-r focus:ring-2 focus:ring-primary-500" placeholder="20" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Currency</label>
                    <input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} maxLength={3} className="w-full px-2 py-1.5 border border-gray-300 rounded uppercase font-mono" placeholder="USD" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Suggested donation amount <span className="text-gray-400">(optional; pre-fills the Donate form)</span></label>
                  <div className="flex max-w-[180px]">
                    <span className="inline-flex items-center px-2.5 bg-white border border-r-0 border-gray-300 rounded-l text-sm text-gray-500">$</span>
                    <input type="number" min="1" step="1" value={form.suggested_donation} onChange={(e) => setForm({ ...form, suggested_donation: e.target.value })} className="w-full px-2 py-1.5 border border-gray-300 rounded-r focus:ring-2 focus:ring-primary-500" placeholder="25" />
                  </div>
                </div>
              </div>

              {/* Meta */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Deadline</label>
                  <input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm">
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Display order</label>
                  <input type="number" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm" placeholder="0" />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm" placeholder="Emergency Relief · Orphans · Education …" />
                </div>
              </div>

              <div className="flex flex-wrap gap-4">
                <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                  <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="rounded" />
                  Show on homepage
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                  <input type="checkbox" checked={form.is_featured} onChange={(e) => setForm({ ...form, is_featured: e.target.checked })} className="rounded" />
                  Featured <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button type="button" onClick={resetForm} className="px-4 py-2 text-gray-600">Cancel</button>
                <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white rounded-lg font-medium">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {editing ? 'Save changes' : 'Create project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleting && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-start mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mr-3 flex-shrink-0"><AlertTriangle className="w-5 h-5 text-red-600" /></div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Delete project?</h3>
                <p className="text-sm text-gray-500 mt-1">{deleting.title}</p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleting(null)} className="px-4 py-2 text-gray-600">Cancel</button>
              <button onClick={handleDelete} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminFundraisingProjects
