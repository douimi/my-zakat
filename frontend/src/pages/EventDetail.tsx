import { useParams, Link } from 'react-router-dom'
import { useQuery } from 'react-query'
import { ArrowLeft, Calendar, MapPin } from 'lucide-react'
import { eventsAPI } from '../utils/api'
import { getOptimizedImageUrl, IMAGE_WIDTHS } from '../utils/mediaHelpers'
import SEOHead from '../components/SEOHead'

const BackToEvents = () => (
  <Link to="/events" className="link inline-flex items-center gap-1 text-sm">
    <ArrowLeft className="w-4 h-4" aria-hidden="true" /> All events
  </Link>
)

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

  // Helper function to get image URL with LARGE optimization
  const getImageUrl = (imageValue?: string) => {
    return getOptimizedImageUrl(imageValue, IMAGE_WIDTHS.LARGE, 'events')
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" role="status">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" aria-hidden="true" />
        <span className="sr-only">Loading event</span>
      </div>
    )
  }

  if (error || !event) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <SEOHead title="Event not found" noindex />
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Event Not Found</h1>
          <Link to="/events" className="link">
            Return to events
          </Link>
        </div>
      </div>
    )
  }

  const imageUrl = getImageUrl(event.image)
  const eventDate = new Date(event.date)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  // An event dated today stays "upcoming" for the whole day.
  const isUpcoming = eventDate >= today
  const isToday = eventDate.toDateString() === new Date().toDateString()
  const paragraphs = (event.description || '')
    .split('\n')
    .map((p) => p.trim())
    .filter(Boolean)

  return (
    <div className="min-h-screen bg-gray-50">
      <SEOHead
        title={event.title}
        description={paragraphs[0]?.slice(0, 160) || undefined}
        canonicalPath={`/events/${event.id}`}
        ogImage={imageUrl && /^https?:\/\//.test(imageUrl) ? imageUrl : undefined}
      />
      <div className="section-container py-8 sm:py-10">
        <div className="max-w-3xl mx-auto space-y-6">
          <BackToEvents />

          {imageUrl && (
            <div className="aspect-video bg-gray-200 rounded-xl overflow-hidden">
              <img
                src={imageUrl}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
            </div>
          )}

          <article className="card sm:p-8">
            {isUpcoming && (
              <span className={`${isToday ? 'badge-danger' : 'badge-success'} mb-3`}>
                {isToday ? 'Today' : 'Upcoming'}
              </span>
            )}
            <h1 className="text-3xl sm:text-4xl font-heading font-bold text-gray-900">{event.title}</h1>

            <dl className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-6 text-sm text-gray-700">
              <div>
                <dt className="sr-only">Date</dt>
                <dd className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 shrink-0 text-primary-700" aria-hidden="true" />
                  {eventDate.toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </dd>
              </div>
              {event.location && (
                <div>
                  <dt className="sr-only">Location</dt>
                  <dd className="flex items-center gap-2">
                    <MapPin className="w-5 h-5 shrink-0 text-primary-700" aria-hidden="true" />
                    {event.location}
                  </dd>
                </div>
              )}
            </dl>

            {!isUpcoming && (
              <p className="mt-3 text-sm text-gray-500">This event has passed.</p>
            )}

            {paragraphs.length > 0 && (
              <div className="prose prose-lg max-w-none mt-6">
                {paragraphs.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            )}
          </article>
        </div>
      </div>
    </div>
  )
}

export default EventDetail
