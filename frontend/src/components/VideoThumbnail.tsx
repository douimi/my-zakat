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
      

      const handleLoadedMetadata = () => {
        if (!video || !mounted) return
        
        // Try to seek to a specific time to get a frame
        // Use a small offset from the start
        const seekTime = Math.min(0.5, (video.duration || 10) * 0.1)
        try {
          video.currentTime = seekTime
        } catch (e) {
          // If seek fails, try immediate capture
          setTimeout(() => {
            if (mounted && video.readyState >= 2) {
              captureCurrentFrame()
            }
          }, 100)
        }
      }

      const captureCurrentFrame = () => {
        if (!video || !canvas || !ctx || !mounted) {
          setIsGenerating(false)
          return false
        }
        
        
        // Direct capture attempt
        const doCapture = () => {
          try {
            const width = video.videoWidth
            const height = video.videoHeight
            
            
            if (width > 0 && height > 0) {
              canvas.width = width
              canvas.height = height
              
              try {
                ctx.drawImage(video, 0, 0, width, height)
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
                  return true
                } else {
                }
              } catch (drawError) {
                console.error('VideoThumbnail: Canvas drawImage error', drawError)
              }
            } else {
            }
          } catch (error) {
            console.error('VideoThumbnail: Error in doCapture', error)
          }
          return false
        }
        
        // If video is ready, try immediate capture
        if (video.readyState >= 2) {
          if (doCapture()) {
            return true
          }
        }
        
        // If immediate capture failed, try playing briefly
        if (video.paused && video.readyState >= 2) {
          video.play().then(() => {
            setTimeout(() => {
              if (mounted) {
                video.pause()
                if (!doCapture()) {
                  setIsGenerating(false)
                }
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
      }
      
      const tryCapture = () => {
        if (!video || !canvas || !ctx || !mounted) {
          setIsGenerating(false)
          return false
        }
        
        try {
          const width = video.videoWidth || 640
          const height = video.videoHeight || 360
          
          
          if (width > 0 && height > 0) {
            canvas.width = width
            canvas.height = height
            
            try {
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
                if (!video.paused) {
                  video.pause()
                }
                return true
              } else {
              }
            } catch (drawError) {
              console.error('VideoThumbnail: Error drawing to canvas', drawError)
            }
          } else {
          }
          
          // If immediate capture failed, try playing briefly
          if (video.paused && video.readyState >= 2) {
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
        
        // Wait a moment for the frame to render, then capture
        setTimeout(() => {
          if (!mounted || !video || !canvas || !ctx) return
          
          const width = video.videoWidth
          const height = video.videoHeight
          
          
          if (width > 0 && height > 0) {
            try {
              canvas.width = width
              canvas.height = height
              ctx.drawImage(video, 0, 0, width, height)
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
                return
              }
            } catch (e) {
              console.error('VideoThumbnail: Error capturing from seeked', e)
            }
          }
          
          // If capture failed, try playing briefly to ensure frame is rendered
          if (mounted && video.paused && video.readyState >= 2) {
            video.play().then(() => {
              // Wait for frame to render
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  if (mounted && video) {
                    video.pause()
                    try {
                      const width = video.videoWidth || 640
                      const height = video.videoHeight || 360
                      
                      if (width > 0 && height > 0 && canvas && ctx) {
                        canvas.width = width
                        canvas.height = height
                        ctx.drawImage(video, 0, 0, width, height)
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
                        } else {
                          setIsGenerating(false)
                        }
                      } else {
                        setIsGenerating(false)
                      }
                    } catch (e) {
                      console.error('VideoThumbnail: Error capturing after play', e)
                      setIsGenerating(false)
                    }
                  }
                })
              })
            }).catch((err) => {
              console.error('VideoThumbnail: Error playing video', err)
              setIsGenerating(false)
            })
          } else {
            setIsGenerating(false)
          }
        }, 100) // Small delay to ensure frame is rendered
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
      
      // Also listen for loadeddata as a fallback
      video.addEventListener('loadeddata', () => {
        
        // If we haven't captured yet and video has dimensions, try to capture
        if (!thumbnailUrl && mounted && video.videoWidth > 0 && video.videoHeight > 0) {
          // Wait a moment for frame to be ready, then try capture
          setTimeout(() => {
            if (mounted && !thumbnailUrl && video && canvas && ctx) {
              try {
                const width = video.videoWidth
                const height = video.videoHeight
                
                if (width > 0 && height > 0) {
                  canvas.width = width
                  canvas.height = height
                  ctx.drawImage(video, 0, 0, width, height)
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
                    return
                  }
                }
              } catch (e) {
                console.error('VideoThumbnail: Error capturing from loadeddata', e)
              }
              
              // If capture failed, ensure we're at the start and try playing
              if (video.paused && video.readyState >= 2) {
                video.currentTime = 0.1
                video.play().then(() => {
                  // Use requestAnimationFrame to ensure frame is rendered
                  requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                      if (mounted && video) {
                        video.pause()
                        try {
                          const width = video.videoWidth || 640
                          const height = video.videoHeight || 360
                          
                          if (width > 0 && height > 0 && canvas && ctx) {
                            canvas.width = width
                            canvas.height = height
                            ctx.drawImage(video, 0, 0, width, height)
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
                            } else {
                              setIsGenerating(false)
                            }
                          } else {
                            setIsGenerating(false)
                          }
                        } catch (e) {
                          console.error('VideoThumbnail: Error capturing after play', e)
                          setIsGenerating(false)
                        }
                      }
                    })
                  })
                }).catch((err) => {
                  console.error('VideoThumbnail: Error playing video from loadeddata', err)
                  setIsGenerating(false)
                })
              } else {
                setIsGenerating(false)
              }
            }
          }, 300) // Wait a bit longer for frame to be ready
        }
      }, { once: true })
      
      video.preload = 'metadata'
      video.muted = true
      video.playsInline = true
      video.crossOrigin = (videoSrc.startsWith('http://') || videoSrc.startsWith('https://')) ? 'anonymous' : null
      // The hidden <video> is rendered without a src so that nothing is fetched until
      // the thumbnail is actually needed (in view, no poster, no cached frame).
      video.src = videoSrc
      
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
    // Only re-run for a new source. Depending on thumbnailUrl/isGenerating (as before) re-ran the
    // effect the moment generation started, which flipped `mounted` to false and made every
    // in-flight capture bail out, so client-side thumbnails never appeared.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoSrc, poster])

  return (
    <div ref={containerRef} className={`${className} relative bg-gray-200`}>
      {/* Hidden video for thumbnail generation - use absolute positioning instead of hidden class to allow frame rendering */}
      {/* Hidden video used only to grab a frame. No src here: generateThumbnail() sets it when the
          card scrolls into view, so posters and cached thumbnails never download the video. */}
      <video
        ref={videoRef}
        className="absolute opacity-0 pointer-events-none"
        style={{ width: '1px', height: '1px', top: '-9999px', left: '-9999px' }}
        preload="none"
        muted
        playsInline
        aria-hidden="true"
        tabIndex={-1}
        crossOrigin={videoSrc.startsWith('http://') || videoSrc.startsWith('https://') ? 'anonymous' : undefined}
        onError={(e) => {
          if (!e.currentTarget.getAttribute('src')) return
          console.error('VideoThumbnail: Video load error', { videoSrc, error: e, target: e.target })
        }}
      />
      <canvas ref={canvasRef} className="absolute opacity-0 pointer-events-none" style={{ width: '1px', height: '1px', top: '-9999px', left: '-9999px' }} />

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
        <div className="w-full h-full bg-gray-200" role={alt ? 'img' : undefined} aria-label={alt || undefined} />
      )}

      {/* Play icon overlay - always visible */}
      <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors duration-200 pointer-events-none" aria-hidden="true">
        <div className="w-14 h-14 bg-white/90 rounded-full flex items-center justify-center shadow-md">
          <Play className="w-7 h-7 text-primary-700 ml-1" />
        </div>
      </div>
    </div>
  )
}

interface PlayableVideoProps {
  videoSrc: string
  /** What the video shows; used for the button's accessible name ("Play video: …"). */
  title: string
  poster?: string
  /** Sizing classes for both the thumbnail button and the player (e.g. "w-full h-full"). */
  className?: string
  /** Called when the visitor starts the video (e.g. to hide a title overlay that would cover the controls). */
  onPlay?: () => void
}

/**
 * Thumbnail that turns into a real <video> player when clicked. Replaces the old
 * "clickable div + innerHTML" pattern: it is a keyboard-reachable <button>, and the
 * video file is only requested once the visitor asks for it (no hover preloading).
 */
export const PlayableVideo = ({ videoSrc, title, poster, className = '', onPlay }: PlayableVideoProps) => {
  const [playing, setPlaying] = useState(false)

  if (playing) {
    return (
      <video
        src={videoSrc}
        poster={poster}
        className={`${className} bg-black object-cover`}
        controls
        autoPlay
        playsInline
        preload="auto"
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => {
        setPlaying(true)
        onPlay?.()
      }}
      className={`group relative block ${className}`}
      aria-label={`Play video: ${title}`}
    >
      <VideoThumbnail videoSrc={videoSrc} poster={poster} className="w-full h-full" alt="" />
    </button>
  )
}

export default VideoThumbnail
