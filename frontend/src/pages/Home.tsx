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
  X
} from 'lucide-react'
import { donationsAPI, storiesAPI, eventsAPI, testimonialsAPI, settingsAPI } from '../utils/api'

const Home = () => {
  const [showHeroVideoModal, setShowHeroVideoModal] = useState(false)

  const { data: donationStats, error: statsError } = useQuery('donation-stats', donationsAPI.getStats, {
    retry: false,
    onError: (error) => console.error('Stats error:', error)
  })
  const { data: featuredStories, error: storiesError } = useQuery('featured-stories', () => 
    storiesAPI.getAll(true, true), {
    retry: false,
    onError: (error) => console.error('Stories error:', error)
  })
  const { data: upcomingEvents, error: eventsError } = useQuery('upcoming-events', () => 
    eventsAPI.getAll(true), {
    retry: false,
    onError: (error) => console.error('Events error:', error)
  })
  const { data: testimonials, error: testimonialsError } = useQuery('testimonials', () => 
    testimonialsAPI.getAll(true), {
    retry: false,
    onError: (error) => console.error('Testimonials error:', error)
  })
  const { data: settings, error: settingsError } = useQuery('home-media-settings', settingsAPI.getAll, {
    retry: false,
    onError: (error) => console.error('Settings error:', error)
  })

  // Debug logging
  console.log('Home component rendering:', {
    donationStats,
    statsError,
    featuredStories,
    storiesError,
    upcomingEvents,
    eventsError,
    testimonials,
    testimonialsError,
    settings,
    settingsError
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
    return `/api/uploads/media/images/${setting.value}`
  }

  const getVideoUrl = () => {
    const setting = settings?.find(s => s.key === 'hero_video')
    if (!setting?.value) return null
    
    // If it's a URL, return as-is
    if (setting.value.startsWith('http://') || setting.value.startsWith('https://')) {
      return setting.value
    }
    
    // If it's a filename, construct the API path
    return `/api/uploads/media/videos/${setting.value}`
  }

  const getEmbedVideoUrl = (url: string) => {
    // YouTube URL conversion
    if (url.includes('youtube.com/watch?v=')) {
      const videoId = url.split('v=')[1].split('&')[0]
      return `https://www.youtube.com/embed/${videoId}`
    }
    if (url.includes('youtu.be/')) {
      const videoId = url.split('youtu.be/')[1].split('?')[0]
      return `https://www.youtube.com/embed/${videoId}`
    }
    
    // Vimeo URL conversion
    if (url.includes('vimeo.com/')) {
      const videoId = url.split('vimeo.com/')[1].split('?')[0]
      return `https://player.vimeo.com/video/${videoId}`
    }
    
    // Return original URL for direct video files
    return url
  }

  const isEmbeddableVideo = (url: string) => {
    return url.includes('youtube.com') || url.includes('youtu.be') || url.includes('vimeo.com')
  }

  const isYouTubeUrl = (url: string) => {
    return url.includes('youtube.com') || url.includes('youtu.be')
  }

  const getYouTubeVideoId = (url: string) => {
    if (url.includes('youtube.com/watch?v=')) {
      return url.split('v=')[1].split('&')[0]
    }
    if (url.includes('youtu.be/')) {
      return url.split('youtu.be/')[1].split('?')[0]
    }
    return null
  }

  const getYouTubeThumbnail = (url: string) => {
    const videoId = getYouTubeVideoId(url)
    return videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : null
  }

  const getHeroVideoData = () => {
    const videoUrl = getVideoUrl()
    if (!videoUrl) return null

    return {
      url: videoUrl,
      embedUrl: getEmbedVideoUrl(videoUrl),
      thumbnail: isYouTubeUrl(videoUrl) ? getYouTubeThumbnail(videoUrl) : 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=800&h=600&fit=crop&crop=center',
      isEmbeddable: isEmbeddableVideo(videoUrl)
    }
  }

  const programs = [
    {
      title: 'Emergency Relief',
      description: 'Immediate assistance for families in crisis situations',
      image: getMediaUrl('program_image_1', 'https://images.unsplash.com/photo-1469571486292-0ba58a3f068b?w=400&h=300&fit=crop&crop=center'),
      impact: 'Helped 1,200+ families this year'
    },
    {
      title: 'Orphan Care',
      description: 'Educational support and care for orphaned children',
      image: getMediaUrl('program_image_2', 'https://images.unsplash.com/photo-1497486751825-1233686d5d80?w=400&h=300&fit=crop&crop=center'),
      impact: 'Supporting 800+ orphans'
    },
    {
      title: 'Food & Water Aid',
      description: 'Essential nutrition and clean water access',
      image: getMediaUrl('program_image_3', 'https://images.unsplash.com/photo-1593113598332-cd288d649433?w=400&h=300&fit=crop&crop=center'),
      impact: '50,000+ meals distributed'
    }
  ]

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative hero-gradient text-white py-20 lg:py-32 overflow-hidden">
        <div className="absolute inset-0 bg-black/20"></div>
        <div className="section-container relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="animate-fade-in">
              <h1 className="text-4xl lg:text-6xl font-heading font-bold mb-6 leading-tight">
                Your Zakat,
                <br />
                <span className="text-blue-200">Their Lifeline</span>
              </h1>
              <p className="text-xl lg:text-2xl mb-8 text-blue-100 leading-relaxed">
                Join thousands of donors making a real difference in the lives of those who need it most.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 mb-8">
                <Link to="/donate" className="btn-primary bg-white text-primary-600 hover:bg-blue-50 text-lg px-8 py-4">
                  Donate Now
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Link>
                <Link to="/zakat-calculator" className="bg-transparent border-2 border-white text-white hover:bg-white hover:text-primary-600 font-medium px-8 py-4 rounded-lg transition-colors duration-200 text-lg">
                  Calculate Zakat
                </Link>
              </div>
              <div className="flex items-center space-x-4 text-blue-100">
                <CheckCircle className="w-5 h-5" />
                <span>🌍 Trusted by 10,000+ donors worldwide</span>
              </div>
            </div>

            <div className="relative animate-fade-in">
              <div className="relative rounded-2xl overflow-hidden shadow-2xl">
                {(() => {
                  const heroVideo = getHeroVideoData()
                  
                  if (!heroVideo) {
                    return (
                      <>
                        <img 
                          src="https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=800&h=600&fit=crop&crop=center" 
                          alt="Children receiving aid"
                          className="w-full h-auto"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="text-center">
                            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mb-4">
                              <Play className="w-8 h-8 text-white ml-1" />
                            </div>
                            <p className="text-white text-lg font-semibold">Video Coming Soon</p>
                          </div>
                        </div>
                      </>
                    )
                  }

                  // Always show thumbnail with play button - opens modal when clicked
                  return (
                    <div 
                      className="relative cursor-pointer group"
                      onClick={() => setShowHeroVideoModal(true)}
                    >
                      <div className="aspect-video bg-gray-200">
                        <img 
                          src={heroVideo.thumbnail}
                          alt="Hero Video Thumbnail"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.src = 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=800&h=600&fit=crop&crop=center'
                          }}
                        />
                      </div>
                      <div className="absolute inset-0 bg-black bg-opacity-40 group-hover:bg-opacity-50 flex items-center justify-center transition-all duration-300">
                        <div className="bg-white bg-opacity-90 group-hover:bg-opacity-100 rounded-full p-6 group-hover:scale-110 transition-all duration-300 shadow-2xl">
                          <Play className="w-16 h-16 text-primary-600 ml-2" />
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Impact Stats */}
      <section className="py-16 bg-gray-50">
        <div className="section-container">
          <div className="text-center mb-12">
            <h2 className="text-3xl lg:text-4xl font-heading font-bold text-gray-900 mb-4">
              Real Impact, Real Lives Changed
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              See how your donations are making a tangible difference in communities around the world
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {impactStats.map((stat, index) => (
              <div 
                key={index}
                className="card text-center hover:shadow-xl transition-shadow duration-300 animate-fade-in"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <stat.icon className={`w-12 h-12 ${stat.color} mx-auto mb-4`} />
                <div className="text-3xl font-bold text-gray-900 mb-2">{stat.value}</div>
                <div className="text-gray-600 font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16">
        <div className="section-container">
          <div className="text-center mb-12">
            <h2 className="text-3xl lg:text-4xl font-heading font-bold text-gray-900 mb-4">
              How Your Donation Works
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Transparent, efficient, and direct impact - see exactly how your generosity creates change
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: '1',
                title: 'You Donate',
                description: 'Choose your cause and make a secure donation online with complete transparency.',
                icon: Heart
              },
              {
                step: '2',
                title: 'We Deliver',
                description: 'Our team ensures your donation reaches those most in need, quickly and efficiently.',
                icon: Globe
              },
              {
                step: '3',
                title: 'Lives Change',
                description: 'Your generosity provides food, water, education, and hope to families and children.',
                icon: Users
              }
            ].map((item, index) => (
              <div key={index} className="text-center animate-fade-in" style={{ animationDelay: `${index * 0.2}s` }}>
                <div className="relative mb-6">
                  <div className="w-20 h-20 bg-primary-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <item.icon className="w-10 h-10 text-white" />
                  </div>
                  <div className="absolute -top-2 -right-2 w-8 h-8 bg-blue-100 text-primary-600 rounded-full flex items-center justify-center font-bold text-lg">
                    {item.step}
                  </div>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">{item.title}</h3>
                <p className="text-gray-600 leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Programs */}
      <section className="py-16 bg-gray-50">
        <div className="section-container">
          <div className="text-center mb-12">
            <h2 className="text-3xl lg:text-4xl font-heading font-bold text-gray-900 mb-4">
              Our Programs
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Focused initiatives that address the most critical needs in underserved communities
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {programs.map((program, index) => (
              <div 
                key={index}
                className="card hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 animate-fade-in"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="relative overflow-hidden rounded-lg mb-6">
                  <img 
                    src={program.image} 
                    alt={program.title}
                    className="w-full h-48 object-cover hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">{program.title}</h3>
                <p className="text-gray-600 mb-4 leading-relaxed">{program.description}</p>
                <div className="text-sm text-primary-600 font-medium mb-4">{program.impact}</div>
                <Link 
                  to="/donate" 
                  className="btn-primary w-full text-center"
                >
                  Support This Program
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      {testimonials && testimonials.length > 0 && (
        <section className="py-16">
          <div className="section-container">
            <div className="text-center mb-12">
              <h2 className="text-3xl lg:text-4xl font-heading font-bold text-gray-900 mb-4">
                Stories of Hope
              </h2>
              <p className="text-xl text-gray-600 max-w-3xl mx-auto">
                Hear from those whose lives have been touched by your generosity
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {testimonials.slice(0, 3).map((testimonial, index) => (
                <div 
                  key={testimonial.id}
                  className="card text-center hover:shadow-xl transition-shadow duration-300 animate-fade-in"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  {testimonial.image && (
                    <img 
                      src={testimonial.image} 
                      alt={testimonial.name}
                      className="w-16 h-16 rounded-full mx-auto mb-4 object-cover"
                    />
                  )}
                  <div className="flex justify-center mb-4">
                    {[...Array(testimonial.rating || 5)].map((_, i) => (
                      <Star key={i} className="w-5 h-5 text-yellow-400 fill-current" />
                    ))}
                  </div>
                  <p className="text-gray-600 mb-4 italic leading-relaxed">"{testimonial.text}"</p>
                  <div className="font-semibold text-gray-900">{testimonial.name}</div>
                  {testimonial.country && (
                    <div className="text-sm text-gray-500">{testimonial.country}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Gallery Section */}
      <section className="py-16 bg-white">
        <div className="section-container">
          <div className="text-center mb-12">
            <h2 className="text-3xl lg:text-4xl font-heading font-bold text-gray-900 mb-4">
              Our Work in Action
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              See the impact of your donations through photos and videos of our ongoing aid activities and operations
            </p>
          </div>

          <GallerySection settings={settings} />
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

      {/* Hero Video Modal */}
      {showHeroVideoModal && (() => {
        const heroVideo = getHeroVideoData()
        if (!heroVideo) return null
        
        return (
          <div 
            className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
            onClick={() => setShowHeroVideoModal(false)}
          >
            <div className="relative max-w-4xl max-h-full w-full">
              {heroVideo.isEmbeddable ? (
                <div className="aspect-video bg-black rounded-lg overflow-hidden">
                  <iframe
                    src={heroVideo.embedUrl}
                    className="w-full h-full"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    title="Hero Video"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              ) : (
                <video 
                  className="w-full h-auto max-h-full rounded-lg"
                  controls
                  autoPlay
                  preload="metadata"
                  onClick={(e) => e.stopPropagation()}
                >
                  <source src={heroVideo.url} type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
              )}
              <button
                onClick={() => setShowHeroVideoModal(false)}
                className="absolute top-4 right-4 text-white bg-black bg-opacity-50 rounded-full p-2 hover:bg-opacity-75 transition-all duration-200"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

interface GallerySectionProps {
  settings: any[]
}

const GallerySection = ({ settings }: GallerySectionProps) => {
  const [selectedMedia, setSelectedMedia] = useState<{url: string, type: 'image' | 'video'} | null>(null)

  const isYouTubeUrl = (url: string) => {
    return url.includes('youtube.com') || url.includes('youtu.be')
  }

  const getYouTubeVideoId = (url: string) => {
    if (url.includes('youtube.com/watch?v=')) {
      return url.split('v=')[1].split('&')[0]
    }
    if (url.includes('youtu.be/')) {
      return url.split('youtu.be/')[1].split('?')[0]
    }
    return null
  }

  const getYouTubeThumbnail = (url: string) => {
    const videoId = getYouTubeVideoId(url)
    return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null
  }

  const getYouTubeEmbedUrl = (url: string) => {
    const videoId = getYouTubeVideoId(url)
    return videoId ? `https://www.youtube.com/embed/${videoId}` : url
  }

  const getGalleryItems = () => {
    const items = []
    for (let i = 1; i <= 6; i++) {
      const setting = settings?.find(s => s.key === `gallery_item_${i}`)
      if (setting?.value) {
        const isVideo = isYouTubeUrl(setting.value)
        items.push({
          id: i,
          url: setting.value,
          type: isVideo ? 'video' : 'image',
          thumbnail: isVideo ? getYouTubeThumbnail(setting.value) : setting.value,
          embedUrl: isVideo ? getYouTubeEmbedUrl(setting.value) : null
        })
      }
    }
    return items
  }

  const galleryItems = getGalleryItems()

  if (galleryItems.length === 0) {
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
        {galleryItems.map((item) => (
          <div 
            key={item.id}
            className="aspect-square bg-gray-200 rounded-lg overflow-hidden cursor-pointer hover:shadow-lg transition-shadow duration-300 relative group"
            onClick={() => setSelectedMedia({url: item.embedUrl || item.url, type: item.type})}
          >
            <img 
              src={item.thumbnail}
              alt={`Gallery ${item.type} ${item.id}`}
              className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
              onError={(e) => {
                // Fallback for broken images
                e.currentTarget.src = 'https://via.placeholder.com/400x400/e5e7eb/9ca3af?text=Media+Not+Available'
              }}
            />
            {item.type === 'video' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 group-hover:bg-opacity-40 transition-all duration-300">
                <div className="bg-white bg-opacity-90 rounded-full p-3 group-hover:bg-opacity-100 transition-all duration-300">
                  <Play className="w-8 h-8 text-primary-600 ml-1" />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Media Modal */}
      {selectedMedia && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedMedia(null)}
        >
          <div className="relative max-w-4xl max-h-full w-full">
            {selectedMedia.type === 'video' ? (
              <div className="aspect-video bg-black rounded-lg overflow-hidden">
                <iframe
                  src={selectedMedia.url}
                  className="w-full h-full"
                  frameBorder="0"
                  allowFullScreen
                  title="Gallery Video"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            ) : (
              <img 
                src={selectedMedia.url}
                alt="Gallery image"
                className="max-w-full max-h-full object-contain rounded-lg"
                onClick={(e) => e.stopPropagation()}
              />
            )}
            <button
              onClick={() => setSelectedMedia(null)}
              className="absolute top-4 right-4 text-white bg-black bg-opacity-50 rounded-full p-2 hover:bg-opacity-75 transition-all duration-200"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}
    </>
  )
}

export default Home
