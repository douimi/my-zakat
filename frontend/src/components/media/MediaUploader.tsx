import { useEffect, useRef, useState } from 'react'
import { UploadCloud, CheckCircle2, AlertCircle } from 'lucide-react'
import { clsx } from 'clsx'
import { mediaLibraryApi, type ProjectFolder } from '../../utils/mediaLibraryApi'

interface UploadItem {
  name: string
  percent: number
  state: 'uploading' | 'done' | 'error'
  message?: string
}

interface MediaUploaderProps {
  onUploaded: () => void
  /** Project folders. When given, the uploader asks which project the files
   *  document — at upload, because asking later means it never gets asked. */
  projects?: ProjectFolder[]
  /** The folder the page has open; new uploads go there unless changed. */
  projectId?: number | null
}

/**
 * Pull a readable message out of a FastAPI error body.
 *
 * The server uses three different `detail` shapes depending on the failure:
 *  - a plain string (413 size limit, 400 unsupported type — including the
 *    HEIC/AVIF hint built specifically so an iPhone user knows to change
 *    their camera format instead of guessing why the upload bounced)
 *  - { message, existing } on a 409 duplicate
 *  - { tags: [...] } on a 400 tag-validation failure
 * All three need to reach the UI verbatim rather than being swallowed by a
 * generic "upload failed".
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
  return 'Upload failed. Please try again.'
}

const MediaUploader = ({ onUploaded, projects, projectId = null }: MediaUploaderProps) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [items, setItems] = useState<UploadItem[]>([])
  const [target, setTarget] = useState<number | null>(projectId)

  // Opening another folder retargets the uploader, so dropping files into the
  // folder on screen files them there.
  useEffect(() => { setTarget(projectId) }, [projectId])

  const fileable = (projects || []).filter((p) => p.project_id !== null && p.fileable)
  // The open folder may not accept new media (its project changed status), and
  // the list may not have loaded yet. Either way the honest target is none —
  // which is also what the select displays — rather than a guaranteed 400.
  const chosen = target !== null && fileable.some((p) => p.project_id === target) ? target : null

  const handleFiles = async (fileList: FileList | null) => {
    const files = Array.from(fileList || [])
    if (files.length === 0) return

    setItems(files.map((f) => ({ name: f.name, percent: 0, state: 'uploading' as const })))

    let anySucceeded = false

    // Sequential on purpose: a phone-sized video should not have to share the
    // connection with five others. Each file's outcome (success, duplicate,
    // too large, unsupported type) is tracked independently by index, so one
    // failure never stops — or gets confused with — the rest of the batch.
    for (let index = 0; index < files.length; index += 1) {
      try {
        await mediaLibraryApi.upload(files[index], { projectId: chosen }, (percent) => {
          setItems((current) =>
            current.map((item, i) => (i === index ? { ...item, percent } : item))
          )
        })
        anySucceeded = true
        setItems((current) =>
          current.map((item, i) =>
            i === index ? { ...item, percent: 100, state: 'done' } : item
          )
        )
      } catch (error) {
        setItems((current) =>
          current.map((item, i) =>
            i === index ? { ...item, state: 'error', message: errorMessage(error) } : item
          )
        )
      }
    }

    if (anySucceeded) onUploaded()
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div>
      {projects && (
        <div className="mb-3 flex items-center gap-2">
          <label htmlFor="media-upload-project" className="text-sm font-medium text-gray-700 shrink-0">
            File under
          </label>
          <select
            id="media-upload-project"
            value={chosen ?? ''}
            onChange={(e) => setTarget(e.target.value === '' ? null : Number(e.target.value))}
            className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
          >
            <option value="">No project (Unassigned)</option>
            {fileable.map((p) => (
              <option key={p.project_id} value={p.project_id as number}>{p.name}</option>
            ))}
          </select>
        </div>
      )}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          handleFiles(e.dataTransfer.files)
        }}
        onClick={() => inputRef.current?.click()}
        className={clsx(
          'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition',
          dragging ? 'border-primary-500 bg-primary-50' : 'border-gray-300 hover:border-primary-400'
        )}
      >
        <UploadCloud className="w-8 h-8 text-gray-400 mx-auto mb-2" />
        <p className="text-sm font-medium text-gray-700">
          Drop photos or videos here, or click to choose
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Uploads land in your workspace as private until an admin publishes them.
        </p>
        <input
          ref={inputRef}
          data-testid="media-file-input"
          type="file"
          multiple
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {items.length > 0 && (
        <ul className="mt-3 space-y-2">
          {items.map((item, index) => (
            <li key={`${item.name}-${index}`} className="flex items-center gap-3 text-sm">
              {item.state === 'done' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
              {item.state === 'error' && <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />}
              <span className="truncate max-w-[200px] text-gray-700">{item.name}</span>
              {item.state === 'uploading' && (
                <div className="flex-1 h-1.5 bg-gray-200 rounded overflow-hidden">
                  <div className="h-full bg-primary-500 transition-all" style={{ width: `${item.percent}%` }} />
                </div>
              )}
              {item.message && <span className="text-red-600">{item.message}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default MediaUploader
