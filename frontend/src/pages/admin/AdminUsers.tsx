import { useState, useEffect } from 'react'
import { Users, Shield, ShieldOff, Eye, Trash2, UserCheck, UserX, X } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useToast } from '../../contexts/ToastContext'

interface User {
  id: number
  email: string
  name: string | null
  is_active: boolean
  is_admin: boolean
  created_at: string
}

interface UserDetails {
  user: User
  donations: Array<{
    id: number
    amount: number
    frequency: string
    donated_at: string
  }>
  subscriptions: Array<{
    id: number
    stripe_subscription_id: string
    amount: number
    purpose: string
    interval: string
    status: string
    created_at: string
  }>
  stats: {
    total_donated: number
    donation_count: number
    active_subscriptions: number
  }
}

const AdminUsers = () => {
  const [users, setUsers] = useState<User[]>([])
  const [selectedUser, setSelectedUser] = useState<UserDetails | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingDetails, setIsLoadingDetails] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<{
    type: 'admin' | 'delete'
    userId: number
    userName: string
    action: string
  } | null>(null)
  const token = useAuthStore((state) => state.token)
  const currentUser = useAuthStore((state) => state.user)
  const { showSuccess, showError } = useToast()
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      const response = await fetch(`${API_URL}/api/admin/users`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      if (response.ok) {
        const data = await response.json()
        setUsers(data)
        setError(null)
      } else {
        if (response.status === 401) {
          // Clear invalid token and redirect to login
          localStorage.removeItem('auth_token')
          localStorage.removeItem('user_data')
          window.location.href = '/login'
          return
        }
        const errorData = await response.json().catch(() => ({ detail: 'Failed to fetch users' }))
        showError('Error', errorData.detail || 'Failed to fetch users')
      }
    } catch (error) {
      console.error('Error fetching users:', error)
      showError('Error', 'Network error while fetching users')
    } finally {
      setIsLoading(false)
    }
  }

  const fetchUserDetails = async (userId: number) => {
    setIsLoadingDetails(true)
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${userId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      if (response.ok) {
        const data = await response.json()
        setSelectedUser(data)
      } else {
        const errorData = await response.json().catch(() => ({ detail: 'Failed to fetch user details' }))
        showError('Error', errorData.detail || 'Failed to fetch user details')
      }
    } catch (error) {
      console.error('Error fetching user details:', error)
      showError('Error', 'Network error while fetching user details')
    } finally {
      setIsLoadingDetails(false)
    }
  }

  const toggleUserActive = async (userId: number) => {
    // Prevent admins from deactivating themselves
    if (currentUser && currentUser.id === userId) {
      showError('Error', 'You cannot deactivate your own account')
      return
    }

    try {
      const response = await fetch(`${API_URL}/api/admin/users/${userId}/toggle-active`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      if (response.ok) {
        const data = await response.json()
        showSuccess(data.message || 'User status updated successfully')
        fetchUsers()
        if (selectedUser && selectedUser.user.id === userId) {
          fetchUserDetails(userId)
        }
      } else {
        const errorData = await response.json().catch(() => ({ detail: 'Failed to update user status' }))
        showError('Error', errorData.detail || 'Failed to update user status')
      }
    } catch (error) {
      console.error('Error toggling user active status:', error)
      showError('Error', 'Network error while updating user status')
    }
  }

  const toggleUserAdmin = async (userId: number) => {
    // Prevent admins from removing their own admin privileges
    if (currentUser && currentUser.id === userId) {
      showError('Error', 'You cannot modify your own admin privileges')
      return
    }

    const user = users.find(u => u.id === userId)
    const action = user?.is_admin ? 'remove admin privileges from' : 'grant admin privileges to'
    
    // Show confirmation modal instead of browser confirm
    setConfirmAction({
      type: 'admin',
      userId,
      userName: user?.name || user?.email || 'this user',
      action
    })
    return
  }

  const executeToggleUserAdmin = async (userId: number) => {

    try {
      const response = await fetch(`${API_URL}/api/admin/users/${userId}/toggle-admin`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      if (response.ok) {
        const data = await response.json()
        showSuccess('Success', data.message || 'User admin status updated successfully')
        fetchUsers()
        if (selectedUser && selectedUser.user.id === userId) {
          fetchUserDetails(userId)
        }
      } else {
        const errorData = await response.json().catch(() => ({ detail: 'Failed to update admin status' }))
        showError('Error', errorData.detail || 'Failed to update admin status')
      }
    } catch (error) {
      console.error('Error toggling user admin status:', error)
      showError('Error', 'Network error while updating admin status')
    }
  }

  const deleteUser = async (userId: number) => {
    // Prevent admins from deleting themselves
    if (currentUser && currentUser.id === userId) {
      showError('Error', 'You cannot delete your own account')
      return
    }

    const user = users.find(u => u.id === userId)
    
    // Show confirmation modal instead of browser confirm
    setConfirmAction({
      type: 'delete',
      userId,
      userName: user?.name || user?.email || 'this user',
      action: 'delete'
    })
    return
  }

  const executeDeleteUser = async (userId: number) => {

    try {
      const response = await fetch(`${API_URL}/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      if (response.ok) {
        const data = await response.json()
        showSuccess('Success', data.message || 'User deleted successfully')
        fetchUsers()
        setSelectedUser(null)
      } else {
        const errorData = await response.json().catch(() => ({ detail: 'Failed to delete user' }))
        showError('Error', errorData.detail || 'Failed to delete user')
      }
    } catch (error) {
      console.error('Error deleting user:', error)
      showError('Error', 'Network error while deleting user')
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <Users className="w-8 h-8 mr-3 text-blue-600" />
          User Management
        </h1>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
          {successMessage}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Joined
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {user.name || 'N/A'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{user.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        user.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        user.is_admin
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {user.is_admin ? 'Admin' : 'User'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {formatDate(user.created_at)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <button
                      onClick={() => fetchUserDetails(user.id)}
                      className="text-blue-600 hover:text-blue-900"
                      title="View Details"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => toggleUserActive(user.id)}
                      disabled={currentUser?.id === user.id}
                      className={
                        currentUser?.id === user.id
                          ? 'text-gray-400 cursor-not-allowed'
                          : user.is_active 
                            ? 'text-yellow-600 hover:text-yellow-900' 
                            : 'text-green-600 hover:text-green-900'
                      }
                      title={
                        currentUser?.id === user.id
                          ? 'Cannot modify your own account'
                          : user.is_active ? 'Deactivate' : 'Activate'
                      }
                    >
                      {user.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => toggleUserAdmin(user.id)}
                      disabled={currentUser?.id === user.id}
                      className={
                        currentUser?.id === user.id
                          ? 'text-gray-400 cursor-not-allowed'
                          : user.is_admin 
                            ? 'text-purple-600 hover:text-purple-900' 
                            : 'text-gray-600 hover:text-gray-900'
                      }
                      title={
                        currentUser?.id === user.id
                          ? 'Cannot modify your own privileges'
                          : user.is_admin ? 'Remove Admin' : 'Make Admin'
                      }
                    >
                      {user.is_admin ? <ShieldOff className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => deleteUser(user.id)}
                      disabled={currentUser?.id === user.id}
                      className={
                        currentUser?.id === user.id
                          ? 'text-gray-400 cursor-not-allowed'
                          : 'text-red-600 hover:text-red-900'
                      }
                      title={
                        currentUser?.id === user.id
                          ? 'Cannot delete your own account'
                          : 'Delete User'
                      }
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Details Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">User Details</h2>
                <button
                  onClick={() => setSelectedUser(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {isLoadingDetails ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* User Info */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="text-lg font-semibold mb-3">User Information</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Name</p>
                        <p className="font-medium">{selectedUser.user.name || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Email</p>
                        <p className="font-medium">{selectedUser.user.email}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Status</p>
                        <p className="font-medium">
                          {selectedUser.user.is_active ? '✅ Active' : '❌ Inactive'}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Role</p>
                        <p className="font-medium">
                          {selectedUser.user.is_admin ? '👑 Admin' : '👤 User'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-blue-50 p-4 rounded-lg text-center">
                      <p className="text-sm text-gray-600 mb-1">Total Donated</p>
                      <p className="text-2xl font-bold text-blue-600">
                        ${selectedUser.stats.total_donated.toFixed(2)}
                      </p>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg text-center">
                      <p className="text-sm text-gray-600 mb-1">Donations</p>
                      <p className="text-2xl font-bold text-green-600">
                        {selectedUser.stats.donation_count}
                      </p>
                    </div>
                    <div className="bg-purple-50 p-4 rounded-lg text-center">
                      <p className="text-sm text-gray-600 mb-1">Active Subscriptions</p>
                      <p className="text-2xl font-bold text-purple-600">
                        {selectedUser.stats.active_subscriptions}
                      </p>
                    </div>
                  </div>

                  {/* Donations */}
                  {selectedUser.donations.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold mb-3">Recent Donations</h3>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Date</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Amount</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Type</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {selectedUser.donations.slice(0, 5).map((donation) => (
                              <tr key={donation.id}>
                                <td className="px-4 py-2 text-sm">{formatDate(donation.donated_at)}</td>
                                <td className="px-4 py-2 text-sm font-medium text-blue-600">
                                  ${donation.amount.toFixed(2)}
                                </td>
                                <td className="px-4 py-2 text-sm text-gray-600">{donation.frequency}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Subscriptions */}
                  {selectedUser.subscriptions.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold mb-3">Subscriptions</h3>
                      <div className="space-y-2">
                        {selectedUser.subscriptions.map((sub) => (
                          <div key={sub.id} className="border border-gray-200 rounded-lg p-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium">{sub.purpose}</p>
                                <p className="text-sm text-gray-600">
                                  ${sub.amount} / {sub.interval}
                                </p>
                              </div>
                              <span
                                className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                  sub.status === 'active'
                                    ? 'bg-green-100 text-green-800'
                                    : sub.status === 'canceled'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-yellow-100 text-yellow-800'
                                }`}
                              >
                                {sub.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Confirm Action
              </h3>
              <p className="text-gray-600 mb-6">
                Are you sure you want to {confirmAction.action} <strong>{confirmAction.userName}</strong>?
                {confirmAction.type === 'delete' && (
                  <span className="block mt-2 text-red-600 font-medium">
                    This action cannot be undone.
                  </span>
                )}
              </p>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setConfirmAction(null)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (confirmAction.type === 'admin') {
                      executeToggleUserAdmin(confirmAction.userId)
                    } else if (confirmAction.type === 'delete') {
                      executeDeleteUser(confirmAction.userId)
                    }
                    setConfirmAction(null)
                  }}
                  className={`px-4 py-2 rounded-lg font-medium text-white ${
                    confirmAction.type === 'delete'
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {confirmAction.type === 'delete' ? 'Delete' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminUsers

