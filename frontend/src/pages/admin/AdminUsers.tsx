import { useState, useEffect } from 'react'
import { Users, Eye, Trash2, UserCheck, UserX, UserPlus, Edit2, Key } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useToast } from '../../contexts/ToastContext'
import { useConfirmation } from '../../hooks/useConfirmation'
import {
  PageHeader, FilterBar, Modal, Collapsible, LoadingBlock, ErrorState, EmptyState, StatusBadge, type StatusTone,
} from '../../components/admin'

type Role = 'admin' | 'manager' | 'field_staff' | 'user'

interface User {
  id: number
  email: string
  name: string | null
  is_active: boolean
  is_admin: boolean
  role?: Role
  created_at: string
}

const roleOf = (u: User): Role => (u.role as Role) || (u.is_admin ? 'admin' : 'user')

const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  manager: 'Manager',
  field_staff: 'Field Staff',
  user: 'User',
}

const ROLE_TONE: Record<Role, StatusTone> = {
  admin: 'info',
  manager: 'warning',
  field_staff: 'accent',
  user: 'neutral',
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
  // A failed list load shows inline (with a retry), so it never looks like "no users".
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<Role | ''>('')
  const { confirm, ConfirmationDialog } = useConfirmation()

  // Create-user modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState<{ email: string; password: string; name: string; role: Role }>({
    email: '', password: '', name: '', role: 'user',
  })
  const [creating, setCreating] = useState(false)

  // Edit-user modal
  const [editUser, setEditUser] = useState<User | null>(null)
  const [editForm, setEditForm] = useState<{ email: string; name: string; role: Role }>({ email: '', name: '', role: 'user' })
  const [updating, setUpdating] = useState(false)

  // Reset-password modal
  const [resetUser, setResetUser] = useState<User | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetting, setResetting] = useState(false)

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
        setError(errorData.detail || 'Failed to fetch users')
      }
    } catch (error) {
      console.error('Error fetching users:', error)
      setError('Network error while fetching users')
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

  const deleteUser = async (userId: number) => {
    // Prevent admins from deleting themselves
    if (currentUser && currentUser.id === userId) {
      showError('Error', 'You cannot delete your own account')
      return
    }

    const user = users.find(u => u.id === userId)
    const confirmed = await confirm({
      title: 'Delete user',
      message: `Are you sure you want to delete ${user?.name || user?.email || 'this user'}? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger',
    })
    if (confirmed) executeDeleteUser(userId)
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

  // --- Admin user management actions ---

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (createForm.password.length < 8) {
      showError('Validation', 'Password must be at least 8 characters')
      return
    }
    setCreating(true)
    try {
      const response = await fetch(`${API_URL}/api/admin/users`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: createForm.email.trim(),
          password: createForm.password,
          name: createForm.name.trim() || null,
          role: createForm.role,
          is_admin: createForm.role === 'admin',
          is_active: true,
        }),
      })
      if (response.ok) {
        showSuccess('Success', 'User created successfully')
        setShowCreateModal(false)
        setCreateForm({ email: '', password: '', name: '', role: 'user' })
        fetchUsers()
      } else {
        const errorData = await response.json().catch(() => ({ detail: 'Failed to create user' }))
        showError('Error', errorData.detail || 'Failed to create user')
      }
    } catch (error) {
      showError('Error', 'Network error while creating user')
    } finally {
      setCreating(false)
    }
  }

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editUser) return
    setUpdating(true)
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${editUser.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: editForm.email.trim() || undefined,
          name: editForm.name.trim() || null,
          role: editForm.role,
        }),
      })
      if (response.ok) {
        showSuccess('Success', 'User updated successfully')
        setEditUser(null)
        fetchUsers()
      } else {
        const errorData = await response.json().catch(() => ({ detail: 'Failed to update user' }))
        showError('Error', errorData.detail || 'Failed to update user')
      }
    } catch (error) {
      showError('Error', 'Network error while updating user')
    } finally {
      setUpdating(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetUser) return
    if (resetPassword.length < 8) {
      showError('Validation', 'Password must be at least 8 characters')
      return
    }
    setResetting(true)
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${resetUser.id}/reset-password`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ new_password: resetPassword }),
      })
      if (response.ok) {
        const data = await response.json()
        showSuccess('Success', data.message || 'Password reset successfully')
        setResetUser(null)
        setResetPassword('')
      } else {
        const errorData = await response.json().catch(() => ({ detail: 'Failed to reset password' }))
        showError('Error', errorData.detail || 'Failed to reset password')
      }
    } catch (error) {
      showError('Error', 'Network error while resetting password')
    } finally {
      setResetting(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const q = search.trim().toLowerCase()
  const filteredUsers = users.filter((u) => {
    const matchesSearch = !q || (u.name || '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    const matchesRole = !roleFilter || roleOf(u) === roleFilter
    return matchesSearch && matchesRole
  })

  const inputClass = 'input-field'

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        icon={Users}
        count={users.length}
        actions={
          <button onClick={() => setShowCreateModal(true)} className="btn-primary gap-2">
            <UserPlus className="w-5 h-5" aria-hidden="true" />
            Create User
          </button>
        }
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search by name or email..."
        trailing={(q || roleFilter) ? `${filteredUsers.length} of ${users.length} shown` : undefined}
      >
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as Role | '')}
          className="input-field sm:w-48"
          aria-label="Role"
        >
          <option value="">All roles</option>
          {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
            <option key={r} value={r}>{ROLE_LABEL[r]}</option>
          ))}
        </select>
      </FilterBar>

      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorState message={error} onRetry={() => { setIsLoading(true); fetchUsers() }} />
      ) : filteredUsers.length === 0 ? (
        <EmptyState
          icon={Users}
          title={users.length === 0 ? 'No users yet' : 'No matching users'}
          body={users.length === 0 ? undefined : 'Try a different name, email or role.'}
        />
      ) : (
      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                  Email
                </th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">
                  Joined
                </th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredUsers.map((user) => {
                const isSelf = currentUser?.id === user.id
                const toggleTitle = isSelf ? 'Cannot modify your own account' : user.is_active ? 'Deactivate' : 'Activate'
                const deleteTitle = isSelf ? 'Cannot delete your own account' : 'Delete User'
                return (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-3 sm:px-6 py-4">
                    <div className="text-xs sm:text-sm font-medium text-gray-900 break-words">
                      {user.name || 'N/A'}
                    </div>
                    <div className="text-xs sm:text-sm text-gray-500 sm:hidden mt-1 break-words">
                      {user.email}
                    </div>
                  </td>
                  <td className="px-3 sm:px-6 py-4 whitespace-nowrap hidden sm:table-cell">
                    <div className="text-xs sm:text-sm text-gray-600 break-words">{user.email}</div>
                  </td>
                  <td className="px-3 sm:px-6 py-4">
                    <StatusBadge tone={user.is_active ? 'success' : 'danger'}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </StatusBadge>
                  </td>
                  <td className="px-3 sm:px-6 py-4">
                    <StatusBadge tone={ROLE_TONE[roleOf(user)]}>{ROLE_LABEL[roleOf(user)]}</StatusBadge>
                  </td>
                  <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-xs sm:text-sm text-gray-600 hidden md:table-cell">
                    {formatDate(user.created_at)}
                  </td>
                  <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-xs sm:text-sm font-medium">
                    <div className="flex items-center gap-1">
                    <button
                      onClick={() => fetchUserDetails(user.id)}
                      className="p-1.5 rounded text-primary-600 hover:text-primary-900 hover:bg-primary-50"
                      title="View Details"
                      aria-label="View Details"
                    >
                      <Eye className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => {
                        setEditUser(user)
                        setEditForm({ email: user.email, name: user.name || '', role: roleOf(user) })
                      }}
                      className="p-1.5 rounded text-primary-600 hover:text-primary-900 hover:bg-primary-50"
                      title="Edit User"
                      aria-label="Edit User"
                    >
                      <Edit2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => {
                        setResetUser(user)
                        setResetPassword('')
                      }}
                      className="p-1.5 rounded text-orange-600 hover:text-orange-900 hover:bg-orange-50"
                      title="Reset Password"
                      aria-label="Reset Password"
                    >
                      <Key className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => toggleUserActive(user.id)}
                      disabled={isSelf}
                      className={
                        isSelf
                          ? 'p-1.5 text-gray-400 cursor-not-allowed'
                          : user.is_active
                            ? 'p-1.5 rounded text-yellow-700 hover:text-yellow-900 hover:bg-yellow-50'
                            : 'p-1.5 rounded text-green-600 hover:text-green-900 hover:bg-green-50'
                      }
                      title={toggleTitle}
                      aria-label={toggleTitle}
                    >
                      {user.is_active ? <UserX className="w-4 h-4" aria-hidden="true" /> : <UserCheck className="w-4 h-4" aria-hidden="true" />}
                    </button>
                    <button
                      onClick={() => deleteUser(user.id)}
                      disabled={isSelf}
                      className={
                        isSelf
                          ? 'p-1.5 text-gray-400 cursor-not-allowed'
                          : 'p-1.5 rounded text-red-600 hover:text-red-900 hover:bg-red-50'
                      }
                      title={deleteTitle}
                      aria-label={deleteTitle}
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                    </div>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
      </div>
      )}

      {/* User Details Modal */}
      {selectedUser && (
        <Modal title="User Details" onClose={() => setSelectedUser(null)} size="xl" closeOnOverlayClick>
              {isLoadingDetails ? (
                <LoadingBlock />
              ) : (
                <div className="space-y-6">
                  {/* User Info */}
                  <dl className="bg-gray-50 p-4 rounded-lg grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <dt className="text-sm text-gray-600">Name</dt>
                      <dd className="font-medium">{selectedUser.user.name || 'N/A'}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-600">Email</dt>
                      <dd className="font-medium break-words">{selectedUser.user.email}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-600">Status</dt>
                      <dd className="mt-0.5">
                        <StatusBadge tone={selectedUser.user.is_active ? 'success' : 'danger'}>
                          {selectedUser.user.is_active ? 'Active' : 'Inactive'}
                        </StatusBadge>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-600">Role</dt>
                      <dd className="mt-0.5">
                        <StatusBadge tone={ROLE_TONE[roleOf(selectedUser.user)]}>
                          {ROLE_LABEL[roleOf(selectedUser.user)]}
                        </StatusBadge>
                      </dd>
                    </div>
                  </dl>

                  {/* Giving, in one line */}
                  <p className="text-sm text-gray-700">
                    <span className="font-semibold text-gray-900">${selectedUser.stats.total_donated.toFixed(2)}</span> donated
                    {' · '}{selectedUser.stats.donation_count} donation{selectedUser.stats.donation_count === 1 ? '' : 's'}
                    {' · '}{selectedUser.stats.active_subscriptions} active subscription{selectedUser.stats.active_subscriptions === 1 ? '' : 's'}
                  </p>

                  {(selectedUser.donations.length > 0 || selectedUser.subscriptions.length > 0) && (
                    <div className="rounded-lg border border-gray-200 overflow-hidden">
                      {selectedUser.donations.length > 0 && (
                        <Collapsible
                          title={`Recent donations (${Math.min(selectedUser.donations.length, 5)})`}
                          preview={`Latest: $${selectedUser.donations[0].amount.toFixed(2)} on ${formatDate(selectedUser.donations[0].donated_at)}`}
                        >
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
                                    <td className="px-4 py-2 text-sm font-medium text-primary-700">
                                      ${donation.amount.toFixed(2)}
                                    </td>
                                    <td className="px-4 py-2 text-sm text-gray-600">{donation.frequency}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </Collapsible>
                      )}
                      {selectedUser.subscriptions.length > 0 && (
                        <Collapsible title={`Subscriptions (${selectedUser.subscriptions.length})`}>
                          <div className="space-y-2">
                            {selectedUser.subscriptions.map((sub) => (
                              <div key={sub.id} className="border border-gray-200 rounded-lg p-3 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="font-medium">{sub.purpose}</p>
                                  <p className="text-sm text-gray-600">${sub.amount} / {sub.interval}</p>
                                </div>
                                <StatusBadge tone={sub.status === 'active' ? 'success' : sub.status === 'canceled' ? 'danger' : 'warning'}>
                                  {sub.status}
                                </StatusBadge>
                              </div>
                            ))}
                          </div>
                        </Collapsible>
                      )}
                    </div>
                  )}
                </div>
              )}
        </Modal>
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <Modal
          title="Create New User"
          onClose={() => setShowCreateModal(false)}
          size="sm"
          footer={
            <>
              <button type="button" onClick={() => setShowCreateModal(false)} className="btn-secondary">
                Cancel
              </button>
              <button type="submit" form="create-user-form" disabled={creating} className="btn-primary">
                {creating ? 'Creating...' : 'Create User'}
              </button>
            </>
          }
        >
            <form id="create-user-form" onSubmit={handleCreateUser} className="space-y-4">
                <div>
                  <label htmlFor="create-user-email" className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input
                    id="create-user-email"
                    type="email"
                    required
                    value={createForm.email}
                    onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                    className={inputClass}
                    placeholder="user@example.com"
                  />
                </div>

                <div>
                  <label htmlFor="create-user-name" className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    id="create-user-name"
                    type="text"
                    value={createForm.name}
                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                    className={inputClass}
                    placeholder="Full name (optional)"
                  />
                </div>

                <div>
                  <label htmlFor="create-user-password" className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                  <input
                    id="create-user-password"
                    type="password"
                    required
                    minLength={8}
                    value={createForm.password}
                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                    className={inputClass}
                    placeholder="At least 8 characters"
                  />
                </div>

                <div>
                  <label htmlFor="create-user-role" className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
                  <select
                    id="create-user-role"
                    value={createForm.role}
                    onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as Role })}
                    className={inputClass}
                  >
                    <option value="user">User — public donor / signup</option>
                    <option value="manager">Manager — contacts, volunteers, stories (with approval)</option>
                    <option value="field_staff">Field Staff — media workspace only</option>
                    <option value="admin">Admin — full access</option>
                  </select>
                </div>
            </form>
        </Modal>
      )}

      {/* Edit User Modal */}
      {editUser && (
        <Modal
          title="Edit User"
          onClose={() => setEditUser(null)}
          size="sm"
          footer={
            <>
              <button type="button" onClick={() => setEditUser(null)} className="btn-secondary">
                Cancel
              </button>
              <button type="submit" form="edit-user-form" disabled={updating} className="btn-primary">
                {updating ? 'Saving...' : 'Save Changes'}
              </button>
            </>
          }
        >
            <form id="edit-user-form" onSubmit={handleUpdateUser} className="space-y-4">
                <div>
                  <label htmlFor="edit-user-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    id="edit-user-email"
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="edit-user-name" className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    id="edit-user-name"
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className={inputClass}
                    placeholder="Full name"
                  />
                </div>

                <div>
                  <label htmlFor="edit-user-role" className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                  <select
                    id="edit-user-role"
                    value={editForm.role}
                    onChange={(e) => setEditForm({ ...editForm, role: e.target.value as Role })}
                    disabled={currentUser?.id === editUser?.id}
                    className={`${inputClass} disabled:bg-gray-100`}
                  >
                    <option value="user">User</option>
                    <option value="manager">Manager</option>
                    <option value="field_staff">Field Staff</option>
                    <option value="admin">Admin</option>
                  </select>
                  {currentUser?.id === editUser?.id && (
                    <p className="text-xs text-gray-500 mt-1">You can't change your own role.</p>
                  )}
                </div>

                <p className="text-xs text-gray-500">
                  To change the password, use the <strong>Reset Password</strong> action instead.
                </p>
            </form>
        </Modal>
      )}

      {/* Reset Password Modal */}
      {resetUser && (
        <Modal
          title="Reset Password"
          onClose={() => { setResetUser(null); setResetPassword('') }}
          size="sm"
          footer={
            <>
              <button type="button" onClick={() => { setResetUser(null); setResetPassword('') }} className="btn-secondary">
                Cancel
              </button>
              <button type="submit" form="reset-password-form" disabled={resetting} className="btn-primary">
                {resetting ? 'Resetting...' : 'Reset Password'}
              </button>
            </>
          }
        >
            <form id="reset-password-form" onSubmit={handleResetPassword} className="space-y-4">
              <div className="alert-warning">
                <p className="text-sm">
                  Setting a new password for <strong>{resetUser.name || resetUser.email}</strong>.
                  The user will need this new password to log in.
                </p>
              </div>

              <div>
                <label htmlFor="reset-password" className="block text-sm font-medium text-gray-700 mb-1">New Password *</label>
                <input
                  id="reset-password"
                  type="text"
                  required
                  minLength={8}
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  className={inputClass}
                  placeholder="At least 8 characters"
                  autoFocus
                />
                <p className="text-xs text-gray-500 mt-1">
                  Make sure to share this password securely with the user.
                </p>
              </div>
            </form>
        </Modal>
      )}

      <ConfirmationDialog />
    </div>
  )
}

export default AdminUsers

