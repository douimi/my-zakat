import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from 'react-query'
import { programCategoriesAPI, programsAPI, getStaticFileUrl } from '../utils/api'
import { IMAGE_WIDTHS } from '../utils/mediaHelpers'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import type { Program } from '../types'
import VideoThumbnail, { PlayableVideo } from '../components/VideoThumbnail'
import SEOHead from '../components/SEOHead'
import PageHeader from '../components/ui/PageHeader'
import Disclosure from '../components/ui/Disclosure'
import { defineMessages, useT } from '../i18n'
import { C } from '../i18n/common'

const M = defineMessages({
  loading: { en: 'Loading', ar: 'جارٍ التحميل' },
  notFound: { en: 'Category Not Found', ar: 'هذا المجال غير موجود' },
  returnToPrograms: { en: 'Return to Programs', ar: 'العودة إلى البرامج' },
  allPrograms: { en: 'All programs', ar: 'جميع البرامج' },
  about: { en: 'About {title}', ar: 'نبذة عن {title}' },
  ourImpact: { en: 'Our impact', ar: 'أثرنا' },
  programsIn: { en: 'Programs in {title}', ar: 'برامج {title}' },
  learnMore: { en: 'Learn More', ar: 'اعرف المزيد' },
  support: { en: 'Support {title}', ar: 'ادعم {title}' },
  donateTo: { en: 'Donate to {title}', ar: 'تبرّع لصالح {title}' },
})

/** Descriptions longer than this (in plain-text characters) start collapsed. */
const LONG_TEXT_CHARS = 320

const toPlainText = (html: string) =>
  html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

const CategoryDetail = () => {
  const { slug } = useParams<{ slug: string }>()
  const jsRef = useRef<HTMLScriptElement | null>(null)
  const cssRef = useRef<HTMLStyleElement | null>(null)
  // Once the hero video plays, drop the title overlay so it does not cover the player controls.
  const [heroPlaying, setHeroPlaying] = useState(false)
  const t = useT()

  const { data: category, isLoading, error } = useQuery(
    ['category', slug],
    () => programCategoriesAPI.getBySlug(slug!),
    {
      enabled: !!slug,
      retry: false,
    }
  )

  const { data: categoryPrograms } = useQuery<Program[]>(
    ['category-programs', category?.id],
    () => programsAPI.getAll(category?.id, true),
    {
      enabled: !!category?.id,
      retry: false,
    }
  )

  useEffect(() => {
    // Clean up ALL existing category CSS/JS (not just from this category)
    const existingStyles = document.querySelectorAll('style[id^="category-css-"]')
    existingStyles.forEach((style) => {
      style.remove()
    })

    const existingScripts = document.querySelectorAll('script[data-category]')
    existingScripts.forEach((script) => {
      script.remove()
    })

    // Reset refs
    cssRef.current = null
    jsRef.current = null

    // Inject CSS if it exists
    if (category?.css_content) {
      const styleId = `category-css-${category.id}`
      const styleElement = document.createElement('style')
      styleElement.id = styleId
      styleElement.textContent = category.css_content
      document.head.appendChild(styleElement)
      cssRef.current = styleElement
    }

    // Inject JS if it exists
    if (category?.js_content) {
      const script = document.createElement('script')
      script.setAttribute('data-category', 'true')
      script.setAttribute('data-category-id', category.id.toString())
      script.textContent = category.js_content
      document.body.appendChild(script)
      jsRef.current = script
    }

    // Cleanup function - always clean up on unmount or category change
    return () => {
      // Remove CSS
      const stylesToRemove = document.querySelectorAll('style[id^="category-css-"]')
      stylesToRemove.forEach((style) => {
        style.remove()
      })

      // Remove scripts
      const scriptsToRemove = document.querySelectorAll('script[data-category]')
      scriptsToRemove.forEach((script) => {
        script.remove()
      })

      cssRef.current = null
      jsRef.current = null
    }
  }, [category?.id, category?.css_content, category?.js_content])

  const getVideoUrl = (filename?: string) => {
    if (!filename) return null
    if (filename.startsWith('http://') || filename.startsWith('https://')) {
      return filename
    }
    return getStaticFileUrl(`/api/uploads/program_categories/${filename}`)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" role="status">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" aria-hidden="true"></div>
        <span className="sr-only">{t(M.loading)}</span>
      </div>
    )
  }

  if (error || !category) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">{t(M.notFound)}</h1>
          <Link to="/programs" className="link">
            {t(M.returnToPrograms)}
          </Link>
        </div>
      </div>
    )
  }

  const videoUrl = getVideoUrl(category.video_filename)
  const rawImageUrl = category.image_url
  const imageUrl = rawImageUrl && !rawImageUrl.startsWith('http://') && !rawImageUrl.startsWith('https://')
    ? `${rawImageUrl}${rawImageUrl.includes('?') ? '&' : '?'}w=${IMAGE_WIDTHS.LARGE}`
    : rawImageUrl
  const donateHref = `/donate?purpose=${encodeURIComponent(category.title)}`
  const descriptionText = category.description ? toPlainText(category.description) : ''

  return (
    <div className="min-h-screen bg-white">
      <SEOHead
        title={category.title}
        description={category.short_description || undefined}
        canonicalPath={`/categories/${slug}`}
      />

      {/* Hero: media with the title over it, or a plain header when there is no media */}
      {imageUrl || videoUrl ? (
        <div className="relative h-80 sm:h-96 overflow-hidden bg-gray-900">
          {videoUrl ? (
            <PlayableVideo videoSrc={videoUrl} title={category.title} className="w-full h-full" onPlay={() => setHeroPlaying(true)} />
          ) : (
            <img
              src={imageUrl || undefined}
              alt=""
              className="w-full h-full object-cover"
            />
          )}
          <div className={`absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent pointer-events-none ${heroPlaying ? 'hidden' : ''}`}></div>
          <div className={`absolute bottom-0 start-0 end-0 pointer-events-none ${heroPlaying ? 'sr-only' : ''}`}>
            <div className="section-container pb-8 text-white">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-heading font-bold mb-2">{category.title}</h1>
              {category.short_description && (
                <p className="text-lg sm:text-xl text-white/90 max-w-3xl line-clamp-3">{category.short_description}</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <PageHeader title={category.title} description={category.short_description} />
      )}

      <div className="section-container py-10 sm:py-12">
        <Link to="/programs" className="link inline-flex items-center gap-1.5 text-sm mb-8">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> {t(M.allPrograms)}
        </Link>

        {/* Description: long text starts collapsed (owner rule) */}
        {category.description && (
          descriptionText.length > LONG_TEXT_CHARS ? (
            <Disclosure
              className="mb-8 max-w-4xl"
              title={t(M.about, { title: category.title })}
              summary={descriptionText}
            >
              <div className="prose max-w-none" dir="auto" dangerouslySetInnerHTML={{ __html: category.description }} />
            </Disclosure>
          ) : (
            <div className="prose max-w-none text-lg mb-8" dir="auto" dangerouslySetInnerHTML={{ __html: category.description }} />
          )
        )}

        {/* Custom HTML Content (admin-authored, may carry its own CSS/JS: rendered as is) */}
        {category.html_content && (
          <div className="mb-8">
            <div dir="auto" dangerouslySetInnerHTML={{ __html: category.html_content }} />
          </div>
        )}

        {/* Impact Text */}
        {category.impact_text && (
          <div className="card-tinted mb-8 max-w-4xl">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-primary-700">{t(M.ourImpact)}</h2>
            <p className="mt-1 text-lg font-semibold text-gray-900">{category.impact_text}</p>
          </div>
        )}

        {/* Programs in this Category */}
        {categoryPrograms && categoryPrograms.length > 0 && (
          <section className="mt-12" aria-labelledby="category-programs-title">
            <h2 id="category-programs-title" className="section-title mb-6">{t(M.programsIn, { title: category.title })}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {categoryPrograms.map((program) => {
                const programVideoUrl = program.video_filename
                  ? getStaticFileUrl(`/api/uploads/programs/${program.video_filename}`)
                  : null
                const rawProgramImageUrl = program.image_url
                const programImageUrl = rawProgramImageUrl && !rawProgramImageUrl.startsWith('http://') && !rawProgramImageUrl.startsWith('https://')
                  ? `${rawProgramImageUrl}${rawProgramImageUrl.includes('?') ? '&' : '?'}w=${IMAGE_WIDTHS.THUMB}`
                  : rawProgramImageUrl

                return (
                  <Link
                    key={program.id}
                    to={`/programs/${program.slug}`}
                    className="card-media group"
                  >
                    {(programImageUrl || programVideoUrl) && (
                      <div className="relative h-48 overflow-hidden bg-gray-100">
                        {programVideoUrl ? (
                          // Thumbnail only: the video plays on the program page (no player inside a link).
                          <VideoThumbnail
                            videoSrc={programVideoUrl}
                            className="w-full h-full"
                            alt=""
                          />
                        ) : (
                          <img
                            src={programImageUrl || undefined}
                            alt=""
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            loading="lazy"
                          />
                        )}
                      </div>
                    )}
                    <div className="card-body">
                      <h3 className="card-title group-hover:text-primary-700">{program.title}</h3>
                      {program.impact_text && (
                        <p className="mt-2"><span className="badge-primary">{program.impact_text}</span></p>
                      )}
                      {program.short_description && (
                        <p className="mt-2 text-gray-600 line-clamp-3">{program.short_description}</p>
                      )}
                      <span className="mt-4 text-sm font-medium text-primary-700 inline-flex items-center gap-1">
                        {t(M.learnMore)} <ArrowRight className="w-4 h-4" aria-hidden="true" />
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {/* One call to action */}
        <section className="mt-12 rounded-xl hero-gradient text-white p-8 sm:p-10" aria-labelledby="category-cta-title">
          <h2 id="category-cta-title" className="text-2xl sm:text-3xl font-heading font-bold">{t(M.support, { title: category.title })}</h2>
          <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-4">
            <Link to={donateHref} className="btn-inverse btn-lg">
              {t(M.donateTo, { title: category.title })}
            </Link>
            <Link to="/volunteer" className="font-medium text-white underline underline-offset-2 hover:text-white/90">
              {t(C.volunteer)}
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}

export default CategoryDetail
