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
        console.log('VideoThumbnail: loadedmetadata', { 
          videoSrc, 
          duration: video.duration, 
          readyState: video.readyState,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight
        })
        
        try {
          // Try multiple strategies to get a frame
          const tryMultipleStrategies = () => {
            // Strategy 1: Try to capture current frame immediately
            if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
              console.log('VideoThumbnail: Strategy 1 - Immediate capture')
              if (captureCurrentFrame()) {
                return true
              }
            }
            
            // Strategy 2: Seek to a specific time
            try {
              const duration = video.duration || 10
              const seekTime = Math.min(1, duration * 0.1)
              console.log('VideoThumbnail: Strategy 2 - Seeking to', seekTime)
              video.currentTime = seekTime
              return false // Will be handled by seeked event
            } catch (e) {
              console.warn('VideoThumbnail: Seek failed', e)
            }
            
            // Strategy 3: Try playing briefly
            console.log('VideoThumbnail: Strategy 3 - Playing briefly')
            video.play().then(() => {
              setTimeout(() => {
                if (mounted) {
                  video.pause()
                  captureCurrentFrame()
                }
              }, 300)
            }).catch((err) => {
              console.error('VideoThumbnail: Play failed', err)
              setIsGenerating(false)
            })
            
            return false
          }
          
          // Set timeout as fallback
          const fallbackTimeout = setTimeout(() => {
            if (mounted && !thumbnailUrl) {
              console.log('VideoThumbnail: Fallback timeout - trying capture')
              captureCurrentFrame()
            }
          }, 3000)
          
          const handleSeekComplete = () => {
            clearTimeout(fallbackTimeout)
            if (mounted) {
              console.log('VideoThumbnail: Seek completed')
              captureCurrentFrame()
            }
          }
          
          video.addEventListener('seeked', handleSeekComplete, { once: true })
          
          // Try strategies
          if (!tryMultipleStrategies()) {
            // Strategies are async, wait for them
            setTimeout(() => {
              clearTimeout(fallbackTimeout)
            }, 5000)
          } else {
            clearTimeout(fallbackTimeout)
          }
        } catch (e) {
          console.error('VideoThumbnail: Error in handleLoadedMetadata', e)
          captureCurrentFrame()
        }
      }

      const captureCurrentFrame = () => {
        if (!video || !canvas || !ctx || !mounted) {
          console.log('VideoThumbnail: captureCurrentFrame - missing refs', { video: !!video, canvas: !!canvas, ctx: !!ctx, mounted })
          setIsGenerating(false)
          return false
        }
        
        try {
          // Wait a bit for video to be ready
          if (video.readyState < 2) {
            console.log('VideoThumbnail: Video not ready, waiting...', { readyState: video.readyState })
            // Video not ready yet, wait for it
            const checkReady = setInterval(() => {
              if (video.readyState >= 2 && mounted) {
                clearInterval(checkReady)
                return tryCapture()
              } else if (!mounted) {
                clearInterval(checkReady)
                setIsGenerating(false)
                return false
              }
            }, 100)
            
            setTimeout(() => {
              clearInterval(checkReady)
              if (mounted) {
                return tryCapture()
              }
              return false
            }, 3000)
            return false
          }
          
          return tryCapture()
        } catch (error) {
          console.error('VideoThumbnail: Error in captureCurrentFrame', error)
          if (mounted) {
            setIsGenerating(false)
          }
          return false
        }
      }
      
      const tryCapture = () => {
        if (!video || !canvas || !ctx || !mounted) {
          console.log('VideoThumbnail: tryCapture - missing refs')
          setIsGenerating(false)
          return false
        }
        
        try {
          const width = video.videoWidth || 640
          const height = video.videoHeight || 360
          
          console.log('VideoThumbnail: tryCapture attempt', { 
            width, 
            height, 
            readyState: video.readyState,
            paused: video.paused 
          })
          
          if (width > 0 && height > 0) {
            canvas.width = width
            canvas.height = height
            
            try {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
              const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
              
              console.log('VideoThumbnail: Captured frame', { 
                dataUrlLength: dataUrl.length,
                isValid: dataUrl && dataUrl !== 'data:,'
              })
              
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
                if (!video.paused) {
                  video.pause()
                }
                return true
              } else {
                console.warn('VideoThumbnail: Invalid dataUrl', { dataUrl: dataUrl?.substring(0, 50) })
              }
            } catch (drawError) {
              console.error('VideoThumbnail: Error drawing to canvas', drawError)
            }
          } else {
            console.warn('VideoThumbnail: Invalid dimensions', { width, height })
          }
          
          // If immediate capture failed, try playing briefly
          if (video.paused && video.readyState >= 2) {
            console.log('VideoThumbnail: Trying to play video for frame capture')
            video.play().then(() => {
              setTimeout(() => {
                if (mounted) {
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
                        return
                      }
                    }
                  } catch (e) {
                    console.error('VideoThumbnail: Error in play-then-capture', e)
                  }
                  video.pause()
                  setIsGenerating(false)
                }
              }, 200)
            }).catch((error) => {
              console.error('VideoThumbnail: Error playing video', error)
              setIsGenerating(false)
            })
          } else {
            setIsGenerating(false)
          }
          
          return false
        } catch (error) {
          console.error('VideoThumbnail: Error in tryCapture', error)
          if (mounted) {
            setIsGenerating(false)
          }
          return false
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
        console.log('VideoThumbnail: loadeddata event', { videoSrc, videoWidth: video.videoWidth, videoHeight: video.videoHeight, readyState: video.readyState })
        // If metadata loads but seek doesn't work, try to capture first frame
        if (!thumbnailUrl && mounted) {
          // Wait a bit for video to be ready
          setTimeout(() => {
            try {
              const width = video.videoWidth || 640
              const height = video.videoHeight || 360
              
              console.log('VideoThumbnail: Attempting to capture from loadeddata', { width, height, readyState: video.readyState })
              
              if (width > 0 && height > 0 && canvas && ctx) {
                canvas.width = width
                canvas.height = height
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
                const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
                
                if (mounted && dataUrl && dataUrl !== 'data:,') {
                  console.log('VideoThumbnail: Successfully captured thumbnail from loadeddata')
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
                } else {
                  console.warn('VideoThumbnail: Invalid dataUrl from loadeddata', { dataUrl })
                }
              } else {
                console.warn('VideoThumbnail: Invalid video dimensions from loadeddata', { width, height })
              }
            } catch (e) {
              console.error('VideoThumbnail: Error in loadeddata handler', e)
            }
          }, 200)
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
        onLoadedMetadata={() => {
          console.log('VideoThumbnail: Video metadata loaded', { videoSrc, readyState: videoRef.current?.readyState })
        }}
        onLoadedData={() => {
          console.log('VideoThumbnail: Video data loaded', { videoSrc, videoWidth: videoRef.current?.videoWidth, videoHeight: videoRef.current?.videoHeight })
        }}
        onError={(e) => {
          console.error('VideoThumbnail: Video load error', { videoSrc, error: e, target: e.target })
        }}
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
