import { useEffect, useState } from 'react'
import { ShieldOff, Plus, Trash2 } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useToast } from '../../contexts/ToastContext'
import { useConfirmation } from '../../hooks/useConfirmation'
import { PageHeader, FilterBar, LoadingBlock, ErrorState, EmptyState, Modal } from '../../components/admin'

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
  const [loadError, setLoadError] = useState(false)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newForm, setNewForm] = useState({ email: '', scope: 'all', reason: 'manual', note: '' })

  const token = useAuthStore((s) => s.token)
  const { showSuccess, showError } = useToast()
  const { confirm, ConfirmationDialog } = useConfirmation()
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  const fetchRows = async () => {
    setLoading(true)
    setLoadError(false)
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
      setLoadError(true)
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

  const handleDelete = async (row: SuppressionRow) => {
    const ok = await confirm({
      title: 'Remove from suppression list?',
      message: `After removing, ${row.email} will start receiving emails again.`,
      confirmText: 'Remove',
      variant: 'danger',
    })
    if (!ok) return
    try {
      const resp = await fetch(
        `${API_URL}/api/marketing/suppressions/${encodeURIComponent(row.email)}?scope=${encodeURIComponent(row.scope)}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
      )
      if (resp.ok) {
        showSuccess('Removed', `${row.email} removed from suppression list`)
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

  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-primary-500'

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppressions"
        icon={ShieldOff}
        count={total}
        description="Addresses on this list are never sent to."
        help={
          <p>
            Hard bounces and spam complaints are added automatically by the Resend webhook. Admins can add or
            remove entries by hand.
          </p>
        }
        actions={
          <button onClick={() => setShowAdd(true)} className="btn-primary gap-2">
            <Plus className="w-4 h-4" aria-hidden="true" />
            Add to suppression list
          </button>
        }
      />

      {/* A form so Enter in the search box runs the search (the list is filtered server-side). */}
      <form onSubmit={(e) => { e.preventDefault(); fetchRows() }}>
        <FilterBar search={search} onSearchChange={setSearch} placeholder="Search by email...">
          <button type="submit" className="btn-secondary btn-sm">Search</button>
        </FilterBar>
      </form>

      {loadError && <ErrorState message="Could not load the suppression list." onRetry={fetchRows} />}

      {loading && rows.length === 0 ? (
        <LoadingBlock />
      ) : rows.length === 0 ? (
        !loadError && (
          <EmptyState
            icon={ShieldOff}
            title="No suppressions"
            body={search ? 'No address matches this search.' : 'Every address can currently receive email.'}
          />
        )
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Scope</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Note</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">Created</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
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
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDelete(r)}
                        className="text-red-600 hover:text-red-800 p-1.5 rounded hover:bg-red-50"
                        title="Remove from suppression list"
                        aria-label={`Remove ${r.email} from suppression list`}
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAdd && (
        <Modal
          title="Add to suppression list"
          onClose={() => setShowAdd(false)}
          size="sm"
          footer={
            <>
              <button type="button" onClick={() => setShowAdd(false)} className="btn-secondary">Cancel</button>
              <button type="submit" form="suppression-add-form" className="btn-danger">Suppress</button>
            </>
          }
        >
          <form id="suppression-add-form" onSubmit={handleAdd} className="space-y-4">
            <div>
              <label htmlFor="suppression-email" className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input id="suppression-email" type="email" required value={newForm.email}
                onChange={(e) => setNewForm({ ...newForm, email: e.target.value })}
                className={inputClass}
                placeholder="someone@example.com" />
            </div>
            <div>
              <label htmlFor="suppression-scope" className="block text-sm font-medium text-gray-700 mb-1">Scope</label>
              <select id="suppression-scope" value={newForm.scope} onChange={(e) => setNewForm({ ...newForm, scope: e.target.value })}
                className={inputClass}>
                <option value="all">All emails</option>
                <option value="marketing">Marketing only</option>
                <option value="transactional">Transactional only</option>
              </select>
            </div>
            <div>
              <label htmlFor="suppression-reason" className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
              <select id="suppression-reason" value={newForm.reason} onChange={(e) => setNewForm({ ...newForm, reason: e.target.value })}
                className={inputClass}>
                <option value="manual">Manual</option>
                <option value="unsubscribe">Unsubscribe request</option>
                <option value="gdpr_erasure">GDPR erasure</option>
              </select>
            </div>
            <div>
              <label htmlFor="suppression-note" className="block text-sm font-medium text-gray-700 mb-1">Note <span className="text-gray-400 text-xs">(optional)</span></label>
              <textarea id="suppression-note" value={newForm.note} onChange={(e) => setNewForm({ ...newForm, note: e.target.value })}
                rows={2} className={inputClass}
                placeholder="Why is this address being suppressed?" />
            </div>
          </form>
        </Modal>
      )}

      <ConfirmationDialog />
    </div>
  )
}

export default AdminSuppressions
