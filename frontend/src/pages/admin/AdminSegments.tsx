import { useEffect, useState } from 'react'
import { Filter, Plus, Edit, Trash2, Eye, Users } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useToast } from '../../contexts/ToastContext'
import { useConfirmation } from '../../hooks/useConfirmation'
import { PageHeader, LoadingBlock, ErrorState, EmptyState, StatusBadge, Modal } from '../../components/admin'

interface Predicate { field: string; op: string; value: any }
type Operator = 'AND' | 'OR'
// Normalise a saved definition (which may be legacy list or new group shape)
// into the group shape used internally by the form.
const normalizeDef = (def: any): { operator: Operator; rules: Predicate[] } => {
  if (Array.isArray(def)) return { operator: 'AND', rules: def as Predicate[] }
  if (def && typeof def === 'object') {
    return {
      operator: def.operator === 'OR' ? 'OR' : 'AND',
      rules: Array.isArray(def.rules) ? (def.rules as Predicate[]) : [],
    }
  }
  return { operator: 'AND', rules: [] }
}
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
interface FieldMeta {
  id: string
  label: string
  type: 'string' | 'number' | 'bool' | 'date' | 'enum'
  hint?: string
  options?: { value: string; label: string }[]
}
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
  const [loadError, setLoadError] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Segment | null>(null)
  const [form, setForm] = useState<{ name: string; description: string; operator: Operator; rules: Predicate[] }>({
    name: '', description: '', operator: 'AND', rules: [],
  })
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [previewSample, setPreviewSample] = useState<any[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)

  const token = useAuthStore((s) => s.token)
  const { showSuccess, showError } = useToast()
  const { confirm, ConfirmationDialog } = useConfirmation()
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  const fetchItems = async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const resp = await fetch(`${API_URL}/api/marketing/segments`, { headers: { Authorization: `Bearer ${token}` } })
      if (resp.ok) setItems(await resp.json())
      else setLoadError(true)
    } catch { setLoadError(true); showError('Error', 'Failed to load audiences') }
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
    setForm({ name: '', description: '', operator: 'AND', rules: [] })
    setEditing(null)
    setShowForm(false)
    setPreviewCount(null)
    setPreviewSample([])
  }

  const openEdit = (s: Segment) => {
    setEditing(s)
    const norm = normalizeDef(s.definition)
    setForm({ name: s.name, description: s.description || '', operator: norm.operator, rules: norm.rules })
    setShowForm(true)
  }

  const getField = (fieldId: string): FieldMeta | undefined => meta?.fields.find((f) => f.id === fieldId)
  const getFieldType = (fieldId: string): FieldMeta['type'] => getField(fieldId)?.type || 'string'
  const opsForField = (fieldId: string): string[] => meta?.ops_by_type[getFieldType(fieldId)] || []

  const addRule = () => {
    if (!meta?.fields[0]) return
    const f = meta.fields[0]
    const op = (meta.ops_by_type[f.type] || ['eq'])[0]
    setForm({ ...form, rules: [...form.rules, { field: f.id, op, value: '' }] })
  }
  const removeRule = (idx: number) => setForm({ ...form, rules: form.rules.filter((_, i) => i !== idx) })
  const updateRule = (idx: number, patch: Partial<Predicate>) => {
    const next = [...form.rules]
    next[idx] = { ...next[idx], ...patch }
    setForm({ ...form, rules: next })
  }

  const runPreview = async () => {
    setPreviewLoading(true)
    try {
      const resp = await fetch(`${API_URL}/api/marketing/segments/preview`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name || 'preview',
          definition: { operator: form.operator, rules: form.rules },
        }),
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
      const body = {
        name: form.name,
        description: form.description,
        definition: { operator: form.operator, rules: form.rules },
      }
      const resp = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (resp.ok) {
        showSuccess('Saved', editing ? 'Audience updated' : 'Audience created')
        resetForm()
        fetchItems()
      } else {
        const err = await resp.json().catch(() => ({ detail: 'Failed' }))
        showError('Error', err.detail || 'Failed to save audience')
      }
    } catch { showError('Error', 'Network error') }
  }

  const handleDelete = async (s: Segment) => {
    const ok = await confirm({
      title: 'Delete audience?',
      message: `"${s.name}" will be removed. Campaigns already sent are not affected.`,
      confirmText: 'Delete',
      variant: 'danger',
    })
    if (!ok) return
    try {
      const resp = await fetch(`${API_URL}/api/marketing/segments/${s.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      if (resp.ok) {
        showSuccess('Deleted', 'Audience removed'); fetchItems()
      } else showError('Error', 'Failed to delete')
    } catch { showError('Error', 'Network error') }
  }

  const newButton = (
    <button onClick={() => { resetForm(); setShowForm(true) }} className="btn-primary gap-2">
      <Plus className="w-4 h-4" aria-hidden="true" /> New audience
    </button>
  )

  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-primary-500'

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audiences"
        icon={Filter}
        count={items.length}
        description="Reusable recipient lists for email campaigns."
        help={
          <p>
            Build rules over donor history, consent status, or any contact attribute. Suppressed addresses and
            people who haven't opted in to email are excluded automatically.
          </p>
        }
        actions={newButton}
      />

      {loadError && <ErrorState message="Could not load audiences." onRetry={fetchItems} />}

      {loading ? (
        <LoadingBlock />
      ) : items.length === 0 ? (
        !loadError && (
          <EmptyState
            icon={Users}
            title="No audiences yet"
            body="Create one to choose who receives a campaign."
            action={newButton}
          />
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((s) => (
            <div key={s.id} className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col">
              <div className="flex items-start justify-between mb-2 gap-2">
                <h2 className="text-base font-semibold text-gray-900 truncate flex-1">{s.name}</h2>
                <StatusBadge tone="info">{s.cached_count ?? '—'} recipients</StatusBadge>
              </div>
              {s.description && <p className="text-sm text-gray-500 mb-2 line-clamp-2">{s.description}</p>}
              <p className="text-xs text-gray-500 mb-3">{normalizeDef(s.definition).rules.length} rules</p>
              <div className="mt-auto flex items-center gap-1 pt-2 border-t border-gray-100">
                <button onClick={() => openEdit(s)} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-primary-50 hover:bg-primary-100 text-primary-700">
                  <Edit className="w-3.5 h-3.5" aria-hidden="true" /> Edit
                </button>
                <button onClick={() => handleDelete(s)} className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Delete" aria-label={`Delete ${s.name}`}>
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && meta && (
        <Modal
          title={editing ? `Edit "${editing.name}"` : 'New audience'}
          onClose={resetForm}
          size="xl"
          footer={
            <>
              <button type="button" onClick={resetForm} className="btn-secondary">Cancel</button>
              <button type="submit" form="segment-form" className="btn-primary">{editing ? 'Save changes' : 'Create audience'}</button>
            </>
          }
        >
          <form id="segment-form" onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="segment-name" className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input id="segment-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="Major donors (≥ $500)" />
              </div>
              <div>
                <label htmlFor="segment-description" className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input id="segment-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="block text-sm font-medium text-gray-700">Rules</span>
                <button type="button" onClick={addRule} className="text-sm text-primary-700 hover:text-primary-900 inline-flex items-center gap-1"><Plus className="w-4 h-4" aria-hidden="true" /> Add rule</button>
              </div>

              {/* Match ALL / Match ANY toggle */}
              <div className="mb-3 inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 text-xs" role="group" aria-label="How rules combine">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, operator: 'AND' })}
                  aria-pressed={form.operator === 'AND'}
                  className={`px-3 py-1.5 rounded font-medium transition-colors ${form.operator === 'AND' ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                  title="Contact must match every rule"
                >
                  Match ALL rules (AND)
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, operator: 'OR' })}
                  aria-pressed={form.operator === 'OR'}
                  className={`px-3 py-1.5 rounded font-medium transition-colors ${form.operator === 'OR' ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                  title="Contact must match at least one rule"
                >
                  Match ANY rule (OR)
                </button>
              </div>

              <div className="space-y-2">
                {form.rules.length === 0 && <p className="text-sm text-gray-500 italic">No rules: the audience is everyone with email consent.</p>}
                {form.rules.map((r, idx) => {
                  const field = getField(r.field)
                  const type = field?.type || 'string'
                  const needsValue = !NO_VALUE_OPS.has(r.op)
                  return (
                    <div key={idx} className="flex flex-wrap items-center gap-2 p-2 border border-gray-200 rounded-lg bg-gray-50">
                      <select aria-label="Field" value={r.field} onChange={(e) => { const nf = e.target.value; const ops = opsForField(nf); updateRule(idx, { field: nf, op: ops[0] || 'eq', value: '' }) }} className="px-2 py-1.5 border border-gray-300 rounded text-sm flex-1 min-w-[10rem]">
                        {meta.fields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                      </select>
                      <select aria-label="Condition" value={r.op} onChange={(e) => updateRule(idx, { op: e.target.value })} className="px-2 py-1.5 border border-gray-300 rounded text-sm">
                        {opsForField(r.field).map((op) => <option key={op} value={op}>{OP_LABEL[op] || op}</option>)}
                      </select>
                      {needsValue && type === 'enum' && field?.options ? (
                        <select
                          aria-label="Value"
                          value={r.value ?? ''}
                          onChange={(e) => updateRule(idx, { value: e.target.value })}
                          className="px-2 py-1.5 border border-gray-300 rounded text-sm flex-1 min-w-[8rem]"
                        >
                          <option value="">— pick —</option>
                          {field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      ) : needsValue && (
                        <input
                          aria-label="Value"
                          type={type === 'number' ? 'number' : (type === 'date' ? 'date' : 'text')}
                          value={r.value ?? ''}
                          onChange={(e) => updateRule(idx, { value: e.target.value })}
                          className="px-2 py-1.5 border border-gray-300 rounded text-sm flex-1 min-w-[8rem]"
                          placeholder="value"
                        />
                      )}
                      <button type="button" onClick={() => removeRule(idx)} className="text-red-500 hover:text-red-700 p-1" title="Remove rule" aria-label="Remove rule">
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-primary-900">Preview</span>
                <button type="button" onClick={runPreview} disabled={previewLoading} className="text-sm inline-flex items-center gap-1 bg-white border border-primary-300 hover:bg-primary-100 text-primary-700 px-3 py-1 rounded"><Eye className="w-4 h-4" aria-hidden="true" />{previewLoading ? 'Running…' : 'Run preview'}</button>
              </div>
              {previewCount !== null && (
                <div>
                  <p className="text-2xl font-bold text-primary-700">{previewCount.toLocaleString()} <span className="text-sm font-normal text-primary-900">recipients match</span></p>
                  {previewSample.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-semibold text-primary-900 uppercase tracking-wide mb-1">Sample</p>
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
          </form>
        </Modal>
      )}

      <ConfirmationDialog />
    </div>
  )
}

export default AdminSegments
