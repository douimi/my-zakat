import { useState, useEffect, useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import { slideshowAPI, getStaticFileUrl } from '../utils/api'
import PageHeader from './ui/PageHeader'
import { defineMessages, useDir, useT } from '../i18n'

const M = defineMessages({
  loading: { en: 'Loading', ar: 'جارٍ التحميل' },
  carousel: { en: 'Highlights', ar: 'أبرز ما لدينا' },
  carouselRole: { en: 'carousel', ar: 'عرض شرائح' },
  slideRole: { en: 'slide', ar: 'شريحة' },
  slidePosition: { en: '{current} of {total}', ar: '{current} من {total}' },
  counter: { en: '{current} / {total}', ar: '{current} من {total}' },
  previous: { en: 'Previous slide', ar: 'الشريحة السابقة' },
  next: { en: 'Next slide', ar: 'الشريحة التالية' },
  pause: { en: 'Pause slideshow', ar: 'إيقاف العرض مؤقتًا' },
  play: { en: 'Play slideshow', ar: 'تشغيل العرض' },
  goTo: { en: 'Go to slide {n}', ar: 'الانتقال إلى الشريحة {n}' },
})

interface SlideshowSlide {
  id: number
  title: string
  description?: string
  image_filename?: string
  image_url?: string
  cta_text?: string
  cta_url?: string
  display_order: number
  is_active: boolean
  updated_at?: string
}

interface SlideshowProps {
  /**
   * The page's h1. While slides exist it is visually hidden (slide titles rotate, so they
   * cannot be the h1); when the admin has no active slides it is shown in a plain header.
   */
  heading: string
  /** Shown under the heading only when there are no slides. */
  emptyDescription?: ReactNode
  /** Actions shown under the heading only when there are no slides. */
  emptyActions?: ReactNode
}

const AUTO_ADVANCE_MS = 8000
/** Above this many slides, the dot row would overflow; a "3 / 12" counter is shown instead. */
const MAX_DOTS = 10

// Append a cache-busting version param to a URL so a freshly-updated slide
// image isn't served from a stale browser/CDN cache. Uses the slide's
// updated_at when available so the URL only changes when the slide actually
// changes — clients still benefit from caching between updates.
function bustCache(url: string, version: string | number | undefined): string {
  if (!url || !version) return url
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}v=${encodeURIComponent(String(version))}`
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const Slideshow = ({ heading, emptyDescription, emptyActions }: SlideshowProps) => {
  const [slides, setSlides] = useState<SlideshowSlide[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  // Autoplay is on unless the visitor asked for reduced motion; the pause button toggles it.
  const [isPlaying, setIsPlaying] = useState(() => !prefersReducedMotion())
  // Hovering or focusing inside the carousel pauses it too (WCAG 2.2.2), without changing the button state.
  const [isInteracting, setIsInteracting] = useState(false)
  const regionRef = useRef<HTMLElement>(null)
  const t = useT()
  const dir = useDir()

  useEffect(() => {
    fetchSlides()
  }, [])

  const isRunning = slides.length > 1 && isPlaying && !isInteracting

  useEffect(() => {
    if (!isRunning) return
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % slides.length)
    }, AUTO_ADVANCE_MS)
    return () => clearInterval(interval)
  }, [isRunning, slides.length])

  const fetchSlides = async () => {
    try {
      const data = await slideshowAPI.getAll(true) // Only active slides
      setSlides(data.sort((a: SlideshowSlide, b: SlideshowSlide) => a.display_order - b.display_order))
    } catch (error) {
      console.error('Error fetching slideshow slides:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const goToSlide = (index: number) => {
    if (index >= 0 && index < slides.length) {
      setCurrentIndex(index)
    }
  }

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev - 1 + slides.length) % slides.length)
  }

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % slides.length)
  }

  if (isLoading) {
    return (
      <div className="w-full h-96 md:h-[500px] lg:h-[600px] bg-gray-100" role="status">
        <h1 className="sr-only">{heading}</h1>
        <span className="sr-only">{t(M.loading)}</span>
      </div>
    )
  }

  if (slides.length === 0) {
    return <PageHeader title={heading} description={emptyDescription} actions={emptyActions} />
  }

  const currentSlide = slides[Math.min(currentIndex, slides.length - 1)]
  // Use image_url if available, otherwise fall back to image_filename, then default
  // Append ?w=1200 for hero-sized images to avoid loading full 1920px originals
  const getSlideImageUrl = () => {
    if (currentSlide.image_url) {
      return currentSlide.image_url
    }
    if (currentSlide.image_filename) {
      if (currentSlide.image_filename.startsWith('http://') || currentSlide.image_filename.startsWith('https://')) {
        return currentSlide.image_filename
      }
      return `${getStaticFileUrl(`/api/uploads/media/images/${currentSlide.image_filename}`)}?w=1200`
    }
    return 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=1200&h=600&fit=crop'
  }
  // Encode unsafe characters (spaces, etc.) so CSS background-image: url(...) doesn't
  // silently fail. encodeURI preserves already-encoded sequences, so it's idempotent.
  // Cache-bust with the slide's updated_at — guarantees that re-uploading an
  // image to the same S3 key still shows the new version on next load.
  const versionKey = currentSlide.updated_at ? new Date(currentSlide.updated_at).getTime() : currentSlide.id
  const imageUrl = bustCache(encodeURI(getSlideImageUrl()), versionKey)

  // Reset animation when slide changes by using a key
  const slideKey = `slide-${currentSlide.id}-${currentIndex}`
  const hasControls = slides.length > 1
  const showDots = slides.length <= MAX_DOTS

  return (
    <section
      ref={regionRef}
      className="relative w-full h-96 md:h-[500px] lg:h-[600px] overflow-hidden bg-gray-900"
      aria-roledescription={t(M.carouselRole)}
      aria-label={t(M.carousel)}
      onMouseEnter={() => setIsInteracting(true)}
      onMouseLeave={() => setIsInteracting(false)}
      onFocus={() => setIsInteracting(true)}
      onBlur={(e) => {
        if (!regionRef.current?.contains(e.relatedTarget as Node | null)) setIsInteracting(false)
      }}
    >
      <h1 className="sr-only">{heading}</h1>

      {/* Slide Image */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `url("${imageUrl}")`,
        }}
      >
        <div className={`absolute inset-0 ${dir === 'rtl' ? 'bg-gradient-to-l' : 'bg-gradient-to-r'} from-black/70 via-black/50 to-black/10`}></div>
      </div>

      {/* Content Overlay */}
      <div className="relative z-10 h-full flex items-center">
        <div className="section-container w-full">
          <div
            key={slideKey}
            className="max-w-2xl text-white px-10 sm:px-12 lg:px-14"
            aria-roledescription={t(M.slideRole)}
            aria-label={t(M.slidePosition, { current: currentIndex + 1, total: slides.length })}
            aria-live={isRunning ? 'off' : 'polite'}
          >
            <h2 className="text-3xl md:text-5xl lg:text-6xl font-heading font-bold mb-4 animate-fade-in">
              {currentSlide.title}
            </h2>
            {currentSlide.description && (
              <p
                className="text-lg md:text-xl mb-8 text-gray-100 line-clamp-3 animate-fade-in"
                style={{ animationDelay: '0.2s' }}
              >
                {currentSlide.description}
              </p>
            )}
            {currentSlide.cta_text && currentSlide.cta_url ? (
              <div className="animate-fade-in" style={{ animationDelay: '0.4s' }}>
                <Link to={currentSlide.cta_url} className="btn-primary btn-lg">
                  {currentSlide.cta_text}
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {hasControls && (
        <>
          {/* Navigation Arrows */}
          <button
            type="button"
            onClick={goToPrevious}
            className="absolute start-2 sm:start-4 top-1/2 -translate-y-1/2 z-20 bg-black/40 hover:bg-black/60 text-white p-2 rounded-full transition-colors"
            aria-label={t(M.previous)}
          >
            <ChevronLeft className="w-6 h-6" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={goToNext}
            className="absolute end-2 sm:end-4 top-1/2 -translate-y-1/2 z-20 bg-black/40 hover:bg-black/60 text-white p-2 rounded-full transition-colors"
            aria-label={t(M.next)}
          >
            <ChevronRight className="w-6 h-6" aria-hidden="true" />
          </button>

          {/* Pause / play + slide indicators */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 rounded-full bg-black/40 px-2 pe-3 sm:pe-2">
            <button
              type="button"
              onClick={() => setIsPlaying((p) => !p)}
              className="p-2 text-white"
              aria-label={isPlaying ? t(M.pause) : t(M.play)}
            >
              {isPlaying ? <Pause className="w-4 h-4" aria-hidden="true" /> : <Play className="w-4 h-4" aria-hidden="true" />}
            </button>
            {/* Dots fit up to MAX_DOTS slides on tablet and up; otherwise (and on phones) a counter
                stands in, so the control row never overflows the screen. Arrows still reach every slide. */}
            <span className={`px-1 text-sm font-medium text-white tabular-nums ${showDots ? 'sm:hidden' : ''}`} aria-hidden="true">
              {t(M.counter, { current: currentIndex + 1, total: slides.length })}
            </span>
            {showDots && slides.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => goToSlide(index)}
                className="group p-2 hidden sm:block"
                aria-label={t(M.goTo, { n: index + 1 })}
                aria-current={index === currentIndex ? 'true' : undefined}
              >
                <span
                  className={`block h-2.5 rounded-full transition-all duration-300 ${
                    index === currentIndex ? 'w-8 bg-white' : 'w-2.5 bg-white/60 group-hover:bg-white/90'
                  }`}
                />
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

export default Slideshow
