/**
 * Public page listing every fundraising project.
 *
 * The homepage only surfaces a short lineup; this page is the "see everything"
 * destination linked from the homepage. It reuses the same ProjectCard so the
 * two views stay visually consistent, and groups projects by state: open for
 * donations, recently funded, and past (inactive) projects.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import SEOHead from '../components/SEOHead'
import PageHeader from '../components/ui/PageHeader'
import {
  ProjectCard,
  isProjectOpen,
  type Project,
} from '../components/FundraisingProjectsSection'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const ProjectGrid = ({ projects }: { projects: Project[] }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {projects.map((p) => <ProjectCard key={p.id} project={p} />)}
  </div>
)

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

  // Group by state so donors always know what they're looking at. Featured
  // projects lead within each group.
  const byFeatured = (a: Project, b: Project) => Number(b.is_featured) - Number(a.is_featured)
  const open = projects.filter(isProjectOpen).sort(byFeatured)
  const funded = projects.filter((p) => p.is_active && !isProjectOpen(p)).sort(byFeatured)
  const past = projects.filter((p) => !p.is_active)

  return (
    <>
      <SEOHead
        title="Support a Project"
        description="Browse every fundraising project at MyZakat. See each project's goal, what has been raised, and what is still needed."
        canonicalPath="/projects"
      />

      <PageHeader
        title="Our fundraising projects"
        description="Projects open for donations first, then the ones already funded."
      />

      <section className="section">
        <div className="section-container space-y-12">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" role="status">
              <span className="sr-only">Loading projects</span>
              {[0, 1, 2].map((i) => (
                <div key={i} className={`h-96 rounded-xl bg-gray-100 ${i > 0 ? 'hidden md:block' : ''} ${i > 1 ? 'md:hidden lg:block' : ''}`} />
              ))}
            </div>
          ) : (
            <>
              <div>
                <h2 className="section-title mb-6">Open now</h2>
                {open.length > 0 ? (
                  <ProjectGrid projects={open} />
                ) : (
                  <p className="text-gray-700">
                    No project is open right now. You can still{' '}
                    <Link to="/donate" className="link">give where the need is greatest</Link>.
                  </p>
                )}
              </div>

              {funded.length > 0 && (
                <div>
                  <h2 className="section-title mb-6">Recently funded</h2>
                  <ProjectGrid projects={funded} />
                </div>
              )}

              {past.length > 0 && (
                <div className="pt-12 border-t border-gray-200">
                  <h2 className="section-title">Past projects</h2>
                  <p className="text-gray-600 mt-2 mb-6">No longer taking donations.</p>
                  <ProjectGrid projects={past} />
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
