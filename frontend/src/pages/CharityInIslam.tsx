/**
 * /charity-in-islam — kept as a route. Its content now lives on
 * /zakat-education ("Zakat and sadaqa"); this page keeps the short version
 * and points there.
 */
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import SEOHead from '../components/SEOHead'
import PageHeader from '../components/ui/PageHeader'
import { defineMessages, useT } from '../i18n'

const M = defineMessages({
  title: { en: 'Charity in Islam', ar: 'العطاء في الإسلام' },
  seoDescription: {
    en: 'Discover the importance and types of charity in Islam. Learn about Zakat, Sadaqa, Waqf, and other forms of Islamic charitable giving and their spiritual rewards.',
    ar: 'تعرّف على مكانة العطاء في الإسلام وأنواعه: الزكاة والصدقة والوقف وغيرها من صور البذل، وما فيها من الأجر والثواب.',
  },
  lead: { en: 'The two forms of giving we handle: zakat and sadaqa.', ar: 'صورتا العطاء اللتان نتولّاهما: الزكاة والصدقة.' },
  zakat: { en: 'Zakat', ar: 'الزكاة' },
  zakatBody: {
    en: 'Zakat is one of the Five Pillars of Islam, an obligatory charity that purifies wealth and helps those in need.',
    ar: 'الزكاة ركن من أركان الإسلام الخمسة، وهي فريضة مالية تطهّر المال وتسدّ حاجة المحتاجين.',
  },
  sadaqah: { en: 'Sadaqah', ar: 'الصدقة' },
  sadaqahBody: {
    en: 'Voluntary charity that can be given at any time, in any amount, bringing blessings and rewards.',
    ar: 'عطاء تطوّعي يُبذل في أي وقت وبأي مقدار، وفيه البركة والأجر.',
  },
  inDetail: { en: 'Zakat in detail', ar: 'الزكاة بالتفصيل' },
})

const CharityInIslam = () => {
  const t = useT()
  return (
    <div className="min-h-screen bg-white">
      <SEOHead
        title={t(M.title)}
        description={t(M.seoDescription)}
        canonicalPath="/charity-in-islam"
      />
      <PageHeader
        title={t(M.title)}
        description={t(M.lead)}
      />

      <div className="section-container py-10 sm:py-12">
        <div className="max-w-3xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <section className="card" aria-labelledby="charity-zakat">
              <h2 id="charity-zakat" className="card-title mb-2">{t(M.zakat)}</h2>
              <p className="text-gray-700 leading-relaxed">
                {t(M.zakatBody)}
              </p>
            </section>

            <section className="card" aria-labelledby="charity-sadaqa">
              <h2 id="charity-sadaqa" className="card-title mb-2">{t(M.sadaqah)}</h2>
              <p className="text-gray-700 leading-relaxed">
                {t(M.sadaqahBody)}
              </p>
            </section>
          </div>

          <Link to="/zakat-education" className="link inline-flex items-center mt-6">
            {t(M.inDetail)}
            <ArrowRight className="w-4 h-4 ms-2" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  )
}

export default CharityInIslam
