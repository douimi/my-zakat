import { useState, useRef, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Menu, X, Heart, User, ChevronDown, Shield, Gift, AlertCircle, BookOpen, Calendar, Users, Info, Mail } from 'lucide-react'
import { clsx } from 'clsx'
import { useAuthStore } from '../store/authStore'
import { useQuery } from 'react-query'
import { urgentNeedsAPI, settingsAPI } from '../utils/api'

const Header = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isQuickLinksDropdownOpen, setIsQuickLinksDropdownOpen] = useState(false)
  const [isUrgentNeedsDropdownOpen, setIsUrgentNeedsDropdownOpen] = useState(false)
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false)
  const quickLinksRef = useRef<HTMLDivElement>(null)
  const urgentNeedsRef = useRef<HTMLDivElement>(null)
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

  const isZakatActive = () => {
    return location.pathname.startsWith('/zakat-calculator') || 
           location.pathname.startsWith('/zakat-education') ||
           location.pathname.startsWith('/islamic-knowledge') ||
           location.pathname.startsWith('/book-of-duas') ||
           location.pathname.startsWith('/charity-in-islam') ||
           location.pathname.startsWith('/kaffarah-calculator') ||
           location.pathname.startsWith('/zakat-on-gold') ||
           location.pathname.startsWith('/umrah-guidelines')
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

      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
        <div className="section-container">
          <div className="flex items-center justify-between h-20 py-3 min-w-0">
            {/* Logo */}
            <Link to="/" className="flex items-center space-x-2 md:space-x-3 flex-shrink-0 mr-4 md:mr-6 lg:mr-8">
              <div className="w-9 h-9 md:w-10 md:h-10 bg-primary-600 rounded-lg flex items-center justify-center">
                <Heart className="w-5 h-5 md:w-6 md:h-6 text-white" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-lg md:text-xl font-heading font-bold text-gray-900">MyZakat</h1>
                <p className="text-xs text-gray-600">Distribution Foundation</p>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center space-x-5 xl:space-x-6 flex-1 justify-center min-w-0 px-4">
              {/* Urgent Needs Dropdown */}
              {urgentNeeds && urgentNeeds.length > 0 && (
                <div className="relative" ref={urgentNeedsRef}>
                  <button
                    onClick={() => setIsUrgentNeedsDropdownOpen(!isUrgentNeedsDropdownOpen)}
                    className={clsx(
                      'flex items-center space-x-1 text-sm font-medium transition-colors duration-200 whitespace-nowrap',
                      isUrgentNeedsActive()
                        ? 'text-primary-600 border-b-2 border-primary-600 pb-1'
                        : 'text-gray-700 hover:text-primary-600'
                    )}
                  >
                    <AlertCircle className="w-4 h-4" />
                    <span>Critical Causes</span>
                    <ChevronDown className={clsx(
                      'w-4 h-4 transition-transform duration-200',
                      isUrgentNeedsDropdownOpen && 'transform rotate-180'
                    )} />
                  </button>
                  
                  {isUrgentNeedsDropdownOpen && (
                    <div className="absolute top-full left-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50 max-h-96 overflow-y-auto">
                      {urgentNeeds.map((need: any) => (
                        <Link
                          key={need.id}
                          to={`/urgent-needs/${need.slug}`}
                          onClick={() => setIsUrgentNeedsDropdownOpen(false)}
                          className={clsx(
                            'block px-4 py-2 text-sm transition-colors duration-200',
                            location.pathname === `/urgent-needs/${need.slug}`
                              ? 'text-primary-600 bg-blue-50'
                              : 'text-gray-700 hover:text-primary-600 hover:bg-gray-50'
                          )}
                        >
                          {need.title}
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
                  'flex items-center space-x-1.5 text-sm font-medium transition-colors duration-200 whitespace-nowrap',
                  isActive('/stories')
                    ? 'text-primary-600 border-b-2 border-primary-600 pb-1'
                    : 'text-gray-700 hover:text-primary-600'
                )}
              >
                <BookOpen className="w-4 h-4" />
                <span>Our Impact</span>
              </Link>

              {/* Our Work */}
              <Link
                to="/events"
                className={clsx(
                  'flex items-center space-x-1.5 text-sm font-medium transition-colors duration-200 whitespace-nowrap',
                  isActive('/events')
                    ? 'text-primary-600 border-b-2 border-primary-600 pb-1'
                    : 'text-gray-700 hover:text-primary-600'
                )}
              >
                <Calendar className="w-4 h-4" />
                <span>Our Work</span>
              </Link>

              {/* Get Involved */}
              <Link
                to="/volunteer"
                className={clsx(
                  'flex items-center space-x-1.5 text-sm font-medium transition-colors duration-200 whitespace-nowrap',
                  isActive('/volunteer')
                    ? 'text-primary-600 border-b-2 border-primary-600 pb-1'
                    : 'text-gray-700 hover:text-primary-600'
                )}
              >
                <Users className="w-4 h-4" />
                <span>Get Involved</span>
              </Link>

              {/* Quick Links Dropdown */}
              <div className="relative" ref={quickLinksRef}>
                <button
                  onClick={() => setIsQuickLinksDropdownOpen(!isQuickLinksDropdownOpen)}
                  className={clsx(
                    'flex items-center space-x-1 text-sm font-medium transition-colors duration-200 whitespace-nowrap',
                    isZakatActive()
                      ? 'text-primary-600 border-b-2 border-primary-600 pb-1'
                      : 'text-gray-700 hover:text-primary-600'
                  )}
                >
                  <span>Quick Links</span>
                  <ChevronDown className={clsx(
                    'w-4 h-4 transition-transform duration-200',
                    isQuickLinksDropdownOpen && 'transform rotate-180'
                  )} />
                </button>
                
                {isQuickLinksDropdownOpen && (
                  <div className="absolute top-full left-0 mt-2 w-72 bg-white rounded-lg shadow-lg border border-gray-200 py-3 z-50">
                    {/* Islamic Section */}
                    <div className="px-4 py-2 border-b border-gray-200">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Islamic</p>
                      <div className="space-y-1">
                        <Link
                          to="/islamic-knowledge"
                          onClick={() => setIsQuickLinksDropdownOpen(false)}
                          className={clsx(
                            'block px-2 py-1.5 text-sm transition-colors duration-200 rounded',
                            location.pathname === '/islamic-knowledge'
                              ? 'text-primary-600 bg-blue-50'
                              : 'text-gray-700 hover:text-primary-600 hover:bg-gray-50'
                          )}
                        >
                          Islamic Knowledge Base
                        </Link>
                        <Link
                          to="/book-of-duas"
                          onClick={() => setIsQuickLinksDropdownOpen(false)}
                          className={clsx(
                            'block px-2 py-1.5 text-sm transition-colors duration-200 rounded',
                            location.pathname === '/book-of-duas'
                              ? 'text-primary-600 bg-blue-50'
                              : 'text-gray-700 hover:text-primary-600 hover:bg-gray-50'
                          )}
                        >
                          Book of Duas
                        </Link>
                        <Link
                          to="/charity-in-islam"
                          onClick={() => setIsQuickLinksDropdownOpen(false)}
                          className={clsx(
                            'block px-2 py-1.5 text-sm transition-colors duration-200 rounded',
                            location.pathname === '/charity-in-islam'
                              ? 'text-primary-600 bg-blue-50'
                              : 'text-gray-700 hover:text-primary-600 hover:bg-gray-50'
                          )}
                        >
                          Charity in Islam
                        </Link>
                      </div>
                    </div>

                    {/* Tools Section */}
                    <div className="px-4 py-2 border-b border-gray-200">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tools</p>
                      <div className="space-y-1">
                        <Link
                          to="/zakat-calculator"
                          onClick={() => setIsQuickLinksDropdownOpen(false)}
                          className={clsx(
                            'block px-2 py-1.5 text-sm transition-colors duration-200 rounded',
                            location.pathname === '/zakat-calculator'
                              ? 'text-primary-600 bg-blue-50'
                              : 'text-gray-700 hover:text-primary-600 hover:bg-gray-50'
                          )}
                        >
                          Zakat Calculator
                        </Link>
                        <Link
                          to="/kaffarah-calculator"
                          onClick={() => setIsQuickLinksDropdownOpen(false)}
                          className={clsx(
                            'block px-2 py-1.5 text-sm transition-colors duration-200 rounded',
                            location.pathname === '/kaffarah-calculator'
                              ? 'text-primary-600 bg-blue-50'
                              : 'text-gray-700 hover:text-primary-600 hover:bg-gray-50'
                          )}
                        >
                          Kaffarah Calculator
                        </Link>
                        <Link
                          to="/donate"
                          onClick={() => setIsQuickLinksDropdownOpen(false)}
                          className={clsx(
                            'block px-2 py-1.5 text-sm transition-colors duration-200 rounded',
                            location.pathname === '/donate'
                              ? 'text-primary-600 bg-blue-50'
                              : 'text-gray-700 hover:text-primary-600 hover:bg-gray-50'
                          )}
                        >
                          Ways to Donate
                        </Link>
                      </div>
                    </div>

                    {/* Quick Links Section */}
                    <div className="px-4 py-2">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Quick Links</p>
                      <div className="space-y-1">
                        <Link
                          to="/zakat-on-gold"
                          onClick={() => setIsQuickLinksDropdownOpen(false)}
                          className={clsx(
                            'block px-2 py-1.5 text-sm transition-colors duration-200 rounded',
                            location.pathname === '/zakat-on-gold'
                              ? 'text-primary-600 bg-blue-50'
                              : 'text-gray-700 hover:text-primary-600 hover:bg-gray-50'
                          )}
                        >
                          Zakat on Gold
                        </Link>
                        <Link
                          to="/umrah-guidelines"
                          onClick={() => setIsQuickLinksDropdownOpen(false)}
                          className={clsx(
                            'block px-2 py-1.5 text-sm transition-colors duration-200 rounded',
                            location.pathname === '/umrah-guidelines'
                              ? 'text-primary-600 bg-blue-50'
                              : 'text-gray-700 hover:text-primary-600 hover:bg-gray-50'
                          )}
                        >
                          Umrah Guidelines
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
                  'flex items-center space-x-1.5 text-sm font-medium transition-colors duration-200 whitespace-nowrap',
                  isActive('/about')
                    ? 'text-primary-600 border-b-2 border-primary-600 pb-1'
                    : 'text-gray-700 hover:text-primary-600'
                )}
              >
                <Info className="w-4 h-4" />
                <span>About</span>
              </Link>

              {/* Connect */}
              <Link
                to="/contact"
                className={clsx(
                  'flex items-center space-x-1.5 text-sm font-medium transition-colors duration-200 whitespace-nowrap',
                  isActive('/contact')
                    ? 'text-primary-600 border-b-2 border-primary-600 pb-1'
                    : 'text-gray-700 hover:text-primary-600'
                )}
              >
                <Mail className="w-4 h-4" />
                <span>Contact</span>
              </Link>
            </nav>

            {/* Profile Icon with Dropdown */}
            <div className="hidden lg:flex items-center flex-shrink-0 ml-4 xl:ml-6">
              <div className="relative" ref={profileDropdownRef}>
                <button
                  onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                  className="p-2 rounded-full hover:bg-gray-100 transition-colors duration-200"
                  aria-label="Profile menu"
                >
                  <User className="w-6 h-6 text-gray-700" />
                </button>
                
                {isProfileDropdownOpen && (
                  <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                    {isAuthenticated ? (
                      <>
                        <Link
                          to="/dashboard"
                          onClick={() => setIsProfileDropdownOpen(false)}
                          className="flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 hover:text-primary-600 hover:bg-gray-50 transition-colors duration-200"
                        >
                          <Gift className="w-4 h-4" />
                          <span>My Donations</span>
                        </Link>
                        {isAdmin && (
                          <Link
                            to="/admin"
                            onClick={() => setIsProfileDropdownOpen(false)}
                            className="flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 hover:text-primary-600 hover:bg-gray-50 transition-colors duration-200"
                          >
                            <Shield className="w-4 h-4" />
                            <span>Admin Console</span>
                          </Link>
                        )}
                        <div className="border-t border-gray-200 my-1"></div>
                        <button
                          onClick={() => {
                            logout()
                            setIsProfileDropdownOpen(false)
                            navigate('/')
                          }}
                          className="w-full flex items-center space-x-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors duration-200"
                        >
                          <X className="w-4 h-4" />
                          <span>Logout</span>
                        </button>
                      </>
                    ) : (
                      <Link
                        to="/login"
                        onClick={() => setIsProfileDropdownOpen(false)}
                        className="block px-4 py-2 text-sm text-gray-700 hover:text-primary-600 hover:bg-gray-50 transition-colors duration-200"
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
              className="lg:hidden p-2 rounded-md text-gray-700 hover:text-primary-600 hover:bg-gray-100 flex-shrink-0"
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMobileMenuOpen && (
          <div className="lg:hidden border-t border-gray-200 bg-white">
            <div className="section-container py-4">
              <nav className="flex flex-col space-y-4">
                {/* Urgent Needs in mobile menu */}
                {urgentNeeds && urgentNeeds.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center">
                      <AlertCircle className="w-4 h-4 mr-2" />
                      Critical Causes
                    </p>
                    {urgentNeeds.map((need: any) => (
                      <Link
                        key={need.id}
                        to={`/urgent-needs/${need.slug}`}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={clsx(
                          'block text-base font-medium transition-colors duration-200 pl-4',
                          location.pathname === `/urgent-needs/${need.slug}`
                            ? 'text-primary-600'
                            : 'text-gray-700 hover:text-primary-600'
                        )}
                      >
                        {need.title}
                      </Link>
                    ))}
                  </div>
                )}

                {/* Main navigation items */}
                <Link
                  to="/stories"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={clsx(
                    'flex items-center space-x-2 text-base font-medium transition-colors duration-200',
                    isActive('/stories')
                      ? 'text-primary-600'
                      : 'text-gray-700 hover:text-primary-600'
                  )}
                >
                  <BookOpen className="w-5 h-5" />
                  <span>Our Impact</span>
                </Link>
                <Link
                  to="/events"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={clsx(
                    'flex items-center space-x-2 text-base font-medium transition-colors duration-200',
                    isActive('/events')
                      ? 'text-primary-600'
                      : 'text-gray-700 hover:text-primary-600'
                  )}
                >
                  <Calendar className="w-5 h-5" />
                  <span>Our Work</span>
                </Link>
                <Link
                  to="/volunteer"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={clsx(
                    'flex items-center space-x-2 text-base font-medium transition-colors duration-200',
                    isActive('/volunteer')
                      ? 'text-primary-600'
                      : 'text-gray-700 hover:text-primary-600'
                  )}
                >
                  <Users className="w-5 h-5" />
                  <span>Get Involved</span>
                </Link>

                {/* Quick Links in mobile menu */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Quick Links</p>
                  
                  {/* Islamic */}
                  <div className="pl-4 space-y-1">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Islamic</p>
                    <Link
                      to="/islamic-knowledge"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={clsx(
                        'block text-base font-medium transition-colors duration-200 pl-2',
                        location.pathname === '/islamic-knowledge'
                          ? 'text-primary-600'
                          : 'text-gray-700 hover:text-primary-600'
                      )}
                    >
                      Islamic Knowledge Base
                    </Link>
                    <Link
                      to="/book-of-duas"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={clsx(
                        'block text-base font-medium transition-colors duration-200 pl-2',
                        location.pathname === '/book-of-duas'
                          ? 'text-primary-600'
                          : 'text-gray-700 hover:text-primary-600'
                      )}
                    >
                      Book of Duas
                    </Link>
                    <Link
                      to="/charity-in-islam"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={clsx(
                        'block text-base font-medium transition-colors duration-200 pl-2',
                        location.pathname === '/charity-in-islam'
                          ? 'text-primary-600'
                          : 'text-gray-700 hover:text-primary-600'
                      )}
                    >
                      Charity in Islam
                    </Link>
                  </div>

                  {/* Tools */}
                  <div className="pl-4 space-y-1">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Tools</p>
                    <Link
                      to="/zakat-calculator"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={clsx(
                        'block text-base font-medium transition-colors duration-200 pl-2',
                        location.pathname === '/zakat-calculator'
                          ? 'text-primary-600'
                          : 'text-gray-700 hover:text-primary-600'
                      )}
                    >
                      Zakat Calculator
                    </Link>
                    <Link
                      to="/kaffarah-calculator"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={clsx(
                        'block text-base font-medium transition-colors duration-200 pl-2',
                        location.pathname === '/kaffarah-calculator'
                          ? 'text-primary-600'
                          : 'text-gray-700 hover:text-primary-600'
                      )}
                    >
                      Kaffarah Calculator
                    </Link>
                    <Link
                      to="/donate"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={clsx(
                        'block text-base font-medium transition-colors duration-200 pl-2',
                        location.pathname === '/donate'
                          ? 'text-primary-600'
                          : 'text-gray-700 hover:text-primary-600'
                      )}
                    >
                      Ways to Donate
                    </Link>
                  </div>

                  {/* Quick Links */}
                  <div className="pl-4 space-y-1">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Quick Links</p>
                    <Link
                      to="/zakat-on-gold"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={clsx(
                        'block text-base font-medium transition-colors duration-200 pl-2',
                        location.pathname === '/zakat-on-gold'
                          ? 'text-primary-600'
                          : 'text-gray-700 hover:text-primary-600'
                      )}
                    >
                      Zakat on Gold
                    </Link>
                    <Link
                      to="/umrah-guidelines"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={clsx(
                        'block text-base font-medium transition-colors duration-200 pl-2',
                        location.pathname === '/umrah-guidelines'
                          ? 'text-primary-600'
                          : 'text-gray-700 hover:text-primary-600'
                      )}
                    >
                      Umrah Guidelines
                    </Link>
                  </div>
                </div>

                <Link
                  to="/about"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={clsx(
                    'flex items-center space-x-2 text-base font-medium transition-colors duration-200',
                    isActive('/about')
                      ? 'text-primary-600'
                      : 'text-gray-700 hover:text-primary-600'
                  )}
                >
                  <Info className="w-5 h-5" />
                  <span>About</span>
                </Link>
                <Link
                  to="/contact"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={clsx(
                    'flex items-center space-x-2 text-base font-medium transition-colors duration-200',
                    isActive('/contact')
                      ? 'text-primary-600'
                      : 'text-gray-700 hover:text-primary-600'
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
