import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Heart, X, Sparkles, ArrowRight } from 'lucide-react'
import { settingsAPI } from '../utils/api'

const StickyDonationBar = () => {
  const [isEnabled, setIsEnabled] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)
  const [amount, setAmount] = useState<string>('')
  const [frequency, setFrequency] = useState<string>('One-Time')
  const navigate = useNavigate()

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
    
    // Add amount if provided
    if (amount && parseFloat(amount) > 0) {
      params.set('amount', amount)
    }
    
    // Add frequency if provided and valid
    if (frequency && ['One-Time', 'Monthly', 'Annually'].includes(frequency)) {
      params.set('frequency', frequency)
    }
    
    // Navigate to donate page with query parameters
    navigate(`/donate${params.toString() ? `?${params.toString()}` : ''}`)
    
    // Scroll to top after navigation
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const quickAmounts = [25, 50, 100, 250]

  if (!isEnabled || isDismissed || !isVisible) {
    return null
  }

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 transition-all duration-300 ease-out ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
      }`}
    >
      <div className="bg-primary-600/90 backdrop-blur-sm border-t border-primary-500/50 shadow-lg">
        <div className="section-container">
          <div className="py-3 px-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              {/* Left side - Message */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <Heart className="w-4 h-4 text-white fill-white" />
                <p className="text-sm font-semibold text-white whitespace-nowrap">Make a Difference</p>
              </div>

              {/* Middle - Quick Amount Buttons */}
              <div className="flex items-center gap-2 flex-wrap justify-center flex-1">
                {quickAmounts.map((quickAmount) => (
                  <button
                    key={quickAmount}
                    onClick={() => setAmount(quickAmount.toString())}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${
                      amount === quickAmount.toString()
                        ? 'bg-white text-primary-600 shadow-sm'
                        : 'bg-white/20 hover:bg-white/30 text-white border border-white/30'
                    }`}
                  >
                    ${quickAmount}
                  </button>
                ))}
              </div>

              {/* Right side - Amount Input, Frequency, and Donate Button */}
              <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto">
                {/* Custom Amount Input */}
                <div className="relative min-w-[90px]">
                  <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none z-10" style={{ backdropFilter: 'none' }}>
                    <span className="text-white/90 font-medium text-xs">$</span>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    placeholder="Amount"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full pl-6 pr-2 py-1.5 bg-white/20 backdrop-blur-sm border border-white/30 rounded-md text-white placeholder-white/60 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-white/50 focus:bg-white/30 focus:border-white/50 transition-all"
                  />
                </div>

                {/* Frequency Selector */}
                <div className="relative">
                  <select
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value)}
                    className="px-2.5 py-1.5 pr-7 bg-white/20 backdrop-blur-sm border border-white/30 rounded-md text-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-white/50 focus:bg-white/30 focus:border-white/50 cursor-pointer transition-all appearance-none"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='white' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 6px center',
                      backgroundSize: '10px 6px'
                    }}
                  >
                    <option value="One-Time" className="bg-primary-600 text-white">One-Time</option>
                    <option value="Monthly" className="bg-primary-600 text-white">Monthly</option>
                    <option value="Annually" className="bg-primary-600 text-white">Annually</option>
                  </select>
                </div>

                {/* Donate Button */}
                <button
                  onClick={handleDonate}
                  disabled={!amount || parseFloat(amount) <= 0}
                  className="flex items-center justify-center gap-1.5 bg-white hover:bg-white/90 text-primary-600 font-semibold px-4 py-1.5 rounded-md transition-all duration-200 text-xs whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Donate</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>

                {/* Close Button */}
                <button
                  onClick={handleDismiss}
                  className="p-1.5 hover:bg-white/20 rounded-md transition-colors duration-200"
                  aria-label="Dismiss"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default StickyDonationBar
