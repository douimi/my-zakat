/**
 * /sponsor/orphans and /sponsor/families — the verified profiles.
 *
 * Filters live in the URL, so a filtered list can be shared and survives the
 * back button. "Still needs a sponsor" is on by default and the order is
 * longest-waiting first: fairness to whoever has been listed longest is a
 * choice the platform makes, not an accident of insertion order.
 */
import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from 'react-query'
import { SlidersHorizontal } from 'lucide-react'
import SEOHead from '../../components/SEOHead'
import CaseCard from '../../components/sponsorship/CaseCard'
import { defineMessages, useT } from '../../i18n'
import { C } from '../../i18n/common'
import { fetchCases, type Kind, type ListParams } from '../../utils/sponsorshipApi'

const M = defineMessages({
  orphansTitle: { en: 'Sponsor an orphan', ar: 'اكفل يتيمًا' },
  orphansLead: {
    en: 'Every child here has lost a parent and has been verified by our team. Your monthly support covers their schooling, care and daily needs.',
    ar: 'كل طفل هنا فقد أحد والديه، وقد تحقّق فريقنا من وضعه. يغطي دعمك الشهري تعليمه ورعايته واحتياجاته اليومية.',
  },
  familiesTitle: { en: 'Sponsor a family', ar: 'اكفل أسرة' },
  familiesLead: {
    en: 'Households our team has visited and verified. Your monthly support helps them with rent, food and the essentials.',
    ar: 'أسر زارها فريقنا وتحقّق من أوضاعها. يساعدها دعمك الشهري على تغطية الإيجار والغذاء والضروريات.',
  },
  filters: { en: 'Filters', ar: 'تصفية' },
  country: { en: 'Country', ar: 'البلد' },
  allCountries: { en: 'All countries', ar: 'كل البلدان' },
  gender: { en: 'Child', ar: 'الطفل' },
  anyChild: { en: 'Boys and girls', ar: 'أولاد وبنات' },
  boys: { en: 'Boys', ar: 'أولاد' },
  girls: { en: 'Girls', ar: 'بنات' },
  age: { en: 'Age', ar: 'العمر' },
  anyAge: { en: 'Any age', ar: 'كل الأعمار' },
  age0to5: { en: 'Under 6', ar: 'أقل من 6 سنوات' },
  age6to11: { en: '6 to 11', ar: 'من 6 إلى 11 سنة' },
  age12to17: { en: '12 to 17', ar: 'من 12 إلى 17 سنة' },
  sort: { en: 'Order', ar: 'الترتيب' },
  sortWaiting: { en: 'Waiting longest', ar: 'الأطول انتظارًا' },
  sortNewest: { en: 'Newest', ar: 'الأحدث' },
  sortNeed: { en: 'Largest need', ar: 'الاحتياج الأكبر' },
  needsSponsor: { en: 'Only those still needing a sponsor', ar: 'من لا يزال بحاجة إلى كفيل فقط' },
  results: { en: '{count} profiles', ar: 'عدد الملفات: {count}' },
  emptyTitle: { en: 'No one matches these filters right now', ar: 'لا يوجد من يطابق هذه المعايير حاليًا' },
  emptyAll: {
    en: 'Every verified profile is fully sponsored at the moment — thank you. Check again soon, or sponsor a family instead.',
    ar: 'كل الملفات الموثّقة مكفولة بالكامل حاليًا — جزاكم الله خيرًا. عُد قريبًا، أو اكفل أسرة بدلًا من ذلك.',
  },
  emptyAllFamily: {
    en: 'Every verified family is fully sponsored at the moment — thank you. Check again soon, or sponsor an orphan instead.',
    ar: 'كل الأسر الموثّقة مكفولة بالكامل حاليًا — جزاكم الله خيرًا. عُد قريبًا، أو اكفل يتيمًا بدلًا من ذلك.',
  },
  clear: { en: 'Clear filters', ar: 'مسح التصفية' },
  loadError: { en: 'We could not load the profiles.', ar: 'تعذّر تحميل الملفات.' },
  more: { en: 'Show more', ar: 'عرض المزيد' },
  howItWorks: { en: 'How sponsorship works', ar: 'كيف تعمل الكفالة' },
})

const AGE_RANGES: Record<string, [number, number]> = { young: [0, 5], middle: [6, 11], teen: [12, 17] }

const SponsorBrowse = ({ kind }: { kind: Kind }) => {
  const t = useT()
  const [params, setParams] = useSearchParams()
  const isOrphan = kind === 'orphan'

  const country = params.get('country') || ''
  const gender = (params.get('gender') || '') as '' | 'male' | 'female'
  const ageKey = params.get('age') || ''
  const sort = (params.get('sort') || 'waiting') as ListParams['sort']
  const needsSponsor = params.get('all') !== '1'
  const limit = Math.min(Number(params.get('n')) || 24, 200)

  const query: ListParams = useMemo(() => ({
    kind,
    country: country || undefined,
    gender: isOrphan && gender ? gender : undefined,
    age_min: isOrphan && AGE_RANGES[ageKey] ? AGE_RANGES[ageKey][0] : undefined,
    age_max: isOrphan && AGE_RANGES[ageKey] ? AGE_RANGES[ageKey][1] : undefined,
    needs_sponsor: needsSponsor,
    sort,
    limit,
  }), [kind, country, gender, ageKey, sort, needsSponsor, limit, isOrphan])

  const { data, isLoading, isError, refetch } = useQuery(['sponsorship-cases', query], () => fetchCases(query), {
    keepPreviousData: true,
    staleTime: 30_000,
  })

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('n')
    setParams(next, { replace: true })
  }

  const filtered = Boolean(country || gender || ageKey || !needsSponsor)

  return (
    <div>
      <SEOHead
        title={t(isOrphan ? M.orphansTitle : M.familiesTitle)}
        description={t(isOrphan ? M.orphansLead : M.familiesLead)}
        canonicalPath={isOrphan ? '/sponsor/orphans' : '/sponsor/families'}
      />
      <div className="page-header">
        <div className="section-container">
          <h1 className="page-title">{t(isOrphan ? M.orphansTitle : M.familiesTitle)}</h1>
          <p className="page-lead">{t(isOrphan ? M.orphansLead : M.familiesLead)}</p>
          <Link to="/sponsor" className="link mt-3 inline-block text-sm">{t(M.howItWorks)}</Link>
        </div>
      </div>

      <div className="section-container py-8">
        <form
          className="mb-6 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:flex-row sm:flex-wrap sm:items-end"
          onSubmit={(e) => e.preventDefault()}
          aria-label={t(M.filters)}
        >
          <SlidersHorizontal aria-hidden="true" className="hidden h-5 w-5 self-center text-gray-500 sm:block" />
          <div>
            <label htmlFor="f-country" className="label">{t(M.country)}</label>
            <select id="f-country" className="input py-2" value={country} onChange={(e) => set('country', e.target.value)}>
              <option value="">{t(M.allCountries)}</option>
              {(data?.countries || []).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {isOrphan && (
            <>
              <div>
                <label htmlFor="f-gender" className="label">{t(M.gender)}</label>
                <select id="f-gender" className="input py-2" value={gender} onChange={(e) => set('gender', e.target.value)}>
                  <option value="">{t(M.anyChild)}</option>
                  <option value="male">{t(M.boys)}</option>
                  <option value="female">{t(M.girls)}</option>
                </select>
              </div>
              <div>
                <label htmlFor="f-age" className="label">{t(M.age)}</label>
                <select id="f-age" className="input py-2" value={ageKey} onChange={(e) => set('age', e.target.value)}>
                  <option value="">{t(M.anyAge)}</option>
                  <option value="young">{t(M.age0to5)}</option>
                  <option value="middle">{t(M.age6to11)}</option>
                  <option value="teen">{t(M.age12to17)}</option>
                </select>
              </div>
            </>
          )}
          <div>
            <label htmlFor="f-sort" className="label">{t(M.sort)}</label>
            <select id="f-sort" className="input py-2" value={sort} onChange={(e) => set('sort', e.target.value === 'waiting' ? '' : e.target.value)}>
              <option value="waiting">{t(M.sortWaiting)}</option>
              <option value="newest">{t(M.sortNewest)}</option>
              <option value="need">{t(M.sortNeed)}</option>
            </select>
          </div>
          <label className="flex min-h-[44px] items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-primary-600"
              checked={needsSponsor}
              onChange={(e) => set('all', e.target.checked ? '' : '1')}
            />
            {t(M.needsSponsor)}
          </label>
          {filtered && (
            <button type="button" className="btn-ghost btn-sm sm:ms-auto" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
              {t(M.clear)}
            </button>
          )}
        </form>

        {isLoading && <p role="status" className="py-12 text-center text-gray-600">{t(C.loading)}</p>}

        {isError && (
          <div role="alert" className="alert-error justify-between">
            <span>{t(M.loadError)}</span>
            <button type="button" className="btn-secondary btn-sm" onClick={() => refetch()}>{t(C.tryAgain)}</button>
          </div>
        )}

        {data && (
          <>
            <p className="mb-4 text-sm text-gray-600" aria-live="polite">{t(M.results, { count: data.total })}</p>
            {data.items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
                <p className="font-semibold text-gray-900">{t(M.emptyTitle)}</p>
                <p className="mx-auto mt-2 max-w-lg text-gray-600">
                  {filtered ? '' : t(isOrphan ? M.emptyAll : M.emptyAllFamily)}
                </p>
                <div className="mt-4 flex justify-center gap-3">
                  {filtered && (
                    <button type="button" className="btn-secondary btn-sm" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                      {t(M.clear)}
                    </button>
                  )}
                  <Link to={isOrphan ? '/sponsor/families' : '/sponsor/orphans'} className="btn-ghost btn-sm">
                    {t(isOrphan ? C.sponsorAFamily : C.sponsorAnOrphan)}
                  </Link>
                </div>
              </div>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {data.items.map((card) => <CaseCard key={card.reference} card={card} />)}
              </div>
            )}
            {data.total > data.items.length && (
              <div className="mt-8 text-center">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => { const next = new URLSearchParams(params); next.set('n', String(limit + 24)); setParams(next, { replace: true }) }}
                >
                  {t(M.more)}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default SponsorBrowse
