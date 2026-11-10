/**
 * /sponsor — what sponsorship is, why it can be trusted, and the two doors.
 *
 * The page answers, in order, the questions a hesitating donor actually has:
 * who would I be helping, how do I know it is real, what happens to my money,
 * and can I stop. Long answers are folded (FAQ) so the page stays light.
 */
import { Link } from 'react-router-dom'
import { useQuery } from 'react-query'
import { BadgeCheck, EyeOff, Coins, Home, ListChecks, RefreshCw, Search, User } from 'lucide-react'
import SEOHead from '../../components/SEOHead'
import Disclosure from '../../components/ui/Disclosure'
import { defineMessages, useFormat, useT } from '../../i18n'
import { fetchStats } from '../../utils/sponsorshipApi'

const M = defineMessages({
  seoTitle: { en: 'Sponsor an orphan or a family', ar: 'اكفل يتيمًا أو أسرة' },
  seoDescription: {
    en: 'Sponsor a verified orphan or family in need every month, anonymously, and see exactly how your support is used.',
    ar: 'اكفل يتيمًا أو أسرة محتاجة موثّقة شهريًا، دون الكشف عن هويتك، واطّلع على أوجه صرف دعمك بكل شفافية.',
  },
  eyebrow: { en: 'Kafala · Sponsorship', ar: 'الكفالة' },
  title: { en: 'Sponsor an orphan or a family in need', ar: 'اكفل يتيمًا أو أسرة محتاجة' },
  lead: {
    en: 'Choose a child or a family our team has verified, give every month, and see exactly what your support pays for — while both of you stay anonymous.',
    ar: 'اختر طفلًا أو أسرة تحقّق فريقنا من وضعها، وقدّم دعمك كل شهر، واطّلع بدقة على ما يغطيه عطاؤك — مع بقاء هويتكما سرية.',
  },
  sponsorOrphan: { en: 'Sponsor an orphan', ar: 'اكفل يتيمًا' },
  sponsorFamily: { en: 'Sponsor a family', ar: 'اكفل أسرة' },
  childrenWaiting: { en: 'children waiting', ar: 'أطفال بانتظار كفيل' },
  familiesWaiting: { en: 'families waiting', ar: 'أسر بانتظار كفيل' },
  activeSponsorships: { en: 'active sponsorships', ar: 'كفالات قائمة' },
  distributed: { en: 'distributed so far', ar: 'صُرف حتى الآن' },

  hadith: {
    en: '“I and the one who sponsors an orphan will be in Paradise like this,” and he gestured with his index and middle fingers.',
    ar: '«أنا وكافل اليتيم في الجنة هكذا»، وأشار بالسبابة والوسطى.',
  },
  hadithSource: { en: 'The Prophet ﷺ — Sahih al-Bukhari', ar: 'النبي ﷺ — صحيح البخاري' },

  howTitle: { en: 'How it works', ar: 'كيف تعمل الكفالة' },
  step1Title: { en: 'Choose', ar: 'اختر' },
  step1Body: {
    en: 'Browse children and families whose situation and documents our team has verified. Those who have waited longest are shown first.',
    ar: 'تصفّح الأطفال والأسر الذين تحقّق فريقنا من أوضاعهم ووثائقهم. يظهر أولًا من طال انتظاره.',
  },
  step2Title: { en: 'Give monthly', ar: 'تبرّع شهريًا' },
  step2Body: {
    en: 'Cover the whole monthly need or a share of it. You are charged once a month and can stop at any time.',
    ar: 'غطِّ الاحتياج الشهري كاملًا أو جزءًا منه. يُخصم المبلغ مرة كل شهر، ويمكنك التوقف في أي وقت.',
  },
  step3Title: { en: 'Follow your impact', ar: 'تابع أثر عطائك' },
  step3Body: {
    en: 'In your space you see every payment, every distribution made with the money, and news from our team.',
    ar: 'في صفحتك الخاصة تجد كل دفعة، وكل عملية صرف تمت من المال، وأخبار فريقنا.',
  },

  promiseTitle: { en: 'Our promise to you, and to them', ar: 'التزامنا تجاهك وتجاههم' },
  verifiedTitle: { en: 'Verified', ar: 'موثّق' },
  verifiedBody: {
    en: 'Every profile is checked against identity papers, death and birth certificates and proof of need before it is published.',
    ar: 'تتم مراجعة كل ملف بالاستناد إلى وثائق الهوية وشهادات الوفاة والميلاد وإثبات الحاجة قبل نشره.',
  },
  anonymousTitle: { en: 'Anonymous both ways', ar: 'سرية من الطرفين' },
  anonymousBody: {
    en: 'Profiles show a first name or pseudonym, an age and a region — never a full name, an address or a face without consent. The family never learns who you are.',
    ar: 'لا تُظهر الملفات إلا اسمًا أول أو اسمًا مستعارًا والعمر والمنطقة — دون اسم كامل أو عنوان أو صورة وجه إلا بموافقة. ولا تعرف الأسرة هويتك أبدًا.',
  },
  transparentTitle: { en: 'Transparent', ar: 'شفافية تامة' },
  transparentBody: {
    en: 'Each distribution — food, rent, school fees, care — is recorded with its amount and date, and shown to you.',
    ar: 'تُسجَّل كل عملية صرف — غذاء، إيجار، رسوم دراسية، علاج — بمبلغها وتاريخها، وتُعرض عليك.',
  },
  flexibleTitle: { en: 'Free to stop', ar: 'حرية التوقف' },
  flexibleBody: {
    en: 'No commitment period. Stop from your space in two clicks; you are never charged again.',
    ar: 'لا توجد مدة التزام. يمكنك التوقف من صفحتك بنقرتين، ولن يُخصم منك أي مبلغ بعدها.',
  },

  whichTitle: { en: 'An orphan, or a family?', ar: 'يتيم أم أسرة؟' },
  orphanCovers: {
    en: 'An orphan’s sponsorship covers what is the child’s own: schooling, clothing, health care and their share of food.',
    ar: 'تغطي كفالة اليتيم ما يخص الطفل نفسه: التعليم والملابس والرعاية الصحية ونصيبه من الغذاء.',
  },
  familyCovers: {
    en: 'A family’s sponsorship covers the household: rent, food, water and power.',
    ar: 'تغطي كفالة الأسرة احتياجات البيت: الإيجار والغذاء والماء والكهرباء.',
  },
  noOverlap: {
    en: 'A child can be sponsored inside a family that is sponsored too: the two needs are kept apart, so nothing is paid twice.',
    ar: 'يمكن كفالة طفل ينتمي إلى أسرة مكفولة أيضًا: يُفصل بين الاحتياجين حتى لا يُدفع أي شيء مرتين.',
  },

  faqTitle: { en: 'Questions donors ask', ar: 'أسئلة يطرحها المتبرعون' },
  q1: { en: 'Can I write to or meet the child?', ar: 'هل يمكنني مراسلة الطفل أو لقاؤه؟' },
  a1: {
    en: 'Not at present. To protect the children and the families, all contact goes through our team, who send you news. You can reach us any time if there is something you would like to pass on.',
    ar: 'ليس حاليًا. حمايةً للأطفال والأسر، يمر كل تواصل عبر فريقنا الذي يوافيك بالأخبار. ويمكنك مراسلتنا في أي وقت إن أردت إيصال شيء.',
  },
  q2: { en: 'Can my sponsorship count as zakat?', ar: 'هل يمكن احتساب الكفالة من الزكاة؟' },
  a2: {
    en: 'Sponsorships are recorded as sadaqah. If you would like yours to be given as zakat, contact us before you start so we direct it to beneficiaries who are eligible for zakat.',
    ar: 'تُسجَّل الكفالات صدقةً. إن رغبت في أن تكون كفالتك من الزكاة، فتواصل معنا قبل البدء لنوجّهها إلى مستحقي الزكاة.',
  },
  q3: { en: 'What happens when the child turns 18, or the family no longer needs help?', ar: 'ماذا يحدث عندما يبلغ الطفل 18 عامًا أو تستغني الأسرة عن المساعدة؟' },
  a3: {
    en: 'We close the case, stop your payments automatically and tell you. You can then choose someone else who is still waiting.',
    ar: 'نُغلق الملف ونوقف دفعاتك تلقائيًا ونُعلمك بذلك، ثم يمكنك اختيار شخص آخر ما زال ينتظر.',
  },
  q4: { en: 'Do I get a receipt?', ar: 'هل أحصل على إيصال؟' },
  a4: {
    en: 'Yes, by email for every monthly payment, and downloadable from your space. MyZakat is a US 501(c)(3) nonprofit.',
    ar: 'نعم، يصلك إيصال بالبريد الإلكتروني عن كل دفعة شهرية، ويمكنك تنزيله من صفحتك. ماي زكاة مؤسسة غير ربحية مسجّلة في الولايات المتحدة بموجب المادة 501(c)(3).',
  },
  q5: { en: 'Can several people sponsor the same family?', ar: 'هل يمكن لعدة أشخاص كفالة الأسرة نفسها؟' },
  a5: {
    en: 'Yes. You can cover the whole need or part of it; we never accept more than what is still needed.',
    ar: 'نعم. يمكنك تغطية الاحتياج كاملًا أو جزء منه، ولا نقبل أبدًا أكثر مما تبقّى من الاحتياج.',
  },

  needHelpTitle: { en: 'Is your family in need, or do you accompany one?', ar: 'هل أسرتك محتاجة، أو ترافق أسرة محتاجة؟' },
  needHelpBody: {
    en: 'Families, guardians and associations can request sponsorship. We review every request in confidence.',
    ar: 'يمكن للأسر والأوصياء والجمعيات تقديم طلب كفالة، ونحن ندرس كل طلب بسرية تامة.',
  },
  requestSponsorship: { en: 'Request sponsorship', ar: 'قدّم طلب كفالة' },
  mySponsorships: { en: 'Already a sponsor? Open my sponsorships', ar: 'هل أنت كفيل؟ افتح صفحة كفالاتي' },
})

const SponsorLanding = () => {
  const t = useT()
  const { money, number } = useFormat()
  const { data: stats } = useQuery('sponsorship-stats', fetchStats, { retry: false, staleTime: 60_000 })

  const steps = [
    { Icon: Search, title: M.step1Title, body: M.step1Body },
    { Icon: Coins, title: M.step2Title, body: M.step2Body },
    { Icon: ListChecks, title: M.step3Title, body: M.step3Body },
  ]
  const promises = [
    { Icon: BadgeCheck, title: M.verifiedTitle, body: M.verifiedBody },
    { Icon: EyeOff, title: M.anonymousTitle, body: M.anonymousBody },
    { Icon: ListChecks, title: M.transparentTitle, body: M.transparentBody },
    { Icon: RefreshCw, title: M.flexibleTitle, body: M.flexibleBody },
  ]
  const faq = [[M.q1, M.a1], [M.q2, M.a2], [M.q3, M.a3], [M.q4, M.a4], [M.q5, M.a5]] as const

  return (
    <div>
      <SEOHead title={t(M.seoTitle)} description={t(M.seoDescription)} canonicalPath="/sponsor" />

      <section className="page-header">
        <div className="section-container">
          <p className="eyebrow mb-2">{t(M.eyebrow)}</p>
          <h1 className="page-title max-w-3xl">{t(M.title)}</h1>
          <p className="page-lead">{t(M.lead)}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/sponsor/orphans" className="btn-primary gap-2">
              <User aria-hidden="true" className="h-5 w-5" />
              {t(M.sponsorOrphan)}
            </Link>
            <Link to="/sponsor/families" className="btn-secondary gap-2">
              <Home aria-hidden="true" className="h-5 w-5" />
              {t(M.sponsorFamily)}
            </Link>
          </div>

          {stats && (
            <dl className="mt-10 grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                [number(stats.orphan.waiting), M.childrenWaiting],
                [number(stats.family.waiting), M.familiesWaiting],
                [number(stats.active_sponsorships), M.activeSponsorships],
                [money(stats.distributed_cents), M.distributed],
              ].map(([value, label]) => (
                <div key={(label as { en: string }).en} className="rounded-xl border border-gray-200 bg-white p-4">
                  <dt className="text-sm text-gray-600">{t(label as { en: string; ar: string })}</dt>
                  <dd className="ltr-nums mt-1 font-heading text-2xl font-bold text-gray-900">{value as string}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </section>

      <section className="section">
        <div className="section-container">
          <figure className="mx-auto mb-14 max-w-2xl text-center">
            <blockquote className="font-heading text-xl text-gray-800 sm:text-2xl">{t(M.hadith)}</blockquote>
            <figcaption className="mt-3 text-sm text-gray-600">{t(M.hadithSource)}</figcaption>
          </figure>

          <h2 className="section-title">{t(M.howTitle)}</h2>
          <ol className="mt-6 grid gap-6 md:grid-cols-3">
            {steps.map(({ Icon, title, body }, i) => (
              <li key={title.en} className="card">
                <div className="mb-3 flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-50 text-primary-700">
                    <Icon aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <h3 className="card-title"><span className="text-gray-500">{i + 1}. </span>{t(title)}</h3>
                </div>
                <p className="text-gray-600">{t(body)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section-alt">
        <div className="section-container">
          <h2 className="section-title">{t(M.promiseTitle)}</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {promises.map(({ Icon, title, body }) => (
              <div key={title.en} className="card">
                <Icon aria-hidden="true" className="mb-3 h-6 w-6 text-accent-600" />
                <h3 className="card-title">{t(title)}</h3>
                <p className="mt-2 text-sm text-gray-600">{t(body)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-container grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="section-title">{t(M.whichTitle)}</h2>
            <ul className="mt-5 space-y-4 text-gray-700">
              <li className="flex gap-3">
                <User aria-hidden="true" className="mt-1 h-5 w-5 flex-shrink-0 text-accent-600" />
                <span>{t(M.orphanCovers)}</span>
              </li>
              <li className="flex gap-3">
                <Home aria-hidden="true" className="mt-1 h-5 w-5 flex-shrink-0 text-primary-600" />
                <span>{t(M.familyCovers)}</span>
              </li>
            </ul>
            <p className="mt-4 rounded-lg bg-gray-50 p-4 text-sm text-gray-700">{t(M.noOverlap)}</p>
          </div>
          <div>
            <h2 className="section-title">{t(M.faqTitle)}</h2>
            <div className="mt-5 space-y-3">
              {faq.map(([q, a]) => (
                <Disclosure key={q.en} title={t(q)}>
                  <p>{t(a)}</p>
                </Disclosure>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section-alt">
        <div className="section-container flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-heading font-bold text-gray-900">{t(M.needHelpTitle)}</h2>
            <p className="mt-1 text-gray-600">{t(M.needHelpBody)}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/sponsor/apply" className="btn-secondary">{t(M.requestSponsorship)}</Link>
            <Link to="/my-sponsorships" className="btn-ghost">{t(M.mySponsorships)}</Link>
          </div>
        </div>
      </section>
    </div>
  )
}

export default SponsorLanding
