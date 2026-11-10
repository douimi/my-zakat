/**
 * Shows a downloaded file inside the page: a PDF in an embedded viewer, an
 * image or a video in place, anything else as a download.
 *
 * It replaces opening the file in a new tab. That needed the tab opened
 * before the authenticated fetch (or the pop-up blocker drops it), then
 * pointed at a blob: URL afterwards, and in real browsers it left people
 * staring at an empty about:blank tab. Showing the file in the same document
 * involves no pop-up and no cross-window navigation, and it works the same
 * on a phone.
 */
import { useEffect } from 'react'
import { Download, X } from 'lucide-react'
import { defineMessages, useT } from '../i18n'

const M = defineMessages({
  download: { en: 'Download', ar: 'تنزيل' },
  closePreview: { en: 'Close preview', ar: 'إغلاق المعاينة' },
  cannotShow: {
    en: 'This file cannot be shown here. Use Download to open it on your device.',
    ar: 'لا يمكن عرض هذا الملف هنا. اضغط «تنزيل» لفتحه على جهازك.',
  },
  pdfHint: {
    en: 'Nothing showing? Some phones cannot display PDFs inside a page. Use Download.',
    ar: 'لا يظهر شيء؟ بعض الهواتف لا تعرض ملفات PDF داخل الصفحة. اضغط «تنزيل».',
  },
})

export interface PreviewFile {
  url: string
  filename: string
  type: string
}

/** Wrap a fetched Blob for the preview. The caller owns nothing after this:
 *  the preview revokes the object URL when it closes. */
export const previewOf = (blob: Blob, filename: string, type?: string): PreviewFile => ({
  url: URL.createObjectURL(blob),
  filename,
  type: (type || blob.type || '').toLowerCase(),
})

interface FilePreviewProps {
  file: PreviewFile
  onClose: () => void
}

const FilePreview = ({ file, onClose }: FilePreviewProps) => {
  const t = useT()
  // The object URL holds the whole file in memory until it is revoked.
  useEffect(() => () => URL.revokeObjectURL(file.url), [file.url])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.filename)
  const isImage = file.type.startsWith('image/')
  const isVideo = file.type.startsWith('video/')

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-2 sm:p-6"
      role="dialog" aria-modal="true" aria-label={file.filename} onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl h-full max-h-[94vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200">
          <p className="font-semibold text-gray-900 truncate" dir="auto" title={file.filename}>{file.filename}</p>
          <div className="flex items-center gap-2 shrink-0">
            <a href={file.url} download={file.filename}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg bg-primary-600 hover:bg-primary-700 text-white">
              <Download className="w-4 h-4" /> {t(M.download)}
            </a>
            <button type="button" onClick={onClose} aria-label={t(M.closePreview)}
              className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 bg-gray-100 flex items-center justify-center overflow-auto">
          {isPdf ? (
            <iframe title={file.filename} src={file.url} className="w-full h-full border-0 bg-white" />
          ) : isImage ? (
            <img src={file.url} alt={file.filename} className="max-w-full max-h-full object-contain" />
          ) : isVideo ? (
            <video src={file.url} controls className="max-w-full max-h-full" />
          ) : (
            <p className="text-sm text-gray-600 p-6 text-center">
              {t(M.cannotShow)}
            </p>
          )}
        </div>
        {isPdf && (
          <p className="shrink-0 px-4 py-2 text-xs text-gray-500 border-t border-gray-200">
            {t(M.pdfHint)}
          </p>
        )}
      </div>
    </div>
  )
}

export default FilePreview
