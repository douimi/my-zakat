import { Link } from 'react-router-dom'
import { CheckCircle } from 'lucide-react'
import SEOHead from '../components/SEOHead'
import { defineMessages, useT } from '../i18n'

const M = defineMessages({
  seoTitle: { en: 'Donation Successful', ar: 'تم التبرع بنجاح' },
  seoDescription: {
    en: 'Thank you for your generous donation to MyZakat.',
    ar: 'جزاك الله خيرًا على تبرعك السخي لماي زكاة.',
  },
  thankYou: { en: 'Thank You!', ar: 'جزاك الله خيرًا!' },
  processed: {
    en: 'Your donation has been processed successfully. You will receive a confirmation email shortly.',
    ar: 'تمت معالجة تبرعك بنجاح، وستصلك رسالة تأكيد على بريدك الإلكتروني قريبًا.',
  },
  returnHome: { en: 'Return to Home', ar: 'العودة إلى الرئيسية' },
  donateAgain: { en: 'Make Another Donation', ar: 'تبرّع مرة أخرى' },
})

const DonationSuccess = () => {
  const t = useT()
  return (
    <div className="min-h-[70vh] bg-gray-50 flex items-center justify-center px-4 py-12">
      <SEOHead
        noindex={true}
        title={t(M.seoTitle)}
        description={t(M.seoDescription)}
      />
      <div className="card sm:p-8 w-full max-w-md text-center">
        <CheckCircle className="w-12 h-12 text-accent-600 mx-auto mb-4" aria-hidden="true" />
        <h1 className="text-3xl font-heading font-bold text-gray-900 mb-3">{t(M.thankYou)}</h1>
        <p className="text-gray-600">
          {t(M.processed)}
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <Link to="/" className="btn-primary w-full">
            {t(M.returnHome)}
          </Link>
          <Link to="/donate" className="btn-secondary w-full">
            {t(M.donateAgain)}
          </Link>
        </div>
      </div>
    </div>
  )
}

export default DonationSuccess
