/**
 * Public page listing every fundraising project.
 *
 * The homepage only surfaces a short lineup; this page is the "see everything"
 * destination linked from the homepage. It reuses the same ProjectCard so the
 * two views stay visually consistent, and groups projects by state: open for
 * donations, recently funded, and past (inactive) projects.
 */
import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import SEOHead from '../components/SEOHead'
import PageHeader from '../components/ui/PageHeader'
import {
  ProjectCard,
  isProjectOpen, isProjectUpcoming, byOpeningDate,
  type Project,
} from '../components/FundraisingProjectsSection'
import { defineMessages, useT } from '../i18n'

const M = defineMessages({
  seoTitle: { en: 'Support a Project', ar: 'ادعم مشروعًا' },
  seoDescription: {
    en: "Browse every fundraising project at MyZakat. See each project's goal, what has been raised, and what is still needed.",
    ar: 'تصفّح جميع مشاريع جمع التبرعات في ماي زكاة، واطّلع على هدف كل مشروع، وما جُمع له، وما يزال مطلوبًا.',
  },
  title: { en: 'Our fundraising projects', ar: 'مشاريعنا لجمع التبرعات' },
  lead: {
    en: 'Projects open for donations first, then the ones already funded.',
    ar: 'المشاريع المفتوحة للتبرع أولًا، ثم المشاريع التي اكتمل تمويلها.',
  },
  loading: { en: 'Loading projects', ar: 'جارٍ تحميل المشاريع' },
  openNow: { en: 'Open now', ar: 'مفتوحة للتبرع الآن' },
  noneOpen: {
    en: 'No project is open right now. You can still {link}.',
    ar: 'لا يوجد مشروع مفتوح للتبرع حاليًا، ويمكنك مع ذلك {link}.',
  },
  giveWhereNeeded: { en: 'give where the need is greatest', ar: 'التبرّع حيث تشتد الحاجة' },
  recentlyFunded: { en: 'Recently funded', ar: 'اكتمل تمويلها مؤخرًا' },
  upcoming: { en: 'Upcoming projects', ar: 'مشاريع قادمة' },
  upcomingLead: { en: 'Announced, and opening for donations soon.', ar: 'تم الإعلان عنها، وستُفتح للتبرع قريبًا.' },
  past: { en: 'Past projects', ar: 'مشاريع سابقة' },
  pastLead: { en: 'No longer taking donations.', ar: 'لم تعد تستقبل التبرعات.' },
})

/** Put React nodes into the `{slot}`s of a translated sentence (word order differs per language). */
const fill = (text: string, slots: Record<string, ReactNode>) =>
  text.split(/\{(\w+)\}/).map((part, i) => (i % 2 ? <Fragment key={i}>{slots[part]}</Fragment> : part))

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const ProjectGrid = ({ projects }: { projects: Project[] }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {projects.map((p) => <ProjectCard key={p.id} project={p} />)}
  </div>
)

const AllProjects = () => {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const t = useT()

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
  const upcoming = projects.filter(isProjectUpcoming).sort(byOpeningDate)
  const funded = projects.filter((p) => p.is_active && !isProjectOpen(p) && !isProjectUpcoming(p)).sort(byFeatured)
  const past = projects.filter((p) => !p.is_active)

  return (
    <>
      <SEOHead
        title={t(M.seoTitle)}
        description={t(M.seoDescription)}
        canonicalPath="/projects"
      />

      <PageHeader
        title={t(M.title)}
        description={t(M.lead)}
      />

      <section className="section">
        <div className="section-container space-y-12">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" role="status">
              <span className="sr-only">{t(M.loading)}</span>
              {[0, 1, 2].map((i) => (
                <div key={i} className={`h-96 rounded-xl bg-gray-100 ${i > 0 ? 'hidden md:block' : ''} ${i > 1 ? 'md:hidden lg:block' : ''}`} />
              ))}
            </div>
          ) : (
            <>
              <div>
                <h2 className="section-title mb-6">{t(M.openNow)}</h2>
                {open.length > 0 ? (
                  <ProjectGrid projects={open} />
                ) : (
                  <p className="text-gray-700">
                    {fill(t(M.noneOpen), {
                      link: <Link to="/donate" className="link">{t(M.giveWhereNeeded)}</Link>,
                    })}
                  </p>
                )}
              </div>

              {upcoming.length > 0 && (
                <div>
                  <h2 className="section-title">{t(M.upcoming)}</h2>
                  <p className="text-gray-600 mt-2 mb-6">{t(M.upcomingLead)}</p>
                  <ProjectGrid projects={upcoming} />
                </div>
              )}

              {funded.length > 0 && (
                <div>
                  <h2 className="section-title mb-6">{t(M.recentlyFunded)}</h2>
                  <ProjectGrid projects={funded} />
                </div>
              )}

              {past.length > 0 && (
                <div className="pt-12 border-t border-gray-200">
                  <h2 className="section-title">{t(M.past)}</h2>
                  <p className="text-gray-600 mt-2 mb-6">{t(M.pastLead)}</p>
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
