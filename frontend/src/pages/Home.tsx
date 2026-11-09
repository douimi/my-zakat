import { useEffect, useRef, useState } from 'react'
import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Play,
  Star,
  X,
  ChevronLeft,
  ChevronRight,
  Calendar,
  MapPin,
} from 'lucide-react'
import { donationsAPI, storiesAPI, eventsAPI, testimonialsAPI, settingsAPI, getStaticFileUrl, galleryAPI, programCategoriesAPI } from '../utils/api'
import { getOptimizedImageUrl, IMAGE_WIDTHS } from '../utils/mediaHelpers'
import SEOHead from '../components/SEOHead'
import { getFaqJsonLd } from '../utils/seo'
import type { DonationStats, Event, ProgramCategory, Story, Testimonial } from '../types'
import Slideshow from '../components/Slideshow'
import LazyVideo from '../components/LazyVideo'
import VideoThumbnail, { PlayableVideo } from '../components/VideoThumbnail'
import CampaignPopup from '../components/CampaignPopup'
import FundraisingProjectsSection from '../components/FundraisingProjectsSection'

interface Setting {
  key: string
  value?: string
}

interface GalleryItem {
  id: number
  media_filename: string
  thumbnail_url?: string | null
}

/** Number of gallery tiles shown before "Show all". */
const GALLERY_PREVIEW_COUNT = 9

// Helper to append width param to a URL for optimization
const withWidth = (url: string | null, width: number): string | null => {
  if (!url || url.startsWith('http://') || url.startsWith('https://')) return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}w=${width}`
}

// Helper to get category media - checks video first, then image
const getCategoryMedia = (category: ProgramCategory) => {
  if (category.video_filename) {
    const videoUrl = getStaticFileUrl(`/api/uploads/program_categories/${category.video_filename}`)
    return { url: videoUrl, type: 'video' as const }
  }
  if (category.image_url) {
    return { url: category.image_url, type: 'image' as const }
  }
  return { url: null, type: 'image' as const }
}

// Story videos are served from /api/uploads/stories/ (or are already full S3 URLs)
const getStoryVideoUrl = (videoFilename?: string) => {
  if (!videoFilename) return null
  if (videoFilename.startsWith('http://') || videoFilename.startsWith('https://')) return videoFilename
  return getStaticFileUrl(`/api/uploads/stories/${videoFilename}`)
}

const getTestimonialVideoUrl = (videoFilename?: string) => {
  if (!videoFilename) return null
  return getStaticFileUrl(`/api/uploads/testimonials/${videoFilename}`)
}

/** Section heading row: one-line h2, optional one-sentence lead, optional "View all" link on the right. */
const SectionHead = ({ id, title, lead, viewAll }: { id: string; title: string; lead?: string; viewAll?: { to: string; label: string } }) => (
  <div className="section-head">
    <div>
      <h2 id={id} className="section-title">{title}</h2>
      {lead && <p className="section-lead">{lead}</p>}
    </div>
    {viewAll && (
      <Link to={viewAll.to} className="link inline-flex items-center gap-1 shrink-0">
        {viewAll.label} <ArrowRight className="w-4 h-4" aria-hidden="true" />
      </Link>
    )}
  </div>
)

// Card title link whose ::after covers the whole card, so the card is clickable
// with a single link (no nested links/buttons). Media buttons sit above it with z-10.
const STRETCHED_LINK = 'after:absolute after:inset-0 after:content-[""] focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-primary-600 focus-visible:after:rounded-xl'

const Home = () => {

  // Prioritize critical data first, then load secondary content
  const { data: donationStats, error: statsError } = useQuery('donation-stats', donationsAPI.getStats, {
    retry: 1,
    staleTime: 5 * 60 * 1000, // 5 minutes
    onError: (error) => console.error('Stats error:', error)
  })
  const { data: settings, error: settingsError } = useQuery<Setting[]>('home-media-settings', settingsAPI.getAll, {
    retry: 1,
    staleTime: 10 * 60 * 1000, // 10 minutes - settings change rarely
    onError: (error) => console.error('Settings error:', error)
  })

  // Load secondary content after the critical data, to prioritize the first screen
  const { data: featuredStories } = useQuery<Story[]>('featured-stories', () =>
    storiesAPI.getAll(true, false), { // Get all active stories, not just featured
    retry: 1,
    staleTime: 5 * 60 * 1000,
    enabled: !!donationStats, // Only load after critical data
    onError: (error) => console.error('Stories error:', error)
  })
  const { data: upcomingEvents } = useQuery<Event[]>('upcoming-events', () =>
    eventsAPI.getAll(true), {
    retry: 1,
    staleTime: 5 * 60 * 1000,
    enabled: !!donationStats, // Only load after critical data
    onError: (error) => console.error('Events error:', error)
  })
  const { data: testimonials } = useQuery<Testimonial[]>('testimonials', () =>
    testimonialsAPI.getAll(true), {
    retry: 1,
    staleTime: 5 * 60 * 1000,
    enabled: !!donationStats, // Only load after critical data
    onError: (error) => console.error('Testimonials error:', error)
  })
  const { data: categories } = useQuery<ProgramCategory[]>('program-categories', () =>
    programCategoriesAPI.getAll(true), {
    retry: 1,
    staleTime: 5 * 60 * 1000,
    enabled: !!donationStats, // Only load after critical data
    onError: (error) => console.error('Categories error:', error)
  })

  // Show error state if any critical API calls fail
  if (statsError || settingsError) {
    return (
      <div className="section-alt">
        <div className="section-container text-center">
          <h1 className="page-title mb-6">MyZakat</h1>
          <p className="text-red-700 mb-2">Unable to load homepage data. Please check your connection.</p>
          <p className="text-gray-600 mb-6">Other pages should still work normally.</p>
          <Link to="/donate" className="btn-primary">Donate</Link>
        </div>
      </div>
    )
  }

  // The stats endpoint also returns total_raised, which the DonationStats type does not declare.
  const stats = donationStats as (DonationStats & { total_raised?: number }) | undefined
  const impactStats = [
    { value: (stats?.impact?.meals || 0).toLocaleString('en-US'), label: 'Meals provided' },
    { value: (stats?.impact?.families || 0).toLocaleString('en-US'), label: 'Families supported' },
    { value: (stats?.impact?.orphans || 0).toLocaleString('en-US'), label: 'Orphans cared for' },
    { value: `$${(stats?.total_raised || 0).toLocaleString('en-US')}`, label: 'Total raised' },
  ]
  const homeImpactEnabled = settings?.find((s) => s.key === 'home_impact_enabled')?.value !== 'false'

  return (
    <div className="min-h-screen">
      <CampaignPopup />
      <SEOHead
        description="MyZakat is a nonprofit Zakat distribution foundation. Donate Zakat and Sadaqa online, calculate your Zakat, explore programs, and see the impact of your generosity on communities in need."
        canonicalPath="/"
        jsonLd={getFaqJsonLd([
          { question: 'What is Zakat?', answer: 'Zakat is one of the Five Pillars of Islam. It is an obligatory annual charitable contribution of 2.5% of qualifying wealth, distributed to eligible recipients including the poor and needy.' },
          { question: 'How do I calculate my Zakat?', answer: 'Use the MyZakat Zakat Calculator to enter your savings, gold, silver, investments, and business assets. The calculator applies the 2.5% rate if your total exceeds the Nisab threshold.' },
          { question: 'Is my donation tax-deductible?', answer: 'As a 501(c)(3) nonprofit, donations to MyZakat may be tax-deductible. Donors receive receipts for their records.' },
          { question: 'What is the difference between Zakat and Sadaqa?', answer: 'Zakat is obligatory with specific rules about amounts and recipients. Sadaqa is voluntary charity with no minimum amount or restrictions.' },
        ])}
      />

      {/* Hero slideshow (renders the page h1) */}
      <Slideshow
        heading="MyZakat: give your zakat and sadaqa"
        emptyDescription="Pick a project or give to where the need is greatest. You get a receipt by email."
        emptyActions={
          <>
            <Link to="/donate" className="btn-primary btn-lg">Donate Now</Link>
            <Link to="/zakat-calculator" className="btn-secondary btn-lg">Calculate My Zakat</Link>
          </>
        }
      />

      {/* Projects you can fund */}
      <FundraisingProjectsSection />

      {/* Impact numbers (admin toggle: home_impact_enabled) */}
      {homeImpactEnabled && (
        <section className="section-alt" aria-labelledby="home-impact-title">
          <div className="section-container">
            <h2 id="home-impact-title" className="eyebrow mb-6">Since we started</h2>
            <dl className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              {impactStats.map((stat) => (
                <div key={stat.label}>
                  <dt className="text-sm text-gray-600">{stat.label}</dt>
                  <dd className="mt-1 text-3xl font-bold text-gray-900">{stat.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      )}

      {/* Programs */}
      {categories && categories.length > 0 && (
        <section className="section" aria-labelledby="home-programs-title">
          <div className="section-container">
            <SectionHead id="home-programs-title" title="Our programs" viewAll={{ to: '/programs', label: 'All programs' }} />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {categories.map((category) => {
                const media = getCategoryMedia(category)
                return (
                  <article key={category.id} className="card-media group relative">
                    <div className="relative h-48 overflow-hidden bg-gray-100">
                      {media.type === 'video' && media.url ? (
                        <div className="relative z-10 h-full">
                          <PlayableVideo videoSrc={media.url} title={category.title} className="w-full h-full" />
                        </div>
                      ) : media.url ? (
                        <img
                          src={withWidth(media.url, IMAGE_WIDTHS.CARD) || media.url}
                          alt=""
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none'
                          }}
                        />
                      ) : null}
                    </div>

                    <div className="card-body">
                      <h3 className="card-title">
                        <Link to={`/categories/${category.slug}`} className={`hover:text-primary-700 ${STRETCHED_LINK}`}>
                          {category.title}
                        </Link>
                      </h3>
                      {category.impact_text && (
                        <p className="mt-2"><span className="badge-primary">{category.impact_text}</span></p>
                      )}
                      <p className="mt-2 text-gray-600 line-clamp-2">
                        {category.short_description || category.description || ''}
                      </p>
                      <span className="mt-4 text-sm font-medium text-primary-700 inline-flex items-center gap-1" aria-hidden="true">
                        See this program <ArrowRight className="w-4 h-4" />
                      </span>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* Stories */}
      {featuredStories && featuredStories.length > 0 && (
        <section className="section-alt" aria-labelledby="home-stories-title">
          <div className="section-container">
            <SectionHead id="home-stories-title" title="Stories from the field" viewAll={{ to: '/stories', label: 'View All Stories' }} />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuredStories.slice(0, 3).map((story) => {
                const imageUrl = getOptimizedImageUrl(story.image_filename, IMAGE_WIDTHS.THUMB, 'stories')
                const videoUrl = getStoryVideoUrl(story.video_filename)

                return (
                  <article key={story.id} className="card-media group relative">
                    {(imageUrl || videoUrl) && (
                      <div className="relative h-48 overflow-hidden bg-gray-100">
                        {videoUrl ? (
                          <div className="relative z-10 h-full">
                            <PlayableVideo videoSrc={videoUrl} poster={imageUrl || undefined} title={story.title} className="w-full h-full" />
                          </div>
                        ) : (
                          <img
                            src={imageUrl || ''}
                            alt=""
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            loading="lazy"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none'
                            }}
                          />
                        )}
                      </div>
                    )}

                    <div className="card-body">
                      <h3 className="card-title line-clamp-2">
                        <Link to={`/stories/${story.id}`} className={`hover:text-primary-700 ${STRETCHED_LINK}`}>
                          {story.title}
                        </Link>
                      </h3>
                      <p className="mt-2 text-gray-600 line-clamp-3">
                        {story.summary || (story.content ? `${story.content.substring(0, 150)}...` : '')}
                      </p>
                      <span className="mt-4 text-sm font-medium text-primary-700 inline-flex items-center gap-1" aria-hidden="true">
                        Read story <ArrowRight className="w-4 h-4" />
                      </span>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* Upcoming events (only when there are some) */}
      {upcomingEvents && upcomingEvents.length > 0 && (
        <section className="section" aria-labelledby="home-events-title">
          <div className="section-container">
            <SectionHead id="home-events-title" title="Upcoming events" viewAll={{ to: '/events', label: 'View All Events' }} />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {upcomingEvents.slice(0, 3).map((event) => {
                const eventDate = new Date(event.date)
                const isToday = eventDate.toDateString() === new Date().toDateString()
                const imageUrl = getOptimizedImageUrl(event.image, IMAGE_WIDTHS.THUMB, 'events')

                return (
                  <article key={event.id} className="card-media group relative">
                    {imageUrl && (
                      <div className="relative h-48 overflow-hidden bg-gray-100">
                        <img
                          src={imageUrl}
                          alt=""
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none'
                          }}
                        />
                        {isToday && (
                          <span className="badge-danger absolute top-3 left-3 shadow-sm">Today</span>
                        )}
                      </div>
                    )}

                    <div className="card-body">
                      <h3 className="card-title">
                        <Link to={`/events/${event.id}`} className={`hover:text-primary-700 ${STRETCHED_LINK}`}>
                          {event.title}
                        </Link>
                      </h3>
                      <p className="mt-2 text-gray-600 line-clamp-2">{event.description}</p>
                      <div className="mt-4 space-y-1.5 text-sm text-gray-600">
                        <p className="flex items-center">
                          <Calendar className="w-4 h-4 mr-2 text-gray-500 flex-shrink-0" aria-hidden="true" />
                          {eventDate.toLocaleDateString('en-US', {
                            weekday: 'short',
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </p>
                        {event.location && (
                          <p className="flex items-center">
                            <MapPin className="w-4 h-4 mr-2 text-gray-500 flex-shrink-0" aria-hidden="true" />
                            <span className="truncate">{event.location}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* Testimonials (only when there are some) */}
      {testimonials && testimonials.length > 0 && (
        <section className="section-alt" aria-labelledby="home-testimonials-title">
          <div className="section-container">
            <SectionHead id="home-testimonials-title" title="What donors say" />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {testimonials.slice(0, 3).map((testimonial) => {
                const imageUrl = getOptimizedImageUrl(testimonial.image, IMAGE_WIDTHS.THUMB, 'testimonials')
                const videoUrl = getTestimonialVideoUrl(testimonial.video_filename)
                const rating = testimonial.rating ? Math.max(0, Math.min(5, Math.round(testimonial.rating))) : 0

                return (
                  <figure key={testimonial.id} className="card flex flex-col">
                    {videoUrl && (
                      <div className="mb-5 rounded-lg overflow-hidden bg-gray-900 aspect-video">
                        <PlayableVideo videoSrc={videoUrl} title={`${testimonial.name} testimonial`} className="w-full h-full" />
                      </div>
                    )}
                    {rating > 0 && (
                      <div className="flex mb-4" role="img" aria-label={`Rated ${rating} out of 5`}>
                        {Array.from({ length: rating }).map((_, i) => (
                          <Star key={i} className="w-4 h-4 text-amber-500 fill-current" aria-hidden="true" />
                        ))}
                      </div>
                    )}
                    <blockquote className="text-gray-700 leading-relaxed flex-1">
                      <p>“{testimonial.text}”</p>
                    </blockquote>
                    <figcaption className="mt-5 pt-4 border-t border-gray-100 flex items-center gap-3">
                      {!videoUrl && imageUrl && (
                        <img
                          src={imageUrl}
                          alt=""
                          className="w-12 h-12 rounded-full object-cover"
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none'
                          }}
                        />
                      )}
                      <span>
                        <span className="block font-semibold text-gray-900">{testimonial.name}</span>
                        {testimonial.country && (
                          <span className="block text-sm text-gray-500">{testimonial.country}</span>
                        )}
                      </span>
                    </figcaption>
                  </figure>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* Gallery (hidden when there is nothing to show) */}
      <GallerySection />

      {/* Closing call to action (the only one on the page) */}
      <section className="section hero-gradient text-white" aria-labelledby="home-cta-title">
        <div className="section-container text-center">
          <h2 id="home-cta-title" className="section-title text-white">
            Give your zakat or sadaqa
          </h2>
          <p className="mt-3 text-lg text-white/90 max-w-2xl mx-auto">
            Pick a project or give to where the need is greatest. You get a receipt by email.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link to="/donate" className="btn-inverse btn-lg">
              Donate Now
            </Link>
            <Link to="/zakat-calculator" className="btn btn-lg border border-white/60 text-white hover:bg-white/10">
              Calculate My Zakat
            </Link>
          </div>
        </div>
      </section>

    </div>
  )
}

const GallerySection = () => {
  const [selectedMediaIndex, setSelectedMediaIndex] = useState<number | null>(null)
  const [showAll, setShowAll] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  const { data: galleryItems = [], isLoading } = useQuery<GalleryItem[]>('public-gallery', () => galleryAPI.getAll(true))

  // Helper function to get media URL - check if it's a filename or URL
  const getMediaUrl = (filename: string): { url: string; isVideo: boolean } => {
    // Check if it's a full URL (starts with http:// or https://)
    if (filename.startsWith('http://') || filename.startsWith('https://')) {
      // Extract filename from URL if it's a backend proxy URL
      const urlParts = filename.split('/')
      const actualFilename = urlParts[urlParts.length - 1]

      // Determine if it's a video based on extension or URL path
      const isVideo = filename.includes('/videos/') ||
                     filename.includes('youtube.com') ||
                     filename.includes('youtu.be') ||
                     filename.includes('vimeo.com') ||
                     actualFilename.match(/\.(mp4|webm|ogg|avi|mov)$/i)

      // If it's a backend proxy URL, use it directly
      // Otherwise, it might be an external URL (YouTube, etc.)
      return { url: filename, isVideo: !!isVideo }
    }

    // Otherwise, treat it as a filename and determine if it's video or image
    const isVideo = filename.match(/\.(mp4|webm|ogg|avi|mov)$/i)
    const url = isVideo
      ? getStaticFileUrl(`/api/uploads/media/videos/${filename}`)
      : getStaticFileUrl(`/api/uploads/media/images/${filename}`)

    return { url, isVideo: !!isVideo }
  }

  const processedItems = galleryItems.map((item) => {
    const mediaInfo = getMediaUrl(item.media_filename)
    // For image gallery items, append ?w=400 for thumbnail optimization
    const thumbUrl = !mediaInfo.isVideo && mediaInfo.url && !mediaInfo.url.startsWith('http://') && !mediaInfo.url.startsWith('https://')
      ? `${mediaInfo.url}${mediaInfo.url.includes('?') ? '&' : '?'}w=${IMAGE_WIDTHS.THUMB}`
      : mediaInfo.url
    return {
      id: item.id,
      url: mediaInfo.url,
      type: mediaInfo.isVideo ? 'video' : 'image' as 'image' | 'video',
      thumbnail: mediaInfo.isVideo ? (item.thumbnail_url || null) : thumbUrl, // Use backend-generated thumbnail for videos
    }
  })

  const selectedMedia = selectedMediaIndex !== null ? processedItems[selectedMediaIndex] : null
  const isOpen = selectedMedia !== null

  const goToPrevious = () => {
    if (selectedMediaIndex === null) return
    const newIndex = selectedMediaIndex > 0 ? selectedMediaIndex - 1 : processedItems.length - 1
    setSelectedMediaIndex(newIndex)
  }

  const goToNext = () => {
    if (selectedMediaIndex === null) return
    const newIndex = selectedMediaIndex < processedItems.length - 1 ? selectedMediaIndex + 1 : 0
    setSelectedMediaIndex(newIndex)
  }

  const close = () => setSelectedMediaIndex(null)

  // Move focus into the viewer when it opens, and back to the tile that opened it when it closes.
  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.focus()
    } else if (openerRef.current) {
      openerRef.current.focus()
      openerRef.current = null
    }
  }, [isOpen])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (selectedMediaIndex === null) return
    if (e.key === 'ArrowLeft') goToPrevious()
    if (e.key === 'ArrowRight') goToNext()
    if (e.key === 'Escape') close()
  }

  if (!isLoading && processedItems.length === 0) return null

  const visibleItems = showAll ? processedItems : processedItems.slice(0, GALLERY_PREVIEW_COUNT)
  const hiddenCount = processedItems.length - visibleItems.length

  return (
    <section id="our-work-in-action" className="section scroll-mt-20" aria-labelledby="home-gallery-title">
      <div className="section-container">
        <SectionHead id="home-gallery-title" title="Photos and videos from our work" />
        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4" role="status">
            <span className="sr-only">Loading gallery</span>
            {[0, 1, 2].map((i) => (
              <div key={i} className="aspect-square rounded-xl bg-gray-100" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {visibleItems.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  className="group relative aspect-square bg-gray-100 rounded-xl overflow-hidden"
                  onClick={(e) => {
                    openerRef.current = e.currentTarget
                    setSelectedMediaIndex(index)
                  }}
                  aria-label={item.type === 'video' ? `Play video ${index + 1}` : `Open photo ${index + 1}`}
                >
                  {item.type === 'video' ? (
                    item.thumbnail ? (
                      // Use backend-generated thumbnail if available
                      <img
                        src={item.thumbnail}
                        alt=""
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                        }}
                      />
                    ) : (
                      // Fallback to client-side generation if no thumbnail
                      <VideoThumbnail
                        videoSrc={item.url}
                        className="w-full h-full"
                        alt=""
                      />
                    )
                  ) : (
                    <img
                      src={item.thumbnail || item.url}
                      alt=""
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                      onError={(e) => {
                        // Hide image if it fails to load instead of trying placeholder
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  )}
                  {item.type === 'video' && item.thumbnail && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/20" aria-hidden="true">
                      <span className="bg-white/90 rounded-full p-3 shadow-md">
                        <Play className="w-7 h-7 text-primary-700 ml-0.5" />
                      </span>
                    </span>
                  )}
                </button>
              ))}
            </div>

            {hiddenCount > 0 && (
              <div className="mt-6 text-center">
                <button type="button" className="btn-secondary" onClick={() => setShowAll(true)}>
                  Show all ({processedItems.length})
                </button>
              </div>
            )}

            {/* Media viewer with navigation */}
            {selectedMedia && selectedMediaIndex !== null && (
              <div
                ref={dialogRef}
                className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4 outline-none"
                role="dialog"
                aria-modal="true"
                aria-label={`Gallery, item ${selectedMediaIndex + 1} of ${processedItems.length}`}
                onClick={close}
                onKeyDown={handleKeyDown}
                tabIndex={-1}
              >
                <div className="relative max-w-6xl max-h-full w-full flex items-center">
                  {/* Previous Button */}
                  {processedItems.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        goToPrevious()
                      }}
                      className="absolute left-4 text-white bg-black/50 rounded-full p-3 hover:bg-black/75 transition-colors z-10"
                      aria-label="Previous"
                    >
                      <ChevronLeft className="w-8 h-8" aria-hidden="true" />
                    </button>
                  )}

                  {/* Media Content */}
                  <div className="flex-1 flex items-center justify-center">
                    {selectedMedia.type === 'video' ? (
                      <div className="aspect-video bg-black rounded-lg overflow-hidden w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
                        <LazyVideo
                          src={selectedMedia.url}
                          className="w-full h-full"
                          controls={true}
                          autoPlay={true}
                          playsInline={true}
                        />
                      </div>
                    ) : (
                      <img
                        src={selectedMedia.url}
                        alt={`Gallery image ${selectedMediaIndex + 1}`}
                        className="max-w-full max-h-[90vh] object-contain rounded-lg"
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                  </div>

                  {/* Next Button */}
                  {processedItems.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        goToNext()
                      }}
                      className="absolute right-4 text-white bg-black/50 rounded-full p-3 hover:bg-black/75 transition-colors z-10"
                      aria-label="Next"
                    >
                      <ChevronRight className="w-8 h-8" aria-hidden="true" />
                    </button>
                  )}

                  {/* Close Button */}
                  <button
                    type="button"
                    onClick={close}
                    className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-2 hover:bg-black/75 transition-colors z-10"
                    aria-label="Close"
                  >
                    <X className="w-6 h-6" aria-hidden="true" />
                  </button>

                  {/* Counter */}
                  {processedItems.length > 1 && (
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white bg-black/50 rounded-full px-4 py-2 text-sm">
                      {selectedMediaIndex + 1} / {processedItems.length}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}

export default Home
