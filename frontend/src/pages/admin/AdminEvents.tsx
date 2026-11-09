import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Plus, Edit, Trash2, Calendar, MapPin, Image as ImageIcon, LibraryBig } from 'lucide-react'
import { eventsAPI, getStaticFileUrl } from '../../utils/api'
import { useConfirmation } from '../../hooks/useConfirmation'
import { isValidImageUrl, getImageUrl } from '../../utils/mediaHelpers'
import type { Event } from '../../types'
import MediaInput from '../../components/MediaInput'
import MediaPickerDialog from '../../components/media/MediaPickerDialog'
import {
  PageHeader, Modal, LoadingBlock, ErrorState, EmptyState, StatusBadge, LongText,
} from '../../components/admin'

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
  const [showMediaLibraryPicker, setShowMediaLibraryPicker] = useState(false)
  const { confirm, ConfirmationDialog } = useConfirmation()
  const [formData, setFormData] = useState<EventFormData>({
    title: '',
    description: '',
    date: '',
    location: '',
    image_url: ''
  })
  
  const queryClient = useQueryClient()
  
  const { data: events, isLoading, error, refetch } = useQuery(
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

  const saving = createMutation.isLoading || updateMutation.isLoading

  // Upcoming events first (soonest on top), then past events (most recent first).
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const isPast = (event: Event) => new Date(event.date) < startOfToday
  const sortedEvents: Event[] = [...((events as Event[] | undefined) || [])].sort((a, b) => {
    const pa = isPast(a)
    const pb = isPast(b)
    if (pa !== pb) return pa ? 1 : -1
    const diff = new Date(a.date).getTime() - new Date(b.date).getTime()
    return pa ? -diff : diff
  })

  const addButton = (
    <button onClick={() => setShowForm(true)} className="btn-primary gap-2">
      <Plus className="w-4 h-4" aria-hidden="true" />
      Add New Event
    </button>
  )

  return (
    <div className="space-y-6">
      <PageHeader title="Events" icon={Calendar} count={events?.length} actions={addButton} />

      {/* Event Form Modal */}
      {showForm && (
        <Modal
          title={editingEvent ? 'Edit Event' : 'Add New Event'}
          // The library picker opens on top of this form; Escape there must not discard the form.
          onClose={() => { if (!showMediaLibraryPicker) resetForm() }}
          size="lg"
          footer={
            <>
              <button type="button" onClick={resetForm} className="btn-secondary">
                Cancel
              </button>
              <button type="submit" form="event-form" disabled={saving} className="btn-primary gap-2">
                {saving ? (
                  <>
                    <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" aria-hidden="true" />
                    {editingEvent ? 'Updating...' : 'Creating...'}
                  </>
                ) : (
                  editingEvent ? 'Update Event' : 'Create Event'
                )}
              </button>
            </>
          }
        >
            <form id="event-form" onSubmit={handleSubmit} className="space-y-4">
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

              <div>
                <MediaInput
                  value={formData.image_url}
                  onChange={(url) => setFormData(prev => ({ ...prev, image_url: url }))}
                  type="images"
                  label="Event Photo URL"
                  placeholder="Enter image URL or select from library"
                />
                <button
                  type="button"
                  onClick={() => setShowMediaLibraryPicker(true)}
                  className="mt-2 btn-secondary btn-sm gap-2"
                >
                  <LibraryBig className="w-4 h-4" aria-hidden="true" />
                  Choose from media library
                </button>
              </div>

            </form>
        </Modal>
      )}

      {/* Events Table */}
      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorState message="Could not load events." onRetry={() => refetch()} />
      ) : sortedEvents.length > 0 ? (
          <div className="card overflow-x-auto">
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
                {sortedEvents.map((event: Event) => (
                  <tr key={event.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-4 px-4 min-w-[16rem]">
                      <p className="font-semibold text-gray-900">{event.title}</p>
                      <div className="mt-1">
                        <LongText text={event.description} lines={2} />
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="space-y-1">
                        <div className="flex items-center text-sm text-gray-600">
                          <Calendar className="w-4 h-4 mr-1" aria-hidden="true" />
                          {new Date(event.date).toLocaleDateString()}
                          {isPast(event) && <StatusBadge className="ml-2">Past</StatusBadge>}
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
                          aria-label="Edit event"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(event.id)}
                          disabled={deleteMutation.isLoading}
                          className="text-red-600 hover:text-red-700 p-2 rounded-lg hover:bg-red-50"
                          title="Delete event"
                          aria-label="Delete event"
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
        <EmptyState icon={Calendar} title="No events yet" body="Create your first event to get started." action={addButton} />
      )}

      <MediaPickerDialog
        open={showMediaLibraryPicker}
        onClose={() => setShowMediaLibraryPicker(false)}
        onPick={(url) => {
          setFormData(prev => ({ ...prev, image_url: url }))
          setShowMediaLibraryPicker(false)
        }}
      />

      <ConfirmationDialog />
    </div>
  )
}

export default AdminEvents
