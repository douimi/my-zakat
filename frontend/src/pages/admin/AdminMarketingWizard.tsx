/**
 * Guided 4-step campaign wizard: Basics → Audience → Content → Review.
 *
 * Designed for non-technical operators. Every step:
 *   - Renders a plain-English title + short helper text.
 *   - Uses sensible defaults and one-click presets.
 *   - Reveals advanced options only when the user asks.
 *   - Shows a live preview panel (recipient count or email render).
 *
 * At the final step, the wizard creates the segment (if new), the template
 * (if new), then the campaign, then dispatches send-now — all as one atomic
 * action from the user's perspective.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, Check, Rocket, Users, FileText, Eye, Send, Paperclip,
  Sparkles, PenTool, X, ImagePlus, Loader2, AlertTriangle, Info,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useToast } from '../../contexts/ToastContext'
import MediaPicker from '../../components/MediaPicker'

type StepIndex = 1 | 2 | 3 | 4

type AudienceMode = 'existing' | 'preset' | 'custom'
type ContentMode = 'existing' | 'new'

interface Segment { id: number; name: string; cached_count: number | null }
interface Template { id: number; name: string; subject: string; preheader: string | null; body_html: string; body_text: string | null }
interface Predicate { field: string; op: string; value: any }

// ─── Presets: five human-labelled starting points ─────────────────────
const AUDIENCE_PRESETS: { id: string; label: string; description: string; definition: Predicate[] }[] = [
  { id: 'everyone',   label: 'Everyone with email consent', description: 'All contacts across every source who consented to email.', definition: [] },
  { id: 'donors',     label: 'All donors',                   description: 'Everyone who has ever donated (one-time or recurring).',   definition: [{ field: 'donation_count', op: 'gte', value: 1 }] },
  { id: 'newsletter', label: 'Newsletter subscribers',       description: 'People who opted in through the newsletter signup form.', definition: [{ field: 'sources', op: 'contains', value: 'subscription' }] },
  { id: 'volunteers', label: 'Volunteers',                    description: 'People who signed up to volunteer.',                     definition: [{ field: 'sources', op: 'contains', value: 'volunteer' }] },
  { id: 'lapsed',     label: 'Lapsed donors (>1 year)',      description: "Donors who haven't given in over a year — a great win-back audience.", definition: [{ field: 'donation_count', op: 'gte', value: 1 }, { field: 'last_donation_at', op: 'lt', value: (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10) })() }] },
]

const STARTER_BODY = `<p>Assalamu alaikum {{ first_name | default('friend') }},</p>

<p>Write your message here — use <code>{{ first_name }}</code> to personalize the greeting.</p>

<p>Include a clear call to action:</p>
<p style="text-align:center;margin:24px 0;">
  <a href="https://myzakat.org/donate" style="background:#2563eb;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;">Donate now</a>
</p>

<p>With gratitude,<br>The MyZakat Team</p>`

const AdminMarketingWizard = () => {
  const token = useAuthStore((s) => s.token)
  const { showSuccess, showError } = useToast()
  const navigate = useNavigate()
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  const [step, setStep] = useState<StepIndex>(1)

  // ── Step 1: Basics ──────────────────────────────────────────
  const [campaignName, setCampaignName] = useState('')

  // ── Step 2: Audience ───────────────────────────────────────
  const [audienceMode, setAudienceMode] = useState<AudienceMode>('preset')
  const [existingSegments, setExistingSegments] = useState<Segment[]>([])
  const [selectedSegmentId, setSelectedSegmentId] = useState<string>('')
  const [presetId, setPresetId] = useState<string>('everyone')
  const [customRules, setCustomRules] = useState<Predicate[]>([])
  const [saveAudienceAsName, setSaveAudienceAsName] = useState('')
  const [audienceCount, setAudienceCount] = useState<number | null>(null)
  const [audienceCountLoading, setAudienceCountLoading] = useState(false)

  // ── Step 3: Content ─────────────────────────────────────────
  const [contentMode, setContentMode] = useState<ContentMode>('new')
  const [existingTemplates, setExistingTemplates] = useState<Template[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [templateName, setTemplateName] = useState('')
  const [subject, setSubject] = useState('')
  const [preheader, setPreheader] = useState('')
  const [bodyHtml, setBodyHtml] = useState(STARTER_BODY)
  const [attachmentUrls, setAttachmentUrls] = useState<string[]>([])
  const [attachmentInput, setAttachmentInput] = useState('')
  const [attachmentPickerOpen, setAttachmentPickerOpen] = useState(false)
  const [previewHtml, setPreviewHtml] = useState<string>('')
  const [previewLoading, setPreviewLoading] = useState(false)

  // ── Step 4: Review / Send ──────────────────────────────────
  const [testEmail, setTestEmail] = useState('')
  const [sending, setSending] = useState(false)

  // ── Load existing segments + templates once ────────────────
  useEffect(() => {
    ;(async () => {
      try {
        const [s, t] = await Promise.all([
          fetch(`${API_URL}/api/marketing/segments`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API_URL}/api/marketing/templates`, { headers: { Authorization: `Bearer ${token}` } }),
        ])
        if (s.ok) setExistingSegments(await s.json())
        if (t.ok) setExistingTemplates(await t.json())
      } catch { /* silent */ }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Compute effective audience definition (for preview + save) ──
  const effectiveDefinition = useMemo<Predicate[]>(() => {
    if (audienceMode === 'preset') {
      const preset = AUDIENCE_PRESETS.find((p) => p.id === presetId)
      return preset ? preset.definition : []
    }
    if (audienceMode === 'custom') return customRules
    return []
  }, [audienceMode, presetId, customRules])

  const selectedSegment = existingSegments.find((x) => String(x.id) === selectedSegmentId)

  // ── Recipient count preview (auto-refresh) ────────────────
  useEffect(() => {
    if (step !== 2) return
    if (audienceMode === 'existing') {
      setAudienceCount(selectedSegment?.cached_count ?? null)
      return
    }
    ;(async () => {
      setAudienceCountLoading(true)
      try {
        const resp = await fetch(`${API_URL}/api/marketing/segments/preview`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'wizard-preview', definition: effectiveDefinition }),
        })
        if (resp.ok) {
          const data = await resp.json()
          setAudienceCount(data.count)
        } else { setAudienceCount(null) }
      } catch { setAudienceCount(null) }
      finally { setAudienceCountLoading(false) }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, audienceMode, presetId, customRules, selectedSegmentId])

  // ── Effective content (subject + body) ────────────────────
  const effectiveSubject = useMemo(() => {
    if (contentMode === 'existing') {
      const t = existingTemplates.find((x) => String(x.id) === selectedTemplateId)
      return t?.subject || ''
    }
    return subject
  }, [contentMode, selectedTemplateId, existingTemplates, subject])
  const effectiveBody = useMemo(() => {
    if (contentMode === 'existing') {
      const t = existingTemplates.find((x) => String(x.id) === selectedTemplateId)
      return t?.body_html || ''
    }
    return bodyHtml
  }, [contentMode, selectedTemplateId, existingTemplates, bodyHtml])
  const effectivePreheader = useMemo(() => {
    if (contentMode === 'existing') {
      const t = existingTemplates.find((x) => String(x.id) === selectedTemplateId)
      return t?.preheader || ''
    }
    return preheader
  }, [contentMode, selectedTemplateId, existingTemplates, preheader])

  // ── Render preview (on demand) ────────────────────────────
  const renderPreview = async () => {
    if (!effectiveBody) return
    setPreviewLoading(true)
    try {
      const resp = await fetch(`${API_URL}/api/marketing/templates/render-preview`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body_html: effectiveBody,
          subject: effectiveSubject,
          preheader: effectivePreheader,
          context: { first_name: 'Aïsha', name: 'Aïsha Khan', email: 'preview@example.com' },
        }),
      })
      if (resp.ok) {
        const data = await resp.json()
        setPreviewHtml(data.body_html)
      } else { showError('Preview failed', 'Check your HTML — Jinja render error') }
    } catch { showError('Preview failed', 'Network error') }
    finally { setPreviewLoading(false) }
  }
  useEffect(() => { if (step === 3 || step === 4) renderPreview() }, [step, effectiveBody, effectiveSubject]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Validation per step ──────────────────────────────────
  const canContinueFromStep1 = campaignName.trim().length > 0
  const canContinueFromStep2 = audienceMode === 'existing' ? !!selectedSegmentId : (audienceCount ?? 0) > 0
  const canContinueFromStep3 = contentMode === 'existing'
    ? !!selectedTemplateId
    : subject.trim().length > 0 && bodyHtml.trim().length > 0
  const canSend = canContinueFromStep1 && canContinueFromStep2 && canContinueFromStep3

  // ── Attachment helpers ───────────────────────────────────
  const addAttachment = (raw: string) => {
    const url = raw.trim()
    if (!url || attachmentUrls.includes(url)) return
    setAttachmentUrls([...attachmentUrls, url])
    setAttachmentInput('')
  }
  const removeAttachment = (url: string) => setAttachmentUrls(attachmentUrls.filter((u) => u !== url))
  const filenameOf = (url: string) => { try { return new URL(url).pathname.split('/').pop() || url } catch { return url } }

  // ── Custom rule helpers (simplified builder) ─────────────
  const addCustomRule = () => setCustomRules([...customRules, { field: 'sources', op: 'contains', value: 'subscription' }])
  const updateCustomRule = (idx: number, patch: Partial<Predicate>) => {
    const next = [...customRules]; next[idx] = { ...next[idx], ...patch }; setCustomRules(next)
  }
  const removeCustomRule = (idx: number) => setCustomRules(customRules.filter((_, i) => i !== idx))

  // ── The Big Send Button ──────────────────────────────────
  const handleSendNow = async () => {
    if (!canSend) return
    setSending(true)
    try {
      // 1. Resolve segment_id — create one if using preset/custom.
      let segmentId: number
      if (audienceMode === 'existing') {
        segmentId = parseInt(selectedSegmentId)
      } else {
        const preset = AUDIENCE_PRESETS.find((p) => p.id === presetId)
        const name = saveAudienceAsName.trim()
          || (audienceMode === 'preset' ? preset!.label : `${campaignName} — Audience`)
        const resp = await fetch(`${API_URL}/api/marketing/segments`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, definition: effectiveDefinition, description: `Auto-created from campaign wizard: ${campaignName}` }),
        })
        if (!resp.ok) throw new Error('Failed to create audience')
        segmentId = (await resp.json()).id
      }

      // 2. Resolve template_id (optional — can use body overrides on the campaign).
      let templateId: number | null = null
      if (contentMode === 'existing') {
        templateId = parseInt(selectedTemplateId)
      } else if (templateName.trim()) {
        // Only save as a reusable template if the user gave it a name.
        const slug = templateName.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 60) || `campaign-${Date.now()}`
        const resp = await fetch(`${API_URL}/api/marketing/templates`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug: `${slug}-${Date.now().toString(36)}`,
            name: templateName.trim(),
            category: 'marketing',
            subject: subject.trim(),
            preheader: preheader.trim() || null,
            body_html: bodyHtml,
          }),
        })
        if (resp.ok) templateId = (await resp.json()).id
      }

      // 3. Create campaign draft.
      const campBody: any = {
        name: campaignName.trim(),
        segment_id: segmentId,
        template_id: templateId,
        attachment_urls: attachmentUrls,
      }
      if (!templateId) {
        // Store body inline on the campaign as overrides.
        campBody.subject_override = subject.trim()
        campBody.preheader_override = preheader.trim() || null
        campBody.body_html_override = bodyHtml
      }
      const createResp = await fetch(`${API_URL}/api/marketing/campaigns`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(campBody),
      })
      if (!createResp.ok) {
        const err = await createResp.json().catch(() => ({ detail: 'Failed' }))
        throw new Error(err.detail || 'Could not create campaign')
      }
      const campaign = await createResp.json()

      // 4. Send-now.
      const sendResp = await fetch(`${API_URL}/api/marketing/campaigns/${campaign.id}/send-now`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      })
      if (!sendResp.ok) {
        const err = await sendResp.json().catch(() => ({ detail: 'Failed' }))
        throw new Error(err.detail || 'Could not send campaign')
      }
      const dispatch = await sendResp.json()

      showSuccess('Campaign sent!', `${dispatch.queued} email${dispatch.queued === 1 ? '' : 's'} queued for delivery (${dispatch.suppressed} skipped).`)
      navigate('/admin/marketing-campaigns')
    } catch (exc: any) {
      showError('Could not send campaign', exc?.message || 'Unexpected error')
    } finally {
      setSending(false)
    }
  }

  const handleSendTest = async () => {
    if (!testEmail) return
    try {
      const resp = await fetch(`${API_URL}/api/marketing/templates/render-preview`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ body_html: effectiveBody, subject: effectiveSubject, preheader: effectivePreheader, context: { first_name: 'Test' } }),
      })
      if (!resp.ok) throw new Error('Render failed')
      // Reuse the send-test endpoint by first ensuring a template exists,
      // but simpler: fake a template send-test by inlining the body.
      const slug = `wizard-test-${Date.now().toString(36)}`
      const tmpl = await fetch(`${API_URL}/api/marketing/templates`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, name: `Wizard test — ${campaignName}`, category: 'system', subject: effectiveSubject, body_html: effectiveBody }),
      })
      if (!tmpl.ok) throw new Error('Could not create test template')
      const tmplData = await tmpl.json()
      const testResp = await fetch(`${API_URL}/api/marketing/templates/${tmplData.id}/send-test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_email: testEmail, context: { first_name: 'Test', name: 'Test User', email: testEmail } }),
      })
      if (testResp.ok) {
        showSuccess('Test sent', `Check ${testEmail} in a minute.`)
        // Best-effort cleanup — delete the ephemeral template.
        fetch(`${API_URL}/api/marketing/templates/${tmplData.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }).catch(() => {})
      } else showError('Test failed', 'Could not send test email')
    } catch (exc: any) { showError('Test failed', exc?.message || 'Unexpected error') }
  }

  // ─── Render ─────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/admin/marketing-campaigns" className="text-sm text-gray-500 hover:text-gray-800 inline-flex items-center gap-1 mb-2"><ArrowLeft className="w-4 h-4" /> Back to campaigns</Link>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center"><Rocket className="w-7 h-7 mr-2 text-primary-600" /> New marketing campaign</h1>
          <p className="text-sm text-gray-600 mt-1">Four quick steps and you're done.</p>
        </div>
      </div>

      {/* Progress indicator */}
      <ol className="grid grid-cols-4 gap-2 text-xs sm:text-sm">
        {[
          { n: 1, label: 'Basics',   icon: PenTool },
          { n: 2, label: 'Audience', icon: Users },
          { n: 3, label: 'Content',  icon: FileText },
          { n: 4, label: 'Review',   icon: Eye },
        ].map(({ n, label, icon: Icon }) => {
          const active = step === n
          const done = step > n
          return (
            <li key={n} className={`flex items-center gap-2 rounded-lg p-3 border ${
              active ? 'border-primary-500 bg-primary-50 text-primary-800'
              : done ? 'border-green-300 bg-green-50 text-green-800'
              : 'border-gray-200 bg-white text-gray-500'
            }`}>
              <span className={`w-7 h-7 rounded-full flex items-center justify-center font-semibold ${
                active ? 'bg-primary-600 text-white' : done ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-600'
              }`}>{done ? <Check className="w-4 h-4" /> : n}</span>
              <span className="flex flex-col leading-tight">
                <span className="font-semibold flex items-center gap-1"><Icon className="w-3.5 h-3.5" /> Step {n}</span>
                <span className="hidden sm:inline">{label}</span>
              </span>
            </li>
          )
        })}
      </ol>

      {/* ── STEP 1 ── Basics ─────────────────────────────────── */}
      {step === 1 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8 space-y-6">
          <div>
            <h2 className="text-lg font-bold text-gray-900">What are you calling this campaign?</h2>
            <p className="text-sm text-gray-500 mt-1">This is just for you — recipients won't see it. Pick something descriptive so you can find it later.</p>
          </div>
          <input
            autoFocus
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
            placeholder="e.g. Ramadan 2026 launch"
            className="w-full text-lg px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
          <div className="flex justify-end pt-4 border-t border-gray-100">
            <button onClick={() => setStep(2)} disabled={!canContinueFromStep1} className="px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white font-semibold rounded-lg inline-flex items-center gap-2">Continue <ArrowRight className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {/* ── STEP 2 ── Audience ──────────────────────────────── */}
      {step === 2 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8 space-y-6">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Who should get this email?</h2>
            <p className="text-sm text-gray-500 mt-1">Start with a preset — that's usually enough. Advanced options if you need them.</p>
          </div>

          {/* Mode selector */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              { id: 'preset',   label: 'Quick preset',        icon: Sparkles, desc: 'Pick one of five common audiences' },
              { id: 'existing', label: 'Saved audience',      icon: Users,    desc: 'Reuse a segment you built before' },
              { id: 'custom',   label: 'Build custom rules',  icon: PenTool,  desc: 'Advanced: mix your own criteria' },
            ].map((m) => {
              const Icon = m.icon
              const active = audienceMode === (m.id as AudienceMode)
              return (
                <button key={m.id} type="button" onClick={() => setAudienceMode(m.id as AudienceMode)}
                  className={`text-left p-3 rounded-lg border-2 transition-colors ${active ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <Icon className={`w-5 h-5 mb-1 ${active ? 'text-primary-600' : 'text-gray-500'}`} />
                  <div className="font-semibold text-sm text-gray-900">{m.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{m.desc}</div>
                </button>
              )
            })}
          </div>

          {/* Preset chooser */}
          {audienceMode === 'preset' && (
            <div className="space-y-2">
              {AUDIENCE_PRESETS.map((p) => (
                <label key={p.id} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${presetId === p.id ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300 bg-white'}`}>
                  <input type="radio" name="preset" value={p.id} checked={presetId === p.id} onChange={() => setPresetId(p.id)} className="mt-1 text-primary-600" />
                  <div>
                    <div className="font-semibold text-sm text-gray-900">{p.label}</div>
                    <div className="text-xs text-gray-500">{p.description}</div>
                  </div>
                </label>
              ))}
            </div>
          )}

          {/* Existing chooser */}
          {audienceMode === 'existing' && (
            existingSegments.length > 0 ? (
              <select value={selectedSegmentId} onChange={(e) => setSelectedSegmentId(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                <option value="">— pick a saved audience —</option>
                {existingSegments.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.cached_count ?? '?'} recipients</option>)}
              </select>
            ) : (
              <div className="text-sm text-gray-500 italic p-4 bg-gray-50 rounded border border-gray-200">
                You don't have any saved audiences yet. Pick "Quick preset" instead — you'll be able to save it after.
              </div>
            )
          )}

          {/* Custom rule builder (simplified) */}
          {audienceMode === 'custom' && (
            <div className="space-y-2">
              {customRules.length === 0 && <p className="text-sm text-gray-500 italic">No rules yet — click "Add rule" to build a custom audience.</p>}
              {customRules.map((r, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2 p-2 border border-gray-200 rounded bg-gray-50">
                  <select value={r.field} onChange={(e) => updateCustomRule(idx, { field: e.target.value })} className="px-2 py-1.5 border border-gray-300 rounded text-sm">
                    <option value="sources">Source</option>
                    <option value="donation_count">Donation count</option>
                    <option value="total_donated">Total donated ($)</option>
                    <option value="last_donation_at">Last donation date</option>
                  </select>
                  <select value={r.op} onChange={(e) => updateCustomRule(idx, { op: e.target.value })} className="px-2 py-1.5 border border-gray-300 rounded text-sm">
                    <option value="contains">contains</option>
                    <option value="eq">equals</option>
                    <option value="gte">at least</option>
                    <option value="lte">at most</option>
                    <option value="lt">less than</option>
                    <option value="gt">greater than</option>
                  </select>
                  {r.field === 'sources' ? (
                    <select value={r.value} onChange={(e) => updateCustomRule(idx, { value: e.target.value })} className="px-2 py-1.5 border border-gray-300 rounded text-sm flex-1 min-w-[140px]">
                      <option value="user">Registered users</option>
                      <option value="subscription">Newsletter subscribers</option>
                      <option value="volunteer">Volunteers</option>
                      <option value="donor">One-time donors</option>
                      <option value="recurring">Recurring donors</option>
                    </select>
                  ) : (
                    <input value={r.value ?? ''} onChange={(e) => updateCustomRule(idx, { value: e.target.value })} type={r.field === 'last_donation_at' ? 'date' : 'text'} className="px-2 py-1.5 border border-gray-300 rounded text-sm flex-1 min-w-[120px]" placeholder="value" />
                  )}
                  <button type="button" onClick={() => removeCustomRule(idx)} className="text-red-500 hover:text-red-700 p-1"><X className="w-4 h-4" /></button>
                </div>
              ))}
              <button type="button" onClick={addCustomRule} className="text-sm text-primary-700 hover:text-primary-900">+ Add rule</button>
            </div>
          )}

          {/* Save as name (only when creating new) */}
          {audienceMode !== 'existing' && (
            <div className="border-t border-gray-100 pt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Save this audience as <span className="text-gray-400 text-xs">(optional)</span></label>
              <input value={saveAudienceAsName} onChange={(e) => setSaveAudienceAsName(e.target.value)} placeholder="e.g. Newsletter subscribers"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm" />
              <p className="text-xs text-gray-500 mt-1">Leave blank and we'll auto-name it so you can find it later.</p>
            </div>
          )}

          {/* Recipient count preview */}
          <div className="bg-primary-50 border border-primary-200 rounded-lg p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-primary-800 tracking-wide">Recipients this campaign will reach</p>
              {audienceCountLoading
                ? <p className="text-2xl font-bold text-primary-700 mt-0.5"><Loader2 className="w-6 h-6 inline animate-spin" /></p>
                : <p className="text-3xl font-bold text-primary-700 mt-0.5">{audienceCount === null ? '—' : audienceCount.toLocaleString()}</p>}
              <p className="text-xs text-primary-800 mt-1">Automatically excludes anyone on the suppression list or who hasn't consented to email.</p>
            </div>
            <Users className="w-10 h-10 text-primary-300" />
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
            <button onClick={() => setStep(1)} className="px-4 py-2 text-gray-600 inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Back</button>
            <button onClick={() => setStep(3)} disabled={!canContinueFromStep2} className="px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white font-semibold rounded-lg inline-flex items-center gap-2">Continue <ArrowRight className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {/* ── STEP 3 ── Content ──────────────────────────────── */}
      {step === 3 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8 space-y-6">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Write the email</h2>
              <p className="text-sm text-gray-500 mt-1">Compose from scratch or pick a template you've used before.</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'new',      label: 'Write a new email',       icon: PenTool },
                { id: 'existing', label: 'Use an existing template', icon: FileText },
              ].map((m) => {
                const Icon = m.icon
                const active = contentMode === (m.id as ContentMode)
                return (
                  <button key={m.id} type="button" onClick={() => setContentMode(m.id as ContentMode)}
                    className={`text-left p-3 rounded-lg border-2 ${active ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <Icon className={`w-5 h-5 mb-1 ${active ? 'text-primary-600' : 'text-gray-500'}`} />
                    <div className="font-semibold text-sm text-gray-900">{m.label}</div>
                  </button>
                )
              })}
            </div>

            {contentMode === 'existing' && (
              existingTemplates.length > 0 ? (
                <select value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                  <option value="">— pick a template —</option>
                  {existingTemplates.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.subject.slice(0, 60)}</option>)}
                </select>
              ) : (
                <div className="text-sm text-gray-500 italic p-4 bg-gray-50 rounded border border-gray-200">No templates yet — switch to "Write a new email".</div>
              )
            )}

            {contentMode === 'new' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subject line *</label>
                  <input required value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ramadan 2026 — a moment to give" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
                  <p className="text-xs text-gray-500 mt-1">Tip: use <code>{'{{ first_name }}'}</code> to personalize.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Preheader <span className="text-gray-400 text-xs">(inbox preview text)</span></label>
                  <input value={preheader} onChange={(e) => setPreheader(e.target.value)} placeholder="A short tagline shown in the inbox list" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">HTML body *</label>
                  <textarea required rows={12} value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 font-mono text-xs" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Save as reusable template <span className="text-gray-400 text-xs">(optional)</span></label>
                  <input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="e.g. Ramadan launch template" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm" />
                  <p className="text-xs text-gray-500 mt-1">Give it a name and we'll save it so you can re-use it later.</p>
                </div>
              </div>
            )}

            {/* Attachments */}
            <div className="border-t border-gray-100 pt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2 inline-flex items-center gap-2"><Paperclip className="w-4 h-4 text-gray-500" /> Attachments <span className="text-gray-400 text-xs font-normal">(optional)</span></label>
              {attachmentUrls.length > 0 && (
                <ul className="mb-2 space-y-1">
                  {attachmentUrls.map((url) => (
                    <li key={url} className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded text-sm">
                      <span className="truncate flex-1" title={url}><Paperclip className="w-3.5 h-3.5 inline mr-1.5 text-gray-400" />{filenameOf(url)}</span>
                      <button type="button" onClick={() => removeAttachment(url)} className="text-red-500 hover:text-red-700 p-1"><X className="w-3.5 h-3.5" /></button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2">
                <input type="url" value={attachmentInput} onChange={(e) => setAttachmentInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAttachment(attachmentInput) } }} placeholder="Paste S3 URL of a PDF, image, etc." className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500" />
                <button type="button" onClick={() => addAttachment(attachmentInput)} disabled={!attachmentInput.trim()} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 rounded-lg text-sm font-medium">Add</button>
                <button type="button" onClick={() => setAttachmentPickerOpen(true)} className="px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium inline-flex items-center gap-1"><ImagePlus className="w-4 h-4" /> Browse</button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-gray-100">
              <button onClick={() => setStep(2)} className="px-4 py-2 text-gray-600 inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Back</button>
              <button onClick={() => setStep(4)} disabled={!canContinueFromStep3} className="px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white font-semibold rounded-lg inline-flex items-center gap-2">Continue <ArrowRight className="w-4 h-4" /></button>
            </div>
          </div>

          {/* Live preview */}
          <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase text-gray-500 tracking-wide">Live preview</span>
              <button onClick={renderPreview} className="text-xs text-primary-700 hover:text-primary-900 inline-flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> Refresh</button>
            </div>
            <div className="flex-1 min-h-[420px] border border-gray-200 rounded overflow-hidden bg-gray-50">
              {previewLoading
                ? <div className="w-full h-full flex items-center justify-center text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
                : previewHtml
                  ? <iframe srcDoc={previewHtml} title="preview" className="w-full h-full min-h-[420px]" sandbox="allow-same-origin" />
                  : <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm p-4 text-center">Preview will appear here once you enter a subject and body.</div>}
            </div>
            <p className="text-xs text-gray-500 mt-2 inline-flex items-start gap-1"><Info className="w-3 h-3 mt-0.5 flex-shrink-0" /> Rendered with sample data (name: Aïsha Khan).</p>
          </div>
        </div>
      )}

      {/* ── STEP 4 ── Review + Send ────────────────────────── */}
      {step === 4 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8 space-y-6">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Review and send</h2>
              <p className="text-sm text-gray-500 mt-1">Double-check the details, send a test to yourself, then hit the big button.</p>
            </div>

            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4 py-3 border-b border-gray-100">
                <dt className="text-gray-500">Campaign name</dt><dd className="font-medium text-gray-900 text-right">{campaignName}</dd>
              </div>
              <div className="flex justify-between gap-4 py-3 border-b border-gray-100">
                <dt className="text-gray-500">Audience</dt>
                <dd className="font-medium text-gray-900 text-right">
                  {audienceMode === 'existing'
                    ? selectedSegment?.name || '—'
                    : audienceMode === 'preset'
                      ? AUDIENCE_PRESETS.find((p) => p.id === presetId)?.label
                      : `${customRules.length} custom rule${customRules.length === 1 ? '' : 's'}`}
                  <span className="ml-2 text-primary-700 font-semibold">{audienceCount?.toLocaleString() || '—'} recipients</span>
                </dd>
              </div>
              <div className="flex justify-between gap-4 py-3 border-b border-gray-100">
                <dt className="text-gray-500">Subject</dt><dd className="font-medium text-gray-900 text-right truncate max-w-md" title={effectiveSubject}>{effectiveSubject}</dd>
              </div>
              {attachmentUrls.length > 0 && (
                <div className="flex justify-between gap-4 py-3 border-b border-gray-100">
                  <dt className="text-gray-500">Attachments</dt>
                  <dd className="font-medium text-gray-900 text-right">{attachmentUrls.length} file{attachmentUrls.length === 1 ? '' : 's'}</dd>
                </div>
              )}
            </dl>

            {/* Send test */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <label className="block text-sm font-medium text-amber-900 mb-1">Send a test to yourself first?</label>
              <div className="flex gap-2">
                <input type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="you@example.com" className="flex-1 px-3 py-2 border border-amber-300 rounded text-sm" />
                <button onClick={handleSendTest} disabled={!testEmail} className="inline-flex items-center gap-1 px-3 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white text-sm rounded font-medium"><Send className="w-4 h-4" /> Send test</button>
              </div>
            </div>

            {/* Final warning + Send button */}
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-900">
                <p className="font-semibold">This will send immediately to {audienceCount?.toLocaleString() || 'the'} recipient{audienceCount === 1 ? '' : 's'}.</p>
                <p className="mt-1 text-red-800">You cannot recall or edit the email after sending. Preview it, send a test, and only then click Send campaign.</p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-gray-100">
              <button onClick={() => setStep(3)} className="px-4 py-2 text-gray-600 inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Back</button>
              <button onClick={handleSendNow} disabled={!canSend || sending} className="px-8 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white font-semibold rounded-lg inline-flex items-center gap-2">
                {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : <><Rocket className="w-4 h-4" /> Send campaign</>}
              </button>
            </div>
          </div>

          {/* Preview in review */}
          <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-col">
            <span className="text-xs font-semibold uppercase text-gray-500 tracking-wide mb-2">Final preview</span>
            <div className="flex-1 min-h-[420px] border border-gray-200 rounded overflow-hidden bg-gray-50">
              {previewHtml
                ? <iframe srcDoc={previewHtml} title="preview" className="w-full h-full min-h-[420px]" sandbox="allow-same-origin" />
                : <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">No preview.</div>}
            </div>
          </div>
        </div>
      )}

      <MediaPicker
        isOpen={attachmentPickerOpen}
        onClose={() => setAttachmentPickerOpen(false)}
        onSelect={(url) => { addAttachment(url); setAttachmentPickerOpen(false) }}
        mediaType="all"
      />
    </div>
  )
}

export default AdminMarketingWizard
