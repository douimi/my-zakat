import { useState } from 'react'
import { useQuery } from 'react-query'
import { Heart, Search, Filter, Download, Eye } from 'lucide-react'
import { donationsAPI } from '../../utils/api'
import type { Donation } from '../../types'

const AdminDonations = () => {
  const [searchTerm, setSearchTerm] = useState('')
  const [frequencyFilter, setFrequencyFilter] = useState('')
  const [page, setPage] = useState(1)

  const { data: donations, isLoading } = useQuery(
    ['admin-donations', searchTerm, frequencyFilter, page],
    () => donationsAPI.getAll()
  )

  const { data: stats } = useQuery('donation-stats', donationsAPI.getStats)

  const filteredDonations = donations?.filter((donation: Donation) => {
    const matchesSearch = !searchTerm || 
      donation.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      donation.email.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesFrequency = !frequencyFilter || donation.frequency === frequencyFilter

    return matchesSearch && matchesFrequency
  }) || []

  const exportToCsv = () => {
    const csvContent = [
      ['ID', 'Name', 'Email', 'Amount', 'Frequency', 'Date'].join(','),
      ...filteredDonations.map((donation: Donation) => [
        donation.id,
        donation.name,
        donation.email,
        donation.amount,
        donation.frequency,
        new Date(donation.donated_at).toLocaleDateString()
      ].join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'donations.csv'
    a.click()
  }

  if (isLoading) {
    return (
      <div className="section-container">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="section-container">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <Heart className="w-8 h-8 text-primary-600 mr-3" />
            <h1 className="text-3xl font-bold text-gray-900">Donations</h1>
          </div>
          <button
            onClick={exportToCsv}
            className="btn-primary flex items-center"
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </button>
        </div>
        <p className="text-gray-600">Manage and track all donations</p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="card">
            <div className="flex items-center">
              <Heart className="w-8 h-8 text-green-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Donations</p>
                <p className="text-2xl font-bold text-gray-900">
                  ${stats.total_donations?.toLocaleString() || 0}
                </p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center">
              <Heart className="w-8 h-8 text-blue-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Donors</p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.total_donors || 0}
                </p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center">
              <Heart className="w-8 h-8 text-purple-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Average Donation</p>
                <p className="text-2xl font-bold text-gray-900">
                  ${stats.total_donors ? Math.round(stats.total_donations / stats.total_donors) : 0}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field pl-10"
              />
            </div>
          </div>
          <div className="w-full md:w-48">
            <select
              value={frequencyFilter}
              onChange={(e) => setFrequencyFilter(e.target.value)}
              className="input-field"
            >
              <option value="">All Frequencies</option>
              <option value="One-Time">One-Time</option>
              <option value="Monthly">Monthly</option>
              <option value="Annually">Annually</option>
              <option value="Ramadan">Ramadan</option>
            </select>
          </div>
        </div>
      </div>

      {/* Donations Table */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Donor
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Frequency
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredDonations.map((donation: Donation) => (
                <tr key={donation.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {donation.name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {donation.email}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-green-600">
                      ${donation.amount.toLocaleString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      donation.frequency === 'One-Time' 
                        ? 'bg-blue-100 text-blue-800'
                        : donation.frequency === 'Monthly'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-purple-100 text-purple-800'
                    }`}>
                      {donation.frequency}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(donation.donated_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredDonations.length === 0 && (
          <div className="text-center py-12">
            <Heart className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No donations found</h3>
            <p className="text-gray-500">No donations match your current filters.</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default AdminDonations
