/**
 * Public "Fund a Project" section rendered on the homepage.
 *
 * For each active fundraising project the admin has defined, shows a card with:
 *   - Hero image (or gradient placeholder)
 *   - Category chip + urgency badge (urgent when < 25% remaining OR deadline soon)
 *   - Title + short description
 *   - Animated progress bar with milestone marks (25/50/75%)
 *   - Three stat pills: Goal · Raised · Remaining
 *   - Optional deadline countdown
 *   - Donate CTA that pre-fills the Donate form with amount + purpose
 *
 * The progress bar animates on scroll-into-view (IntersectionObserver) so it
 * feels responsive rather than static.
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Target, Wallet, ArrowUpRight, Clock, Sparkles, HeartHandshake, TrendingUp, CheckCircle2,
  ShieldCheck,
} from 'lucide-react'

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

// ── Progress bar with milestone ticks ────────────────────────────────
const ProgressBar = ({ percent, animate }: { percent: number; animate: boolean }) => {
  const clamped = Math.max(0, Math.min(100, percent))
  return (
    <div className="relative">
      <div className="h-3 w-full rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r from-primary-500 via-primary-600 to-blue-600 transition-all ease-out ${animate ? 'duration-[1400ms]' : 'duration-0'}`}
          style={{ width: `${animate ? clamped : 0}%` }}
        />
      </div>
      {/* Milestone ticks — 25 / 50 / 75 % */}
      <div className="absolute inset-y-0 left-0 w-full pointer-events-none">
        {[25, 50, 75].map((tick) => (
          <div
            key={tick}
            className={`absolute top-0 h-3 w-px transition-colors ${clamped >= tick ? 'bg-white/70' : 'bg-gray-300'}`}
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
  const isUrgent = (project.progress_percent >= 75 && project.progress_percent < 100)
    || (days !== null && days >= 0 && days <= 14)
  const isCompleted = project.progress_percent >= 100 || project.status === 'completed'

  // Build the Donate link — pre-fill amount + purpose so the form is one click away.
  const donationAmount = project.suggested_donation
    || Math.min(project.remaining_amount, 50) // sensible default: whatever's smaller
    || project.remaining_amount
  const donateHref = `/donate?amount=${Math.max(1, Math.round(donationAmount))}&purpose=${encodeURIComponent(project.title)}`

  return (
    <div ref={ref} className="group relative flex flex-col rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
      {/* Image / gradient hero */}
      <div className="relative h-44 sm:h-48 overflow-hidden">
        {project.image_url ? (
          <img
            src={project.image_url}
            alt={project.title}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary-500 via-primary-600 to-blue-700 flex items-center justify-center">
            <HeartHandshake className="w-14 h-14 text-white/40" />
          </div>
        )}

        {/* Overlays: category chip + urgency badge + featured star */}
        <div className="absolute top-3 left-3 flex flex-wrap gap-2">
          {project.category && (
            <span className="bg-white/95 backdrop-blur-sm text-gray-800 text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full shadow-sm">
              {project.category}
            </span>
          )}
          {project.is_featured && (
            <span className="bg-amber-400/95 text-amber-900 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full shadow-sm inline-flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Featured
            </span>
          )}
        </div>
        {(isUrgent || isCompleted) && (
          <div className="absolute top-3 right-3">
            {isCompleted ? (
              <span className="bg-green-500 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full shadow-md inline-flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Fully funded
              </span>
            ) : (
              <span className="bg-red-500 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full shadow-md inline-flex items-center gap-1 animate-pulse">
                <Clock className="w-3 h-3" /> Urgent
              </span>
            )}
          </div>
        )}

        {/* Percentage badge, bottom-right corner */}
        <div className="absolute bottom-3 right-3 bg-white rounded-lg shadow-md px-3 py-1.5">
          <p className="text-[10px] font-semibold uppercase text-gray-500 leading-tight">Progress</p>
          <p className="text-lg font-bold text-primary-700 leading-none">{project.progress_percent}%</p>
        </div>
      </div>

      {/* Body */}
      <div className="p-5 sm:p-6 flex flex-col flex-1">
        <h3 className="text-lg font-heading font-bold text-gray-900 mb-1.5 line-clamp-2">{project.title}</h3>
        <p className="text-sm text-gray-600 mb-4 line-clamp-2">{project.short_description}</p>

        {/* Progress bar */}
        <ProgressBar percent={project.progress_percent} animate={animate} />

        {/* Stat pills */}
        <div className="grid grid-cols-3 gap-2 mt-4 mb-5">
          <div className="text-center bg-blue-50 border border-blue-100 rounded-lg py-2.5 px-2">
            <div className="flex items-center justify-center gap-1 text-blue-800 mb-0.5">
              <Target className="w-3.5 h-3.5" />
              <p className="text-[10px] font-semibold uppercase tracking-wider">Goal</p>
            </div>
            <p className="text-sm font-bold text-blue-900 leading-tight">{formatMoney(project.goal_amount, project.currency)}</p>
          </div>
          <div className="text-center bg-emerald-50 border border-emerald-100 rounded-lg py-2.5 px-2">
            <div className="flex items-center justify-center gap-1 text-emerald-800 mb-0.5">
              <Wallet className="w-3.5 h-3.5" />
              <p className="text-[10px] font-semibold uppercase tracking-wider">Raised</p>
            </div>
            <p className="text-sm font-bold text-emerald-900 leading-tight">{formatMoney(project.spent_amount, project.currency)}</p>
          </div>
          <div className={`text-center border rounded-lg py-2.5 px-2 ${isCompleted ? 'bg-gray-50 border-gray-200' : 'bg-amber-50 border-amber-200'}`}>
            <div className={`flex items-center justify-center gap-1 mb-0.5 ${isCompleted ? 'text-gray-500' : 'text-amber-800'}`}>
              <TrendingUp className="w-3.5 h-3.5" />
              <p className="text-[10px] font-semibold uppercase tracking-wider">Needed</p>
            </div>
            <p className={`text-sm font-bold leading-tight ${isCompleted ? 'text-gray-500' : 'text-amber-900'}`}>{formatMoney(project.remaining_amount, project.currency)}</p>
          </div>
        </div>

        {/* Deadline mini-line */}
        {days !== null && days >= 0 && !isCompleted && (
          <p className="text-xs text-gray-500 mb-3 inline-flex items-center gap-1.5">
            <Clock className={`w-3.5 h-3.5 ${days <= 7 ? 'text-red-500' : 'text-gray-400'}`} />
            {days === 0 ? 'Ends today' : days === 1 ? '1 day left' : `${days} days left`}
          </p>
        )}

        {/* CTA — grows to bottom */}
        <div className="mt-auto">
          {isCompleted ? (
            <div className="w-full text-center bg-green-50 border border-green-200 text-green-800 rounded-lg py-3 px-4 font-semibold text-sm inline-flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> Fully funded — thank you!
            </div>
          ) : (
            <Link
              to={donateHref}
              className="group/cta w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-primary-600 to-blue-600 hover:from-primary-700 hover:to-blue-700 text-white font-semibold py-3 rounded-lg shadow-sm hover:shadow-md transition-all"
            >
              Donate to help complete this
              <ArrowUpRight className="w-4 h-4 transition-transform group-hover/cta:translate-x-0.5 group-hover/cta:-translate-y-0.5" />
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 100% donation-integrity callout ─────────────────────────────────
//
// Used both on the homepage section and on the full /projects page.
// The message reassures donors that operating costs are funded
// separately, so their entire contribution reaches the cause.
export const DonationIntegrityCallout = () => (
  <div className="max-w-3xl mx-auto mb-10 sm:mb-12">
    <div className="bg-gradient-to-r from-emerald-50 via-white to-primary-50 border border-emerald-200 rounded-2xl px-5 sm:px-6 py-4 sm:py-5 flex items-start gap-3 sm:gap-4 shadow-sm">
      <div className="flex-shrink-0 w-11 h-11 rounded-full bg-white shadow-sm border border-emerald-100 flex items-center justify-center">
        <ShieldCheck className="w-6 h-6 text-emerald-600" />
      </div>
      <div>
        <p className="text-sm sm:text-base font-semibold text-gray-900 mb-1">
          100% of your donation reaches the cause.
        </p>
        <p className="text-xs sm:text-sm text-gray-700 leading-relaxed">
          MyZakat covers its administrative and operating costs from separate funding —
          not a cent of donor contributions is used for overhead. Every dollar you give is
          delivered in full to the project you choose.
        </p>
      </div>
    </div>
  </div>
)

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

  // Homepage shows only the projects the admin has explicitly marked as
  // featured. If none are featured (fresh install, or admin cleared the
  // flags), fall back to the first six active projects so the section
  // never renders empty.
  const featured = projects.filter((p) => p.is_featured)
  const homepageProjects = (featured.length > 0 ? featured : projects).slice(0, 6)
  const hasMore = projects.length > homepageProjects.length

  // Nothing to render if no active projects — the admin hasn't set any up yet.
  if (!loading && projects.length === 0) return null

  return (
    <section id="fund-projects" className="py-16 sm:py-20 bg-gradient-to-b from-white to-gray-50">
      <div className="section-container">
        <div className="text-center mb-10 sm:mb-12 max-w-2xl mx-auto">
          <span className="inline-flex items-center gap-1.5 bg-primary-100 text-primary-700 text-xs font-semibold uppercase tracking-wider px-3 py-1 rounded-full mb-4">
            <HeartHandshake className="w-3.5 h-3.5" /> Fund a project
          </span>
          <h2 className="text-3xl sm:text-4xl font-heading font-bold text-gray-900 mb-3">
            See exactly where your donation goes
          </h2>
          <p className="text-base sm:text-lg text-gray-600">
            A hand-picked look at what we're raising for right now. Each project shows the goal,
            how much has been raised so far, and what's still needed to complete the mission —
            full transparency, immediate impact.
          </p>
        </div>

        <DonationIntegrityCallout />

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
              {homepageProjects.map((p) => <ProjectCard key={p.id} project={p} />)}
            </div>

            {/* See-all CTA — visible whenever there are more projects than what
                fits in the featured lineup, so donors can browse the full list. */}
            {hasMore && (
              <div className="mt-10 sm:mt-12 text-center">
                <Link
                  to="/projects"
                  className="inline-flex items-center gap-2 bg-white border border-primary-200 text-primary-700 hover:bg-primary-50 hover:border-primary-300 font-semibold px-6 py-3 rounded-lg shadow-sm hover:shadow-md transition-all"
                >
                  See all projects
                  <ArrowUpRight className="w-4 h-4" />
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}

export default FundraisingProjectsSection
