import { useEffect, useState } from 'react'
import { Mail, RefreshCw, Eye } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useToast } from '../../contexts/ToastContext'
import { PageHeader, LoadingBlock, ErrorState, EmptyState, StatusBadge, Modal, type StatusTone } from '../../components/admin'

interface OutboxRow {
  id: number
  category: string
  template_slug: string | null
  to_email: string
  to_name: string | null
  subject: string
  status: string
  attempts: number
  provider_message_id: string | null
  error: string | null
  created_at: string
  sent_at: string | null
}

interface OutboxDetail extends OutboxRow {
  from_email: string
  from_name: string | null
  body_html: string
  body_text: string | null
}

const STATUS_TONE: Record<string, StatusTone> = {
  pending:    'warning',
  sending:    'info',
  sent:       'success',
  failed:     'danger',
  suppressed: 'neutral',
}

const AdminEmailLog = () => {
  const [rows, setRows] = useState<OutboxRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [selected, setSelected] = useState<OutboxDetail | null>(null)
  const [previewMode, setPreviewMode] = useState<'html' | 'text'>('html')

  const token = useAuthStore((s) => s.token)
  const { showError } = useToast()
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  const fetchRows = async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const qs = statusFilter ? `?status_filter=${encodeURIComponent(statusFilter)}` : ''
      const resp = await fetch(`${API_URL}/api/marketing/outbox${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) throw new Error('fetch failed')
      const data = await resp.json()
      setRows(data.items || [])
      setTotal(data.total || 0)
    } catch {
      setLoadError(true)
      showError('Error', 'Failed to load email log')
    } finally {
      setLoading(false)
    }
  }

  const openDetail = async (id: number) => {
    try {
      const resp = await fetch(`${API_URL}/api/marketing/outbox/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (resp.ok) {
        setSelected(await resp.json())
        setPreviewMode('html')
      }
    } catch {
      showError('Error', 'Failed to load email details')
    }
  }

  useEffect(() => { fetchRows() }, [statusFilter])  // eslint-disable-line react-hooks/exhaustive-deps

  const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' }) : '—'

  return (
    <div className="space-y-6">
      <PageHeader
        title="Email Log"
        icon={Mail}
        count={total}
        description="Every outbound email, transactional and marketing, with its delivery status."
        actions={
          <>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="sending">Sending</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
              <option value="suppressed">Suppressed</option>
            </select>
            <button
              onClick={fetchRows}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
              title="Refresh"
              aria-label="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            </button>
          </>
        }
      />

      {loadError && <ErrorState message="Could not load the email log." onRetry={fetchRows} />}

      {loading && rows.length === 0 ? (
        <LoadingBlock />
      ) : rows.length === 0 ? (
        !loadError && (
          <EmptyState icon={Mail} title="No emails yet" body={statusFilter ? 'Nothing with this status.' : undefined} />
        )
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Recipient</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Subject</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">Created</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">Sent</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm">
                      <div className="font-medium text-gray-900 truncate max-w-[220px]" title={r.to_email}>{r.to_email}</div>
                      <div className="text-xs text-gray-500">{r.template_slug || 'raw'} · {r.category}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 hidden md:table-cell">
                      <div className="truncate max-w-[320px]" title={r.subject}>{r.subject}</div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={STATUS_TONE[r.status] || 'neutral'}>{r.status}</StatusBadge>
                      {r.error && (
                        <div className="text-xs text-red-600 mt-1 truncate max-w-[200px]" title={r.error}>{r.error}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 hidden lg:table-cell whitespace-nowrap">{formatDate(r.created_at)}</td>
                    <td className="px-4 py-3 text-xs text-gray-600 hidden lg:table-cell whitespace-nowrap">{formatDate(r.sent_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openDetail(r.id)}
                        className="text-primary-600 hover:text-primary-800 p-1.5 rounded hover:bg-primary-50"
                        title="Inspect rendered email"
                        aria-label="Inspect rendered email"
                      >
                        <Eye className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected && (
        <Modal
          title={<span className="block truncate">{selected.subject}</span>}
          onClose={() => setSelected(null)}
          size="xl"
          bodyClassName="p-0"
        >
          <div className="px-6 py-3 border-b border-gray-100 space-y-2">
            <p className="text-xs text-gray-500 break-words">
              to {selected.to_email} · from {selected.from_email} · status: <strong>{selected.status}</strong>
            </p>
            <div className="flex items-center gap-2" role="group" aria-label="Preview format">
              <button
                onClick={() => setPreviewMode('html')}
                aria-pressed={previewMode === 'html'}
                className={`px-3 py-1 text-sm rounded ${previewMode === 'html' ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-100'}`}
              >HTML preview</button>
              <button
                onClick={() => setPreviewMode('text')}
                aria-pressed={previewMode === 'text'}
                className={`px-3 py-1 text-sm rounded ${previewMode === 'text' ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-100'}`}
              >Plain text</button>
            </div>
          </div>
          {previewMode === 'html' ? (
            <iframe
              srcDoc={selected.body_html}
              title="Email preview"
              className="w-full h-[60vh] border-0"
              sandbox="allow-same-origin"
            />
          ) : (
            <pre className="p-6 text-sm whitespace-pre-wrap text-gray-800 font-mono">{selected.body_text || '(no plain-text version)'}</pre>
          )}
        </Modal>
      )}
    </div>
  )
}

export default AdminEmailLog
