import { useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from 'react-query'
import { programsAPI, getStaticFileUrl } from '../utils/api'
import { Heart, Calendar } from 'lucide-react'
import LazyVideo from '../components/LazyVideo'
import VideoThumbnail from '../components/VideoThumbnail'

const ProgramDetail = () => {
  const { slug } = useParams<{ slug: string }>()
  const jsRef = useRef<HTMLScriptElement | null>(null)
  const cssRef = useRef<HTMLStyleElement | null>(null)

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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (error || !program) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Program Not Found</h1>
          <Link to="/programs" className="text-primary-600 hover:text-primary-700">
            Return to Programs
          </Link>
        </div>
      </div>
    )
  }

  const videoUrl = getVideoUrl(program.video_filename)
  const imageUrl = program.image_url

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      {(imageUrl || videoUrl) && (
        <div className="relative h-96 overflow-hidden">
          {videoUrl ? (
            <div className="relative w-full h-full group cursor-pointer" onClick={(e) => {
              // Replace thumbnail with actual video on click
              const container = e.currentTarget
              if (container.querySelector('video')) return // Already playing
              
              const video = document.createElement('video')
              video.src = videoUrl
              video.className = "w-full h-full object-cover"
              video.controls = true
              video.playsInline = true
              video.preload = "auto" // Preload entire video for faster playback
              video.muted = false
              
              // Show loading indicator
              const loadingDiv = document.createElement('div')
              loadingDiv.className = "absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 z-10"
              loadingDiv.innerHTML = '<div class="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin"></div>'
              container.innerHTML = ''
              container.appendChild(loadingDiv)
              container.appendChild(video)
              
              // Remove loading indicator when video can play
              video.addEventListener('canplay', () => {
                loadingDiv.remove()
                video.play().catch(() => {}) // Auto-play if possible
              }, { once: true })
              
              video.addEventListener('error', () => {
                loadingDiv.remove()
                container.innerHTML = '<div class="w-full h-full flex items-center justify-center bg-gray-900 text-white">Video failed to load</div>'
              }, { once: true })
            }}
            onMouseEnter={(e) => {
              // Preload video on hover for faster playback
              const container = e.currentTarget
              if (!container.querySelector('video') && videoUrl) {
                const preloadVideo = document.createElement('video')
                preloadVideo.src = videoUrl
                preloadVideo.preload = "auto"
                preloadVideo.style.display = "none"
                document.body.appendChild(preloadVideo)
                
                // Clean up after a delay
                setTimeout(() => {
                  if (preloadVideo.parentNode) {
                    preloadVideo.parentNode.removeChild(preloadVideo)
                  }
                }, 30000) // Keep preloaded for 30 seconds
              }
            }}>
              <VideoThumbnail
                videoSrc={videoUrl}
                className="w-full h-full"
                alt={`${program.title} video`}
              />
            </div>
          ) : (
            <img
              src={imageUrl}
              alt={program.title}
              className="w-full h-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent pointer-events-none"></div>
          <div className="absolute bottom-0 left-0 right-0 p-8 text-white pointer-events-none">
            <h1 className="text-4xl lg:text-5xl font-bold mb-2">{program.title}</h1>
            {program.short_description && (
              <p className="text-xl text-white/90">{program.short_description}</p>
            )}
          </div>
        </div>
      )}

      {/* Content Section */}
      <div className="section-container py-12">
        {/* Description */}
        {program.description && (
          <div className="mb-8">
            <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: program.description }} />
          </div>
        )}

        {/* Custom HTML Content */}
        {program.html_content && (
          <div className="mb-8">
            <div dangerouslySetInnerHTML={{ __html: program.html_content }} />
          </div>
        )}

        {/* Impact Text */}
        {program.impact_text && (
          <div className="mt-8 p-6 bg-primary-50 rounded-xl">
            <div className="flex items-center mb-2">
              <Heart className="w-6 h-6 text-primary-600 mr-2" />
              <h3 className="text-xl font-bold text-gray-900">Impact</h3>
            </div>
            <p className="text-lg text-gray-700">{program.impact_text}</p>
          </div>
        )}

        {/* CTAs */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link
            to="/donate"
            className="group bg-primary-600 hover:bg-primary-700 text-white font-semibold px-8 py-6 rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl flex items-center justify-center"
          >
            <Heart className="w-6 h-6 mr-3 group-hover:scale-110 transition-transform" />
            <span>Donate to This Program</span>
          </Link>
          <Link
            to="/volunteer"
            className="group bg-white hover:bg-gray-50 text-primary-600 border-2 border-primary-600 font-semibold px-8 py-6 rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl flex items-center justify-center"
          >
            <Calendar className="w-6 h-6 mr-3 group-hover:scale-110 transition-transform" />
            <span>Volunteer</span>
          </Link>
        </div>
      </div>
    </div>
  )
}

export default ProgramDetail

