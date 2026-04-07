import { useState, useRef, useEffect, ImgHTMLAttributes } from 'react'
import { ImageIcon } from 'lucide-react'

interface LazyImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  src: string
  alt: string
  /** Optional tiny blur placeholder URL (e.g. same image at ?w=32) */
  placeholderSrc?: string
  className?: string
  onError?: () => void
  /** When true, skip lazy-loading (for above-the-fold images) */
  eager?: boolean
}

const LazyImage: React.FC<LazyImageProps> = ({
  src,
  alt,
  placeholderSrc,
  className = '',
  onError,
  eager = false,
  ...rest
}) => {
  const [isLoaded, setIsLoaded] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [isInView, setIsInView] = useState(eager)
  const containerRef = useRef<HTMLDivElement>(null)

  // Reset state when src changes
  useEffect(() => {
    setIsLoaded(false)
    setHasError(false)
  }, [src])

  useEffect(() => {
    if (eager || !containerRef.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true)
            observer.disconnect()
          }
        })
      },
      {
        rootMargin: '200px', // Start loading 200px before entering viewport
        threshold: 0.01,
      }
    )

    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
    }
  }, [eager])

  const handleLoad = () => {
    setIsLoaded(true)
  }

  const handleError = () => {
    setHasError(true)
    if (onError) {
      onError()
    }
  }

  return (
    <div ref={containerRef} className={`relative overflow-hidden ${className}`} {...rest}>
      {/* Blur placeholder layer — always rendered when we have a placeholderSrc */}
      {placeholderSrc && !hasError && (
        <img
          src={placeholderSrc}
          alt=""
          aria-hidden="true"
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${
            isLoaded ? 'opacity-0' : 'opacity-100'
          }`}
          style={{ filter: 'blur(16px)', transform: 'scale(1.1)' }}
        />
      )}

      {/* Fallback pulse placeholder when no blur image */}
      {!placeholderSrc && !isLoaded && !hasError && (
        <div className="absolute inset-0 bg-gray-200 flex items-center justify-center animate-pulse">
          <ImageIcon className="w-8 h-8 text-gray-400" />
        </div>
      )}

      {/* Error state */}
      {hasError && (
        <div className="w-full h-full bg-gray-200 flex items-center justify-center">
          <ImageIcon className="w-8 h-8 text-gray-400" />
        </div>
      )}

      {/* Actual image — only start loading once in view */}
      {isInView && !hasError && (
        <img
          src={src}
          alt={alt}
          className={`w-full h-full object-cover transition-opacity duration-500 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          loading={eager ? 'eager' : 'lazy'}
          fetchPriority={eager ? 'high' : 'auto'}
          onLoad={handleLoad}
          onError={handleError}
          decoding="async"
          crossOrigin={src.startsWith('http://') || src.startsWith('https://') ? 'anonymous' : undefined}
        />
      )}
    </div>
  )
}

export default LazyImage
