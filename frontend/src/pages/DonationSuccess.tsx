import { Link } from 'react-router-dom'
import { CheckCircle, Heart } from 'lucide-react'

const DonationSuccess = () => {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12">
      <div className="text-center max-w-md mx-auto">
        <div className="mb-8">
          <CheckCircle className="w-20 h-20 text-green-600 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Thank You!</h1>
          <p className="text-gray-600">Your donation has been processed successfully. You will receive a confirmation email shortly.</p>
        </div>
        <div className="space-y-4">
          <Link to="/" className="btn-primary w-full">
            Return to Home
          </Link>
          <Link to="/donate" className="btn-outline w-full flex items-center justify-center">
            <Heart className="w-4 h-4 mr-2" />
            Make Another Donation
          </Link>
        </div>
      </div>
    </div>
  )
}

export default DonationSuccess
