import { useState, useRef, useEffect } from 'react'
import { Play } from 'lucide-react'

interface VideoThumbnailProps {
  videoSrc: string
  className?: string
  alt?: string
  poster?: string
  onThumbnailGenerated?: (thumbnailUrl: string) => void
}

const VideoThumbnail = ({ 
  videoSrc, 
  className = '', 
  alt = 'Video thumbnail',
  poster,
  onThumbnailGenerated 
}: VideoThumbnailProps) => {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(poster || null)
  const [isGenerating, setIsGenerating] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Try to generate thumbnail in background (non-blocking)
  useEffect(() => {
    // If poster is provided, use it immediately
    if (poster) {
      setThumbnailUrl(poster)
      return
    }

    // Check cache first
    const cacheKey = `video_thumbnail_${videoSrc}`
    const cachedThumbnail = localStorage.getItem(cacheKey)
    
    if (cachedThumbnail) {
      setThumbnailUrl(cachedThumbnail)
      if (onThumbnailGenerated) {
        onThumbnailGenerated(cachedThumbnail)
      }
      return
    }

    // Generate thumbnail in background (non-blocking)
    // Only start when component is visible
    let observer: IntersectionObserver | null = null
    let mounted = true
    
    const setupObserver = () => {
      if (!containerRef.current) return
      
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && !thumbnailUrl && !isGenerating && mounted) {
              setIsGenerating(true)
              generateThumbnail()
              if (observer) {
                observer.disconnect()
                observer = null
              }
            }
          })
        },
        {
          rootMargin: '200px', // Start earlier
          threshold: 0.01
        }
      )

      observer.observe(containerRef.current)
    }
    
    const timer = setTimeout(setupObserver, 50)

    const generateThumbnail = () => {
      if (!videoRef.current || !canvasRef.current || !mounted) return

      const video = videoRef.current
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')

      if (!ctx) {
        setIsGenerating(false)
        return
      }

      const handleLoadedMetadata = () => {
        if (!video || !mounted) return
        try {
          const duration = video.duration || 10
          const seekTime = Math.min(1, duration * 0.1)
          video.currentTime = seekTime
        } catch (e) {
          setIsGenerating(false)
        }
      }

      const handleSeeked = () => {
        if (!video || !canvas || !ctx || !mounted) {
          setIsGenerating(false)
          return
        }

        try {
          const width = video.videoWidth || 640
          const height = video.videoHeight || 360
          
          if (width === 0 || height === 0) {
            setIsGenerating(false)
            return
          }
          
          canvas.width = width
          canvas.height = height
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
          
          if (mounted) {
            try {
              localStorage.setItem(cacheKey, dataUrl)
            } catch (e) {
              // localStorage full, ignore
            }
            setThumbnailUrl(dataUrl)
            setIsGenerating(false)
            if (onThumbnailGenerated) {
              onThumbnailGenerated(dataUrl)
            }
          }
        } catch (error) {
          if (mounted) {
            setIsGenerating(false)
          }
        }
      }

      const handleError = () => {
        if (mounted) {
          setIsGenerating(false)
        }
      }

      video.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true })
      video.addEventListener('seeked', handleSeeked, { once: true })
      video.addEventListener('error', handleError, { once: true })
      
      video.preload = 'metadata'
      video.muted = true
      video.playsInline = true
      
      // Set timeout
      const timeout = setTimeout(() => {
        if (mounted) {
          setIsGenerating(false)
        }
      }, 5000) // Reduced to 5 seconds

      video.load()

      return () => {
        clearTimeout(timeout)
        video.removeEventListener('loadedmetadata', handleLoadedMetadata)
        video.removeEventListener('seeked', handleSeeked)
        video.removeEventListener('error', handleError)
      }
    }

    return () => {
      mounted = false
      clearTimeout(timer)
      if (observer) {
        observer.disconnect()
      }
    }
  }, [videoSrc, poster, thumbnailUrl, isGenerating, onThumbnailGenerated])

  return (
    <div ref={containerRef} className={`${className} relative bg-gray-200`}>
      {/* Hidden video for thumbnail generation */}
      <video
        ref={videoRef}
        src={videoSrc}
        className="hidden"
        preload="none"
        muted
        playsInline
      />
      <canvas ref={canvasRef} className="hidden" />

      {/* Display thumbnail or placeholder */}
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt={alt}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={() => {
            setThumbnailUrl(null)
          }}
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center">
          <div className="w-16 h-16 bg-white bg-opacity-90 rounded-full flex items-center justify-center shadow-lg">
            <Play className="w-8 h-8 text-primary-600 ml-1" />
          </div>
        </div>
      )}
      
      {/* Play button overlay - always visible */}
      <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-opacity duration-200 pointer-events-none">
        <div className="w-16 h-16 bg-white bg-opacity-90 rounded-full flex items-center justify-center opacity-70 group-hover:opacity-100 transition-opacity shadow-xl">
          <Play className="w-8 h-8 text-primary-600 ml-1" />
        </div>
      </div>
    </div>
  )
}

export default VideoThumbnail
