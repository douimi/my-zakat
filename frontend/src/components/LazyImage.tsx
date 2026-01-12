import { useState, useRef, useEffect, ImgHTMLAttributes } from 'react'
import { ImageIcon } from 'lucide-react'

interface LazyImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  src: string
  alt: string
  placeholder?: string
  className?: string
  onError?: () => void
}

const LazyImage: React.FC<LazyImageProps> = ({
  src,
  alt,
  placeholder,
  className = '',
  onError,
  ...rest
}) => {
  const [isLoaded, setIsLoaded] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [isInView, setIsInView] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

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
        rootMargin: '50px', // Start loading 50px before image enters viewport
        threshold: 0.01,
      }
    )

    observer.observe(containerRef.current)

    return () => {
      if (containerRef.current) {
        observer.unobserve(containerRef.current)
      }
    }
  }, [])

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
      {!isInView ? (
        // Placeholder before loading
        <div className="w-full h-full bg-gray-200 flex items-center justify-center animate-pulse">
          {placeholder ? (
            <img src={placeholder} alt="" className="w-full h-full object-cover opacity-50" />
          ) : (
            <ImageIcon className="w-8 h-8 text-gray-400" />
          )}
        </div>
      ) : hasError ? (
        // Error state
        <div className="w-full h-full bg-gray-200 flex items-center justify-center">
          <ImageIcon className="w-8 h-8 text-gray-400" />
        </div>
      ) : (
        <>
          {/* Loading placeholder */}
          {!isLoaded && (
            <div className="absolute inset-0 bg-gray-200 flex items-center justify-center animate-pulse">
              {placeholder ? (
                <img src={placeholder} alt="" className="w-full h-full object-cover opacity-50" />
              ) : (
                <ImageIcon className="w-8 h-8 text-gray-400" />
              )}
            </div>
          )}
          {/* Actual image */}
          <img
            ref={imgRef}
            src={src}
            alt={alt}
            className={`w-full h-full object-cover transition-opacity duration-300 ${
              isLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            loading="lazy"
            onLoad={handleLoad}
            onError={handleError}
            decoding="async"
            crossOrigin={src.startsWith('http://') || src.startsWith('https://') ? 'anonymous' : undefined}
          />
        </>
      )}
    </div>
  )
}

export default LazyImage

