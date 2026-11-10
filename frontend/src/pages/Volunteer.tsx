import { Fragment, useState, type ReactNode } from 'react'
import { useMutation } from 'react-query'
import { CheckCircle, ArrowRight } from 'lucide-react'
import { volunteersAPI } from '../utils/api'
import SEOHead from '../components/SEOHead'
import PageHeader from '../components/ui/PageHeader'
import { defineMessages, useT, type Message } from '../i18n'

const M = defineMessages({
  title: { en: 'Volunteer With Us', ar: 'تطوّع معنا' },
  seoDescription: {
    en: 'Join MyZakat as a volunteer. Contribute your time and skills to help distribute Zakat, support community programs, and make a difference.',
    ar: 'انضم إلى ماي زكاة متطوعًا، وساهم بوقتك ومهاراتك في توزيع الزكاة ودعم برامج المجتمع وصنع فرق حقيقي.',
  },
  lead: {
    en: "Help pack food, run events, or do outreach in your community. Tell us what you'd like to do and we'll get back to you.",
    ar: 'ساعد في تجهيز الطرود الغذائية، أو تنظيم الفعاليات، أو التواصل مع مجتمعك. أخبرنا بما تودّ القيام به وسنتواصل معك.',
  },
  thankYou: { en: 'Thank You!', ar: 'جزاك الله خيرًا!' },
  sent: {
    en: "Your volunteer application has been sent. We'll be in touch soon.",
    ar: 'وصلنا طلب التطوع الخاص بك، وسنتواصل معك قريبًا.',
  },
  another: { en: 'Submit Another Application', ar: 'إرسال طلب آخر' },
  formTitle: { en: 'Volunteer application', ar: 'طلب التطوع' },
  fullName: { en: 'Full Name *', ar: 'الاسم الكامل *' },
  fullNamePlaceholder: { en: 'Enter your full name', ar: 'أدخل اسمك الكامل' },
  email: { en: 'Email Address *', ar: 'البريد الإلكتروني *' },
  emailPlaceholder: { en: 'Enter your email address', ar: 'أدخل بريدك الإلكتروني' },
  interest: { en: 'Area of Interest *', ar: 'مجال الاهتمام *' },
  interestPlaceholder: { en: 'Select your area of interest', ar: 'اختر مجال اهتمامك' },
  error: {
    en: 'We could not send your application. Please try again, or email us at info@myzakat.org.',
    ar: 'تعذّر إرسال طلبك. يُرجى المحاولة مرة أخرى، أو مراسلتنا على info@myzakat.org.',
  },
  submitting: { en: 'Submitting...', ar: 'جارٍ الإرسال...' },
  submit: { en: 'Submit Application', ar: 'إرسال الطلب' },
  questions: { en: 'Questions? Email {email}.', ar: 'لديك أسئلة؟ راسلنا على {email}.' },
  waysToHelp: { en: 'Ways to help', ar: 'مجالات المساعدة' },

  // Roles and interests
  foodDistribution: { en: 'Food Distribution', ar: 'توزيع الطعام' },
  foodDistributionDesc: {
    en: 'Pack and hand out meals and food parcels to families in need.',
    ar: 'تجهيز الوجبات والسلال الغذائية وتوزيعها على الأسر المحتاجة.',
  },
  communityOutreach: { en: 'Community Outreach', ar: 'التواصل المجتمعي' },
  communityOutreachDesc: {
    en: 'Help us find the families and communities who need support.',
    ar: 'ساعدنا في الوصول إلى الأسر والمجتمعات التي تحتاج إلى الدعم.',
  },
  educationalSupport: { en: 'Educational Support', ar: 'الدعم التعليمي' },
  educationalSupportDesc: {
    en: 'Assist with educational programs and mentoring for children.',
    ar: 'المساعدة في البرامج التعليمية وتوجيه الأطفال ومرافقتهم.',
  },
  eventOrganization: { en: 'Event Organization', ar: 'تنظيم الفعاليات' },
  eventOrganizationDesc: {
    en: 'Help run fundraising events and awareness campaigns.',
    ar: 'المساعدة في إدارة فعاليات جمع التبرعات وحملات التوعية.',
  },
  administrativeSupport: { en: 'Administrative Support', ar: 'الدعم الإداري' },
  socialMedia: { en: 'Social Media & Marketing', ar: 'وسائل التواصل الاجتماعي والتسويق' },
  fundraising: { en: 'Fundraising', ar: 'جمع التبرعات' },
  other: { en: 'Other', ar: 'أخرى' },
})

const VOLUNTEER_ROLES: { title: Message; description: Message }[] = [
  { title: M.foodDistribution, description: M.foodDistributionDesc },
  { title: M.communityOutreach, description: M.communityOutreachDesc },
  { title: M.educationalSupport, description: M.educationalSupportDesc },
  { title: M.eventOrganization, description: M.eventOrganizationDesc },
]

/** The submitted value stays the English name (it is what the team reads); only the label is translated. */
const INTEREST_OPTIONS: Message[] = [
  M.foodDistribution,
  M.communityOutreach,
  M.educationalSupport,
  M.eventOrganization,
  M.administrativeSupport,
  M.socialMedia,
  M.fundraising,
  M.other,
]

/** Put React nodes into the `{slot}`s of a translated sentence (word order differs per language). */
const fill = (text: string, slots: Record<string, ReactNode>) =>
  text.split(/\{(\w+)\}/).map((part, i) => (i % 2 ? <Fragment key={i}>{slots[part]}</Fragment> : part))

const Volunteer = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    interest: ''
  })
  const [submitted, setSubmitted] = useState(false)
  const t = useT()

  const submitMutation = useMutation(volunteersAPI.create, {
    onSuccess: () => {
      setSubmitted(true)
      setFormData({ name: '', email: '', interest: '' })
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    submitMutation.mutate(formData)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }))
  }

  return (
    <div className="min-h-screen bg-white">
      <SEOHead
        title={t(M.title)}
        description={t(M.seoDescription)}
        canonicalPath="/volunteer"
      />
      <PageHeader
        title={t(M.title)}
        description={t(M.lead)}
      />

      <div className="section-container section">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 lg:gap-14">
          {/* The form comes first: it is the one thing to do on this page. */}
          <div className="lg:col-span-3">
            {submitted ? (
              <div className="card text-center" role="status">
                <CheckCircle className="w-12 h-12 text-green-700 mx-auto mb-4" aria-hidden="true" />
                <h2 className="text-2xl font-semibold text-gray-900 mb-2">{t(M.thankYou)}</h2>
                <p className="text-gray-600 mb-6">
                  {t(M.sent)}
                </p>
                <button
                  type="button"
                  onClick={() => setSubmitted(false)}
                  className="btn-secondary"
                >
                  {t(M.another)}
                </button>
              </div>
            ) : (
              <div className="card sm:p-8">
                <h2 className="text-xl font-semibold text-gray-900 mb-6">{t(M.formTitle)}</h2>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label htmlFor="name" className="label">
                      {t(M.fullName)}
                    </label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      autoComplete="name"
                      className="input-field"
                      placeholder={t(M.fullNamePlaceholder)}
                    />
                  </div>

                  <div>
                    <label htmlFor="email" className="label">
                      {t(M.email)}
                    </label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      required
                      autoComplete="email"
                      className="input-field"
                      placeholder={t(M.emailPlaceholder)}
                    />
                  </div>

                  <div>
                    <label htmlFor="interest" className="label">
                      {t(M.interest)}
                    </label>
                    <select
                      id="interest"
                      name="interest"
                      value={formData.interest}
                      onChange={handleChange}
                      required
                      className="input-field"
                    >
                      <option value="">{t(M.interestPlaceholder)}</option>
                      {INTEREST_OPTIONS.map((option) => (
                        <option key={option.en} value={option.en}>{t(option)}</option>
                      ))}
                    </select>
                  </div>

                  {submitMutation.isError && (
                    <p className="alert-error" role="alert">
                      {t(M.error)}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={submitMutation.isLoading}
                    className="w-full btn-primary gap-2"
                  >
                    {submitMutation.isLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" aria-hidden="true"></div>
                        {t(M.submitting)}
                      </>
                    ) : (
                      <>
                        {t(M.submit)}
                        <ArrowRight className="w-4 h-4" aria-hidden="true" />
                      </>
                    )}
                  </button>
                </form>
              </div>
            )}

            <p className="mt-6 text-sm text-gray-600">
              {fill(t(M.questions), {
                email: <a href="mailto:info@myzakat.org" className="link">info@myzakat.org</a>,
              })}
            </p>
          </div>

          {/* Compact list of roles */}
          <section className="lg:col-span-2" aria-labelledby="volunteer-roles">
            <h2 id="volunteer-roles" className="text-lg font-semibold text-gray-900 mb-4">{t(M.waysToHelp)}</h2>
            <ul className="divide-y divide-gray-200 border-y border-gray-200">
              {VOLUNTEER_ROLES.map((role) => (
                <li key={role.title.en} className="py-4">
                  <h3 className="font-medium text-gray-900">{t(role.title)}</h3>
                  <p className="mt-1 text-sm text-gray-600">{t(role.description)}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}

export default Volunteer
