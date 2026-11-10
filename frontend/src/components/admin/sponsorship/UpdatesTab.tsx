import { useState } from 'react'
import { Megaphone, Plus } from 'lucide-react'
import { Collapsible, EmptyState, Modal } from '..'
import { useToast } from '../../../contexts/ToastContext'
import { sponsorshipAdmin, errorDetail, type StaffCase } from '../../../utils/sponsorshipApi'
import { fmtDate, isCommitted, plural } from './format'
import { Panel, firstLine, type CaseTabProps } from './ui'

/** News for the sponsors: list (folded) and the form to post one. */
const UpdatesTab = ({ case: c, onUpdated }: CaseTabProps) => {
  const [posting, setPosting] = useState(false)
  return (
    <div className="space-y-4">
      <Panel
        title={`Updates (${c.updates.length})`}
        flush
        actions={
          <button type="button" className="btn-primary btn-sm gap-1" onClick={() => setPosting(true)}>
            <Plus className="w-4 h-4" aria-hidden="true" /> Post an update
          </button>
        }
      >
        {c.updates.length === 0 ? (
          <div className="p-4"><EmptyState icon={Megaphone} title="No update yet" body="Sponsors read updates on their page: news about school, health, a delivery." /></div>
        ) : c.updates.map((u) => (
          <Collapsible key={u.id} title={`${fmtDate(u.created_at)} · ${u.title}`} preview={firstLine(u.body)}>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{u.body}</p>
            {(u.title_ar || u.body_ar) && (
              <div dir="rtl" lang="ar" className="border-t border-gray-100 pt-2">
                {u.title_ar && <p className="text-sm font-semibold text-gray-900">{u.title_ar}</p>}
                {u.body_ar && <p className="text-sm text-gray-800 whitespace-pre-wrap">{u.body_ar}</p>}
              </div>
            )}
          </Collapsible>
        ))}
      </Panel>
      {posting && <UpdateDialog case={c} onClose={() => setPosting(false)} onDone={(u) => { onUpdated(u); setPosting(false) }} />}
    </div>
  )
}

const UpdateDialog = ({ case: c, onClose, onDone }: { case: StaffCase; onClose: () => void; onDone: (c: StaffCase) => void }) => {
  const { showSuccess } = useToast()
  const sponsors = c.sponsorships.filter((s) => isCommitted(s.status)).length
  const [title, setTitle] = useState('')
  const [titleAr, setTitleAr] = useState('')
  const [body, setBody] = useState('')
  const [bodyAr, setBodyAr] = useState('')
  const [notify, setNotify] = useState(true)
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const titleBad = title.trim().length < 2
  const bodyBad = body.trim().length < 2

  const submit = async () => {
    setTouched(true)
    if (titleBad || bodyBad) return
    setBusy(true)
    setError(null)
    try {
      const updated = await sponsorshipAdmin.postUpdate(c.id, {
        title: title.trim(), title_ar: titleAr.trim() || undefined, body: body.trim(), body_ar: bodyAr.trim() || undefined,
        notify_sponsors: notify,
      })
      showSuccess('Update posted', notify && sponsors ? `${plural(sponsors, 'sponsor')} emailed.` : undefined)
      onDone(updated)
    } catch (e) {
      setError(errorDetail(e) || 'Could not post the update.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`Post an update · ${c.reference}`} size="lg" onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn-primary btn-sm" onClick={submit} disabled={busy}>{busy ? 'Posting…' : 'Post update'}</button>
        </>
      }>
      <div className="space-y-4">
        <p className="text-sm text-gray-600">Keep it anonymous, like the public profile.</p>
        {error && <div role="alert" className="alert-error">{error}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="up-title" className="label">Title (English)</label>
            <input id="up-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} aria-invalid={touched && titleBad} />
            {touched && titleBad && <p className="field-error">Give the update a title.</p>}
          </div>
          <div>
            <label htmlFor="up-title-ar" className="label">Title (Arabic, optional)</label>
            <input id="up-title-ar" className="input" dir="rtl" lang="ar" value={titleAr} onChange={(e) => setTitleAr(e.target.value)} maxLength={200} />
          </div>
          <div>
            <label htmlFor="up-body" className="label">Message (English)</label>
            <textarea id="up-body" className="input" rows={5} value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} aria-invalid={touched && bodyBad} />
            {touched && bodyBad && <p className="field-error">Write the message.</p>}
          </div>
          <div>
            <label htmlFor="up-body-ar" className="label">Message (Arabic, optional)</label>
            <textarea id="up-body-ar" className="input" rows={5} dir="rtl" lang="ar" value={bodyAr} onChange={(e) => setBodyAr(e.target.value)} maxLength={5000} />
          </div>
        </div>
        <label className="flex items-start gap-2 text-sm text-gray-800">
          <input type="checkbox" className="mt-1" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          <span>Email the sponsors about this update {sponsors ? `(${plural(sponsors, 'active sponsor')})` : '(no active sponsor yet)'}</span>
        </label>
      </div>
    </Modal>
  )
}

export default UpdatesTab
