/**
 * "Where should your donation go?" — the one choice on the Donate page.
 *
 * It replaces two fields that asked the same thing (a static "Purpose" list
 * and a project picker). What a donor actually decides is where the money goes:
 *
 *   - the cause they arrived from (a program, an urgent need, a pop-up), if any;
 *   - "where the need is greatest", the default — giving must not require choosing;
 *   - one of the projects open for donations.
 *
 * Built to stay light however many projects are open: at most three appear as
 * cards (featured first, as the API orders them), the rest sit in one
 * "More projects" dropdown.
 *
 * What the old purpose list also carried — whether this is Zakat — is a
 * religious distinction, not a destination, so it is one checkbox here. A
 * donor arriving from the Zakat al-Fitr or Kaffarah calculator is paying that
 * specific obligation; it is shown as a fixed line instead.
 */
import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { HeartHandshake, X } from 'lucide-react'
import { isProjectOpen, type Project } from './FundraisingProjectsSection'
import { defineMessages, useFormat, useT } from '../i18n'

const M = defineMessages({
  legend: { en: 'Where should your donation go?', ar: 'إلى أين يذهب تبرعك؟' },
  anywhere: { en: 'Where the need is greatest', ar: 'حيث تشتد الحاجة' },
  anywhereHint: { en: 'Our team directs it to the most urgent need.', ar: 'يوجّهه فريقنا إلى الحاجة الأكثر إلحاحًا.' },
  causeHint: { en: 'The cause you came from', ar: 'القضية التي جئت منها' },
  raisedOf: { en: '{raised} raised of {goal}', ar: 'جُمع {raised} من أصل {goal}' },
  moreProjects: { en: 'More projects ({count})', ar: 'مشاريع أخرى ({count})' },
  percentFunded: { en: '{percent}% funded', ar: 'مُوّل {percent}%' },
  chooseProject: { en: 'Choose a project…', ar: 'اختر مشروعًا…' },
  projectHint: {
    en: 'Your gift is added to the project’s total as soon as it is confirmed.',
    ar: 'يُضاف تبرعك إلى رصيد المشروع فور تأكيده.',
  },
  isZakat: { en: 'This donation is my Zakat', ar: 'هذا التبرع من زكاتي' },
  isZakatHint: {
    en: 'We then give it only to people eligible to receive Zakat.',
    ar: 'عندها لا نصرفه إلا لمستحقي الزكاة.',
  },
  paying: { en: 'You are paying: {type}', ar: 'أنت تؤدي: {type}' },
  notThis: { en: 'This is not {type}', ar: 'ليس هذا {type}' },
  zakatAlFitr: { en: 'Zakat al-Fitr', ar: 'زكاة الفطر' },
  kaffarah: { en: 'Kaffarah', ar: 'الكفارة' },
  fidya: { en: 'Fidya', ar: 'الفدية' },
})

/** Obligations with their own rules, set by the calculator the donor came from. */
export const FIXED_GIVING_TYPES = { 'Zakat al-Fitr': M.zakatAlFitr, Kaffarah: M.kaffarah, Fidya: M.fidya } as const
export type FixedGivingType = keyof typeof FIXED_GIVING_TYPES

export type Destination =
  | { kind: 'general' }
  | { kind: 'cause'; title: string }
  | { kind: 'project'; id: number; title: string }

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const CARDS = 3

interface Props {
  value: Destination
  onChange: (d: Destination) => void
  /** A cause named by the link the donor arrived with (not a project). */
  cause: string | null
  /** A project slug, or a title from older links, to preselect. */
  preselect: string | null
  isZakat: boolean
  onZakatChange: (v: boolean) => void
  givingType: FixedGivingType | null
  onClearGivingType: () => void
}

const DonationDestination = ({
  value, onChange, cause, preselect, isZakat, onZakatChange, givingType, onClearGivingType,
}: Props) => {
  const t = useT()
  const { money } = useFormat()
  const [projects, setProjects] = useState<Project[]>([])
  const [causeIsProject, setCauseIsProject] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`${API_URL}/api/fundraising-projects/`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Project[]) => {
        if (cancelled || !Array.isArray(data)) return
        const open = data.filter(isProjectOpen)
        setProjects(open)
        const wanted = (preselect || '').trim().toLowerCase()
        const match = wanted && open.find((p) => p.slug === wanted || p.title.trim().toLowerCase() === wanted)
        if (match) {
          // A program/need title that is in fact a project: offer it once, as the project.
          setCauseIsProject(Boolean(cause) && match.title.trim().toLowerCase() === cause!.trim().toLowerCase())
          onChange({ kind: 'project', id: match.id, title: match.title })
        }
      })
      .catch(() => { /* the donation works without a project */ })
    return () => { cancelled = true }
    // Preselect once, from the link the donor arrived with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselect])

  const cards = projects.slice(0, CARDS)
  const more = projects.slice(CARDS)
  const selectedMore = value.kind === 'project' && more.some((p) => p.id === value.id) ? value.id : ''

  // One line per option inside a single box: a list, not a stack of cards,
  // so the question costs the page about as much as the old dropdown did.
  const option = (key: string, checked: boolean, pick: () => void, title: string, meta?: string, metaLabel?: string) => (
    <label
      key={key}
      className={clsx(
        'flex min-h-[44px] cursor-pointer items-center gap-3 px-3 py-2 transition-colors',
        checked ? 'bg-primary-50' : 'hover:bg-gray-50',
      )}
    >
      <input type="radio" name="donate-destination" checked={checked} onChange={pick} />
      <span className={clsx('min-w-0 flex-1 truncate', checked ? 'font-semibold text-primary-900' : 'text-gray-900')} dir="auto">
        {title}
      </span>
      {meta && <span className="shrink-0 text-xs text-gray-500" title={metaLabel}>{meta}</span>}
    </label>
  )

  const raised = (p: Project) => t(M.raisedOf, {
    raised: money(Math.round(p.spent_amount * 100)), goal: money(Math.round(p.goal_amount * 100)),
  })

  return (
    <fieldset data-testid="donate-destination">
      <legend className="mb-2 flex items-center gap-2 text-lg font-semibold text-gray-900">
        <HeartHandshake aria-hidden="true" className="h-5 w-5 text-primary-600" />
        {t(M.legend)}
      </legend>

      <div className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">
        {cause && !causeIsProject && option('cause', value.kind === 'cause',
          () => onChange({ kind: 'cause', title: cause }), cause, t(M.causeHint))}
        {option('general', value.kind === 'general', () => onChange({ kind: 'general' }), t(M.anywhere), undefined, t(M.anywhereHint))}
        {cards.map((p) => option(`p${p.id}`, value.kind === 'project' && value.id === p.id,
          () => onChange({ kind: 'project', id: p.id, title: p.title }), p.title,
          t(M.percentFunded, { percent: Math.round(p.progress_percent) }), raised(p)))}

        {more.length > 0 && (
          <div className={clsx('flex flex-wrap items-center gap-2 px-3 py-2', selectedMore && 'bg-primary-50')}>
            <label htmlFor="donate-more-projects" className="shrink-0 text-sm text-gray-700">
              {t(M.moreProjects, { count: more.length })}
            </label>
            <select
              id="donate-more-projects"
              className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
              value={selectedMore}
              onChange={(e) => {
                const p = more.find((x) => x.id === Number(e.target.value))
                if (p) onChange({ kind: 'project', id: p.id, title: p.title })
              }}
            >
              <option value="" disabled>{t(M.chooseProject)}</option>
              {more.map((p) => <option key={p.id} value={p.id}>{p.title} — {t(M.percentFunded, { percent: Math.round(p.progress_percent) })}</option>)}
            </select>
          </div>
        )}
      </div>
      {value.kind === 'project' && <p className="help-text">{t(M.projectHint)}</p>}

      <div className="mt-3">
        {givingType ? (
          <p className="flex flex-wrap items-center gap-2 rounded-lg bg-accent-50 px-3 py-2 text-sm text-accent-800" data-testid="donate-giving-type">
            {t(M.paying, { type: t(FIXED_GIVING_TYPES[givingType]) })}
            <button type="button" className="inline-flex items-center gap-1 text-xs underline" onClick={onClearGivingType}>
              <X aria-hidden="true" className="h-3 w-3" />
              {t(M.notThis, { type: t(FIXED_GIVING_TYPES[givingType]) })}
            </button>
          </p>
        ) : (
          <label className="flex items-start gap-3 text-sm text-gray-800">
            <input type="checkbox" className="mt-0.5 h-4 w-4" data-testid="donate-zakat"
              checked={isZakat} onChange={(e) => onZakatChange(e.target.checked)} />
            <span>
              <span className="font-medium">{t(M.isZakat)}</span>
              <span className="block text-gray-600">{t(M.isZakatHint)}</span>
            </span>
          </label>
        )}
      </div>
    </fieldset>
  )
}

/**
 * The text sent as the donation's purpose (Stripe line item, receipts,
 * recurring-gift records): the giving type, then where it goes.
 */
export const purposeOf = (dest: Destination, isZakat: boolean, givingType: FixedGivingType | null): string => {
  const type = givingType ?? (isZakat ? 'Zakat' : null)
  const where = dest.kind === 'general' ? null : dest.title
  return ([type, where].filter(Boolean).join(' · ') || 'General Donation').slice(0, 100)
}

export default DonationDestination
