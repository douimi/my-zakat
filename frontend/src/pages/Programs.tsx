import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import { TrendingUp, ArrowRight, Heart, Users, Globe, CheckCircle } from 'lucide-react'
import { settingsAPI, getStaticFileUrl } from '../utils/api'
import LazyVideo from '../components/LazyVideo'

const Programs = () => {
  const { data: settings, isLoading, error } = useQuery('programs-settings', settingsAPI.getAll)

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
            <h1 className="text-4xl font-heading font-bold mb-4">Our Programs</h1>
            <p className="text-red-600">Error loading programs. Please try again later.</p>
          </div>
        </div>
      </div>
    )
  }

  const getSettingValue = (key: string): string => {
    const setting = settings?.find(s => s.key === key)
    return setting?.value || ''
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
      id: 1,
      title: getSettingValue('program_title_1'),
      description: getSettingValue('program_description_1'),
      media: getProgramMedia(1),
      impact: getSettingValue('program_impact_1')
    },
    {
      id: 2,
      title: getSettingValue('program_title_2'),
      description: getSettingValue('program_description_2'),
      media: getProgramMedia(2),
      impact: getSettingValue('program_impact_2')
    },
    {
      id: 3,
      title: getSettingValue('program_title_3'),
      description: getSettingValue('program_description_3'),
      media: getProgramMedia(3),
      impact: getSettingValue('program_impact_3')
    }
  ].filter(program => program.title || program.description || program.impact) // Only show programs with at least some data

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-primary-600 to-primary-800 text-white py-20">
        <div className="section-container">
          <div className="text-center">
            <h1 className="text-5xl font-heading font-bold mb-6">Our Programs</h1>
            <p className="text-xl text-primary-100 max-w-3xl mx-auto">
              Comprehensive initiatives designed to address critical needs and create lasting positive change in communities worldwide
            </p>
          </div>
        </div>
      </div>

      {/* General Information Section */}
      <section className="py-20 bg-white">
        <div className="section-container">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <div className="inline-block px-4 py-2 bg-primary-100 text-primary-700 rounded-full text-sm font-semibold mb-4">
                About Our Programs
              </div>
              <h2 className="text-4xl font-heading font-bold text-gray-900 mb-6">
                Making a Difference Through Strategic Initiatives
              </h2>
            </div>
            
            <div className="prose prose-lg max-w-none text-gray-600 space-y-6">
              <p className="text-xl leading-relaxed">
                At MyZakat, we believe in creating sustainable, impactful change through carefully designed programs that address the most pressing needs in underserved communities. Our programs are built on principles of transparency, accountability, and measurable impact.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 my-12">
                <div className="text-center">
                  <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Heart className="w-8 h-8 text-primary-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">Compassionate Care</h3>
                  <p className="text-gray-600">
                    Every program is designed with compassion and respect for the dignity of those we serve
                  </p>
                </div>
                
                <div className="text-center">
                  <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <TrendingUp className="w-8 h-8 text-primary-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">Measurable Impact</h3>
                  <p className="text-gray-600">
                    We track and report on the real-world impact of every program to ensure accountability
                  </p>
                </div>
                
                <div className="text-center">
                  <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Globe className="w-8 h-8 text-primary-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">Global Reach</h3>
                  <p className="text-gray-600">
                    Our programs extend across borders, bringing hope and support to communities worldwide
                  </p>
                </div>
              </div>
              
              <p className="text-lg leading-relaxed">
                Each program is carefully planned, regularly evaluated, and continuously improved to maximize the positive impact of your generous contributions. We work closely with local partners and communities to ensure that our programs are culturally sensitive, sustainable, and truly meet the needs of those we serve.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Current Programs Section */}
      <section className="py-20 bg-gradient-to-b from-gray-50 to-white">
        <div className="section-container">
          <div className="text-center mb-16">
            <div className="inline-block px-4 py-2 bg-primary-100 text-primary-700 rounded-full text-sm font-semibold mb-4">
              Active Programs
            </div>
            <h2 className="text-4xl lg:text-5xl font-heading font-bold text-gray-900 mb-6">
              Programs We're Currently Running
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
              These are the programs currently active and making a real difference in communities around the world
            </p>
          </div>

          {programs.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {programs.map((program, index) => (
                <div 
                  key={program.id}
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
                        <TrendingUp className="w-16 h-16 text-gray-400" />
                      </div>
                    )}
                  </div>
                  
                  {/* Content Section */}
                  <div className="p-6">
                    <h3 className="text-2xl font-bold text-gray-900 mb-2 group-hover:text-primary-600 transition-colors">
                      {program.title || `Program ${program.id}`}
                    </h3>
                    {program.impact && (
                      <div className="mb-3">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-primary-100 text-primary-700">
                          <CheckCircle className="w-4 h-4 mr-1" />
                          {program.impact}
                        </span>
                      </div>
                    )}
                    <p className="text-gray-600 mb-6 leading-relaxed">
                      {program.description || 'This program is making a positive impact in communities around the world.'}
                    </p>
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
          ) : (
            <div className="text-center py-20">
              <TrendingUp className="w-24 h-24 mx-auto text-gray-300 mb-8" />
              <h2 className="text-3xl font-heading font-bold text-gray-900 mb-4">Programs Coming Soon</h2>
              <p className="text-gray-600 max-w-2xl mx-auto mb-8">
                We're currently developing new programs to expand our impact. Check back soon for updates on our upcoming initiatives!
              </p>
              <Link 
                to="/contact" 
                className="btn-primary inline-flex items-center"
              >
                Get Notified About New Programs
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Call to Action */}
      <div className="bg-primary-50 py-16">
        <div className="section-container text-center">
          <h2 className="text-3xl font-heading font-bold text-gray-900 mb-4">
            Want to Support Our Programs?
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto mb-8">
            Your contributions directly fund these programs and help us expand our reach to more communities in need.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/donate" className="btn-primary">
              Donate Now
            </Link>
            <Link to="/contact" className="btn-outline">
              Learn More
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Programs

