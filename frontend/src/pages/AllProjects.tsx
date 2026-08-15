/**
 * Public page listing every active fundraising project.
 *
 * The homepage only surfaces the featured lineup; this page is the "see
 * everything" destination linked from the homepage See-all CTA. It
 * reuses the same ProjectCard component so the two views stay visually
 * consistent, and repeats the 100%-donation-integrity callout up top so
 * first-time visitors landing here directly also get the reassurance.
 */
import { useEffect, useState } from 'react'
import { HeartHandshake, Sparkles, Loader2, Archive } from 'lucide-react'
import SEOHead from '../components/SEOHead'
import {
  ProjectCard,
  DonationIntegrityCallout,
  type Project,
} from '../components/FundraisingProjectsSection'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const AllProjects = () => {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // include_inactive brings in archived / past projects so donors can
        // browse the foundation's full track record, not just what's active
        // right now.
        const resp = await fetch(`${API_URL}/api/fundraising-projects/?include_inactive=true`)
        if (!resp.ok) return
        const data = await resp.json()
        if (!cancelled) setProjects(Array.isArray(data) ? data : [])
      } catch { /* silent — page still renders with empty state */ }
      finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [])

  // Split projects into three bands so donors always know what they're
  // looking at: the current push, other open projects, and the archive.
  const featured = projects.filter((p) => p.is_active && p.is_featured)
  const others = projects.filter((p) => p.is_active && !p.is_featured)
  const archived = projects.filter((p) => !p.is_active)
  const hasAnyActive = featured.length + others.length > 0

  return (
    <>
      <SEOHead
        title="Support a Project"
        description="Browse every fundraising project at MyZakat. See goals, progress, and where your donation goes. 100% of your contribution reaches the cause."
        canonicalPath="/projects"
      />

      {/* Page header */}
      <section className="bg-gradient-to-b from-primary-50 via-white to-white py-12 sm:py-16">
        <div className="section-container">
          <div className="text-center max-w-2xl mx-auto">
            <span className="inline-flex items-center gap-1.5 bg-primary-100 text-primary-700 text-xs font-semibold uppercase tracking-wider px-3 py-1 rounded-full mb-4">
              <HeartHandshake className="w-3.5 h-3.5" /> Support a project
            </span>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-heading font-bold text-gray-900 mb-3">
              Our fundraising projects
            </h1>
            <p className="text-base sm:text-lg text-gray-600">
              Everything we're raising for right now, plus a look back at the projects your
              community has already funded. Pick one and see exactly where your donation goes.
            </p>
          </div>
        </div>
      </section>

      {/* Projects list */}
      <section className="py-10 sm:py-14 bg-white">
        <div className="section-container">
          <DonationIntegrityCallout />

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-10 h-10 text-primary-600 animate-spin" />
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-16 max-w-xl mx-auto">
              <HeartHandshake className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-gray-900 mb-2">No active projects right now</h2>
              <p className="text-gray-600">
                Check back soon. New projects are added regularly, and in the meantime you can
                still give to any of our general causes.
              </p>
            </div>
          ) : (
            <>
              {featured.length > 0 && (
                <div className="mb-12">
                  <div className="flex items-center gap-2 mb-5">
                    <Sparkles className="w-5 h-5 text-amber-500" />
                    <h2 className="text-xl sm:text-2xl font-heading font-bold text-gray-900">Featured projects</h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
                    {featured.map((p) => <ProjectCard key={p.id} project={p} />)}
                  </div>
                </div>
              )}

              {others.length > 0 && (
                <div className={archived.length > 0 ? 'mb-12' : ''}>
                  {featured.length > 0 && (
                    <div className="mb-5">
                      <h2 className="text-xl sm:text-2xl font-heading font-bold text-gray-900">More projects</h2>
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
                    {others.map((p) => <ProjectCard key={p.id} project={p} />)}
                  </div>
                </div>
              )}

              {archived.length > 0 && (
                <div className={hasAnyActive ? 'pt-8 border-t border-gray-200' : ''}>
                  <div className="flex items-center gap-2 mb-2">
                    <Archive className="w-5 h-5 text-gray-500" />
                    <h2 className="text-xl sm:text-2xl font-heading font-bold text-gray-900">Past projects</h2>
                  </div>
                  <p className="text-sm text-gray-600 mb-5 max-w-2xl">
                    Projects we've previously run. They're no longer accepting donations, but we
                    keep them here so you can see the full story of what your community has funded.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
                    {archived.map((p) => <ProjectCard key={p.id} project={p} />)}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </>
  )
}

export default AllProjects
