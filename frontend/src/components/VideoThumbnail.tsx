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
        
        // Try to seek to a specific time to get a frame
        // Use a small offset from the start
        const seekTime = Math.min(0.5, (video.duration || 10) * 0.1)
        try {
          video.currentTime = seekTime
          console.log('VideoThumbnail: Seeking to', seekTime)
        } catch (e) {
          console.warn('VideoThumbnail: Could not set currentTime, trying immediate capture', e)
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
          console.log('VideoThumbnail: captureCurrentFrame - missing refs', { video: !!video, canvas: !!canvas, ctx: !!ctx, mounted })
          setIsGenerating(false)
          return false
        }
        
        console.log('VideoThumbnail: captureCurrentFrame called', {
          readyState: video.readyState,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          currentTime: video.currentTime
        })
        
        // Direct capture attempt
        const doCapture = () => {
          try {
            const width = video.videoWidth
            const height = video.videoHeight
            
            console.log('VideoThumbnail: doCapture attempt', { width, height })
            
            if (width > 0 && height > 0) {
              canvas.width = width
              canvas.height = height
              
              try {
                ctx.drawImage(video, 0, 0, width, height)
                const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
                
                console.log('VideoThumbnail: Canvas draw successful', { 
                  dataUrlLength: dataUrl?.length,
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
                  console.log('VideoThumbnail: ✅ Thumbnail set successfully!')
                  return true
                } else {
                  console.warn('VideoThumbnail: Invalid dataUrl', { dataUrl: dataUrl?.substring(0, 50) })
                }
              } catch (drawError) {
                console.error('VideoThumbnail: Canvas drawImage error', drawError)
              }
            } else {
              console.warn('VideoThumbnail: Invalid dimensions', { width, height })
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
          console.log('VideoThumbnail: Trying to play video to get frame')
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
        console.log('VideoThumbnail: seeked event', {
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          readyState: video.readyState,
          currentTime: video.currentTime
        })
        
        // Wait a moment for the frame to render, then capture
        setTimeout(() => {
          if (!mounted || !video || !canvas || !ctx) return
          
          const width = video.videoWidth
          const height = video.videoHeight
          
          console.log('VideoThumbnail: Attempting capture after seek', { width, height })
          
          if (width > 0 && height > 0) {
            try {
              canvas.width = width
              canvas.height = height
              ctx.drawImage(video, 0, 0, width, height)
              const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
              
              console.log('VideoThumbnail: Canvas draw result', { 
                dataUrlLength: dataUrl?.length,
                isValid: dataUrl && dataUrl !== 'data:,'
              })
              
              if (mounted && dataUrl && dataUrl !== 'data:,') {
                console.log('VideoThumbnail: ✅ Thumbnail captured from seeked event!')
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
            console.log('VideoThumbnail: Playing video briefly to render frame')
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
                          console.log('VideoThumbnail: ✅ Thumbnail captured after play!')
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
        console.log('VideoThumbnail: loadeddata event', { 
          videoSrc, 
          videoWidth: video.videoWidth, 
          videoHeight: video.videoHeight, 
          readyState: video.readyState,
          currentTime: video.currentTime
        })
        
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
                    console.log('VideoThumbnail: ✅ Thumbnail captured from loadeddata!')
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
                console.log('VideoThumbnail: Playing video briefly from loadeddata to render frame')
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
                              console.log('VideoThumbnail: ✅ Thumbnail captured after play from loadeddata!')
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
      {/* Hidden video for thumbnail generation - use absolute positioning instead of hidden class to allow frame rendering */}
      <video
        ref={videoRef}
        src={videoSrc}
        className="absolute opacity-0 pointer-events-none"
        style={{ width: '1px', height: '1px', top: '-9999px', left: '-9999px' }}
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
