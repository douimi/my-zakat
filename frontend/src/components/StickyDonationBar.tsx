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
  }

  const quickAmounts = [25, 50, 100, 250]

  if (!isEnabled || isDismissed || !isVisible) {
    return null
  }

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 transition-all duration-500 ease-out ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
      }`}
      style={{
        background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 50%, #1e40af 100%)',
        boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.15), 0 -8px 40px rgba(59, 130, 246, 0.3)'
      }}
    >
      {/* Animated background pattern */}
      <div className="absolute inset-0 opacity-10 overflow-hidden">
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-white rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-white rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>

      <div className="relative section-container">
        <div className="py-4 px-4 md:py-5 md:px-6">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-4 lg:gap-6">
            {/* Left side - Message with icon */}
            <div className="flex items-center space-x-3 lg:space-x-4 flex-1 min-w-0">
              <div className="relative flex-shrink-0">
                <div className="absolute inset-0 bg-white/20 rounded-full blur-lg animate-pulse"></div>
                <div className="relative bg-white/20 backdrop-blur-sm p-2.5 rounded-full">
                  <Heart className="w-5 h-5 md:w-6 md:h-6 text-white fill-white animate-pulse" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-base md:text-lg text-white leading-tight">
                  Transform Lives Today
                </p>
                <p className="text-white/90 text-xs md:text-sm mt-0.5">
                  Your generosity creates lasting impact
                </p>
              </div>
            </div>

            {/* Middle - Amount and Frequency Inputs */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 max-w-2xl w-full">
              {/* Quick Amount Buttons */}
              <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-start">
                {quickAmounts.map((quickAmount) => (
                  <button
                    key={quickAmount}
                    onClick={() => setAmount(quickAmount.toString())}
                    className={`px-3 py-1.5 text-sm font-semibold rounded-lg transition-all duration-200 transform hover:scale-105 ${
                      amount === quickAmount.toString()
                        ? 'bg-white text-primary-600 shadow-lg scale-105'
                        : 'bg-white/20 hover:bg-white/30 text-white backdrop-blur-sm border border-white/30'
                    }`}
                  >
                    ${quickAmount}
                  </button>
                ))}
              </div>

              {/* Custom Amount Input */}
              <div className="relative flex-1 min-w-[120px]">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-white font-semibold text-base">$</span>
                </div>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  placeholder="Custom"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full pl-7 pr-3 py-2.5 bg-white/20 backdrop-blur-sm border border-white/30 rounded-lg text-white placeholder-white/60 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-white/50 focus:bg-white/30 focus:border-white/50 transition-all"
                  onFocus={(e) => e.target.placeholder = ''}
                  onBlur={(e) => e.target.placeholder = 'Custom'}
                />
              </div>

              {/* Frequency Selector */}
              <div className="relative">
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                  className="px-4 py-2.5 pr-10 bg-white/20 backdrop-blur-sm border border-white/30 rounded-lg text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-white/50 focus:bg-white/30 focus:border-white/50 cursor-pointer transition-all appearance-none"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L6 6L11 1' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 12px center',
                    backgroundSize: '12px 8px'
                  }}
                >
                  <option value="One-Time" className="bg-primary-600 text-white">One-Time</option>
                  <option value="Monthly" className="bg-primary-600 text-white">Monthly</option>
                  <option value="Annually" className="bg-primary-600 text-white">Annually</option>
                </select>
              </div>
            </div>

            {/* Right side - Action Buttons */}
            <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto">
              <button
                onClick={handleDonate}
                disabled={!amount || parseFloat(amount) <= 0}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-white text-primary-600 hover:bg-gray-50 font-bold px-6 py-2.5 rounded-lg transition-all duration-200 text-sm whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:scale-105 disabled:hover:scale-100"
              >
                <Sparkles className="w-4 h-4" />
                <span>Donate Now</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={handleDismiss}
                className="p-2.5 hover:bg-white/20 rounded-lg transition-all duration-200 backdrop-blur-sm border border-white/20 hover:border-white/30"
                aria-label="Dismiss"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default StickyDonationBar
