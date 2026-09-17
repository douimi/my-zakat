import { useEffect, useState } from 'react'
import { X, Trash2, Send, Globe, Undo2, RotateCcw } from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'
import { mediaLibraryApi, type MediaAssetDetail, type Workspace } from '../../utils/mediaLibraryApi'
import { formatBytes } from './MediaCard'

interface MediaDetailDrawerProps {
  assetId: number
  canReview: boolean
  onClose: () => void
  onChanged: () => void
  /** Supplied only by All Media, where a reviewer may move an asset between
   *  workspaces — chiefly to give backfilled legacy media an owner. */
  workspaces?: Workspace[]
  /** The signed-in user's id. Only needed when `canReview` is true: a
   *  reviewer browses every workspace, so owner-only actions (submit,
   *  withdraw) must be hidden unless this matches the asset's owner_id — a
   *  field-staff viewer never needs this, because they can only ever be
   *  looking at their own asset (anything else 404s before the drawer has
   *  content to show). */
  currentUserId?: number | null
}

/**
 * Pull a readable message out of a FastAPI error body.
 *
 * `detail` shows up in three shapes on this resource: a plain string, an
 * object with `message` (409 duplicate / in-use conflicts), or an object
 * with `tags` (400 tag-validation failures, e.g. a `|` character or a tag
 * over 64 characters) — all three need to reach the toast verbatim rather
 * than collapsing into a generic "that did not work".
 */
function errorMessage(error: unknown): string {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object') {
    if ('message' in detail) return String((detail as { message: unknown }).message)
    if ('tags' in detail && Array.isArray((detail as { tags: unknown[] }).tags)) {
      return (detail as { tags: string[] }).tags.join(' ')
    }
  }
  return 'That did not work.'
}

const MediaDetailDrawer = ({
  assetId, canReview, onClose, onChanged, workspaces, currentUserId,
}: MediaDetailDrawerProps) => {
  const { showSuccess, showError } = useToast()
  const [asset, setAsset] = useState<MediaAssetDetail | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tagText, setTagText] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    mediaLibraryApi
      .detail(assetId)
      .then((data) => {
        if (cancelled) return
        setAsset(data)
        setTitle(data.title || '')
        setDescription(data.description || '')
        setTagText((data.tags || []).join(', '))
      })
      .catch(() => showError('Could not load this media.'))
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId])

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true)
    try {
      await action()
      showSuccess(success)
      onChanged()
      const fresh = await mediaLibraryApi.detail(assetId)
      setAsset(fresh)
    } catch (error) {
      showError('Error', errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const inUse = (asset?.usage_count ?? 0) > 0

  // A non-reviewer can only ever be looking at their own asset — anything
  // else 404s before the drawer has content (see _require_can_view on the
  // server). A reviewer browses every workspace, so ownership there is a
  // real comparison against currentUserId, not an assumption.
  const isOwner = asset ? (canReview ? currentUserId != null && asset.owner_id === currentUserId : true) : false

  // Once media is public, editing its metadata is a reviewer-only action
  // (the server 403s an owner's PATCH at that point) — the form must not
  // offer controls that will bounce.
  const canEditMetadata = !!asset && (canReview || asset.status !== 'public')

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-xl">
        <header className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Media details</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </header>

        {!asset ? (
          <div className="p-5 text-sm text-gray-500">Loading…</div>
        ) : (
          <div className="p-5 space-y-5">
            <div className="bg-gray-100 rounded-lg overflow-hidden">
              {asset.media_type === 'video' ? (
                <video src={mediaLibraryApi.fileUrl(asset.id)} controls className="w-full" />
              ) : (
                <img src={mediaLibraryApi.fileUrl(asset.id)} alt={asset.filename} className="w-full" />
              )}
            </div>

            {/* Status is deliberately the loudest thing in the drawer after the
                media itself — this is the one place a field worker can check
                whether a beneficiary photo they uploaded is actually live on
                the public site. */}
            {asset.status === 'public' ? (
              <p className="text-sm bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg p-3 flex items-center gap-2">
                <Globe className="w-4 h-4 shrink-0" />
                This is live on the public site.
              </p>
            ) : (
              <p className="text-sm bg-gray-50 border border-gray-200 text-gray-700 rounded-lg p-3">
                {asset.status === 'submitted'
                  ? 'Waiting on a reviewer. Not visible on the public site yet.'
                  : 'Private. Only visible to staff — never shown on the public site.'}
              </p>
            )}

            <dl className="text-sm text-gray-600 space-y-1">
              <div className="flex justify-between"><dt>File</dt><dd className="font-medium text-gray-900 truncate max-w-[220px]">{asset.filename}</dd></div>
              <div className="flex justify-between"><dt>Size</dt><dd>{formatBytes(asset.size_bytes)}</dd></div>
              {asset.width && <div className="flex justify-between"><dt>Dimensions</dt><dd>{asset.width} × {asset.height}</dd></div>}
              <div className="flex justify-between"><dt>Status</dt><dd className="capitalize">{asset.status}</dd></div>
            </dl>

            {asset.review_note && (
              <p className="text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3">
                <strong>Reviewer note:</strong> {asset.review_note}
              </p>
            )}

            {inUse && (
              <p className="text-sm bg-blue-50 border border-blue-200 text-blue-900 rounded-lg p-3">
                Used in {asset.usage_count} place{asset.usage_count === 1 ? '' : 's'} on the site.
                It cannot be deleted or unpublished until those references are removed.
              </p>
            )}

            <div className="space-y-3">
              {!canEditMetadata && (
                <p className="text-sm bg-gray-50 border border-gray-200 text-gray-600 rounded-lg p-3">
                  This media is public. Only a reviewer can edit it now.
                </p>
              )}
              <div>
                <label htmlFor="media-title" className="block text-xs font-medium text-gray-600 mb-1">Title</label>
                <input id="media-title" value={title} disabled={!canEditMetadata}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-500" />
              </div>
              <div>
                <label htmlFor="media-description" className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <textarea id="media-description" rows={3} value={description} disabled={!canEditMetadata}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-500" />
              </div>
              <div>
                <label htmlFor="media-tags" className="block text-xs font-medium text-gray-600 mb-1">Tags (comma separated)</label>
                <input id="media-tags" value={tagText} disabled={!canEditMetadata}
                  onChange={(e) => setTagText(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-500" />
              </div>
              {workspaces && (
                <div>
                  <label htmlFor="media-owner" className="block text-xs font-medium text-gray-600 mb-1">
                    Workspace
                  </label>
                  <select
                    id="media-owner"
                    value={asset.owner_id ?? ''}
                    disabled={busy}
                    onChange={(e) => {
                      const value = e.target.value === '' ? null : Number(e.target.value)
                      return run(() => mediaLibraryApi.reassign(asset.id, value), 'Workspace updated')
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">Unassigned</option>
                    {workspaces
                      .filter((w) => w.owner_id !== null)
                      .map((w) => (
                        <option key={w.owner_id} value={w.owner_id as number}>
                          {w.owner_name}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {canEditMetadata && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(
                    () => mediaLibraryApi.update(asset.id, {
                      title,
                      description,
                      tags: tagText.split(',').map((t) => t.trim()).filter(Boolean),
                    }),
                    'Details saved'
                  )}
                  className="w-full bg-emerald-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                >
                  Save details
                </button>
              )}
            </div>

            <div className="border-t pt-4 space-y-2">
              {asset.status === 'private' && isOwner && (
                <button type="button" disabled={busy}
                  onClick={() => run(() => mediaLibraryApi.submit(asset.id), 'Submitted for review')}
                  className="w-full flex items-center justify-center gap-2 border border-gray-300 rounded-lg py-2 text-sm hover:bg-gray-50 disabled:opacity-50">
                  <Send className="w-4 h-4" /> Submit for review
                </button>
              )}

              {asset.status === 'submitted' && isOwner && (
                <button type="button" disabled={busy}
                  onClick={() => run(() => mediaLibraryApi.withdraw(asset.id), 'Withdrawn back to private')}
                  className="w-full flex items-center justify-center gap-2 border border-gray-300 rounded-lg py-2 text-sm hover:bg-gray-50 disabled:opacity-50">
                  <RotateCcw className="w-4 h-4" /> Withdraw
                </button>
              )}

              {canReview && asset.status !== 'public' && (
                <button type="button" disabled={busy}
                  onClick={() => run(() => mediaLibraryApi.review(asset.id, 'approve'), 'Published')}
                  className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white rounded-lg py-2 text-sm hover:bg-emerald-700 disabled:opacity-50">
                  <Globe className="w-4 h-4" /> Publish
                </button>
              )}

              {canReview && asset.status === 'submitted' && (
                <button type="button" disabled={busy}
                  onClick={() => {
                    // window.prompt returns null on Cancel and '' on an empty
                    // OK — neither is a note, and the server 422s a blank one
                    // (ReviewDecision._reject_must_explain_itself). Refuse
                    // client-side instead of round-tripping a guaranteed error.
                    const raw = window.prompt('Why is this being rejected?')
                    if (raw === null) return
                    const note = raw.trim()
                    if (!note) {
                      showError('Error', 'A rejection needs a note explaining why.')
                      return
                    }
                    return run(() => mediaLibraryApi.review(asset.id, 'reject', note), 'Returned to the owner')
                  }}
                  className="w-full border border-amber-300 text-amber-800 rounded-lg py-2 text-sm hover:bg-amber-50 disabled:opacity-50">
                  Reject
                </button>
              )}

              {canReview && asset.status === 'public' && (
                <button type="button" disabled={busy || inUse}
                  onClick={() => run(() => mediaLibraryApi.review(asset.id, 'unpublish'), 'Unpublished')}
                  className="w-full flex items-center justify-center gap-2 border border-gray-300 rounded-lg py-2 text-sm hover:bg-gray-50 disabled:opacity-50">
                  <Undo2 className="w-4 h-4" /> Unpublish
                </button>
              )}

              {(canReview || (isOwner && asset.status === 'private')) && (
                <button type="button" disabled={busy || inUse}
                  onClick={() => {
                    if (!window.confirm('Delete this media permanently?')) return
                    return run(async () => { await mediaLibraryApi.remove(asset.id); onClose() }, 'Deleted')
                  }}
                  className="w-full flex items-center justify-center gap-2 border border-red-300 text-red-700 rounded-lg py-2 text-sm hover:bg-red-50 disabled:opacity-50">
                  <Trash2 className="w-4 h-4" /> Delete
                </button>
              )}
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}

export default MediaDetailDrawer
