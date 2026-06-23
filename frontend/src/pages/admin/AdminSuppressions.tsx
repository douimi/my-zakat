import { useEffect, useState } from 'react'
import { ShieldOff, Plus, Search, Trash2, AlertTriangle, X } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useToast } from '../../contexts/ToastContext'

interface SuppressionRow {
  id: number
  email: string
  scope: string
  reason: string
  source_message_id: string | null
  note: string | null
  created_at: string
}

const REASON_LABEL: Record<string, string> = {
  hard_bounce:  'Hard bounce',
  complaint:    'Spam complaint',
  unsubscribe:  'Unsubscribed',
  manual:       'Manual',
  gdpr_erasure: 'GDPR erasure',
}

const AdminSuppressions = () => {
  const [rows, setRows] = useState<SuppressionRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newForm, setNewForm] = useState({ email: '', scope: 'all', reason: 'manual', note: '' })
  const [deleting, setDeleting] = useState<SuppressionRow | null>(null)

  const token = useAuthStore((s) => s.token)
  const { showSuccess, showError } = useToast()
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  const fetchRows = async () => {
    setLoading(true)
    try {
      const qs = search ? `?q=${encodeURIComponent(search)}` : ''
      const resp = await fetch(`${API_URL}/api/marketing/suppressions${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) throw new Error('fetch failed')
      const data = await resp.json()
      setRows(data.items || [])
      setTotal(data.total || 0)
    } catch {
      showError('Error', 'Failed to load suppressions')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchRows() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const resp = await fetch(`${API_URL}/api/marketing/suppressions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(newForm),
      })
      if (resp.ok) {
        showSuccess('Suppressed', `${newForm.email} added to suppression list`)
        setShowAdd(false)
        setNewForm({ email: '', scope: 'all', reason: 'manual', note: '' })
        fetchRows()
      } else {
        const err = await resp.json().catch(() => ({ detail: 'Failed' }))
        showError('Error', err.detail || 'Failed to add suppression')
      }
    } catch {
      showError('Error', 'Network error')
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      const resp = await fetch(
        `${API_URL}/api/marketing/suppressions/${encodeURIComponent(deleting.email)}?scope=${encodeURIComponent(deleting.scope)}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
      )
      if (resp.ok) {
        showSuccess('Removed', `${deleting.email} removed from suppression list`)
        setDeleting(null)
        fetchRows()
      } else {
        showError('Error', 'Failed to remove suppression')
      }
    } catch {
      showError('Error', 'Network error')
    }
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })

  return (
    <div className="space-y-6 px-4 sm:px-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center">
          <ShieldOff className="w-6 h-6 sm:w-8 sm:h-8 mr-2 sm:mr-3 text-red-600" />
          Suppressions
          <span className="ml-3 text-sm bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{total}</span>
        </h1>
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium"
        >
          <Plus className="w-4 h-4" />
          Add to suppression list
        </button>
      </div>

      <p className="text-sm text-gray-600">
        Addresses on this list are never sent to. Hard bounces and spam complaints are added automatically
        by the Resend webhook; admin can add or remove entries manually.
      </p>

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
        <div className="relative max-w-sm">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchRows()}
            placeholder="Search by email..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500"
          />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Scope</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Note</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">Created</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 break-all">{r.email}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{r.scope}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{REASON_LABEL[r.reason] || r.reason}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">{r.note || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-600 hidden lg:table-cell whitespace-nowrap">{formatDate(r.created_at)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setDeleting(r)}
                      className="text-red-600 hover:text-red-800 p-1.5 rounded hover:bg-red-50"
                      title="Remove from suppression list"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-500">No suppressions.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <form onSubmit={handleAdd} className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">Add to suppression list</h3>
                <button type="button" onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input type="email" required value={newForm.email} onChange={(e) => setNewForm({ ...newForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                  placeholder="someone@example.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Scope</label>
                <select value={newForm.scope} onChange={(e) => setNewForm({ ...newForm, scope: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500">
                  <option value="all">All emails</option>
                  <option value="marketing">Marketing only</option>
                  <option value="transactional">Transactional only</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                <select value={newForm.reason} onChange={(e) => setNewForm({ ...newForm, reason: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500">
                  <option value="manual">Manual</option>
                  <option value="unsubscribe">Unsubscribe request</option>
                  <option value="gdpr_erasure">GDPR erasure</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note <span className="text-gray-400 text-xs">(optional)</span></label>
                <textarea value={newForm.note} onChange={(e) => setNewForm({ ...newForm, note: e.target.value })}
                  rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                  placeholder="Why is this address being suppressed?" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 text-gray-600 hover:text-gray-800">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium">Suppress</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleting && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-start mb-4">
              <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mr-3">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Remove from suppression list?</h3>
                <p className="text-sm text-gray-500 mt-1">
                  After removing, {deleting.email} will start receiving emails again.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleting(null)} className="px-4 py-2 text-gray-600">Cancel</button>
              <button onClick={handleDelete} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg">Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminSuppressions
