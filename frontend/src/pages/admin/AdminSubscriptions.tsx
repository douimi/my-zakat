import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Mail, Trash2, Search, Send, User, Phone, Calendar, MessageSquare } from 'lucide-react'
import { subscriptionsAPI } from '../../utils/api'
import type { Subscription } from '../../types'

interface NewsletterData {
  subject: string
  body: string
}

const AdminSubscriptions = () => {
  const [searchQuery, setSearchQuery] = useState('')
  const [showNewsletterForm, setShowNewsletterForm] = useState(false)
  const [newsletterData, setNewsletterData] = useState<NewsletterData>({
    subject: '',
    body: ''
  })
  
  const queryClient = useQueryClient()
  
  const { data: subscriptions, isLoading } = useQuery('admin-subscriptions', subscriptionsAPI.getAll)
  
  const deleteMutation = useMutation(subscriptionsAPI.delete, {
    onSuccess: () => {
      queryClient.invalidateQueries('admin-subscriptions')
    }
  })

  const newsletterMutation = useMutation(subscriptionsAPI.sendNewsletter, {
    onSuccess: () => {
      setShowNewsletterForm(false)
      setNewsletterData({ subject: '', body: '' })
      alert('Newsletter sent successfully!')
    },
    onError: (error: any) => {
      alert(`Failed to send newsletter: ${error.message}`)
    }
  })

  const handleDelete = (id: number) => {
    if (window.confirm('Are you sure you want to delete this subscription?')) {
      deleteMutation.mutate(id)
    }
  }

  const handleSendNewsletter = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newsletterData.subject.trim() || !newsletterData.body.trim()) {
      alert('Please fill in both subject and message body.')
      return
    }
    newsletterMutation.mutate(newsletterData)
  }

  const filteredSubscriptions = subscriptions?.filter((subscription: Subscription) => {
    const matchesSearch = !searchQuery || 
      (subscription.name && subscription.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      subscription.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (subscription.phone && subscription.phone.includes(searchQuery))
    
    return matchesSearch
  }) || []

  const emailSubscribers = subscriptions?.filter((s: Subscription) => s.wants_email).length || 0
  const smsSubscribers = subscriptions?.filter((s: Subscription) => s.wants_sms).length || 0

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Newsletter & SMS Subscribers</h1>
            <p className="text-gray-600 mt-2">Manage your subscriber list and send newsletters</p>
          </div>
          <button
            onClick={() => setShowNewsletterForm(true)}
            className="btn-primary flex items-center"
          >
            <Send className="w-4 h-4 mr-2" />
            Send Newsletter
          </button>
        </div>
      </div>

      {/* Newsletter Form Modal */}
      {showNewsletterForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Send Newsletter to Subscribers
            </h2>
            
            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                This newsletter will be sent to {emailSubscribers} email subscribers.
              </p>
            </div>
            
            <form onSubmit={handleSendNewsletter} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Subject *
                </label>
                <input
                  type="text"
                  value={newsletterData.subject}
                  onChange={(e) => setNewsletterData(prev => ({ ...prev, subject: e.target.value }))}
                  className="input-field"
                  placeholder="Enter newsletter subject..."
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Message *
                </label>
                <textarea
                  value={newsletterData.body}
                  onChange={(e) => setNewsletterData(prev => ({ ...prev, body: e.target.value }))}
                  rows={8}
                  className="input-field"
                  placeholder="Enter your newsletter message..."
                  required
                />
              </div>

              <div className="flex justify-end space-x-4 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewsletterForm(false)
                    setNewsletterData({ subject: '', body: '' })
                  }}
                  className="btn-outline"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={newsletterMutation.isLoading}
                  className="btn-primary flex items-center"
                >
                  {newsletterMutation.isLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Send Newsletter
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Search Control */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by name, email, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field pl-10"
          />
        </div>
      </div>

      {/* Subscriptions Table */}
      <div className="card">
        {filteredSubscriptions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Subscriber</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Contact Info</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Preferences</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Subscribed</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-900">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSubscriptions.map((subscription: Subscription) => (
                  <tr key={subscription.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-4 px-4">
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center mr-3">
                          <User className="w-5 h-5 text-primary-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">
                            {subscription.name || 'Anonymous'}
                          </h3>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="space-y-1">
                        <div className="flex items-center text-sm text-gray-600">
                          <Mail className="w-4 h-4 mr-1" />
                          <a 
                            href={`mailto:${subscription.email}`}
                            className="hover:text-primary-600"
                          >
                            {subscription.email}
                          </a>
                        </div>
                        {subscription.phone && (
                          <div className="flex items-center text-sm text-gray-600">
                            <Phone className="w-4 h-4 mr-1" />
                            <a 
                              href={`tel:${subscription.phone}`}
                              className="hover:text-primary-600"
                            >
                              {subscription.phone}
                            </a>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center space-x-3">
                        {subscription.wants_email && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <Mail className="w-3 h-3 mr-1" />
                            Email
                          </span>
                        )}
                        {subscription.wants_sms && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            <MessageSquare className="w-3 h-3 mr-1" />
                            SMS
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center text-sm text-gray-600">
                        <Calendar className="w-4 h-4 mr-1" />
                        {new Date(subscription.subscribed_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={() => handleDelete(subscription.id)}
                          disabled={deleteMutation.isLoading}
                          className="text-red-600 hover:text-red-700 p-2 rounded-lg hover:bg-red-50"
                          title="Delete subscription"
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
        ) : (
          <div className="text-center py-12">
            <Mail className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {searchQuery ? 'No matching subscribers' : 'No subscribers yet'}
            </h3>
            <p className="text-gray-600">
              {searchQuery 
                ? 'Try adjusting your search criteria.'
                : 'Newsletter and SMS subscribers will appear here.'
              }
            </p>
          </div>
        )}
      </div>

      {/* Summary Stats */}
      {subscriptions && subscriptions.length > 0 && (
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="card">
            <div className="flex items-center">
              <Mail className="w-8 h-8 text-blue-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Subscribers</p>
                <p className="text-2xl font-bold text-gray-900">{subscriptions.length}</p>
              </div>
            </div>
          </div>
          
          <div className="card">
            <div className="flex items-center">
              <Mail className="w-8 h-8 text-green-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Email Subscribers</p>
                <p className="text-2xl font-bold text-gray-900">{emailSubscribers}</p>
              </div>
            </div>
          </div>
          
          <div className="card">
            <div className="flex items-center">
              <MessageSquare className="w-8 h-8 text-purple-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">SMS Subscribers</p>
                <p className="text-2xl font-bold text-gray-900">{smsSubscribers}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search Results Info */}
      {searchQuery && (
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Search className="w-5 h-5 text-blue-600 mr-2" />
              <span className="text-sm text-blue-800">
                Showing {filteredSubscriptions.length} of {subscriptions?.length || 0} subscribers
                matching "{searchQuery}"
              </span>
            </div>
            <button
              onClick={() => setSearchQuery('')}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Clear search
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminSubscriptions

