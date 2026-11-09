import type { ReactNode } from 'react'
import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import { adminAPI } from '../../utils/api'
import {
  BarChart3, Users, Heart, Calendar, LayoutDashboard, ChevronRight, FolderKanban, MessageSquare, Star, BookOpen,
  type LucideIcon,
} from 'lucide-react'
import { PageHeader, LoadingBlock, ErrorState } from '../../components/admin'

const StatLink = ({ to, icon: Icon, label, value }: { to: string; icon: LucideIcon; label: string; value: ReactNode }) => (
  <Link to={to} className="card flex items-center gap-4 hover:border-primary-200 hover:shadow-md transition-shadow">
    <Icon className="w-7 h-7 text-primary-600 shrink-0" aria-hidden="true" />
    <div className="min-w-0">
      <p className="text-sm font-medium text-gray-600">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  </Link>
)

const TodoRow = ({ to, icon: Icon, label, count, hint }: {
  to: string; icon: LucideIcon; label: string; count?: number; hint?: string
}) => (
  <li>
    <Link to={to} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
      <Icon className="w-5 h-5 text-gray-400 shrink-0" aria-hidden="true" />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-gray-900">{label}</span>
        {hint && <span className="block text-xs text-gray-500">{hint}</span>}
      </span>
      {count !== undefined && (
        <span className={count > 0 ? 'badge-warning' : 'badge-neutral'}>{count}</span>
      )}
      <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" aria-hidden="true" />
    </Link>
  </li>
)

const AdminDashboard = () => {
  const { data: stats, isLoading, isError, refetch } = useQuery('admin-dashboard', adminAPI.getDashboardStats)

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" icon={LayoutDashboard} />

      {isLoading && <LoadingBlock label="Loading dashboard…" />}
      {isError && <ErrorState message="Could not load the dashboard figures." onRetry={() => refetch()} />}

      {stats && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatLink to="/admin/donations" icon={Heart} label="Total Donations"
              value={`$${stats.donations.total_amount.toLocaleString()}`} />
            <StatLink to="/admin/donations" icon={Users} label="Total Donors" value={stats.donations.total_donors} />
            <StatLink to="/admin/events" icon={Calendar} label="Events" value={stats.content.events} />
            <StatLink to="/admin/volunteers" icon={BarChart3} label="Volunteers" value={stats.volunteers.total} />
          </div>

          <section className="bg-white rounded-lg border border-gray-200 overflow-hidden" aria-labelledby="needs-attention">
            <h2 id="needs-attention" className="px-4 py-3 text-base font-semibold text-gray-900 border-b border-gray-200">
              Needs attention
            </h2>
            <ul className="divide-y divide-gray-100">
              <TodoRow to="/admin/project-proposals" icon={FolderKanban} label="Project proposals"
                hint="Open the review queue" />
              <TodoRow to="/admin/contacts?status=pending" icon={MessageSquare} label="Contact messages pending"
                count={stats.contacts.pending} />
              <TodoRow to="/admin/testimonials" icon={Star} label="Testimonials pending"
                count={stats.content.pending_testimonials} />
              <TodoRow to="/admin/stories" icon={BookOpen} label="Stories"
                hint={`${stats.content.active_stories} of ${stats.content.stories} live`} />
            </ul>
          </section>
        </>
      )}
    </div>
  )
}

export default AdminDashboard
