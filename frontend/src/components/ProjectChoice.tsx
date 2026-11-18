/**
 * "Where should your donation go?" on the Donate page.
 *
 * Lists the projects open for donations right now, each with its live total,
 * and "Where the need is greatest" first and selected by default — a donor who
 * just wants to give must not be made to choose. The chosen project's id is
 * sent with the donation; the backend adds the amount to that project's raised
 * total as soon as Stripe confirms the payment (or at once, for a donation
 * recorded by staff).
 */
import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { HeartHandshake } from 'lucide-react'
import { isProjectOpen, type Project } from './FundraisingProjectsSection'
import { defineMessages, useFormat, useT } from '../i18n'

const M = defineMessages({
  legend: { en: 'Where should your donation go?', ar: 'إلى أين يذهب تبرعك؟' },
  anywhere: { en: 'Where the need is greatest', ar: 'حيث تشتد الحاجة' },
  anywhereHint: { en: 'Our team directs it to the most urgent need.', ar: 'يوجّهه فريقنا إلى الحاجة الأكثر إلحاحًا.' },
  raisedOf: { en: '{raised} raised of {goal}', ar: 'جُمع {raised} من أصل {goal}' },
  hint: {
    en: 'Your gift is added to the project’s total as soon as it is confirmed.',
    ar: 'يُضاف تبرعك إلى رصيد المشروع فور تأكيده.',
  },
})

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

interface Props {
  value: number | null
  onChange: (projectId: number | null, project: Project | null) => void
  /** A project slug (or title, from older links) to preselect. */
  preselect?: string | null
}

const ProjectChoice = ({ value, onChange, preselect }: Props) => {
  const t = useT()
  const { money } = useFormat()
  const [projects, setProjects] = useState<Project[]>([])

  useEffect(() => {
    let cancelled = false
    fetch(`${API_URL}/api/fundraising-projects/`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Project[]) => {
        if (cancelled || !Array.isArray(data)) return
        const open = data.filter(isProjectOpen)
        setProjects(open)
        if (preselect) {
          const wanted = preselect.trim().toLowerCase()
          const match = open.find((p) => p.slug === wanted || p.title.trim().toLowerCase() === wanted)
          if (match) onChange(match.id, match)
        }
      })
      .catch(() => { /* the donation works without a project */ })
    return () => { cancelled = true }
    // Preselect once, from the link the donor arrived with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselect])

  if (projects.length === 0) return null

  const option = (id: number | null, title: string, sub: string, percent?: number) => {
    const selected = value === id
    return (
      <label
        key={id ?? 'anywhere'}
        className={clsx(
          'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
          selected ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-primary-300',
        )}
      >
        <input
          type="radio"
          name="donate-project"
          className="mt-1"
          checked={selected}
          onChange={() => onChange(id, projects.find((p) => p.id === id) ?? null)}
        />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-gray-900">{title}</span>
          <span className="block text-sm text-gray-600">{sub}</span>
          {percent !== undefined && (
            <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
              <span className="block h-full rounded-full bg-accent-500" style={{ width: `${Math.min(100, percent)}%` }} />
            </span>
          )}
        </span>
      </label>
    )
  }

  return (
    <fieldset>
      <legend className="mb-2 flex items-center gap-2 text-lg font-semibold text-gray-900">
        <HeartHandshake aria-hidden="true" className="h-5 w-5 text-primary-600" />
        {t(M.legend)}
      </legend>
      <div className="space-y-2">
        {option(null, t(M.anywhere), t(M.anywhereHint))}
        {projects.map((p) =>
          option(p.id, p.title, t(M.raisedOf, {
            raised: money(Math.round(p.spent_amount * 100)), goal: money(Math.round(p.goal_amount * 100)),
          }), p.progress_percent))}
      </div>
      <p className="help-text">{t(M.hint)}</p>
    </fieldset>
  )
}

export default ProjectChoice
