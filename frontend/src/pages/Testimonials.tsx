import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import { Star, MapPin } from 'lucide-react'
import { testimonialsAPI } from '../utils/api'
import { getOptimizedImageUrl, IMAGE_WIDTHS } from '../utils/mediaHelpers'
import VideoThumbnail from '../components/VideoThumbnail'
import type { Testimonial } from '../types'
import SEOHead from '../components/SEOHead'
import PageHeader from '../components/ui/PageHeader'
import { defineMessages, useT, type Message } from '../i18n'

const M = defineMessages({
  pageTitle: { en: 'What People Say', ar: 'ماذا يقولون عنّا' },
  seoTitle: { en: 'Testimonials', ar: 'شهادات' },
  seoDescription: {
    en: 'Read testimonials from donors and beneficiaries of MyZakat. Discover why supporters trust us with their Zakat and Sadaqa contributions.',
    ar: 'اقرأ شهادات المتبرعين والمستفيدين من ماي زكاة، واعرف لماذا يأتمننا الداعمون على زكاتهم وصدقاتهم.',
  },
  loading: { en: 'Loading testimonials', ar: 'جارٍ تحميل الشهادات' },
  loadError: { en: 'Error loading testimonials. Please try again later.', ar: 'تعذّر تحميل الشهادات. يُرجى المحاولة لاحقًا.' },
  shareExperience: { en: 'Share your experience', ar: 'شاركنا تجربتك' },
  /** {link} is replaced by the "Share your experience" link. */
  workedWithUs: { en: 'Worked with us or received support? {link}.', ar: 'عملت معنا أو تلقيت دعمًا منّا؟ {link}.' },
  noTestimonials: { en: 'No testimonials published yet.', ar: 'لم تُنشر أي شهادة بعد.' },
  playVideo: { en: 'Play video: {name}', ar: 'تشغيل الفيديو: {name}' },
  videoAlt: { en: '{name} testimonial video', ar: 'فيديو شهادة {name}' },
  videoFailed: { en: 'Video failed to load', ar: 'تعذّر تحميل الفيديو' },
  rated: { en: 'Rated {stars} out of 5', ar: 'التقييم: {stars} من 5' },
  donor: { en: 'Donor', ar: 'متبرّع' },
  volunteer: { en: 'Volunteer', ar: 'متطوّع' },
  beneficiary: { en: 'Beneficiary', ar: 'مستفيد' },
})

const PAGE_TITLE = M.pageTitle

const CATEGORY_LABELS: Record<string, Message> = {
  donor: M.donor,
  volunteer: M.volunteer,
  beneficiary: M.beneficiary,
}

const Testimonials = () => {
  const t = useT()
  const { data: testimonials, isLoading, error } = useQuery('public-testimonials', () =>
    testimonialsAPI.getAll(true) // Get only approved testimonials
  )

  // Helper function to get image URL with THUMB optimization
  const getImageUrl = (imageValue?: string) => {
    return getOptimizedImageUrl(imageValue, IMAGE_WIDTHS.THUMB, 'testimonials')
  }

  // Helper function to get video URL
  const getVideoUrl = (videoFilename?: string) => {
    if (!videoFilename) return null
    // Videos can't go through image optimizer - use getOptimizedImageUrl with width 0 (no resize)
    return getOptimizedImageUrl(videoFilename, 0, 'testimonials')
  }

  const seo = (
    <SEOHead
      title={t(M.seoTitle)}
      description={t(M.seoDescription)}
      canonicalPath="/testimonials"
    />
  )

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white">
        {seo}
        <PageHeader title={t(PAGE_TITLE)} />
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
        <PageHeader title={t(PAGE_TITLE)} />
        <div className="section-container section">
          <p className="alert-error" role="alert">{t(M.loadError)}</p>
        </div>
      </div>
    )
  }

  const shareLink = (
    <Link to="/contact" className="link">{t(M.shareExperience)}</Link>
  )
  const [shareBefore, shareAfter = ''] = t(M.workedWithUs).split('{link}')

  return (
    <div className="min-h-screen bg-white">
      {seo}
      <PageHeader title={t(PAGE_TITLE)} />

      <div className="section-container section">
        {testimonials && testimonials.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {testimonials.map((testimonial: Testimonial) => {
                const imageUrl = getImageUrl(testimonial.image)
                const videoUrl = getVideoUrl(testimonial.video_filename)
                const stars = typeof testimonial.rating === 'number'
                  ? Math.max(0, Math.min(5, Math.round(testimonial.rating)))
                  : 0
                return (
                  <figure key={testimonial.id} className="card flex flex-col">
                    {/* Video: click to load and play in place */}
                    {videoUrl && (
                      <div
                        className="mb-6 rounded-lg overflow-hidden bg-gray-900 relative cursor-pointer"
                        role="button"
                        tabIndex={0}
                        aria-label={t(M.playVideo, { name: testimonial.name })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            e.currentTarget.click()
                          }
                        }}
                        onClick={(e) => {
                          const container = e.currentTarget
                          if (container.querySelector('video')) return

                          const video = document.createElement('video')
                          video.src = videoUrl
                          video.className = 'w-full aspect-video object-cover'
                          video.controls = true
                          video.playsInline = true
                          video.preload = 'auto'
                          video.muted = false

                          const loadingDiv = document.createElement('div')
                          loadingDiv.className = 'absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 z-10'
                          loadingDiv.innerHTML = '<div class="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin"></div>'
                          container.innerHTML = ''
                          container.appendChild(loadingDiv)
                          container.appendChild(video)

                          video.addEventListener('canplay', () => {
                            loadingDiv.remove()
                            video.play().catch(() => {})
                          }, { once: true })

                          video.addEventListener('error', () => {
                            loadingDiv.remove()
                            container.innerHTML = `<div class="w-full h-full flex items-center justify-center bg-gray-900 text-white">${t(M.videoFailed)}</div>`
                          }, { once: true })
                        }}
                        onMouseEnter={(e) => {
                          const container = e.currentTarget
                          if (!container.querySelector('video') && videoUrl) {
                            const preloadVideo = document.createElement('video')
                            preloadVideo.src = videoUrl
                            preloadVideo.preload = 'auto'
                            preloadVideo.style.display = 'none'
                            document.body.appendChild(preloadVideo)
                            setTimeout(() => {
                              if (preloadVideo.parentNode) {
                                preloadVideo.parentNode.removeChild(preloadVideo)
                              }
                            }, 30000)
                          }
                        }}
                      >
                        <VideoThumbnail
                          videoSrc={videoUrl}
                          className="w-full aspect-video object-cover"
                          alt={t(M.videoAlt, { name: testimonial.name })}
                        />
                      </div>
                    )}

                    {/* Photo (only if no video) */}
                    {!videoUrl && imageUrl && (
                      <div className="mb-6 flex justify-center">
                        <img
                          src={imageUrl}
                          alt=""
                          loading="lazy"
                          className="w-20 h-20 rounded-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none'
                          }}
                        />
                      </div>
                    )}

                    {/* Stars only when the testimonial actually carries a rating. */}
                    {stars > 0 && (
                      <div className="flex justify-center mb-4" role="img" aria-label={t(M.rated, { stars })}>
                        {[...Array(stars)].map((_, i) => (
                          <Star key={i} className="w-5 h-5 text-amber-400 fill-current mx-0.5" aria-hidden="true" />
                        ))}
                      </div>
                    )}

                    <blockquote className="mb-6 flex-1">
                      <p dir="auto" className="text-gray-700 text-center leading-relaxed">
                        &ldquo;{testimonial.text}&rdquo;
                      </p>
                    </blockquote>

                    <figcaption className="text-center">
                      <p className="font-semibold text-gray-900 text-lg mb-1">{testimonial.name}</p>
                      {testimonial.country && (
                        <p className="flex items-center justify-center text-sm text-gray-600">
                          <MapPin className="w-4 h-4 me-1" aria-hidden="true" />
                          <span>{testimonial.country}</span>
                        </p>
                      )}
                      {testimonial.category && (
                        <div className="mt-2">
                          <span className="badge-primary">
                            {CATEGORY_LABELS[testimonial.category] ? t(CATEGORY_LABELS[testimonial.category]) : testimonial.category}
                          </span>
                        </div>
                      )}
                    </figcaption>
                  </figure>
                )
              })}
            </div>
            <p className="mt-12 text-center text-gray-600">
              {shareBefore}{shareLink}{shareAfter}
            </p>
          </>
        ) : (
          <div className="text-center py-8">
            <p className="text-lg text-gray-700">{t(M.noTestimonials)}</p>
            <p className="mt-2 text-gray-600">{shareBefore}{shareLink}{shareAfter}</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default Testimonials
