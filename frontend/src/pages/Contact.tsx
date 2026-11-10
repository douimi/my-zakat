import { useForm } from 'react-hook-form'
import { Mail, Phone, MapPin } from 'lucide-react'
import { contactAPI } from '../utils/api'
import { useToast } from '../contexts/ToastContext'
import SEOHead from '../components/SEOHead'
import PageHeader from '../components/ui/PageHeader'
import { defineMessages, useLocale, useT } from '../i18n'
import { C } from '../i18n/common'

const M = defineMessages({
  title: { en: 'Contact Us', ar: 'اتصل بنا' },
  seoDescription: {
    en: 'Get in touch with MyZakat Zakat Distribution Foundation. Reach out for questions about Zakat, donations, volunteering, or partnership opportunities.',
    ar: 'تواصل مع مؤسسة ماي زكاة لتوزيع الزكاة لأي استفسار عن الزكاة أو التبرعات أو التطوع أو فرص الشراكة.',
  },
  lead: {
    en: 'Get in touch with our team about zakat, donations, volunteering or partnerships.',
    ar: 'تواصل مع فريقنا بشأن الزكاة أو التبرعات أو التطوع أو الشراكات.',
  },
  sentTitle: { en: 'Message Sent', ar: 'تم إرسال رسالتك' },
  sentBody: {
    en: 'Thank you for your message! We will get back to you soon.',
    ar: 'شكرًا لتواصلك معنا! سنرد عليك قريبًا بإذن الله.',
  },
  errorTitle: { en: 'Error', ar: 'خطأ' },
  errorBody: {
    en: 'Error sending message. Please try again.',
    ar: 'تعذّر إرسال الرسالة. يُرجى المحاولة مرة أخرى.',
  },
  formTitle: { en: 'Send us a message', ar: 'راسلنا' },
  name: { en: 'Name', ar: 'الاسم' },
  namePlaceholder: { en: 'Your name', ar: 'اسمك' },
  email: { en: 'Email', ar: 'البريد الإلكتروني' },
  emailPlaceholder: { en: 'Your email', ar: 'بريدك الإلكتروني' },
  message: { en: 'Message', ar: 'الرسالة' },
  messagePlaceholder: { en: 'Your message', ar: 'رسالتك' },
  sending: { en: 'Sending…', ar: 'جارٍ الإرسال…' },
  send: { en: 'Send Message', ar: 'إرسال الرسالة' },
  getInTouch: { en: 'Get in touch', ar: 'تواصل معنا' },
})

interface ContactForm {
  name: string
  email: string
  message: string
}

const Contact = () => {
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<ContactForm>()
  const { showSuccess, showError } = useToast()
  const t = useT()
  // Phone numbers read left-to-right inside Arabic text.
  const ltr = useLocale() === 'ar' ? 'ltr' : undefined

  const onSubmit = async (data: ContactForm) => {
    try {
      await contactAPI.create(data)
      showSuccess(t(M.sentTitle), t(M.sentBody))
      reset()
    } catch (error) {
      showError(t(M.errorTitle), t(M.errorBody))
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <SEOHead
        title={t(M.title)}
        description={t(M.seoDescription)}
        canonicalPath="/contact"
      />
      <PageHeader
        title={t(M.title)}
        description={t(M.lead)}
      />

      <div className="section-container section">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12">
          <div className="card sm:p-8 lg:col-span-3">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">{t(M.formTitle)}</h2>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div>
                <label htmlFor="contact-name" className="label">{t(M.name)}</label>
                <input
                  id="contact-name"
                  autoComplete="name"
                  {...register('name', { required: true })}
                  className="input-field"
                  placeholder={t(M.namePlaceholder)}
                />
              </div>
              <div>
                <label htmlFor="contact-email" className="label">{t(M.email)}</label>
                <input
                  id="contact-email"
                  type="email"
                  autoComplete="email"
                  {...register('email', { required: true })}
                  className="input-field"
                  placeholder={t(M.emailPlaceholder)}
                />
              </div>
              <div>
                <label htmlFor="contact-message" className="label">{t(M.message)}</label>
                <textarea
                  id="contact-message"
                  {...register('message', { required: true })}
                  rows={6}
                  className="input-field"
                  placeholder={t(M.messagePlaceholder)}
                />
              </div>
              <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
                {isSubmitting ? t(M.sending) : t(M.send)}
              </button>
            </form>
          </div>

          <div className="lg:col-span-2">
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">{t(M.getInTouch)}</h2>
              <ul className="space-y-4 text-gray-700">
                <li className="flex items-center gap-3">
                  <Mail className="w-5 h-5 shrink-0 text-primary-700" aria-hidden="true" />
                  <a href="mailto:info@myzakat.org" className="link">info@myzakat.org</a>
                </li>
                <li className="flex items-center gap-3">
                  <Phone className="w-5 h-5 shrink-0 text-primary-700" aria-hidden="true" />
                  <a href="tel:+18336992528" className="link" dir={ltr}>1-833-MYZAKAT</a>
                </li>
                <li className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 shrink-0 mt-0.5 text-primary-700" aria-hidden="true" />
                  <span>{t(C.address)}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Contact
