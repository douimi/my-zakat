import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Plus, Edit, Trash2, Calendar, MapPin, Image as ImageIcon } from 'lucide-react'
import { eventsAPI, getStaticFileUrl } from '../../utils/api'
import { useConfirmation } from '../../hooks/useConfirmation'
import { isValidImageUrl, getImageUrl } from '../../utils/mediaHelpers'
import type { Event } from '../../types'
import MediaInput from '../../components/MediaInput'

interface EventFormData {
  title: string
  description: string
  date: string
  location: string
  image_url: string
}

const AdminEvents = () => {
  const [showForm, setShowForm] = useState(false)
  const [editingEvent, setEditingEvent] = useState<Event | null>(null)
  const { confirm, ConfirmationDialog } = useConfirmation()
  const [formData, setFormData] = useState<EventFormData>({
    title: '',
    description: '',
    date: '',
    location: '',
    image_url: ''
  })
  
  const queryClient = useQueryClient()
  
  const { data: events, isLoading, error } = useQuery(
    'admin-events', 
    () => eventsAPI.getAll(false),
    {
      staleTime: 0, // Always fetch fresh data
      cacheTime: 0, // Don't cache
    }
  )
  
  const createMutation = useMutation(eventsAPI.create, {
    onSuccess: () => {
      queryClient.invalidateQueries('admin-events')
      queryClient.invalidateQueries('admin-dashboard') // Also invalidate dashboard
      queryClient.refetchQueries('admin-events') // Force refetch
      resetForm()
    }
  })
  
  const updateMutation = useMutation(
    ({ id, data }: { id: number; data: any }) => eventsAPI.update(id, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('admin-events')
        resetForm()
      }
    }
  )
  
  const deleteMutation = useMutation(eventsAPI.delete, {
    onSuccess: () => {
      queryClient.invalidateQueries('admin-events')
    }
  })

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      date: '',
      location: '',
      image_url: ''
    })
    setEditingEvent(null)
    setShowForm(false)
  }

  const handleEdit = (event: Event) => {
    setEditingEvent(event)
    setFormData({
      title: event.title,
      description: event.description,
      date: event.date.split('T')[0], // Convert to YYYY-MM-DD format
      location: event.location,
      image_url: event.image || ''
    })
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const submitData = {
      title: formData.title,
      description: formData.description,
      date: formData.date,
      location: formData.location,
      image: formData.image_url
    }

    if (editingEvent) {
      updateMutation.mutate({ id: editingEvent.id, data: submitData })
    } else {
      createMutation.mutate(submitData)
    }
  }

  const handleDelete = async (id: number) => {
    const confirmed = await confirm({
      title: 'Delete Event',
      message: 'Are you sure you want to delete this event? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger'
    })
    if (confirmed) {
      deleteMutation.mutate(id)
    }
  }

  // Debug: Log the events data
  console.log('AdminEvents - events data:', events)
  console.log('AdminEvents - isLoading:', isLoading)
  console.log('AdminEvents - error:', error)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-red-600">Error loading events: {error.toString()}</div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Manage Events</h1>
            <p className="text-gray-600 mt-2">Create, edit, and manage upcoming events</p>
          </div>
          <div className="flex space-x-4">
            <button
              onClick={() => queryClient.refetchQueries('admin-events')}
              className="btn-outline flex items-center"
            >
              Refresh Events
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="btn-primary flex items-center"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add New Event
            </button>
          </div>
        </div>
      </div>

      {/* Event Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              {editingEvent ? 'Edit Event' : 'Add New Event'}
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Event Title *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  className="input-field"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description *
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={4}
                  className="input-field"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Event Date *
                  </label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                    className="input-field"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Location *
                  </label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                    className="input-field"
                    required
                  />
                </div>
              </div>

              <MediaInput
                value={formData.image_url}
                onChange={(url) => setFormData(prev => ({ ...prev, image_url: url }))}
                type="images"
                label="Event Photo URL"
                placeholder="Enter image URL or select from library"
              />

              <div className="flex justify-end space-x-4 pt-4">
                <button
                  type="button"
                  onClick={resetForm}
                  className="btn-outline"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isLoading || updateMutation.isLoading}
                  className="btn-primary flex items-center"
                >
                  {(createMutation.isLoading || updateMutation.isLoading) ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      {editingEvent ? 'Updating...' : 'Creating...'}
                    </>
                  ) : (
                    <>
                      {editingEvent ? 'Update Event' : 'Create Event'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Events Table */}
      <div className="card">
        {events && events.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Event</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Date & Location</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Image</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-900">Actions</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event: Event) => (
                  <tr key={event.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-4 px-4">
                      <div>
                        <h3 className="font-semibold text-gray-900">{event.title}</h3>
                        <p className="text-sm text-gray-600 mt-1">
                          {event.description.length > 100 
                            ? `${event.description.substring(0, 100)}...`
                            : event.description
                          }
                        </p>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="space-y-1">
                        <div className="flex items-center text-sm text-gray-600">
                          <Calendar className="w-4 h-4 mr-1" />
                          {new Date(event.date).toLocaleDateString()}
                        </div>
                        <div className="flex items-center text-sm text-gray-600">
                          <MapPin className="w-4 h-4 mr-1" />
                          {event.location}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      {event.image ? (() => {
                        // Check if it's a full URL or a filename
                        const imageUrl = event.image.startsWith('http://') || event.image.startsWith('https://')
                          ? event.image
                          : getStaticFileUrl(`/api/uploads/events/${event.image}`)
                        return (
                          <img 
                            src={imageUrl} 
                            alt={event.title}
                            className="w-16 h-16 object-cover rounded"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none'
                            }}
                          />
                        )
                      })() : (
                        <div className="w-16 h-16 bg-gray-200 rounded flex items-center justify-center">
                          <ImageIcon className="w-6 h-6 text-gray-400" />
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={() => handleEdit(event)}
                          className="text-primary-600 hover:text-primary-700 p-2 rounded-lg hover:bg-primary-50"
                          title="Edit event"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(event.id)}
                          disabled={deleteMutation.isLoading}
                          className="text-red-600 hover:text-red-700 p-2 rounded-lg hover:bg-red-50"
                          title="Delete event"
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
            <Calendar className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No events yet</h3>
            <p className="text-gray-600 mb-4">Create your first event to get started</p>
            <button
              onClick={() => setShowForm(true)}
              className="btn-primary flex items-center mx-auto"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add New Event
            </button>
          </div>
        )}
      </div>

      <ConfirmationDialog />
    </div>
  )
}

export default AdminEvents
