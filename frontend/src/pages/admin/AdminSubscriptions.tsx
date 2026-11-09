import { useState, useEffect } from 'react'
import { Calendar, CreditCard, User, RefreshCw } from 'lucide-react'
import { donationsAPI } from '../../utils/api'
import { useToast } from '../../contexts/ToastContext'
import { useConfirmation } from '../../hooks/useConfirmation'
import {
  PageHeader, LoadingBlock, ErrorState, EmptyState, StatusBadge, type StatusTone,
} from '../../components/admin'

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
  const [tab, setTab] = useState<'all' | 'active' | 'past_due' | 'canceled'>('all')

  useEffect(() => {
    fetchSubscriptions()
  }, [])

  const fetchSubscriptions = async () => {
    try {
      setError(null)
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

  const retry = () => {
    setLoading(true)
    fetchSubscriptions()
  }

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

  const STATUS_TONE: Record<string, StatusTone> = { active: 'success', canceled: 'danger', past_due: 'warning' }

  const counts = {
    all: subscriptions.length,
    active: subscriptions.filter(s => s.status === 'active').length,
    past_due: subscriptions.filter(s => s.status === 'past_due').length,
    canceled: subscriptions.filter(s => s.status === 'canceled').length,
  }
  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'past_due', label: 'Past Due' },
    { key: 'canceled', label: 'Canceled' },
  ]
  const visible = tab === 'all' ? subscriptions : subscriptions.filter(s => s.status === tab)
  const monthlyRevenue = subscriptions
    .filter(s => s.status === 'active')
    .reduce((sum, s) => sum + (s.interval === 'month' ? s.amount : s.amount / 12), 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subscriptions"
        icon={CreditCard}
        count={subscriptions.length}
        description={counts.active > 0
          ? `About $${monthlyRevenue.toFixed(0)} a month from ${counts.active} active subscription${counts.active === 1 ? '' : 's'}.`
          : 'Recurring donations set up through Stripe.'}
        actions={window.location.hostname === 'localhost' ? (
          <button
            onClick={handleUpdateStatus}
            disabled={updatingStatus}
            className="btn-secondary gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${updatingStatus ? 'animate-spin' : ''}`} aria-hidden="true" />
            {updatingStatus ? 'Updating...' : 'Update Status'}
          </button>
        ) : undefined}
      />

      {error && <ErrorState message={error} onRetry={retry} />}

      <div className="border-b border-gray-200 overflow-x-auto">
        <div role="tablist" aria-label="Filter subscriptions" className="-mb-px flex gap-6 sm:gap-8">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                tab === t.key
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {t.label} ({counts[t.key]})
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <LoadingBlock />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No subscriptions"
          body={tab === 'all' ? 'No recurring donations have been set up yet.' : 'None with this status.'}
        />
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Donor</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount & Purpose</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Schedule</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Next Payment</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {visible.map((subscription) => (
                <tr key={subscription.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <User className="h-8 w-8 text-gray-400" aria-hidden="true" />
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{subscription.name}</div>
                        <div className="text-sm text-gray-500">{subscription.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">${subscription.amount.toFixed(2)}</div>
                    <div className="text-sm text-gray-500">{subscription.purpose}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <Calendar className="h-4 w-4 text-gray-400 mr-2" aria-hidden="true" />
                      <span className="text-sm text-gray-900">{formatPaymentSchedule(subscription)}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge tone={STATUS_TONE[subscription.status] || 'neutral'}>
                      {subscription.status}
                    </StatusBadge>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {subscription.next_payment_date ? formatDate(subscription.next_payment_date) : '-'}
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
        </div>
      )}

      <ConfirmationDialog />
    </div>
  )
}

export default AdminSubscriptions