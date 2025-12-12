import { useState } from 'react'
import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import { 
  Heart, 
  Users, 
  Globe, 
  TrendingUp, 
  ArrowRight, 
  Play,
  CheckCircle,
  Star,
  Image as ImageIcon,
  X,
  ChevronLeft,
  ChevronRight,
  Calendar,
  MapPin
} from 'lucide-react'
import { donationsAPI, storiesAPI, eventsAPI, testimonialsAPI, settingsAPI, getStaticFileUrl, galleryAPI } from '../utils/api'
import type { Event } from '../types'
import Slideshow from '../components/Slideshow'
import LazyVideo from '../components/LazyVideo'
import VideoThumbnail from '../components/VideoThumbnail'

const Home = () => {

  // Prioritize critical data first, then load secondary content
  const { data: donationStats, error: statsError } = useQuery('donation-stats', donationsAPI.getStats, {
    retry: 1,
    staleTime: 5 * 60 * 1000, // 5 minutes
    onError: (error) => console.error('Stats error:', error)
  })
  const { data: settings, error: settingsError } = useQuery('home-media-settings', settingsAPI.getAll, {
    retry: 1,
    staleTime: 10 * 60 * 1000, // 10 minutes - settings change rarely
    onError: (error) => console.error('Settings error:', error)
  })
  
  // Load secondary content after a delay to prioritize critical content
  const { data: featuredStories, error: storiesError } = useQuery('featured-stories', () => 
    storiesAPI.getAll(true, true), {
    retry: 1,
    staleTime: 5 * 60 * 1000,
    enabled: !!donationStats, // Only load after critical data
    onError: (error) => console.error('Stories error:', error)
  })
  const { data: upcomingEvents, error: eventsError } = useQuery('upcoming-events', () => 
    eventsAPI.getAll(true), {
    retry: 1,
    staleTime: 5 * 60 * 1000,
    enabled: !!donationStats, // Only load after critical data
    onError: (error) => console.error('Events error:', error)
  })
  const { data: testimonials, error: testimonialsError } = useQuery('testimonials', () => 
    testimonialsAPI.getAll(true), {
    retry: 1,
    staleTime: 5 * 60 * 1000,
    enabled: !!donationStats, // Only load after critical data
    onError: (error) => console.error('Testimonials error:', error)
  })

  // Show error state if any critical API calls fail
  if (statsError || settingsError) {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="section-container">
          <h1 className="text-4xl font-heading font-bold text-center mb-8">MyZakat</h1>
          <div className="text-center">
            <p className="text-red-600 mb-4">Unable to load homepage data. Please check your connection.</p>
            <p className="text-gray-600">Other pages should still work normally.</p>
          </div>
        </div>
      </div>
    )
  }

  const impactStats = [
    {
      icon: Heart,
      value: donationStats?.impact?.meals || 0,
      label: 'Meals Provided',
      color: 'text-red-600'
    },
    {
      icon: Users,
      value: donationStats?.impact?.families || 0,
      label: 'Families Supported',
      color: 'text-blue-600'
    },
    {
      icon: Globe,
      value: donationStats?.impact?.orphans || 0,
      label: 'Orphans Cared For',
      color: 'text-green-600'
    },
    {
      icon: TrendingUp,
      value: `$${(donationStats?.total_raised || 0).toLocaleString()}`,
      label: 'Total Raised',
      color: 'text-purple-600'
    }
  ]

  // Get media URLs from settings
  const getMediaUrl = (key: string, fallback: string) => {
    const setting = settings?.find(s => s.key === key)
    if (!setting?.value) return fallback
    
    // If it's a URL, return as-is
    if (setting.value.startsWith('http://') || setting.value.startsWith('https://')) {
      return setting.value
    }
    
    // If it's a filename, construct the API path
    return getStaticFileUrl(`/api/uploads/media/images/${setting.value}`)
  }

  // Helper function to get video URL - check if it's a filename or URL
  const getVideoUrl = (value?: string) => {
    if (!value) return null
    // Check if it's a full URL (starts with http:// or https://)
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return value
    }
    // Otherwise, treat it as a filename and load from uploads
    return getStaticFileUrl(`/api/uploads/media/videos/${value}`)
  }

  const getSettingValue = (key: string): string => {
    const setting = settings?.find(s => s.key === key)
    return setting?.value || ''
  }

  // Helper to get program media - checks video first, then image
  const getProgramMedia = (programNum: number) => {
    const videoValue = getSettingValue(`program_video_${programNum}`)
    const imageValue = getSettingValue(`program_image_${programNum}`)
    
    if (videoValue) {
      // Video takes priority
      const videoUrl = getVideoUrl(videoValue)
      return { url: videoUrl, type: 'video' as const }
    } else if (imageValue) {
      // Fallback to image - check if it's a URL or needs to be constructed
      if (imageValue.startsWith('http://') || imageValue.startsWith('https://')) {
        return { url: imageValue, type: 'image' as const }
      }
      const imageUrl = getMediaUrl(`program_image_${programNum}`, '')
      return { url: imageUrl, type: 'image' as const }
    }
    
    return { url: null, type: 'image' as const }
  }

  const programs = [
    {
      title: getSettingValue('program_title_1'),
      description: getSettingValue('program_description_1'),
      media: getProgramMedia(1),
      impact: getSettingValue('program_impact_1')
    },
    {
      title: getSettingValue('program_title_2'),
      description: getSettingValue('program_description_2'),
      media: getProgramMedia(2),
      impact: getSettingValue('program_impact_2')
    },
    {
      title: getSettingValue('program_title_3'),
      description: getSettingValue('program_description_3'),
      media: getProgramMedia(3),
      impact: getSettingValue('program_impact_3')
    }
  ].filter(program => program.title || program.description || program.impact) // Only show programs with at least some data

  return (
    <div className="min-h-screen">
      {/* Slideshow Section */}
      <Slideshow />

      {/* Impact Stats */}
      <section className="py-20 bg-gradient-to-br from-blue-50 via-white to-blue-50 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 left-0 w-96 h-96 bg-primary-600 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-400 rounded-full blur-3xl"></div>
        </div>
        <div className="section-container relative z-10">
          <div className="text-center mb-16">
            <div className="inline-block px-4 py-2 bg-primary-100 text-primary-700 rounded-full text-sm font-semibold mb-4">
              Our Impact
            </div>
            <h2 className="text-4xl lg:text-5xl font-heading font-bold text-gray-900 mb-6">
              Transforming Lives Through
              <span className="block text-primary-600 mt-2">Generous Giving</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
              Every contribution creates a ripple effect of positive change, touching lives and building hope in communities worldwide
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {impactStats.map((stat, index) => (
              <div 
                key={index}
                className="group relative bg-white rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-2 animate-fade-in overflow-hidden"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary-100 to-transparent rounded-bl-full opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="relative p-8">
                  <div className={`w-16 h-16 ${stat.color.replace('text-', 'bg-').replace('-600', '-100')} rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500`}>
                    <stat.icon className={`w-8 h-8 ${stat.color}`} />
                  </div>
                  <div className="text-4xl lg:text-5xl font-bold text-gray-900 mb-3 group-hover:text-primary-600 transition-colors duration-300">
                    {stat.value}
                  </div>
                  <div className="text-gray-600 font-semibold text-lg">{stat.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 bg-white relative">
        <div className="section-container">
          <div className="text-center mb-16">
            <div className="inline-block px-4 py-2 bg-blue-100 text-primary-700 rounded-full text-sm font-semibold mb-4">
              Simple Process
            </div>
            <h2 className="text-4xl lg:text-5xl font-heading font-bold text-gray-900 mb-6">
              Your Donation Journey
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
              From your click to their smile - discover the seamless path your contribution takes to create lasting change
            </p>
          </div>

          <div className="relative">
            {/* Connection Line - Hidden on mobile */}
            <div className="hidden lg:block absolute top-24 left-0 right-0 h-0.5 bg-gradient-to-r from-primary-200 via-primary-400 to-primary-200"></div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
              {[
                {
                  step: '1',
                  title: 'You Donate',
                  description: 'Choose your cause and make a secure donation online with complete transparency and peace of mind.',
                  icon: Heart,
                  gradient: 'from-red-500 to-pink-500'
                },
                {
                  step: '2',
                  title: 'We Deliver',
                  description: 'Our dedicated team ensures your donation reaches those most in need, quickly and efficiently.',
                  icon: Globe,
                  gradient: 'from-blue-500 to-cyan-500'
                },
                {
                  step: '3',
                  title: 'Lives Change',
                  description: 'Your generosity provides food, water, education, and hope to families and children in need.',
                  icon: Users,
                  gradient: 'from-green-500 to-emerald-500'
                }
              ].map((item, index) => (
                <div 
                  key={index} 
                  className="relative group animate-fade-in" 
                  style={{ animationDelay: `${index * 0.15}s` }}
                >
                  {/* Step Number Badge */}
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 z-10">
                    <div className={`w-12 h-12 bg-gradient-to-br ${item.gradient} rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                      <span className="text-white font-bold text-xl">{item.step}</span>
                    </div>
                  </div>
                  
                  <div className="bg-white rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-3 p-8 pt-12 border border-gray-100 group-hover:border-primary-200">
                    <div className={`w-20 h-20 bg-gradient-to-br ${item.gradient} rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:rotate-6 transition-transform duration-500 shadow-lg`}>
                      <item.icon className="w-10 h-10 text-white" />
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-4 text-center group-hover:text-primary-600 transition-colors">
                      {item.title}
                    </h3>
                    <p className="text-gray-600 leading-relaxed text-center">
                      {item.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Programs */}
      <section className="py-20 bg-gradient-to-b from-gray-50 to-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-1/4 right-0 w-96 h-96 bg-primary-600 rounded-full blur-3xl"></div>
        </div>
        <div className="section-container relative z-10">
          <div className="text-center mb-16">
            <div className="inline-block px-4 py-2 bg-primary-100 text-primary-700 rounded-full text-sm font-semibold mb-4">
              Our Initiatives
            </div>
            <h2 className="text-4xl lg:text-5xl font-heading font-bold text-gray-900 mb-6">
              Programs That Make
              <span className="block text-primary-600 mt-2">A Real Difference</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
              Focused initiatives that address the most critical needs in underserved communities around the world
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {programs.map((program, index) => (
              <div 
                key={index}
                className="group bg-white rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-3 animate-fade-in overflow-hidden border border-gray-100"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                {/* Media Section */}
                <div className="relative overflow-hidden h-64">
                  {program.media.type === 'video' && program.media.url ? (
                    <LazyVideo
                      src={program.media.url}
                      className="w-full h-full object-cover"
                      controls={true}
                      playsInline={true}
                    />
                  ) : program.media.url ? (
                    <>
                      <img 
                        src={program.media.url} 
                        alt={program.title || 'Program'}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                        }}
                      />
                      {/* Overlay only for images, not videos */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
                    </>
                  ) : (
                    <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                      <span className="text-gray-400">No media</span>
                    </div>
                  )}
                </div>
                
                {/* Content Section */}
                <div className="p-6">
                  <h3 className="text-2xl font-bold text-gray-900 mb-2 group-hover:text-primary-600 transition-colors">
                    {program.title}
                  </h3>
                  {program.impact && (
                    <div className="mb-3">
                      <span className="inline-block bg-primary-100 text-primary-700 px-3 py-1 rounded-full text-sm font-semibold">
                        {program.impact}
                      </span>
                    </div>
                  )}
                  <p className="text-gray-600 mb-6 leading-relaxed">{program.description}</p>
                  <Link 
                    to="/donate" 
                    className="inline-flex items-center justify-center w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold px-6 py-3 rounded-xl transition-all duration-300 transform group-hover:scale-105 shadow-lg hover:shadow-xl"
                  >
                    Support This Program
                    <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Events Section */}
      {upcomingEvents && upcomingEvents.length > 0 && (
        <section className="py-20 bg-white relative overflow-hidden">
          <div className="absolute inset-0 opacity-5">
            <div className="absolute top-1/4 left-0 w-96 h-96 bg-primary-600 rounded-full blur-3xl"></div>
          </div>
          <div className="section-container relative z-10">
            <div className="text-center mb-16">
              <div className="inline-block px-4 py-2 bg-primary-100 text-primary-700 rounded-full text-sm font-semibold mb-4">
                Upcoming Events
              </div>
              <h2 className="text-4xl lg:text-5xl font-heading font-bold text-gray-900 mb-6">
                Join Us at Our
                <span className="block text-primary-600 mt-2">Upcoming Events</span>
              </h2>
              <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
                Be part of our community events, fundraisers, and gatherings where we come together to make a difference
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {upcomingEvents.slice(0, 3).map((event: Event, index: number) => {
                const eventDate = new Date(event.date)
                const isToday = eventDate.toDateString() === new Date().toDateString()
                
                // Helper function to get image URL - check if it's a full URL or a filename
                const getImageUrl = (imageValue?: string) => {
                  if (!imageValue) return null
                  // Check if it's a full URL (starts with http:// or https://)
                  if (imageValue.startsWith('http://') || imageValue.startsWith('https://')) {
                    return imageValue
                  }
                  // Otherwise, treat it as a filename and load from uploads
                  return getStaticFileUrl(`/api/uploads/events/${imageValue}`)
                }

                const imageUrl = getImageUrl(event.image)

                return (
                  <div 
                    key={event.id}
                    className="group bg-white rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-3 animate-fade-in overflow-hidden border border-gray-100"
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    {/* Event Image */}
                    {imageUrl && (
                      <div className="relative overflow-hidden h-48">
                        <img 
                          src={imageUrl} 
                          alt={event.title}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none'
                          }}
                        />
                        <div className="absolute top-4 right-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            isToday 
                              ? 'bg-red-100 text-red-800' 
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {isToday ? 'Today' : 'Upcoming'}
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="p-6">
                      {/* Event Title */}
                      <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-primary-600 transition-colors">
                        {event.title}
                      </h3>

                      {/* Event Description */}
                      <p className="text-gray-600 mb-4 line-clamp-2">{event.description}</p>

                      {/* Event Details */}
                      <div className="space-y-2 mb-6">
                        <div className="flex items-center text-sm text-gray-600">
                          <Calendar className="w-4 h-4 mr-2 text-primary-500 flex-shrink-0" />
                          <span>
                            {eventDate.toLocaleDateString('en-US', {
                              weekday: 'short',
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </span>
                        </div>
                        
                        <div className="flex items-center text-sm text-gray-600">
                          <MapPin className="w-4 h-4 mr-2 text-primary-500 flex-shrink-0" />
                          <span className="truncate">{event.location}</span>
                        </div>
                      </div>

                      {/* Action Button */}
                      <Link 
                        to={`/events/${event.id}`}
                        className="inline-flex items-center justify-center w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold px-6 py-3 rounded-xl transition-all duration-300 transform group-hover:scale-105 shadow-lg hover:shadow-xl"
                      >
                        Learn More
                        <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* View All Events Link */}
            <div className="text-center mt-12">
              <Link 
                to="/events"
                className="inline-flex items-center text-primary-600 hover:text-primary-700 font-semibold text-lg"
              >
                View All Events
                <ArrowRight className="ml-2 w-5 h-5" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Testimonials */}
      {testimonials && testimonials.length > 0 && (
        <section className="py-20 bg-gradient-to-br from-blue-50 via-white to-purple-50 relative overflow-hidden">
          <div className="absolute inset-0 opacity-5">
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-400 rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-400 rounded-full blur-3xl"></div>
          </div>
          <div className="section-container relative z-10">
            <div className="text-center mb-16">
              <div className="inline-block px-4 py-2 bg-purple-100 text-purple-700 rounded-full text-sm font-semibold mb-4">
                Testimonials
              </div>
              <h2 className="text-4xl lg:text-5xl font-heading font-bold text-gray-900 mb-6">
                Voices of
                <span className="block text-primary-600 mt-2">Gratitude & Hope</span>
              </h2>
              <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
                Hear from those whose lives have been transformed by your generous contributions
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {testimonials.slice(0, 3).map((testimonial, index) => {
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
                
                const imageUrl = getImageUrl(testimonial.image)
                const videoUrl = getVideoUrl(testimonial.video_filename)
                
                return (
                <div 
                  key={testimonial.id}
                  className="group bg-white rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-2 animate-fade-in p-8 border border-gray-100 relative overflow-hidden"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary-50 to-transparent rounded-bl-full opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                  <div className="relative">
                    {/* Video Display */}
                    {videoUrl && (
                      <div className="mb-6 rounded-lg overflow-hidden bg-gray-900">
                        <video
                          src={videoUrl}
                          className="w-full aspect-video object-cover"
                          controls
                          preload="none"
                          playsInline
                          loading="lazy"
                          crossOrigin="anonymous"
                        >
                          Your browser does not support the video tag.
                        </video>
                      </div>
                    )}
                    
                    {/* Image Display (only if no video) */}
                    {!videoUrl && imageUrl && (
                      <div className="mb-6 flex justify-center">
                        <div className="relative">
                          <img 
                            src={imageUrl} 
                            alt={testimonial.name}
                            className="w-20 h-20 rounded-full object-cover ring-4 ring-primary-100 group-hover:ring-primary-200 transition-all duration-300"
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
                      <div className="absolute top-0 left-0 text-6xl text-primary-200 font-serif leading-none opacity-50">"</div>
                      <p className="text-gray-700 italic leading-relaxed relative z-10 pl-6 text-lg">
                        {testimonial.text}
                      </p>
                    </div>
                    <div className="border-t border-gray-100 pt-4">
                      <div className="font-bold text-gray-900 text-lg">{testimonial.name}</div>
                      {testimonial.country && (
                        <div className="text-sm text-gray-500 mt-1">{testimonial.country}</div>
                      )}
                    </div>
                  </div>
                </div>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* Gallery Section */}
      <section className="py-20 bg-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-primary-600 rounded-full blur-3xl"></div>
        </div>
        <div className="section-container relative z-10">
          <div className="text-center mb-16">
            <div className="inline-block px-4 py-2 bg-primary-100 text-primary-700 rounded-full text-sm font-semibold mb-4">
              Visual Impact
            </div>
            <h2 className="text-4xl lg:text-5xl font-heading font-bold text-gray-900 mb-6">
              Our Work in Action
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
              Witness the real-world impact of your donations through photos and videos showcasing our ongoing aid activities
            </p>
          </div>

          <GallerySection />
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 hero-gradient text-white">
        <div className="section-container text-center">
          <h2 className="text-3xl lg:text-5xl font-heading font-bold mb-6">
            Ready to Make a Difference?
          </h2>
          <p className="text-xl lg:text-2xl mb-8 text-blue-100 max-w-3xl mx-auto">
            Your Zakat and Sadaqa can transform lives today. Join our community of compassionate donors.
          </p>
          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
            <Link to="/donate" className="btn-primary bg-white text-primary-600 hover:bg-blue-50 text-xl px-10 py-4">
              Donate Now
              <Heart className="ml-2 w-6 h-6" />
            </Link>
            <Link to="/zakat-calculator" className="bg-transparent border-2 border-white text-white hover:bg-white hover:text-primary-600 font-medium px-10 py-4 rounded-lg transition-colors duration-200 text-xl">
              Calculate My Zakat
            </Link>
          </div>
          <div className="mt-8 text-blue-100">
            <p className="text-lg">💳 Secure payments • 🔒 100% transparent • 📊 Real-time impact tracking</p>
          </div>
        </div>
      </section>

    </div>
  )
}

const GallerySection = () => {
  const [selectedMediaIndex, setSelectedMediaIndex] = useState<number | null>(null)
  
  const { data: galleryItems = [], isLoading } = useQuery('public-gallery', () => galleryAPI.getAll(true))

  // Helper function to get media URL - check if it's a filename or URL
  const getMediaUrl = (filename: string): { url: string; isVideo: boolean } => {
    // Check if it's a full URL (starts with http:// or https://)
    if (filename.startsWith('http://') || filename.startsWith('https://')) {
      const isVideo = filename.includes('youtube.com') || filename.includes('youtu.be') || filename.includes('vimeo.com') || filename.match(/\.(mp4|webm|ogg|avi|mov)$/i)
      return { url: filename, isVideo: !!isVideo }
    }
    
    // Otherwise, treat it as a filename and determine if it's video or image
    const isVideo = filename.match(/\.(mp4|webm|ogg|avi|mov)$/i)
    const url = isVideo 
      ? getStaticFileUrl(`/api/uploads/media/videos/${filename}`)
      : getStaticFileUrl(`/api/uploads/media/images/${filename}`)
    
    return { url, isVideo: !!isVideo }
  }

  const processedItems = galleryItems.map((item) => {
    const mediaInfo = getMediaUrl(item.media_filename)
    return {
      id: item.id,
      url: mediaInfo.url,
      type: mediaInfo.isVideo ? 'video' : 'image' as 'image' | 'video',
      thumbnail: mediaInfo.isVideo ? null : mediaInfo.url, // Videos will generate thumbnails
    }
  })

  const selectedMedia = selectedMediaIndex !== null ? processedItems[selectedMediaIndex] : null

  const goToPrevious = () => {
    if (selectedMediaIndex === null) return
    const newIndex = selectedMediaIndex > 0 ? selectedMediaIndex - 1 : processedItems.length - 1
    setSelectedMediaIndex(newIndex)
  }

  const goToNext = () => {
    if (selectedMediaIndex === null) return
    const newIndex = selectedMediaIndex < processedItems.length - 1 ? selectedMediaIndex + 1 : 0
    setSelectedMediaIndex(newIndex)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (selectedMediaIndex === null) return
    if (e.key === 'ArrowLeft') goToPrevious()
    if (e.key === 'ArrowRight') goToNext()
    if (e.key === 'Escape') setSelectedMediaIndex(null)
  }

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
      </div>
    )
  }

  if (processedItems.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-24 h-24 mx-auto bg-gray-100 rounded-lg flex items-center justify-center mb-4">
          <ImageIcon className="w-12 h-12 text-gray-400" />
        </div>
        <p className="text-gray-500">Gallery coming soon...</p>
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {processedItems.map((item, index) => (
          <div 
            key={item.id}
            className="group aspect-square bg-gray-200 rounded-2xl overflow-hidden cursor-pointer hover:shadow-2xl transition-all duration-500 relative animate-fade-in transform hover:-translate-y-2"
            style={{ animationDelay: `${index * 0.1}s` }}
            onClick={() => setSelectedMediaIndex(index)}
          >
            {item.type === 'video' ? (
              <VideoThumbnail
                videoSrc={item.url}
                className="w-full h-full"
                alt={`Gallery video ${item.id}`}
              />
            ) : (
              <img 
                src={item.thumbnail || item.url}
                alt={`Gallery ${item.type} ${item.id}`}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                loading="lazy"
                onError={(e) => {
                  // Hide image if it fails to load instead of trying placeholder
                  e.currentTarget.style.display = 'none'
                }}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            {item.type === 'video' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-20 group-hover:bg-opacity-30 transition-all duration-500">
                <div className="bg-white rounded-full p-4 group-hover:scale-110 transition-all duration-300 shadow-xl">
                  <Play className="w-10 h-10 text-primary-600 ml-1" />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Media Modal with Navigation */}
      {selectedMedia && selectedMediaIndex !== null && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedMediaIndex(null)}
          onKeyDown={handleKeyDown}
          tabIndex={0}
        >
          <div className="relative max-w-6xl max-h-full w-full flex items-center">
            {/* Previous Button */}
            {processedItems.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  goToPrevious()
                }}
                className="absolute left-4 text-white bg-black bg-opacity-50 rounded-full p-3 hover:bg-opacity-75 transition-all duration-200 z-10"
                aria-label="Previous"
              >
                <ChevronLeft className="w-8 h-8" />
              </button>
            )}

            {/* Media Content */}
            <div className="flex-1 flex items-center justify-center">
              {selectedMedia.type === 'video' ? (
                <div className="aspect-video bg-black rounded-lg overflow-hidden w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
                  <LazyVideo
                    src={selectedMedia.url}
                    className="w-full h-full"
                    controls={true}
                    autoPlay={true}
                    playsInline={true}
                  />
                </div>
              ) : (
                <img 
                  src={selectedMedia.url}
                  alt={`Gallery image ${selectedMediaIndex + 1}`}
                  className="max-w-full max-h-[90vh] object-contain rounded-lg"
                  onClick={(e) => e.stopPropagation()}
                />
              )}
            </div>

            {/* Next Button */}
            {processedItems.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  goToNext()
                }}
                className="absolute right-4 text-white bg-black bg-opacity-50 rounded-full p-3 hover:bg-opacity-75 transition-all duration-200 z-10"
                aria-label="Next"
              >
                <ChevronRight className="w-8 h-8" />
              </button>
            )}

            {/* Close Button */}
            <button
              onClick={() => setSelectedMediaIndex(null)}
              className="absolute top-4 right-4 text-white bg-black bg-opacity-50 rounded-full p-2 hover:bg-opacity-75 transition-all duration-200 z-10"
              aria-label="Close"
            >
              <X className="w-6 h-6" />
            </button>

            {/* Counter */}
            {processedItems.length > 1 && (
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-white bg-black bg-opacity-50 rounded-full px-4 py-2 text-sm">
                {selectedMediaIndex + 1} / {processedItems.length}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

export default Home
