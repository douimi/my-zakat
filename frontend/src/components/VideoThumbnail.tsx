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

  useEffect(() => {
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

    // Generate thumbnail from video
    const generateThumbnail = () => {
      if (!videoRef.current || !canvasRef.current) return

      const video = videoRef.current
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')

      if (!ctx) return

      try {
        // Set canvas dimensions to match video
        canvas.width = video.videoWidth || 640
        canvas.height = video.videoHeight || 360

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
      if (videoRef.current) {
        // Seek to 1 second or 10% of video duration, whichever is smaller
        const seekTime = Math.min(1, (videoRef.current.duration || 10) * 0.1)
        videoRef.current.currentTime = seekTime
      }
    }

    const handleSeeked = () => {
      generateThumbnail()
    }

    const handleError = () => {
      setHasError(true)
      setIsGenerating(false)
    }

    const video = videoRef.current
    if (video) {
      setIsGenerating(true)
      video.addEventListener('loadedmetadata', handleLoadedMetadata)
      video.addEventListener('seeked', handleSeeked)
      video.addEventListener('error', handleError)
      
      // Load video metadata
      video.preload = 'metadata'
      video.muted = true
      video.playsInline = true
    }

    return () => {
      if (video) {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata)
        video.removeEventListener('seeked', handleSeeked)
        video.removeEventListener('error', handleError)
      }
    }
  }, [videoSrc, onThumbnailGenerated])

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
    <div className={`${className} relative`}>
      {/* Hidden video element for thumbnail generation */}
      <video
        ref={videoRef}
        src={videoSrc}
        className="hidden"
        preload="metadata"
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

