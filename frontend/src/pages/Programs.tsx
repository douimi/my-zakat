import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import { ArrowRight, Heart } from 'lucide-react'
import { programCategoriesAPI, getStaticFileUrl } from '../utils/api'
import type { ProgramCategory } from '../types'
import LazyVideo from '../components/LazyVideo'
import VideoThumbnail from '../components/VideoThumbnail'

const Programs = () => {
  const { data: categories, isLoading, error } = useQuery('program-categories', () => 
    programCategoriesAPI.getAll(true)
  )

  // Helper to get category media - checks video first, then image
  const getCategoryMedia = (category: ProgramCategory) => {
    if (category.video_filename) {
      // Video takes priority
      const videoUrl = getStaticFileUrl(`/api/uploads/program_categories/${category.video_filename}`)
      return { url: videoUrl, type: 'video' as const }
    } else if (category.image_url) {
      // Fallback to image - check if it's a URL or needs to be constructed
      if (category.image_url.startsWith('http://') || category.image_url.startsWith('https://')) {
        return { url: category.image_url, type: 'image' as const }
      }
      return { url: category.image_url, type: 'image' as const }
    }
    
    return { url: null, type: 'image' as const }
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
            <h1 className="text-3xl font-bold text-gray-900 mb-4">Error Loading Programs</h1>
            <p className="text-gray-600">Unable to load program categories. Please try again later.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <section className="py-20 bg-gradient-to-br from-blue-50 via-white to-blue-50 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 left-0 w-96 h-96 bg-primary-600 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-400 rounded-full blur-3xl"></div>
        </div>
        <div className="section-container relative z-10">
          <div className="text-center mb-16">
            <div className="inline-block px-4 py-2 bg-primary-100 text-primary-700 rounded-full text-sm font-semibold mb-4">
              Our Work
            </div>
            <h1 className="text-4xl lg:text-6xl font-heading font-bold text-gray-900 mb-6">
              Programs That Make
              <span className="block text-primary-600 mt-2">A Real Difference</span>
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
              Focused initiatives that address the most critical needs in underserved communities around the world. 
              Each program is designed to create lasting impact and transform lives.
            </p>
          </div>
        </div>
      </section>

      {/* Programs Grid */}
      {categories && categories.length > 0 ? (
        <section className="py-20 bg-white relative">
          <div className="section-container">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {categories.map((category: ProgramCategory, index: number) => {
                const media = getCategoryMedia(category)
                return (
                  <div 
                    key={category.id}
                    className="group bg-white rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-3 animate-fade-in overflow-hidden border border-gray-100"
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    {/* Media Section */}
                    <div className="relative overflow-hidden h-64">
                      {media.type === 'video' && media.url ? (
                        <LazyVideo
                          src={media.url}
                          className="w-full h-full object-cover"
                          controls={true}
                          playsInline={true}
                        />
                      ) : media.url ? (
                        <>
                          <img 
                            src={media.url} 
                            alt={category.title}
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
                          <Heart className="w-16 h-16 text-gray-400" />
                        </div>
                      )}
                    </div>
                    
                    {/* Content Section */}
                    <div className="p-6">
                      <h3 className="text-2xl font-bold text-gray-900 mb-2 group-hover:text-primary-600 transition-colors">
                        {category.title}
                      </h3>
                      {category.impact_text && (
                        <div className="mb-3">
                          <span className="inline-block bg-primary-100 text-primary-700 px-3 py-1 rounded-full text-sm font-semibold">
                            {category.impact_text}
                          </span>
                        </div>
                      )}
                      <p className="text-gray-600 mb-4 leading-relaxed line-clamp-3">
                        {category.short_description || category.description || ''}
                      </p>
                      {category.description && category.description.length > 100 && (
                        <p className="text-gray-500 text-sm mb-6 leading-relaxed">
                          {category.description}
                        </p>
                      )}
                      <Link 
                        to={`/categories/${category.slug}`}
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
          </div>
        </section>
      ) : (
        <section className="py-20 bg-white">
          <div className="section-container">
            <div className="text-center py-20">
              <Heart className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">No Programs Available</h2>
              <p className="text-gray-600">Program categories will be displayed here once they are added.</p>
            </div>
          </div>
        </section>
      )}

      {/* CTA Section */}
      <section className="py-20 hero-gradient text-white">
        <div className="section-container text-center">
          <h2 className="text-3xl lg:text-5xl font-heading font-bold mb-6">
            Ready to Make a Difference?
          </h2>
          <p className="text-xl lg:text-2xl mb-8 text-blue-100 max-w-3xl mx-auto">
            Your Zakat and Sadaqa can transform lives today. Choose a program that resonates with you and make a lasting impact.
          </p>
          <Link 
            to="/donate" 
            className="inline-flex items-center btn-primary bg-white text-primary-600 hover:bg-blue-50 text-xl px-10 py-4"
          >
            Donate Now
            <Heart className="ml-2 w-6 h-6" />
          </Link>
        </div>
      </section>
    </div>
  )
}

export default Programs
