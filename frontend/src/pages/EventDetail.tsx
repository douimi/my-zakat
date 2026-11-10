import { useParams, Link } from 'react-router-dom'
import { useQuery } from 'react-query'
import { ArrowLeft, Calendar, MapPin } from 'lucide-react'
import { eventsAPI } from '../utils/api'
import { getOptimizedImageUrl, IMAGE_WIDTHS } from '../utils/mediaHelpers'
import SEOHead from '../components/SEOHead'
import { defineMessages, useFormat, useT } from '../i18n'

const M = defineMessages({
  allEvents: { en: 'All events', ar: 'جميع الفعاليات' },
  loading: { en: 'Loading event', ar: 'جارٍ تحميل الفعالية' },
  notFoundSeo: { en: 'Event not found', ar: 'الفعالية غير موجودة' },
  notFound: { en: 'Event Not Found', ar: 'لم نعثر على هذه الفعالية' },
  returnToEvents: { en: 'Return to events', ar: 'العودة إلى الفعاليات' },
  today: { en: 'Today', ar: 'اليوم' },
  upcoming: { en: 'Upcoming', ar: 'قادمة' },
  date: { en: 'Date', ar: 'التاريخ' },
  location: { en: 'Location', ar: 'المكان' },
  passed: { en: 'This event has passed.', ar: 'انتهت هذه الفعالية.' },
})

const BackToEvents = () => {
  const t = useT()
  return (
    <Link to="/events" className="link inline-flex items-center gap-1 text-sm">
      <ArrowLeft className="w-4 h-4" aria-hidden="true" /> {t(M.allEvents)}
    </Link>
  )
}

const EventDetail = () => {
  const t = useT()
  const { tag } = useFormat()
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
        <span className="sr-only">{t(M.loading)}</span>
      </div>
    )
  }

  if (error || !event) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <SEOHead title={t(M.notFoundSeo)} noindex />
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">{t(M.notFound)}</h1>
          <Link to="/events" className="link">
            {t(M.returnToEvents)}
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
                {isToday ? t(M.today) : t(M.upcoming)}
              </span>
            )}
            <h1 className="text-3xl sm:text-4xl font-heading font-bold text-gray-900">{event.title}</h1>

            <dl className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-6 text-sm text-gray-700">
              <div>
                <dt className="sr-only">{t(M.date)}</dt>
                <dd className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 shrink-0 text-primary-700" aria-hidden="true" />
                  {eventDate.toLocaleDateString(tag, {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </dd>
              </div>
              {event.location && (
                <div>
                  <dt className="sr-only">{t(M.location)}</dt>
                  <dd className="flex items-center gap-2">
                    <MapPin className="w-5 h-5 shrink-0 text-primary-700" aria-hidden="true" />
                    {event.location}
                  </dd>
                </div>
              )}
            </dl>

            {!isUpcoming && (
              <p className="mt-3 text-sm text-gray-500">{t(M.passed)}</p>
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
