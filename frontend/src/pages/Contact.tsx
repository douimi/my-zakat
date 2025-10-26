import { useForm } from 'react-hook-form'
import { Mail, Phone, MapPin } from 'lucide-react'
import { contactAPI } from '../utils/api'
import { useToast } from '../contexts/ToastContext'

interface ContactForm {
  name: string
  email: string
  message: string
}

const Contact = () => {
  const { register, handleSubmit, reset } = useForm<ContactForm>()
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
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="section-container">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-heading font-bold text-gray-900 mb-4">Contact Us</h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Get in touch with our team. We're here to help and answer any questions you may have.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div className="card">
            <h2 className="text-2xl font-semibold mb-6">Send us a message</h2>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
                <input
                  {...register('name', { required: true })}
                  className="input-field"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <input
                  type="email"
                  {...register('email', { required: true })}
                  className="input-field"
                  placeholder="Your email"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Message</label>
                <textarea
                  {...register('message', { required: true })}
                  rows={6}
                  className="input-field"
                  placeholder="Your message"
                />
              </div>
              <button type="submit" className="btn-primary w-full">
                Send Message
              </button>
            </form>
          </div>

          <div className="space-y-8">
            <div className="card">
              <h3 className="text-xl font-semibold mb-4">Get in touch</h3>
              <div className="space-y-4">
                <div className="flex items-center">
                  <Mail className="w-5 h-5 text-primary-600 mr-3" />
                  <span>info@myzakat.org</span>
                </div>
                <div className="flex items-center">
                  <Phone className="w-5 h-5 text-primary-600 mr-3" />
                  <span>+1 (555) 123-4567</span>
                </div>
                <div className="flex items-center">
                  <MapPin className="w-5 h-5 text-primary-600 mr-3" />
                  <span>123 Charity Ave, City, Country</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Contact
