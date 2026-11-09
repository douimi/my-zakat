import { useParams, Link } from 'react-router-dom'
import { useQuery } from 'react-query'
import { ArrowLeft, Heart } from 'lucide-react'
import { storiesAPI, getStaticFileUrl } from '../utils/api'
import { getOptimizedImageUrl, IMAGE_WIDTHS } from '../utils/mediaHelpers'
import LazyVideo from '../components/LazyVideo'
import SEOHead from '../components/SEOHead'

const BackToStories = () => (
  <Link to="/stories" className="link inline-flex items-center gap-1 text-sm">
    <ArrowLeft className="w-4 h-4" aria-hidden="true" /> All stories
  </Link>
)

const StoryDetail = () => {
  const { id } = useParams<{ id: string }>()

  const { data: story, isLoading, error } = useQuery(
    ['story', id],
    () => storiesAPI.getById(Number(id!)),
    {
      enabled: !!id,
      retry: false,
    }
  )

  // Helper function to get image URL with LARGE optimization
  const getImageUrl = (imageFilename?: string) => {
    return getOptimizedImageUrl(imageFilename, IMAGE_WIDTHS.LARGE, 'stories')
  }

  // Helper function to get video URL - check if it's a filename
  const getVideoUrl = (videoFilename?: string) => {
    if (!videoFilename) return null
    // Check if it's a full URL (starts with http:// or https://)
    if (videoFilename.startsWith('http://') || videoFilename.startsWith('https://')) {
      return videoFilename
    }
    // Otherwise, treat it as a filename and load from uploads
    return getStaticFileUrl(`/api/uploads/stories/${videoFilename}`)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" role="status">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" aria-hidden="true" />
        <span className="sr-only">Loading story</span>
      </div>
    )
  }

  if (error || !story) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <SEOHead title="Story not found" noindex />
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Story Not Found</h1>
          <Link to="/stories" className="link">
            Return to Stories
          </Link>
        </div>
      </div>
    )
  }

  const imageUrl = getImageUrl(story.image_filename)
  const videoUrl = story.video_filename ? getVideoUrl(story.video_filename) : null
  const paragraphs = (story.content || '')
    .split('\n')
    .map((p) => p.trim())
    .filter(Boolean)
  const donateHref = `/donate?purpose=${encodeURIComponent(story.title)}`

  return (
    <div className="min-h-screen bg-gray-50">
      <SEOHead
        title={story.title}
        description={story.summary || undefined}
        canonicalPath={`/stories/${story.id}`}
        ogType="article"
        ogImage={imageUrl && /^https?:\/\//.test(imageUrl) ? imageUrl : undefined}
      />
      <div className="section-container py-8 sm:py-10">
        <div className="max-w-3xl mx-auto space-y-6">
          <BackToStories />

          {/* Story video (playable) or image */}
          {(videoUrl || imageUrl) && (
            <div className="aspect-video bg-gray-200 rounded-xl overflow-hidden relative">
              {videoUrl ? (
                <LazyVideo
                  src={videoUrl}
                  className="w-full h-full"
                  controls={true}
                  autoPlay={false}
                  playsInline={true}
                />
              ) : (
                <img
                  src={imageUrl!}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
              )}
            </div>
          )}

          <article className="card sm:p-8">
            {story.is_featured && <span className="badge-primary mb-3">Featured</span>}
            <h1 className="text-3xl sm:text-4xl font-heading font-bold text-gray-900">{story.title}</h1>

            {story.summary && (
              <p className="mt-4 text-lg sm:text-xl text-gray-600 leading-relaxed">{story.summary}</p>
            )}

            {paragraphs.length > 0 && (
              <div className="prose prose-lg max-w-none mt-6">
                {paragraphs.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            )}

            {/* The story text asks readers to donate: give them the link it refers to. */}
            <div className="mt-8 pt-6 border-t border-gray-200 flex flex-wrap items-center gap-4">
              <Link to={donateHref} className="btn-primary gap-2">
                <Heart className="w-4 h-4" aria-hidden="true" /> Donate
              </Link>
              <BackToStories />
            </div>
          </article>
        </div>
      </div>
    </div>
  )
}

export default StoryDetail
