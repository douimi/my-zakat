import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import { ArrowRight, Heart } from 'lucide-react'
import { programCategoriesAPI, getStaticFileUrl } from '../utils/api'
import { IMAGE_WIDTHS } from '../utils/mediaHelpers'
import type { ProgramCategory } from '../types'
import LazyVideo from '../components/LazyVideo'
import SEOHead from '../components/SEOHead'
import PageHeader from '../components/ui/PageHeader'

// Card title link whose ::after covers the whole card (one link per card). The video
// player sits above it (z-10) so its native controls stay usable.
const STRETCHED_LINK = 'after:absolute after:inset-0 after:content-[""] focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-primary-600 focus-visible:after:rounded-xl'

const Programs = () => {
  const { data: categories, isLoading, error } = useQuery<ProgramCategory[]>('program-categories', () =>
    programCategoriesAPI.getAll(true)
  )

  // Helper to get category media - checks video first, then image
  const getCategoryMedia = (category: ProgramCategory) => {
    if (category.video_filename) {
      // Video takes priority
      const videoUrl = getStaticFileUrl(`/api/uploads/program_categories/${category.video_filename}`)
      return { url: videoUrl, type: 'video' as const }
    }
    if (category.image_url) {
      return { url: category.image_url, type: 'image' as const }
    }
    return { url: null, type: 'image' as const }
  }

  const header = (
    <PageHeader
      title="Our programs"
      description="The areas we fund. Open one to see its programs and how to give."
    />
  )

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white">
        {header}
        <div className="section">
          <div className="section-container grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" role="status">
            <span className="sr-only">Loading programs</span>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-80 rounded-xl bg-gray-100" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white">
        {header}
        <div className="section">
          <div className="section-container">
            <p className="alert-error" role="alert">Unable to load programs. Please try again later.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <SEOHead
        title="Charitable Programs"
        description="Explore MyZakat charitable programs. From emergency relief to community development, find programs that make a lasting impact and support those in need."
        canonicalPath="/programs"
      />
      {header}

      <section className="section">
        <div className="section-container">
          {categories && categories.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {categories.map((category) => {
                const media = getCategoryMedia(category)
                return (
                  <article key={category.id} className="card-media group relative">
                    <div className="relative h-56 overflow-hidden bg-gray-100">
                      {media.type === 'video' && media.url ? (
                        <div className="relative z-10 h-full">
                          <LazyVideo
                            src={media.url}
                            className="w-full h-full object-cover"
                            controls={true}
                            playsInline={true}
                          />
                        </div>
                      ) : media.url ? (
                        <img
                          src={!media.url.startsWith('http://') && !media.url.startsWith('https://') ? `${media.url}${media.url.includes('?') ? '&' : '?'}w=${IMAGE_WIDTHS.THUMB}` : media.url}
                          alt=""
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none'
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center" aria-hidden="true">
                          <Heart className="w-12 h-12 text-gray-300" />
                        </div>
                      )}
                    </div>

                    <div className="card-body">
                      <h2 className="card-title text-xl">
                        <Link to={`/categories/${category.slug}`} className={`hover:text-primary-700 ${STRETCHED_LINK}`}>
                          {category.title}
                        </Link>
                      </h2>
                      {category.impact_text && (
                        <p className="mt-2"><span className="badge-primary">{category.impact_text}</span></p>
                      )}
                      <p className="mt-2 text-gray-600 leading-relaxed line-clamp-3">
                        {category.short_description || category.description || ''}
                      </p>
                      <span className="mt-4 text-sm font-medium text-primary-700 inline-flex items-center gap-1" aria-hidden="true">
                        Learn More <ArrowRight className="w-4 h-4" />
                      </span>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-16">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">No programs yet</h2>
              <p className="text-gray-600">
                Programs will appear here once they are added. You can still{' '}
                <Link to="/donate" className="link">give where the need is greatest</Link>.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

export default Programs
