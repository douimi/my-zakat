import { useForm } from 'react-hook-form'
import { Mail, Phone, MapPin } from 'lucide-react'
import { contactAPI } from '../utils/api'
import { useToast } from '../contexts/ToastContext'
import SEOHead from '../components/SEOHead'
import PageHeader from '../components/ui/PageHeader'

interface ContactForm {
  name: string
  email: string
  message: string
}

const Contact = () => {
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<ContactForm>()
  const { showSuccess, showError } = useToast()

  const onSubmit = async (data: ContactForm) => {
    try {
      await contactAPI.create(data)
      showSuccess('Message Sent', 'Thank you for your message! We will get back to you soon.')
      reset()
    } catch (error) {
      showError('Error', 'Error sending message. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <SEOHead
        title="Contact Us"
        description="Get in touch with MyZakat Zakat Distribution Foundation. Reach out for questions about Zakat, donations, volunteering, or partnership opportunities."
        canonicalPath="/contact"
      />
      <PageHeader
        title="Contact Us"
        description="Get in touch with our team about zakat, donations, volunteering or partnerships."
      />

      <div className="section-container section">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12">
          <div className="card sm:p-8 lg:col-span-3">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Send us a message</h2>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div>
                <label htmlFor="contact-name" className="label">Name</label>
                <input
                  id="contact-name"
                  autoComplete="name"
                  {...register('name', { required: true })}
                  className="input-field"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label htmlFor="contact-email" className="label">Email</label>
                <input
                  id="contact-email"
                  type="email"
                  autoComplete="email"
                  {...register('email', { required: true })}
                  className="input-field"
                  placeholder="Your email"
                />
              </div>
              <div>
                <label htmlFor="contact-message" className="label">Message</label>
                <textarea
                  id="contact-message"
                  {...register('message', { required: true })}
                  rows={6}
                  className="input-field"
                  placeholder="Your message"
                />
              </div>
              <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
                {isSubmitting ? 'Sending…' : 'Send Message'}
              </button>
            </form>
          </div>

          <div className="lg:col-span-2">
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Get in touch</h2>
              <ul className="space-y-4 text-gray-700">
                <li className="flex items-center gap-3">
                  <Mail className="w-5 h-5 shrink-0 text-primary-700" aria-hidden="true" />
                  <a href="mailto:info@myzakat.org" className="link">info@myzakat.org</a>
                </li>
                <li className="flex items-center gap-3">
                  <Phone className="w-5 h-5 shrink-0 text-primary-700" aria-hidden="true" />
                  <a href="tel:+18336992528" className="link">1-833-MYZAKAT</a>
                </li>
                <li className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 shrink-0 mt-0.5 text-primary-700" aria-hidden="true" />
                  <span>P.O. BOX 2250, Winchester, VA 22604</span>
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
