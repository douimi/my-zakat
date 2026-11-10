import { useState, useEffect } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Heart, X, LogOut, Shield, Download, Mail } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useToast } from '../contexts/ToastContext'
import { useConfirmation } from '../hooks/useConfirmation'
import SEOHead from '../components/SEOHead'
import { defineMessages, useFormat, useLocale, useT } from '../i18n'
import { C } from '../i18n/common'

const M = defineMessages({
  cancelTitle: { en: 'Cancel Subscription', ar: 'إلغاء الاشتراك' },
  cancelMessage: {
    en: 'Are you sure you want to cancel this subscription? This action cannot be undone.',
    ar: 'هل أنت متأكد من رغبتك في إلغاء هذا الاشتراك؟ لا يمكن التراجع عن هذا الإجراء.',
  },
  cancelConfirm: { en: 'Cancel Subscription', ar: 'إلغاء الاشتراك' },
  keepSubscription: { en: 'Keep Subscription', ar: 'الإبقاء على الاشتراك' },
  success: { en: 'Success', ar: 'تم بنجاح' },
  error: { en: 'Error', ar: 'خطأ' },
  canceledOk: { en: 'Subscription canceled successfully', ar: 'تم إلغاء الاشتراك بنجاح' },
  cancelFailed: { en: 'Failed to cancel subscription', ar: 'تعذّر إلغاء الاشتراك' },
  downloadedOk: { en: 'Certificate downloaded successfully', ar: 'تم تنزيل الشهادة بنجاح' },
  downloadFailed: { en: 'Failed to download certificate', ar: 'تعذّر تنزيل الشهادة' },
  regeneratedOk: { en: 'Certificate regenerated successfully', ar: 'تم إنشاء الشهادة من جديد بنجاح' },
  regenerateFailed: { en: 'Failed to regenerate certificate', ar: 'تعذّر إنشاء الشهادة من جديد' },
  emailedOk: { en: 'Certificate emailed successfully', ar: 'أرسلنا الشهادة إلى بريدك الإلكتروني' },
  emailFailed: { en: 'Failed to email certificate', ar: 'تعذّر إرسال الشهادة بالبريد الإلكتروني' },
  backToWebsite: { en: 'Back to the website', ar: 'العودة إلى الموقع' },
  loading: { en: 'Loading your dashboard', ar: 'جارٍ تحميل لوحتك' },
  seoTitle: { en: 'My donations', ar: 'تبرعاتي' },
  welcomeBack: { en: 'Welcome back, {name}!', ar: 'أهلًا بعودتك، {name}!' },
  user: { en: 'User', ar: 'المستخدم' },
  donateAgain: { en: 'Donate again', ar: 'تبرّع مرة أخرى' },
  logout: { en: 'Logout', ar: 'تسجيل الخروج' },
  totalDonated: { en: 'Total Donated', ar: 'إجمالي التبرعات' },
  donationsMade: { en: 'Donations Made', ar: 'عدد التبرعات' },
  activeSubscriptions: { en: 'Active Subscriptions', ar: 'الاشتراكات النشطة' },
  amount: { en: 'Amount:', ar: 'المبلغ:' },
  status: { en: 'Status:', ar: 'الحالة:' },
  nextPayment: { en: 'Next Payment: {date}', ar: 'الدفعة القادمة: {date}' },
  cancelling: { en: 'Cancelling', ar: 'جارٍ الإلغاء' },
  donationHistory: { en: 'Donation History', ar: 'سجل التبرعات' },
  noDonations: { en: 'No donations yet', ar: 'لا توجد تبرعات بعد' },
  firstDonation: { en: 'Make your first donation', ar: 'قدّم تبرعك الأول' },
  date: { en: 'Date', ar: 'التاريخ' },
  amountCol: { en: 'Amount', ar: 'المبلغ' },
  type: { en: 'Type', ar: 'النوع' },
  certificate: { en: 'Certificate', ar: 'الشهادة' },
  downloadCertificate: { en: 'Download certificate', ar: 'تنزيل الشهادة' },
  download: { en: 'Download', ar: 'تنزيل' },
  emailCertificate: { en: 'Email certificate', ar: 'إرسال الشهادة بالبريد' },
  sending: { en: 'Sending...', ar: 'جارٍ الإرسال...' },
  email: { en: 'Email', ar: 'إرسال بالبريد' },
})

/**
 * Values stored by the payment flow (frequency, interval, status) are English
 * words. The English site shows them as stored; the Arabic site translates the
 * ones it knows and falls back to the stored value.
 */
const AR_VALUES: Record<string, string> = {
  // frequency
  'one-time': 'مرة واحدة',
  'one-time (synced)': 'مرة واحدة',
  monthly: 'شهري',
  annually: 'سنوي',
  yearly: 'سنوي',
  'recurring monthly': 'شهري متكرر',
  'recurring yearly': 'سنوي متكرر',
  manual: 'يدوي',
  // interval
  month: 'شهر',
  year: 'سنة',
  // subscription status
  active: 'نشط',
  canceled: 'ملغى',
  cancelled: 'ملغى',
  past_due: 'متأخر السداد',
  unpaid: 'غير مدفوع',
  incomplete: 'غير مكتمل',
  incomplete_expired: 'منتهي',
  trialing: 'فترة تجريبية',
  paused: 'متوقف مؤقتًا',
}

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
  const { user, token, isAuthenticated, isAdmin, isStaff, logout } = useAuthStore()
  const navigate = useNavigate()
  const { showSuccess, showError } = useToast()
  // Called before any early return so the hook order never changes between renders.
  const { confirm, ConfirmationDialog } = useConfirmation()
  const t = useT()
  const locale = useLocale()
  const isAr = locale === 'ar'
  const fmt = useFormat()
  const storedValue = (value: string) => (isAr ? AR_VALUES[value.trim().toLowerCase()] ?? value : value)

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
    const confirmed = await confirm({
      title: t(M.cancelTitle),
      message: t(M.cancelMessage),
      confirmText: t(M.cancelConfirm),
      cancelText: t(M.keepSubscription),
      variant: 'warning'
    })
    if (!confirmed) {
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
        showSuccess(t(M.success), t(M.canceledOk))
        fetchDashboardData() // Refresh data
      } else {
        const error = await response.json()
        showError(t(M.error), (!isAr && error.detail) || t(M.cancelFailed))
      }
    } catch (error) {
      showError(t(M.error), t(M.cancelFailed))
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
        showSuccess(t(M.success), t(M.downloadedOk))
      } else {
        const error = await response.json()
        showError(t(M.error), (!isAr && error.detail) || t(M.downloadFailed))
      }
    } catch (error) {
      showError(t(M.error), t(M.downloadFailed))
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
        showSuccess(t(M.success), t(M.regeneratedOk))
        fetchDashboardData() // Refresh data
      } else {
        const error = await response.json()
        showError(t(M.error), (!isAr && error.detail) || t(M.regenerateFailed))
      }
    } catch (error) {
      showError(t(M.error), t(M.regenerateFailed))
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
        showSuccess(t(M.success), t(M.emailedOk))
      } else {
        const error = await response.json()
        showError(t(M.error), (!isAr && error.detail) || t(M.emailFailed))
      }
    } catch (error) {
      showError(t(M.error), t(M.emailFailed))
    } finally {
      setEmailingId(null)
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(fmt.tag, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }


  // Amounts here are dollars, not cents. English keeps its original rendering.
  const formatMoney = (value: number) =>
    isAr
      ? fmt.money(Math.round(value * 100), { decimals: true })
      : `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  // This page renders outside the site layout (no header), so it carries its own way back.
  const topBar = (
    <div className="flex items-center justify-between gap-4 mb-6">
      <Link to="/" className="inline-flex items-center">
        <img src="/logo.png" alt={t(C.homeLogoAlt)} className="h-10" />
      </Link>
      <Link to="/" className="link text-sm">{t(M.backToWebsite)}</Link>
    </div>
  )

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" role="status">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" aria-hidden="true"></div>
        <span className="sr-only">{t(M.loading)}</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-6 sm:py-8">
      <SEOHead title={t(M.seoTitle)} canonicalPath="/dashboard" noindex />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {topBar}

        {/* Header: who, what they gave, and the next thing to do */}
        <div className="card mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-heading font-bold text-gray-900 truncate">
                {t(M.welcomeBack, { name: user?.name || t(M.user) })}
              </h1>
              <p className="text-sm text-gray-600 truncate">{user?.email}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link to="/donate" className="btn-primary btn-sm gap-2">
                <Heart className="w-4 h-4" aria-hidden="true" /> {donations.length > 0 ? t(M.donateAgain) : t(C.donate)}
              </Link>
              {isStaff && (
                <button
                  type="button"
                  onClick={() => navigate('/admin')}
                  className="btn-secondary btn-sm gap-2"
                >
                  <Shield className="w-4 h-4" aria-hidden="true" />
                  {isAdmin ? t(C.adminConsole) : t(C.managerConsole)}
                </button>
              )}
              <button
                type="button"
                onClick={handleLogout}
                className="btn-ghost btn-sm gap-2"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
                {t(M.logout)}
              </button>
            </div>
          </div>

          {/* One compact summary row instead of three stat cards */}
          {stats && (
            <dl className="mt-5 pt-5 border-t border-gray-200 grid grid-cols-3 gap-3 text-center sm:text-start">
              <div>
                <dt className="text-xs sm:text-sm text-gray-600">{t(M.totalDonated)}</dt>
                <dd className="text-lg sm:text-2xl font-bold text-gray-900 truncate">{formatMoney(stats.total_donated)}</dd>
              </div>
              <div>
                <dt className="text-xs sm:text-sm text-gray-600">{t(M.donationsMade)}</dt>
                <dd className="text-lg sm:text-2xl font-bold text-gray-900">{isAr ? fmt.number(stats.donation_count) : stats.donation_count}</dd>
              </div>
              <div>
                <dt className="text-xs sm:text-sm text-gray-600">{t(M.activeSubscriptions)}</dt>
                <dd className="text-lg sm:text-2xl font-bold text-gray-900">{isAr ? fmt.number(stats.active_subscriptions) : stats.active_subscriptions}</dd>
              </div>
            </dl>
          )}
        </div>

        {/* Active Subscriptions */}
        {subscriptions.length > 0 && (
          <section className="card mb-6" aria-labelledby="dashboard-subscriptions">
            <h2 id="dashboard-subscriptions" className="text-lg sm:text-xl font-bold text-gray-900 mb-4">
              {t(M.activeSubscriptions)}
            </h2>
            <ul className="space-y-3">
              {subscriptions.map((subscription) => (
                <li
                  key={subscription.id}
                  className="border border-gray-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 break-words">{subscription.purpose}</h3>
                    <div className="mt-2 text-sm text-gray-600 space-y-1">
                      <p>
                        {t(M.amount)} <span className="font-medium text-gray-900">{isAr ? formatMoney(subscription.amount) : `$${subscription.amount}`}</span> / {storedValue(subscription.interval)}
                      </p>
                      <p className="flex items-center gap-2">
                        {t(M.status)}{' '}
                        <span className={subscription.status === 'active' ? 'badge-success' : 'badge-warning'}>
                          {storedValue(subscription.status)}
                        </span>
                      </p>
                      {subscription.next_payment_date && (
                        <p>{t(M.nextPayment, { date: formatDate(subscription.next_payment_date) })}</p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCancelSubscription(subscription.id)}
                    disabled={cancellingId === subscription.id}
                    className="btn btn-sm gap-1 bg-red-50 text-red-700 hover:bg-red-100 w-full sm:w-auto"
                  >
                    {cancellingId === subscription.id ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-700" aria-hidden="true"></div>
                        <span className="sr-only">{t(M.cancelling)}</span>
                      </>
                    ) : (
                      <>
                        <X className="w-4 h-4" aria-hidden="true" />
                        {t(C.cancel)}
                      </>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Donation History */}
        <section className="card" aria-labelledby="dashboard-history">
          <h2 id="dashboard-history" className="text-lg sm:text-xl font-bold text-gray-900 mb-4">
            {t(M.donationHistory)}
          </h2>
          {donations.length === 0 ? (
            <div className="text-center py-8 space-y-4">
              <p className="text-gray-600">{t(M.noDonations)}</p>
              <Link to="/donate" className="btn-primary btn-sm">{t(M.firstDonation)}</Link>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-2 sm:mx-0">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th scope="col" className="px-2 sm:px-4 py-3 text-start text-xs font-medium text-gray-600 uppercase tracking-wider">
                      {t(M.date)}
                    </th>
                    <th scope="col" className="px-2 sm:px-4 py-3 text-start text-xs font-medium text-gray-600 uppercase tracking-wider">
                      {t(M.amountCol)}
                    </th>
                    <th scope="col" className="px-2 sm:px-4 py-3 text-start text-xs font-medium text-gray-600 uppercase tracking-wider hidden sm:table-cell">
                      {t(M.type)}
                    </th>
                    <th scope="col" className="px-2 sm:px-4 py-3 text-start text-xs font-medium text-gray-600 uppercase tracking-wider">
                      {t(M.certificate)}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {donations.map((donation) => (
                    <tr key={donation.id}>
                      <td className="px-2 sm:px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(donation.donated_at)}
                        <span className="block text-xs text-gray-500 sm:hidden">{storedValue(donation.frequency)}</span>
                      </td>
                      <td className="px-2 sm:px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">
                        {formatMoney(donation.amount)}
                      </td>
                      <td className="px-2 sm:px-4 py-3 whitespace-nowrap text-sm text-gray-600 hidden sm:table-cell">
                        {storedValue(donation.frequency)}
                      </td>
                      <td className="px-2 sm:px-4 py-3 text-sm">
                        {/* Certificates are generated on the fly, so they're always available.
                            Icon-only on phones; the text stays for screen readers. */}
                        <div className="flex items-center gap-1 sm:gap-3">
                          <button
                            type="button"
                            onClick={() => handleDownloadCertificate(donation.id)}
                            className="inline-flex items-center gap-1 p-2 -m-1 sm:p-0 sm:m-0 rounded text-primary-700 hover:text-primary-800 font-medium"
                            title={t(M.downloadCertificate)}
                          >
                            <Download className="w-4 h-4" aria-hidden="true" />
                            <span className="sr-only sm:not-sr-only">{t(M.download)}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEmailCertificate(donation.id)}
                            disabled={emailingId === donation.id}
                            className="inline-flex items-center gap-1 p-2 -m-1 sm:p-0 sm:m-0 rounded text-primary-700 hover:text-primary-800 font-medium disabled:opacity-50"
                            title={t(M.emailCertificate)}
                          >
                            {emailingId === donation.id ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600" aria-hidden="true"></div>
                                <span className="sr-only sm:not-sr-only">{t(M.sending)}</span>
                              </>
                            ) : (
                              <>
                                <Mail className="w-4 h-4" aria-hidden="true" />
                                <span className="sr-only sm:not-sr-only">{t(M.email)}</span>
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
        </section>
      </div>

      <ConfirmationDialog />
    </div>
  )
}

export default UserDashboard
