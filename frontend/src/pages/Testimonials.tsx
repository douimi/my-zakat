import { useQuery } from 'react-query'
import { Star, MapPin, Heart, Video, Play } from 'lucide-react'
import { testimonialsAPI, getStaticFileUrl } from '../utils/api'
import LazyVideo from '../components/LazyVideo'
import VideoThumbnail from '../components/VideoThumbnail'
import type { Testimonial } from '../types'

const Testimonials = () => {
  const { data: testimonials, isLoading, error } = useQuery('public-testimonials', () => 
    testimonialsAPI.getAll(true) // Get only approved testimonials
  )

  // Helper function to get image URL - check if it's a full URL or a filename
  const getImageUrl = (imageValue?: string) => {
    if (!imageValue) return null
    // Check if it's a full URL (starts with http:// or https://)
    if (imageValue.startsWith('http://') || imageValue.startsWith('https://')) {
      return imageValue
    }
    // Otherwise, treat it as a filename and load from uploads
    return getStaticFileUrl(`/api/uploads/testimonials/${imageValue}`)
  }

  // Helper function to get video URL
  const getVideoUrl = (videoFilename?: string) => {
    if (!videoFilename) return null
    return getStaticFileUrl(`/api/uploads/testimonials/${videoFilename}`)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="section-container">
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="section-container">
          <div className="text-center py-20">
            <h1 className="text-4xl font-heading font-bold mb-4">Testimonials</h1>
            <p className="text-red-600">Error loading testimonials. Please try again later.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-primary-600 to-primary-800 text-white py-20">
        <div className="section-container">
          <div className="text-center">
            <h1 className="text-5xl font-heading font-bold mb-6">What People Say</h1>
            <p className="text-xl text-primary-100 max-w-3xl mx-auto">
              Read inspiring stories from donors, volunteers, and community members whose lives have been touched by our work
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="section-container py-16">
        {testimonials && testimonials.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {testimonials.map((testimonial: Testimonial, index: number) => {
              const imageUrl = getImageUrl(testimonial.image)
              const videoUrl = getVideoUrl(testimonial.video_filename)
              return (
                <div 
                  key={testimonial.id}
                  className="bg-white rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-2 p-8 border border-gray-100 relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary-50 to-transparent rounded-bl-full opacity-0 hover:opacity-100 transition-opacity duration-500"></div>
                  <div className="relative">
                    {/* Video Display */}
                    {videoUrl && (
                      <div className="mb-6 rounded-lg overflow-hidden bg-gray-900 group cursor-pointer" onClick={(e) => {
                        const container = e.currentTarget
                        const video = document.createElement('video')
                        video.src = videoUrl
                        video.className = "w-full aspect-video object-cover"
                        video.controls = true
                        video.playsInline = true
                        video.preload = "metadata"
                        container.innerHTML = ''
                        container.appendChild(video)
                      }}>
                        <VideoThumbnail
                          videoSrc={videoUrl}
                          className="w-full aspect-video object-cover"
                          alt={`${testimonial.name} testimonial video`}
                        />
                      </div>
                    )}
                    
                    {/* Image Display (only if no video) */}
                    {!videoUrl && imageUrl && (
                      <div className="mb-6 flex justify-center">
                        <div className="relative">
                          <img 
                            src={imageUrl} 
                            alt={testimonial.name}
                            className="w-20 h-20 rounded-full object-cover ring-4 ring-primary-100 hover:ring-primary-200 transition-all duration-300"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none'
                            }}
                          />
                          <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full border-2 border-white"></div>
                        </div>
                      </div>
                    )}
                    
                    <div className="flex justify-center mb-6">
                      {[...Array(testimonial.rating || 5)].map((_, i) => (
                        <Star key={i} className="w-5 h-5 text-yellow-400 fill-current mx-0.5" />
                      ))}
                    </div>
                    
                    <div className="relative mb-6">
                      <p className="text-gray-700 text-center italic leading-relaxed">
                        "{testimonial.text}"
                      </p>
                    </div>
                    
                    <div className="text-center">
                      <h3 className="font-semibold text-gray-900 text-lg mb-1">{testimonial.name}</h3>
                      {testimonial.country && (
                        <div className="flex items-center justify-center text-sm text-gray-600">
                          <MapPin className="w-4 h-4 mr-1" />
                          <span>{testimonial.country}</span>
                        </div>
                      )}
                      {testimonial.category && (
                        <div className="mt-2">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800">
                            {testimonial.category === 'donor' ? 'Donor' : 
                             testimonial.category === 'volunteer' ? 'Volunteer' : 
                             testimonial.category === 'beneficiary' ? 'Beneficiary' : 
                             testimonial.category}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-20">
            <Heart className="w-24 h-24 mx-auto text-gray-300 mb-8" />
            <h2 className="text-3xl font-heading font-bold text-gray-900 mb-4">No Testimonials Yet</h2>
            <p className="text-gray-600 max-w-2xl mx-auto mb-8">
              We're collecting inspiring stories from our community. Check back soon to read testimonials from donors, volunteers, and beneficiaries!
            </p>
          </div>
        )}
      </div>

      {/* Call to Action */}
      <div className="bg-primary-50 py-16">
        <div className="section-container text-center">
          <h2 className="text-3xl font-heading font-bold text-gray-900 mb-4">
            Share Your Story
          </h2>
          <p className="text-gray-600 max-w-3xl mx-auto mb-8">
            Have you been impacted by our work? We'd love to hear from you! Your testimonial can inspire others to make a difference.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="/contact" className="btn-primary">
              Share Your Experience
            </a>
            <a href="/donate" className="btn-outline">
              Make a Donation
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Testimonials
