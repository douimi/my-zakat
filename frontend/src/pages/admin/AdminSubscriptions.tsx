import { useState, useEffect } from 'react'
import { Calendar, CreditCard, User, DollarSign, AlertCircle, CheckCircle, XCircle, RefreshCw } from 'lucide-react'
import { donationsAPI } from '../../utils/api'
import { useToast } from '../../contexts/ToastContext'
import { useConfirmation } from '../../hooks/useConfirmation'

interface Subscription {
  id: number
  stripe_subscription_id: string
  name: string
  email: string
  amount: number
  purpose: string
  interval: string
  payment_day: number
  payment_month?: number
  status: string
  created_at: string
  next_payment_date?: string
}

const AdminSubscriptions = () => {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const { showSuccess, showError } = useToast()
  const [updatingStatus, setUpdatingStatus] = useState(false)

  useEffect(() => {
    fetchSubscriptions()
  }, [])

  const fetchSubscriptions = async () => {
    try {
      const data = await donationsAPI.getSubscriptions()
      setSubscriptions(data)
    } catch (err) {
      setError('Failed to fetch subscriptions')
      console.error('Error fetching subscriptions:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateStatus = async () => {
    setUpdatingStatus(true)
    try {
      const result = await donationsAPI.updateSubscriptionStatus()
      await fetchSubscriptions() // Refresh the list
      showSuccess('Status Updated', `Updated ${result.updated} subscription statuses`)
    } catch (err) {
      setError('Failed to update subscription status')
      console.error('Error updating status:', err)
    } finally {
      setUpdatingStatus(false)
    }
  }

  const { confirm, ConfirmationDialog } = useConfirmation()

  const handleCancelSubscription = async (subscriptionId: string) => {
    const confirmed = await confirm({
      title: 'Cancel Subscription',
      message: 'Are you sure you want to cancel this subscription? This action cannot be undone.',
      confirmText: 'Cancel Subscription',
      cancelText: 'Keep Subscription',
      variant: 'warning'
    })
    if (!confirmed) {
      return
    }

    setCancellingId(subscriptionId)
    try {
      await donationsAPI.cancelSubscription(subscriptionId)
      await fetchSubscriptions() // Refresh the list
    } catch (err) {
      setError('Failed to cancel subscription')
      console.error('Error cancelling subscription:', err)
    } finally {
      setCancellingId(null)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="w-5 h-5 text-green-500" />
      case 'canceled':
        return <XCircle className="w-5 h-5 text-red-500" />
      case 'past_due':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />
      default:
        return <AlertCircle className="w-5 h-5 text-gray-500" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800'
      case 'canceled':
        return 'bg-red-100 text-red-800'
      case 'past_due':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const formatPaymentSchedule = (subscription: Subscription) => {
    if (subscription.interval === 'month') {
      return `Monthly on the ${subscription.payment_day}${getOrdinalSuffix(subscription.payment_day)}`
    } else if (subscription.interval === 'year') {
      const monthName = getMonthName(subscription.payment_month || 1)
      return `Annually on ${monthName} ${subscription.payment_day}${getOrdinalSuffix(subscription.payment_day)}`
    }
    return subscription.interval
  }

  const getOrdinalSuffix = (day: number): string => {
    if (day >= 11 && day <= 13) return 'th'
    switch (day % 10) {
      case 1: return 'st'
      case 2: return 'nd'
      case 3: return 'rd'
      default: return 'th'
    }
  }

  const getMonthName = (month: number): string => {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ]
    return months[month - 1] || ''
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
    <div>
          <h1 className="text-2xl font-bold text-gray-900">Donation Subscriptions</h1>
          <p className="text-gray-600">Manage recurring donations and subscriptions</p>
          </div>
        <div className="flex items-center space-x-4">
          {window.location.hostname === 'localhost' && (
            <button
              onClick={handleUpdateStatus}
              disabled={updatingStatus}
              className="btn-secondary flex items-center"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${updatingStatus ? 'animate-spin' : ''}`} />
              {updatingStatus ? 'Updating...' : 'Update Status'}
            </button>
          )}
          <div className="text-sm text-gray-500">
            Total: {subscriptions.length} subscriptions
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <div className="mt-2 text-sm text-red-700">{error}</div>
            </div>
          </div>
        </div>
      )}

      {/* Debug info */}
      {process.env.NODE_ENV === 'development' && (
        <div className="bg-yellow-50 p-4 rounded-lg text-sm">
          <strong>Debug:</strong> Statuses: {JSON.stringify(subscriptions.map(s => s.status))}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <CheckCircle className="h-8 w-8 text-green-500" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Active</p>
              <p className="text-2xl font-semibold text-gray-900">
                {subscriptions.filter(s => s.status === 'active').length}
              </p>
            </div>
          </div>
              </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <XCircle className="h-8 w-8 text-red-500" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Canceled</p>
              <p className="text-2xl font-semibold text-gray-900">
                {subscriptions.filter(s => s.status === 'canceled').length}
              </p>
            </div>
          </div>
              </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <AlertCircle className="h-8 w-8 text-yellow-500" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Past Due</p>
              <p className="text-2xl font-semibold text-gray-900">
                {subscriptions.filter(s => s.status === 'past_due').length}
              </p>
              </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <DollarSign className="h-8 w-8 text-blue-500" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Monthly Revenue</p>
              <p className="text-2xl font-semibold text-gray-900">
                ${subscriptions
                  .filter(s => s.status === 'active')
                  .reduce((sum, s) => sum + (s.interval === 'month' ? s.amount : s.amount / 12), 0)
                  .toFixed(0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Subscriptions Table */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">All Subscriptions</h3>
        </div>
        
          <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Donor
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount & Purpose
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Schedule
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Next Payment
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
                </tr>
              </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {subscriptions.map((subscription) => (
                <tr key={subscription.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                      <User className="h-8 w-8 text-gray-400" />
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {subscription.name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {subscription.email}
                        </div>
                        </div>
                      </div>
                    </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      ${subscription.amount.toFixed(2)}
                        </div>
                    <div className="text-sm text-gray-500">
                      {subscription.purpose}
                      </div>
                    </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <Calendar className="h-4 w-4 text-gray-400 mr-2" />
                      <span className="text-sm text-gray-900">
                        {formatPaymentSchedule(subscription)}
                          </span>
                      </div>
                    </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {getStatusIcon(subscription.status)}
                      <span className={`ml-2 inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(subscription.status)}`}>
                        {subscription.status}
                      </span>
                      </div>
                    </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {subscription.next_payment_date 
                      ? formatDate(subscription.next_payment_date)
                      : '-'
                    }
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(subscription.created_at)}
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    {subscription.status === 'active' && (
                        <button
                        onClick={() => handleCancelSubscription(subscription.stripe_subscription_id)}
                        disabled={cancellingId === subscription.stripe_subscription_id}
                        className="text-red-600 hover:text-red-900 disabled:opacity-50"
                      >
                        {cancellingId === subscription.stripe_subscription_id ? 'Canceling...' : 'Cancel'}
                        </button>
                    )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          
          {subscriptions.length === 0 && (
            <div className="text-center py-12">
              <CreditCard className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No subscriptions</h3>
              <p className="mt-1 text-sm text-gray-500">
                No recurring donations have been set up yet.
              </p>
            </div>
          )}
          </div>
        </div>

      <ConfirmationDialog />
    </div>
  )
}

export default AdminSubscriptions