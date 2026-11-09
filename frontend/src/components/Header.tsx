import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AlertCircle, AlertTriangle, Heart, LogOut, Menu, User, X } from 'lucide-react'
import { clsx } from 'clsx'
import { useQuery } from 'react-query'
import { useAuthStore } from '../store/authStore'
import { urgentNeedsAPI, settingsAPI, getStaticFileUrl } from '../utils/api'
import FundingMenu, { FundingMenuMobile } from './nav/FundingMenu'
import NavDropdown, { navItemClass, navPanelItemClass } from './nav/NavDropdown'
import {
  ABOUT_LINKS, ABOUT_PATHS, SPONSOR_LINKS, ZAKAT_GROUPS, ZAKAT_PATHS, isSponsorPath, matchesPath,
} from './nav/navLinks'
import LanguageSwitcher from './i18n/LanguageSwitcher'
import { useLocale, useT } from '../i18n'
import { C } from '../i18n/common'

// Urgent-need images are usually stored as full URLs (S3 or external); a bare
// filename is looked up in the media library.
const getUrgentNeedImageUrl = (imageUrl?: string | null) => {
  if (!imageUrl) return null
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) return imageUrl
  return getStaticFileUrl(`/api/uploads/media/images/${imageUrl}`)
}

interface UrgentNeedLinkProps {
  need: any
  active: boolean
  className: string
  onClick?: () => void
}

const UrgentNeedLink = ({ need, active, className, onClick }: UrgentNeedLinkProps) => {
  const [imageError, setImageError] = useState(false)
  const imageUrl = getUrgentNeedImageUrl(need.image_url)

  return (
    <Link
      to={`/urgent-needs/${need.slug}`}
      onClick={onClick}
      className={className}
      aria-current={active ? 'page' : undefined}
    >
      {imageUrl && !imageError ? (
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          width={32}
          height={32}
          className="h-8 w-8 flex-shrink-0 rounded object-cover"
          onError={() => setImageError(true)}
        />
      ) : (
        <AlertCircle aria-hidden="true" className="h-4 w-4 flex-shrink-0 text-red-600" />
      )}
      <span className="min-w-0">{need.title}</span>
    </Link>
  )
}

/** A link inside the mobile menu. */
const mobileItemClass = (active: boolean) =>
  clsx(
    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
    active ? 'bg-primary-50 font-semibold text-primary-700' : 'text-gray-800 hover:bg-gray-50',
  )

const Header = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { isAuthenticated, isAdmin, isStaff, logout, user } = useAuthStore()
  const pathname = location.pathname
  const t = useT()
  const locale = useLocale()

  const { data: urgentNeeds } = useQuery('urgent-needs-nav', () => urgentNeedsAPI.getAll(true), {
    retry: false,
  })

  const { data: settings } = useQuery('header-settings', settingsAPI.getAll, {
    retry: false,
  })

  // Fallback texts are used only when the admin enables the banner without filling them in.
  // Header.test pins the fallback message; the owner may want a more specific one. The
  // admin-written text is shown as entered, in whatever language it was written.
  const emergencyBannerMessage = settings?.find((s: any) => s.key === 'emergency_banner_message')?.value ||
    t(C.emergencyFallback)
  const emergencyBannerCtaText = settings?.find((s: any) => s.key === 'emergency_banner_cta_text')?.value ||
    t(C.donateNow)
  const emergencyBannerCtaUrl = settings?.find((s: any) => s.key === 'emergency_banner_cta_url')?.value ||
    '/donate'
  const emergencyBannerEnabled = settings?.find((s: any) => s.key === 'emergency_banner_enabled')?.value === 'true'

  // Close the mobile menu on navigation and on Escape.
  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!isMobileMenuOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMobileMenuOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isMobileMenuOpen])

  const hasUrgentNeeds = Array.isArray(urgentNeeds) && urgentNeeds.length > 0
  const isProjectsActive = matchesPath(pathname, '/projects') || pathname.startsWith('/urgent-needs/')
  const isZakatActive = ZAKAT_PATHS.some((path) => matchesPath(pathname, path))
  const isAboutActive = ABOUT_PATHS.some((path) => matchesPath(pathname, path))
  const isSponsorActive = isSponsorPath(pathname)
  const consoleLabel = isAdmin ? t(C.adminConsole) : t(C.managerConsole)
  // The admin console is English-only and lives outside the /ar basename, so
  // from the Arabic site it is a plain link to the English URL.
  const consoleHref = locale === 'ar' ? '/admin' : null

  const handleLogout = () => {
    logout()
    setIsMobileMenuOpen(false)
    navigate('/')
  }

  const closeMobileMenu = () => setIsMobileMenuOpen(false)

  return (
    <>
      {emergencyBannerEnabled && (
        <div className="bg-red-600 px-4 py-2 text-center text-sm text-white">
          <AlertTriangle aria-hidden="true" className="-mt-0.5 me-1.5 inline h-4 w-4" />
          {emergencyBannerMessage}{' '}
          <Link to={emergencyBannerCtaUrl} className="font-semibold underline hover:text-red-100">
            {emergencyBannerCtaText}
          </Link>
        </div>
      )}

      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white">
        <div className="section-container flex h-16 items-center gap-2 lg:gap-4">
          <Link to="/" className="-my-1 flex-shrink-0 rounded-lg">
            <img src="/logo.png" alt={t(C.homeLogoAlt)} width={56} height={56} className="h-14 w-14 object-contain" />
          </Link>

          {/* Desktop navigation */}
          <nav aria-label={t(C.mainNav)} className="hidden min-w-0 flex-1 items-center gap-1 lg:flex">
            {hasUrgentNeeds ? (
              <NavDropdown label={t(C.projects)} active={isProjectsActive} panelClassName="w-80">
                <Link to="/projects" className={navPanelItemClass(matchesPath(pathname, '/projects'))}>
                  {t(C.allProjects)}
                </Link>
                <p className="eyebrow px-5 pb-1 pt-3">{t(C.urgentNeeds)}</p>
                <div className="max-h-80 overflow-y-auto">
                  {urgentNeeds.map((need: any) => (
                    <UrgentNeedLink
                      key={need.id}
                      need={need}
                      active={pathname === `/urgent-needs/${need.slug}`}
                      className={navPanelItemClass(pathname === `/urgent-needs/${need.slug}`)}
                    />
                  ))}
                </div>
              </NavDropdown>
            ) : (
              <Link to="/projects" className={navItemClass(isProjectsActive)}>
                {t(C.projects)}
              </Link>
            )}

            <Link to="/programs" className={navItemClass(matchesPath(pathname, '/programs'))}>
              {t(C.programs)}
            </Link>

            <NavDropdown label={t(C.sponsor)} active={isSponsorActive} panelClassName="w-80">
              {SPONSOR_LINKS.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={clsx(navPanelItemClass(pathname === item.to), 'items-start')}
                  aria-current={pathname === item.to ? 'page' : undefined}
                >
                  <span className="flex flex-col">
                    <span className="font-semibold">{t(item.title)}</span>
                    <span className="text-xs font-normal leading-snug text-gray-600">{t(item.subtitle)}</span>
                  </span>
                </Link>
              ))}
            </NavDropdown>

            <NavDropdown label={t(C.zakat)} active={isZakatActive}>
              {ZAKAT_GROUPS.map((group) => (
                <div key={group.title.en} className="pb-1">
                  <p className="eyebrow px-5 pb-1 pt-2">{t(group.title)}</p>
                  {group.items.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={navPanelItemClass(pathname === item.to)}
                      aria-current={pathname === item.to ? 'page' : undefined}
                    >
                      {t(item.label)}
                    </Link>
                  ))}
                </div>
              ))}
            </NavDropdown>

            <NavDropdown label={t(C.about)} active={isAboutActive} panelClassName="w-56">
              {ABOUT_LINKS.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={navPanelItemClass(matchesPath(pathname, item.to))}
                  aria-current={pathname === item.to ? 'page' : undefined}
                >
                  {t(item.label)}
                </Link>
              ))}
            </NavDropdown>

            <FundingMenu />
          </nav>

          <div className="ms-auto flex flex-shrink-0 items-center gap-1 sm:gap-2">
            <LanguageSwitcher compact className="hidden sm:inline-flex" />

            {/* The one persistent call to action, visible at every width. It is also the first
                /donate/i link on "/" when the emergency banner is off (e2e relies on it). */}
            <Link to="/donate" className="btn-primary btn-sm gap-1.5 px-3 sm:px-4">
              <Heart aria-hidden="true" className="h-4 w-4" />
              {t(C.donate)}
            </Link>

            {/* Account menu (desktop). e2e: button /profile menu/i, then link /admin console/i. */}
            <div className="hidden lg:block">
              <NavDropdown
                label={<User aria-hidden="true" className="h-6 w-6" />}
                ariaLabel={t(C.profileMenu)}
                align="right"
                panelClassName="w-60"
                triggerClassName="flex h-11 w-11 items-center justify-center rounded-full text-gray-700 transition-colors hover:bg-gray-100 hover:text-primary-700"
              >
                {isAuthenticated ? (
                  <>
                    {(user?.name || user?.email) && (
                      <p className="truncate border-b border-gray-100 px-5 pb-2 pt-1 text-xs text-gray-600">
                        {t(C.signedInAs)} <span className="font-semibold text-gray-900">{user?.name || user?.email}</span>
                      </p>
                    )}
                    <div className="pt-1">
                      <Link to="/dashboard" className={navPanelItemClass(false)}>
                        {t(C.myDonations)}
                      </Link>
                      {isStaff && (consoleHref ? (
                        <a href={consoleHref} className={navPanelItemClass(false)}>{consoleLabel}</a>
                      ) : (
                        <Link to="/admin" className={navPanelItemClass(false)}>
                          {consoleLabel}
                        </Link>
                      ))}
                    </div>
                    <div className="mt-1 border-t border-gray-100 pt-1">
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="mx-2 flex w-[calc(100%-1rem)] items-center gap-3 rounded-lg px-3 py-2 text-start text-sm text-red-700 transition-colors hover:bg-red-50"
                      >
                        <LogOut aria-hidden="true" className="h-4 w-4" />
                        {t(C.logOut)}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <Link to="/login" className={navPanelItemClass(false)}>
                      {t(C.logIn)}
                    </Link>
                    <Link to="/register" className={navPanelItemClass(false)}>
                      {t(C.createAccount)}
                    </Link>
                  </>
                )}
              </NavDropdown>
            </div>

            <button
              type="button"
              onClick={() => setIsMobileMenuOpen((open) => !open)}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-700 transition-colors hover:bg-gray-100 lg:hidden"
              aria-label={t(C.toggleMenu)}
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-menu"
            >
              {isMobileMenuOpen ? <X aria-hidden="true" className="h-6 w-6" /> : <Menu aria-hidden="true" className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Mobile navigation */}
        {isMobileMenuOpen && (
          <div
            id="mobile-menu"
            className="max-h-[calc(100vh-4rem)] overflow-y-auto border-t border-gray-200 bg-white lg:hidden"
          >
            <nav aria-label={t(C.mobileNav)} className="section-container space-y-5 py-4">
              <div className="grid grid-cols-2 gap-x-2">
                <Link to="/" onClick={closeMobileMenu} className={mobileItemClass(pathname === '/')}>
                  {t(C.home)}
                </Link>
                <Link to="/projects" onClick={closeMobileMenu} className={mobileItemClass(matchesPath(pathname, '/projects'))}>
                  {t(C.projects)}
                </Link>
                <Link to="/programs" onClick={closeMobileMenu} className={mobileItemClass(matchesPath(pathname, '/programs'))}>
                  {t(C.programs)}
                </Link>
                <LanguageSwitcher className="justify-start px-3 py-2.5 font-normal text-gray-800 sm:hidden" />
              </div>

              <div>
                <p className="eyebrow px-3 pb-1">{t(C.sponsor)}</p>
                <div className="grid grid-cols-2 gap-x-2">
                  {SPONSOR_LINKS.map((item) => (
                    <Link key={item.to} to={item.to} onClick={closeMobileMenu} className={mobileItemClass(pathname === item.to)}>
                      {t(item.title)}
                    </Link>
                  ))}
                </div>
              </div>

              <FundingMenuMobile onNavigate={closeMobileMenu} />

              {hasUrgentNeeds && (
                <div>
                  <p className="eyebrow px-3 pb-1">{t(C.urgentNeeds)}</p>
                  {urgentNeeds.map((need: any) => (
                    <UrgentNeedLink
                      key={need.id}
                      need={need}
                      onClick={closeMobileMenu}
                      active={pathname === `/urgent-needs/${need.slug}`}
                      className={mobileItemClass(pathname === `/urgent-needs/${need.slug}`)}
                    />
                  ))}
                </div>
              )}

              <div>
                <p className="eyebrow px-3 pb-1">{t(C.zakat)}</p>
                <div className="grid grid-cols-2 gap-x-2">
                  {ZAKAT_GROUPS.flatMap((group) => group.items).map((item) => (
                    <Link key={item.to} to={item.to} onClick={closeMobileMenu} className={mobileItemClass(pathname === item.to)}>
                      {t(item.label)}
                    </Link>
                  ))}
                </div>
              </div>

              <div>
                <p className="eyebrow px-3 pb-1">{t(C.about)}</p>
                <div className="grid grid-cols-2 gap-x-2">
                  {ABOUT_LINKS.map((item) => (
                    <Link key={item.to} to={item.to} onClick={closeMobileMenu} className={mobileItemClass(matchesPath(pathname, item.to))}>
                      {t(item.label)}
                    </Link>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4">
                {isAuthenticated ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <Link to="/dashboard" onClick={closeMobileMenu} className="btn-secondary btn-sm w-full">
                      {t(C.myDonations)}
                    </Link>
                    {isStaff && (consoleHref ? (
                      <a href={consoleHref} className="btn-secondary btn-sm w-full">{consoleLabel}</a>
                    ) : (
                      <Link to="/admin" onClick={closeMobileMenu} className="btn-secondary btn-sm w-full">
                        {consoleLabel}
                      </Link>
                    ))}
                    <button type="button" onClick={handleLogout} className="btn-ghost btn-sm w-full gap-2 text-red-700 hover:bg-red-50">
                      <LogOut aria-hidden="true" className="h-4 w-4" />
                      {t(C.logOut)}
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <Link to="/login" onClick={closeMobileMenu} className="btn-secondary btn-sm w-full">
                      {t(C.logIn)}
                    </Link>
                    <Link to="/register" onClick={closeMobileMenu} className="btn-ghost btn-sm w-full">
                      {t(C.createAccount)}
                    </Link>
                  </div>
                )}
              </div>
            </nav>
          </div>
        )}
      </header>
    </>
  )
}

export default Header
