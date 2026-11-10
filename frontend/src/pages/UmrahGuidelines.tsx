import SEOHead from '../components/SEOHead'
import PageHeader from '../components/ui/PageHeader'
import { defineMessages, useFormat, useT } from '../i18n'

const M = defineMessages({
  title: { en: 'Umrah Guidelines', ar: 'إرشادات العمرة' },
  seoDescription: {
    en: 'Complete Umrah guidelines and step-by-step instructions. Learn the rituals, preparations, and duas for performing Umrah pilgrimage.',
    ar: 'إرشادات العمرة خطوة بخطوة: تعرّف على مناسكها، وكيفية الاستعداد لها، والأدعية في أدائها.',
  },
  lead: { en: 'The four steps of the lesser pilgrimage to Makkah.', ar: 'الخطوات الأربع للعمرة إلى مكة المكرمة.' },
  ihram: { en: 'Ihram', ar: 'الإحرام' },
  ihramBody: {
    en: 'Enter the state of Ihram at the designated Miqat point before reaching Makkah',
    ar: 'الدخول في الإحرام من الميقات المحدَّد قبل الوصول إلى مكة',
  },
  tawaf: { en: 'Tawaf', ar: 'الطواف' },
  tawafBody: {
    en: 'Perform seven circuits around the Kaaba, starting and ending at the Black Stone',
    ar: 'الطواف حول الكعبة سبعة أشواط، يبدأ من الحجر الأسود وينتهي عنده',
  },
  sai: { en: 'Sa\'i', ar: 'السعي' },
  saiBody: { en: 'Walk seven times between Safa and Marwah hills', ar: 'السعي بين الصفا والمروة سبعة أشواط' },
  halq: { en: 'Halq or Taqsir', ar: 'الحلق أو التقصير' },
  halqBody: {
    en: 'Shave head (Halq) or trim hair (Taqsir) to complete Umrah',
    ar: 'حلق شعر الرأس أو تقصيره، وبه يكون التحلل وتمام العمرة',
  },
  reminders: { en: 'Important Reminders', ar: 'تنبيهات مهمة' },
  r1: { en: 'Umrah can be performed at any time of the year', ar: 'تُؤدّى العمرة في أي وقت من أوقات السنة' },
  r2: { en: 'Ensure you have valid travel documents and visas', ar: 'تأكّد من صلاحية وثائق السفر والتأشيرات' },
  r3: { en: 'Follow all health and safety guidelines', ar: 'التزم بجميع الإرشادات الصحية وتعليمات السلامة' },
  r4: { en: 'Respect the sanctity of the holy sites', ar: 'راعِ حرمة البقاع المقدسة' },
  r5: {
    en: 'Consult with knowledgeable guides or scholars for detailed procedures',
    ar: 'استرشد بأهل العلم أو المرشدين المختصين لمعرفة تفاصيل المناسك',
  },
})

const STEPS = [
  { step: 1, title: M.ihram, description: M.ihramBody },
  { step: 2, title: M.tawaf, description: M.tawafBody },
  { step: 3, title: M.sai, description: M.saiBody },
  { step: 4, title: M.halq, description: M.halqBody },
]

const REMINDERS = [M.r1, M.r2, M.r3, M.r4, M.r5]

const UmrahGuidelines = () => {
  const t = useT()
  const { number } = useFormat()
  return (
    <div className="min-h-screen bg-white">
      <SEOHead
        title={t(M.title)}
        description={t(M.seoDescription)}
        canonicalPath="/umrah-guidelines"
      />
      <PageHeader title={t(M.title)} description={t(M.lead)} />

      <div className="section-container py-10 sm:py-12">
        <div className="max-w-3xl space-y-8">
          <ol className="space-y-4">
            {STEPS.map((item) => (
              <li key={item.step} className="flex items-start gap-4">
                <span
                  className="w-9 h-9 bg-primary-50 text-primary-700 rounded-full flex items-center justify-center font-semibold shrink-0"
                  aria-hidden="true"
                >
                  {number(item.step)}
                </span>
                <div>
                  <h2 className="font-semibold text-gray-900">{t(item.title)}</h2>
                  <p className="text-gray-700">{t(item.description)}</p>
                </div>
              </li>
            ))}
          </ol>

          <section className="alert-info block" aria-labelledby="umrah-reminders">
            <h2 id="umrah-reminders" className="font-semibold mb-2">{t(M.reminders)}</h2>
            <ul className="list-disc ps-5 space-y-1">
              {REMINDERS.map((reminder) => (
                <li key={reminder.en}>{t(reminder)}</li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}

export default UmrahGuidelines
