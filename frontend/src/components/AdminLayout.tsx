import { Outlet, Link, useLocation } from 'react-router-dom'
import { 
  LayoutDashboard, 
  Users, 
  Heart, 
  Calendar, 
  BookOpen, 
  MessageSquare, 
  Star,
  CreditCard,
  Settings,
  LogOut,
  Menu,
  X,
  Image,
  UserCog,
  UserPlus,
  Film,
  AlertCircle,
  Video,
  TrendingUp,
  Trash2,
  FolderOpen
} from 'lucide-react'
import { useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { clsx } from 'clsx'

const AdminLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const location = useLocation()
  const { logout, user } = useAuthStore()

  const navigation = [
    { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
    { name: 'Donations', href: '/admin/donations', icon: Heart },
    { name: 'Users', href: '/admin/users', icon: UserCog },
    { name: 'Contacts', href: '/admin/contacts', icon: MessageSquare },
    { name: 'Events', href: '/admin/events', icon: Calendar },
    { name: 'Stories', href: '/admin/stories', icon: BookOpen },
    { name: 'Testimonials', href: '/admin/testimonials', icon: Star },
    { name: 'Volunteers', href: '/admin/volunteers', icon: UserPlus },
    { name: 'Subscriptions', href: '/admin/subscriptions', icon: CreditCard },
    { name: 'Program Categories', href: '/admin/program-categories', icon: TrendingUp },
    { name: 'Programs', href: '/admin/programs', icon: TrendingUp },
    { name: 'Gallery', href: '/admin/gallery', icon: Film },
    { name: 'Videos', href: '/admin/videos', icon: Video },
    { name: 'Slideshow', href: '/admin/slideshow', icon: Film },
    { name: 'Urgent Needs', href: '/admin/urgent-needs', icon: AlertCircle },
    { name: 'Media Cleanup', href: '/admin/cleanup', icon: Trash2 },
    { name: 'S3 Media Browser', href: '/admin/s3-media', icon: FolderOpen },
    { name: 'Settings', href: '/admin/settings', icon: Settings },
  ]

  const isActive = (href: string) => {
    if (href === '/admin') {
      return location.pathname === '/admin'
    }
    return location.pathname.startsWith(href)
  }

  const handleLogout = () => {
    logout()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-gray-600 bg-opacity-75 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={clsx(
        "fixed inset-y-0 left-0 z-50 bg-white shadow-lg transform transition-all duration-300 ease-in-out lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full",
        sidebarCollapsed ? "lg:w-16" : "lg:w-64",
        "w-64"
      )}>
        <div className="flex items-center justify-between h-16 px-6 border-b border-gray-200">
          <div className={clsx("flex items-center", sidebarCollapsed && "lg:justify-center lg:px-0")}>
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
              <Heart className="w-5 h-5 text-white" />
            </div>
            {!sidebarCollapsed && (
              <span className="ml-3 text-lg font-semibold text-gray-900">MyZakat Admin</span>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="hidden lg:block p-1 rounded-md text-gray-400 hover:text-gray-600"
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <Menu className="w-5 h-5" />
            </button>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1 rounded-md text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <nav className="mt-6 px-3">
          <div className="space-y-1">
            {navigation.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                onClick={() => setSidebarOpen(false)}
                className={clsx(
                  "flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors group",
                  isActive(item.href)
                    ? "bg-primary-50 text-primary-600 border-r-2 border-primary-600"
                    : "text-gray-700 hover:bg-gray-50 hover:text-gray-900",
                  sidebarCollapsed && "lg:justify-center lg:px-2"
                )}
                title={sidebarCollapsed ? item.name : undefined}
              >
                <item.icon className={clsx("w-5 h-5", sidebarCollapsed ? "lg:mr-0" : "mr-3")} />
                {!sidebarCollapsed && (
                  <span className="lg:block">{item.name}</span>
                )}
              </Link>
            ))}
          </div>

          {!sidebarCollapsed && (
            <div className="mt-8 pt-6 border-t border-gray-200">
              <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Account
              </div>
              <div className="mt-2 space-y-1">
                <div className="flex items-center px-3 py-2 text-sm text-gray-600">
                  <Users className="w-5 h-5 mr-3" />
                  {user?.name || user?.email}
                </div>
                <Link
                  to="/dashboard"
                  className="flex items-center w-full px-3 py-2 text-sm font-medium text-blue-600 rounded-lg hover:bg-blue-50"
                >
                  <Heart className="w-5 h-5 mr-3" />
                  My Donations
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex items-center w-full px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50 hover:text-gray-900"
                >
                  <LogOut className="w-5 h-5 mr-3" />
                  Logout
                </button>
              </div>
            </div>
          )}
          {sidebarCollapsed && (
            <div className="mt-8 pt-6 border-t border-gray-200">
              <div className="space-y-1">
                <Link
                  to="/dashboard"
                  className="flex items-center justify-center w-full px-2 py-2 text-sm font-medium text-blue-600 rounded-lg hover:bg-blue-50"
                  title="My Donations"
                >
                  <Heart className="w-5 h-5" />
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex items-center justify-center w-full px-2 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50 hover:text-gray-900"
                  title="Logout"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </nav>
      </div>

      {/* Main content */}
      <div className={clsx("transition-all duration-300", sidebarCollapsed ? "lg:pl-16" : "lg:pl-64")}>
        {/* Top bar */}
        <div className="sticky top-0 z-30 bg-white shadow-sm border-b border-gray-200">
          <div className="flex items-center justify-between h-16 px-6">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-600"
            >
              <Menu className="w-6 h-6" />
            </button>
            
            <div className="flex items-center space-x-4">
              <Link
                to="/"
                target="_blank"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                View Site
              </Link>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="py-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default AdminLayout
