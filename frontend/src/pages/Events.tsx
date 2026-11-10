import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import { Calendar, MapPin, ArrowRight } from 'lucide-react'
import { eventsAPI } from '../utils/api'
import { getOptimizedImageUrl, IMAGE_WIDTHS } from '../utils/mediaHelpers'
import type { Event } from '../types'
import SEOHead from '../components/SEOHead'
import PageHeader from '../components/ui/PageHeader'
import Disclosure from '../components/ui/Disclosure'
import { defineMessages, useFormat, useT } from '../i18n'

const M = defineMessages({
  pageTitle: { en: 'Our Events', ar: 'فعالياتنا' },
  pageLead: {
    en: 'Fundraisers and community gatherings we run or join.',
    ar: 'حملات لجمع التبرعات ولقاءات مجتمعية ننظّمها أو نشارك فيها.',
  },
  seoTitle: { en: 'Community Events', ar: 'الفعاليات المجتمعية' },
  seoDescription: {
    en: 'Join MyZakat community events. Find upcoming gatherings, fundraisers, and Islamic educational events near you.',
    ar: 'شارك في فعاليات ماي زكاة المجتمعية: لقاءات قادمة، وحملات لجمع التبرعات، وفعاليات تعليمية إسلامية قريبة منك.',
  },
  loading: { en: 'Loading events', ar: 'جارٍ تحميل الفعاليات' },
  loadError: { en: 'Error loading events. Please try again later.', ar: 'تعذّر تحميل الفعاليات. يُرجى المحاولة لاحقًا.' },
  upcomingEvents: { en: 'Upcoming Events', ar: 'الفعاليات القادمة' },
  noUpcoming: { en: 'No upcoming events right now.', ar: 'لا توجد فعاليات قادمة في الوقت الحالي.' },
  /** {link} is replaced by the "Contact us" link. */
  hostOne: { en: '{link} if you would like to host one with us.', ar: '{link} إن رغبت في تنظيم فعالية معنا.' },
  contactUs: { en: 'Contact us', ar: 'تواصل معنا' },
  pastEventsLabel: { en: 'Past events', ar: 'الفعاليات السابقة' },
  pastEventsCount: { en: 'Past events ({count})', ar: 'الفعاليات السابقة ({count})' },
  mostRecent: { en: 'Most recent: {date}', ar: 'آخرها: {date}' },
  today: { en: 'Today', ar: 'اليوم' },
  upcoming: { en: 'Upcoming', ar: 'قادمة' },
  date: { en: 'Date', ar: 'التاريخ' },
  location: { en: 'Location', ar: 'المكان' },
  eventDetails: { en: 'Event details', ar: 'تفاصيل الفعالية' },
})

const startOfToday = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

// `tag` comes from useFormat(): 'en-US' on the English site, so its output is unchanged.
const formatLong = (date: Date, tag: string) =>
  date.toLocaleDateString(tag, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

const formatShort = (date: Date, tag: string) =>
  date.toLocaleDateString(tag, { year: 'numeric', month: 'short', day: 'numeric' })

const Events = () => {
  const t = useT()
  const { tag } = useFormat()
  const PAGE_TITLE = t(M.pageTitle)
  const PAGE_LEAD = t(M.pageLead)
  const { data: events, isLoading, error } = useQuery('public-events', () =>
    eventsAPI.getAll(false) // Get all events, not just upcoming
  )

  const seo = (
    <SEOHead
      title={t(M.seoTitle)}
      description={t(M.seoDescription)}
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
          <span className="sr-only">{t(M.loading)}</span>
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
          <p className="alert-error" role="alert">{t(M.loadError)}</p>
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
  const [hostBefore, hostAfter = ''] = t(M.hostOne).split('{link}')

  return (
    <div className="min-h-screen bg-white">
      {seo}
      <PageHeader title={PAGE_TITLE} description={PAGE_LEAD} />

      <div className="section-container section space-y-12">
        <section aria-labelledby="upcoming-events">
          <h2 id="upcoming-events" className="section-title mb-6">{t(M.upcomingEvents)}</h2>
          {upcomingEvents.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {upcomingEvents.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          ) : (
            <p className="text-gray-600">
              {t(M.noUpcoming)}{' '}
              {hostBefore}<Link to="/contact" className="link">{t(M.contactUs)}</Link>{hostAfter}
            </p>
          )}
        </section>

        {pastEvents.length > 0 && (
          <section aria-label={t(M.pastEventsLabel)}>
            <Disclosure
              title={t(M.pastEventsCount, { count: pastEvents.length })}
              summary={t(M.mostRecent, { date: formatShort(new Date(pastEvents[0].date), tag) })}
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
  const t = useT()
  const { tag } = useFormat()
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
          <span className={isToday ? 'badge-danger' : 'badge-success'}>{isToday ? t(M.today) : t(M.upcoming)}</span>
        </div>
        <h3 className="card-title">{event.title}</h3>
        <p className="mt-2 text-gray-600 line-clamp-3">{event.description}</p>

        <dl className="mt-4 space-y-2 text-sm text-gray-700">
          <div>
            <dt className="sr-only">{t(M.date)}</dt>
            <dd className="flex items-start gap-2">
              <Calendar className="w-4 h-4 mt-0.5 shrink-0 text-primary-700" aria-hidden="true" />
              {formatLong(eventDate, tag)}
            </dd>
          </div>
          {event.location && (
            <div>
              <dt className="sr-only">{t(M.location)}</dt>
              <dd className="flex items-start gap-2">
                <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-primary-700" aria-hidden="true" />
                {event.location}
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-auto pt-5">
          <Link to={`/events/${event.id}`} className="btn-secondary w-full gap-2">
            {t(M.eventDetails)} <ArrowRight className="w-4 h-4" aria-hidden="true" />
            <span className="sr-only">: {event.title}</span>
          </Link>
        </div>
      </div>
    </article>
  )
}

const PastEventRow = ({ event }: { event: Event }) => {
  const { tag } = useFormat()
  const eventDate = new Date(event.date)
  return (
    <li className="py-4 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-6">
      <time dateTime={isNaN(eventDate.getTime()) ? undefined : eventDate.toISOString()} className="text-sm text-gray-500 sm:w-32 shrink-0">
        {formatShort(eventDate, tag)}
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
