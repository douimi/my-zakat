import { useState, useRef, useEffect } from 'react'
import { Play } from 'lucide-react'

interface LazyVideoProps {
  src: string
  className?: string
  controls?: boolean
  autoPlay?: boolean
  playsInline?: boolean
  poster?: string
  onError?: (e: React.SyntheticEvent<HTMLVideoElement, Event>) => void
}

const LazyVideo = ({ 
  src, 
  className = '', 
  controls = true, 
  autoPlay = false,
  playsInline = true,
  poster,
  onError 
}: LazyVideoProps) => {
  const [isInView, setIsInView] = useState(false)
  const [shouldLoad, setShouldLoad] = useState(false)
  const [hasError, setHasError] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let observer: IntersectionObserver | null = null
    let loadTimer: ReturnType<typeof setTimeout> | undefined

    const setupObserver = () => {
      if (!containerRef.current) return
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setIsInView(true)
              // Delay loading to prioritize page render and ensure page is interactive
              const delay = document.readyState === 'complete' ? 200 : 500
              loadTimer = setTimeout(() => {
                setShouldLoad(true)
              }, delay)
              observer?.disconnect()
            }
          })
        },
        {
          rootMargin: '100px', // Start loading 100px before video enters viewport
          threshold: 0.01
        }
      )
      observer.observe(containerRef.current)
    }

    // Wait for page to be interactive before setting up observer
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setupObserver)
    } else {
      setupObserver()
    }

    // Disconnect on unmount (the previous version returned this cleanup from the inner
    // function, where React never saw it, so observers outlived their component).
    return () => {
      document.removeEventListener('DOMContentLoaded', setupObserver)
      observer?.disconnect()
      if (loadTimer) clearTimeout(loadTimer)
    }
  }, [])

  const handleError = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    setHasError(true)
    if (onError) {
      onError(e)
    }
  }

  if (hasError) {
    return (
      <div className={className}>
        <div className="w-full h-full bg-gray-200 flex items-center justify-center">
          <span className="text-gray-500 text-sm">Video unavailable</span>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className={className}>
      {!shouldLoad ? (
        // Placeholder with poster or play button
        <div className="w-full h-full bg-gray-200 flex items-center justify-center relative">
          {poster ? (
            <img 
              src={poster} 
              alt="Video thumbnail" 
              className="w-full h-full object-cover"
              loading="lazy"
              onError={(e) => {
                // Hide broken poster image
                e.currentTarget.style.display = 'none'
              }}
            />
          ) : (
            <div className="w-14 h-14 bg-white/90 rounded-full flex items-center justify-center" aria-hidden="true">
              <Play className="w-7 h-7 text-primary-700 ml-1" />
            </div>
          )}
        </div>
      ) : (
        <video
          ref={videoRef}
          src={src}
          className={className}
          controls={controls}
          autoPlay={autoPlay}
          playsInline={playsInline}
          preload="none"
          poster={poster}
          onError={handleError}
          onLoadedData={() => {
            // Video loaded successfully
          }}
        >
          <source src={src} type="video/mp4" />
          Your browser does not support the video tag.
        </video>
      )}
    </div>
  )
}

export default LazyVideo

