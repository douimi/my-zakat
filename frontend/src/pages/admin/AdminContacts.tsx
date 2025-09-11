import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { MessageSquare, Search, Check, Trash2, Mail, Download } from 'lucide-react'
import { contactAPI } from '../../utils/api'
import type { ContactSubmission } from '../../types'

const AdminContacts = () => {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedContacts, setSelectedContacts] = useState<number[]>([])
  const queryClient = useQueryClient()

  const { data: contacts, isLoading } = useQuery(
    'admin-contacts',
    () => contactAPI.getAll()
  )

  const resolveMutation = useMutation(contactAPI.resolve, {
    onSuccess: () => {
      queryClient.invalidateQueries('admin-contacts')
    }
  })

  const deleteMutation = useMutation(contactAPI.delete, {
    onSuccess: () => {
      queryClient.invalidateQueries('admin-contacts')
    }
  })

  const filteredContacts = contacts?.filter((contact: ContactSubmission) => {
    const matchesSearch = !searchTerm || 
      contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contact.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contact.message.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesStatus = !statusFilter || 
      (statusFilter === 'pending' && !contact.resolved) ||
      (statusFilter === 'resolved' && contact.resolved)

    return matchesSearch && matchesStatus
  }) || []

  const handleResolve = (id: number) => {
    resolveMutation.mutate(id)
  }

  const handleDelete = (id: number) => {
    if (confirm('Are you sure you want to delete this contact submission?')) {
      deleteMutation.mutate(id)
    }
  }

  const handleBulkAction = (action: 'resolve' | 'delete') => {
    if (selectedContacts.length === 0) return

    if (action === 'resolve') {
      selectedContacts.forEach(id => resolveMutation.mutate(id))
    } else if (action === 'delete') {
      if (confirm(`Are you sure you want to delete ${selectedContacts.length} contact submissions?`)) {
        selectedContacts.forEach(id => deleteMutation.mutate(id))
      }
    }
    setSelectedContacts([])
  }

  const toggleSelectAll = () => {
    if (selectedContacts.length === filteredContacts.length) {
      setSelectedContacts([])
    } else {
      setSelectedContacts(filteredContacts.map((c: ContactSubmission) => c.id))
    }
  }

  const exportToCsv = () => {
    const csvContent = [
      ['ID', 'Name', 'Email', 'Message', 'Date', 'Status'].join(','),
      ...filteredContacts.map((contact: ContactSubmission) => [
        contact.id,
        contact.name,
        contact.email,
        `"${contact.message.replace(/"/g, '""')}"`,
        new Date(contact.submitted_at).toLocaleDateString(),
        contact.resolved ? 'Resolved' : 'Pending'
      ].join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'contacts.csv'
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

  const pendingCount = contacts?.filter((c: ContactSubmission) => !c.resolved).length || 0
  const resolvedCount = contacts?.filter((c: ContactSubmission) => c.resolved).length || 0

  return (
    <div className="section-container">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <MessageSquare className="w-8 h-8 text-primary-600 mr-3" />
            <h1 className="text-3xl font-bold text-gray-900">Contact Submissions</h1>
          </div>
          <button
            onClick={exportToCsv}
            className="btn-primary flex items-center"
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </button>
        </div>
        <p className="text-gray-600">Manage and respond to contact form submissions</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="card">
          <div className="flex items-center">
            <MessageSquare className="w-8 h-8 text-orange-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Pending</p>
              <p className="text-2xl font-bold text-gray-900">{pendingCount}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <Check className="w-8 h-8 text-green-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Resolved</p>
              <p className="text-2xl font-bold text-gray-900">{resolvedCount}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <Mail className="w-8 h-8 text-blue-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total</p>
              <p className="text-2xl font-bold text-gray-900">{contacts?.length || 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Bulk Actions */}
      <div className="card mb-6">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="flex flex-col md:flex-row gap-4 flex-1">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search contacts..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input-field pl-10"
                />
              </div>
            </div>
            <div className="w-full md:w-48">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="input-field"
              >
                <option value="">All Status</option>
                <option value="pending">Pending</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
          </div>

          {selectedContacts.length > 0 && (
            <div className="flex gap-2">
              <button
                onClick={() => handleBulkAction('resolve')}
                className="btn-outline text-sm flex items-center"
              >
                <Check className="w-4 h-4 mr-1" />
                Resolve ({selectedContacts.length})
              </button>
              <button
                onClick={() => handleBulkAction('delete')}
                className="btn-outline text-sm text-red-600 border-red-300 hover:bg-red-50 flex items-center"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Delete ({selectedContacts.length})
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Contacts Table */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedContacts.length === filteredContacts.length && filteredContacts.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Message
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredContacts.map((contact: ContactSubmission) => (
                <tr key={contact.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedContacts.includes(contact.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedContacts([...selectedContacts, contact.id])
                        } else {
                          setSelectedContacts(selectedContacts.filter(id => id !== contact.id))
                        }
                      }}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {contact.name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {contact.email}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900 max-w-xs truncate">
                      {contact.message}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(contact.submitted_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      contact.resolved
                        ? 'bg-green-100 text-green-800'
                        : 'bg-orange-100 text-orange-800'
                    }`}>
                      {contact.resolved ? 'Resolved' : 'Pending'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center space-x-2">
                      {!contact.resolved && (
                        <button
                          onClick={() => handleResolve(contact.id)}
                          className="text-green-600 hover:text-green-900"
                          title="Mark as resolved"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(contact.id)}
                        className="text-red-600 hover:text-red-900"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredContacts.length === 0 && (
          <div className="text-center py-12">
            <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No contacts found</h3>
            <p className="text-gray-500">No contact submissions match your current filters.</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default AdminContacts
