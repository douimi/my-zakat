import { useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from 'react-query'
import { urgentNeedsAPI } from '../utils/api'
import { IMAGE_WIDTHS } from '../utils/mediaHelpers'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

const UrgentNeedDetail = () => {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const jsRef = useRef<HTMLScriptElement | null>(null)
  const cssRef = useRef<HTMLStyleElement | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  const { data: need, isLoading, error } = useQuery(
    ['urgent-need', slug],
    () => urgentNeedsAPI.getBySlug(slug!),
    {
      enabled: !!slug,
      retry: false,
    }
  )

  useEffect(() => {
    // Clean up any existing urgent need CSS/JS from previous visits
    // Remove all style elements with IDs starting with 'urgent-need-css-'
    const existingStyles = document.querySelectorAll('style[id^="urgent-need-css-"]')
    existingStyles.forEach((style) => {
      style.remove()
    })
    
    // Remove any existing urgent need scripts
    const existingScripts = document.querySelectorAll('script[data-urgent-need]')
    existingScripts.forEach((script) => {
      script.remove()
    })

    // Inject CSS
    if (need?.css_content) {
      const styleId = `urgent-need-css-${need.id}`
      const styleElement = document.createElement('style')
      styleElement.id = styleId
      styleElement.textContent = need.css_content
      document.head.appendChild(styleElement)
      cssRef.current = styleElement
    }

    // Suppress window.alert so injected JS cannot block navigation with pop-ups
    const originalAlert = window.alert
    window.alert = () => {}

    // Inject JS
    if (need?.js_content) {
      const script = document.createElement('script')
      script.setAttribute('data-urgent-need', 'true')
      script.textContent = need.js_content
      document.body.appendChild(script)
      jsRef.current = script
    }

    // Cleanup function - remove CSS and JS when component unmounts or need changes
    return () => {
      // Restore original alert
      window.alert = originalAlert

      // Remove CSS
      if (cssRef.current && cssRef.current.parentNode) {
        cssRef.current.parentNode.removeChild(cssRef.current)
        cssRef.current = null
      }

      // Remove JS
      if (jsRef.current && jsRef.current.parentNode) {
        jsRef.current.parentNode.removeChild(jsRef.current)
        jsRef.current = null
      }
    }
  }, [need])

  // Intercept clicks on donate links/buttons within the injected HTML content.
  // Redirects to /donate with the urgent need title pre-selected, skipping any
  // alert() calls that may have been attached by the custom JS.
  useEffect(() => {
    const container = contentRef.current
    if (!container || !need) return

    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('a, button')
      if (!target) return

      const text = (target.textContent || '').toLowerCase()
      const href = (target as HTMLAnchorElement).href || ''

      const isDonateAction =
        text.includes('donate') ||
        href.includes('/donate') ||
        target.classList.contains('donate-btn') ||
        target.getAttribute('data-action') === 'donate'

      if (isDonateAction) {
        e.preventDefault()
        e.stopPropagation()
        navigate(`/donate?purpose=${encodeURIComponent(need.title)}`)
      }
    }

    container.addEventListener('click', handleClick, true)
    return () => container.removeEventListener('click', handleClick, true)
  }, [need, navigate])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (error || !need) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Urgent Need Not Found</h1>
          <Link to="/" className="text-primary-600 hover:text-primary-700">
            Return to Homepage
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="section-container py-4">
          <Link
            to="/"
            className="inline-flex items-center text-gray-600 hover:text-primary-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="section-container py-8">
        {need.image_url && (
          <div className="mb-8">
            <img
              src={need.image_url && !need.image_url.startsWith('http://') && !need.image_url.startsWith('https://') ? `${need.image_url}${need.image_url.includes('?') ? '&' : '?'}w=${IMAGE_WIDTHS.LARGE}` : need.image_url}
              alt={need.title}
              className="w-full h-64 md:h-96 object-cover rounded-lg shadow-lg"
            />
          </div>
        )}

        <div ref={contentRef} className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-4xl font-heading font-bold text-gray-900 mb-4">{need.title}</h1>

          {need.short_description && (
            <p className="text-xl text-gray-600 mb-8">{need.short_description}</p>
          )}

          {need.html_content ? (
            <div
              className="urgent-need-content prose prose-lg max-w-none"
              dangerouslySetInnerHTML={{ __html: need.html_content }}
            />
          ) : (
            <div className="text-gray-600">
              <p>Content coming soon...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default UrgentNeedDetail

