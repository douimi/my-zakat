/**
 * The completion-report form on the submitter portal.
 *
 * Teams were getting lost here, and a 50 MB PDF of invoices and photos (the
 * file the agreement asks for) was refused or died part-way without a word. So
 * the form is three numbered steps, says what it accepts before anyone picks a
 * file, and checks every file against the server's limits the moment it is
 * added, rather than after minutes of uploading.
 *
 * It owns its session problem too. The server checks the portal token only
 * after the whole body has arrived, so a team that wrote for twenty-five
 * minutes would upload its report and only then hear the session had lapsed.
 * Before sending, the form reads the token's expiry and, if the upload might
 * outlast it, asks for a fresh code first, on the spot, with the text and
 * files still in place. A 401 that slips through gets the same treatment.
 *
 * The narrative is saved on the device as it is typed, so a closed tab or an
 * expired session never costs the writing. Files cannot be saved that way.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle, FileText, KeyRound, Loader2, Paperclip, Send, Trash2, UploadCloud,
} from 'lucide-react'
import {
  REPORT_LIMITS,
  clearPortalToken,
  portalTokenSecondsLeft,
  requestPortalCode,
  submitCompletionReport,
  verifyPortalCode,
  type PortalProposal,
} from '../../utils/proposalPortalApi'
import { defineMessages, interpolate, useFormat, useLocale, useT, type Locale } from '../../i18n'
import { C } from '../../i18n/common'

/** Strings of the report form; AddReportFiles reuses the shared ones. */
export const REPORT_MESSAGES = defineMessages({
  fileEmpty: { en: 'This file is empty.', ar: 'هذا الملف فارغ.' },
  fileTooBig: {
    en: 'This file is {size}; the limit is {limit} MB per file. Split it into two PDFs, or compress the photos inside it.',
    ar: 'حجم هذا الملف {size}، والحد الأقصى {limit} MB للملف الواحد. قسّمه إلى ملفَّي PDF، أو صغّر حجم الصور التي بداخله.',
  },
  heic: {
    en: 'iPhone HEIC photos are not accepted. Export them as JPEG, or put them in your PDF.',
    ar: 'صور iPhone بصيغة HEIC غير مقبولة. احفظها بصيغة JPEG، أو ضعها داخل ملف PDF.',
  },
  badType: { en: 'Only photos, videos and PDF documents can be attached.', ar: 'يمكن إرفاق الصور ومقاطع الفيديو وملفات PDF فقط.' },
  sendFailed: {
    en: 'The report could not be sent. Check your connection and try again; your text and files are still here.',
    ar: 'تعذّر إرسال التقرير. تحقق من اتصالك بالإنترنت وحاول مرة أخرى، فالنص والملفات ما زالت هنا.',
  },
  adminExpired: {
    en: 'Your admin view of this portal has expired (or is about to). Reopen it from the dossier in the admin console. Your text is saved on this device; add the files again there.',
    ar: 'انتهت صلاحية عرض المسؤول لهذه البوابة (أو أوشكت على الانتهاء). أعد فتحه من ملف الطلب في لوحة الإدارة. نصك محفوظ على هذا الجهاز، وعليك إضافة الملفات مرة أخرى هناك.',
  },
  sessionExpiredNoEmail: {
    en: 'Your sign-in session has expired. Your text is saved on this device: sign out, sign in again, and add your files once more.',
    ar: 'انتهت جلسة تسجيل الدخول. نصك محفوظ على هذا الجهاز: سجّل الخروج، ثم سجّل الدخول من جديد، وأضف ملفاتك مرة أخرى.',
  },
  expiredWhileSending: {
    en: 'Your session expired while sending. We have emailed a new code to {email}. Enter it and your report will be sent. Your text and files are kept.',
    ar: 'انتهت جلستك أثناء الإرسال. أرسلنا رمز تحقق جديدًا إلى {email}. أدخله وسيُرسَل تقريرك. النص والملفات محفوظة.',
  },
  confirmItsYou: {
    en: 'Before sending, please confirm it is you: we have emailed a new six-digit code to {email}. Your text and files are kept.',
    ar: 'قبل الإرسال، يُرجى تأكيد هويتك: أرسلنا رمز تحقق جديدًا من ست خانات إلى {email}. النص والملفات محفوظة.',
  },
  tooManyCodes: {
    en: '',
    ar: 'طلبت رموزًا كثيرة خلال وقت قصير. يُرجى الانتظار بضع دقائق ثم المحاولة مرة أخرى، فالنص والملفات ما زالت هنا.',
  },
  codeEmailFailed: {
    en: 'We could not email you a new sign-in code. Please try again in a few minutes; your text and files are still here.',
    ar: 'لم نتمكن من إرسال رمز تحقق جديد إلى بريدك. يُرجى المحاولة بعد بضع دقائق، فالنص والملفات ما زالت هنا.',
  },
  codeInvalid: {
    en: 'That code is not valid or has expired. Use the newest code we sent.',
    ar: 'هذا الرمز غير صحيح أو انتهت صلاحيته. استخدم أحدث رمز أرسلناه إليك.',
  },
  codeCheckFailed: { en: 'We could not check that code. Please try again.', ar: 'تعذّر التحقق من الرمز. يُرجى المحاولة مرة أخرى.' },
  titleCorrected: { en: 'Send a corrected completion report', ar: 'أرسل تقرير الإنجاز بعد تصحيحه' },
  title: { en: 'Send your completion report', ar: 'أرسل تقرير الإنجاز' },
  lead: {
    en: 'Three steps. You can come back to this page: what you write is saved on this device.',
    ar: 'ثلاث خطوات فقط. يمكنك العودة إلى هذه الصفحة لاحقًا، فما تكتبه يُحفظ على هذا الجهاز.',
  },
  describe: { en: 'Describe what was done', ar: 'صِف ما تم إنجازه' },
  describeHint: {
    en: 'How many beneficiaries were served, what was distributed, what was actually spent, any funds left over, and anything that differed from the approved plan.',
    ar: 'كم عدد المستفيدين، وما الذي وُزّع، وكم أُنفق فعلًا، وهل بقي شيء من المبلغ، وما الذي اختلف عن الخطة المعتمدة.',
  },
  describePlaceholder: {
    en: 'We distributed food parcels to 48 of the 50 planned families…',
    ar: 'وزّعنا سلالًا غذائية على 48 أسرة من أصل 50 أسرة كانت في الخطة…',
  },
  attach: { en: 'Attach your report and evidence', ar: 'أرفق تقريرك والإثباتات' },
  dropFiles: { en: 'Drop files here, or', ar: 'اسحب الملفات وأفلتها هنا، أو' },
  chooseFiles: { en: 'choose files', ar: 'اختر الملفات' },
  accepts: {
    en: 'One PDF with all your invoices and photos is fine. Photos, videos or PDFs, up to {perFile} MB each and {total} MB in total.',
    ar: 'يكفي ملف PDF واحد يضم كل فواتيرك وصورك. يمكنك إرفاق صور أو مقاطع فيديو أو ملفات PDF، بحد أقصى {perFile} MB للملف الواحد و{total} MB للمجموع.',
  },
  remove: { en: 'Remove {name}', ar: 'إزالة {name}' },
  totalLine: { en: '', ar: '{files}، الحجم الإجمالي {size}' },
  overTotal: {
    en: ' — over the {limit} MB limit. Send the largest files in a second report.',
    ar: ' — يتجاوز الحد الأقصى البالغ {limit} MB. أرسل الملفات الأكبر في تقرير ثانٍ.',
  },
  overCount: { en: ' — at most {max} files per report.', ar: ' — الحد الأقصى {max} ملفًا لكل تقرير.' },
  send: { en: 'Send', ar: 'الإرسال' },
  sendingProgress: {
    en: 'Sending… {percent}% ({loaded} of {total}). Keep this page open until it finishes.',
    ar: 'جارٍ الإرسال… {percent}% ({loaded} من {total}). أبقِ هذه الصفحة مفتوحة حتى ينتهي الإرسال.',
  },
  receivedSaving: { en: 'Received. Saving your report…', ar: 'تم الاستلام. جارٍ حفظ تقريرك…' },
  codeLabel: { en: 'Six-digit code', ar: 'رمز التحقق المكوّن من ست خانات' },
  confirmAndSend: { en: 'Confirm and send', ar: 'تأكيد وإرسال' },
  newCode: { en: 'Send me a new code', ar: 'أرسل لي رمزًا جديدًا' },
  noFile: { en: 'No file is attached.', ar: 'لم تُرفق أي ملف.' },
  noFileQuestion: {
    en: 'The agreement asks for your receipts, invoices and photographs. Send the report without them?',
    ar: 'تطلب الاتفاقية إيصالاتك وفواتيرك وصورك. هل تريد إرسال التقرير بدونها؟',
  },
  addFiles: { en: 'Add files', ar: 'أضف ملفات' },
  sendWithoutFiles: { en: 'Send without files', ar: 'أرسل دون ملفات' },
  sendingPercent: { en: 'Sending {percent}%', ar: 'جارٍ الإرسال {percent}%' },
  sendReport: { en: 'Send report', ar: 'أرسل التقرير' },
  writeFirst: { en: 'Write a short description in step 1 to enable sending.', ar: 'اكتب وصفًا قصيرًا في الخطوة 1 حتى يصبح الإرسال ممكنًا.' },
})
const RM = REPORT_MESSAGES

/** "3 files" in Arabic, with its six plural forms. */
export const arabicFileCount = (plural: ReturnType<typeof useFormat>['plural'], count: number) =>
  plural(count, { zero: 'لا ملفات', one: 'ملف واحد', two: 'ملفان', few: '{count} ملفات', many: '{count} ملفًا', other: '{count} ملف' })

export type ReportResult = Awaited<ReturnType<typeof submitCompletionReport>>

interface ReportFormProps {
  proposal: Pick<PortalProposal, 'id' | 'status'>
  /** The address the portal session belongs to, for requesting a fresh code. */
  email: string
  onSubmitted: (result: ReportResult) => void
  onCancel: () => void
  /** An admin acting for the team. A lapsed session must then never email the
   *  team a sign-in code; the admin reopens the view from the console. */
  adminView?: boolean
}

type Phase = 'editing' | 'uploading' | 'code'

const draftKey = (id: number) => `myzakat:report-draft:${id}`

const readDraft = (id: number): string => {
  try { return localStorage.getItem(draftKey(id)) || '' } catch { return '' }
}
const writeDraft = (id: number, text: string) => {
  try {
    if (text) localStorage.setItem(draftKey(id), text)
    else localStorage.removeItem(draftKey(id))
  } catch { /* private mode or storage full: the draft is a convenience */ }
}

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const MB = 1024 * 1024

/** Why the server would refuse this file, or null. Mirrors report_attachments.py. */
export const problemWith = (file: File, locale: Locale = 'en'): string | null => {
  if (file.size === 0) return RM.fileEmpty[locale]
  if (file.size > REPORT_LIMITS.maxFileBytes) {
    return interpolate(RM.fileTooBig[locale], { size: formatBytes(file.size), limit: REPORT_LIMITS.maxFileBytes / MB })
  }
  const type = (file.type || '').toLowerCase()
  if (/hei[cf]/.test(type) || /\.hei[cf]$/i.test(file.name)) {
    return RM.heic[locale]
  }
  if (type && !(type.startsWith('image/') || type.startsWith('video/') || type === 'application/pdf')) {
    return RM.badType[locale]
  }
  return null
}

const statusOf = (error: any): number | undefined => error?.response?.status
const detailOf = (error: any): unknown => error?.response?.data?.detail

const ReportForm = ({ proposal, email, onSubmitted, onCancel, adminView = false }: ReportFormProps) => {
  const [text, setText] = useState(() => readDraft(proposal.id))
  const [files, setFiles] = useState<File[]>([])
  const [phase, setPhase] = useState<Phase>('editing')
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null)
  const [error, setError] = useState('')
  const [code, setCode] = useState('')
  const [codeNotice, setCodeNotice] = useState('')
  const [dragging, setDragging] = useState(false)
  // A report without a single file is almost always a mistake (the file was
  // refused, or forgotten), so sending one takes a second, deliberate click.
  const [askNoFiles, setAskNoFiles] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const t = useT()
  const locale = useLocale()
  // Server messages are English: the Arabic site shows its own instead.
  const isAr = locale === 'ar'
  const fmt = useFormat()

  const resubmitting = proposal.status === 'report_changes_requested'

  useEffect(() => { writeDraft(proposal.id, text) }, [proposal.id, text])

  // Leaving mid-upload throws the upload away; the browser asks first.
  useEffect(() => {
    if (phase !== 'uploading') return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [phase])

  const problems = useMemo(() => files.map((file) => problemWith(file, locale)), [files, locale])
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0)
  const tooMany = files.length > REPORT_LIMITS.maxFiles
  const tooLarge = totalBytes > REPORT_LIMITS.maxTotalBytes
  const filesOk = !tooMany && !tooLarge && problems.every((p) => p === null)
  const canSend = phase === 'editing' && text.trim().length > 0 && filesOk

  const addFiles = (picked: FileList | null) => {
    if (!picked) return
    // Appended, not replaced: receipts and photos come in separate trips
    // through the file dialog.
    setFiles((prev) => [...prev, ...Array.from(picked)])
    setError('')
    setAskNoFiles(false)
  }

  const upload = async () => {
    setPhase('uploading')
    setError('')
    setProgress({ loaded: 0, total: totalBytes })
    try {
      const result = await submitCompletionReport(
        proposal.id, text.trim(), files, (loaded, total) => setProgress({ loaded, total }))
      writeDraft(proposal.id, '')
      onSubmitted(result)
    } catch (err: any) {
      setProgress(null)
      if (statusOf(err) === 401) {
        clearPortalToken()
        await startReauth('expired')
        return
      }
      const detail = detailOf(err)
      setError(!isAr && typeof detail === 'string'
        ? detail
        : t(RM.sendFailed))
      setPhase('editing')
    }
  }

  const startReauth = async (reason: 'expiring' | 'expired') => {
    if (adminView) {
      setError(t(RM.adminExpired))
      setPhase('editing')
      return
    }
    if (!email.trim()) {
      setError(t(RM.sessionExpiredNoEmail))
      setPhase('editing')
      return
    }
    try {
      await requestPortalCode(email.trim())
      setCode('')
      setCodeNotice(reason === 'expired'
        ? t(RM.expiredWhileSending, { email: email.trim() })
        : t(RM.confirmItsYou, { email: email.trim() }))
      setPhase('code')
    } catch (err: any) {
      const detail = detailOf(err)
      setError(statusOf(err) === 429 && typeof detail === 'string'
        ? (isAr ? t(RM.tooManyCodes) : detail)
        : t(RM.codeEmailFailed))
      setPhase('editing')
    }
  }

  const send = async (withoutFiles = false) => {
    if (!canSend) return
    if (files.length === 0 && !withoutFiles) {
      setAskNoFiles(true)
      return
    }
    setAskNoFiles(false)
    // Time for the upload at 1 Mbit/s, plus five minutes of slack. Below that
    // the token could expire mid-upload, and the server would refuse the
    // report only once every byte had arrived.
    const needed = 5 * 60 + (totalBytes * 8) / 1_000_000
    const left = portalTokenSecondsLeft()
    if (left === null || left < needed) {
      await startReauth('expiring')
      return
    }
    await upload()
  }

  const confirmCode = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    try {
      await verifyPortalCode(email.trim(), code)
    } catch (err: any) {
      setError(statusOf(err) === 401
        ? t(RM.codeInvalid)
        : t(RM.codeCheckFailed))
      return
    }
    await upload()
  }

  const percent = progress && progress.total
    ? Math.min(100, Math.round((progress.loaded / progress.total) * 100))
    : 0
  const busy = phase !== 'editing'

  return (
    <div className="pt-4 border-t border-gray-100 space-y-5" data-testid="report-form">
      <div>
        <h3 className="text-base font-bold text-gray-900">
          {resubmitting ? t(RM.titleCorrected) : t(RM.title)}
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          {t(RM.lead)}
        </p>
      </div>

      {/* ── Step 1 ── */}
      <section className="space-y-2">
        <label htmlFor={`report-${proposal.id}`} className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <span className="w-6 h-6 rounded-full bg-primary-600 text-white text-xs flex items-center justify-center">1</span>
          {t(RM.describe)}
        </label>
        <p className="text-xs text-gray-500 ps-8">
          {t(RM.describeHint)}
        </p>
        <textarea
          id={`report-${proposal.id}`}
          rows={7}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-50"
          placeholder={t(RM.describePlaceholder)}
        />
      </section>

      {/* ── Step 2 ── */}
      <section className="space-y-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <span className="w-6 h-6 rounded-full bg-primary-600 text-white text-xs flex items-center justify-center">2</span>
          {t(RM.attach)}
        </p>
        <div
          onDragOver={(e) => { e.preventDefault(); if (!busy) setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); if (!busy) addFiles(e.dataTransfer.files) }}
          className={`ms-8 border-2 border-dashed rounded-lg p-4 text-center ${dragging ? 'border-primary-500 bg-primary-50' : 'border-gray-300'}`}
        >
          <UploadCloud className="w-7 h-7 text-gray-400 mx-auto mb-1" />
          <p className="text-sm text-gray-700">
            {t(RM.dropFiles)}{' '}
            <button type="button" disabled={busy} onClick={() => inputRef.current?.click()}
              className="text-primary-700 font-semibold hover:underline disabled:text-gray-400">
              {t(RM.chooseFiles)}
            </button>
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {t(RM.accepts, { perFile: REPORT_LIMITS.maxFileBytes / MB, total: REPORT_LIMITS.maxTotalBytes / MB })}
          </p>
          <input
            ref={inputRef}
            data-testid="report-file-input"
            type="file"
            multiple
            accept="image/*,video/*,application/pdf"
            onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
            disabled={busy}
            className="hidden"
          />
        </div>

        {files.length > 0 && (
          <ul className="ms-8 space-y-1">
            {files.map((file, i) => (
              <li key={`${file.name}-${i}`}
                className={`text-sm rounded px-2 py-1 border ${problems[i] ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                <div className="flex items-center gap-2">
                  {file.type === 'application/pdf'
                    ? <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    : <Paperclip className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
                  <span className="truncate flex-1 text-gray-800" title={file.name}>{file.name}</span>
                  <span className="text-xs text-gray-500">{formatBytes(file.size)}</span>
                  <button type="button" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    disabled={busy} aria-label={t(RM.remove, { name: file.name })}
                    className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50 disabled:opacity-50">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {problems[i] && <p className="text-xs text-red-700 mt-1">{problems[i]}</p>}
              </li>
            ))}
            <li className={`text-xs pt-1 ${tooLarge || tooMany ? 'text-red-700' : 'text-gray-500'}`}>
              {isAr
                ? t(RM.totalLine, { files: arabicFileCount(fmt.plural, files.length), size: formatBytes(totalBytes) })
                : <>{files.length} file{files.length === 1 ? '' : 's'}, {formatBytes(totalBytes)} in total</>}
              {tooLarge && t(RM.overTotal, { limit: REPORT_LIMITS.maxTotalBytes / MB })}
              {tooMany && t(RM.overCount, { max: REPORT_LIMITS.maxFiles })}
            </li>
          </ul>
        )}
      </section>

      {/* ── Step 3 ── */}
      <section className="space-y-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <span className="w-6 h-6 rounded-full bg-primary-600 text-white text-xs flex items-center justify-center">3</span>
          {t(RM.send)}
        </p>

        {phase === 'uploading' && progress && (
          <div className="ms-8 space-y-1" role="status" aria-live="polite">
            <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-primary-600 transition-all" style={{ width: `${percent}%` }} />
            </div>
            <p className="text-sm text-gray-700">
              {percent < 100
                ? t(RM.sendingProgress, { percent, loaded: formatBytes(progress.loaded), total: formatBytes(progress.total) })
                : t(RM.receivedSaving)}
            </p>
          </div>
        )}

        {phase === 'code' && (
          <form onSubmit={confirmCode} className="ms-8 rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
            <p className="text-sm text-amber-900 flex items-start gap-2">
              <KeyRound className="w-4 h-4 mt-0.5 shrink-0" /> {codeNotice}
            </p>
            <div className="flex gap-2">
              <input
                aria-label={t(RM.codeLabel)}
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="input-field tracking-[0.4em] text-center font-semibold max-w-[10rem]"
                placeholder="000000"
              />
              <button type="submit" disabled={code.length !== 6}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white font-semibold rounded-lg">
                {t(RM.confirmAndSend)}
              </button>
            </div>
            <button type="button" onClick={() => void startReauth('expiring')}
              className="text-xs text-primary-700 font-medium hover:underline">
              {t(RM.newCode)}
            </button>
          </form>
        )}

        {askNoFiles && phase === 'editing' && (
          <div className="ms-8 rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2" role="alert">
            <p className="text-sm text-amber-900">
              <strong>{t(RM.noFile)}</strong> {t(RM.noFileQuestion)}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => { setAskNoFiles(false); inputRef.current?.click() }}
                className="px-3 py-1.5 text-sm bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg">
                {t(RM.addFiles)}
              </button>
              <button type="button" onClick={() => void send(true)}
                className="px-3 py-1.5 text-sm bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 rounded-lg">
                {t(RM.sendWithoutFiles)}
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="ms-8 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
          </p>
        )}

        {phase !== 'code' && (
          <div className="ms-8 flex flex-wrap gap-2">
            <button type="button" onClick={() => void send()} disabled={!canSend || askNoFiles}
              className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white font-semibold rounded-lg inline-flex items-center gap-2">
              {phase === 'uploading'
                ? <><Loader2 className="w-4 h-4 animate-spin" /> {t(RM.sendingPercent, { percent })}</>
                : <><Send className="w-4 h-4" /> {t(RM.sendReport)}</>}
            </button>
            <button type="button" onClick={onCancel} disabled={phase === 'uploading'}
              className="px-5 py-2.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 font-semibold rounded-lg disabled:opacity-50">
              {t(C.cancel)}
            </button>
          </div>
        )}
        {phase === 'editing' && !text.trim() && (
          <p className="ms-8 text-xs text-gray-500">{t(RM.writeFirst)}</p>
        )}
      </section>
    </div>
  )
}

export default ReportForm
