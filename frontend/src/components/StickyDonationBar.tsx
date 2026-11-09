import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { settingsAPI } from '../utils/api'
import { useFormat, useT } from '../i18n'
import { C } from '../i18n/common'

/**
 * Pages where the bar would compete with the page's own primary action (the
 * donation form, a calculator result, a proposal form) or has no business
 * (legal pages, opt-in / opt-out forms).
 */
const HIDDEN_ON = [
  '/donate',
  '/donation-success',
  '/zakat-calculator',
  '/kaffarah-calculator',
  '/zakat-al-fitr-calculator',
  '/privacy-policy',
  '/terms-of-service',
  '/donation-policy',
  '/sms-opt-in',
  '/unsubscribe',
  '/submit-proposal',
  '/my-proposals',
  '/sponsor',
  '/my-sponsorships',
  '/my-requests',
]

const isHiddenOn = (pathname: string) =>
  HIDDEN_ON.some((path) => pathname === path || pathname.startsWith(`${path}/`))

const quickAmounts = [25, 50, 100, 250]

const StickyDonationBar = () => {
  const [isEnabled, setIsEnabled] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)
  const [amount, setAmount] = useState<string>('')
  const [frequency, setFrequency] = useState<string>('One-Time')
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const t = useT()
  const { money } = useFormat()

  useEffect(() => {
    fetchSetting()
    // Check if user has dismissed the bar in this session
    const dismissed = sessionStorage.getItem('sticky_donation_bar_dismissed')
    if (dismissed === 'true') {
      setIsDismissed(true)
    }
  }, [])

  useEffect(() => {
    if (isEnabled && !isDismissed) {
      // Show bar after a short delay
      const timer = setTimeout(() => {
        setIsVisible(true)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [isEnabled, isDismissed])

  const fetchSetting = async () => {
    try {
      const settings = await settingsAPI.getAll()
      const setting = settings.find((s: any) => s.key === 'sticky_donation_bar_enabled')
      setIsEnabled(setting?.value === 'true')
    } catch (error) {
      console.error('Error fetching sticky donation bar setting:', error)
    }
  }

  const handleDismiss = () => {
    setIsVisible(false)
    setIsDismissed(true)
    sessionStorage.setItem('sticky_donation_bar_dismissed', 'true')
  }

  const handleDonate = () => {
    const params = new URLSearchParams()

    if (amount && parseFloat(amount) > 0) {
      params.set('amount', amount)
    }

    if (frequency && ['One-Time', 'Monthly', 'Annually'].includes(frequency)) {
      params.set('frequency', frequency)
    }

    navigate(`/donate${params.toString() ? `?${params.toString()}` : ''}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (!isEnabled || isDismissed || !isVisible || isHiddenOn(pathname)) {
    return null
  }

  return (
    <>
      {/* In-flow spacer so the fixed bar never covers the end of the footer. */}
      <div aria-hidden="true" className="h-14 sm:h-16" />

      <aside
        aria-label={t(C.quickDonation)}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-primary-800 bg-primary-700 text-white shadow-lg"
      >
        <form
          className="section-container flex h-14 items-center gap-2 sm:h-16 sm:gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            handleDonate()
          }}
        >
          <p className="hidden flex-shrink-0 text-sm font-semibold min-[360px]:block">{t(C.giveNow)}</p>

          {/* Quick amounts: from sm up only, to keep the bar one row (about 56px) on phones. */}
          <div className="hidden flex-1 items-center justify-center gap-2 sm:flex">
            {quickAmounts.map((quickAmount) => (
              <button
                key={quickAmount}
                type="button"
                onClick={() => setAmount(quickAmount.toString())}
                aria-pressed={amount === quickAmount.toString()}
                className={`min-h-[36px] rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  amount === quickAmount.toString()
                    ? 'bg-white text-primary-700'
                    : 'border border-white/40 text-white hover:bg-white/15'
                }`}
              >
                {money(quickAmount * 100)}
              </button>
            ))}
          </div>

          <div className="ms-auto flex min-w-0 items-center gap-2">
            <div className="relative w-28">
              <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-2.5 text-sm text-white/90">
                $
              </span>
              <input
                type="number"
                step="0.01"
                min="1"
                inputMode="decimal"
                placeholder={t(C.amount)}
                aria-label={t(C.donationAmount)}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-9 w-full rounded-md border border-white/40 bg-white/10 ps-6 pe-2 text-sm text-white placeholder-white/80 focus:border-white focus:bg-white/20 focus:outline-none"
              />
            </div>

            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              aria-label={t(C.frequency)}
              className="hidden h-9 cursor-pointer appearance-none rounded-md border border-white/40 bg-white/10 ps-2.5 pe-7 text-sm text-white focus:border-white focus:outline-none sm:block"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='white' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 8px center',
                backgroundSize: '10px 6px',
              }}
            >
              <option value="One-Time" className="text-gray-900">{t(C.oneTime)}</option>
              <option value="Monthly" className="text-gray-900">{t(C.monthly)}</option>
              <option value="Annually" className="text-gray-900">{t(C.annually)}</option>
            </select>

            {/* Without an amount it still goes to /donate, where the amount is chosen. */}
            <button type="submit" className="btn-inverse btn-sm px-4">
              {t(C.donate)}
            </button>

            <button
              type="button"
              onClick={handleDismiss}
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md transition-colors hover:bg-white/15"
              aria-label={t(C.dismiss)}
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </form>
      </aside>
    </>
  )
}

export default StickyDonationBar
