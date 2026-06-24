import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Send, Plus, Edit, Trash2, X, Rocket, AlertTriangle, BarChart3, Paperclip, Image as ImageIcon } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useToast } from '../../contexts/ToastContext'
import MediaPicker from '../../components/MediaPicker'

interface Campaign {
  id: number
  name: string
  template_id: number | null
  segment_id: number | null
  subject_override: string | null
  preheader_override: string | null
  body_html_override: string | null
  body_text_override: string | null
  attachment_urls: string[]
  status: string
  scheduled_at: string | null
  started_at: string | null
  completed_at: string | null
  total_recipients: number
  queued_count: number
  sent_count: number
  failed_count: number
  suppressed_count: number
  created_at: string
  updated_at: string
}
interface Template { id: number; slug: string; name: string; subject: string }
interface Segment { id: number; name: string; cached_count: number | null }

const STATUS_BADGE: Record<string, string> = {
  draft:    'bg-gray-200 text-gray-700',
  scheduled:'bg-blue-100 text-blue-800',
  sending:  'bg-amber-100 text-amber-800',
  sent:     'bg-green-100 text-green-800',
  failed:   'bg-red-100 text-red-800',
  canceled: 'bg-gray-100 text-gray-500',
}

const AdminMarketingCampaigns = () => {
  const [items, setItems] = useState<Campaign[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [segments, setSegments] = useState<Segment[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Campaign | null>(null)
  const [deleting, setDeleting] = useState<Campaign | null>(null)
  const [sending, setSending] = useState<Campaign | null>(null)
  const [form, setForm] = useState<{
    name: string
    template_id: string
    segment_id: string
    subject_override: string
    body_html_override: string
    attachment_urls: string[]
  }>({
    name: '', template_id: '', segment_id: '',
    subject_override: '', body_html_override: '',
    attachment_urls: [],
  })
  const [attachmentInput, setAttachmentInput] = useState('')
  const [attachmentPickerOpen, setAttachmentPickerOpen] = useState(false)

  const token = useAuthStore((s) => s.token)
  const { showSuccess, showError } = useToast()
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [c, t, s] = await Promise.all([
        fetch(`${API_URL}/api/marketing/campaigns`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/marketing/templates`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/marketing/segments`, { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (c.ok) setItems(await c.json())
      if (t.ok) setTemplates(await t.json())
      if (s.ok) setSegments(await s.json())
    } catch { showError('Error', 'Failed to load campaigns') }
    finally { setLoading(false) }
  }
  useEffect(() => { fetchAll() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const resetForm = () => {
    setForm({ name: '', template_id: '', segment_id: '', subject_override: '', body_html_override: '', attachment_urls: [] })
    setAttachmentInput('')
    setEditing(null); setShowForm(false)
  }

  const openEdit = (c: Campaign) => {
    setEditing(c)
    setForm({
      name: c.name,
      template_id: c.template_id ? String(c.template_id) : '',
      segment_id: c.segment_id ? String(c.segment_id) : '',
      subject_override: c.subject_override || '',
      body_html_override: c.body_html_override || '',
      attachment_urls: c.attachment_urls || [],
    })
    setShowForm(true)
  }

  const addAttachmentUrl = (raw: string) => {
    const url = (raw || '').trim()
    if (!url) return
    if (form.attachment_urls.includes(url)) {
      showError('Already added', 'That URL is already in the attachments list')
      return
    }
    setForm({ ...form, attachment_urls: [...form.attachment_urls, url] })
    setAttachmentInput('')
  }
  const removeAttachmentUrl = (url: string) => {
    setForm({ ...form, attachment_urls: form.attachment_urls.filter((u) => u !== url) })
  }
  const filenameOf = (url: string) => {
    try { return new URL(url).pathname.split('/').pop() || url } catch { return url }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const body = {
      name: form.name,
      template_id: form.template_id ? parseInt(form.template_id) : null,
      segment_id: form.segment_id ? parseInt(form.segment_id) : null,
      subject_override: form.subject_override.trim() || null,
      body_html_override: form.body_html_override.trim() || null,
      attachment_urls: form.attachment_urls,
    }
    const url = editing ? `${API_URL}/api/marketing/campaigns/${editing.id}` : `${API_URL}/api/marketing/campaigns`
    try {
      const resp = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (resp.ok) { showSuccess('Saved', editing ? 'Campaign updated' : 'Campaign created'); resetForm(); fetchAll() }
      else { const err = await resp.json().catch(() => ({ detail: 'Failed' })); showError('Error', err.detail || 'Failed') }
    } catch { showError('Error', 'Network error') }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      const resp = await fetch(`${API_URL}/api/marketing/campaigns/${deleting.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      if (resp.ok) { showSuccess('Deleted', 'Campaign removed'); setDeleting(null); fetchAll() }
      else { const err = await resp.json().catch(() => ({ detail: 'Failed' })); showError('Error', err.detail || 'Failed') }
    } catch { showError('Error', 'Network error') }
  }

  const confirmSend = async () => {
    if (!sending) return
    try {
      const resp = await fetch(`${API_URL}/api/marketing/campaigns/${sending.id}/send-now`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (resp.ok) {
        const data = await resp.json()
        showSuccess('Campaign dispatched', `Queued ${data.queued} emails (${data.suppressed} suppressed)`)
        setSending(null); fetchAll()
      } else {
        const err = await resp.json().catch(() => ({ detail: 'Failed' }))
        showError('Send failed', err.detail || 'Could not dispatch campaign')
      }
    } catch { showError('Error', 'Network error') }
  }

  const segmentLabel = (id: number | null) => segments.find((s) => s.id === id)?.name || '—'
  const templateLabel = (id: number | null) => templates.find((t) => t.id === id)?.name || '—'

  const formatDate = (iso: string | null) => iso ? new Date(iso).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' }) : '—'

  return (
    <div className="space-y-6 px-4 sm:px-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center">
          <Rocket className="w-6 h-6 sm:w-8 sm:h-8 mr-2 sm:mr-3 text-pink-600" />
          Marketing Campaigns
          <span className="ml-3 text-sm bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{items.length}</span>
        </h1>
        <button onClick={() => { resetForm(); setShowForm(true) }} className="inline-flex items-center gap-2 bg-pink-600 hover:bg-pink-700 text-white px-4 py-2 rounded-lg font-medium">
          <Plus className="w-4 h-4" /> New campaign
        </button>
      </div>
      <p className="text-sm text-gray-600">
        A campaign sends one template to one audience segment. Suppression and unsubscribe rules are
        enforced automatically — recipients on the suppression list are skipped without an email being
        queued.
      </p>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-600"/></div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg shadow-sm">
          <Rocket className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">No campaigns yet</h3>
          <p className="text-gray-500 mt-1">Create a template and a segment first, then compose your first broadcast.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Template</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Segment</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">Sent</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">Created</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {items.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 break-all">{c.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">{templateLabel(c.template_id)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">{segmentLabel(c.segment_id)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${STATUS_BADGE[c.status] || 'bg-gray-100'}`}>{c.status}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 hidden lg:table-cell">
                      {c.status === 'sent' ? `${c.queued_count} / ${c.total_recipients}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 hidden lg:table-cell whitespace-nowrap">{formatDate(c.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {(c.status === 'sent' || c.status === 'sending') && (
                          <Link to={`/admin/marketing-campaigns/${c.id}/analytics`} className="text-pink-600 hover:text-pink-800 p-1.5 rounded hover:bg-pink-50" title="View analytics"><BarChart3 className="w-4 h-4" /></Link>
                        )}
                        {(c.status === 'draft' || c.status === 'scheduled') && (
                          <button onClick={() => setSending(c)} className="text-green-700 hover:text-green-900 p-1.5 rounded hover:bg-green-50" title="Send now"><Send className="w-4 h-4" /></button>
                        )}
                        {(c.status === 'draft' || c.status === 'scheduled') && (
                          <button onClick={() => openEdit(c)} className="text-indigo-600 hover:text-indigo-800 p-1.5 rounded hover:bg-indigo-50" title="Edit"><Edit className="w-4 h-4" /></button>
                        )}
                        {c.status !== 'sending' && (
                          <button onClick={() => setDeleting(c)} className="text-red-600 hover:text-red-800 p-1.5 rounded hover:bg-red-50" title="Delete"><Trash2 className="w-4 h-4" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900">{editing ? `Edit "${editing.name}"` : 'New marketing campaign'}</h3>
              <button onClick={resetForm} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Campaign name *</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500" placeholder="July 2026 Ramadan reminder" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Template *</label>
                  <select required value={form.template_id} onChange={(e) => setForm({ ...form, template_id: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500">
                    <option value="">— pick a template —</option>
                    {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Audience segment *</label>
                  <select required value={form.segment_id} onChange={(e) => setForm({ ...form, segment_id: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500">
                    <option value="">— pick a segment —</option>
                    {segments.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.cached_count ?? '?'} recipients)</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject override <span className="text-gray-400">(optional)</span></label>
                <input value={form.subject_override} onChange={(e) => setForm({ ...form, subject_override: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500" placeholder="Leave blank to use template's subject" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">HTML body override <span className="text-gray-400">(optional)</span></label>
                <textarea rows={8} value={form.body_html_override} onChange={(e) => setForm({ ...form, body_html_override: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 font-mono text-sm" placeholder="Leave blank to use template's body" />
              </div>

              {/* Attachments */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                  <Paperclip className="w-4 h-4 text-gray-500" />
                  Attachments <span className="text-gray-400 text-xs">(optional — same file attached to every recipient)</span>
                </label>
                {form.attachment_urls.length > 0 && (
                  <ul className="mb-2 space-y-1">
                    {form.attachment_urls.map((url) => (
                      <li key={url} className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                        <span className="truncate flex-1" title={url}>
                          <Paperclip className="w-3.5 h-3.5 inline mr-1.5 text-gray-400" />
                          {filenameOf(url)}
                        </span>
                        <button type="button" onClick={() => removeAttachmentUrl(url)} className="text-red-500 hover:text-red-700 p-1" title="Remove">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={attachmentInput}
                    onChange={(e) => setAttachmentInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAttachmentUrl(attachmentInput) } }}
                    placeholder="https://myzakat.org/api/uploads/media/images/flyer.pdf"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 text-sm"
                  />
                  <button type="button" onClick={() => addAttachmentUrl(attachmentInput)} disabled={!attachmentInput.trim()} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 rounded-lg text-sm font-medium">Add</button>
                  <button type="button" onClick={() => setAttachmentPickerOpen(true)} className="px-3 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg text-sm font-medium inline-flex items-center gap-1" title="Browse S3">
                    <ImageIcon className="w-4 h-4" /> Browse
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Paste an S3 URL or pick from your media library. Each file is fetched once and attached to every recipient.
                  Keep total size under ~25 MB for inbox delivery.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-gray-200">
                <button type="button" onClick={resetForm} className="px-4 py-2 text-gray-600">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg font-medium">{editing ? 'Save draft' : 'Create draft'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {sending && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-start mb-4">
              <div className="flex-shrink-0 w-10 h-10 bg-pink-100 rounded-full flex items-center justify-center mr-3"><Send className="w-5 h-5 text-pink-600" /></div>
              <div><h3 className="text-lg font-bold text-gray-900">Send "{sending.name}" now?</h3><p className="text-sm text-gray-500 mt-1">This will queue an email for every recipient in the segment. Suppressed and non-opted-in addresses are skipped automatically.</p></div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setSending(null)} className="px-4 py-2 text-gray-600">Cancel</button>
              <button onClick={confirmSend} className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg font-medium">Send campaign</button>
            </div>
          </div>
        </div>
      )}

      {deleting && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-start mb-4">
              <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mr-3"><AlertTriangle className="w-5 h-5 text-red-600" /></div>
              <div><h3 className="text-lg font-bold text-gray-900">Delete campaign?</h3><p className="text-sm text-gray-500 mt-1">{deleting.name}</p></div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleting(null)} className="px-4 py-2 text-gray-600">Cancel</button>
              <button onClick={handleDelete} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg">Delete</button>
            </div>
          </div>
        </div>
      )}

      <MediaPicker
        isOpen={attachmentPickerOpen}
        onClose={() => setAttachmentPickerOpen(false)}
        onSelect={(url) => { addAttachmentUrl(url); setAttachmentPickerOpen(false) }}
        mediaType="all"
      />
    </div>
  )
}

export default AdminMarketingCampaigns
