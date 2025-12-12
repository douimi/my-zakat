import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import { Calendar, MapPin, Clock, ArrowRight } from 'lucide-react'
import { eventsAPI, getStaticFileUrl } from '../utils/api'
import type { Event } from '../types'

const Events = () => {
  const { data: events, isLoading, error } = useQuery('public-events', () => 
    eventsAPI.getAll(false) // Get all events, not just upcoming
  )

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="section-container">
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="section-container">
          <div className="text-center py-20">
            <h1 className="text-4xl font-heading font-bold mb-4">Events</h1>
            <p className="text-red-600">Error loading events. Please try again later.</p>
          </div>
        </div>
      </div>
    )
  }

  const upcomingEvents = events?.filter((event: Event) => 
    new Date(event.date) >= new Date()
  ) || []
  
  const pastEvents = events?.filter((event: Event) => 
    new Date(event.date) < new Date()
  ) || []

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-primary-600 to-primary-800 text-white py-20">
        <div className="section-container">
          <div className="text-center">
            <h1 className="text-5xl font-heading font-bold mb-6">Our Events</h1>
            <p className="text-xl text-primary-100 max-w-3xl mx-auto">
              Join us in making a difference through community events, fundraisers, and educational programs
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="section-container py-16">
        {/* Upcoming Events */}
        {upcomingEvents.length > 0 && (
          <div className="mb-16">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-heading font-bold text-gray-900 mb-4">Upcoming Events</h2>
              <p className="text-gray-600 max-w-2xl mx-auto">
                Don't miss out on these exciting upcoming events where you can contribute to our cause
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {upcomingEvents.map((event: Event) => (
                <EventCard key={event.id} event={event} isUpcoming={true} />
              ))}
            </div>
          </div>
        )}

        {/* Past Events */}
        {pastEvents.length > 0 && (
          <div>
            <div className="text-center mb-12">
              <h2 className="text-3xl font-heading font-bold text-gray-900 mb-4">Past Events</h2>
              <p className="text-gray-600 max-w-2xl mx-auto">
                Look back at the amazing events we've organized and the impact we've made together
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {pastEvents.map((event: Event) => (
                <EventCard key={event.id} event={event} isUpcoming={false} />
              ))}
            </div>
          </div>
        )}

        {/* No Events */}
        {(!events || events.length === 0) && (
          <div className="text-center py-20">
            <Calendar className="w-24 h-24 mx-auto text-gray-300 mb-8" />
            <h2 className="text-3xl font-heading font-bold text-gray-900 mb-4">No Events Yet</h2>
            <p className="text-gray-600 max-w-2xl mx-auto mb-8">
              We're planning exciting events to bring our community together. Check back soon for updates!
            </p>
            <Link 
              to="/contact" 
              className="btn-primary inline-flex items-center"
            >
              Get Notified About Events
              <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </div>
        )}
      </div>

      {/* Call to Action */}
      <div className="bg-primary-50 py-16">
        <div className="section-container text-center">
          <h2 className="text-3xl font-heading font-bold text-gray-900 mb-4">
            Want to Get Involved?
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto mb-8">
            Join our community and be the first to know about upcoming events, volunteer opportunities, and ways to make a difference.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/volunteer" className="btn-primary">
              Volunteer With Us
            </Link>
            <Link to="/contact" className="btn-outline">
              Contact Us
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

interface EventCardProps {
  event: Event
  isUpcoming: boolean
}

const EventCard = ({ event, isUpcoming }: EventCardProps) => {
  const eventDate = new Date(event.date)
  const isToday = eventDate.toDateString() === new Date().toDateString()

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

  const imageUrl = getImageUrl(event.image)

  return (
    <div className={`card hover:shadow-lg transition-shadow duration-300 ${
      isUpcoming ? 'border-l-4 border-l-primary-500' : 'opacity-75'
    }`}>
      {/* Event Image */}
      {imageUrl && (
        <div className="aspect-video bg-gray-200 rounded-t-lg overflow-hidden">
          <img 
            src={imageUrl} 
            alt={event.title}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        </div>
      )}

      <div className="p-6">
        {/* Event Status */}
        {isUpcoming && (
          <div className="flex items-center justify-between mb-4">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              isToday 
                ? 'bg-red-100 text-red-800' 
                : 'bg-green-100 text-green-800'
            }`}>
              {isToday ? 'Today' : 'Upcoming'}
            </span>
          </div>
        )}

        {/* Event Title */}
        <h3 className="text-xl font-semibold text-gray-900 mb-3">{event.title}</h3>

        {/* Event Description */}
        <p className="text-gray-600 mb-4 line-clamp-3">{event.description}</p>

        {/* Event Details */}
        <div className="space-y-2 mb-6">
          <div className="flex items-center text-sm text-gray-600">
            <Calendar className="w-4 h-4 mr-2 text-primary-500" />
            <span>
              {eventDate.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </span>
          </div>
          
          <div className="flex items-center text-sm text-gray-600">
            <MapPin className="w-4 h-4 mr-2 text-primary-500" />
            <span>{event.location}</span>
          </div>
        </div>

        {/* Action Button */}
        <Link 
          to={`/events/${event.id}`}
          className={`btn-outline w-full text-center ${
            !isUpcoming ? 'opacity-50' : ''
          }`}
        >
          {isUpcoming ? 'Learn More' : 'View Details'}
        </Link>
      </div>
    </div>
  )
}

export default Events
