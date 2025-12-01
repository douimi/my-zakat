import { getStaticFileUrl } from './api'

/**
 * Get image URL from a filename or full URL
 * @param filename - Image filename or full URL
 * @param basePath - Base path for uploaded files (e.g., 'stories', 'events', 'testimonials', 'media/images')
 * @returns Full URL to the image or null if no filename provided
 */
export const getImageUrl = (filename?: string, basePath: string = 'media/images'): string | null => {
  if (!filename) return null
  
  // If it's already a full URL, return as-is
  if (filename.startsWith('http://') || filename.startsWith('https://')) {
    return filename
  }
  
  // Otherwise, treat it as a filename and construct the path
  return getStaticFileUrl(`/api/uploads/${basePath}/${filename}`)
}

/**
 * Get video URL from a filename or full URL
 * @param filename - Video filename or full URL
 * @param basePath - Base path for uploaded files (e.g., 'stories', 'testimonials', 'media/videos')
 * @returns Full URL to the video or null if no filename provided
 */
export const getVideoUrl = (filename?: string, basePath: string = 'media/videos'): string | null => {
  if (!filename) return null
  
  // If it's already a full URL, return as-is
  if (filename.startsWith('http://') || filename.startsWith('https://')) {
    return filename
  }
  
  // Otherwise, treat it as a filename and construct the path
  return getStaticFileUrl(`/api/uploads/${basePath}/${filename}`)
}

/**
 * Get media URL and determine if it's a video or image
 * @param filename - Media filename or full URL
 * @param imageBasePath - Base path for images
 * @param videoBasePath - Base path for videos
 * @returns Object with url and type
 */
export const getMediaUrl = (
  filename: string,
  imageBasePath: string = 'media/images',
  videoBasePath: string = 'media/videos'
): { url: string; isVideo: boolean } => {
  // Check if it's a full URL
  if (filename.startsWith('http://') || filename.startsWith('https://')) {
    const isVideo = filename.includes('youtube.com') || 
                   filename.includes('youtu.be') || 
                   filename.includes('vimeo.com') || 
                   filename.match(/\.(mp4|webm|ogg|avi|mov)$/i)
    return { url: filename, isVideo: !!isVideo }
  }
  
  // Determine if it's a video based on extension
  const isVideo = filename.match(/\.(mp4|webm|ogg|avi|mov)$/i)
  const basePath = isVideo ? videoBasePath : imageBasePath
  const url = getStaticFileUrl(`/api/uploads/${basePath}/${filename}`)
  
  return { url, isVideo: !!isVideo }
}

/**
 * Validate if a URL is a valid image URL
 */
export const isValidImageUrl = (url: string): boolean => {
  if (!url) return true // Empty URL is valid
  
  try {
    const validUrl = new URL(url)
    const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']
    const hasValidExtension = validExtensions.some(ext => 
      validUrl.pathname.toLowerCase().includes(ext)
    )
    const isValidDomain = validUrl.protocol === 'http:' || validUrl.protocol === 'https:'
    return isValidDomain && (hasValidExtension || url.includes('unsplash') || url.includes('pexels') || url.includes('pixabay'))
  } catch {
    return false
  }
}

/**
 * Validate if a URL is a valid video URL
 */
export const isValidVideoUrl = (url: string): boolean => {
  if (!url) return true // Empty URL is valid
  
  try {
    const validUrl = new URL(url)
    const isValidDomain = validUrl.protocol === 'http:' || validUrl.protocol === 'https:'
    const isYoutube = url.includes('youtube.com') || url.includes('youtu.be')
    const isVimeo = url.includes('vimeo.com')
    const videoExtensions = ['.mp4', '.webm', '.ogg', '.avi', '.mov']
    const hasVideoExtension = videoExtensions.some(ext => 
      validUrl.pathname.toLowerCase().includes(ext)
    )
    return isValidDomain && (isYoutube || isVimeo || hasVideoExtension)
  } catch {
    return false
  }
}

