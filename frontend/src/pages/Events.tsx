import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import { Calendar, MapPin, ArrowRight } from 'lucide-react'
import { eventsAPI } from '../utils/api'
import { getOptimizedImageUrl, IMAGE_WIDTHS } from '../utils/mediaHelpers'
import type { Event } from '../types'
import SEOHead from '../components/SEOHead'
import PageHeader from '../components/ui/PageHeader'
import Disclosure from '../components/ui/Disclosure'

const PAGE_TITLE = 'Our Events'
const PAGE_LEAD = 'Fundraisers and community gatherings we run or join.'

const startOfToday = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

const formatLong = (date: Date) =>
  date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

const formatShort = (date: Date) =>
  date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })

const Events = () => {
  const { data: events, isLoading, error } = useQuery('public-events', () =>
    eventsAPI.getAll(false) // Get all events, not just upcoming
  )

  const seo = (
    <SEOHead
      title="Community Events"
      description="Join MyZakat community events. Find upcoming gatherings, fundraisers, and Islamic educational events near you."
      canonicalPath="/events"
    />
  )

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white">
        {seo}
        <PageHeader title={PAGE_TITLE} description={PAGE_LEAD} />
        <div className="flex items-center justify-center py-20" role="status">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" aria-hidden="true" />
          <span className="sr-only">Loading events</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white">
        {seo}
        <PageHeader title={PAGE_TITLE} description={PAGE_LEAD} />
        <div className="section-container section">
          <p className="alert-error" role="alert">Error loading events. Please try again later.</p>
        </div>
      </div>
    )
  }

  // An event dated today still counts as upcoming for the whole day.
  const today = startOfToday()
  const all = (events || []) as Event[]
  const upcomingEvents = all
    .filter((event) => new Date(event.date) >= today)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()) // soonest first
  const pastEvents = all
    .filter((event) => new Date(event.date) < today)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) // newest first

  return (
    <div className="min-h-screen bg-white">
      {seo}
      <PageHeader title={PAGE_TITLE} description={PAGE_LEAD} />

      <div className="section-container section space-y-12">
        <section aria-labelledby="upcoming-events">
          <h2 id="upcoming-events" className="section-title mb-6">Upcoming Events</h2>
          {upcomingEvents.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {upcomingEvents.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          ) : (
            <p className="text-gray-600">
              No upcoming events right now.{' '}
              <Link to="/contact" className="link">Contact us</Link> if you would like to host one with us.
            </p>
          )}
        </section>

        {pastEvents.length > 0 && (
          <section aria-label="Past events">
            <Disclosure
              title={`Past events (${pastEvents.length})`}
              summary={`Most recent: ${formatShort(new Date(pastEvents[0].date))}`}
            >
              <ul className="divide-y divide-gray-200">
                {pastEvents.map((event) => (
                  <PastEventRow key={event.id} event={event} />
                ))}
              </ul>
            </Disclosure>
          </section>
        )}
      </div>
    </div>
  )
}

const EventCard = ({ event }: { event: Event }) => {
  const eventDate = new Date(event.date)
  const isToday = eventDate.toDateString() === new Date().toDateString()
  const imageUrl = getOptimizedImageUrl(event.image, IMAGE_WIDTHS.THUMB, 'events')

  return (
    <article className="card-media">
      {imageUrl && (
        <div className="aspect-video bg-gray-100 overflow-hidden">
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        </div>
      )}

      <div className="card-body">
        <div className="mb-3">
          <span className={isToday ? 'badge-danger' : 'badge-success'}>{isToday ? 'Today' : 'Upcoming'}</span>
        </div>
        <h3 className="card-title">{event.title}</h3>
        <p className="mt-2 text-gray-600 line-clamp-3">{event.description}</p>

        <dl className="mt-4 space-y-2 text-sm text-gray-700">
          <div>
            <dt className="sr-only">Date</dt>
            <dd className="flex items-start gap-2">
              <Calendar className="w-4 h-4 mt-0.5 shrink-0 text-primary-700" aria-hidden="true" />
              {formatLong(eventDate)}
            </dd>
          </div>
          {event.location && (
            <div>
              <dt className="sr-only">Location</dt>
              <dd className="flex items-start gap-2">
                <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-primary-700" aria-hidden="true" />
                {event.location}
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-auto pt-5">
          <Link to={`/events/${event.id}`} className="btn-secondary w-full gap-2">
            Event details <ArrowRight className="w-4 h-4" aria-hidden="true" />
            <span className="sr-only">: {event.title}</span>
          </Link>
        </div>
      </div>
    </article>
  )
}

const PastEventRow = ({ event }: { event: Event }) => {
  const eventDate = new Date(event.date)
  return (
    <li className="py-4 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-6">
      <time dateTime={isNaN(eventDate.getTime()) ? undefined : eventDate.toISOString()} className="text-sm text-gray-500 sm:w-32 shrink-0">
        {formatShort(eventDate)}
      </time>
      <div className="min-w-0">
        <Link to={`/events/${event.id}`} className="font-medium text-gray-900 hover:text-primary-700 hover:underline">
          {event.title}
        </Link>
        {event.location && <p className="text-sm text-gray-600">{event.location}</p>}
      </div>
    </li>
  )
}

export default Events
