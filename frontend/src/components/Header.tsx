import { useState, useRef, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Menu, X, Heart, User, ChevronDown, Shield, Gift, AlertCircle, BookOpen, Calendar, Users, Info, Mail, Calculator, Coins, CreditCard, BookMarked, Sparkles, Link2 } from 'lucide-react'
import { clsx } from 'clsx'
import { useAuthStore } from '../store/authStore'
import { useQuery } from 'react-query'
import { urgentNeedsAPI, settingsAPI } from '../utils/api'

const Header = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isQuickLinksDropdownOpen, setIsQuickLinksDropdownOpen] = useState(false)
  const [isUrgentNeedsDropdownOpen, setIsUrgentNeedsDropdownOpen] = useState(false)
  const [isToolsDropdownOpen, setIsToolsDropdownOpen] = useState(false)
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false)
  const quickLinksRef = useRef<HTMLDivElement>(null)
  const urgentNeedsRef = useRef<HTMLDivElement>(null)
  const toolsRef = useRef<HTMLDivElement>(null)
  const profileDropdownRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const navigate = useNavigate()
  const { isAuthenticated, isAdmin, logout } = useAuthStore()

  // Fetch urgent needs for dropdown
  const { data: urgentNeeds } = useQuery('urgent-needs-nav', () => urgentNeedsAPI.getAll(true), {
    retry: false,
  })

  // Fetch emergency banner settings
  const { data: settings } = useQuery('header-settings', settingsAPI.getAll, {
    retry: false,
  })

  const emergencyBannerMessage = settings?.find((s: any) => s.key === 'emergency_banner_message')?.value || 
    'Emergency Relief Needed: Support families affected by the crisis.'
  const emergencyBannerCtaText = settings?.find((s: any) => s.key === 'emergency_banner_cta_text')?.value || 
    'Donate Now'
  const emergencyBannerCtaUrl = settings?.find((s: any) => s.key === 'emergency_banner_cta_url')?.value || 
    '/donate'
  const emergencyBannerEnabled = settings?.find((s: any) => s.key === 'emergency_banner_enabled')?.value === 'true'

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (quickLinksRef.current && !quickLinksRef.current.contains(event.target as Node)) {
        setIsQuickLinksDropdownOpen(false)
      }
      if (urgentNeedsRef.current && !urgentNeedsRef.current.contains(event.target as Node)) {
        setIsUrgentNeedsDropdownOpen(false)
      }
      if (toolsRef.current && !toolsRef.current.contains(event.target as Node)) {
        setIsToolsDropdownOpen(false)
      }
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
        setIsProfileDropdownOpen(false)
      }
    }

    if (isQuickLinksDropdownOpen || isUrgentNeedsDropdownOpen || isProfileDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isQuickLinksDropdownOpen, isUrgentNeedsDropdownOpen, isProfileDropdownOpen])

  const navigation = [
    { name: 'Our Impact', href: '/stories' },
    { name: 'Join Us', href: '/volunteer' },
    { name: 'Updates', href: '/events' },
    { name: 'Connect', href: '/contact' },
  ]

  const isUrgentNeedsActive = () => {
    return location.pathname.startsWith('/urgent-needs/')
  }

  const isActive = (href: string) => {
    if (href === '/') {
      return location.pathname === '/'
    }
    return location.pathname.startsWith(href)
  }

  const isCalculatorActive = () => {
    return location.pathname.startsWith('/zakat-calculator') || 
           location.pathname.startsWith('/kaffarah-calculator') ||
           location.pathname.startsWith('/zakat-al-fitr-calculator')
  }

  const isQuickLinksActive = () => {
    return location.pathname.startsWith('/zakat-education') ||
           location.pathname.startsWith('/zakat-on-gold') ||
           location.pathname.startsWith('/islamic-knowledge') ||
           location.pathname.startsWith('/book-of-duas') ||
           location.pathname.startsWith('/charity-in-islam') ||
           location.pathname.startsWith('/umrah-guidelines') ||
           location.pathname.startsWith('/quick-links')
  }

  return (
    <>
      {/* Emergency Banner */}
      {emergencyBannerEnabled !== false && (
        <div className="bg-red-600 text-white text-center py-2 px-4 text-sm">
          🚨 {emergencyBannerMessage}{' '}
          <Link to={emergencyBannerCtaUrl} className="underline font-medium hover:text-red-100">
            {emergencyBannerCtaText}
          </Link>
        </div>
      )}

      <header className="bg-white shadow-md border-b border-gray-100 sticky top-0 z-50">
        <div className="w-full px-2 sm:px-4 lg:px-6">
          <div className="flex items-center justify-between h-24 md:h-28 lg:h-32 py-2 md:py-3 min-w-0">
            {/* Logo */}
            <Link 
              to="/" 
              className="flex items-center flex-shrink-0 mr-2 md:mr-3 lg:mr-4 xl:mr-6 transition-all duration-300 hover:opacity-80 max-h-full"
            >
              <div className="flex items-center gap-2 md:gap-3">
                <div className="flex-shrink-0">
                  <img 
                    src="/logo.png" 
                    alt="MyZakat Logo" 
                    className="h-16 md:h-20 lg:h-24 xl:h-28 max-h-full w-auto object-contain"
                  />
                </div>
                <div className="hidden sm:flex flex-col leading-tight">
                  <span className="text-gray-600 font-medium text-xs md:text-sm lg:text-base">
                    Zakat Distribution Foundation
                  </span>
                </div>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center flex-1 justify-between min-w-0 px-2 xl:px-4 2xl:px-6 gap-0.5">
              {/* Urgent Needs Dropdown */}
              {urgentNeeds && urgentNeeds.length > 0 && (
                <div className="relative" ref={urgentNeedsRef}>
                  <button
                    onClick={() => {
                      setIsUrgentNeedsDropdownOpen(!isUrgentNeedsDropdownOpen)
                      setIsQuickLinksDropdownOpen(false)
                      setIsToolsDropdownOpen(false)
                    }}
                    className={clsx(
                      'flex items-center space-x-1.5 xl:space-x-2 px-1.5 xl:px-2.5 2xl:px-3 py-2 rounded-lg text-xs xl:text-sm font-semibold transition-all duration-300 whitespace-nowrap flex-shrink-0',
                      isUrgentNeedsActive()
                        ? 'text-primary-600 bg-primary-50 shadow-sm'
                        : 'text-gray-700 hover:text-primary-600 hover:bg-primary-50/50'
                    )}
                  >
                    <AlertCircle className={clsx(
                      'w-3.5 xl:w-4 h-3.5 xl:h-4 transition-transform duration-300 flex-shrink-0',
                      isUrgentNeedsActive() && 'text-primary-600'
                    )} />
                    <span className="hidden xl:inline">Urgent Needs</span>
                    <span className="xl:hidden">Urgent</span>
                    <ChevronDown className={clsx(
                      'w-3 xl:w-3.5 h-3 xl:h-3.5 transition-transform duration-300 flex-shrink-0',
                      isUrgentNeedsDropdownOpen && 'transform rotate-180'
                    )} />
                  </button>
                  
                  {isUrgentNeedsDropdownOpen && (
                    <div className="absolute top-full left-0 mt-3 w-64 bg-white rounded-xl shadow-2xl border border-gray-100 py-2 z-50 max-h-96 overflow-y-auto animate-fade-in">
                      {urgentNeeds.map((need: any) => (
                        <Link
                          key={need.id}
                          to={`/urgent-needs/${need.slug}`}
                          onClick={() => setIsUrgentNeedsDropdownOpen(false)}
                          className={clsx(
                            'flex items-center space-x-3 px-4 py-3 mx-2 rounded-lg text-sm transition-all duration-200',
                            location.pathname === `/urgent-needs/${need.slug}`
                              ? 'text-primary-600 bg-primary-50 font-semibold'
                              : 'text-gray-700 hover:text-primary-600 hover:bg-gray-50'
                          )}
                        >
                          <AlertCircle className="w-4 h-4 flex-shrink-0" />
                          <span>{need.title}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Our Impact */}
              <Link
                to="/stories"
                className={clsx(
                  'flex items-center space-x-1.5 xl:space-x-2 px-1.5 xl:px-2.5 2xl:px-3 py-2 rounded-lg text-xs xl:text-sm font-semibold transition-all duration-300 whitespace-nowrap flex-shrink-0',
                  isActive('/stories')
                    ? 'text-primary-600 bg-primary-50 shadow-sm'
                    : 'text-gray-700 hover:text-primary-600 hover:bg-primary-50/50'
                )}
              >
                <BookOpen className="w-3.5 xl:w-4 h-3.5 xl:h-4 flex-shrink-0" />
                <span>Our Impact</span>
              </Link>

              {/* Our Work */}
              <Link
                to="/programs"
                className={clsx(
                  'flex items-center space-x-1.5 xl:space-x-2 px-1.5 xl:px-2.5 2xl:px-3 py-2 rounded-lg text-xs xl:text-sm font-semibold transition-all duration-300 whitespace-nowrap flex-shrink-0',
                  isActive('/programs')
                    ? 'text-primary-600 bg-primary-50 shadow-sm'
                    : 'text-gray-700 hover:text-primary-600 hover:bg-primary-50/50'
                )}
              >
                <Heart className="w-3.5 xl:w-4 h-3.5 xl:h-4 flex-shrink-0" />
                <span>Our Work</span>
              </Link>

              {/* Events */}
              <Link
                to="/events"
                className={clsx(
                  'flex items-center space-x-1.5 xl:space-x-2 px-1.5 xl:px-2.5 2xl:px-3 py-2 rounded-lg text-xs xl:text-sm font-semibold transition-all duration-300 whitespace-nowrap flex-shrink-0',
                  isActive('/events')
                    ? 'text-primary-600 bg-primary-50 shadow-sm'
                    : 'text-gray-700 hover:text-primary-600 hover:bg-primary-50/50'
                )}
              >
                <Calendar className="w-3.5 xl:w-4 h-3.5 xl:h-4 flex-shrink-0" />
                <span className="hidden xl:inline">Events</span>
                <span className="xl:hidden">Events</span>
              </Link>

              {/* Get Involved */}
              <Link
                to="/volunteer"
                className={clsx(
                  'flex items-center space-x-1.5 xl:space-x-2 px-1.5 xl:px-2.5 2xl:px-3 py-2 rounded-lg text-xs xl:text-sm font-semibold transition-all duration-300 whitespace-nowrap flex-shrink-0',
                  isActive('/volunteer')
                    ? 'text-primary-600 bg-primary-50 shadow-sm'
                    : 'text-gray-700 hover:text-primary-600 hover:bg-primary-50/50'
                )}
              >
                <Users className="w-3.5 xl:w-4 h-3.5 xl:h-4 flex-shrink-0" />
                <span className="hidden xl:inline">Get Involved</span>
                <span className="xl:hidden">Involved</span>
              </Link>

              {/* Calculators Dropdown */}
              <div className="relative" ref={toolsRef}>
                <button
                  onClick={() => {
                    setIsToolsDropdownOpen(!isToolsDropdownOpen)
                    setIsUrgentNeedsDropdownOpen(false)
                    setIsQuickLinksDropdownOpen(false)
                  }}
                  className={clsx(
                    'flex items-center space-x-1.5 xl:space-x-2 px-1.5 xl:px-2.5 2xl:px-3 py-2 rounded-lg text-xs xl:text-sm font-semibold transition-all duration-300 whitespace-nowrap flex-shrink-0',
                    isCalculatorActive()
                      ? 'text-primary-600 bg-primary-50 shadow-sm'
                      : 'text-gray-700 hover:text-primary-600 hover:bg-primary-50/50'
                  )}
                >
                  <Calculator className="w-3.5 xl:w-4 h-3.5 xl:h-4 flex-shrink-0" />
                  <span className="hidden xl:inline">Calculators</span>
                  <span className="xl:hidden">Calc</span>
                  <ChevronDown className={clsx(
                    'w-3 xl:w-3.5 h-3 xl:h-3.5 transition-transform duration-300 flex-shrink-0',
                    isToolsDropdownOpen && 'transform rotate-180'
                  )} />
                </button>
                
                {isToolsDropdownOpen && (
                  <div className="absolute top-full left-0 mt-3 w-64 bg-white rounded-xl shadow-2xl border border-gray-100 py-2 z-50 animate-fade-in">
                    <Link
                      to="/zakat-calculator"
                      onClick={() => setIsToolsDropdownOpen(false)}
                      className={clsx(
                        'flex items-center space-x-3 px-4 py-3 mx-2 rounded-lg text-sm transition-all duration-200',
                        location.pathname === '/zakat-calculator'
                          ? 'text-primary-600 bg-primary-50 font-semibold'
                          : 'text-gray-700 hover:text-primary-600 hover:bg-gray-50'
                      )}
                    >
                      <Calculator className="w-4 h-4 flex-shrink-0" />
                      <span>Zakat Calculator</span>
                    </Link>
                    <Link
                      to="/kaffarah-calculator"
                      onClick={() => setIsToolsDropdownOpen(false)}
                      className={clsx(
                        'flex items-center space-x-3 px-4 py-3 mx-2 rounded-lg text-sm transition-all duration-200',
                        location.pathname === '/kaffarah-calculator'
                          ? 'text-primary-600 bg-primary-50 font-semibold'
                          : 'text-gray-700 hover:text-primary-600 hover:bg-gray-50'
                      )}
                    >
                      <Coins className="w-4 h-4 flex-shrink-0" />
                      <span>Kaffarah Calculator</span>
                    </Link>
                    <Link
                      to="/zakat-al-fitr-calculator"
                      onClick={() => setIsToolsDropdownOpen(false)}
                      className={clsx(
                        'flex items-center space-x-3 px-4 py-3 mx-2 rounded-lg text-sm transition-all duration-200',
                        location.pathname === '/zakat-al-fitr-calculator'
                          ? 'text-primary-600 bg-primary-50 font-semibold'
                          : 'text-gray-700 hover:text-primary-600 hover:bg-gray-50'
                      )}
                    >
                      <Gift className="w-4 h-4 flex-shrink-0" />
                      <span>Zakat al-Fitr Calculator</span>
                    </Link>
                  </div>
                )}
              </div>

              {/* Quick Links Dropdown */}
              <div className="relative" ref={quickLinksRef}>
                <button
                  onClick={() => {
                    setIsQuickLinksDropdownOpen(!isQuickLinksDropdownOpen)
                    setIsUrgentNeedsDropdownOpen(false)
                    setIsToolsDropdownOpen(false)
                  }}
                  className={clsx(
                    'flex items-center space-x-1.5 xl:space-x-2 px-1.5 xl:px-2.5 2xl:px-3 py-2 rounded-lg text-xs xl:text-sm font-semibold transition-all duration-300 whitespace-nowrap flex-shrink-0',
                    isQuickLinksActive()
                      ? 'text-primary-600 bg-primary-50 shadow-sm'
                      : 'text-gray-700 hover:text-primary-600 hover:bg-primary-50/50'
                  )}
                >
                  <Link2 className="w-3.5 xl:w-4 h-3.5 xl:h-4 flex-shrink-0" />
                  <span className="hidden xl:inline">Quick Links</span>
                  <span className="xl:hidden">Links</span>
                  <ChevronDown className={clsx(
                    'w-3 xl:w-3.5 h-3 xl:h-3.5 transition-transform duration-300 flex-shrink-0',
                    isQuickLinksDropdownOpen && 'transform rotate-180'
                  )} />
                </button>
                
                {isQuickLinksDropdownOpen && (
                  <div className="absolute top-full left-0 mt-3 w-80 bg-white rounded-xl shadow-2xl border border-gray-100 py-3 z-50 animate-fade-in">
                    {/* Islamic Section */}
                    <div className="px-3 py-2 border-b border-gray-100">
                      <p className="text-xs font-bold text-primary-600 uppercase tracking-wider mb-3 px-2">Islamic</p>
                      <div className="space-y-1">
                        <Link
                          to="/islamic-knowledge"
                          onClick={() => setIsQuickLinksDropdownOpen(false)}
                          className={clsx(
                            'flex items-center space-x-3 px-3 py-2.5 text-sm transition-all duration-200 rounded-lg mx-1',
                            location.pathname === '/islamic-knowledge'
                              ? 'text-primary-600 bg-primary-50 font-semibold'
                              : 'text-gray-700 hover:text-primary-600 hover:bg-gray-50'
                          )}
                        >
                          <BookOpen className="w-4 h-4 flex-shrink-0" />
                          <span>Islamic Knowledge Base</span>
                        </Link>
                        <Link
                          to="/book-of-duas"
                          onClick={() => setIsQuickLinksDropdownOpen(false)}
                          className={clsx(
                            'flex items-center space-x-3 px-3 py-2.5 text-sm transition-all duration-200 rounded-lg mx-1',
                            location.pathname === '/book-of-duas'
                              ? 'text-primary-600 bg-primary-50 font-semibold'
                              : 'text-gray-700 hover:text-primary-600 hover:bg-gray-50'
                          )}
                        >
                          <BookMarked className="w-4 h-4 flex-shrink-0" />
                          <span>Book of Duas</span>
                        </Link>
                        <Link
                          to="/charity-in-islam"
                          onClick={() => setIsQuickLinksDropdownOpen(false)}
                          className={clsx(
                            'flex items-center space-x-3 px-3 py-2.5 text-sm transition-all duration-200 rounded-lg mx-1',
                            location.pathname === '/charity-in-islam'
                              ? 'text-primary-600 bg-primary-50 font-semibold'
                              : 'text-gray-700 hover:text-primary-600 hover:bg-gray-50'
                          )}
                        >
                          <Sparkles className="w-4 h-4 flex-shrink-0" />
                          <span>Charity in Islam</span>
                        </Link>
                      </div>
                    </div>

                    {/* Resources Section */}
                    <div className="px-3 py-2">
                      <p className="text-xs font-bold text-primary-600 uppercase tracking-wider mb-3 px-2">Resources</p>
                      <div className="space-y-1">
                        <Link
                          to="/donate"
                          onClick={() => setIsQuickLinksDropdownOpen(false)}
                          className={clsx(
                            'flex items-center space-x-3 px-3 py-2.5 text-sm transition-all duration-200 rounded-lg mx-1',
                            location.pathname === '/donate'
                              ? 'text-primary-600 bg-primary-50 font-semibold'
                              : 'text-gray-700 hover:text-primary-600 hover:bg-gray-50'
                          )}
                        >
                          <CreditCard className="w-4 h-4 flex-shrink-0" />
                          <span>Ways to Donate</span>
                        </Link>
                        <Link
                          to="/zakat-on-gold"
                          onClick={() => setIsQuickLinksDropdownOpen(false)}
                          className={clsx(
                            'flex items-center space-x-3 px-3 py-2.5 text-sm transition-all duration-200 rounded-lg mx-1',
                            location.pathname === '/zakat-on-gold'
                              ? 'text-primary-600 bg-primary-50 font-semibold'
                              : 'text-gray-700 hover:text-primary-600 hover:bg-gray-50'
                          )}
                        >
                          <Gift className="w-4 h-4 flex-shrink-0" />
                          <span>Zakat on Gold</span>
                        </Link>
                        <Link
                          to="/umrah-guidelines"
                          onClick={() => setIsQuickLinksDropdownOpen(false)}
                          className={clsx(
                            'flex items-center space-x-3 px-3 py-2.5 text-sm transition-all duration-200 rounded-lg mx-1',
                            location.pathname === '/umrah-guidelines'
                              ? 'text-primary-600 bg-primary-50 font-semibold'
                              : 'text-gray-700 hover:text-primary-600 hover:bg-gray-50'
                          )}
                        >
                          <Info className="w-4 h-4 flex-shrink-0" />
                          <span>Umrah Guidelines</span>
                        </Link>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* About */}
              <Link
                to="/about"
                className={clsx(
                  'flex items-center space-x-1.5 xl:space-x-2 px-1.5 xl:px-2.5 2xl:px-3 py-2 rounded-lg text-xs xl:text-sm font-semibold transition-all duration-300 whitespace-nowrap flex-shrink-0',
                  isActive('/about')
                    ? 'text-primary-600 bg-primary-50 shadow-sm'
                    : 'text-gray-700 hover:text-primary-600 hover:bg-primary-50/50'
                )}
              >
                <Info className="w-3.5 xl:w-4 h-3.5 xl:h-4 flex-shrink-0" />
                <span>About</span>
              </Link>

              {/* Connect */}
              <Link
                to="/contact"
                className={clsx(
                  'flex items-center space-x-1.5 xl:space-x-2 px-1.5 xl:px-2.5 2xl:px-3 py-2 rounded-lg text-xs xl:text-sm font-semibold transition-all duration-300 whitespace-nowrap flex-shrink-0',
                  isActive('/contact')
                    ? 'text-primary-600 bg-primary-50 shadow-sm'
                    : 'text-gray-700 hover:text-primary-600 hover:bg-primary-50/50'
                )}
              >
                <Mail className="w-3.5 xl:w-4 h-3.5 xl:h-4 flex-shrink-0" />
                <span>Contact</span>
              </Link>
            </nav>

            {/* Profile Icon with Dropdown */}
            <div className="hidden md:flex items-center flex-shrink-0 ml-2 xl:ml-4 2xl:ml-6">
              <div className="relative" ref={profileDropdownRef}>
                <button
                  onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                  className="p-2.5 rounded-xl hover:bg-primary-50 transition-all duration-300 hover:scale-110"
                  aria-label="Profile menu"
                >
                  <User className="w-6 h-6 text-gray-700 hover:text-primary-600 transition-colors duration-200" />
                </button>
                
                {isProfileDropdownOpen && (
                  <div className="absolute top-full right-0 mt-3 w-56 bg-white rounded-xl shadow-2xl border border-gray-100 py-2 z-50 animate-fade-in">
                    {isAuthenticated ? (
                      <>
                        <Link
                          to="/dashboard"
                          onClick={() => setIsProfileDropdownOpen(false)}
                          className="flex items-center space-x-3 px-4 py-3 mx-2 rounded-lg text-sm text-gray-700 hover:text-primary-600 hover:bg-primary-50 transition-all duration-200"
                        >
                          <Gift className="w-4 h-4" />
                          <span className="font-medium">My Donations</span>
                        </Link>
                        {isAdmin && (
                          <Link
                            to="/admin"
                            onClick={() => setIsProfileDropdownOpen(false)}
                            className="flex items-center space-x-3 px-4 py-3 mx-2 rounded-lg text-sm text-gray-700 hover:text-primary-600 hover:bg-primary-50 transition-all duration-200"
                          >
                            <Shield className="w-4 h-4" />
                            <span className="font-medium">Admin Console</span>
                          </Link>
                        )}
                        <div className="border-t border-gray-100 my-2"></div>
                        <button
                          onClick={() => {
                            logout()
                            setIsProfileDropdownOpen(false)
                            navigate('/')
                          }}
                          className="w-full flex items-center space-x-3 px-4 py-3 mx-2 rounded-lg text-sm text-red-600 hover:bg-red-50 transition-all duration-200 font-medium"
                        >
                          <X className="w-4 h-4" />
                          <span>Logout</span>
                        </button>
                      </>
                    ) : (
                      <Link
                        to="/login"
                        onClick={() => setIsProfileDropdownOpen(false)}
                        className="block px-4 py-3 mx-2 rounded-lg text-sm text-gray-700 hover:text-primary-600 hover:bg-primary-50 transition-all duration-200 font-medium"
                      >
                        Login
                      </Link>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Mobile menu button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2.5 rounded-xl text-gray-700 hover:text-primary-600 hover:bg-primary-50 flex-shrink-0 transition-all duration-200"
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? (
                <X className="w-6 h-6 transition-transform duration-200" />
              ) : (
                <Menu className="w-6 h-6 transition-transform duration-200" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white shadow-lg max-h-[calc(100vh-6rem)] overflow-y-auto">
            <div className="w-full px-2 sm:px-4 lg:px-6 py-6">
              <nav className="flex flex-col space-y-3">
                {/* Urgent Needs in mobile menu */}
                {urgentNeeds && urgentNeeds.length > 0 && (
                  <div className="space-y-2 bg-primary-50/30 rounded-xl p-4">
                    <p className="text-sm font-bold text-primary-600 uppercase tracking-wider mb-3 flex items-center">
                      <AlertCircle className="w-5 h-5 mr-2" />
                      Urgent Needs
                    </p>
                    {urgentNeeds.map((need: any) => (
                      <Link
                        key={need.id}
                        to={`/urgent-needs/${need.slug}`}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={clsx(
                          'flex items-center space-x-3 px-4 py-3 rounded-lg text-base font-medium transition-all duration-200',
                          location.pathname === `/urgent-needs/${need.slug}`
                            ? 'text-primary-600 bg-white shadow-sm'
                            : 'text-gray-700 hover:text-primary-600 hover:bg-white/80'
                        )}
                      >
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        <span>{need.title}</span>
                      </Link>
                    ))}
                  </div>
                )}

                {/* Main navigation items */}
                <Link
                  to="/stories"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={clsx(
                    'flex items-center space-x-3 px-4 py-3 rounded-lg text-base font-semibold transition-all duration-200',
                    isActive('/stories')
                      ? 'text-primary-600 bg-primary-50 shadow-sm'
                      : 'text-gray-700 hover:text-primary-600 hover:bg-gray-50'
                  )}
                >
                  <BookOpen className="w-5 h-5" />
                  <span>Our Impact</span>
                </Link>
                <Link
                  to="/programs"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={clsx(
                    'flex items-center space-x-3 px-4 py-3 rounded-lg text-base font-semibold transition-all duration-200',
                    isActive('/programs')
                      ? 'text-primary-600 bg-primary-50 shadow-sm'
                      : 'text-gray-700 hover:text-primary-600 hover:bg-gray-50'
                  )}
                >
                  <Heart className="w-5 h-5" />
                  <span>Our Work</span>
                </Link>
                <Link
                  to="/events"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={clsx(
                    'flex items-center space-x-3 px-4 py-3 rounded-lg text-base font-semibold transition-all duration-200',
                    isActive('/events')
                      ? 'text-primary-600 bg-primary-50 shadow-sm'
                      : 'text-gray-700 hover:text-primary-600 hover:bg-gray-50'
                  )}
                >
                  <Calendar className="w-5 h-5" />
                  <span>Events</span>
                </Link>
                <Link
                  to="/volunteer"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={clsx(
                    'flex items-center space-x-3 px-4 py-3 rounded-lg text-base font-semibold transition-all duration-200',
                    isActive('/volunteer')
                      ? 'text-primary-600 bg-primary-50 shadow-sm'
                      : 'text-gray-700 hover:text-primary-600 hover:bg-gray-50'
                  )}
                >
                  <Users className="w-5 h-5" />
                  <span>Get Involved</span>
                </Link>

                {/* Calculators Section */}
                <div className="space-y-2 bg-primary-50/30 rounded-xl p-4">
                  <p className="text-sm font-bold text-primary-600 uppercase tracking-wider mb-3 flex items-center">
                    <Calculator className="w-5 h-5 mr-2" />
                    Calculators
                  </p>
                  <Link
                    to="/zakat-calculator"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={clsx(
                      'flex items-center space-x-3 px-4 py-3 rounded-lg text-base font-medium transition-all duration-200',
                      isActive('/zakat-calculator')
                        ? 'text-primary-600 bg-white shadow-sm'
                        : 'text-gray-700 hover:text-primary-600 hover:bg-white/80'
                    )}
                  >
                    <Calculator className="w-5 h-5" />
                    <span>Zakat Calculator</span>
                  </Link>
                  <Link
                    to="/kaffarah-calculator"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={clsx(
                      'flex items-center space-x-3 px-4 py-3 rounded-lg text-base font-medium transition-all duration-200',
                      isActive('/kaffarah-calculator')
                        ? 'text-primary-600 bg-white shadow-sm'
                        : 'text-gray-700 hover:text-primary-600 hover:bg-white/80'
                    )}
                  >
                    <Coins className="w-5 h-5" />
                    <span>Kaffarah Calculator</span>
                  </Link>
                  <Link
                    to="/zakat-al-fitr-calculator"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={clsx(
                      'flex items-center space-x-3 px-4 py-3 rounded-lg text-base font-medium transition-all duration-200',
                      isActive('/zakat-al-fitr-calculator')
                        ? 'text-primary-600 bg-white shadow-sm'
                        : 'text-gray-700 hover:text-primary-600 hover:bg-white/80'
                    )}
                  >
                    <Gift className="w-5 h-5" />
                    <span>Zakat al-Fitr Calculator</span>
                  </Link>
                </div>

                {/* Quick Links in mobile menu */}
                <div className="space-y-3 bg-gray-50 rounded-xl p-4">
                  <p className="text-sm font-bold text-primary-600 uppercase tracking-wider mb-3">Quick Links</p>
                  
                  {/* Islamic */}
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-primary-600 uppercase tracking-wider mb-2 px-2">Islamic</p>
                    <Link
                      to="/islamic-knowledge"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={clsx(
                        'flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                        location.pathname === '/islamic-knowledge'
                          ? 'text-primary-600 bg-white shadow-sm'
                          : 'text-gray-700 hover:text-primary-600 hover:bg-white/80'
                      )}
                    >
                      <BookOpen className="w-4 h-4 flex-shrink-0" />
                      <span>Islamic Knowledge Base</span>
                    </Link>
                    <Link
                      to="/book-of-duas"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={clsx(
                        'flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                        location.pathname === '/book-of-duas'
                          ? 'text-primary-600 bg-white shadow-sm'
                          : 'text-gray-700 hover:text-primary-600 hover:bg-white/80'
                      )}
                    >
                      <BookMarked className="w-4 h-4 flex-shrink-0" />
                      <span>Book of Duas</span>
                    </Link>
                    <Link
                      to="/charity-in-islam"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={clsx(
                        'flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                        location.pathname === '/charity-in-islam'
                          ? 'text-primary-600 bg-white shadow-sm'
                          : 'text-gray-700 hover:text-primary-600 hover:bg-white/80'
                      )}
                    >
                      <Sparkles className="w-4 h-4 flex-shrink-0" />
                      <span>Charity in Islam</span>
                    </Link>
                  </div>

                  {/* Resources */}
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-primary-600 uppercase tracking-wider mb-2 px-2">Resources</p>
                    <Link
                      to="/zakat-on-gold"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={clsx(
                        'flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                        location.pathname === '/zakat-on-gold'
                          ? 'text-primary-600 bg-white shadow-sm'
                          : 'text-gray-700 hover:text-primary-600 hover:bg-white/80'
                      )}
                    >
                      <Gift className="w-4 h-4 flex-shrink-0" />
                      <span>Zakat on Gold</span>
                    </Link>
                    <Link
                      to="/umrah-guidelines"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={clsx(
                        'flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                        location.pathname === '/umrah-guidelines'
                          ? 'text-primary-600 bg-white shadow-sm'
                          : 'text-gray-700 hover:text-primary-600 hover:bg-white/80'
                      )}
                    >
                      <Info className="w-4 h-4 flex-shrink-0" />
                      <span>Umrah Guidelines</span>
                    </Link>
                  </div>
                </div>

                <Link
                  to="/about"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={clsx(
                    'flex items-center space-x-3 px-4 py-3 rounded-lg text-base font-semibold transition-all duration-200',
                    isActive('/about')
                      ? 'text-primary-600 bg-primary-50 shadow-sm'
                      : 'text-gray-700 hover:text-primary-600 hover:bg-gray-50'
                  )}
                >
                  <Info className="w-5 h-5" />
                  <span>About</span>
                </Link>
                <Link
                  to="/contact"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={clsx(
                    'flex items-center space-x-3 px-4 py-3 rounded-lg text-base font-semibold transition-all duration-200',
                    isActive('/contact')
                      ? 'text-primary-600 bg-primary-50 shadow-sm'
                      : 'text-gray-700 hover:text-primary-600 hover:bg-gray-50'
                  )}
                >
                  <Mail className="w-5 h-5" />
                  <span>Contact</span>
                </Link>
                
                <div className="flex flex-col space-y-3 pt-4 border-t border-gray-200">
                  {isAuthenticated ? (
                    <>
                      <Link
                        to="/dashboard"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50"
                      >
                        <Gift className="w-4 h-4" />
                        <span>My Donations</span>
                      </Link>
                      {isAdmin && (
                        <Link
                          to="/admin"
                          onClick={() => setIsMobileMenuOpen(false)}
                          className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-purple-600 border border-purple-600 rounded-lg hover:bg-purple-50"
                        >
                          <Shield className="w-4 h-4" />
                          <span>Admin Console</span>
                        </Link>
                      )}
                      <button
                        onClick={() => {
                          logout()
                          setIsMobileMenuOpen(false)
                          navigate('/')
                        }}
                        className="flex items-center justify-center space-x-2 px-4 py-2 text-sm font-medium text-red-600 border border-red-600 rounded-lg hover:bg-red-50"
                      >
                        <X className="w-4 h-4" />
                        <span>Logout</span>
                      </button>
                    </>
                  ) : (
                    <Link
                      to="/login"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="flex items-center justify-center space-x-2 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      <User className="w-4 h-4" />
                      <span>Login</span>
                    </Link>
                  )}
                </div>
              </nav>
            </div>
          </div>
        )}
      </header>
    </>
  )
}

export default Header
