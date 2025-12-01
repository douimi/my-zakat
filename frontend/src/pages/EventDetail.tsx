import { useParams, Link } from 'react-router-dom'
import { useQuery } from 'react-query'
import { ArrowLeft, Calendar, MapPin, Clock } from 'lucide-react'
import { eventsAPI } from '../utils/api'

const EventDetail = () => {
  const { id } = useParams<{ id: string }>()

  const { data: event, isLoading, error } = useQuery(
    ['event', id],
    () => eventsAPI.getById(Number(id!)),
    {
      enabled: !!id,
      retry: false,
    }
  )

  // Helper function to get image URL - check if it's a full URL or a filename
  const getImageUrl = (imageValue?: string) => {
    if (!imageValue) return null
    // Check if it's a full URL (starts with http:// or https://)
    if (imageValue.startsWith('http://') || imageValue.startsWith('https://')) {
      return imageValue
    }
    // Otherwise, treat it as a filename and load from uploads
    return getStaticFileUrl(`/api/uploads/events/${imageValue}`)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (error || !event) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Event Not Found</h1>
          <Link to="/events" className="text-primary-600 hover:text-primary-700">
            Return to Events
          </Link>
        </div>
      </div>
    )
  }

  const imageUrl = getImageUrl(event.image)
  const eventDate = new Date(event.date)
  const isUpcoming = eventDate >= new Date()
  const isToday = eventDate.toDateString() === new Date().toDateString()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="section-container py-4">
          <Link
            to="/events"
            className="inline-flex items-center text-gray-600 hover:text-primary-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Events
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="section-container py-8">
        {/* Event Image */}
        {imageUrl && (
          <div className="mb-8">
            <div className="aspect-video bg-gray-200 rounded-lg overflow-hidden relative">
              <img 
                src={imageUrl} 
                alt={event.title}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
              {isUpcoming && (
                <div className="absolute top-4 left-4">
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                    isToday 
                      ? 'bg-red-600 text-white' 
                      : 'bg-green-600 text-white'
                  }`}>
                    {isToday ? 'Today' : 'Upcoming'}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="mb-6">
            <h1 className="text-4xl font-heading font-bold text-gray-900 mb-4">{event.title}</h1>
            
            <div className="flex flex-wrap gap-6 text-sm text-gray-600 mb-6">
              <div className="flex items-center">
                <Calendar className="w-5 h-5 mr-2 text-primary-500" />
                <span>
                  {eventDate.toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </span>
              </div>
              
              <div className="flex items-center">
                <MapPin className="w-5 h-5 mr-2 text-primary-500" />
                <span>{event.location}</span>
              </div>
            </div>
          </div>

          {event.description && (
            <div className="prose prose-lg max-w-none">
              <div className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                {event.description.split('\n').map((paragraph, index) => (
                  <p key={index} className="mb-4">
                    {paragraph}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default EventDetail
