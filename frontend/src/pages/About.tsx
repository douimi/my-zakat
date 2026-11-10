import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import SEOHead from '../components/SEOHead'
import PageHeader from '../components/ui/PageHeader'
import { defineMessages, useT } from '../i18n'

const M = defineMessages({
  seoTitle: { en: 'About Us', ar: 'من نحن' },
  seoDescription: {
    en: 'Learn about MyZakat Zakat Distribution Foundation – our mission, values, and commitment to transparent Zakat and Sadaqa distribution. Empowering communities through charitable giving.',
    ar: 'تعرّف على مؤسسة ماي زكاة لتوزيع الزكاة: رسالتنا وقيمنا والتزامنا بالشفافية في توزيع الزكاة والصدقات، تمكينًا للمجتمعات من خلال العطاء الخيري.',
  },
  title: { en: 'About MyZakat', ar: 'عن ماي زكاة' },
  lead: {
    en: 'A zakat foundation based in Winchester, Virginia. We collect zakat and sadaqa and put it to work for people in need.',
    ar: 'مؤسسة زكاة مقرّها مدينة وينشستر بولاية فيرجينيا، نجمع الزكاة والصدقات ونوصلها إلى من هم في حاجة إليها.',
  },
  storyTitle: { en: 'Our story', ar: 'قصتنا' },
  story: {
    en: 'MyZakat began as personal giving: individual efforts to meet immediate needs, paid for with our own resources. It has grown into a foundation so that others can give through it too, and it still works the same way, one specific need at a time.',
    ar: 'بدأت ماي زكاة عطاءً شخصيًا: جهودًا فردية لسدّ احتياجات عاجلة، من مواردنا الخاصة. ثم نمت لتصبح مؤسسة يستطيع الآخرون أن يتبرعوا من خلالها أيضًا، وما زالت تعمل بالطريقة نفسها: حاجةً محددةً في كل مرة.',
  },
  whatTitle: { en: 'What we do', ar: 'ما نقوم به' },
  what: {
    en: 'We turn zakat and sadaqa into specific help: food, clean water, shelter, schooling and support for orphans. Zakat goes only to people who are eligible to receive it.',
    ar: 'نحوّل الزكاة والصدقات إلى عون ملموس: طعام، وماء نظيف، ومأوى، وتعليم، ورعاية للأيتام. ولا تُصرف الزكاة إلا لمستحقيها.',
  },
  seeLinks: { en: 'See {programs} and the {projects}.', ar: 'اطّلع على {programs} و{projects}.' },
  ourPrograms: { en: 'our programs', ar: 'برامجنا' },
  projectsWeFund: { en: 'projects we are funding', ar: 'المشاريع التي نموّلها' },
  involvedTitle: { en: 'Get involved', ar: 'شارك معنا' },
  involved: {
    en: 'Give, volunteer, or tell someone who should know about us.',
    ar: 'تبرّع، أو تطوّع، أو عرّف بنا من ينبغي أن يعرفنا.',
  },
  makeDonation: { en: 'Make a Donation', ar: 'قدّم تبرعًا' },
  becomeVolunteer: { en: 'Become a Volunteer', ar: 'كن متطوعًا' },
})

/** Put React nodes into the `{slot}`s of a translated sentence (word order differs per language). */
const fill = (text: string, slots: Record<string, ReactNode>) =>
  text.split(/\{(\w+)\}/).map((part, i) => (i % 2 ? <Fragment key={i}>{slots[part]}</Fragment> : part))

const About = () => {
  const t = useT()
  return (
    <div className="min-h-screen bg-white">
      <SEOHead
        title={t(M.seoTitle)}
        description={t(M.seoDescription)}
        canonicalPath="/about"
      />

      <PageHeader
        title={t(M.title)}
        description={t(M.lead)}
      />

      <div className="section">
        <div className="section-container">
          <div className="max-w-3xl space-y-12">
            <section aria-labelledby="about-story">
              <h2 id="about-story" className="section-title">{t(M.storyTitle)}</h2>
              <p className="mt-4 text-lg text-gray-700 leading-relaxed">
                {t(M.story)}
              </p>
            </section>

            <section aria-labelledby="about-what">
              <h2 id="about-what" className="section-title">{t(M.whatTitle)}</h2>
              <p className="mt-4 text-lg text-gray-700 leading-relaxed">
                {t(M.what)}
              </p>
              <p className="mt-4 text-lg text-gray-700">
                {fill(t(M.seeLinks), {
                  programs: <Link to="/programs" className="link">{t(M.ourPrograms)}</Link>,
                  projects: <Link to="/projects" className="link">{t(M.projectsWeFund)}</Link>,
                })}
              </p>
            </section>

            <section aria-labelledby="about-involved" className="card-tinted">
              <h2 id="about-involved" className="text-2xl font-heading font-bold text-gray-900">{t(M.involvedTitle)}</h2>
              <p className="mt-2 text-gray-700">
                {t(M.involved)}
              </p>
              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <Link to="/donate" className="btn-primary">
                  {t(M.makeDonation)}
                </Link>
                <Link to="/volunteer" className="btn-secondary">
                  {t(M.becomeVolunteer)}
                </Link>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

export default About
