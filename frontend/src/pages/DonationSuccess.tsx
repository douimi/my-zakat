import { Link } from 'react-router-dom'
import { CheckCircle } from 'lucide-react'
import SEOHead from '../components/SEOHead'

const DonationSuccess = () => {
  return (
    <div className="min-h-[70vh] bg-gray-50 flex items-center justify-center px-4 py-12">
      <SEOHead
        noindex={true}
        title="Donation Successful"
        description="Thank you for your generous donation to MyZakat."
      />
      <div className="card sm:p-8 w-full max-w-md text-center">
        <CheckCircle className="w-12 h-12 text-accent-600 mx-auto mb-4" aria-hidden="true" />
        <h1 className="text-3xl font-heading font-bold text-gray-900 mb-3">Thank You!</h1>
        <p className="text-gray-600">
          Your donation has been processed successfully. You will receive a confirmation email shortly.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <Link to="/" className="btn-primary w-full">
            Return to Home
          </Link>
          <Link to="/donate" className="btn-secondary w-full">
            Make Another Donation
          </Link>
        </div>
      </div>
    </div>
  )
}

export default DonationSuccess
