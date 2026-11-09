/**
 * Public "Projects you can fund" section rendered on the homepage.
 *
 * For each fundraising project the admin has defined, shows a card with:
 *   - Image (or a plain placeholder)
 *   - At most two badges: category + one status (urgent / fully funded / past / featured)
 *   - Title + short description
 *   - "{n}% funded" + progress bar with milestone marks (25/50/75%)
 *   - One stats row: Goal · Raised · Still needed
 *   - Optional deadline countdown
 *   - Donate CTA that pre-fills the Donate form with amount + purpose (open projects only)
 *
 * Open projects are listed first. When nothing is open, the section says so and
 * shows recently funded projects instead of pretending they still need money.
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Clock, HeartHandshake, CheckCircle2 } from 'lucide-react'

export interface Project {
  id: number
  title: string
  slug: string
  short_description: string
  image_url: string | null
  goal_amount: number
  spent_amount: number
  remaining_amount: number
  progress_percent: number
  currency: string
  suggested_donation: number | null
  deadline: string | null
  status: string
  is_active: boolean
  is_featured: boolean
  category: string | null
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// ── Helpers ──────────────────────────────────────────────────────────
const formatMoney = (amount: number, currency = 'USD') => {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency, maximumFractionDigits: amount < 100 ? 2 : 0,
    }).format(amount)
  } catch {
    return `$${amount.toLocaleString()}`
  }
}

const daysUntil = (iso: string | null): number | null => {
  if (!iso) return null
  const d = new Date(iso).getTime()
  if (isNaN(d)) return null
  const now = Date.now()
  return Math.ceil((d - now) / (1000 * 60 * 60 * 24))
}

/** Still taking donations: active, not marked completed, and under 100%. */
export const isProjectOpen = (p: Project) =>
  p.is_active !== false && p.status !== 'completed' && p.progress_percent < 100

// ── Progress bar with milestone ticks ────────────────────────────────
const ProgressBar = ({ percent, animate, label }: { percent: number; animate: boolean; label: string }) => {
  const clamped = Math.max(0, Math.min(100, percent))
  return (
    <div
      className="relative"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-label={label}
    >
      <div className="h-2.5 w-full rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full rounded-full bg-accent-500 transition-all ease-out ${animate ? 'duration-[1400ms]' : 'duration-0'}`}
          style={{ width: `${animate ? clamped : 0}%` }}
        />
      </div>
      {/* Milestone ticks — 25 / 50 / 75 % */}
      <div className="absolute inset-y-0 start-0 w-full pointer-events-none" aria-hidden="true">
        {[25, 50, 75].map((tick) => (
          <div
            key={tick}
            className={`absolute top-0 h-2.5 w-px ${clamped >= tick ? 'bg-white/70' : 'bg-gray-300'}`}
            style={{ left: `${tick}%` }}
          />
        ))}
      </div>
    </div>
  )
}

// ── Single project card ─────────────────────────────────────────────
export const ProjectCard = ({ project }: { project: Project }) => {
  const [animate, setAnimate] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Trigger the progress-bar animation when the card scrolls into view.
  useEffect(() => {
    if (!ref.current) return
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => { if (e.isIntersecting) { setAnimate(true); io.disconnect() } })
      },
      { threshold: 0.25 },
    )
    io.observe(ref.current)
    return () => io.disconnect()
  }, [])

  const days = daysUntil(project.deadline)
  const isArchived = project.is_active === false
  const isCompleted = project.progress_percent >= 100 || project.status === 'completed'
  const isUrgent = !isArchived && !isCompleted && (
    (project.progress_percent >= 75 && project.progress_percent < 100)
    || (days !== null && days >= 0 && days <= 14)
  )

  // One status badge at most (with the category, two badges in total).
  const status = isArchived
    ? { label: 'Past project', className: 'badge-neutral' }
    : isCompleted
      ? { label: 'Fully funded', className: 'badge-success' }
      : isUrgent
        ? { label: 'Urgent', className: 'badge-danger' }
        : project.is_featured
          ? { label: 'Featured', className: 'badge-primary' }
          : null

  // Build the Donate link — pre-fill amount + purpose so the form is one click away.
  const donationAmount = project.suggested_donation
    || Math.min(project.remaining_amount, 50) // sensible default: whatever's smaller
    || project.remaining_amount
  const donateHref = `/donate?amount=${Math.max(1, Math.round(donationAmount))}&purpose=${encodeURIComponent(project.title)}`

  return (
    <div ref={ref} className="card-media group">
      {/* Image */}
      <div className="relative h-44 sm:h-48 overflow-hidden bg-gray-100">
        {project.image_url ? (
          <img
            src={project.image_url}
            alt={project.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center" aria-hidden="true">
            <HeartHandshake className="w-12 h-12 text-gray-300" />
          </div>
        )}

        {(project.category || status) && (
          <div className="absolute top-3 start-3 end-3 flex flex-wrap gap-2">
            {project.category && (
              <span className="badge bg-white/95 text-gray-800 shadow-sm">{project.category}</span>
            )}
            {status && <span className={`${status.className} shadow-sm`}>{status.label}</span>}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="card-body">
        <h3 className="card-title mb-1.5 line-clamp-2">{project.title}</h3>
        <p className="text-sm text-gray-600 mb-4 line-clamp-2">{project.short_description}</p>

        <p className="text-sm font-semibold text-gray-900 mb-2">{project.progress_percent}% funded</p>
        <ProgressBar
          percent={project.progress_percent}
          animate={animate}
          label={`${project.title}: ${project.progress_percent}% funded`}
        />

        <dl className="grid grid-cols-3 gap-2 text-center mt-4 mb-5">
          <div>
            <dt className="text-xs text-gray-500">Goal</dt>
            <dd className="text-sm font-semibold text-gray-900">{formatMoney(project.goal_amount, project.currency)}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Raised</dt>
            <dd className="text-sm font-semibold text-gray-900">{formatMoney(project.spent_amount, project.currency)}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Still needed</dt>
            <dd className="text-sm font-semibold text-gray-900">{formatMoney(project.remaining_amount, project.currency)}</dd>
          </div>
        </dl>

        {days !== null && days >= 0 && !isCompleted && !isArchived && (
          <p className="text-xs text-gray-600 mb-3 inline-flex items-center gap-1.5">
            <Clock className={`w-3.5 h-3.5 ${days <= 7 ? 'text-red-600' : 'text-gray-500'}`} aria-hidden="true" />
            {days === 0 ? 'Ends today' : days === 1 ? '1 day left' : `${days} days left`}
          </p>
        )}

        <div className="mt-auto">
          {isArchived ? (
            <p className="text-sm text-gray-600">No longer taking donations.</p>
          ) : isCompleted ? (
            <p className="text-sm font-medium text-green-800 inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Fully funded. Thank you!
            </p>
          ) : (
            <Link to={donateHref} className="btn-primary w-full">
              Donate to this project
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Section wrapper ─────────────────────────────────────────────────
const FundraisingProjectsSection = () => {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const resp = await fetch(`${API_URL}/api/fundraising-projects/`)
        if (!resp.ok) return
        const data = await resp.json()
        if (!cancelled) setProjects(Array.isArray(data) ? data : [])
      } catch { /* silent — section is non-critical */ }
      finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [])

  // Open projects come first (featured ones at the top), then the featured projects
  // that are already funded. If nothing is open, show the featured funded projects
  // (or, if none are featured, the first funded ones) under an honest heading.
  const open = projects
    .filter(isProjectOpen)
    .sort((a, b) => Number(b.is_featured) - Number(a.is_featured))
  const funded = projects.filter((p) => !isProjectOpen(p))
  const fundedFeatured = funded.filter((p) => p.is_featured)
  const hasOpen = open.length > 0
  const homepageProjects = (hasOpen
    ? [...open, ...fundedFeatured]
    : (fundedFeatured.length > 0 ? fundedFeatured : funded)
  ).slice(0, 6)

  // Nothing to render if no active projects — the admin hasn't set any up yet.
  if (!loading && projects.length === 0) return null

  return (
    <section id="fund-projects" className="section" aria-labelledby="fund-projects-title">
      <div className="section-container">
        <div className="section-head">
          <div>
            <h2 id="fund-projects-title" className="section-title">
              {loading || hasOpen ? 'Projects you can fund' : 'Recently funded'}
            </h2>
            <p className="section-lead">
              {loading || hasOpen
                ? "Each card shows the goal, what's been raised, and what's left."
                : (
                  <>
                    No project is open for donations right now. You can still{' '}
                    <Link to="/donate" className="link">give where the need is greatest</Link>.
                  </>
                )}
            </p>
          </div>
          <Link to="/projects" className="link inline-flex items-center gap-1 shrink-0">
            All projects <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" role="status">
            <span className="sr-only">Loading projects</span>
            {[0, 1, 2].map((i) => (
              <div key={i} className={`h-96 rounded-xl bg-gray-100 ${i > 0 ? 'hidden md:block' : ''} ${i > 1 ? 'md:hidden lg:block' : ''}`} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {homepageProjects.map((p) => <ProjectCard key={p.id} project={p} />)}
          </div>
        )}
      </div>
    </section>
  )
}

export default FundraisingProjectsSection
