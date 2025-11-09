import { useState, useEffect } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { DollarSign, Heart, CreditCard, Calendar, X, LogOut, User as UserIcon, Shield, Home, Download, Mail } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useToast } from '../contexts/ToastContext'

interface DashboardStats {
  total_donated: number
  donation_count: number
  active_subscriptions: number
  recent_donations: Array<{
    id: number
    amount: number
    frequency: string
    donated_at: string
  }>
}

interface Donation {
  id: number
  name: string
  email: string
  amount: number
  frequency: string
  certificate_filename: string | null
  donated_at: string
}

interface Subscription {
  id: number
  stripe_subscription_id: string
  amount: number
  purpose: string
  interval: string
  payment_day: number
  payment_month: number | null
  status: string
  created_at: string
  next_payment_date: string | null
}

const UserDashboard = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [donations, setDonations] = useState<Donation[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [cancellingId, setCancellingId] = useState<number | null>(null)
  const [regeneratingId, setRegeneratingId] = useState<number | null>(null)
  const [emailingId, setEmailingId] = useState<number | null>(null)
  const { user, token, isAuthenticated, isAdmin, logout } = useAuthStore()
  const navigate = useNavigate()
  const { showSuccess, showError } = useToast()

  useEffect(() => {
    if (isAuthenticated && token) {
      fetchDashboardData()
    }
  }, [isAuthenticated, token])

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  const handle401Error = () => {
    logout()
    navigate('/login')
  }

  const fetchDashboardData = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
      
      // Fetch stats
      const statsResponse = await fetch(`${API_URL}/api/user/dashboard-stats`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      if (statsResponse.status === 401) {
        handle401Error()
        return
      }
      if (statsResponse.ok) {
        const statsData = await statsResponse.json()
        setStats(statsData)
      }

      // Fetch donations
      const donationsResponse = await fetch(`${API_URL}/api/user/donations`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      if (donationsResponse.status === 401) {
        handle401Error()
        return
      }
      if (donationsResponse.ok) {
        const donationsData = await donationsResponse.json()
        setDonations(donationsData)
      }

      // Fetch subscriptions
      const subscriptionsResponse = await fetch(`${API_URL}/api/user/subscriptions`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      if (subscriptionsResponse.status === 401) {
        handle401Error()
        return
      }
      if (subscriptionsResponse.ok) {
        const subscriptionsData = await subscriptionsResponse.json()
        setSubscriptions(subscriptionsData)
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancelSubscription = async (subscriptionId: number) => {
    if (!confirm('Are you sure you want to cancel this subscription?')) {
      return
    }

    setCancellingId(subscriptionId)
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_URL}/api/user/cancel-subscription/${subscriptionId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.status === 401) {
        handle401Error()
        return
      }

      if (response.ok) {
        showSuccess('Success', 'Subscription canceled successfully')
        fetchDashboardData() // Refresh data
      } else {
        const error = await response.json()
        showError('Error', error.detail || 'Failed to cancel subscription')
      }
    } catch (error) {
      showError('Error', 'Failed to cancel subscription')
    } finally {
      setCancellingId(null)
    }
  }

  const handleDownloadCertificate = async (donationId: number) => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_URL}/api/user/certificate/${donationId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.status === 401) {
        handle401Error()
        return
      }

      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `donation_certificate_${donationId}.pdf`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
        showSuccess('Success', 'Certificate downloaded successfully')
      } else {
        const error = await response.json()
        showError('Error', error.detail || 'Failed to download certificate')
      }
    } catch (error) {
      showError('Error', 'Failed to download certificate')
    }
  }

  const handleRegenerateCertificate = async (donationId: number) => {
    setRegeneratingId(donationId)
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_URL}/api/user/regenerate-certificate/${donationId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.status === 401) {
        handle401Error()
        return
      }

      if (response.ok) {
        showSuccess('Success', 'Certificate regenerated successfully')
        fetchDashboardData() // Refresh data
      } else {
        const error = await response.json()
        showError('Error', error.detail || 'Failed to regenerate certificate')
      }
    } catch (error) {
      showError('Error', 'Failed to regenerate certificate')
    } finally {
      setRegeneratingId(null)
    }
  }

  const handleEmailCertificate = async (donationId: number) => {
    setEmailingId(donationId)
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_URL}/api/user/email-certificate/${donationId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.status === 401) {
        handle401Error()
        return
      }

      if (response.ok) {
        showSuccess('Success', 'Certificate emailed successfully')
      } else {
        const error = await response.json()
        showError('Error', error.detail || 'Failed to email certificate')
      }
    } catch (error) {
      showError('Error', 'Failed to email certificate')
    } finally {
      setEmailingId(null)
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center mr-4">
                <UserIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Welcome back, {user?.name || 'User'}!
                </h1>
                <p className="text-sm text-gray-600">{user?.email}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => navigate('/')}
                className="flex items-center space-x-2 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition duration-200"
              >
                <Home className="w-4 h-4" />
                <span>Back to Home</span>
              </button>
              {isAdmin && (
                <button
                  onClick={() => navigate('/admin')}
                  className="flex items-center space-x-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition duration-200"
                >
                  <Shield className="w-4 h-4" />
                  <span>Admin Console</span>
                </button>
              )}
              <button
                onClick={handleLogout}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition duration-200 flex items-center"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Total Donated</p>
                  <p className="text-3xl font-bold text-blue-600">
                    ${stats.total_donated.toFixed(2)}
                  </p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <DollarSign className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Donations Made</p>
                  <p className="text-3xl font-bold text-blue-600">{stats.donation_count}</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Heart className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Active Subscriptions</p>
                  <p className="text-3xl font-bold text-blue-600">{stats.active_subscriptions}</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <CreditCard className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Active Subscriptions */}
        {subscriptions.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
              <CreditCard className="w-5 h-5 mr-2 text-blue-600" />
              Active Subscriptions
            </h2>
            <div className="space-y-4">
              {subscriptions.map((subscription) => (
                <div
                  key={subscription.id}
                  className="border border-gray-200 rounded-lg p-4 flex items-center justify-between"
                >
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">{subscription.purpose}</h3>
                    <div className="mt-2 text-sm text-gray-600 space-y-1">
                      <p>Amount: <span className="font-medium">${subscription.amount}</span> / {subscription.interval}</p>
                      <p>Status: <span className={`font-medium ${subscription.status === 'active' ? 'text-green-600' : 'text-yellow-600'}`}>
                        {subscription.status}
                      </span></p>
                      {subscription.next_payment_date && (
                        <p>Next Payment: {formatDate(subscription.next_payment_date)}</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleCancelSubscription(subscription.id)}
                    disabled={cancellingId === subscription.id}
                    className="bg-red-100 hover:bg-red-200 text-red-700 px-4 py-2 rounded-lg text-sm font-medium transition duration-200 flex items-center"
                  >
                    {cancellingId === subscription.id ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-700"></div>
                    ) : (
                      <>
                        <X className="w-4 h-4 mr-1" />
                        Cancel
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Donation History */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
            <Calendar className="w-5 h-5 mr-2 text-blue-600" />
            Donation History
          </h2>
          {donations.length === 0 ? (
            <p className="text-gray-600 text-center py-8">No donations yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Certificate
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {donations.map((donation) => (
                    <tr key={donation.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(donation.donated_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">
                        ${donation.amount.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {donation.frequency}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {/* Certificates are now generated on-the-fly, so they're always available */}
                        <div className="flex items-center space-x-3">
                          <button
                            onClick={() => handleDownloadCertificate(donation.id)}
                            className="flex items-center space-x-1 text-blue-600 hover:text-blue-800 font-medium"
                          >
                            <Download className="w-4 h-4" />
                            <span>Download</span>
                          </button>
                          <button
                            onClick={() => handleEmailCertificate(donation.id)}
                            disabled={emailingId === donation.id}
                            className="flex items-center space-x-1 text-green-600 hover:text-green-800 font-medium disabled:opacity-50"
                          >
                            {emailingId === donation.id ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600"></div>
                                <span>Sending...</span>
                              </>
                            ) : (
                              <>
                                <Mail className="w-4 h-4" />
                                <span>Email</span>
                              </>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default UserDashboard

