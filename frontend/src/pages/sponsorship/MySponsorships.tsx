/**
 * /my-sponsorships — the donor's space.
 *
 * Per sponsorship, three questions: is it running, what did I give, and what
 * did it do. "What did it do" is answered with the case's own ledger —
 * received, distributed, the balance waiting — and each distribution line.
 * Nothing private is ever here: the backend's sponsor_view carries only the
 * public profile, the donor's own payments, and staff-written updates.
 */
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ExternalLink, FileDown, HeartHandshake, LogOut } from 'lucide-react'
import SEOHead from '../../components/SEOHead'
import Disclosure from '../../components/ui/Disclosure'
import PortalSignIn from '../../components/sponsorship/PortalSignIn'
import { ProfileAvatar } from '../../components/sponsorship/CaseCard'
import { NEED_LABELS } from '../../components/sponsorship/labels'
import { useCounts } from '../../components/sponsorship/useCounts'
import { defineMessages, useFormat, usePick, useT } from '../../i18n'
import { C } from '../../i18n/common'
import {
  assetUrl, cancelMySponsorship, clearSponsorshipPortalToken, fetchMySponsorships, fetchReceipt,
  hasSponsorshipPortalToken, type SponsorshipView,
} from '../../utils/sponsorshipApi'

const M = defineMessages({
  title: { en: 'My sponsorships', ar: 'كفالاتي' },
  lead: { en: 'Your sponsorships, your payments, and what your support has made possible.', ar: 'كفالاتك ومدفوعاتك وما أتاحه دعمك.' },
  signedInAs: { en: 'Sponsorships of {email}', ar: 'كفالات {email}' },
  signOut: { en: 'Sign out', ar: 'خروج' },
  none: { en: 'You have no sponsorship yet.', ar: 'ليست لديك أي كفالة بعد.' },
  findSomeone: { en: 'Find someone to sponsor', ar: 'اختر من تكفله' },
  active: { en: 'Active', ar: 'قائمة' },
  pastDue: { en: 'Payment problem', ar: 'مشكلة في الدفع' },
  canceled: { en: 'Stopped', ar: 'متوقفة' },
  ended: { en: 'Ended', ar: 'منتهية' },
  perMonth: { en: '{amount} a month', ar: '{amount} شهريًا' },
  since: { en: 'since {date}', ar: 'منذ {date}' },
  endedOn: { en: 'until {date}', ar: 'حتى {date}' },
  given: { en: 'You have given {amount}', ar: 'قدّمت حتى الآن {amount}' },
  pastDueBody: {
    en: 'Your last monthly payment did not go through. Stripe will try again; please check that your card is still valid.',
    ar: 'لم تنجح دفعتك الشهرية الأخيرة. سيعيد Stripe المحاولة؛ يُرجى التأكد من صلاحية بطاقتك.',
  },
  caseClosed: {
    en: 'This case has been closed, so your sponsorship ended and you are no longer charged. Thank you for everything you gave.',
    ar: 'تم إغلاق هذا الملف، فانتهت كفالتك ولن يُخصم منك أي مبلغ. جزاك الله خيرًا على كل ما قدّمت.',
  },
  impact: { en: 'How the support was used', ar: 'أوجه صرف الدعم' },
  impactSummary: { en: '{distributed} distributed of {received} received', ar: 'صُرف {distributed} من أصل {received} مستلمة' },
  ledgerReceived: { en: 'Received for them (all sponsors)', ar: 'المستلم لصالحهم (من كل الكفلاء)' },
  ledgerDistributed: { en: 'Distributed to them', ar: 'المصروف لهم' },
  ledgerBalance: { en: 'Waiting to be distributed', ar: 'بانتظار الصرف' },
  balanceNote: {
    en: 'Support is usually distributed once a month or when a need arises; the balance shows what is set aside for them.',
    ar: 'يُصرف الدعم عادةً مرة كل شهر أو عند ظهور حاجة، ويُظهر الرصيد ما خُصّص لهم.',
  },
  noDistribution: { en: 'No distribution recorded yet.', ar: 'لم تُسجَّل أي عملية صرف بعد.' },
  updates: { en: 'News', ar: 'الأخبار' },
  updatesSummary: { en: '{count} updates', ar: 'عدد الأخبار: {count}' },
  noUpdates: { en: 'No news yet. Our team will post here.', ar: 'لا توجد أخبار بعد، وسينشر فريقنا هنا.' },
  payments: { en: 'My payments and receipts', ar: 'مدفوعاتي وإيصالاتي' },
  paymentsSummary: { en: '{count} payments', ar: 'عدد الدفعات: {count}' },
  receipt: { en: 'Receipt', ar: 'إيصال' },
  profile: { en: 'See their profile', ar: 'عرض الصفحة' },
  stop: { en: 'Stop this sponsorship', ar: 'إيقاف هذه الكفالة' },
  stopTitle: { en: 'Stop sponsoring {name}?', ar: 'إيقاف كفالة {name}؟' },
  stopBody: {
    en: 'You will not be charged again. Their profile goes back to the list so someone else can take over your share.',
    ar: 'لن يُخصم منك أي مبلغ بعد الآن، وتعود صفحتهم إلى القائمة ليتولى غيرك حصتك.',
  },
  stopReason: { en: 'Would you tell us why? (optional)', ar: 'هل تخبرنا بالسبب؟ (اختياري)' },
  rFinancial: { en: 'My own finances', ar: 'ظروفي المالية' },
  rChanged: { en: 'I changed my mind', ar: 'غيّرت رأيي' },
  rOther: { en: 'I support someone else instead', ar: 'أدعم شخصًا آخر بدلًا من ذلك' },
  rOtherReason: { en: 'Another reason', ar: 'سبب آخر' },
  stopNote: { en: 'Anything else (optional)', ar: 'ملاحظات أخرى (اختياري)' },
  confirmStop: { en: 'Stop the sponsorship', ar: 'إيقاف الكفالة' },
  keep: { en: 'Keep it', ar: 'الإبقاء عليها' },
  stopping: { en: 'Stopping…', ar: 'جارٍ الإيقاف…' },
  stopFailed: { en: 'We could not stop the payments just now. Nothing has changed; please try again.', ar: 'تعذّر إيقاف الدفعات الآن. لم يتغير شيء؛ يُرجى المحاولة مرة أخرى.' },
  sessionExpired: { en: 'Your session has ended. Sign in again to continue.', ar: 'انتهت الجلسة. سجّل الدخول من جديد للمتابعة.' },
  loadFailed: { en: 'We could not load your sponsorships.', ar: 'تعذّر تحميل كفالاتك.' },
})

const httpStatus = (e: unknown) => (e as { response?: { status?: number } })?.response?.status

const StopDialog = ({ item, onClose, onStopped }: { item: SponsorshipView; onClose: () => void; onStopped: (v: SponsorshipView) => void }) => {
  const t = useT()
  const [reason, setReason] = useState<'' | 'financial' | 'changed_mind' | 'other_sponsorship' | 'other'>('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const name = item.case.display_name || item.case.reference

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const stop = async () => {
    setBusy(true)
    setFailed(false)
    try {
      onStopped(await cancelMySponsorship(item.id, { reason: reason || undefined, note: note.trim() || undefined }))
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="stop-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="stop-title" className="text-lg font-semibold text-gray-900">{t(M.stopTitle, { name })}</h2>
        <p className="mt-2 text-sm text-gray-700">{t(M.stopBody)}</p>
        <fieldset className="mt-4 space-y-2">
          <legend className="label">{t(M.stopReason)}</legend>
          {([['financial', M.rFinancial], ['changed_mind', M.rChanged], ['other_sponsorship', M.rOther], ['other', M.rOtherReason]] as const)
            .map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm text-gray-800">
                <input type="radio" name="stop-reason" checked={reason === value} onChange={() => setReason(value)} />
                {t(label)}
              </label>
            ))}
        </fieldset>
        <label htmlFor="stop-note" className="label mt-4">{t(M.stopNote)}</label>
        <textarea id="stop-note" className="input" rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
        {failed && <p className="alert-error mt-3" role="alert">{t(M.stopFailed)}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={busy} autoFocus>{t(M.keep)}</button>
          <button type="button" className="btn-danger btn-sm" onClick={stop} disabled={busy}>{busy ? t(M.stopping) : t(M.confirmStop)}</button>
        </div>
      </div>
    </div>
  )
}

const SponsorshipCard = ({ item, onChange }: { item: SponsorshipView; onChange: (v: SponsorshipView) => void }) => {
  const t = useT()
  const pick = usePick()
  const { money, date } = useFormat()
  const counts = useCounts()
  const [stopping, setStopping] = useState(false)
  const name = item.case.display_name || item.case.reference
  const running = item.status === 'active' || item.status === 'past_due'
  const statusLabel = { active: M.active, past_due: M.pastDue, canceled: M.canceled, ended: M.ended, pending: M.active, abandoned: M.ended }[item.status]
  const statusClass = item.status === 'active' ? 'badge-success' : item.status === 'past_due' ? 'badge-warning' : 'badge-neutral'
  const { collected_cents, disbursed_cents, balance_cents } = item.finances
  const distributedShare = collected_cents > 0 ? Math.min(100, Math.round((disbursed_cents / collected_cents) * 100)) : 0

  const openReceipt = async (donationId: number) => {
    const blob = await fetchReceipt(item.id, donationId)
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const facts: string[] = []
  if (item.case.age != null) facts.push(counts.age(item.case.age))
  if (item.case.household_size) facts.push(counts.household(item.case.household_size))

  return (
    <article className="card space-y-4">
      <header className="flex items-start gap-4">
        <ProfileAvatar card={item.case} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-heading font-semibold text-gray-900">{name}</h2>
            <span className={statusClass}>{t(statusLabel)}</span>
          </div>
          <p className="text-sm text-gray-600">{[...facts, [item.case.region, item.case.country].filter(Boolean).join('، ')].join(' · ')}</p>
          <p className="mt-1 text-sm text-gray-800">
            <span className="font-semibold">{t(M.perMonth, { amount: money(item.monthly_amount_cents) })}</span>
            {item.started_at && <span className="text-gray-600"> · {t(M.since, { date: date(item.started_at) })}</span>}
            {item.ended_at && <span className="text-gray-600"> · {t(M.endedOn, { date: date(item.ended_at) })}</span>}
          </p>
          <p className="text-sm text-accent-700">{t(M.given, { amount: money(item.total_given_cents) })}</p>
        </div>
      </header>

      {item.status === 'past_due' && (
        <p className="alert-warning"><AlertTriangle aria-hidden="true" className="h-4 w-4 flex-shrink-0" />{t(M.pastDueBody)}</p>
      )}
      {item.status === 'ended' && item.end_reason === 'case_closed' && <p className="alert-info">{t(M.caseClosed)}</p>}

      <div className="space-y-2">
        <Disclosure variant="plain" defaultOpen={running}
          title={t(M.impact)}
          summary={t(M.impactSummary, { distributed: money(disbursed_cents), received: money(collected_cents) })}>
          <dl className="grid grid-cols-3 gap-3 text-center">
            {[[M.ledgerReceived, collected_cents], [M.ledgerDistributed, disbursed_cents], [M.ledgerBalance, balance_cents]].map(([label, value]) => (
              <div key={(label as { en: string }).en} className="rounded-lg bg-gray-50 p-3">
                <dt className="text-xs text-gray-600">{t(label as { en: string; ar: string })}</dt>
                <dd className="ltr-nums mt-1 font-semibold text-gray-900">{money(value as number)}</dd>
              </div>
            ))}
          </dl>
          {collected_cents > 0 && (
            <div className="h-2 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
              <div className="h-full rounded-full bg-accent-500" style={{ width: `${distributedShare}%` }} />
            </div>
          )}
          <p className="text-xs text-gray-500">{t(M.balanceNote)}</p>
          {item.disbursements.length === 0 ? (
            <p className="text-sm text-gray-600">{t(M.noDistribution)}</p>
          ) : (
            <ul className="divide-y divide-gray-100 text-sm">
              {item.disbursements.map((d) => (
                <li key={d.id} className="flex justify-between gap-3 py-2">
                  <span>
                    <span className="font-medium text-gray-900">{t(NEED_LABELS[d.category])}</span>
                    <span className="block text-gray-600" dir="auto">{pick(d.description, d.description_ar)}</span>
                    <span className="text-xs text-gray-500">{date(d.disbursed_at)}</span>
                  </span>
                  <span className="ltr-nums font-semibold">{money(d.amount_cents)}</span>
                </li>
              ))}
            </ul>
          )}
        </Disclosure>

        <Disclosure variant="plain" title={t(M.updates)} summary={t(M.updatesSummary, { count: item.updates.length })}>
          {item.updates.length === 0 ? <p className="text-sm text-gray-600">{t(M.noUpdates)}</p> : (
            <ul className="space-y-4">
              {item.updates.map((u) => (
                <li key={u.id}>
                  <p className="font-medium text-gray-900" dir="auto">{pick(u.title, u.title_ar)}</p>
                  <p className="text-xs text-gray-500">{date(u.created_at)}</p>
                  {assetUrl(u.photo_url) && <img src={assetUrl(u.photo_url)!} alt="" className="mt-2 max-h-64 rounded-lg object-cover" />}
                  <p className="mt-1 whitespace-pre-line text-sm text-gray-700" dir="auto">{pick(u.body, u.body_ar)}</p>
                </li>
              ))}
            </ul>
          )}
        </Disclosure>

        <Disclosure variant="plain" title={t(M.payments)} summary={t(M.paymentsSummary, { count: item.payments.length })}>
          <ul className="divide-y divide-gray-100 text-sm">
            {item.payments.map((p) => (
              <li key={p.donation_id} className="flex items-center justify-between gap-3 py-2">
                <span>{date(p.paid_at)}</span>
                <span className="flex items-center gap-3">
                  <span className="ltr-nums font-semibold">{money(p.amount_cents)}</span>
                  <button type="button" className="btn-ghost btn-sm gap-1" onClick={() => openReceipt(p.donation_id)}>
                    <FileDown aria-hidden="true" className="h-4 w-4" />{t(M.receipt)}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </Disclosure>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3">
        {item.case.case_status === 'published' ? (
          <Link to={`/sponsor/${item.case.reference}`} className="link inline-flex items-center gap-1 text-sm">
            {t(M.profile)} <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        ) : <span />}
        {running && (
          <button type="button" className="btn-ghost btn-sm text-red-700 hover:bg-red-50" onClick={() => setStopping(true)}>
            {t(M.stop)}
          </button>
        )}
      </footer>
      {stopping && <StopDialog item={item} onClose={() => setStopping(false)} onStopped={(v) => { setStopping(false); onChange(v) }} />}
    </article>
  )
}

const MySponsorships = () => {
  const t = useT()
  const [signedIn, setSignedIn] = useState(hasSponsorshipPortalToken())
  const [email, setEmail] = useState('')
  const [items, setItems] = useState<SponsorshipView[] | null>(null)
  const [error, setError] = useState<'none' | 'expired' | 'failed'>('none')

  const load = useCallback(async () => {
    try {
      const data = await fetchMySponsorships()
      setEmail(data.email)
      setItems(data.items)
      setError('none')
    } catch (err) {
      if (httpStatus(err) === 401) {
        clearSponsorshipPortalToken()
        setSignedIn(false)
        setError('expired')
      } else {
        setError('failed')
      }
    }
  }, [])

  useEffect(() => { if (signedIn) load() }, [signedIn, load])

  return (
    <div className="bg-gray-50 pb-16">
      <SEOHead title={t(M.title)} description={t(M.lead)} canonicalPath="/my-sponsorships" noindex />
      <div className="page-header bg-white">
        <div className="section-container">
          <h1 className="page-title">{t(M.title)}</h1>
          <p className="page-lead">{t(M.lead)}</p>
        </div>
      </div>
      <div className="section-container mt-8 max-w-4xl">
        {!signedIn ? (
          <>
            {error === 'expired' && <p className="alert-warning mx-auto mb-4 max-w-md">{t(M.sessionExpired)}</p>}
            <PortalSignIn audience="sponsor" initialEmail={email} onSignedIn={(e) => { setEmail(e); setSignedIn(true) }} />
          </>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-gray-600">{email && t(M.signedInAs, { email })}</p>
              <div className="flex gap-2">
                <Link to="/sponsor" className="btn-secondary btn-sm gap-1.5"><HeartHandshake aria-hidden="true" className="h-4 w-4" />{t(M.findSomeone)}</Link>
                <button type="button" className="btn-ghost btn-sm gap-1.5"
                  onClick={() => { clearSponsorshipPortalToken(); setSignedIn(false); setItems(null) }}>
                  <LogOut aria-hidden="true" className="h-4 w-4" />{t(M.signOut)}
                </button>
              </div>
            </div>
            {error === 'failed' && (
              <div className="alert-error justify-between" role="alert">
                <span>{t(M.loadFailed)}</span>
                <button type="button" className="btn-secondary btn-sm" onClick={load}>{t(C.tryAgain)}</button>
              </div>
            )}
            {items === null && error === 'none' && <p role="status" className="py-10 text-center text-gray-600">{t(C.loading)}</p>}
            {items && items.length === 0 && (
              <div className="card text-center">
                <p className="text-gray-700">{t(M.none)}</p>
                <Link to="/sponsor" className="btn-primary mt-4">{t(M.findSomeone)}</Link>
              </div>
            )}
            {items?.map((item) => (
              <SponsorshipCard key={item.id} item={item}
                onChange={(v) => setItems((list) => (list || []).map((x) => (x.id === v.id ? v : x)))} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default MySponsorships
