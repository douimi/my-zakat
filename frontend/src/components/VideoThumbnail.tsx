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
      if (!videoRef.current || !canvasRef.current || !mounted) {
        console.log('VideoThumbnail: Missing refs or unmounted', { videoRef: !!videoRef.current, canvasRef: !!canvasRef.current, mounted })
        return
      }

      const video = videoRef.current
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')

      if (!ctx) {
        console.error('VideoThumbnail: Could not get canvas context')
        setIsGenerating(false)
        return
      }
      
      console.log('VideoThumbnail: Starting thumbnail generation for', videoSrc)

      const handleLoadedMetadata = () => {
        if (!video || !mounted) return
        try {
          // Try to seek to a specific time for thumbnail
          const duration = video.duration || 10
          const seekTime = Math.min(1, duration * 0.1)
          
          // Set up a timeout to capture frame if seek doesn't complete
          const seekTimeout = setTimeout(() => {
            if (mounted && !thumbnailUrl) {
              captureCurrentFrame()
            }
          }, 2000)
          
          const handleSeekComplete = () => {
            clearTimeout(seekTimeout)
            if (mounted) {
              captureCurrentFrame()
            }
          }
          
          video.addEventListener('seeked', handleSeekComplete, { once: true })
          
          // If video is already loaded enough, try to capture immediately
          if (video.readyState >= 2) { // HAVE_CURRENT_DATA
            try {
              video.currentTime = seekTime
            } catch (e) {
              clearTimeout(seekTimeout)
              video.removeEventListener('seeked', handleSeekComplete)
              // If seeking fails, try to capture current frame
              captureCurrentFrame()
            }
          } else {
            video.currentTime = seekTime
          }
        } catch (e) {
          // If seeking fails, try to capture current frame
          captureCurrentFrame()
        }
      }

      const captureCurrentFrame = () => {
        if (!video || !canvas || !ctx || !mounted) {
          setIsGenerating(false)
          return
        }
        
        try {
          // Wait a bit for video to be ready
          if (video.readyState < 2) {
            // Video not ready yet, wait for it
            const checkReady = setInterval(() => {
              if (video.readyState >= 2 && mounted) {
                clearInterval(checkReady)
                tryCapture()
              } else if (!mounted) {
                clearInterval(checkReady)
                setIsGenerating(false)
              }
            }, 100)
            
            setTimeout(() => {
              clearInterval(checkReady)
              if (mounted) {
                tryCapture()
              }
            }, 3000)
            return
          }
          
          tryCapture()
        } catch (error) {
          console.error('Error capturing video frame:', error)
          if (mounted) {
            setIsGenerating(false)
          }
        }
      }
      
      const tryCapture = () => {
        if (!video || !canvas || !ctx || !mounted) {
          setIsGenerating(false)
          return
        }
        
        try {
          // Some browsers need the video to play at least one frame
          // Try to play and pause immediately to ensure a frame is available
          const attemptCapture = () => {
            try {
              const width = video.videoWidth || 640
              const height = video.videoHeight || 360
              
              if (width > 0 && height > 0) {
                canvas.width = width
                canvas.height = height
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
                const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
                
                if (mounted && dataUrl && dataUrl !== 'data:,') {
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
                  video.pause()
                  return true
                }
              }
            } catch (error) {
              console.error('Error capturing frame:', error)
            }
            return false
          }
          
          // Try immediate capture first
          if (attemptCapture()) {
            return
          }
          
          // If that fails, try playing the video briefly
          if (video.paused) {
            video.play().then(() => {
              // Wait for a frame to be available
              setTimeout(() => {
                if (mounted) {
                  video.pause()
                  if (!attemptCapture()) {
                    setIsGenerating(false)
                  }
                }
              }, 100)
            }).catch((error) => {
              console.error('Error playing video for thumbnail:', error)
              // Try one more time without playing
              if (!attemptCapture()) {
                setIsGenerating(false)
              }
            })
          } else {
            // Video is already playing, just try to capture
            if (!attemptCapture()) {
              setIsGenerating(false)
            }
          }
        } catch (error) {
          console.error('Error in tryCapture:', error)
          if (mounted) {
            setIsGenerating(false)
          }
        }
      }

      const handleSeeked = () => {
        captureCurrentFrame()
      }

      const handleError = (e: Event) => {
        console.error('Video thumbnail generation error:', e, videoSrc)
        if (mounted) {
          setIsGenerating(false)
        }
      }

      video.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true })
      video.addEventListener('seeked', handleSeeked, { once: true })
      video.addEventListener('error', handleError, { once: true })
      video.addEventListener('loadeddata', () => {
        // If metadata loads but seek doesn't work, try to capture first frame
        if (!thumbnailUrl && mounted) {
          try {
            const width = video.videoWidth || 640
            const height = video.videoHeight || 360
            
            if (width > 0 && height > 0 && canvas && ctx) {
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
            }
          } catch (e) {
            // Ignore errors
          }
        }
      }, { once: true })
      
      video.preload = 'metadata'
      video.muted = true
      video.playsInline = true
      video.crossOrigin = videoSrc.startsWith('http://') || videoSrc.startsWith('https://') ? 'anonymous' : undefined
      
      // Set timeout
      const timeout = setTimeout(() => {
        if (mounted) {
          setIsGenerating(false)
        }
      }, 10000) // Increased to 10 seconds for slower connections

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
        preload="metadata"
        muted
        playsInline
        crossOrigin={videoSrc.startsWith('http://') || videoSrc.startsWith('https://') ? 'anonymous' : undefined}
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
