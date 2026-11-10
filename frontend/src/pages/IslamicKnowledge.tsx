/**
 * /islamic-knowledge — kept as a route, but no longer a "knowledge base".
 *
 * It used to show four unlinked cards promising content that does not exist.
 * It now points to the guides we actually publish. The route stays because it
 * is linked from outside; dropping it from the sitemap needs the owner's call.
 */
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import SEOHead from '../components/SEOHead'
import PageHeader from '../components/ui/PageHeader'
import { defineMessages, useT } from '../i18n'

const M = defineMessages({
  seoTitle: { en: 'Islamic Knowledge', ar: 'المعرفة الإسلامية' },
  seoDescription: {
    en: 'Explore Islamic educational resources from MyZakat. Learn about Islamic principles, charitable giving, and spiritual growth through our curated content.',
    ar: 'استكشف الموارد التعليمية الإسلامية في ماي زكاة، وتعرّف على مبادئ الإسلام وأحكام العطاء والارتقاء الروحي من خلال محتوى مختار بعناية.',
  },
  title: { en: 'Guides to giving', ar: 'أدلة العطاء' },
  lead: { en: 'Short, sourced guides to the giving we handle.', ar: 'أدلة مختصرة وموثّقة لأنواع العطاء التي نتولّاها.' },
  basicsName: { en: 'Zakat basics', ar: 'أساسيات الزكاة' },
  basicsBlurb: {
    en: 'What zakat is, who owes it, on what, and who receives it.',
    ar: 'ما الزكاة، ومن تجب عليه، وفي أي الأموال تجب، ومن يستحقها.',
  },
  nisabName: { en: 'Nisab today', ar: 'النصاب اليوم' },
  nisabBlurb: {
    en: 'The current threshold at which zakat becomes due, and how it is worked out.',
    ar: 'الحدّ الذي تجب عنده الزكاة في الوقت الحاضر، وكيف يُحسب.',
  },
  goldName: { en: 'Zakat on gold', ar: 'زكاة الذهب' },
  goldBlurb: {
    en: 'Work out what is due on jewellery and bullion from its weight and purity.',
    ar: 'احسب الزكاة الواجبة في الحُليّ والسبائك بحسب الوزن والعيار.',
  },
  fitrName: { en: 'Zakat al-Fitr', ar: 'زكاة الفطر' },
  fitrBlurb: {
    en: 'The per-person charity due before the Eid prayer at the end of Ramadan.',
    ar: 'الصدقة الواجبة عن كل فرد قبل صلاة العيد في ختام رمضان.',
  },
  kaffarahName: { en: 'Kaffarah', ar: 'الكفارة' },
  kaffarahBlurb: {
    en: 'Expiation for a deliberately broken fast or oath, costed by the number of days.',
    ar: 'كفارة الإفطار المتعمَّد في رمضان أو الحنث في اليمين، محسوبة بعدد الأيام.',
  },
})

const GUIDES = [
  { path: '/zakat-education', name: M.basicsName, blurb: M.basicsBlurb },
  { path: '/nisab', name: M.nisabName, blurb: M.nisabBlurb },
  { path: '/zakat-on-gold', name: M.goldName, blurb: M.goldBlurb },
  { path: '/zakat-al-fitr-calculator', name: M.fitrName, blurb: M.fitrBlurb },
  { path: '/kaffarah-calculator', name: M.kaffarahName, blurb: M.kaffarahBlurb },
]

const IslamicKnowledge = () => {
  const t = useT()
  return (
    <div className="min-h-screen bg-white">
      <SEOHead
        title={t(M.seoTitle)}
        description={t(M.seoDescription)}
        canonicalPath="/islamic-knowledge"
      />
      <PageHeader title={t(M.title)} description={t(M.lead)} />

      <div className="section-container py-10 sm:py-12">
        <ul className="max-w-3xl divide-y divide-gray-200 rounded-xl border border-gray-200">
          {GUIDES.map((guide) => (
            <li key={guide.path}>
              <Link
                to={guide.path}
                className="flex items-start justify-between gap-4 px-5 py-4 hover:bg-gray-50 transition-colors"
              >
                <span>
                  <span className="block font-semibold text-gray-900">{t(guide.name)}</span>
                  <span className="block text-sm text-gray-600 mt-1">{t(guide.blurb)}</span>
                </span>
                <ArrowRight className="w-5 h-5 text-primary-600 shrink-0 mt-0.5" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default IslamicKnowledge
