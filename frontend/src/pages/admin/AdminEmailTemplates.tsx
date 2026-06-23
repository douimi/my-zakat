import { useEffect, useState } from 'react'
import { FileText, Plus, Edit, Trash2, Eye, Send, X, AlertTriangle } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useToast } from '../../contexts/ToastContext'

interface Template {
  id: number
  slug: string
  name: string
  category: string
  subject: string
  preheader: string | null
  body_html: string
  body_text: string | null
  variables: string[]
  current_version: number
  is_active: boolean
  created_at: string
  updated_at: string
}

const CATEGORY_BADGE: Record<string, string> = {
  marketing:     'bg-blue-100 text-blue-800',
  transactional: 'bg-amber-100 text-amber-800',
  system:        'bg-gray-200 text-gray-700',
}

const STARTER_BODY = `<p>Assalamu alaikum {{ first_name | default('friend') }},</p>

<p>Add your message here. You can use these Jinja variables:</p>
<ul>
  <li><code>{{ first_name }}</code> — recipient's first name</li>
  <li><code>{{ name }}</code> — full name</li>
  <li><code>{{ email }}</code> — recipient address</li>
  <li><code>{{ unsubscribe_url }}</code> — one-click unsubscribe link</li>
</ul>

<p>Best regards,<br>The MyZakat Team</p>

{% if unsubscribe_url %}
<p style="font-size:12px;color:#888;margin-top:24px;">
  Don't want these emails? <a href="{{ unsubscribe_url }}">Unsubscribe</a>.
</p>
{% endif %}`

const AdminEmailTemplates = () => {
  const [items, setItems] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Template | null>(null)
  const [deleting, setDeleting] = useState<Template | null>(null)
  const [previewMode, setPreviewMode] = useState<'edit' | 'preview'>('edit')
  const [previewHtml, setPreviewHtml] = useState('')
  const [testEmail, setTestEmail] = useState('')

  const [form, setForm] = useState({
    slug: '',
    name: '',
    category: 'marketing',
    subject: '',
    preheader: '',
    body_html: STARTER_BODY,
    body_text: '',
  })

  const token = useAuthStore((s) => s.token)
  const { showSuccess, showError } = useToast()
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  const fetchItems = async () => {
    setLoading(true)
    try {
      const resp = await fetch(`${API_URL}/api/marketing/templates`, { headers: { Authorization: `Bearer ${token}` } })
      if (resp.ok) setItems(await resp.json())
    } catch { showError('Error', 'Failed to load templates') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchItems() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const resetForm = () => {
    setForm({ slug: '', name: '', category: 'marketing', subject: '', preheader: '', body_html: STARTER_BODY, body_text: '' })
    setEditing(null)
    setShowForm(false)
    setPreviewMode('edit')
    setPreviewHtml('')
  }

  const openEdit = (t: Template) => {
    setEditing(t)
    setForm({
      slug: t.slug, name: t.name, category: t.category, subject: t.subject,
      preheader: t.preheader || '', body_html: t.body_html, body_text: t.body_text || '',
    })
    setShowForm(true)
  }

  const renderPreview = async () => {
    try {
      const resp = await fetch(`${API_URL}/api/marketing/templates/render-preview`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body_html: form.body_html,
          subject: form.subject,
          preheader: form.preheader,
          context: { first_name: 'Aïsha', name: 'Aïsha Khan', email: 'preview@example.com' },
        }),
      })
      if (resp.ok) {
        const data = await resp.json()
        setPreviewHtml(data.body_html)
        setPreviewMode('preview')
      } else {
        const err = await resp.json().catch(() => ({ detail: 'Render failed' }))
        showError('Render error', err.detail || 'Failed to render preview')
      }
    } catch { showError('Error', 'Network error rendering preview') }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const url = editing
      ? `${API_URL}/api/marketing/templates/${editing.id}`
      : `${API_URL}/api/marketing/templates`
    try {
      const resp = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (resp.ok) {
        showSuccess('Saved', editing ? 'Template updated' : 'Template created')
        resetForm()
        fetchItems()
      } else {
        const err = await resp.json().catch(() => ({ detail: 'Failed' }))
        showError('Error', err.detail || 'Failed to save template')
      }
    } catch { showError('Error', 'Network error') }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      const resp = await fetch(`${API_URL}/api/marketing/templates/${deleting.id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      })
      if (resp.ok) {
        showSuccess('Deleted', 'Template removed')
        setDeleting(null)
        fetchItems()
      } else showError('Error', 'Failed to delete')
    } catch { showError('Error', 'Network error') }
  }

  const handleSendTest = async () => {
    if (!editing || !testEmail) return
    try {
      const resp = await fetch(`${API_URL}/api/marketing/templates/${editing.id}/send-test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to_email: testEmail,
          context: { first_name: 'Test', name: 'Test User', email: testEmail },
        }),
      })
      if (resp.ok) {
        showSuccess('Sent', `Test email queued to ${testEmail}`)
        setTestEmail('')
      } else showError('Error', 'Failed to queue test email')
    } catch { showError('Error', 'Network error') }
  }

  return (
    <div className="space-y-6 px-4 sm:px-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center">
          <FileText className="w-6 h-6 sm:w-8 sm:h-8 mr-2 sm:mr-3 text-purple-600" />
          Email Templates
          <span className="ml-3 text-sm bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{items.length}</span>
        </h1>
        <button onClick={() => { resetForm(); setShowForm(true) }} className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium">
          <Plus className="w-4 h-4" /> New template
        </button>
      </div>
      <p className="text-sm text-gray-600">
        Reusable email bodies you can attach to marketing campaigns. Templates support Jinja variables
        ({'{{ first_name }}'}, etc.) and CSS is auto-inlined for email-client compatibility.
      </p>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"/></div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg shadow-sm">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">No templates yet</h3>
          <p className="text-gray-500 mt-1">Create your first email template to start composing campaigns.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((t) => (
            <div key={t.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex flex-col">
              <div className="flex items-start justify-between mb-2 gap-2">
                <h3 className="font-semibold text-gray-900 truncate flex-1">{t.name}</h3>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${CATEGORY_BADGE[t.category] || 'bg-gray-100'}`}>{t.category}</span>
              </div>
              <p className="text-xs text-gray-500 mb-2 truncate">slug: {t.slug} · v{t.current_version}</p>
              <p className="text-sm text-gray-700 mb-3 line-clamp-2">{t.subject}</p>
              <div className="mt-auto flex items-center gap-1 pt-2 border-t border-gray-100">
                <button onClick={() => openEdit(t)} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-indigo-50 hover:bg-indigo-100 text-indigo-700"><Edit className="w-3.5 h-3.5" /> Edit</button>
                <button onClick={() => setDeleting(t)} className="p-1.5 text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900">{editing ? `Edit "${editing.name}"` : 'New email template'}</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => setPreviewMode(previewMode === 'edit' ? 'preview' : 'edit')} className="text-sm px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">{previewMode === 'edit' ? 'Show preview' : 'Show editor'}</button>
                <button onClick={resetForm} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Slug *</label>
                    <input required value={form.slug} disabled={!!editing} pattern="^[a-z0-9_-]+$" onChange={(e) => setForm({ ...form, slug: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 disabled:bg-gray-100" placeholder="welcome-series-1" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                    <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500" placeholder="Welcome Series – Day 1" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                    <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500">
                      <option value="marketing">Marketing</option>
                      <option value="transactional">Transactional</option>
                      <option value="system">System</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Subject *</label>
                    <input required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500" placeholder="Welcome to MyZakat, {{ first_name }}" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Preheader <span className="text-gray-400">(inbox preview text)</span></label>
                  <input value={form.preheader} onChange={(e) => setForm({ ...form, preheader: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500" placeholder="A short tagline shown in the inbox list" />
                </div>
                {previewMode === 'edit' ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">HTML body *</label>
                    <textarea required rows={16} value={form.body_html} onChange={(e) => setForm({ ...form, body_html: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 font-mono text-sm" />
                    <button type="button" onClick={renderPreview} className="mt-2 text-sm text-purple-700 hover:text-purple-900 inline-flex items-center gap-1"><Eye className="w-4 h-4" /> Render preview with sample data</button>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Live preview (sample context: name="Aïsha Khan")</label>
                    <iframe srcDoc={previewHtml} title="preview" className="w-full h-[420px] border border-gray-300 rounded-lg bg-white" sandbox="allow-same-origin" />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Plain text fallback <span className="text-gray-400">(optional)</span></label>
                  <textarea rows={4} value={form.body_text} onChange={(e) => setForm({ ...form, body_text: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 font-mono text-xs" />
                </div>

                {editing && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <label className="block text-sm font-medium text-amber-900 mb-1">Send test email to:</label>
                    <div className="flex gap-2">
                      <input type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} className="flex-1 px-3 py-2 border border-amber-300 rounded-lg" placeholder="me@example.com" />
                      <button type="button" onClick={handleSendTest} disabled={!testEmail} className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white rounded-lg font-medium"><Send className="w-4 h-4" /> Send</button>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-2 border-t border-gray-200">
                  <button type="button" onClick={resetForm} className="px-4 py-2 text-gray-600">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium">{editing ? 'Save changes' : 'Create template'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {deleting && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-start mb-4">
              <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mr-3"><AlertTriangle className="w-5 h-5 text-red-600" /></div>
              <div><h3 className="text-lg font-bold text-gray-900">Delete template?</h3><p className="text-sm text-gray-500 mt-1">{deleting.name}</p></div>
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

export default AdminEmailTemplates
