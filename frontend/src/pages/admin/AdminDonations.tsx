import { useState, useMemo, useEffect } from 'react'
import { useQuery, useQueryClient } from 'react-query'
import { Heart, Search, Download, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown, Plus, Eye, X, FileText } from 'lucide-react'
import { donationsAPI } from '../../utils/api'
import type { Donation } from '../../types'
import { useToast } from '../../contexts/ToastContext'
import { useAuthStore } from '../../store/authStore'

type SortField = 'donated_at' | 'amount' | 'name' | 'email' | 'frequency'
type SortDir = 'asc' | 'desc'

function getStatusInfo(frequency: string) {
  const f = frequency.toLowerCase()
  if (f.startsWith('failed')) return { status: 'failed', label: frequency, color: 'bg-red-100 text-red-800' }
  if (f === 'abandoned') return { status: 'abandoned', label: 'Abandoned', color: 'bg-gray-100 text-gray-600' }
  if (f.includes('pending')) return { status: 'pending', label: frequency, color: 'bg-yellow-100 text-yellow-800' }
  if (f === 'manual') return { status: 'manual', label: 'Manual', color: 'bg-purple-100 text-purple-800' }
  if (f.includes('recurring')) return { status: 'confirmed', label: frequency, color: 'bg-green-100 text-green-800' }
  return { status: 'confirmed', label: frequency, color: 'bg-blue-100 text-blue-800' }
}

const AdminDonations = () => {
  const [searchTerm, setSearchTerm] = useState('')
  const [frequencyFilter, setFrequencyFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'confirmed' | 'pending' | 'failed' | 'abandoned' | 'manual'>('all')
  const [sortField, setSortField] = useState<SortField>('donated_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [syncing, setSyncing] = useState(false)
  // Manual donation modal
  const [showManualModal, setShowManualModal] = useState(false)
  const [manualForm, setManualForm] = useState({
    name: '',
    email: '',
    amount: '',
    payment_method: 'Cash',
    notes: '',
    donated_at: new Date().toISOString().slice(0, 10),
  })
  const [manualProof, setManualProof] = useState<File | null>(null)
  const [submittingManual, setSubmittingManual] = useState(false)
  // Details modal
  const [detailsDonation, setDetailsDonation] = useState<Donation | null>(null)
  const [proofBlobUrl, setProofBlobUrl] = useState<string | null>(null)
  const [proofMimeType, setProofMimeType] = useState<string | null>(null)

  const token = useAuthStore((state) => state.token)
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  const queryClient = useQueryClient()
  const { showSuccess, showError } = useToast()

  // Load the proof file with auth when the details modal opens
  useEffect(() => {
    if (!detailsDonation || !detailsDonation.proof_filename) {
      setProofBlobUrl(null)
      setProofMimeType(null)
      return
    }
    let cancelled = false
    let blobUrl: string | null = null
    ;(async () => {
      try {
        const resp = await fetch(`${API_URL}/api/donations/${detailsDonation.id}/proof`, {
          headers: { 'Authorization': `Bearer ${token}` },
        })
        if (!resp.ok) return
        const blob = await resp.blob()
        blobUrl = URL.createObjectURL(blob)
        if (!cancelled) {
          setProofBlobUrl(blobUrl)
          setProofMimeType(blob.type)
        }
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [detailsDonation, API_URL, token])

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

        const { status } = getStatusInfo(donation.frequency)
        const matchesStatus = statusFilter === 'all' || statusFilter === status

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

  // --- Manual donation submission ---
  const submitManualDonation = async (e: React.FormEvent) => {
    e.preventDefault()
    const amount = parseFloat(manualForm.amount)
    if (!manualForm.name.trim()) {
      showError('Validation', 'Donor name is required')
      return
    }
    if (!manualForm.email.trim()) {
      showError('Validation', 'Email is required')
      return
    }
    if (isNaN(amount) || amount <= 0) {
      showError('Validation', 'Amount must be greater than zero')
      return
    }

    setSubmittingManual(true)
    try {
      const formData = new FormData()
      formData.append('name', manualForm.name.trim())
      formData.append('email', manualForm.email.trim())
      formData.append('amount', String(amount))
      formData.append('payment_method', manualForm.payment_method)
      if (manualForm.notes.trim()) formData.append('notes', manualForm.notes.trim())
      if (manualForm.donated_at) formData.append('donated_at', manualForm.donated_at)
      if (manualProof) formData.append('proof', manualProof)

      const response = await fetch(`${API_URL}/api/donations/manual`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      })

      if (response.ok) {
        showSuccess('Success', 'Manual donation recorded')
        setShowManualModal(false)
        setManualForm({
          name: '', email: '', amount: '',
          payment_method: 'Cash', notes: '',
          donated_at: new Date().toISOString().slice(0, 10),
        })
        setManualProof(null)
        queryClient.invalidateQueries(['admin-donations'])
        queryClient.invalidateQueries('donation-stats')
      } else {
        const errorData = await response.json().catch(() => ({ detail: 'Failed to create donation' }))
        showError('Error', errorData.detail || 'Failed to create donation')
      }
    } catch (err) {
      showError('Error', 'Network error while creating donation')
    } finally {
      setSubmittingManual(false)
    }
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
              onClick={() => setShowManualModal(true)}
              className="btn-secondary flex items-center justify-center text-sm sm:text-base px-4 py-2 sm:px-6 sm:py-3"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Manual Donation
            </button>
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
              <option value="manual">Manual</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="abandoned">Abandoned</option>
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
                <th className="px-3 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredDonations.map((donation: Donation) => {
                const { status, label, color } = getStatusInfo(donation.frequency)
                const isValid = status === 'confirmed' || status === 'manual'
                return (
                  <tr key={donation.id} className={`hover:bg-gray-50 ${!isValid ? 'opacity-70' : ''}`}>
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
                      <div className={`text-xs sm:text-sm font-medium ${isValid ? 'text-green-600' : 'text-gray-500 line-through'}`}>
                        ${donation.amount.toLocaleString()}
                      </div>
                    </td>
                    <td className="px-3 sm:px-6 py-4">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full whitespace-nowrap ${color}`}>
                        {label}
                      </span>
                      {donation.payment_method && (
                        <span className="ml-2 text-xs text-gray-500">
                          via {donation.payment_method}
                        </span>
                      )}
                    </td>
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-xs sm:text-sm text-gray-500">
                      {new Date(donation.donated_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-right text-xs sm:text-sm">
                      <button
                        onClick={() => setDetailsDonation(donation)}
                        className="text-blue-600 hover:text-blue-800 inline-flex items-center"
                        title="View details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
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

      {/* Add Manual Donation Modal */}
      {showManualModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <form onSubmit={submitManualDonation} className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900 flex items-center">
                  <Plus className="w-5 h-5 mr-2 text-purple-600" />
                  Add Manual Donation
                </h3>
                <button type="button" onClick={() => setShowManualModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Donor name *</label>
                    <input
                      type="text"
                      required
                      value={manualForm.name}
                      onChange={(e) => setManualForm({ ...manualForm, name: e.target.value })}
                      className="input-field"
                      placeholder="Full name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                    <input
                      type="email"
                      required
                      value={manualForm.email}
                      onChange={(e) => setManualForm({ ...manualForm, email: e.target.value })}
                      className="input-field"
                      placeholder="donor@example.com"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Amount (USD) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={manualForm.amount}
                      onChange={(e) => setManualForm({ ...manualForm, amount: e.target.value })}
                      className="input-field"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Payment method *</label>
                    <select
                      value={manualForm.payment_method}
                      onChange={(e) => setManualForm({ ...manualForm, payment_method: e.target.value })}
                      className="input-field"
                    >
                      <option value="Cash">Cash</option>
                      <option value="Cheque">Cheque</option>
                      <option value="Credit Card">Credit Card</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Donation date</label>
                  <input
                    type="date"
                    value={manualForm.donated_at}
                    onChange={(e) => setManualForm({ ...manualForm, donated_at: e.target.value })}
                    className="input-field"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                  <textarea
                    rows={2}
                    value={manualForm.notes}
                    onChange={(e) => setManualForm({ ...manualForm, notes: e.target.value })}
                    className="input-field"
                    placeholder="e.g. handed over at the office, cheque #1234"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Transaction proof (optional)
                  </label>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => setManualProof(e.target.files?.[0] || null)}
                    className="block w-full text-sm text-gray-700 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:font-medium file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
                  />
                  {manualProof && (
                    <p className="text-xs text-gray-500 mt-1">
                      {manualProof.name} ({Math.round(manualProof.size / 1024)} KB)
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    Image or PDF, max 10 MB. Optional — used for cheques, receipts, etc.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingManual}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg font-medium"
                >
                  {submittingManual ? 'Saving...' : 'Add Donation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Donation Details Modal */}
      {detailsDonation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900">Donation Details</h3>
                <button onClick={() => setDetailsDonation(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-gray-500">Donor</dt>
                  <dd className="font-medium text-gray-900">{detailsDonation.name}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Email</dt>
                  <dd className="font-medium text-gray-900 break-all">{detailsDonation.email}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Amount</dt>
                  <dd className="font-semibold text-green-600">${detailsDonation.amount.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Type</dt>
                  <dd className="font-medium text-gray-900">{detailsDonation.frequency}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Date</dt>
                  <dd className="font-medium text-gray-900">{new Date(detailsDonation.donated_at).toLocaleString()}</dd>
                </div>
                {detailsDonation.payment_method && (
                  <div>
                    <dt className="text-gray-500">Payment method</dt>
                    <dd className="font-medium text-gray-900">{detailsDonation.payment_method}</dd>
                  </div>
                )}
                {detailsDonation.stripe_session_id && (
                  <div className="sm:col-span-2">
                    <dt className="text-gray-500">Stripe session ID</dt>
                    <dd className="font-mono text-xs text-gray-700 break-all">{detailsDonation.stripe_session_id}</dd>
                  </div>
                )}
                {detailsDonation.notes && (
                  <div className="sm:col-span-2">
                    <dt className="text-gray-500">Notes</dt>
                    <dd className="text-gray-900 bg-gray-50 p-3 rounded border border-gray-200 whitespace-pre-wrap">
                      {detailsDonation.notes}
                    </dd>
                  </div>
                )}
              </dl>

              {detailsDonation.proof_filename && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
                    <FileText className="w-4 h-4 mr-2 text-purple-600" />
                    Transaction proof
                  </h4>
                  {!proofBlobUrl ? (
                    <div className="text-sm text-gray-500">Loading proof...</div>
                  ) : proofMimeType === 'application/pdf' ? (
                    <a
                      href={proofBlobUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium"
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      Open PDF in new tab
                    </a>
                  ) : (
                    <img
                      src={proofBlobUrl}
                      alt="Transaction proof"
                      className="max-w-full h-auto rounded-lg border border-gray-200"
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminDonations
