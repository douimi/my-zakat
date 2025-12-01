import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Users, Trash2, Search, Filter, Calendar, Mail } from 'lucide-react'
import { volunteersAPI } from '../../utils/api'
import { useConfirmation } from '../../hooks/useConfirmation'
import type { Volunteer } from '../../types'

const AdminVolunteers = () => {
  const [searchQuery, setSearchQuery] = useState('')
  const [interestFilter, setInterestFilter] = useState<string>('')
  
  const queryClient = useQueryClient()
  const { confirm, ConfirmationDialog } = useConfirmation()
  
  const { data: volunteers, isLoading } = useQuery('admin-volunteers', volunteersAPI.getAll)
  
  const deleteMutation = useMutation(volunteersAPI.delete, {
    onSuccess: () => {
      queryClient.invalidateQueries('admin-volunteers')
    }
  })

  const handleDelete = async (id: number) => {
    const confirmed = await confirm({
      title: 'Delete Volunteer Submission',
      message: 'Are you sure you want to delete this volunteer submission? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger'
    })
    if (confirmed) {
      deleteMutation.mutate(id)
    }
  }

  const filteredVolunteers = volunteers?.filter((volunteer: Volunteer) => {
    const matchesSearch = !searchQuery || 
      volunteer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      volunteer.email.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesInterest = !interestFilter || volunteer.interest === interestFilter
    
    return matchesSearch && matchesInterest
  }) || []

  const getInterestColor = (interest: string) => {
    switch (interest?.toLowerCase()) {
      case 'outreach': return 'bg-blue-100 text-blue-800'
      case 'event': return 'bg-green-100 text-green-800'
      case 'fundraising': return 'bg-purple-100 text-purple-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const uniqueInterests = [...new Set(volunteers?.map((v: Volunteer) => v.interest) || [])]

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
            <h1 className="text-3xl font-bold text-gray-900">Volunteer Signups</h1>
            <p className="text-gray-600 mt-2">Manage volunteer applications and interest areas</p>
          </div>
        </div>
      </div>

      {/* Search and Filter Controls */}
      <div className="mb-6 flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field pl-10"
            />
          </div>
        </div>
        
        <div className="sm:w-64">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <select
              value={interestFilter}
              onChange={(e) => setInterestFilter(e.target.value)}
              className="input-field pl-10 appearance-none"
            >
              <option value="">All Interest Areas</option>
              {uniqueInterests.map((interest) => (
                <option key={interest} value={interest}>
                  {interest}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Volunteers Table */}
      <div className="card">
        {filteredVolunteers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Volunteer</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Interest Area</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Submitted</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-900">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredVolunteers.map((volunteer: Volunteer) => (
                  <tr key={volunteer.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-4 px-4">
                      <div>
                        <h3 className="font-semibold text-gray-900">{volunteer.name}</h3>
                        <div className="flex items-center text-sm text-gray-600 mt-1">
                          <Mail className="w-4 h-4 mr-1" />
                          <a 
                            href={`mailto:${volunteer.email}`}
                            className="hover:text-primary-600"
                          >
                            {volunteer.email}
                          </a>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getInterestColor(volunteer.interest)}`}>
                        {volunteer.interest}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center text-sm text-gray-600">
                        <Calendar className="w-4 h-4 mr-1" />
                        {new Date(volunteer.submitted_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={() => handleDelete(volunteer.id)}
                          disabled={deleteMutation.isLoading}
                          className="text-red-600 hover:text-red-700 p-2 rounded-lg hover:bg-red-50"
                          title="Delete volunteer submission"
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
            <Users className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {searchQuery || interestFilter ? 'No matching volunteers' : 'No volunteer signups yet'}
            </h3>
            <p className="text-gray-600">
              {searchQuery || interestFilter 
                ? 'Try adjusting your search or filter criteria.'
                : 'Volunteer applications will appear here when people sign up.'
              }
            </p>
          </div>
        )}
      </div>

      {/* Summary Stats */}
      {volunteers && volunteers.length > 0 && (
        <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="card">
            <div className="flex items-center">
              <Users className="w-8 h-8 text-blue-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Volunteers</p>
                <p className="text-2xl font-bold text-gray-900">{volunteers.length}</p>
              </div>
            </div>
          </div>
          
          {uniqueInterests.slice(0, 3).map((interest) => {
            const count = volunteers.filter((v: Volunteer) => v.interest === interest).length
            return (
              <div key={interest} className="card">
                <div className="flex items-center">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${getInterestColor(interest).replace('text-', 'text-white ').replace('bg-', 'bg-')}`}>
                    <Users className="w-5 h-5" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">{interest}</p>
                    <p className="text-2xl font-bold text-gray-900">{count}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Search Results Info */}
      {(searchQuery || interestFilter) && (
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Search className="w-5 h-5 text-blue-600 mr-2" />
              <span className="text-sm text-blue-800">
                Showing {filteredVolunteers.length} of {volunteers?.length || 0} volunteers
                {searchQuery && ` matching "${searchQuery}"`}
                {interestFilter && ` in ${interestFilter}`}
              </span>
            </div>
            <button
              onClick={() => {
                setSearchQuery('')
                setInterestFilter('')
              }}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Clear filters
            </button>
          </div>
        </div>
      )}

      <ConfirmationDialog />
    </div>
  )
}

export default AdminVolunteers

