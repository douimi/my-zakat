import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import { Calendar, User, ArrowRight, Play, BookOpen, Heart } from 'lucide-react'
import { storiesAPI, getStaticFileUrl } from '../utils/api'
import type { Story } from '../types'
import VideoThumbnail from '../components/VideoThumbnail'

const Stories = () => {
  const { data: stories, isLoading, error } = useQuery('public-stories', () => 
    storiesAPI.getAll(true, false) // Get active stories, not just featured
  )

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
            <h1 className="text-4xl font-heading font-bold mb-4">Stories of Impact</h1>
            <p className="text-red-600">Error loading stories. Please try again later.</p>
          </div>
        </div>
      </div>
    )
  }

  const featuredStories = stories?.filter((story: Story) => story.is_featured) || []
  const regularStories = stories?.filter((story: Story) => !story.is_featured) || []

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-primary-600 to-primary-800 text-white py-20">
        <div className="section-container">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-5xl font-heading font-bold mb-6">Stories of Impact</h1>
            <p className="text-xl text-primary-100 leading-relaxed">
              Read inspiring stories from those whose lives have been changed through your generosity. 
              Every donation creates ripples of hope and transformation in communities around the world.
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="section-container py-16">
        {/* Featured Stories */}
        {featuredStories.length > 0 && (
          <div className="mb-16">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-heading font-bold text-gray-900 mb-4">Featured Stories</h2>
              <p className="text-gray-600 max-w-2xl mx-auto">
                Highlighted stories that showcase the incredible impact of your support
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {featuredStories.slice(0, 2).map((story: Story) => (
                <FeaturedStoryCard key={story.id} story={story} />
              ))}
            </div>
          </div>
        )}

        {/* All Stories */}
        {regularStories.length > 0 && (
          <div>
            <div className="text-center mb-12">
              <h2 className="text-3xl font-heading font-bold text-gray-900 mb-4">All Stories</h2>
              <p className="text-gray-600 max-w-2xl mx-auto">
                Discover more stories of hope, resilience, and transformation
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {regularStories.map((story: Story) => (
                <StoryCard key={story.id} story={story} />
              ))}
            </div>
          </div>
        )}

        {/* No Stories */}
        {(!stories || stories.length === 0) && (
          <div className="text-center py-20">
            <BookOpen className="w-24 h-24 mx-auto text-gray-300 mb-8" />
            <h2 className="text-3xl font-heading font-bold text-gray-900 mb-4">No Stories Yet</h2>
            <p className="text-gray-600 max-w-2xl mx-auto mb-8">
              We're working on sharing inspiring stories from our community. Check back soon for updates!
            </p>
            <Link 
              to="/donate" 
              className="btn-primary inline-flex items-center"
            >
              Make a Difference Today
              <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </div>
        )}
      </div>

      {/* Call to Action */}
      <div className="bg-primary-50 py-16">
        <div className="section-container text-center">
          <h2 className="text-3xl font-heading font-bold text-gray-900 mb-4">
            Your Story Could Be Next
          </h2>
          <p className="text-gray-600 max-w-3xl mx-auto mb-8">
            Every donation, no matter the size, creates stories of hope and transformation. 
            Join us in writing the next chapter of positive change.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/donate" className="btn-primary">
              Donate Now
            </Link>
            <Link to="/volunteer" className="btn-outline">
              Volunteer With Us
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

interface FeaturedStoryCardProps {
  story: Story
}

const FeaturedStoryCard = ({ story }: FeaturedStoryCardProps) => {
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

  const imageUrl = getImageUrl(story.image_filename)

  return (
    <div className="card hover:shadow-xl transition-shadow duration-300 overflow-hidden">
      {/* Story Image/Video */}
      {imageUrl && (
        <div className="aspect-video bg-gray-200 relative overflow-hidden">
          <img 
            src={imageUrl} 
            alt={story.title}
            className="w-full h-full object-cover"
            crossOrigin={imageUrl?.startsWith('http://') || imageUrl?.startsWith('https://') ? 'anonymous' : undefined}
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
          <div className="absolute top-4 left-4">
            <span className="bg-primary-600 text-white px-3 py-1 rounded-full text-sm font-medium">
              Featured
            </span>
          </div>
        </div>
      )}

      <div className="p-8">
        <h3 className="text-2xl font-heading font-bold text-gray-900 mb-4">{story.title}</h3>
        <p className="text-gray-600 mb-6 text-lg leading-relaxed">{story.summary}</p>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center text-sm text-gray-500">
            <Calendar className="w-4 h-4 mr-2" />
            <span>Published recently</span>
          </div>
          <Link 
            to={`/stories/${story.id}`}
            className="btn-primary inline-flex items-center"
          >
            Read Full Story
            <ArrowRight className="w-4 h-4 ml-2" />
          </Link>
        </div>
      </div>
    </div>
  )
}

interface StoryCardProps {
  story: Story
}

const StoryCard = ({ story }: StoryCardProps) => {
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

  const imageUrl = getImageUrl(story.image_filename)

  return (
    <div className="card hover:shadow-lg transition-shadow duration-300">
      {/* Story Image */}
      {imageUrl && (
        <div className="aspect-video bg-gray-200 rounded-t-lg overflow-hidden relative">
          <img 
            src={imageUrl} 
            alt={story.title}
            className="w-full h-full object-cover"
            crossOrigin={imageUrl?.startsWith('http://') || imageUrl?.startsWith('https://') ? 'anonymous' : undefined}
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
          {story.video_filename && (
            <div className="absolute inset-0 bg-black bg-opacity-30 flex items-center justify-center">
              <div className="w-12 h-12 bg-white bg-opacity-90 rounded-full flex items-center justify-center">
                <Play className="w-6 h-6 text-primary-600 ml-0.5" />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-3">{story.title}</h3>
        <p className="text-gray-600 mb-4 line-clamp-3">{story.summary}</p>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center text-sm text-gray-500">
            <Heart className="w-4 h-4 mr-1 text-red-500" />
            <span>Impact Story</span>
          </div>
          <Link 
            to={`/stories/${story.id}`}
            className="btn-outline text-sm"
          >
            Read More
          </Link>
        </div>
      </div>
    </div>
  )
}

export default Stories
