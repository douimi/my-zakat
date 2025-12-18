import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from 'react-query'
import { programCategoriesAPI, programsAPI, getStaticFileUrl } from '../utils/api'
import { ArrowLeft, Heart, Share2, Calendar, ChevronLeft, ChevronRight, ArrowRight, Users, Target } from 'lucide-react'
import LazyVideo from '../components/LazyVideo'

const CategoryDetail = () => {
  const { slug } = useParams<{ slug: string }>()
  const jsRef = useRef<HTMLScriptElement | null>(null)
  const cssRef = useRef<HTMLStyleElement | null>(null)
  const [slideshowIndex, setSlideshowIndex] = useState(0)

  const { data: category, isLoading, error } = useQuery(
    ['category', slug],
    () => programCategoriesAPI.getBySlug(slug!),
    {
      enabled: !!slug,
      retry: false,
    }
  )

  const { data: categoryPrograms } = useQuery(
    ['category-programs', category?.id],
    () => programsAPI.getAll(category?.id, true),
    {
      enabled: !!category?.id,
      retry: false,
    }
  )

  // Auto-advance slideshow
  useEffect(() => {
    if (categoryPrograms && categoryPrograms.length > 1) {
      const interval = setInterval(() => {
        setSlideshowIndex((prev) => (prev + 1) % categoryPrograms.length)
      }, 5000)
      return () => clearInterval(interval)
    }
  }, [categoryPrograms])

  useEffect(() => {
    // Clean up any existing category CSS/JS from previous visits
    const existingStyles = document.querySelectorAll('style[id^="category-css-"]')
    existingStyles.forEach((style) => {
      style.remove()
    })
    
    const existingScripts = document.querySelectorAll('script[data-category]')
    existingScripts.forEach((script) => {
      script.remove()
    })

    // Inject CSS
    if (category?.css_content) {
      const styleId = `category-css-${category.id}`
      const styleElement = document.createElement('style')
      styleElement.id = styleId
      styleElement.textContent = category.css_content
      document.head.appendChild(styleElement)
      cssRef.current = styleElement
    }

    // Inject JS
    if (category?.js_content) {
      const script = document.createElement('script')
      script.setAttribute('data-category', 'true')
      script.textContent = category.js_content
      document.body.appendChild(script)
      jsRef.current = script
    }

    // Cleanup function
    return () => {
      if (cssRef.current && cssRef.current.parentNode) {
        cssRef.current.parentNode.removeChild(cssRef.current)
        cssRef.current = null
      }
      
      if (jsRef.current && jsRef.current.parentNode) {
        jsRef.current.parentNode.removeChild(jsRef.current)
        jsRef.current = null
      }
    }
  }, [category])

  const getVideoUrl = (filename?: string) => {
    if (!filename) return null
    if (filename.startsWith('http://') || filename.startsWith('https://')) {
      return filename
    }
    return getStaticFileUrl(`/api/uploads/program_categories/${filename}`)
  }

  const getProgramImageUrl = (program: any) => {
    if (program.video_filename) {
      return getStaticFileUrl(`/api/uploads/programs/${program.video_filename}`)
    }
    return program.image_url || null
  }

  const slideshowImages = categoryPrograms
    ?.filter((p: any) => p.image_url || p.video_filename)
    .map((p: any) => ({
      url: getProgramImageUrl(p),
      title: p.title,
      program: p
    })) || []

  const goToSlide = (index: number) => {
    if (index >= 0 && index < slideshowImages.length) {
      setSlideshowIndex(index)
    }
  }

  const goToPrevious = () => {
    setSlideshowIndex((prev) => (prev - 1 + slideshowImages.length) % slideshowImages.length)
  }

  const goToNext = () => {
    setSlideshowIndex((prev) => (prev + 1) % slideshowImages.length)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (error || !category) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Category Not Found</h1>
          <Link to="/programs" className="text-primary-600 hover:text-primary-700">
            Return to Programs
          </Link>
        </div>
      </div>
    )
  }

  const videoUrl = getVideoUrl(category.video_filename)
  const imageUrl = category.image_url

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="section-container py-4">
          <Link
            to="/programs"
            className="inline-flex items-center text-gray-600 hover:text-primary-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Programs
          </Link>
        </div>
      </div>

      {/* Hero Section */}
      {(imageUrl || videoUrl) && (
        <div className="relative h-96 overflow-hidden">
          {videoUrl ? (
            <LazyVideo
              src={videoUrl}
              className="w-full h-full object-cover"
              controls={true}
              playsInline={true}
            />
          ) : (
            <img
              src={imageUrl}
              alt={category.title}
              className="w-full h-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent"></div>
          <div className="absolute bottom-0 left-0 right-0 p-8 text-white">
            <h1 className="text-4xl lg:text-5xl font-bold mb-2">{category.title}</h1>
            {category.short_description && (
              <p className="text-xl text-white/90">{category.short_description}</p>
            )}
          </div>
        </div>
      )}

      {/* Content Section */}
      <div className="section-container py-12">
        {/* Description */}
        {category.description && (
          <div className="mb-8">
            <div className="prose max-w-none text-lg text-gray-700" dangerouslySetInnerHTML={{ __html: category.description }} />
          </div>
        )}

        {/* Custom HTML Content */}
        {category.html_content && (
          <div className="mb-8">
            <div dangerouslySetInnerHTML={{ __html: category.html_content }} />
          </div>
        )}

        {/* Media Slideshow */}
        {slideshowImages.length > 0 && (
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center">Our Work in Action</h2>
            <div className="relative w-full h-96 md:h-[500px] rounded-xl overflow-hidden shadow-2xl">
              {/* Slideshow Images */}
              {slideshowImages.map((slide, index) => (
                <div
                  key={index}
                  className={`absolute inset-0 transition-opacity duration-1000 ${
                    index === slideshowIndex ? 'opacity-100' : 'opacity-0'
                  }`}
                >
                  <img
                    src={slide.url || ''}
                    alt={slide.title}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent"></div>
                  <div className="absolute bottom-0 left-0 right-0 p-8 text-white">
                    <h3 className="text-2xl md:text-3xl font-bold mb-2">{slide.title}</h3>
                    {slide.program.short_description && (
                      <p className="text-lg text-white/90">{slide.program.short_description}</p>
                    )}
                  </div>
                </div>
              ))}

              {/* Navigation Arrows */}
              {slideshowImages.length > 1 && (
                <>
                  <button
                    onClick={goToPrevious}
                    className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-gray-900 rounded-full p-3 shadow-lg transition-all z-10"
                    aria-label="Previous slide"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button
                    onClick={goToNext}
                    className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-gray-900 rounded-full p-3 shadow-lg transition-all z-10"
                    aria-label="Next slide"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </>
              )}

              {/* Dots Indicator */}
              {slideshowImages.length > 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
                  {slideshowImages.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => goToSlide(index)}
                      className={`w-3 h-3 rounded-full transition-all ${
                        index === slideshowIndex
                          ? 'bg-white w-8'
                          : 'bg-white/50 hover:bg-white/75'
                      }`}
                      aria-label={`Go to slide ${index + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Impact Text */}
        {category.impact_text && (
          <div className="mt-8 p-8 bg-gradient-to-r from-primary-50 to-primary-100 rounded-xl border-2 border-primary-200">
            <div className="flex items-center mb-3">
              <Target className="w-8 h-8 text-primary-600 mr-3" />
              <h3 className="text-2xl font-bold text-gray-900">Our Impact</h3>
            </div>
            <p className="text-xl text-gray-700 font-semibold">{category.impact_text}</p>
          </div>
        )}

        {/* Programs in this Category */}
        {categoryPrograms && categoryPrograms.length > 0 && (
          <div className="mt-16">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-3xl font-bold text-gray-900">Programs in {category.title}</h2>
                <p className="text-gray-600 mt-2">Explore our initiatives making a difference</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {categoryPrograms.map((program: any) => {
                const programVideoUrl = program.video_filename 
                  ? getStaticFileUrl(`/api/uploads/programs/${program.video_filename}`)
                  : null
                const programImageUrl = program.image_url

                return (
                  <Link
                    key={program.id}
                    to={`/programs/${program.slug}`}
                    className="group bg-white rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden transform hover:-translate-y-2"
                  >
                    {(programImageUrl || programVideoUrl) && (
                      <div className="relative h-56 overflow-hidden">
                        {programVideoUrl ? (
                          <LazyVideo
                            src={programVideoUrl}
                            className="w-full h-full object-cover"
                            controls={false}
                            playsInline={true}
                          />
                        ) : (
                          <img
                            src={programImageUrl}
                            alt={program.title}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                          />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                      </div>
                    )}
                    <div className="p-6">
                      <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-primary-600 transition-colors">
                        {program.title}
                      </h3>
                      {program.short_description && (
                        <p className="text-gray-600 line-clamp-3 mb-4">{program.short_description}</p>
                      )}
                      {program.impact_text && (
                        <div className="mb-4">
                          <span className="inline-block bg-primary-100 text-primary-700 px-3 py-1 rounded-full text-sm font-semibold">
                            {program.impact_text}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center text-primary-600 font-semibold group-hover:gap-2 transition-all">
                        <span>Learn More</span>
                        <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* Multiple CTAs */}
        <div className="mt-16 space-y-6">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-8">Get Involved</h2>
          
          {/* Primary CTA */}
          <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-2xl p-8 text-white text-center shadow-xl">
            <Heart className="w-12 h-12 mx-auto mb-4" />
            <h3 className="text-3xl font-bold mb-3">Support {category.title}</h3>
            <p className="text-xl mb-6 text-white/90">Your donation helps us continue our vital work and reach more people in need</p>
            <Link
              to="/donate"
              className="inline-flex items-center bg-white text-primary-600 font-bold px-8 py-4 rounded-xl hover:bg-gray-100 transition-all duration-300 transform hover:scale-105 shadow-lg"
            >
              <Heart className="w-5 h-5 mr-2" />
              Donate Now
            </Link>
          </div>

          {/* Secondary CTAs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Link
              to="/volunteer"
              className="group bg-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 text-center"
            >
              <Users className="w-10 h-10 text-primary-600 mx-auto mb-4 group-hover:scale-110 transition-transform" />
              <h4 className="text-xl font-bold text-gray-900 mb-2">Volunteer</h4>
              <p className="text-gray-600 mb-4">Join our team and make a hands-on difference</p>
              <span className="text-primary-600 font-semibold group-hover:gap-2 inline-flex items-center">
                Learn More
                <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
              </span>
            </Link>

            <Link
              to="/contact"
              className="group bg-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 text-center"
            >
              <Share2 className="w-10 h-10 text-primary-600 mx-auto mb-4 group-hover:scale-110 transition-transform" />
              <h4 className="text-xl font-bold text-gray-900 mb-2">Partner With Us</h4>
              <p className="text-gray-600 mb-4">Collaborate and amplify our impact together</p>
              <span className="text-primary-600 font-semibold group-hover:gap-2 inline-flex items-center">
                Contact Us
                <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
              </span>
            </Link>

            <Link
              to="/stories"
              className="group bg-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 text-center"
            >
              <Calendar className="w-10 h-10 text-primary-600 mx-auto mb-4 group-hover:scale-110 transition-transform" />
              <h4 className="text-xl font-bold text-gray-900 mb-2">Read Stories</h4>
              <p className="text-gray-600 mb-4">See the real impact of your support</p>
              <span className="text-primary-600 font-semibold group-hover:gap-2 inline-flex items-center">
                View Stories
                <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
              </span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CategoryDetail
