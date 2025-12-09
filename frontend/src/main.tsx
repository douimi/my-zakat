import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import App from './App.tsx'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,  // Increased retries for mobile network issues
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),  // Exponential backoff
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,  // 5 minutes - reduce unnecessary refetches
      cacheTime: 10 * 60 * 1000,  // 10 minutes - keep cache longer
      refetchOnMount: true,
      refetchOnReconnect: true,
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