import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { slideshowAPI } from '../utils/api'

interface SlideshowSlide {
  id: number
  title: string
  description?: string
  image_filename?: string
  image_url?: string
  cta_text?: string
  cta_url?: string
  display_order: number
  is_active: boolean
}

const Slideshow = () => {
  const [slides, setSlides] = useState<SlideshowSlide[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchSlides()
  }, [])

  useEffect(() => {
    if (slides.length > 1) {
      const interval = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % slides.length)
      }, 5000) // Auto-advance every 5 seconds
      return () => clearInterval(interval)
    }
  }, [slides.length])

  const fetchSlides = async () => {
    try {
      const data = await slideshowAPI.getAll(true) // Only active slides
      setSlides(data.sort((a: SlideshowSlide, b: SlideshowSlide) => a.display_order - b.display_order))
    } catch (error) {
      console.error('Error fetching slideshow slides:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const goToSlide = (index: number) => {
    if (index >= 0 && index < slides.length) {
      setCurrentIndex(index)
    }
  }

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev - 1 + slides.length) % slides.length)
  }

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % slides.length)
  }

  if (isLoading) {
    return (
      <div className="w-full h-96 bg-gray-200 animate-pulse flex items-center justify-center">
        <div className="text-gray-500">Loading slideshow...</div>
      </div>
    )
  }

  if (slides.length === 0) {
    return null // Don't show slideshow if no slides
  }

  const currentSlide = slides[currentIndex]
  // Use image_url if available, otherwise fall back to image_filename, then default
  // Handle both full URLs and filenames for image_filename
  const getImageUrl = () => {
    if (currentSlide.image_url) {
      return currentSlide.image_url
    }
    if (currentSlide.image_filename) {
      // If image_filename is already a full URL, use it directly
      if (currentSlide.image_filename.startsWith('http://') || currentSlide.image_filename.startsWith('https://')) {
        return currentSlide.image_filename
      }
      // Otherwise, construct the URL
      return `/api/uploads/media/images/${currentSlide.image_filename}`
    }
    return 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=1200&h=600&fit=crop'
  }
  const imageUrl = getImageUrl()
  
  // Reset animation when slide changes by using a key
  const slideKey = `slide-${currentSlide.id}-${currentIndex}`

  return (
    <div className="relative w-full h-96 md:h-[500px] lg:h-[600px] overflow-hidden">
      {/* Slide Image */}
      <div
        className="absolute inset-0 bg-cover bg-center transition-opacity duration-1000"
        style={{
          backgroundImage: `url(${imageUrl})`,
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-transparent"></div>
      </div>

      {/* Content Overlay */}
      <div className="relative z-10 h-full flex items-center">
        <div className="section-container w-full">
          <div key={slideKey} className="max-w-2xl text-white">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-heading font-bold mb-4 animate-fade-in">
              {currentSlide.title}
            </h2>
            {currentSlide.description && (
              <p 
                className="text-lg md:text-xl mb-8 text-gray-100 animate-fade-in" 
                style={{ animationDelay: '0.2s' }}
              >
                {currentSlide.description}
              </p>
            )}
            {currentSlide.cta_text && currentSlide.cta_url ? (
              <div 
                className="animate-fade-in"
                style={{ animationDelay: '0.4s' }}
              >
                <Link
                  to={currentSlide.cta_url}
                  className="inline-block bg-primary-600 hover:bg-primary-700 text-white font-medium px-8 py-4 rounded-lg transition-all duration-200 text-lg shadow-lg hover:shadow-xl transform hover:scale-105"
                >
                  {currentSlide.cta_text}
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Navigation Arrows */}
      {slides.length > 1 && (
        <>
          <button
            onClick={goToPrevious}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 bg-white/20 hover:bg-white/30 text-white p-2 rounded-full transition-all duration-200"
            aria-label="Previous slide"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            onClick={goToNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 bg-white/20 hover:bg-white/30 text-white p-2 rounded-full transition-all duration-200"
            aria-label="Next slide"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      )}

      {/* Slide Indicators */}
      {slides.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex space-x-2">
          {slides.map((_, index) => (
            <button
              key={index}
              onClick={() => goToSlide(index)}
              className={`h-2 rounded-full transition-all duration-300 ${
                index === currentIndex ? 'w-8 bg-white' : 'w-2 bg-white/50 hover:bg-white/75'
              }`}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default Slideshow

