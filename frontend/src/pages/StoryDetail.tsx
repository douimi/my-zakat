import { useParams, Link } from 'react-router-dom'
import { useQuery } from 'react-query'
import { ArrowLeft, Calendar, Play } from 'lucide-react'
import { storiesAPI, getStaticFileUrl } from '../utils/api'
import LazyVideo from '../components/LazyVideo'

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

  // Helper function to get image URL - check if it's a full URL or a filename
  const getImageUrl = (imageFilename?: string) => {
    if (!imageFilename) return null
    // Check if it's a full URL (starts with http:// or https://)
    if (imageFilename.startsWith('http://') || imageFilename.startsWith('https://')) {
      return imageFilename
    }
    // Otherwise, treat it as a filename and load from uploads
    return getStaticFileUrl(`/api/uploads/stories/${imageFilename}`)
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (error || !story) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Story Not Found</h1>
          <Link to="/stories" className="text-primary-600 hover:text-primary-700">
            Return to Stories
          </Link>
        </div>
      </div>
    )
  }

  const imageUrl = getImageUrl(story.image_filename)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="section-container py-4">
          <Link
            to="/stories"
            className="inline-flex items-center text-gray-600 hover:text-primary-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Stories
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="section-container py-8">
        {/* Story Image/Video */}
        {imageUrl && (
          <div className="mb-8">
            <div className="aspect-video bg-gray-200 rounded-lg overflow-hidden relative">
              <img 
                src={imageUrl} 
                alt={story.title}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
              {story.video_filename && (
                <div className="absolute inset-0 bg-black bg-opacity-30 flex items-center justify-center">
                  <div className="w-16 h-16 bg-white bg-opacity-90 rounded-full flex items-center justify-center">
                    <Play className="w-8 h-8 text-primary-600 ml-1" />
                  </div>
                </div>
              )}
              {story.is_featured && (
                <div className="absolute top-4 left-4">
                  <span className="bg-primary-600 text-white px-3 py-1 rounded-full text-sm font-medium">
                    Featured
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="mb-6">
            <h1 className="text-4xl font-heading font-bold text-gray-900 mb-4">{story.title}</h1>
            <div className="flex items-center text-sm text-gray-500">
              <Calendar className="w-4 h-4 mr-2" />
              <span>Published recently</span>
            </div>
          </div>

          {story.summary && (
            <div className="mb-8">
              <p className="text-xl text-gray-600 leading-relaxed">{story.summary}</p>
            </div>
          )}

          {story.content && (
            <div className="prose prose-lg max-w-none">
              <div className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                {story.content.split('\n').map((paragraph, index) => (
                  <p key={index} className="mb-4">
                    {paragraph}
                  </p>
                ))}
              </div>
            </div>
          )}

          {story.video_filename && (() => {
            const videoUrl = getVideoUrl(story.video_filename)
            return videoUrl ? (
              <div className="mt-8">
                <h2 className="text-2xl font-heading font-bold text-gray-900 mb-4">Video</h2>
                <div className="aspect-video bg-gray-200 rounded-lg overflow-hidden">
                  <LazyVideo
                    src={videoUrl}
                    className="w-full h-full"
                    controls={true}
                    playsInline={true}
                    poster={imageUrl || undefined}
                  />
                </div>
              </div>
            ) : null
          })()}
        </div>
      </div>
    </div>
  )
}

export default StoryDetail
