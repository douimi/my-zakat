/**
 * Add files to a report that is waiting for review.
 *
 * For the team whose PDF did not make it the first time (refused under the old
 * 25 MB limit, cut off by the old 60-second proxy timeout, or sent before the
 * invoices were scanned). Same checks and the same visible progress as the
 * report form, so a 50 MB upload is never a silent wait.
 */
import { useRef, useState } from 'react'
import { AlertCircle, Loader2, Paperclip, Trash2, UploadCloud } from 'lucide-react'
import { REPORT_LIMITS, addReportAttachments } from '../../utils/proposalPortalApi'
import { REPORT_MESSAGES as RM, arabicFileCount, formatBytes, problemWith } from './ReportForm'
import { defineMessages, useFormat, useLocale, useT } from '../../i18n'

const M = defineMessages({
  sessionExpired: {
    en: 'Your session has expired. Sign in again, then add the files.',
    ar: 'انتهت جلستك. سجّل الدخول من جديد، ثم أضف الملفات.',
  },
  sendFailed: {
    en: 'The files could not be sent. Check your connection and try again.',
    ar: 'تعذّر إرسال الملفات. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.',
  },
  missingFile: {
    en: 'Missing a file? You can still add invoices or photos while the report waits for review.',
    ar: 'نسيت ملفًا؟ ما زال بإمكانك إضافة الفواتير أو الصور ما دام التقرير في انتظار المراجعة.',
  },
  chooseFiles: { en: 'Choose files', ar: 'اختر الملفات' },
  tooMany: { en: 'A report can carry at most {max} files.', ar: 'يمكن أن يضم التقرير {max} ملفًا كحد أقصى.' },
  tooLarge: {
    en: 'With these, the report would be over {limit} MB in total.',
    ar: 'بإضافة هذه الملفات سيتجاوز حجم التقرير {limit} MB إجمالًا.',
  },
  sendingProgress: {
    en: 'Sending… {percent}% ({loaded} of {total}). Keep this page open.',
    ar: 'جارٍ الإرسال… {percent}% ({loaded} من {total}). أبقِ هذه الصفحة مفتوحة.',
  },
  receivedSaving: { en: 'Received. Saving…', ar: 'تم الاستلام. جارٍ الحفظ…' },
  addToReport: { en: '', ar: 'أضف {files} إلى التقرير' },
})

type Result = Awaited<ReturnType<typeof addReportAttachments>>

interface AddReportFilesProps {
  proposalId: number
  /** What the report already carries, so the caps count them too. */
  existingCount: number
  existingBytes: number
  onAdded: (result: Result) => void
}

const MB = 1024 * 1024

const AddReportFiles = ({ proposalId, existingCount, existingBytes, onAdded }: AddReportFilesProps) => {
  const [files, setFiles] = useState<File[]>([])
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const t = useT()
  const locale = useLocale()
  // Server messages are English: the Arabic site shows its own instead.
  const isAr = locale === 'ar'
  const fmt = useFormat()

  const problems = files.map((file) => problemWith(file, locale))
  const total = existingBytes + files.reduce((sum, f) => sum + f.size, 0)
  const tooMany = existingCount + files.length > REPORT_LIMITS.maxFiles
  const tooLarge = total > REPORT_LIMITS.maxTotalBytes
  const uploading = progress !== null
  const canSend = files.length > 0 && !uploading && !tooMany && !tooLarge && problems.every((p) => p === null)
  const percent = progress && progress.total ? Math.min(100, Math.round((progress.loaded / progress.total) * 100)) : 0

  const send = async () => {
    setError('')
    setProgress({ loaded: 0, total: files.reduce((sum, f) => sum + f.size, 0) })
    try {
      const result = await addReportAttachments(proposalId, files, (loaded, t) => setProgress({ loaded, total: t }))
      setFiles([])
      onAdded(result)
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      setError(!isAr && typeof detail === 'string' ? detail
        : err?.response?.status === 401 ? t(M.sessionExpired)
        : t(M.sendFailed))
    } finally {
      setProgress(null)
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-gray-300 p-3 space-y-2" data-testid="add-report-files">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-700">
          {t(M.missingFile)}
        </p>
        <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
          <UploadCloud className="w-4 h-4" /> {t(M.chooseFiles)}
        </button>
        <input ref={inputRef} type="file" multiple accept="image/*,video/*,application/pdf" className="hidden"
          data-testid="add-report-file-input"
          onChange={(e) => { setFiles((prev) => [...prev, ...Array.from(e.target.files || [])]); e.target.value = '' }} />
      </div>

      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((file, i) => (
            <li key={`${file.name}-${i}`}
              className={`text-sm rounded px-2 py-1 border ${problems[i] ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
              <div className="flex items-center gap-2">
                <Paperclip className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <span className="truncate flex-1" title={file.name}>{file.name}</span>
                <span className="text-xs text-gray-500">{formatBytes(file.size)}</span>
                <button type="button" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                  disabled={uploading} aria-label={t(RM.remove, { name: file.name })}
                  className="text-red-600 p-1 rounded hover:bg-red-50 disabled:opacity-50">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              {problems[i] && <p className="text-xs text-red-700 mt-1">{problems[i]}</p>}
            </li>
          ))}
          {(tooMany || tooLarge) && (
            <li className="text-xs text-red-700">
              {tooMany
                ? t(M.tooMany, { max: REPORT_LIMITS.maxFiles })
                : t(M.tooLarge, { limit: REPORT_LIMITS.maxTotalBytes / MB })}
            </li>
          )}
        </ul>
      )}

      {uploading && (
        <div className="space-y-1" role="status" aria-live="polite">
          <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-primary-600 transition-all" style={{ width: `${percent}%` }} />
          </div>
          <p className="text-sm text-gray-700">
            {percent < 100
              ? t(M.sendingProgress, { percent, loaded: formatBytes(progress!.loaded), total: formatBytes(progress!.total) })
              : t(M.receivedSaving)}
          </p>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-700 flex items-start gap-2"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}</p>
      )}

      {files.length > 0 && (
        <button type="button" onClick={() => void send()} disabled={!canSend}
          className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white text-sm font-semibold rounded-lg inline-flex items-center gap-2">
          {uploading
            ? <><Loader2 className="w-4 h-4 animate-spin" /> {t(RM.sendingPercent, { percent })}</>
            : isAr
              ? t(M.addToReport, { files: arabicFileCount(fmt.plural, files.length) })
              : <>Add {files.length} file{files.length === 1 ? '' : 's'} to the report</>}
        </button>
      )}
    </div>
  )
}

export default AddReportFiles
