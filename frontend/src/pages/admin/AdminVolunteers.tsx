import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { UserPlus, Trash2, Calendar, Mail } from 'lucide-react'
import { volunteersAPI } from '../../utils/api'
import { useConfirmation } from '../../hooks/useConfirmation'
import {
  PageHeader, FilterBar, LoadingBlock, ErrorState, EmptyState, StatusBadge, type StatusTone,
} from '../../components/admin'
import type { Volunteer } from '../../types'

const interestTone = (interest: string): StatusTone => {
  switch (interest?.toLowerCase()) {
    case 'outreach': return 'info'
    case 'event': return 'success'
    case 'fundraising': return 'accent'
    default: return 'neutral'
  }
}

const AdminVolunteers = () => {
  const [searchQuery, setSearchQuery] = useState('')
  const [interestFilter, setInterestFilter] = useState<string>('')

  const queryClient = useQueryClient()
  const { confirm, ConfirmationDialog } = useConfirmation()

  const { data: volunteers, isLoading, isError, refetch } = useQuery<Volunteer[]>(
    'admin-volunteers',
    volunteersAPI.getAll,
  )

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

  const uniqueInterests: string[] = [...new Set((volunteers || []).map((v: Volunteer) => v.interest))]
  const filtering = Boolean(searchQuery || interestFilter)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Volunteers"
        icon={UserPlus}
        count={volunteers?.length}
        description="People who signed up to volunteer through the website."
      />

      <FilterBar
        search={searchQuery}
        onSearchChange={setSearchQuery}
        placeholder="Search by name or email..."
        trailing={filtering ? (
          <span>
            {filteredVolunteers.length} of {volunteers?.length || 0} shown ·{' '}
            <button
              type="button"
              onClick={() => { setSearchQuery(''); setInterestFilter('') }}
              className="link"
            >
              Clear filters
            </button>
          </span>
        ) : undefined}
      >
        <select
          value={interestFilter}
          onChange={(e) => setInterestFilter(e.target.value)}
          className="input-field sm:w-56"
          aria-label="Interest area"
        >
          <option value="">All Interest Areas</option>
          {uniqueInterests.map((interest) => (
            <option key={interest} value={interest}>
              {interest}
            </option>
          ))}
        </select>
      </FilterBar>

      {isLoading ? (
        <LoadingBlock />
      ) : isError ? (
        <ErrorState message="Could not load volunteers." onRetry={() => refetch()} />
      ) : filteredVolunteers.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title={filtering ? 'No matching volunteers' : 'No volunteer signups yet'}
          body={filtering
            ? 'Try adjusting your search or filter criteria.'
            : 'Volunteer applications will appear here when people sign up.'}
        />
      ) : (
        <div className="card overflow-x-auto">
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
                    <p className="font-semibold text-gray-900">{volunteer.name}</p>
                    <div className="flex items-center text-sm text-gray-600 mt-1">
                      <Mail className="w-4 h-4 mr-1" aria-hidden="true" />
                      <a href={`mailto:${volunteer.email}`} className="hover:text-primary-600">
                        {volunteer.email}
                      </a>
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <StatusBadge tone={interestTone(volunteer.interest)}>{volunteer.interest}</StatusBadge>
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex items-center text-sm text-gray-600">
                      <Calendar className="w-4 h-4 mr-1" aria-hidden="true" />
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
                    <div className="flex justify-end">
                      <button
                        onClick={() => handleDelete(volunteer.id)}
                        disabled={deleteMutation.isLoading}
                        className="text-red-600 hover:text-red-700 p-2 rounded-lg hover:bg-red-50"
                        title="Delete volunteer submission"
                        aria-label="Delete volunteer submission"
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

      <ConfirmationDialog />
    </div>
  )
}

export default AdminVolunteers
