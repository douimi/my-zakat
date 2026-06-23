import { useEffect, useState } from 'react'
import { Mail, RefreshCw, Filter, Eye, X } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useToast } from '../../contexts/ToastContext'

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

const STATUS_BADGE: Record<string, string> = {
  pending:    'bg-amber-100 text-amber-800',
  sending:    'bg-blue-100 text-blue-800',
  sent:       'bg-green-100 text-green-800',
  failed:     'bg-red-100 text-red-800',
  suppressed: 'bg-gray-200 text-gray-700',
}

const AdminEmailLog = () => {
  const [rows, setRows] = useState<OutboxRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [selected, setSelected] = useState<OutboxDetail | null>(null)
  const [previewMode, setPreviewMode] = useState<'html' | 'text'>('html')

  const token = useAuthStore((s) => s.token)
  const { showError } = useToast()
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  const fetchRows = async () => {
    setLoading(true)
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
    <div className="space-y-6 px-4 sm:px-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center">
          <Mail className="w-6 h-6 sm:w-8 sm:h-8 mr-2 sm:mr-3 text-blue-600" />
          Email Log
          <span className="ml-3 text-sm bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{total}</span>
        </h1>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
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
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <p className="text-sm text-gray-600">
        Every outbound email — transactional and marketing — is recorded here. Status updates as the worker
        delivers it through Resend. Click the eye icon to inspect the rendered body.
      </p>

      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Recipient</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Subject</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">Created</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">Sent</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
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
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${STATUS_BADGE[r.status] || 'bg-gray-100 text-gray-700'}`}>
                      {r.status}
                    </span>
                    {r.error && (
                      <div className="text-xs text-red-600 mt-1 truncate max-w-[200px]" title={r.error}>{r.error}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600 hidden lg:table-cell whitespace-nowrap">{formatDate(r.created_at)}</td>
                  <td className="px-4 py-3 text-xs text-gray-600 hidden lg:table-cell whitespace-nowrap">{formatDate(r.sent_at)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => openDetail(r.id)}
                      className="text-blue-600 hover:text-blue-800 p-1.5 rounded hover:bg-blue-50"
                      title="Inspect rendered email"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-500">No emails yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 truncate">{selected.subject}</h3>
                <p className="text-xs text-gray-500 truncate">
                  to {selected.to_email} · from {selected.from_email} · status: <strong>{selected.status}</strong>
                </p>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-2">
              <button
                onClick={() => setPreviewMode('html')}
                className={`px-3 py-1 text-sm rounded ${previewMode === 'html' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
              >HTML preview</button>
              <button
                onClick={() => setPreviewMode('text')}
                className={`px-3 py-1 text-sm rounded ${previewMode === 'text' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
              >Plain text</button>
            </div>
            <div className="flex-1 overflow-auto">
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
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminEmailLog
