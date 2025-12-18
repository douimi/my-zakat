import { useState, useRef, useEffect } from 'react'
import { Play } from 'lucide-react'

interface VideoThumbnailProps {
  videoSrc: string
  className?: string
  alt?: string
  onThumbnailGenerated?: (thumbnailUrl: string) => void
}

const VideoThumbnail = ({ 
  videoSrc, 
  className = '', 
  alt = 'Video thumbnail',
  onThumbnailGenerated 
}: VideoThumbnailProps) => {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [hasError, setHasError] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Reset state when videoSrc changes
    setThumbnailUrl(null)
    setHasError(false)
    setIsGenerating(false)

    // Check if thumbnail is cached in localStorage
    const cacheKey = `video_thumbnail_${videoSrc}`
    const cachedThumbnail = localStorage.getItem(cacheKey)
    
    if (cachedThumbnail) {
      setThumbnailUrl(cachedThumbnail)
      if (onThumbnailGenerated) {
        onThumbnailGenerated(cachedThumbnail)
      }
      return
    }

    // Use Intersection Observer to only load video when component is visible
    let observer: IntersectionObserver | null = null
    let videoElement: HTMLVideoElement | null = null
    
    const setupObserver = () => {
      if (!containerRef.current) return
      
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && !thumbnailUrl && !isGenerating && !hasError) {
              // Component is visible, start loading video metadata
              videoElement = videoRef.current
              if (videoElement) {
                setIsGenerating(true)
                setupVideoListeners()
              }
              if (observer) {
                observer.disconnect()
                observer = null
              }
            }
          })
        },
        {
          rootMargin: '50px', // Start loading 50px before component enters viewport
          threshold: 0.01
        }
      )

      observer.observe(containerRef.current)
    }
    
    // Small delay to ensure DOM is ready
    const timer = setTimeout(setupObserver, 100)

    // Generate thumbnail from video
    const generateThumbnail = () => {
      if (!videoRef.current || !canvasRef.current) {
        setHasError(true)
        setIsGenerating(false)
        return
      }

      const video = videoRef.current
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')

      if (!ctx) {
        setHasError(true)
        setIsGenerating(false)
        return
      }

      try {
        // Set canvas dimensions to match video
        const width = video.videoWidth || 640
        const height = video.videoHeight || 360
        
        if (width === 0 || height === 0) {
          // Video dimensions not available yet
          return
        }
        
        canvas.width = width
        canvas.height = height

        // Draw video frame to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

        // Convert canvas to data URL
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
        
        // Cache the thumbnail
        try {
          localStorage.setItem(cacheKey, dataUrl)
        } catch (e) {
          // localStorage might be full, ignore
        }

        setThumbnailUrl(dataUrl)
        setIsGenerating(false)
        
        if (onThumbnailGenerated) {
          onThumbnailGenerated(dataUrl)
        }
      } catch (error) {
        console.error('Error generating thumbnail:', error)
        setHasError(true)
        setIsGenerating(false)
      }
    }

    const handleLoadedMetadata = () => {
      if (videoRef.current && videoRef.current.readyState >= 2) {
        // Seek to 1 second or 10% of video duration, whichever is smaller
        const duration = videoRef.current.duration || 10
        const seekTime = Math.min(1, duration * 0.1)
        try {
          videoRef.current.currentTime = seekTime
        } catch (e) {
          // If seeking fails, try to generate thumbnail from current frame
          setTimeout(() => generateThumbnail(), 100)
        }
      }
    }

    const handleSeeked = () => {
      generateThumbnail()
    }

    const handleError = (e: Event) => {
      console.error('Video thumbnail error:', e)
      setHasError(true)
      setIsGenerating(false)
    }

    const handleLoadedData = () => {
      // Fallback: if seeked didn't fire, try generating thumbnail after a short delay
      setTimeout(() => {
        if (!thumbnailUrl && !hasError) {
          generateThumbnail()
        }
      }, 200)
    }

    let timeoutId: NodeJS.Timeout | null = null
    
    const setupVideoListeners = () => {
      const video = videoRef.current
      if (video) {
        video.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true })
        video.addEventListener('seeked', handleSeeked, { once: true })
        video.addEventListener('error', handleError, { once: true })
        video.addEventListener('loadeddata', handleLoadedData, { once: true })
        
        // Use HEAD request approach: only load minimal metadata
        // Set preload to 'metadata' to load video metadata
        video.preload = 'metadata'
        video.muted = true
        video.playsInline = true
        
        // Try to set crossOrigin only if it's a cross-origin request
        try {
          if (videoSrc.startsWith('http://') || videoSrc.startsWith('https://')) {
            const url = new URL(videoSrc)
            if (url.origin !== window.location.origin) {
              video.crossOrigin = 'anonymous'
            }
          }
        } catch (e) {
          // URL parsing failed, skip crossOrigin
        }
        
        // Set timeout to prevent infinite loading
        timeoutId = setTimeout(() => {
          setHasError(true)
          setIsGenerating(false)
        }, 10000) // 10 second timeout

        // Load only metadata (not the full video)
        video.load()
      }
    }

    return () => {
      clearTimeout(timer)
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      if (observer) {
        observer.disconnect()
      }
      const video = videoRef.current
      if (video) {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata)
        video.removeEventListener('seeked', handleSeeked)
        video.removeEventListener('error', handleError)
        video.removeEventListener('loadeddata', handleLoadedData)
        video.src = ''
        video.load() // Reset video element
      }
    }
  }, [videoSrc]) // Only depend on videoSrc to avoid infinite loops

  if (hasError) {
    return (
      <div className={`${className} bg-gray-200 flex items-center justify-center relative`}>
        <div className="w-16 h-16 bg-white bg-opacity-90 rounded-full flex items-center justify-center">
          <Play className="w-8 h-8 text-primary-600 ml-1" />
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className={`${className} relative`}>
      {/* Hidden video element for thumbnail generation */}
      <video
        ref={videoRef}
        src={videoSrc}
        className="hidden"
        preload="none"
        muted
        playsInline
        crossOrigin="anonymous"
      />
      
      {/* Hidden canvas for thumbnail extraction */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Display thumbnail or placeholder */}
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt={alt}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={() => {
            setHasError(true)
            setThumbnailUrl(null)
          }}
        />
      ) : isGenerating ? (
        <div className="w-full h-full bg-gray-200 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="w-full h-full bg-gray-200 flex items-center justify-center">
          <div className="w-16 h-16 bg-white bg-opacity-90 rounded-full flex items-center justify-center">
            <Play className="w-8 h-8 text-primary-600 ml-1" />
          </div>
        </div>
      )}
      
      {/* Play button overlay - only show when thumbnail exists */}
      {thumbnailUrl && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-opacity duration-200 pointer-events-none">
          <div className="w-16 h-16 bg-white bg-opacity-90 rounded-full flex items-center justify-center opacity-70 group-hover:opacity-100 transition-opacity">
            <Play className="w-8 h-8 text-primary-600 ml-1" />
          </div>
        </div>
      )}
      
      {/* Loading indicator */}
      {isGenerating && !thumbnailUrl && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-200 bg-opacity-90">
          <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
    </div>
  )
}

export default VideoThumbnail

