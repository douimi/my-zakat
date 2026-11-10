/**
 * /quick-links — the single "Guides and tools" index. Only real pages: the
 * empty Islamic Knowledge and Book of Duas pages are no longer listed.
 */
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import SEOHead from '../components/SEOHead'
import PageHeader from '../components/ui/PageHeader'
import { defineMessages, useT, type Message } from '../i18n'
import { C } from '../i18n/common'

const M = defineMessages({
  seoDescription: {
    en: 'Quick links to all MyZakat resources – Zakat calculators, donation page, programs, events, educational content, and more.',
    ar: 'روابط سريعة إلى جميع موارد ماي زكاة: حاسبات الزكاة، وصفحة التبرع، والبرامج، والفعاليات، والمحتوى التعليمي، وغير ذلك.',
  },
  title: { en: 'Guides and tools', ar: 'أدلة وأدوات' },
  zakatGroup: { en: 'Zakat guides and calculators', ar: 'أدلة الزكاة وحاسباتها' },
  give: { en: 'Give', ar: 'العطاء' },
})

const GROUPS: { title: Message; links: { name: Message; href: string }[] }[] = [
  {
    title: M.zakatGroup,
    links: [
      { name: C.zakatCalculator, href: '/zakat-calculator' },
      { name: C.nisab, href: '/nisab' },
      { name: C.zakatOnGold, href: '/zakat-on-gold' },
      { name: C.zakatAlFitrCalculator, href: '/zakat-al-fitr-calculator' },
      { name: C.kaffarahCalculator, href: '/kaffarah-calculator' },
      { name: C.zakatEducation, href: '/zakat-education' },
    ],
  },
  {
    title: M.give,
    links: [
      { name: C.projects, href: '/projects' },
      { name: C.programs, href: '/programs' },
      { name: C.donate, href: '/donate' },
    ],
  },
]

const QuickLinks = () => {
  const t = useT()
  return (
    <div className="min-h-screen bg-white">
      <SEOHead
        title={t(C.quickLinks)}
        description={t(M.seoDescription)}
        canonicalPath="/quick-links"
      />
      <PageHeader title={t(M.title)} />

      <div className="section-container py-10 sm:py-12">
        <div className="max-w-3xl space-y-8">
          {GROUPS.map((group) => (
            <section key={group.title.en} aria-label={t(group.title)}>
              <h2 className="eyebrow mb-3">{t(group.title)}</h2>
              <ul className="divide-y divide-gray-200 rounded-xl border border-gray-200">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      to={link.href}
                      className="flex items-center justify-between gap-4 px-5 py-3.5 font-medium text-gray-900 hover:bg-gray-50 transition-colors"
                    >
                      {t(link.name)}
                      <ArrowRight className="w-4 h-4 text-primary-600 shrink-0" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

export default QuickLinks
