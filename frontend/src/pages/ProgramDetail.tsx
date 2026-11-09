import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from 'react-query'
import { programsAPI, getStaticFileUrl } from '../utils/api'
import { IMAGE_WIDTHS } from '../utils/mediaHelpers'
import { ArrowLeft } from 'lucide-react'
import { PlayableVideo } from '../components/VideoThumbnail'
import SEOHead from '../components/SEOHead'
import PageHeader from '../components/ui/PageHeader'
import Disclosure from '../components/ui/Disclosure'

/** Descriptions longer than this (in plain-text characters) start collapsed. */
const LONG_TEXT_CHARS = 320

const toPlainText = (html: string) =>
  html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

const ProgramDetail = () => {
  const { slug } = useParams<{ slug: string }>()
  const jsRef = useRef<HTMLScriptElement | null>(null)
  const cssRef = useRef<HTMLStyleElement | null>(null)
  // Once the hero video plays, drop the title overlay so it does not cover the player controls.
  const [heroPlaying, setHeroPlaying] = useState(false)

  const { data: program, isLoading, error } = useQuery(
    ['program', slug],
    () => programsAPI.getBySlug(slug!),
    {
      enabled: !!slug,
      retry: false,
    }
  )

  useEffect(() => {
    // Clean up any existing program CSS/JS from previous visits
    const existingStyles = document.querySelectorAll('style[id^="program-css-"]')
    existingStyles.forEach((style) => {
      style.remove()
    })

    const existingScripts = document.querySelectorAll('script[data-program]')
    existingScripts.forEach((script) => {
      script.remove()
    })

    // Inject CSS
    if (program?.css_content) {
      const styleId = `program-css-${program.id}`
      const styleElement = document.createElement('style')
      styleElement.id = styleId
      styleElement.textContent = program.css_content
      document.head.appendChild(styleElement)
      cssRef.current = styleElement
    }

    // Inject JS
    if (program?.js_content) {
      const script = document.createElement('script')
      script.setAttribute('data-program', 'true')
      script.textContent = program.js_content
      document.body.appendChild(script)
      jsRef.current = script
    }

    // Cleanup function
    return () => {
      if (cssRef.current && cssRef.current.parentNode) {
        cssRef.current.parentNode.removeChild(cssRef.current)
        cssRef.current = null
      }

      if (jsRef.current && jsRef.current.parentNode) {
        jsRef.current.parentNode.removeChild(jsRef.current)
        jsRef.current = null
      }
    }
  }, [program])

  const getVideoUrl = (filename?: string) => {
    if (!filename) return null
    if (filename.startsWith('http://') || filename.startsWith('https://')) {
      return filename
    }
    return getStaticFileUrl(`/api/uploads/programs/${filename}`)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" role="status">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" aria-hidden="true"></div>
        <span className="sr-only">Loading</span>
      </div>
    )
  }

  if (error || !program) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Program Not Found</h1>
          <Link to="/programs" className="link">
            Return to Programs
          </Link>
        </div>
      </div>
    )
  }

  const videoUrl = getVideoUrl(program.video_filename)
  const rawImageUrl = program.image_url
  const imageUrl = rawImageUrl && !rawImageUrl.startsWith('http://') && !rawImageUrl.startsWith('https://')
    ? `${rawImageUrl}${rawImageUrl.includes('?') ? '&' : '?'}w=${IMAGE_WIDTHS.LARGE}`
    : rawImageUrl
  const donateHref = `/donate?purpose=${encodeURIComponent(program.title)}`
  const descriptionText = program.description ? toPlainText(program.description) : ''

  return (
    <div className="min-h-screen bg-white">
      <SEOHead
        title={program.title}
        description={program.short_description || undefined}
        canonicalPath={`/programs/${slug}`}
      />

      {/* Hero: media with the title over it, or a plain header when there is no media */}
      {imageUrl || videoUrl ? (
        <div className="relative h-80 sm:h-96 overflow-hidden bg-gray-900">
          {videoUrl ? (
            <PlayableVideo videoSrc={videoUrl} title={program.title} className="w-full h-full" onPlay={() => setHeroPlaying(true)} />
          ) : (
            <img
              src={imageUrl || undefined}
              alt=""
              className="w-full h-full object-cover"
            />
          )}
          <div className={`absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent pointer-events-none ${heroPlaying ? 'hidden' : ''}`}></div>
          <div className={`absolute bottom-0 left-0 right-0 pointer-events-none ${heroPlaying ? 'sr-only' : ''}`}>
            <div className="section-container pb-8 text-white">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-heading font-bold mb-2">{program.title}</h1>
              {program.short_description && (
                <p className="text-lg sm:text-xl text-white/90 max-w-3xl line-clamp-3">{program.short_description}</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <PageHeader title={program.title} description={program.short_description} />
      )}

      <div className="section-container py-10 sm:py-12">
        <Link to="/programs" className="link inline-flex items-center gap-1.5 text-sm mb-8">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> All programs
        </Link>

        {/* Primary action, visible without expanding anything */}
        <div className="mb-10 flex flex-col sm:flex-row sm:items-center gap-4">
          <Link to={donateHref} className="btn-primary btn-lg">
            Donate to This Program
          </Link>
          <Link to="/volunteer" className="link">
            Volunteer
          </Link>
        </div>

        {/* Description: long text starts collapsed (owner rule) */}
        {program.description && (
          descriptionText.length > LONG_TEXT_CHARS ? (
            <Disclosure
              className="mb-8 max-w-4xl"
              title={`About ${program.title}`}
              summary={descriptionText}
            >
              <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: program.description }} />
            </Disclosure>
          ) : (
            <div className="prose max-w-none text-lg mb-8" dangerouslySetInnerHTML={{ __html: program.description }} />
          )
        )}

        {/* Custom HTML Content (admin-authored, may carry its own CSS/JS: rendered as is) */}
        {program.html_content && (
          <div className="mb-8">
            <div dangerouslySetInnerHTML={{ __html: program.html_content }} />
          </div>
        )}

        {/* Impact Text */}
        {program.impact_text && (
          <div className="card-tinted max-w-4xl">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-primary-700">Impact</h2>
            <p className="mt-1 text-lg font-semibold text-gray-900">{program.impact_text}</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default ProgramDetail
