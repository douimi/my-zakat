import { useEffect, useState } from 'react'
import { Filter, Plus, Edit, Trash2, X, Eye, AlertTriangle, Users } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useToast } from '../../contexts/ToastContext'

interface Predicate { field: string; op: string; value: any }
interface Segment {
  id: number
  name: string
  description: string | null
  definition: Predicate[]
  cached_count: number | null
  cached_count_at: string | null
  created_at: string
  updated_at: string
}
interface FieldMeta { id: string; label: string; type: 'string' | 'number' | 'bool' | 'date'; hint?: string }
interface FieldsMeta { fields: FieldMeta[]; ops_by_type: Record<string, string[]> }

const OP_LABEL: Record<string, string> = {
  eq: 'equals', neq: 'not equals',
  gt: 'greater than', gte: 'at least',
  lt: 'less than', lte: 'at most',
  is_true: 'is true', is_false: 'is false',
  is_null: 'is empty', is_not_null: 'is not empty',
  contains: 'contains', in: 'is one of', not_in: 'is not one of',
}

const NO_VALUE_OPS = new Set(['is_true', 'is_false', 'is_null', 'is_not_null'])

const AdminSegments = () => {
  const [items, setItems] = useState<Segment[]>([])
  const [meta, setMeta] = useState<FieldsMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Segment | null>(null)
  const [deleting, setDeleting] = useState<Segment | null>(null)
  const [form, setForm] = useState<{ name: string; description: string; definition: Predicate[] }>({
    name: '', description: '', definition: [],
  })
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [previewSample, setPreviewSample] = useState<any[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)

  const token = useAuthStore((s) => s.token)
  const { showSuccess, showError } = useToast()
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  const fetchItems = async () => {
    setLoading(true)
    try {
      const resp = await fetch(`${API_URL}/api/marketing/segments`, { headers: { Authorization: `Bearer ${token}` } })
      if (resp.ok) setItems(await resp.json())
    } catch { showError('Error', 'Failed to load segments') }
    finally { setLoading(false) }
  }

  const fetchMeta = async () => {
    try {
      const resp = await fetch(`${API_URL}/api/marketing/segments/_meta/fields`, { headers: { Authorization: `Bearer ${token}` } })
      if (resp.ok) setMeta(await resp.json())
    } catch { /* noop */ }
  }

  useEffect(() => { fetchItems(); fetchMeta() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const resetForm = () => {
    setForm({ name: '', description: '', definition: [] })
    setEditing(null)
    setShowForm(false)
    setPreviewCount(null)
    setPreviewSample([])
  }

  const openEdit = (s: Segment) => {
    setEditing(s)
    setForm({ name: s.name, description: s.description || '', definition: s.definition || [] })
    setShowForm(true)
  }

  const getFieldType = (fieldId: string): 'string' | 'number' | 'bool' | 'date' => {
    return meta?.fields.find((f) => f.id === fieldId)?.type || 'string'
  }
  const opsForField = (fieldId: string): string[] => {
    return meta?.ops_by_type[getFieldType(fieldId)] || []
  }

  const addRule = () => {
    if (!meta?.fields[0]) return
    const f = meta.fields[0]
    const op = (meta.ops_by_type[f.type] || ['eq'])[0]
    setForm({ ...form, definition: [...form.definition, { field: f.id, op, value: '' }] })
  }
  const removeRule = (idx: number) => setForm({ ...form, definition: form.definition.filter((_, i) => i !== idx) })
  const updateRule = (idx: number, patch: Partial<Predicate>) => {
    const next = [...form.definition]
    next[idx] = { ...next[idx], ...patch }
    setForm({ ...form, definition: next })
  }

  const runPreview = async () => {
    setPreviewLoading(true)
    try {
      const resp = await fetch(`${API_URL}/api/marketing/segments/preview`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name || 'preview', definition: form.definition }),
      })
      if (resp.ok) {
        const data = await resp.json()
        setPreviewCount(data.count)
        setPreviewSample(data.sample)
      } else {
        const err = await resp.json().catch(() => ({ detail: 'Failed' }))
        showError('Preview failed', err.detail || 'Bad segment definition')
      }
    } catch { showError('Error', 'Network error') }
    finally { setPreviewLoading(false) }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const url = editing ? `${API_URL}/api/marketing/segments/${editing.id}` : `${API_URL}/api/marketing/segments`
    try {
      const resp = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (resp.ok) {
        showSuccess('Saved', editing ? 'Segment updated' : 'Segment created')
        resetForm()
        fetchItems()
      } else {
        const err = await resp.json().catch(() => ({ detail: 'Failed' }))
        showError('Error', err.detail || 'Failed to save segment')
      }
    } catch { showError('Error', 'Network error') }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      const resp = await fetch(`${API_URL}/api/marketing/segments/${deleting.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      if (resp.ok) {
        showSuccess('Deleted', 'Segment removed'); setDeleting(null); fetchItems()
      } else showError('Error', 'Failed to delete')
    } catch { showError('Error', 'Network error') }
  }

  return (
    <div className="space-y-6 px-4 sm:px-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center">
          <Filter className="w-6 h-6 sm:w-8 sm:h-8 mr-2 sm:mr-3 text-emerald-600" />
          Audiences
          <span className="ml-3 text-sm bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{items.length}</span>
        </h1>
        <button onClick={() => { resetForm(); setShowForm(true) }} className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium">
          <Plus className="w-4 h-4" /> New segment
        </button>
      </div>
      <p className="text-sm text-gray-600">
        A segment is a reusable audience filter. Build rules over donor history, consent status, or any contact
        attribute. Suppressed addresses and people who haven't opted in to email are excluded automatically.
      </p>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"/></div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg shadow-sm">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">No segments yet</h3>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((s) => (
            <div key={s.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex flex-col">
              <div className="flex items-start justify-between mb-2 gap-2">
                <h3 className="font-semibold text-gray-900 truncate flex-1">{s.name}</h3>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">{s.cached_count ?? '—'} recipients</span>
              </div>
              {s.description && <p className="text-sm text-gray-500 mb-2 line-clamp-2">{s.description}</p>}
              <p className="text-xs text-gray-400 mb-3">{s.definition?.length || 0} rules</p>
              <div className="mt-auto flex items-center gap-1 pt-2 border-t border-gray-100">
                <button onClick={() => openEdit(s)} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-indigo-50 hover:bg-indigo-100 text-indigo-700"><Edit className="w-3.5 h-3.5" /> Edit</button>
                <button onClick={() => setDeleting(s)} className="p-1.5 text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && meta && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900">{editing ? `Edit "${editing.name}"` : 'New audience segment'}</h3>
              <button onClick={resetForm} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                  <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500" placeholder="Major donors (≥ $500)" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">Rules (joined with AND)</label>
                  <button type="button" onClick={addRule} className="text-sm text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1"><Plus className="w-4 h-4" /> Add rule</button>
                </div>
                <div className="space-y-2">
                  {form.definition.length === 0 && <p className="text-sm text-gray-500 italic">No rules — segment will include everyone with email consent.</p>}
                  {form.definition.map((r, idx) => {
                    const type = getFieldType(r.field)
                    const needsValue = !NO_VALUE_OPS.has(r.op)
                    return (
                      <div key={idx} className="flex items-center gap-2 p-2 border border-gray-200 rounded-lg bg-gray-50">
                        <select value={r.field} onChange={(e) => { const nf = e.target.value; const ops = opsForField(nf); updateRule(idx, { field: nf, op: ops[0] || 'eq' }) }} className="px-2 py-1.5 border border-gray-300 rounded text-sm flex-1">
                          {meta.fields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                        </select>
                        <select value={r.op} onChange={(e) => updateRule(idx, { op: e.target.value })} className="px-2 py-1.5 border border-gray-300 rounded text-sm">
                          {opsForField(r.field).map((op) => <option key={op} value={op}>{OP_LABEL[op] || op}</option>)}
                        </select>
                        {needsValue && (
                          <input
                            type={type === 'number' ? 'number' : (type === 'date' ? 'date' : 'text')}
                            value={r.value ?? ''}
                            onChange={(e) => updateRule(idx, { value: e.target.value })}
                            className="px-2 py-1.5 border border-gray-300 rounded text-sm flex-1"
                            placeholder="value"
                          />
                        )}
                        <button type="button" onClick={() => removeRule(idx)} className="text-red-500 hover:text-red-700 p-1"><X className="w-4 h-4" /></button>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-emerald-900">Preview</span>
                  <button type="button" onClick={runPreview} disabled={previewLoading} className="text-sm inline-flex items-center gap-1 bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-700 px-3 py-1 rounded"><Eye className="w-4 h-4" />{previewLoading ? 'Running…' : 'Run preview'}</button>
                </div>
                {previewCount !== null && (
                  <div>
                    <p className="text-2xl font-bold text-emerald-700">{previewCount.toLocaleString()} <span className="text-sm font-normal text-emerald-900">recipients match</span></p>
                    {previewSample.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-semibold text-emerald-900 uppercase tracking-wide mb-1">Sample</p>
                        <ul className="text-xs text-gray-700 space-y-1">
                          {previewSample.map((r, i) => (
                            <li key={i} className="truncate">
                              <span className="font-medium">{r.name || r.email}</span>
                              <span className="text-gray-500"> · {r.email} · ${r.total_donated?.toFixed(0) || 0} · {r.donation_count || 0} donations</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-gray-200">
                <button type="button" onClick={resetForm} className="px-4 py-2 text-gray-600">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium">{editing ? 'Save changes' : 'Create segment'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleting && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-start mb-4">
              <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mr-3"><AlertTriangle className="w-5 h-5 text-red-600" /></div>
              <div><h3 className="text-lg font-bold text-gray-900">Delete segment?</h3><p className="text-sm text-gray-500 mt-1">{deleting.name}</p></div>
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

export default AdminSegments
