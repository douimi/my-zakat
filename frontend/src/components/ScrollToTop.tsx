import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * ScrollToTop component that scrolls to top of page on route change
 * This ensures pages always start at the top when navigating
 */
const ScrollToTop = () => {
  const { pathname } = useLocation()

  useEffect(() => {
    // Scroll to top immediately when route changes
    window.scrollTo(0, 0)
    
    // Also scroll document element and body to ensure compatibility
    if (document.documentElement) {
      document.documentElement.scrollTop = 0
    }
    if (document.body) {
      document.body.scrollTop = 0
    }
    
    // Use requestAnimationFrame to ensure scroll happens after render
    requestAnimationFrame(() => {
      window.scrollTo(0, 0)
      if (document.documentElement) {
        document.documentElement.scrollTop = 0
      }
      if (document.body) {
        document.body.scrollTop = 0
      }
    })
    
    // Small timeout to catch any late-scrolling elements (like focused inputs)
    const timeoutId = setTimeout(() => {
      window.scrollTo(0, 0)
      if (document.documentElement) {
        document.documentElement.scrollTop = 0
      }
      if (document.body) {
        document.body.scrollTop = 0
      }
    }, 100)
    
    return () => clearTimeout(timeoutId)
  }, [pathname])

  return null
}

export default ScrollToTop

