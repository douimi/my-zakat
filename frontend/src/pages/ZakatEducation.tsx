/**
 * /zakat-education — the overview page, and the last place the old hardcoded
 * nisab survived.
 *
 * This page is in the sitemap, in the llms files and in the header nav, and it
 * used to publish "Current Nisab (Gold Standard): ~$4,000 USD — *Based on 85g
 * of gold": an undated figure roughly half the real threshold, resting on a
 * mass that contradicted the one /nisab and the calculator use. It now takes
 * the same treatment as those pages — the figure and the mass both come from
 * /api/nisab, and no dollar amount is printed unless `hasUsableFigure` says we
 * hold a price we can vouch for.
 *
 * It also carries what used to be /charity-in-islam (zakat versus sadaqa), and
 * the eight groups who receive zakat, both folded until asked for.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Calculator, CheckCircle, ArrowRight } from 'lucide-react'
import SEOHead from '../components/SEOHead'
import PageHeader from '../components/ui/PageHeader'
import Disclosure from '../components/ui/Disclosure'
import {
  fetchNisab,
  hasUsableFigure,
  formatNisabDate,
  formatUsd,
  type Nisab as NisabData,
} from '../utils/nisabApi'
import { defineMessages, useFormat, useLocale, useT } from '../i18n'

const M = defineMessages({
  seoTitle: { en: 'Zakat Education', ar: 'تعلّم الزكاة' },
  seoDescription: {
    en: 'Learn about Zakat – the third pillar of Islam. Understand who must pay Zakat, eligible recipients, calculation methods, and the spiritual significance of charitable giving.',
    ar: 'تعرّف على الزكاة، الركن الثالث من أركان الإسلام: على من تجب، ومن يستحقها، وكيف تُحسب، وما معنى العطاء في حياة المسلم.',
  },
  eyebrow: { en: 'Zakat guide', ar: 'دليل الزكاة' },
  title: { en: 'Understanding Zakat', ar: 'فهم الزكاة' },
  lead: { en: 'What zakat is, who owes it, on what, and how much.', ar: 'ما الزكاة، وعلى من تجب، وفي أي الأموال، وما مقدارها.' },
  calculateYourZakat: { en: 'Calculate your zakat', ar: 'احسب زكاتك' },

  whatIsTitle: { en: 'What is Zakat?', ar: 'ما الزكاة؟' },
  whatIsBody: {
    en: 'Zakat is one of the Five Pillars of Islam, making it a fundamental religious obligation for every eligible Muslim. The word "Zakat" comes from the Arabic root meaning "to purify" and "to grow," signifying both the purification of wealth and the spiritual growth that comes from giving to those in need.',
    ar: 'الزكاة ركن من أركان الإسلام الخمسة، فهي فريضة أساسية على كل مسلم تحققت فيه شروط وجوبها. وأصل الكلمة في اللغة يدل على الطهارة والنماء، ففيها تطهير للمال، ونماء للنفس وتزكية لها بالإحسان إلى المحتاجين.',
  },

  whoMustPayTitle: { en: 'Who Must Pay Zakat?', ar: 'على من تجب الزكاة؟' },
  conditionsTitle: { en: 'Eligibility conditions', ar: 'شروط الوجوب' },
  condMuslim: { en: 'A Muslim', ar: 'أن يكون مسلمًا' },
  condAdult: { en: 'An adult of sound mind', ar: 'أن يكون بالغًا عاقلًا' },
  condNisab: { en: 'Owns wealth above the nisab threshold', ar: 'أن يملك مالًا يبلغ النصاب' },
  condHawl: { en: 'Has held that wealth for one lunar year', ar: 'أن يحول على هذا المال حول قمري كامل' },

  nisabTitle: { en: 'Nisab threshold', ar: 'حدّ النصاب' },
  nisabBody: {
    en: 'Nisab is the minimum amount of wealth a Muslim must possess before Zakat becomes obligatory.',
    ar: 'النصاب هو الحدّ الأدنى من المال الذي إذا ملكه المسلم وجبت عليه الزكاة.',
  },
  currentNisabGold: { en: 'Current Nisab (gold):', ar: 'النصاب الحالي (بالذهب):' },
  gramsAsOf: { en: '{grams} g of gold, as of {date}', ar: '{grams} غرام من الذهب، بتاريخ {date}' },
  gramsOfGold: { en: '{grams} g of gold', ar: '{grams} غرام من الذهب' },
  setWeight: { en: 'a set weight of gold', ar: 'وزن محدد من الذهب' },
  noFigure: {
    en: 'We show a dollar figure only while we hold a price we can vouch for. Multiply the weight by today’s price per gram.',
    ar: 'لا نعرض مبلغًا بالدولار إلا ونحن نملك سعرًا موثوقًا. اضرب الوزن في سعر الغرام اليوم.',
  },
  nisabLink: { en: 'The current nisab, and how it is worked out', ar: 'النصاب الحالي وطريقة حسابه' },

  dueOnTitle: { en: 'What zakat is due on', ar: 'الأموال التي تجب فيها الزكاة' },
  dueOnBody: {
    en: 'Zakat is 2.5% of cash and savings, gold and silver, investments, and business stock, once their total has stayed above the nisab for a lunar year. Your home, car and personal belongings are not counted.',
    ar: 'الزكاة ربع العشر (2.5%) من النقود والمدخرات، والذهب والفضة، والاستثمارات، وعروض التجارة، متى بلغ مجموعها النصاب وحال عليه الحول القمري. ولا يُحتسب فيها البيت الذي تسكنه، ولا سيارتك، ولا متاعك الشخصي.',
  },

  recipientsTitle: { en: 'Who receives zakat', ar: 'مستحقو الزكاة' },
  recipientsSummary: { en: 'Eight groups named in the Qur\'an (9:60)', ar: 'ثمانية أصناف ذكرها القرآن الكريم (التوبة: 60)' },
  recipientsIntro: { en: 'The Qur\'an (9:60) names eight groups:', ar: 'ذكر القرآن الكريم (سورة التوبة، الآية 60) ثمانية أصناف:' },
  rPoor: { en: 'The poor', ar: 'الفقراء' },
  rNeedy: { en: 'The needy', ar: 'المساكين' },
  rAdmin: { en: 'Those who administer zakat', ar: 'العاملون على الزكاة' },
  rHearts: { en: 'Those whose hearts are to be reconciled', ar: 'المؤلفة قلوبهم' },
  rCaptives: { en: 'Freeing captives', ar: 'في الرقاب (تحرير الرقاب)' },
  rDebt: { en: 'People in debt', ar: 'الغارمون (المدينون)' },
  rCause: { en: 'In the cause of God', ar: 'في سبيل الله' },
  rTravellers: { en: 'Stranded travellers', ar: 'ابن السبيل (المسافر المنقطع)' },

  zakatSadaqaTitle: { en: 'Zakat and sadaqa', ar: 'الزكاة والصدقة' },
  zakatSadaqaSummary: { en: 'One is obligatory, the other voluntary', ar: 'الأولى فريضة، والثانية تطوّع' },
  zakatObligatory: { en: 'Zakat is obligatory:', ar: 'الزكاة فريضة:' },
  zakatObligatoryBody: {
    en: '2.5% of qualifying wealth, given to the eight groups above.',
    ar: 'ربع العشر (2.5%) من المال الذي تجب فيه، تُدفع إلى الأصناف الثمانية المذكورة أعلاه.',
  },
  sadaqaVoluntary: { en: 'Sadaqa is voluntary:', ar: 'الصدقة تطوّع:' },
  sadaqaVoluntaryBody: {
    en: 'any amount, any time, to anyone in need, including your time and good deeds.',
    ar: 'بأي مقدار، وفي أي وقت، لكل محتاج، ويدخل فيها بذل الوقت وفعل الخير.',
  },

  ctaTitle: { en: 'Ready to Calculate Your Zakat?', ar: 'هل أنت مستعد لحساب زكاتك؟' },
  calculateZakat: { en: 'Calculate Zakat', ar: 'احسب الزكاة' },
  payZakatNow: { en: 'Pay Zakat Now', ar: 'أخرج زكاتك الآن' },
})

const CONDITIONS = [M.condMuslim, M.condAdult, M.condNisab, M.condHawl]

const RECIPIENTS = [
  M.rPoor,
  M.rNeedy,
  M.rAdmin,
  M.rHearts,
  M.rCaptives,
  M.rDebt,
  M.rCause,
  M.rTravellers,
]

const ZakatEducation = () => {
  const t = useT()
  const locale = useLocale()
  const fmt = useFormat()
  const [nisab, setNisab] = useState<NisabData | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    void fetchNisab().then((data) => {
      if (!active) return
      setNisab(data)
      setLoaded(true)
    })
    return () => {
      active = false
    }
  }, [])

  // The single gate on printing money on this page.
  const showFigure = loaded && hasUsableFigure(nisab)
  // The mass is stated as ours, so it is read from the snapshot, never written
  // into the markup. It survives staleness: the method never expires.
  const goldGrams = nisab?.gold_grams ?? null

  // English keeps the shared nisab formatters exactly; Arabic goes through Intl.
  const usd = (amount: number) => (locale === 'en' ? formatUsd(amount) : fmt.money(Math.round(amount) * 100))
  const asOf = (iso: string | null) => (locale === 'en' ? formatNisabDate(iso) : fmt.date(iso, 'long'))
  const grams = (g: number) => (locale === 'en' ? String(g) : fmt.number(g))

  return (
    <div className="min-h-screen bg-white">
      <SEOHead
        title={t(M.seoTitle)}
        description={t(M.seoDescription)}
        canonicalPath="/zakat-education"
      />
      <PageHeader
        eyebrow={t(M.eyebrow)}
        title={t(M.title)}
        description={t(M.lead)}
        actions={
          <Link to="/zakat-calculator" className="btn-primary gap-2">
            <Calculator className="w-5 h-5" aria-hidden="true" />
            {t(M.calculateYourZakat)}
          </Link>
        }
      />

      <div className="section-container py-10 sm:py-12">
        <div className="max-w-3xl space-y-10">
          {/* What is Zakat */}
          <section aria-labelledby="what-is-zakat">
            <h2 id="what-is-zakat" className="section-title mb-4">{t(M.whatIsTitle)}</h2>
            <p className="text-gray-700 leading-relaxed">
              {t(M.whatIsBody)}
            </p>
          </section>

          {/* Who Must Pay Zakat */}
          <section aria-labelledby="who-must-pay">
            <h2 id="who-must-pay" className="section-title mb-4">{t(M.whoMustPayTitle)}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="card">
                <h3 className="card-title mb-4">{t(M.conditionsTitle)}</h3>
                <ul className="space-y-3">
                  {CONDITIONS.map((condition) => (
                    <li key={condition.en} className="flex items-start gap-2">
                      <CheckCircle className="w-5 h-5 text-accent-600 shrink-0 mt-0.5" aria-hidden="true" />
                      <span className="text-gray-700">{t(condition)}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="card">
                <h3 className="card-title mb-2">{t(M.nisabTitle)}</h3>
                <p className="text-gray-700 mb-4">
                  {t(M.nisabBody)}
                </p>
                <div className="bg-primary-50 p-4 rounded-lg">
                  {showFigure && nisab ? (
                    <>
                      <div className="text-sm text-gray-600 mb-1">{t(M.currentNisabGold)}</div>
                      <div className="text-2xl font-bold text-primary-700">
                        {usd(nisab.nisab_gold_usd as number)}
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        {t(M.gramsAsOf, { grams: goldGrams === null ? null : grams(goldGrams), date: asOf(nisab.as_of) })}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-sm text-gray-600 mb-1">{t(M.currentNisabGold)}</div>
                      <div className="text-lg font-bold text-primary-700">
                        {goldGrams !== null ? t(M.gramsOfGold, { grams: grams(goldGrams) }) : t(M.setWeight)}
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        {t(M.noFigure)}
                      </div>
                    </>
                  )}
                </div>
                <Link to="/nisab" className="link inline-flex items-center mt-4">
                  {t(M.nisabLink)}
                  <ArrowRight className="w-4 h-4 ms-2" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </section>

          {/* What it is due on */}
          <section aria-labelledby="due-on">
            <h2 id="due-on" className="section-title mb-4">{t(M.dueOnTitle)}</h2>
            <p className="text-gray-700 leading-relaxed">
              {t(M.dueOnBody)}
            </p>
          </section>

          {/* Longer reference, folded */}
          <div className="space-y-3">
            <Disclosure title={t(M.recipientsTitle)} summary={t(M.recipientsSummary)}>
              <p className="text-gray-700">{t(M.recipientsIntro)}</p>
              <ul className="list-disc ps-6 space-y-1 text-gray-700">
                {RECIPIENTS.map((group) => (
                  <li key={group.en}>{t(group)}</li>
                ))}
              </ul>
            </Disclosure>

            <Disclosure title={t(M.zakatSadaqaTitle)} summary={t(M.zakatSadaqaSummary)}>
              <p className="text-gray-700 leading-relaxed">
                <strong className="text-gray-900">{t(M.zakatObligatory)}</strong> {t(M.zakatObligatoryBody)}
              </p>
              <p className="text-gray-700 leading-relaxed">
                <strong className="text-gray-900">{t(M.sadaqaVoluntary)}</strong> {t(M.sadaqaVoluntaryBody)}
              </p>
            </Disclosure>
          </div>

          {/* Call to Action */}
          <section aria-labelledby="calculate-cta" className="card-tinted">
            <h2 id="calculate-cta" className="section-title mb-4">{t(M.ctaTitle)}</h2>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link to="/zakat-calculator" className="btn-primary gap-2">
                <Calculator className="w-5 h-5" aria-hidden="true" />
                {t(M.calculateZakat)}
              </Link>
              <Link to="/donate?purpose=Zakat" className="btn-secondary gap-2">
                {t(M.payZakatNow)}
                <ArrowRight className="w-5 h-5" aria-hidden="true" />
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default ZakatEducation
