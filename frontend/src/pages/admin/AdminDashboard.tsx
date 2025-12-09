import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import { adminAPI } from '../../utils/api'
import { BarChart3, Users, Heart, Calendar, Settings } from 'lucide-react'

const AdminDashboard = () => {
  const { data: stats } = useQuery('admin-dashboard', adminAPI.getDashboardStats)

  return (
    <div className="section-container">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-2 text-sm sm:text-base">Overview of your platform's performance</p>
      </div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="card">
            <div className="flex items-center">
              <Heart className="w-8 h-8 text-green-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Donations</p>
                <p className="text-2xl font-bold text-gray-900">
                  ${stats.donations.total_amount.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center">
              <Users className="w-8 h-8 text-blue-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Donors</p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.donations.total_donors}
                </p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center">
              <Calendar className="w-8 h-8 text-purple-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Events</p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.content.events}
                </p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center">
              <BarChart3 className="w-8 h-8 text-orange-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Volunteers</p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.volunteers.total}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Contact Messages</h3>
          {stats && (
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Messages:</span>
                <span className="font-semibold">{stats.contacts.total_messages}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Pending:</span>
                <span className="font-semibold text-orange-600">{stats.contacts.pending}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Resolved:</span>
                <span className="font-semibold text-green-600">{stats.contacts.resolved}</span>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Content Overview</h3>
          {stats && (
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-gray-600">Stories:</span>
                <span className="font-semibold">{stats.content.stories}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Active Stories:</span>
                <span className="font-semibold text-green-600">{stats.content.active_stories}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Pending Testimonials:</span>
                <span className="font-semibold text-orange-600">{stats.content.pending_testimonials}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Subscriptions:</span>
                <span className="font-semibold">{stats.content.subscriptions}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default AdminDashboard
