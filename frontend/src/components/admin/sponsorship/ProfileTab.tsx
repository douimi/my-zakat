import { useEffect, useRef, useState } from 'react'
import { Eye, ImageOff, ShieldCheck, Upload } from 'lucide-react'
import { LoadingBlock, Modal } from '..'
import { useToast } from '../../../contexts/ToastContext'
import { sponsorshipAdmin, errorDetail, type PublicDetail } from '../../../utils/sponsorshipApi'
import CoverageBar from './CoverageBar'
import { docLabel, explainBlocker, fieldLabel, money, needLabel, toCents, toDollars } from './format'
import { Panel, type CaseTabProps } from './ui'

const TEXT_FIELDS = ['public_name', 'public_title', 'public_title_ar', 'public_story', 'public_story_ar'] as const
type TextField = typeof TEXT_FIELDS[number]

/** The anonymous profile donors see: EN/AR editor, photo, and a preview of the public page. */
const ProfileTab = ({ case: c, onUpdated }: CaseTabProps) => {
  const { showError, showSuccess } = useToast()
  const initial = () => ({
    ...Object.fromEntries(TEXT_FIELDS.map((f) => [f, c.profile[f] ?? ''])) as Record<TextField, string>,
    amount: toDollars(c.profile.approved_monthly_cents),
  })
  const [form, setForm] = useState(initial)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PublicDetail | null | 'loading'>(null)

  // A save elsewhere (approve sets the amount) refreshes the form; a photo
  // upload or any other refresh with the same profile keeps unsaved typing.
  const profileKey = JSON.stringify(c.profile)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setForm(initial()) }, [profileKey])

  const set = (k: keyof ReturnType<typeof initial>) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    const body: Record<string, unknown> = {}
    for (const f of TEXT_FIELDS) {
      if (form[f].trim() !== (c.profile[f] ?? '').trim()) body[f] = form[f].trim() || null
    }
    if (form.amount !== toDollars(c.profile.approved_monthly_cents)) {
      const cents = toCents(form.amount)
      if (!cents) { setError('The approved monthly amount must be a positive amount.'); return }
      body.approved_monthly_cents = cents
    }
    if (Object.keys(body).length === 0) { setError(null); showSuccess('Nothing to save'); return }
    setBusy(true)
    setError(null)
    try {
      const res = await sponsorshipAdmin.edit(c.id, { ...body, ...(note.trim() ? { note: note.trim() } : {}) })
      onUpdated(res.case)
      setNote('')
      showSuccess('Profile saved', `Changed: ${res.changed.map(fieldLabel).join(', ')}`)
    } catch (e) {
      setError(errorDetail(e) || 'Could not save the profile.')
    } finally {
      setBusy(false)
    }
  }

  const openPreview = async () => {
    setPreview('loading')
    try {
      setPreview(await sponsorshipAdmin.preview(c.id))
    } catch (e) {
      setPreview(null)
      showError('Could not build the preview', errorDetail(e) || undefined)
    }
  }

  const profileBlockers = c.publish_blockers.filter((b) => explainBlocker(b).tab === 'profile' || b === 'no_publication_consent')

  return (
    <div className="space-y-4">
      {profileBlockers.length > 0 && (
        <div className="alert-warning flex-col">
          <p className="font-semibold">Before publishing:</p>
          <ul className="list-disc pl-5">{profileBlockers.map((b) => <li key={b}>{explainBlocker(b).text}</li>)}</ul>
        </div>
      )}

      <Panel
        title="Public profile"
        actions={
          <button type="button" className="btn-secondary btn-sm gap-1" onClick={openPreview}>
            <Eye className="w-4 h-4" aria-hidden="true" /> Preview public page
          </button>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 mt-0.5 text-primary-600 shrink-0" aria-hidden="true" />
            Anonymous: no family name, no exact address, no school name, nothing that identifies the family or where they live.
          </p>
          {error && <div role="alert" className="alert-error">{error}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="pf-name" className="label">Public name</label>
              <input id="pf-name" className="input" value={form.public_name} onChange={set('public_name')} maxLength={100}
                aria-describedby="pf-name-help" />
              <p id="pf-name-help" className="help-text">A first name or a pseudonym, e.g. “Amina” or “The H. family”.</p>
            </div>
            <div>
              <label htmlFor="pf-amount" className="label">Approved monthly amount (USD)</label>
              <input id="pf-amount" className="input" inputMode="decimal" value={form.amount} onChange={set('amount')}
                aria-describedby="pf-amount-help" />
              <p id="pf-amount-help" className="help-text">Requested: {money(c.requested_monthly_cents)}. This is the need donors cover.</p>
            </div>
            <div>
              <label htmlFor="pf-title" className="label">Title (English)</label>
              <input id="pf-title" className="input" value={form.public_title} onChange={set('public_title')} maxLength={200} />
            </div>
            <div>
              <label htmlFor="pf-title-ar" className="label">Title (Arabic)</label>
              <input id="pf-title-ar" className="input" dir="rtl" lang="ar" value={form.public_title_ar} onChange={set('public_title_ar')} maxLength={200} />
            </div>
            <div>
              <label htmlFor="pf-story" className="label">Story (English)</label>
              <textarea id="pf-story" className="input" rows={7} value={form.public_story} onChange={set('public_story')} maxLength={5000} />
            </div>
            <div>
              <label htmlFor="pf-story-ar" className="label">Story (Arabic)</label>
              <textarea id="pf-story-ar" className="input" rows={7} dir="rtl" lang="ar" value={form.public_story_ar} onChange={set('public_story_ar')} maxLength={5000} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="pf-note" className="label">Internal note (optional, kept in the history)</label>
              <input id="pf-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
            </div>
          </div>
          <div className="flex justify-end">
            <button type="button" className="btn-primary btn-sm" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
          </div>
        </div>
      </Panel>

      <PhotoPanel {...{ case: c, onUpdated }} />

      {preview && (
        <Modal title="Public page preview" size="lg" onClose={() => setPreview(null)}>
          {preview === 'loading' ? <LoadingBlock label="Building the preview…" /> : <PreviewCard p={preview} />}
        </Modal>
      )}
    </div>
  )
}

/** What a donor would see — built by the server from the same serializer as the public page. */
const PreviewCard = ({ p }: { p: PublicDetail }) => (
  <div className="space-y-4">
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-primary-700">{p.kind === 'family' ? 'Family' : 'Orphan'} · {p.reference}</p>
      <h3 className="text-xl font-bold text-gray-900">{p.display_name || <span className="text-red-700">No public name</span>}</h3>
      <p className="text-gray-700">{p.title || <span className="text-red-700">No title</span>}</p>
      {p.title_ar && <p className="text-gray-700" dir="rtl" lang="ar">{p.title_ar}</p>}
      <p className="text-sm text-gray-500 mt-1">
        {[p.region, p.country].filter(Boolean).join(', ')}
        {p.age != null ? ` · ${p.age} years` : ''}
        {p.household_size ? ` · ${p.household_size} people` : ''}
      </p>
    </div>
    <div className="max-w-sm">
      <p className="text-sm font-medium text-gray-700 mb-1">{money(p.monthly_need_cents)} a month</p>
      <CoverageBar coverage={p.coverage} />
    </div>
    {p.story ? <p className="text-sm text-gray-800 whitespace-pre-wrap">{p.story}</p> : <p className="text-sm text-red-700">No story yet.</p>}
    {p.story_ar && <p className="text-sm text-gray-800 whitespace-pre-wrap" dir="rtl" lang="ar">{p.story_ar}</p>}
    {p.needs.length > 0 && (
      <div>
        <p className="text-sm font-semibold text-gray-900">Monthly needs</p>
        <ul className="text-sm text-gray-700">{p.needs.map((n, i) => <li key={i}>{needLabel(n.category)}: {money(n.monthly_cents)}</li>)}</ul>
      </div>
    )}
    <p className="text-sm text-gray-700">
      Verified documents: {p.verified_documents.length ? p.verified_documents.map(docLabel).join(', ') : 'none yet'}
    </p>
  </div>
)

const PhotoPanel = ({ case: c, onUpdated }: Pick<CaseTabProps, 'case' | 'onUpdated'>) => {
  const { showError, showSuccess } = useToast()
  const [src, setSrc] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [safe, setSafe] = useState(false)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!c.photo_url) { setSrc(null); return }
    let url: string | null = null
    let cancelled = false
    sponsorshipAdmin.photo(c.id).then((blob) => {
      if (cancelled) return
      url = URL.createObjectURL(blob)
      setSrc(url)
    }).catch(() => { if (!cancelled) setSrc(null) })
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url) }
  }, [c.id, c.photo_url])

  const upload = async () => {
    if (!file || !safe) return
    setBusy(true)
    try {
      onUpdated(await sponsorshipAdmin.setPhoto(c.id, file))
      setFile(null)
      setSafe(false)
      if (input.current) input.current.value = ''
      showSuccess('Photo set')
    } catch (e) {
      showError('Could not set the photo', errorDetail(e) || undefined)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      onUpdated(await sponsorshipAdmin.removePhoto(c.id))
      showSuccess('Photo removed')
    } catch (e) {
      showError('Could not remove the photo', errorDetail(e) || undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="Public photo (optional)">
      {!c.consent.publication ? (
        <p className="text-sm text-gray-700">The applicant has not consented to publication, so no photo can be shown.</p>
      ) : (
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="w-32 h-32 shrink-0 rounded-lg bg-gray-100 overflow-hidden flex items-center justify-center">
            {src ? <img src={src} alt="Current public" className="w-full h-full object-cover" />
              : <ImageOff className="w-8 h-8 text-gray-400" aria-label="No photo" />}
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <label htmlFor="pf-photo" className="label">{c.photo_url ? 'Replace the photo' : 'Choose a photo'}</label>
              <input id="pf-photo" ref={input} type="file" accept="image/jpeg,image/png,image/webp"
                className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-medium"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <p className="help-text">JPEG, PNG or WebP under 8 MB.</p>
            </div>
            <label className="flex items-start gap-2 text-sm text-gray-800">
              <input type="checkbox" className="mt-1" checked={safe} onChange={(e) => setSafe(e.target.checked)} />
              <span>I confirm this photo does not reveal the family’s identity or where they live (no face that can be recognised, no street, house number, school uniform or landmark).</span>
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary btn-sm gap-1" onClick={upload} disabled={!file || !safe || busy}>
                <Upload className="w-4 h-4" aria-hidden="true" /> Use this photo
              </button>
              {c.photo_url && (
                <button type="button" className="btn-ghost btn-sm text-red-700" onClick={remove} disabled={busy}>Remove photo</button>
              )}
            </div>
          </div>
        </div>
      )}
    </Panel>
  )
}

export default ProfileTab
