import { useEffect, useRef, useState } from 'react'
import { FileText, Plus, Edit, Trash2, Eye, Send, X, Image as ImageIcon } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useToast } from '../../contexts/ToastContext'
import MediaPicker from '../../components/MediaPicker'
import { useConfirmation } from '../../hooks/useConfirmation'
import { PageHeader, LoadingBlock, ErrorState, EmptyState, StatusBadge, type StatusTone } from '../../components/admin'

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

const CATEGORY_TONE: Record<string, StatusTone> = {
  marketing:     'info',
  transactional: 'warning',
  system:        'neutral',
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
  const [loadError, setLoadError] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Template | null>(null)
  const [previewMode, setPreviewMode] = useState<'edit' | 'preview'>('edit')
  const [previewHtml, setPreviewHtml] = useState('')
  const [testEmail, setTestEmail] = useState('')
  const [imagePickerOpen, setImagePickerOpen] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

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
  const { confirm, ConfirmationDialog } = useConfirmation()
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  const fetchItems = async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const resp = await fetch(`${API_URL}/api/marketing/templates`, { headers: { Authorization: `Bearer ${token}` } })
      if (resp.ok) setItems(await resp.json())
      else setLoadError(true)
    } catch { setLoadError(true); showError('Error', 'Failed to load templates') }
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

  const handleDelete = async (t: Template) => {
    const ok = await confirm({
      title: 'Delete template?',
      message: `"${t.name}" will be removed.`,
      confirmText: 'Delete',
      variant: 'danger',
    })
    if (!ok) return
    try {
      const resp = await fetch(`${API_URL}/api/marketing/templates/${t.id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      })
      if (resp.ok) {
        showSuccess('Deleted', 'Template removed')
        fetchItems()
      } else showError('Error', 'Failed to delete')
    } catch { showError('Error', 'Network error') }
  }

  const insertInlineImage = (url: string) => {
    if (!url) return
    const absolute = url.startsWith('http') ? url : new URL(url, window.location.origin).toString()
    const tag = `\n<p style="text-align:center;margin:16px 0;"><img src="${absolute}" alt="" style="max-width:100%;height:auto;border-radius:6px;" /></p>\n`
    const el = bodyRef.current
    if (!el) { setForm((prev) => ({ ...prev, body_html: prev.body_html + tag })); return }
    const start = el.selectionStart ?? form.body_html.length
    const end = el.selectionEnd ?? form.body_html.length
    const next = form.body_html.slice(0, start) + tag + form.body_html.slice(end)
    setForm((prev) => ({ ...prev, body_html: next }))
    requestAnimationFrame(() => {
      if (!el) return
      el.focus()
      const pos = start + tag.length
      el.setSelectionRange(pos, pos)
    })
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

  const newButton = (
    <button onClick={() => { resetForm(); setShowForm(true) }} className="btn-primary gap-2">
      <Plus className="w-4 h-4" aria-hidden="true" /> New template
    </button>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Email templates"
        icon={FileText}
        count={items.length}
        description="Reusable email bodies for marketing campaigns."
        help={
          <p>
            Templates support Jinja variables ({'{{ first_name }}'}, etc.) and CSS is auto-inlined for
            email-client compatibility.
          </p>
        }
        actions={newButton}
      />

      {loadError && <ErrorState message="Could not load templates." onRetry={fetchItems} />}

      {loading ? (
        <LoadingBlock />
      ) : items.length === 0 ? (
        !loadError && (
          <EmptyState
            icon={FileText}
            title="No templates yet"
            body="Create your first email template to start composing campaigns."
            action={newButton}
          />
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((t) => (
            <div key={t.id} className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col">
              <div className="flex items-start justify-between mb-2 gap-2">
                <h2 className="text-base font-semibold text-gray-900 truncate flex-1">{t.name}</h2>
                <StatusBadge tone={CATEGORY_TONE[t.category] || 'neutral'}>{t.category}</StatusBadge>
              </div>
              <p className="text-xs text-gray-500 mb-2 truncate">slug: {t.slug} · v{t.current_version}</p>
              <p className="text-sm text-gray-700 mb-3 line-clamp-2">{t.subject}</p>
              <div className="mt-auto flex items-center gap-1 pt-2 border-t border-gray-100">
                <button onClick={() => openEdit(t)} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-primary-50 hover:bg-primary-100 text-primary-700">
                  <Edit className="w-3.5 h-3.5" aria-hidden="true" /> Edit
                </button>
                <button onClick={() => handleDelete(t)} className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Delete" aria-label={`Delete ${t.name}`}>
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor modal. Hand-rolled on purpose, not the shared Modal: the
          MediaPicker opens on top of it, and the shared Modal's Escape handler
          would close this editor (and lose the draft) along with the picker. */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div role="dialog" aria-modal="true" aria-labelledby="template-editor-title" className="bg-white rounded-2xl shadow-xl max-w-5xl w-full max-h-[92vh] flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4 border-b border-gray-200">
              <h2 id="template-editor-title" className="text-lg font-semibold text-gray-900 min-w-0">{editing ? `Edit "${editing.name}"` : 'New email template'}</h2>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setPreviewMode(previewMode === 'edit' ? 'preview' : 'edit')} className="btn-secondary btn-sm">{previewMode === 'edit' ? 'Show preview' : 'Show editor'}</button>
                <button type="button" onClick={resetForm} aria-label="Close" className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700"><X className="w-5 h-5" aria-hidden="true" /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Slug *</label>
                    <input required value={form.slug} disabled={!!editing} pattern="^[a-z0-9_-]+$" onChange={(e) => setForm({ ...form, slug: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100" placeholder="welcome-series-1" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                    <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" placeholder="Welcome Series – Day 1" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                    <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                      <option value="marketing">Marketing</option>
                      <option value="transactional">Transactional</option>
                      <option value="system">System</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Subject *</label>
                    <input required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" placeholder="Welcome to MyZakat, {{ first_name }}" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Preheader <span className="text-gray-400">(inbox preview text)</span></label>
                  <input value={form.preheader} onChange={(e) => setForm({ ...form, preheader: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" placeholder="A short tagline shown in the inbox list" />
                </div>
                {previewMode === 'edit' ? (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-sm font-medium text-gray-700">HTML body *</label>
                      <button
                        type="button"
                        onClick={() => setImagePickerOpen(true)}
                        className="inline-flex items-center gap-1 text-xs text-primary-700 hover:text-primary-900 font-medium"
                        title="Pick an image from your S3 media library and insert it at the cursor"
                      >
                        <ImageIcon className="w-3.5 h-3.5" /> Insert image from S3
                      </button>
                    </div>
                    <textarea
                      ref={bodyRef}
                      required rows={16}
                      value={form.body_html}
                      onChange={(e) => setForm({ ...form, body_html: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 font-mono text-sm"
                    />
                    <button type="button" onClick={renderPreview} className="mt-2 text-sm text-primary-700 hover:text-primary-900 inline-flex items-center gap-1"><Eye className="w-4 h-4" /> Render preview with sample data</button>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Live preview (sample context: name="Aïsha Khan")</label>
                    <iframe srcDoc={previewHtml} title="preview" className="w-full h-[420px] border border-gray-300 rounded-lg bg-white" sandbox="allow-same-origin" />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Plain text fallback <span className="text-gray-400">(optional)</span></label>
                  <textarea rows={4} value={form.body_text} onChange={(e) => setForm({ ...form, body_text: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 font-mono text-xs" />
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

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                  <button type="button" onClick={resetForm} className="btn-secondary">Cancel</button>
                  <button type="submit" className="btn-primary">{editing ? 'Save changes' : 'Create template'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <ConfirmationDialog />

      <MediaPicker
        isOpen={imagePickerOpen}
        onClose={() => setImagePickerOpen(false)}
        onSelect={(url) => { insertInlineImage(url); setImagePickerOpen(false) }}
        mediaType="images"
      />
    </div>
  )
}

export default AdminEmailTemplates
