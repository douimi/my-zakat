import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import { HelmetProvider } from 'react-helmet-async'
import App from './App.tsx'
import './index.css'
import { LOCALES, LocaleProvider, detectLocale } from './i18n'

// The locale is the URL's first segment, read once: /ar/... is the Arabic site.
// Mounting the router under basename "/ar" makes every existing <Link to="/x">
// resolve to /ar/x, so no link in the app needs to know about languages.
const locale = detectLocale(window.location.pathname)
const { dir, htmlLang, prefix } = LOCALES[locale]
document.documentElement.lang = htmlLang
document.documentElement.dir = dir
if (locale === 'ar') {
  // Loaded only for Arabic readers: the English site pays nothing for it.
  const font = document.createElement('link')
  font.rel = 'stylesheet'
  font.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap'
  document.head.appendChild(font)
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        // Don't retry on 4xx errors (client errors)
        if (error?.response?.status >= 400 && error?.response?.status < 500) {
          return false
        }
        // Retry up to 2 times for network errors (mobile networks are flaky)
        return failureCount < 2
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),  // Max 10s delay
      refetchOnWindowFocus: false,
      staleTime: 10 * 60 * 1000,  // 10 minutes - reduce unnecessary refetches on slow networks
      cacheTime: 30 * 60 * 1000,  // 30 minutes - keep cache longer for offline support
      refetchOnMount: false,  // Don't refetch if data exists in cache
      refetchOnReconnect: true,
      // Use network-first strategy but fallback to cache quickly on slow networks
      networkMode: 'online',
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <LocaleProvider locale={locale}>
          <BrowserRouter basename={prefix || undefined}>
            <App />
          </BrowserRouter>
        </LocaleProvider>
      </QueryClientProvider>
    </HelmetProvider>
  </React.StrictMode>,
)