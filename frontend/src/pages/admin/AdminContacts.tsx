import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { MessageSquare, Check, Trash2, Download, Eye, Send } from 'lucide-react'
import { contactAPI } from '../../utils/api'
import { useToast } from '../../contexts/ToastContext'
import { useConfirmation } from '../../hooks/useConfirmation'
import {
  PageHeader, FilterBar, Modal, LoadingBlock, ErrorState, EmptyState, StatusBadge, LongText,
} from '../../components/admin'
import type { ContactSubmission } from '../../types'

const AdminContacts = () => {
  const [searchTerm, setSearchTerm] = useState('')
  const [searchParams] = useSearchParams()
  const initialStatus = searchParams.get('status')
  const [statusFilter, setStatusFilter] = useState(
    initialStatus === 'resolved' ? 'resolved' : initialStatus === 'all' ? '' : 'pending',
  )
  const [selectedContacts, setSelectedContacts] = useState<number[]>([])
  const [selectedContact, setSelectedContact] = useState<ContactSubmission | null>(null)
  const [showReplyModal, setShowReplyModal] = useState(false)
  const [replyMessage, setReplyMessage] = useState('')
  const queryClient = useQueryClient()
  const { showSuccess, showError } = useToast()
  const { confirm, ConfirmationDialog } = useConfirmation()

  const { data: contacts, isLoading, isError, refetch } = useQuery(
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

  const replyMutation = useMutation(
    ({ id, message }: { id: number; message: string }) => contactAPI.reply(id, message),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('admin-contacts')
        setShowReplyModal(false)
        setReplyMessage('')
        setSelectedContact(null)
        showSuccess('Success', 'Reply email sent successfully!')
      },
      onError: (error: any) => {
        showError('Failed to Send Reply', error?.response?.data?.detail || 'An error occurred while sending the reply')
      }
    }
  )

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

  const handleDelete = async (id: number) => {
    const confirmed = await confirm({
      title: 'Delete Contact Submission',
      message: 'Are you sure you want to delete this contact submission? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger'
    })
    if (confirmed) {
      deleteMutation.mutate(id)
    }
  }

  const handleViewContact = (contact: ContactSubmission) => {
    setSelectedContact(contact)
  }

  const handleReply = (contact: ContactSubmission) => {
    setSelectedContact(contact)
    setShowReplyModal(true)
  }

  const handleSendReply = () => {
    if (!selectedContact || !replyMessage.trim()) {
      showError('Validation Error', 'Please enter a reply message')
      return
    }
    replyMutation.mutate({ id: selectedContact.id, message: replyMessage })
  }

  const handleBulkAction = async (action: 'resolve' | 'delete') => {
    if (selectedContacts.length === 0) return

    if (action === 'resolve') {
      selectedContacts.forEach(id => resolveMutation.mutate(id))
    } else if (action === 'delete') {
      const confirmed = await confirm({
        title: 'Delete Multiple Submissions',
        message: `Are you sure you want to delete ${selectedContacts.length} contact submission(s)? This action cannot be undone.`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        variant: 'danger'
      })
      if (confirmed) {
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

  const pendingCount = contacts?.filter((c: ContactSubmission) => !c.resolved).length || 0
  const resolvedCount = contacts?.filter((c: ContactSubmission) => c.resolved).length || 0
  const tabs: { key: string; label: string; count: number }[] = [
    { key: 'pending', label: 'Pending', count: pendingCount },
    { key: 'resolved', label: 'Resolved', count: resolvedCount },
    { key: '', label: 'All', count: contacts?.length || 0 },
  ]

  const closeReply = () => {
    setShowReplyModal(false)
    setReplyMessage('')
    setSelectedContact(null)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contacts"
        icon={MessageSquare}
        description="Messages sent through the contact form."
        actions={
          <button onClick={exportToCsv} className="btn-secondary gap-2">
            <Download className="w-4 h-4" aria-hidden="true" />
            Export CSV
          </button>
        }
      />

      {/* Status tabs */}
      <div className="border-b border-gray-200 overflow-x-auto">
        <div role="tablist" aria-label="Filter by status" className="-mb-px flex gap-6 sm:gap-8">
          {tabs.map((tab) => (
            <button
              key={tab.key || 'all'}
              type="button"
              role="tab"
              aria-selected={statusFilter === tab.key}
              onClick={() => { setStatusFilter(tab.key); setSelectedContacts([]) }}
              className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                statusFilter === tab.key
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
      </div>

      {/* Search and bulk actions */}
      <FilterBar
        search={searchTerm}
        onSearchChange={setSearchTerm}
        placeholder="Search contacts..."
        trailing={selectedContacts.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleBulkAction('resolve')}
              className="btn-secondary btn-sm gap-1"
            >
              <Check className="w-4 h-4" aria-hidden="true" />
              Resolve ({selectedContacts.length})
            </button>
            <button
              onClick={() => handleBulkAction('delete')}
              className="btn-secondary btn-sm gap-1 text-red-600 border-red-300 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
              Delete ({selectedContacts.length})
            </button>
          </div>
        ) : undefined}
      />

      {/* Contacts Table */}
      {isLoading ? (
        <LoadingBlock />
      ) : isError ? (
        <ErrorState message="Could not load contact submissions." onRetry={() => refetch()} />
      ) : filteredContacts.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No contacts found"
          body={searchTerm || statusFilter ? 'No contact submissions match your current filters.' : 'Messages from the contact form will appear here.'}
        />
      ) : (
      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 sm:px-6 py-3 text-left">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={selectedContacts.length === filteredContacts.length && filteredContacts.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                </th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">
                  Message
                </th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                  Date
                </th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredContacts.map((contact: ContactSubmission) => (
                <tr key={contact.id} className="hover:bg-gray-50">
                  <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      aria-label={`Select ${contact.name}`}
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
                  <td className="px-3 sm:px-6 py-4">
                    <div className="text-xs sm:text-sm font-medium text-gray-900 break-words">{contact.name}</div>
                    <div className="text-xs sm:text-sm text-gray-500 break-words">{contact.email}</div>
                    <div className="text-xs sm:text-sm text-gray-500 mt-1 md:hidden break-words line-clamp-2">
                      {contact.message}
                    </div>
                    <div className="text-xs text-gray-400 sm:hidden mt-1">
                      {new Date(contact.submitted_at).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-3 sm:px-6 py-4 hidden md:table-cell">
                    <div className="max-w-xs break-words">
                      <LongText text={contact.message} lines={2} />
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 hidden sm:table-cell">
                    {new Date(contact.submitted_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge tone={contact.resolved ? 'success' : 'warning'}>
                      {contact.resolved ? 'Resolved' : 'Pending'}
                    </StatusBadge>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleViewContact(contact)}
                        className="p-1.5 rounded text-primary-600 hover:text-primary-900 hover:bg-primary-50"
                        title="View details"
                        aria-label="View details"
                      >
                        <Eye className="w-4 h-4" aria-hidden="true" />
                      </button>
                      <button
                        onClick={() => handleReply(contact)}
                        className="p-1.5 rounded text-primary-600 hover:text-primary-900 hover:bg-primary-50"
                        title="Reply via email"
                        aria-label="Reply via email"
                      >
                        <Send className="w-4 h-4" aria-hidden="true" />
                      </button>
                      {!contact.resolved && (
                        <button
                          onClick={() => handleResolve(contact.id)}
                          className="p-1.5 rounded text-green-600 hover:text-green-900 hover:bg-green-50"
                          title="Mark as resolved"
                          aria-label="Mark as resolved"
                        >
                          <Check className="w-4 h-4" aria-hidden="true" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(contact.id)}
                        className="p-1.5 rounded text-red-600 hover:text-red-900 hover:bg-red-50"
                        title="Delete"
                        aria-label="Delete"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
      </div>
      )}

      {/* View Contact Modal */}
      {selectedContact && !showReplyModal && (
        <Modal
          title="Contact Details"
          onClose={() => setSelectedContact(null)}
          size="lg"
          closeOnOverlayClick
          footer={
            <>
              <button onClick={() => setSelectedContact(null)} className="btn-secondary">
                Done
              </button>
              <button onClick={() => setShowReplyModal(true)} className="btn-primary gap-2">
                <Send className="w-4 h-4" aria-hidden="true" />
                Reply via Email
              </button>
            </>
          }
        >
          <dl className="space-y-4">
            <div>
              <dt className="text-sm font-medium text-gray-500">Name</dt>
              <dd className="text-gray-900 font-medium">{selectedContact.name}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Email</dt>
              <dd className="text-gray-900">
                <a href={`mailto:${selectedContact.email}`} className="text-primary-600 hover:text-primary-700">
                  {selectedContact.email}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Submitted At</dt>
              <dd className="text-gray-900">{new Date(selectedContact.submitted_at).toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Status</dt>
              <dd>
                <StatusBadge tone={selectedContact.resolved ? 'success' : 'warning'}>
                  {selectedContact.resolved ? 'Resolved' : 'Pending'}
                </StatusBadge>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Message</dt>
              <dd className="mt-2 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-gray-900 whitespace-pre-wrap">{selectedContact.message}</p>
              </dd>
            </div>
          </dl>
        </Modal>
      )}

      {/* Reply Modal */}
      {showReplyModal && selectedContact && (
        <Modal
          title={`Reply to ${selectedContact.name}`}
          onClose={closeReply}
          size="lg"
          footer={
            <>
              <button
                onClick={() => {
                  setShowReplyModal(false)
                  setReplyMessage('')
                }}
                className="btn-secondary"
                disabled={replyMutation.isLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleSendReply}
                disabled={!replyMessage.trim() || replyMutation.isLoading}
                className="btn-primary gap-2"
              >
                {replyMutation.isLoading ? (
                  <>
                    <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" aria-hidden="true" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" aria-hidden="true" />
                    Send Reply
                  </>
                )}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-500">To</p>
              <p className="text-gray-900">
                <a href={`mailto:${selectedContact.email}`} className="text-primary-600 hover:text-primary-700">
                  {selectedContact.email}
                </a>
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Original Message</p>
              <div className="mt-2 p-4 bg-gray-50 rounded-lg border border-gray-200 max-h-40 overflow-y-auto">
                <p className="text-gray-700 text-sm whitespace-pre-wrap">{selectedContact.message}</p>
              </div>
            </div>
            <div>
              <label htmlFor="contact-reply" className="block text-sm font-medium text-gray-700 mb-2">
                Your Reply *
              </label>
              <textarea
                id="contact-reply"
                value={replyMessage}
                onChange={(e) => setReplyMessage(e.target.value)}
                rows={8}
                className="input-field"
                placeholder="Type your reply message here..."
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                This message will be sent via email to {selectedContact.email}
              </p>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmationDialog />
    </div>
  )
}

export default AdminContacts
