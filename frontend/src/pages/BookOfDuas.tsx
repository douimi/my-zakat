/**
 * /book-of-duas — the route stays, but the page no longer promises a
 * collection it does not hold. It used to announce "a comprehensive collection
 * of authentic supplications" above five title-only cards.
 *
 * Owner decision pending: supply real duas (Arabic, transliteration,
 * translation, source), or drop the route from the sitemap and noindex it.
 * When duas arrive, the Arabic text is the primary content on /ar and the
 * transliteration belongs to the English site only.
 */
import { Link } from 'react-router-dom'
import SEOHead from '../components/SEOHead'
import PageHeader from '../components/ui/PageHeader'
import { defineMessages, useT } from '../i18n'

const M = defineMessages({
  title: { en: 'Book of Duas', ar: 'كتاب الأدعية' },
  seoDescription: {
    en: 'A curated collection of Islamic duas (supplications) for daily life, prayer, and special occasions. Find authentic duas with translations and guidance.',
    ar: 'مجموعة مختارة من الأدعية للحياة اليومية والصلاة والمناسبات الخاصة، مع بيان معانيها وإرشادات حولها.',
  },
  lead: { en: 'This collection is not ready yet.', ar: 'هذه المجموعة لم تكتمل بعد.' },
  meantime: {
    en: 'In the meantime, our zakat guide explains what zakat is, who owes it and who receives it.',
    ar: 'وإلى حين اكتمالها، يشرح دليل الزكاة لدينا ما الزكاة، ومن تجب عليه، ومن يستحقها.',
  },
  readGuide: { en: 'Read the zakat guide', ar: 'اقرأ دليل الزكاة' },
  goHome: { en: 'Go to the home page', ar: 'الانتقال إلى الصفحة الرئيسية' },
})

const BookOfDuas = () => {
  const t = useT()
  return (
    <div className="min-h-screen bg-white">
      <SEOHead
        title={t(M.title)}
        description={t(M.seoDescription)}
        canonicalPath="/book-of-duas"
      />
      <PageHeader title={t(M.title)} description={t(M.lead)} />

      <div className="section-container py-10 sm:py-12">
        <div className="max-w-3xl">
          <p className="text-gray-700 leading-relaxed">
            {t(M.meantime)}
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <Link to="/zakat-education" className="btn-primary">
              {t(M.readGuide)}
            </Link>
            <Link to="/" className="btn-secondary">
              {t(M.goHome)}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BookOfDuas
