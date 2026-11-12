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
  HeartHandshake, Plus, Edit, Trash2, Save, X, Sparkles, Target,
  Wallet, TrendingUp, ArrowUpCircle, Eye, EyeOff, Loader2,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useToast } from '../../contexts/ToastContext'
import MediaInput from '../../components/MediaInput'
import { useConfirmation } from '../../hooks/useConfirmation'
import { PageHeader, LoadingBlock, ErrorState, EmptyState, StatusBadge } from '../../components/admin'

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
  starts_at?: string | null
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
  starts_at: '',
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
  const [loadError, setLoadError] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [quickAmount, setQuickAmount] = useState<Record<number, string>>({})
  const [busyId, setBusyId] = useState<number | null>(null)

  const token = useAuthStore((s) => s.token)
  const { showSuccess, showError } = useToast()
  const { confirm, ConfirmationDialog } = useConfirmation()
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  const fetchItems = async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const resp = await fetch(`${API_URL}/api/fundraising-projects/admin/list`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (resp.ok) setItems(await resp.json())
      else { setLoadError(true); showError('Error', 'Failed to load projects') }
    } catch { setLoadError(true); showError('Error', 'Network error') }
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
      starts_at: p.starts_at ? p.starts_at.slice(0, 10) : '',
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
        // Only meaningful while upcoming; cleared otherwise so a stale date never shows.
        starts_at: form.status === 'upcoming' && form.starts_at ? new Date(form.starts_at).toISOString() : null,
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

  const handleDelete = async (p: Project) => {
    const ok = await confirm({
      title: 'Delete project?',
      message: `"${p.title}" will be removed from the admin and the homepage.`,
      confirmText: 'Delete',
      variant: 'danger',
    })
    if (!ok) return
    try {
      const resp = await fetch(`${API_URL}/api/fundraising-projects/${p.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (resp.ok) {
        showSuccess('Deleted', 'Project removed')
        fetchItems()
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
        showSuccess('Updated', `Added ${new Intl.NumberFormat('en-US', { style: 'currency', currency: project.currency, maximumFractionDigits: 0 }).format(delta)} to raised`)
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
    <div className="space-y-6">
      <PageHeader
        title="Fundraising projects"
        icon={HeartHandshake}
        count={items.length}
        description="Active projects show on the homepage with a progress bar."
        actions={
          <button onClick={openCreate} className="btn-primary gap-2">
            <Plus className="w-4 h-4" aria-hidden="true" /> New project
          </button>
        }
      />

      {loadError && <ErrorState message="Could not load fundraising projects." onRetry={fetchItems} />}

      {loading ? (
        <LoadingBlock />
      ) : items.length === 0 ? (
        !loadError && (
          <EmptyState
            icon={HeartHandshake}
            title="No projects yet"
            body="Visitors will see your first project on the homepage."
            action={
              <button onClick={openCreate} className="btn-primary gap-2">
                <Plus className="w-4 h-4" aria-hidden="true" /> Create project
              </button>
            }
          />
        )
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {items.map((p) => {
            const busy = busyId === p.id
            const isCompleted = p.progress_percent >= 100 || p.status === 'completed'
            return (
              <div key={p.id} className={`bg-white rounded-lg border p-4 flex flex-col ${p.is_active ? 'border-gray-200' : 'border-dashed border-gray-300 bg-gray-50 opacity-80'}`}>
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-primary-100">
                    {p.image_url && <img src={p.image_url} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h2 className="text-base font-semibold text-gray-900 leading-tight truncate flex-1">{p.title}</h2>
                      {p.status === 'upcoming' && <StatusBadge tone="info">Upcoming{p.starts_at ? ` · ${p.starts_at.slice(0, 10)}` : ''}</StatusBadge>}
                      {p.is_featured && <StatusBadge tone="warning" icon={Sparkles}>Featured</StatusBadge>}
                    </div>
                    <p className="text-xs text-gray-500 truncate">slug: {p.slug} · order: {p.display_order}</p>
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">{p.short_description}</p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden mb-2">
                  <div className={`h-full bg-gradient-to-r ${isCompleted ? 'from-green-500 to-green-600' : 'from-primary-500 to-primary-700'} transition-all duration-500`} style={{ width: `${Math.min(100, p.progress_percent)}%` }} />
                </div>
                <p className="text-xs font-medium text-gray-700 mb-3">{p.progress_percent}% funded</p>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
                  <div className="text-center bg-blue-50 border border-blue-100 rounded p-1.5">
                    <p className="text-blue-900 font-semibold uppercase text-[10px] flex items-center justify-center gap-0.5"><Target className="w-3 h-3" /> Goal</p>
                    <p className="text-blue-900 font-bold text-sm">{fm(p.goal_amount, p.currency)}</p>
                  </div>
                  <div className="text-center bg-emerald-50 border border-emerald-100 rounded p-1.5">
                    <p className="text-emerald-900 font-semibold uppercase text-[10px] flex items-center justify-center gap-0.5"><Wallet className="w-3 h-3" /> Raised</p>
                    <p className="text-emerald-900 font-bold text-sm">{fm(p.spent_amount, p.currency)}</p>
                  </div>
                  <div className={`text-center border rounded p-1.5 ${isCompleted ? 'bg-gray-50 border-gray-200' : 'bg-amber-50 border-amber-100'}`}>
                    <p className={`font-semibold uppercase text-[10px] flex items-center justify-center gap-0.5 ${isCompleted ? 'text-gray-500' : 'text-amber-900'}`}><TrendingUp className="w-3 h-3" /> Needed</p>
                    <p className={`font-bold text-sm ${isCompleted ? 'text-gray-500' : 'text-amber-900'}`}>{fm(p.remaining_amount, p.currency)}</p>
                  </div>
                </div>

                {/* Quick + $ */}
                <div
                  className="flex items-center gap-2 mb-3 bg-emerald-50 border border-emerald-200 rounded-lg p-2"
                  title="Add money raised to this project without opening the edit form"
                >
                  <span className="text-emerald-800 font-semibold text-xs whitespace-nowrap">Quick add raised:</span>
                  <span className="text-emerald-800 font-bold" aria-hidden="true">+ $</span>
                  <input
                    aria-label={`Amount raised to add to ${p.title}`}
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
                  <button onClick={() => openEdit(p)} className="inline-flex items-center gap-1 text-xs bg-primary-50 hover:bg-primary-100 text-primary-700 px-2.5 py-1 rounded"><Edit className="w-3.5 h-3.5" aria-hidden="true" /> Edit</button>
                  <button onClick={() => handleDelete(p)} className="text-red-600 hover:text-red-700 p-1 rounded hover:bg-red-50" title="Delete" aria-label={`Delete ${p.title}`}><Trash2 className="w-4 h-4" aria-hidden="true" /></button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Editor modal. Hand-rolled rather than the shared Modal: MediaInput's
          picker opens on top of it, and the shared Modal's Escape handler would
          also close (and discard) this form. */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div role="dialog" aria-modal="true" aria-labelledby="project-form-title" className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[92vh] overflow-y-auto">
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <h2 id="project-form-title" className="text-lg font-semibold text-gray-900 min-w-0">{editing ? `Edit "${editing.title}"` : 'New fundraising project'}</h2>
                <button type="button" onClick={resetForm} aria-label="Close" className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700"><X className="w-5 h-5" aria-hidden="true" /></button>
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
                    <label className="block text-xs text-gray-600 mb-1">Already raised</label>
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
                    <option value="upcoming">Upcoming (announced, not open yet)</option>
                    <option value="paused">Paused</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
                {form.status === 'upcoming' && (
                  <div>
                    <label htmlFor="project-starts-at" className="block text-sm font-medium text-gray-700 mb-1">Opens for donations on</label>
                    <input id="project-starts-at" type="date" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm" />
                    <p className="text-xs text-gray-500 mt-1">Optional. Shown as “Opens for donations on …”. When nothing is open, upcoming projects appear on the homepage under recently funded ones.</p>
                  </div>
                )}
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
                <button type="button" onClick={resetForm} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {editing ? 'Save changes' : 'Create project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmationDialog />
    </div>
  )
}

export default AdminFundraisingProjects
