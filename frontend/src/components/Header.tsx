import { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Menu, X, Heart, User, ChevronDown } from 'lucide-react'
import { clsx } from 'clsx'
import { useAuthStore } from '../store/authStore'

const Header = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isZakatDropdownOpen, setIsZakatDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const { isAuthenticated, isAdmin } = useAuthStore()

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsZakatDropdownOpen(false)
      }
    }

    if (isZakatDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isZakatDropdownOpen])

  const navigation = [
    { name: 'Home', href: '/' },
    { name: 'About', href: '/about' },
    { name: 'Donate', href: '/donate' },
    // Zakat dropdown will be inserted here
    { name: 'Stories', href: '/stories' },
    { name: 'Events', href: '/events' },
    { name: 'Volunteer', href: '/volunteer' },
    { name: 'Contact', href: '/contact' },
  ]

  const zakatMenuItems = [
    { name: 'Zakat Calculator', href: '/zakat-calculator' },
    { name: 'Zakat Education', href: '/zakat-education' },
  ]

  const isActive = (href: string) => {
    if (href === '/') {
      return location.pathname === '/'
    }
    return location.pathname.startsWith(href)
  }

  const isZakatActive = () => {
    return location.pathname.startsWith('/zakat-calculator') || location.pathname.startsWith('/zakat-education')
  }

  return (
    <>
      {/* Emergency Banner */}
      <div className="bg-red-600 text-white text-center py-2 px-4 text-sm">
        🚨 Emergency Relief Needed: Support families affected by the crisis.{' '}
        <Link to="/donate" className="underline font-medium hover:text-red-100">
          Donate Now
        </Link>
      </div>

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
              {/* First 3 items: Home, About, Donate */}
              {navigation.slice(0, 3).map((item) => (
                <Link
                  key={item.name}
                  to={item.href}
                  className={clsx(
                    'text-sm font-medium transition-colors duration-200 whitespace-nowrap',
                    isActive(item.href)
                      ? 'text-primary-600 border-b-2 border-primary-600 pb-1'
                      : 'text-gray-700 hover:text-primary-600'
                  )}
                >
                  {item.name}
                </Link>
              ))}
              
              {/* Zakat Dropdown - Inserted after Donate */}
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setIsZakatDropdownOpen(!isZakatDropdownOpen)}
                  className={clsx(
                    'flex items-center space-x-1 text-sm font-medium transition-colors duration-200 whitespace-nowrap',
                    isZakatActive()
                      ? 'text-primary-600 border-b-2 border-primary-600 pb-1'
                      : 'text-gray-700 hover:text-primary-600'
                  )}
                >
                  <span>Zakat</span>
                  <ChevronDown className={clsx(
                    'w-4 h-4 transition-transform duration-200',
                    isZakatDropdownOpen && 'transform rotate-180'
                  )} />
                </button>
                
                {isZakatDropdownOpen && (
                  <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                    {zakatMenuItems.map((item) => (
                      <Link
                        key={item.name}
                        to={item.href}
                        onClick={() => setIsZakatDropdownOpen(false)}
                        className={clsx(
                          'block px-4 py-2 text-sm transition-colors duration-200',
                          isActive(item.href)
                            ? 'text-primary-600 bg-blue-50'
                            : 'text-gray-700 hover:text-primary-600 hover:bg-gray-50'
                        )}
                      >
                        {item.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Remaining navigation items: Stories, Events, Volunteer, Contact */}
              {navigation.slice(3).map((item) => (
                <Link
                  key={item.name}
                  to={item.href}
                  className={clsx(
                    'text-sm font-medium transition-colors duration-200 whitespace-nowrap',
                    isActive(item.href)
                      ? 'text-primary-600 border-b-2 border-primary-600 pb-1'
                      : 'text-gray-700 hover:text-primary-600'
                  )}
                >
                  {item.name}
                </Link>
              ))}
            </nav>

            {/* CTA Button */}
            <div className="hidden lg:flex items-center space-x-3 xl:space-x-4 flex-shrink-0 ml-4 xl:ml-6">
              {isAuthenticated ? (
                <Link 
                  to="/dashboard" 
                  className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 border border-blue-600 rounded-lg hover:bg-blue-50 transition-colors duration-200 whitespace-nowrap"
                >
                  <User className="w-4 h-4" />
                  <span>My Account</span>
                </Link>
              ) : (
                <Link 
                  to="/login" 
                  className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors duration-200 whitespace-nowrap"
                >
                  <User className="w-4 h-4" />
                  <span>Login</span>
                </Link>
              )}
              <Link to="/donate" className="bg-primary-600 hover:bg-primary-700 text-white font-medium px-6 py-2 rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 text-sm whitespace-nowrap">
                Donate Now
              </Link>
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
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={clsx(
                      'text-base font-medium transition-colors duration-200',
                      isActive(item.href)
                        ? 'text-primary-600'
                        : 'text-gray-700 hover:text-primary-600'
                    )}
                  >
                    {item.name}
                  </Link>
                ))}
                
                {/* Zakat items in mobile menu */}
                <div className="space-y-2 pl-4 border-l-2 border-gray-200">
                  <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Zakat</p>
                  {zakatMenuItems.map((item) => (
                    <Link
                      key={item.name}
                      to={item.href}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={clsx(
                        'block text-base font-medium transition-colors duration-200',
                        isActive(item.href)
                          ? 'text-primary-600'
                          : 'text-gray-700 hover:text-primary-600'
                      )}
                    >
                      {item.name}
                    </Link>
                  ))}
                </div>
                
                <div className="flex flex-col space-y-3 pt-4 border-t border-gray-200">
                  {isAuthenticated ? (
                    <Link
                      to="/dashboard"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="flex items-center justify-center space-x-2 px-4 py-2 text-sm font-medium text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50"
                    >
                      <User className="w-4 h-4" />
                      <span>My Account</span>
                    </Link>
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
                  <Link
                    to="/donate"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="btn-primary text-center"
                  >
                    Donate Now
                  </Link>
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
