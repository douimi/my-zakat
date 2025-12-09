import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import App from './App.tsx'
import './index.css'

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
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)