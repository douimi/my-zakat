import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from 'react-query'
import { Heart, Search, Download, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { donationsAPI } from '../../utils/api'
import type { Donation } from '../../types'
import { useToast } from '../../contexts/ToastContext'

type SortField = 'donated_at' | 'amount' | 'name' | 'email' | 'frequency'
type SortDir = 'asc' | 'desc'

const AdminDonations = () => {
  const [searchTerm, setSearchTerm] = useState('')
  const [frequencyFilter, setFrequencyFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'confirmed' | 'pending'>('all')
  const [sortField, setSortField] = useState<SortField>('donated_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [syncing, setSyncing] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccess, showError } = useToast()

  const { data: donations, isLoading } = useQuery(
    ['admin-donations'],
    () => donationsAPI.getAll()
  )

  const { data: stats } = useQuery('donation-stats', donationsAPI.getStats)

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 text-gray-400" />
    return sortDir === 'asc'
      ? <ArrowUp className="w-3 h-3 ml-1 text-primary-600" />
      : <ArrowDown className="w-3 h-3 ml-1 text-primary-600" />
  }

  const filteredDonations = useMemo(() => {
    if (!donations) return []

    return donations
      .filter((donation: Donation) => {
        const matchesSearch = !searchTerm ||
          donation.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          donation.email.toLowerCase().includes(searchTerm.toLowerCase())

        const matchesFrequency = !frequencyFilter ||
          donation.frequency.toLowerCase().includes(frequencyFilter.toLowerCase())

        const isPending = donation.frequency.toLowerCase().includes('pending')
        const matchesStatus =
          statusFilter === 'all' ||
          (statusFilter === 'pending' && isPending) ||
          (statusFilter === 'confirmed' && !isPending)

        return matchesSearch && matchesFrequency && matchesStatus
      })
      .sort((a: Donation, b: Donation) => {
        let cmp = 0
        switch (sortField) {
          case 'donated_at':
            cmp = new Date(a.donated_at).getTime() - new Date(b.donated_at).getTime()
            break
          case 'amount':
            cmp = a.amount - b.amount
            break
          case 'name':
            cmp = a.name.localeCompare(b.name)
            break
          case 'email':
            cmp = a.email.localeCompare(b.email)
            break
          case 'frequency':
            cmp = a.frequency.localeCompare(b.frequency)
            break
        }
        return sortDir === 'asc' ? cmp : -cmp
      })
  }, [donations, searchTerm, frequencyFilter, statusFilter, sortField, sortDir])

  const handleSyncStripeData = async () => {
    setSyncing(true)
    try {
      const result = await donationsAPI.syncStripeData()
      showSuccess('Sync Complete', `Successfully synced ${result.synced} records from Stripe`)
      queryClient.invalidateQueries(['admin-donations'])
      queryClient.invalidateQueries('donation-stats')
    } catch (error) {
      showError('Sync Failed', 'Failed to sync data from Stripe')
    } finally {
      setSyncing(false)
    }
  }

  const exportToCsv = () => {
    const csvContent = [
      ['ID', 'Name', 'Email', 'Amount', 'Frequency', 'Date'].join(','),
      ...filteredDonations.map((donation: Donation) => [
        donation.id,
        `"${donation.name}"`,
        donation.email,
        donation.amount,
        `"${donation.frequency}"`,
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div className="flex items-center">
            <Heart className="w-6 h-6 sm:w-8 sm:h-8 text-primary-600 mr-2 sm:mr-3" />
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Donations</h1>
            <span className="ml-3 text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
              {filteredDonations.length} {filteredDonations.length === 1 ? 'record' : 'records'}
            </span>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:space-x-3">
            {window.location.hostname === 'localhost' && (
              <button
                onClick={handleSyncStripeData}
                disabled={syncing}
                className="btn-secondary flex items-center justify-center text-sm sm:text-base px-4 py-2 sm:px-6 sm:py-3"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing...' : 'Sync Stripe'}
              </button>
            )}
            <button
              onClick={exportToCsv}
              className="btn-primary flex items-center justify-center text-sm sm:text-base px-4 py-2 sm:px-6 sm:py-3"
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </button>
          </div>
        </div>
        <p className="text-gray-600 text-sm sm:text-base">Manage and track all donations</p>
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
              <option value="">All Types</option>
              <option value="One-Time">One-Time</option>
              <option value="Recurring">Recurring</option>
            </select>
          </div>
          <div className="w-full md:w-48">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="input-field"
            >
              <option value="all">All Statuses</option>
              <option value="confirmed">Confirmed</option>
              <option value="pending">Pending</option>
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
                <th
                  className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => toggleSort('name')}
                >
                  <div className="flex items-center">
                    Donor <SortIcon field="name" />
                  </div>
                </th>
                <th
                  className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => toggleSort('amount')}
                >
                  <div className="flex items-center">
                    Amount <SortIcon field="amount" />
                  </div>
                </th>
                <th
                  className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => toggleSort('frequency')}
                >
                  <div className="flex items-center">
                    Type <SortIcon field="frequency" />
                  </div>
                </th>
                <th
                  className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => toggleSort('donated_at')}
                >
                  <div className="flex items-center">
                    Date <SortIcon field="donated_at" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredDonations.map((donation: Donation) => {
                const isPending = donation.frequency.toLowerCase().includes('pending')
                return (
                  <tr key={donation.id} className={`hover:bg-gray-50 ${isPending ? 'opacity-60' : ''}`}>
                    <td className="px-3 sm:px-6 py-4">
                      <div>
                        <div className="text-xs sm:text-sm font-medium text-gray-900 break-words">
                          {donation.name}
                        </div>
                        <div className="text-xs sm:text-sm text-gray-500 break-words">
                          {donation.email}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                      <div className="text-xs sm:text-sm font-medium text-green-600">
                        ${donation.amount.toLocaleString()}
                      </div>
                    </td>
                    <td className="px-3 sm:px-6 py-4">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full whitespace-nowrap ${
                        isPending
                          ? 'bg-yellow-100 text-yellow-800'
                          : donation.frequency.includes('Recurring')
                          ? 'bg-green-100 text-green-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {donation.frequency}
                      </span>
                    </td>
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-xs sm:text-sm text-gray-500">
                      {new Date(donation.donated_at).toLocaleDateString()}
                    </td>
                  </tr>
                )
              })}
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
