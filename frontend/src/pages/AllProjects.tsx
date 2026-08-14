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
import { HeartHandshake, Sparkles, Loader2 } from 'lucide-react'
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
        const resp = await fetch(`${API_URL}/api/fundraising-projects/`)
        if (!resp.ok) return
        const data = await resp.json()
        if (!cancelled) setProjects(Array.isArray(data) ? data : [])
      } catch { /* silent — page still renders with empty state */ }
      finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [])

  // Show featured projects at the top (they already come sorted that way from
  // the API), but split them visually so donors see both the priority lineup
  // and the full catalog.
  const featured = projects.filter((p) => p.is_featured)
  const others = projects.filter((p) => !p.is_featured)

  return (
    <>
      <SEOHead
        title="Support a Project"
        description="Browse every active fundraising project at MyZakat. See goals, progress, and where your donation goes — 100% of your contribution reaches the cause."
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
              All active fundraising projects
            </h1>
            <p className="text-base sm:text-lg text-gray-600">
              Every project below is currently open for donations. Pick one that resonates
              with you and see exactly where your contribution goes.
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
                Check back soon — new projects are added regularly. In the meantime, you can still
                give to any of our general causes.
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
                <div>
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
            </>
          )}
        </div>
      </section>
    </>
  )
}

export default AllProjects
