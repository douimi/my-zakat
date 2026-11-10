/**
 * /sponsor/:ref — one verified profile and the box to sponsor it.
 *
 * Only curated public fields reach this page (the backend's public_detail):
 * a display name, an age, a region, a staff-written story. The sponsorship box
 * never offers more than what is still uncovered — the server enforces it too,
 * counting checkouts other donors have open right now.
 */
import { useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from 'react-query'
import { useStripe } from '@stripe/react-stripe-js'
import { ArrowLeft, BadgeCheck, EyeOff, Lock, MapPin, ShieldCheck } from 'lucide-react'
import { clsx } from 'clsx'
import SEOHead from '../../components/SEOHead'
import CaseCard, { CoverageBar, ProfileAvatar } from '../../components/sponsorship/CaseCard'
import { DOC_LABELS, GENDER_LABELS, NEED_LABELS, RELATION_LABELS } from '../../components/sponsorship/labels'
import { useCounts } from '../../components/sponsorship/useCounts'
import { defineMessages, useFormat, useLocale, usePick, useT } from '../../i18n'
import { C } from '../../i18n/common'
import { errorDetail, fetchCase, startCheckout, type PublicDetail } from '../../utils/sponsorshipApi'

const MIN_CENTS = 1000
const SHARES = [2500, 5000, 10000]

const M = defineMessages({
  back: { en: 'All profiles', ar: 'كل الملفات' },
  notFoundTitle: { en: 'This profile is no longer available', ar: 'هذا الملف لم يعد متاحًا' },
  notFoundBody: {
    en: 'It may have been fully sponsored and closed, or paused while our team checks something. Many others are still waiting.',
    ar: 'ربما اكتملت كفالته وأُغلق، أو أُوقف مؤقتًا ريثما يتحقق فريقنا من أمر ما. وما زال كثيرون غيره ينتظرون.',
  },
  verifiedOn: { en: 'Verified by our team on {date}', ar: 'تحقّق منه فريقنا بتاريخ {date}' },
  documentsChecked: { en: 'Documents checked', ar: 'الوثائق التي تمت مراجعتها' },
  story: { en: 'Their story', ar: 'قصتهم' },
  storyOrphan: { en: 'Story', ar: 'القصة' },
  covers: { en: 'What the monthly support covers', ar: 'ما يغطيه الدعم الشهري' },
  monthlyTotal: { en: 'Monthly need', ar: 'الاحتياج الشهري' },
  distributed: { en: '{amount} has already been distributed to them through MyZakat.', ar: 'تم حتى الآن صرف {amount} لهم عبر ماي زكاة.' },
  related: { en: 'Connected profiles', ar: 'ملفات مرتبطة' },
  relatedNote: {
    en: 'Their needs are kept separate: sponsoring one never pays for the other twice.',
    ar: 'احتياجاتهم منفصلة: كفالة أحدهم لا تعني الدفع مرتين للآخر.',
  },
  schoolLevel: { en: 'School: {level}', ar: 'الدراسة: {level}' },

  boxTitle: { en: 'Sponsor {name}', ar: 'اكفل {name}' },
  fullTitle: { en: 'Fully sponsored', ar: 'مكفول بالكامل' },
  fullBody: {
    en: 'Thanks to our donors, this need is fully covered. Someone else is still waiting for a sponsor.',
    ar: 'بفضل المتبرعين، تمت تغطية هذا الاحتياج بالكامل. وما زال غيره ينتظر كفيلًا.',
  },
  seeOthers: { en: 'See who is still waiting', ar: 'شاهد من ما زال ينتظر' },
  coverAll: { en: 'Cover the whole remaining need', ar: 'تغطية كامل الاحتياج المتبقي' },
  giveShare: { en: 'Give a share', ar: 'المساهمة بجزء' },
  perMonth: { en: '{amount} a month', ar: '{amount} شهريًا' },
  otherAmount: { en: 'Another amount (USD per month)', ar: 'مبلغ آخر (بالدولار شهريًا)' },
  minimum: { en: 'Minimum {amount} a month.', ar: 'الحد الأدنى {amount} شهريًا.' },
  maximum: { en: 'At most {amount} a month is still needed.', ar: 'المتبقي من الاحتياج {amount} شهريًا كحد أقصى.' },
  yourName: { en: 'Your name (for your receipts only)', ar: 'اسمك (للإيصالات فقط)' },
  yourAddress: { en: 'Your email address', ar: 'بريدك الإلكتروني' },
  addressHelp: { en: 'Your receipts and news arrive here. It is also how you sign in to follow your sponsorship.', ar: 'تصلك الإيصالات والأخبار عليه، وهو ما تستخدمه للدخول ومتابعة كفالتك.' },
  continue: { en: 'Continue to secure payment', ar: 'المتابعة إلى الدفع الآمن' },
  opening: { en: 'Opening the payment page…', ar: 'جارٍ فتح صفحة الدفع…' },
  monthlyNote: {
    en: 'Charged monthly by card through Stripe. Stop at any time from “My sponsorships”.',
    ar: 'يُخصم شهريًا بالبطاقة عبر Stripe، ويمكنك التوقف في أي وقت من صفحة «كفالاتي».',
  },
  anonymousNote: { en: 'Your name is never shown to the family, and theirs is never shown publicly.', ar: 'لا يُعرض اسمك على الأسرة أبدًا، ولا يُعرض اسمهم للعموم.' },
  changed: {
    en: 'The amount still needed has just changed — another donor may be completing a sponsorship. Please choose again.',
    ar: 'تغيّر المبلغ المتبقي للتو — ربما يُتمّ متبرع آخر كفالته الآن. يُرجى الاختيار من جديد.',
  },
  failed: { en: 'The payment page could not be opened. Please try again.', ar: 'تعذّر فتح صفحة الدفع. يُرجى المحاولة مرة أخرى.' },
  sponsorsSoFar: { en: 'Already supported by', ar: 'يدعمه حاليًا' },
})

const SponsorBox = ({ profile }: { profile: PublicDetail }) => {
  const t = useT()
  const locale = useLocale()
  const { money } = useFormat()
  const counts = useCounts()
  const stripe = useStripe()
  const queryClient = useQueryClient()
  const available = profile.coverage.available_cents
  const name = profile.display_name || profile.reference

  const [mode, setMode] = useState<'full' | 'share'>('full')
  const [share, setShare] = useState<number>(() => SHARES.find((s) => s < available) ?? Math.min(MIN_CENTS, available))
  const [custom, setCustom] = useState('')
  const [donorName, setDonorName] = useState('')
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const amount = mode === 'full' ? available : (custom ? Math.round(parseFloat(custom) * 100) : share)
  const amountError = mode === 'share' && (Number.isNaN(amount) || amount < Math.min(MIN_CENTS, available))
    ? t(M.minimum, { amount: money(MIN_CENTS) })
    : amount > available ? t(M.maximum, { amount: money(available) }) : null

  if (profile.coverage.state === 'full' || available <= 0) {
    return (
      <div className="card">
        <h2 className="card-title flex items-center gap-2"><BadgeCheck aria-hidden="true" className="h-5 w-5 text-accent-600" />{t(M.fullTitle)}</h2>
        <p className="mt-2 text-gray-600">{t(M.fullBody)}</p>
        <Link to={profile.kind === 'orphan' ? '/sponsor/orphans' : '/sponsor/families'} className="btn-primary mt-4 w-full">
          {t(M.seeOthers)}
        </Link>
      </div>
    )
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (amountError) return
    setBusy(true)
    setError(null)
    try {
      const session = await startCheckout(profile.reference, {
        name: donorName.trim(), email: address.trim(), monthly_amount_cents: amount, lang: locale,
      })
      if (session.url) {
        window.location.assign(session.url)
        return
      }
      const result = await stripe?.redirectToCheckout({ sessionId: session.id })
      if (!stripe || result?.error) setError(t(M.failed))
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 409) {
        setError(t(M.changed))
        queryClient.invalidateQueries(['sponsorship-case', profile.reference])
      } else {
        setError(errorDetail(err) && locale === 'en' ? errorDetail(err) : t(M.failed))
      }
    } finally {
      setBusy(false)
    }
  }

  const shares = SHARES.filter((s) => s < available)

  return (
    <form onSubmit={submit} className="card space-y-5" aria-labelledby="sponsor-box-title">
      <div>
        <h2 id="sponsor-box-title" className="card-title">{t(M.boxTitle, { name })}</h2>
        <CoverageBar coverage={profile.coverage} need={profile.monthly_need_cents} className="mt-3" />
        {profile.coverage.sponsors > 0 && (
          <p className="mt-1 text-xs text-gray-500">{t(M.sponsorsSoFar)} {counts.sponsors(profile.coverage.sponsors)}</p>
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className="sr-only">{t(M.boxTitle, { name })}</legend>
        <label className={clsx('flex cursor-pointer items-start gap-3 rounded-lg border p-3',
          mode === 'full' ? 'border-primary-500 bg-primary-50' : 'border-gray-200')}>
          <input type="radio" name="mode" className="mt-1" checked={mode === 'full'} onChange={() => setMode('full')} />
          <span>
            <span className="block font-semibold text-gray-900">{t(M.coverAll)}</span>
            <span className="text-sm text-gray-700">{t(M.perMonth, { amount: money(available) })}</span>
          </span>
        </label>
        {available > MIN_CENTS && (
          <label className={clsx('flex cursor-pointer items-start gap-3 rounded-lg border p-3',
            mode === 'share' ? 'border-primary-500 bg-primary-50' : 'border-gray-200')}>
            <input type="radio" name="mode" className="mt-1" checked={mode === 'share'} onChange={() => setMode('share')} />
            <span className="block font-semibold text-gray-900">{t(M.giveShare)}</span>
          </label>
        )}
      </fieldset>

      {mode === 'share' && (
        <div className="space-y-3">
          {shares.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {shares.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={!custom && share === s}
                  onClick={() => { setShare(s); setCustom('') }}
                  className={clsx('btn-sm rounded-lg border px-4 font-semibold',
                    !custom && share === s ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50')}
                >
                  {t(M.perMonth, { amount: money(s) })}
                </button>
              ))}
            </div>
          )}
          <div>
            <label htmlFor="share-custom" className="label">{t(M.otherAmount)}</label>
            <input
              id="share-custom"
              inputMode="numeric"
              className="input"
              value={custom}
              onChange={(e) => setCustom(e.target.value.replace(/[^\d.]/g, ''))}
              aria-invalid={Boolean(amountError)}
              aria-describedby={amountError ? 'share-error' : undefined}
            />
            {amountError && <p id="share-error" className="field-error">{amountError}</p>}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label htmlFor="sponsor-name" className="label">{t(M.yourName)}</label>
          <input id="sponsor-name" className="input" required minLength={2} autoComplete="name"
            value={donorName} onChange={(e) => setDonorName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="sponsor-address" className="label">{t(M.yourAddress)}</label>
          <input id="sponsor-address" type="email" className="input" required autoComplete="email"
            value={address} onChange={(e) => setAddress(e.target.value)} aria-describedby="sponsor-address-help" />
          <p id="sponsor-address-help" className="help-text">{t(M.addressHelp)}</p>
        </div>
      </div>

      {error && <p role="alert" className="alert-warning">{error}</p>}

      <button type="submit" className="btn-primary w-full gap-2" disabled={busy || Boolean(amountError) || amount <= 0}>
        <Lock aria-hidden="true" className="h-4 w-4" />
        {busy ? t(M.opening) : `${t(M.continue)} · ${t(M.perMonth, { amount: money(amount > 0 ? amount : 0) })}`}
      </button>

      <ul className="space-y-1.5 text-xs text-gray-600">
        <li className="flex gap-2"><ShieldCheck aria-hidden="true" className="h-4 w-4 flex-shrink-0 text-gray-500" />{t(M.monthlyNote)}</li>
        <li className="flex gap-2"><EyeOff aria-hidden="true" className="h-4 w-4 flex-shrink-0 text-gray-500" />{t(M.anonymousNote)}</li>
      </ul>
    </form>
  )
}

const SponsorProfile = () => {
  const { ref = '' } = useParams()
  const t = useT()
  const pick = usePick()
  const { date, money } = useFormat()
  const counts = useCounts()
  const { data: profile, isLoading, isError, error } = useQuery(
    ['sponsorship-case', ref], () => fetchCase(ref), { retry: false, staleTime: 15_000 })

  const notFound = isError && (error as { response?: { status?: number } })?.response?.status === 404

  const needsAddUp = useMemo(() => profile
    ? profile.needs.reduce((sum, n) => sum + n.monthly_cents, 0) === profile.monthly_need_cents
    : false, [profile])

  if (isLoading) return <p role="status" className="section-container py-20 text-center text-gray-600">{t(C.loading)}</p>

  if (notFound || !profile) {
    return (
      <div className="section-container py-20">
        <SEOHead title={t(M.notFoundTitle)} noindex />
        <div className="card mx-auto max-w-lg text-center">
          <h1 className="text-2xl font-heading font-bold text-gray-900">{t(M.notFoundTitle)}</h1>
          <p className="mt-3 text-gray-600">{isError && !notFound ? t(C.somethingWentWrong) : t(M.notFoundBody)}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/sponsor/orphans" className="btn-primary">{t(C.sponsorAnOrphan)}</Link>
            <Link to="/sponsor/families" className="btn-secondary">{t(C.sponsorAFamily)}</Link>
          </div>
        </div>
      </div>
    )
  }

  const name = profile.display_name || profile.reference
  const title = pick(profile.title, profile.title_ar)
  const story = pick(profile.story, profile.story_ar)
  const facts: string[] = []
  if (profile.kind === 'orphan') {
    if (profile.age != null) facts.push(counts.age(profile.age))
    if (profile.gender) facts.push(t(GENDER_LABELS[profile.gender]))
    if (profile.school_level) facts.push(t(M.schoolLevel, { level: profile.school_level }))
  } else if (profile.household_size) {
    facts.push(counts.household(profile.household_size))
  }

  return (
    <div className="bg-gray-50">
      <SEOHead title={name} description={title || t(M.covers)} canonicalPath={`/sponsor/${profile.reference}`} />
      <div className="section-container py-8 sm:py-12">
        <Link to={profile.kind === 'orphan' ? '/sponsor/orphans' : '/sponsor/families'}
          className="mb-6 inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" /> {t(M.back)}
        </Link>

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <div className="card flex flex-col gap-5 sm:flex-row sm:items-start">
              <ProfileAvatar card={profile} size="lg" />
              <div className="min-w-0">
                <h1 className="text-3xl font-heading font-bold text-gray-900">{name}</h1>
                {facts.length > 0 && <p className="mt-1 text-gray-700">{facts.join(' · ')}</p>}
                <p className="mt-1 flex items-center gap-1 text-gray-600">
                  <MapPin aria-hidden="true" className="h-4 w-4" />
                  {[profile.region, profile.country].filter(Boolean).join('، ')}
                </p>
                {title && <p className="mt-3 text-lg text-gray-800">{title}</p>}
                {profile.verified_at && (
                  <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent-700">
                    <BadgeCheck aria-hidden="true" className="h-4 w-4" />
                    {t(M.verifiedOn, { date: date(profile.verified_at, 'long') })}
                  </p>
                )}
              </div>
            </div>

            {story && (
              <section className="card">
                <h2 className="card-title mb-3">{t(profile.kind === 'orphan' ? M.storyOrphan : M.story)}</h2>
                <div className="space-y-3 whitespace-pre-line leading-relaxed text-gray-700">{story}</div>
              </section>
            )}

            <section className="card">
              <h2 className="card-title mb-3">{t(M.covers)}</h2>
              <ul className="divide-y divide-gray-100">
                {profile.needs.map((need) => (
                  <li key={need.category} className="flex items-center justify-between py-2">
                    <span className="text-gray-700">{t(NEED_LABELS[need.category])}</span>
                    {needsAddUp && <span className="ltr-nums font-medium text-gray-900">{money(need.monthly_cents)}</span>}
                  </li>
                ))}
                <li className="flex items-center justify-between pt-3 font-semibold text-gray-900">
                  <span>{t(M.monthlyTotal)}</span>
                  <span className="ltr-nums">{money(profile.monthly_need_cents)}</span>
                </li>
              </ul>
              {profile.distributed_cents > 0 && (
                <p className="mt-4 rounded-lg bg-accent-50 p-3 text-sm text-accent-800">
                  {t(M.distributed, { amount: money(profile.distributed_cents) })}
                </p>
              )}
              {profile.verified_documents.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm font-medium text-gray-700">{t(M.documentsChecked)}</p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {profile.verified_documents.map((d) => (
                      <li key={d} className="badge-success"><BadgeCheck aria-hidden="true" className="h-3.5 w-3.5" />{t(DOC_LABELS[d])}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {profile.related.length > 0 && (
              <section>
                <h2 className="section-title text-xl sm:text-2xl">{t(M.related)}</h2>
                <p className="mt-1 text-sm text-gray-600">{t(M.relatedNote)}</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {profile.related.map((card) => (
                    <div key={card.reference}>
                      {card.relation && <p className="eyebrow mb-1">{t(RELATION_LABELS[card.relation])}</p>}
                      <CaseCard card={card} />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <SponsorBox profile={profile} />
          </aside>
        </div>
      </div>
    </div>
  )
}

export default SponsorProfile
