import axios from 'axios'
import type {
  Donation,
  ContactSubmission,
  Event,
  Story,
  Testimonial,
  Volunteer,
  Subscription,
  ZakatCalculation,
  ZakatResult,
  DonationStats,
  DashboardStats,
  PaymentSession,
} from '../types'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: API_BASE_URL,
})

// Helper function to get the correct URL for static files (uploads)
// In development, Vite proxy handles /api, but we need full URL for video elements
export const getStaticFileUrl = (path: string): string => {
  // If path is already a full URL, return it as-is
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }
  // If path starts with /api, prepend the API base URL
  if (path.startsWith('/api/')) {
    return `${API_BASE_URL}${path}`
  }
  // Otherwise, assume it's a relative path and prepend /api/uploads
  return `${API_BASE_URL}/api/uploads/${path}`
}

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle 401 responses by clearing invalid tokens
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear invalid token and redirect to login
      localStorage.removeItem('auth_token')
      localStorage.removeItem('user_data')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// Auth API
export const authAPI = {
  login: async (email: string, password: string) => {
    const response = await api.post('/api/auth/login', { email, password })
    return response.data
  },
  register: async (email: string, password: string, name?: string) => {
    const response = await api.post('/api/auth/register', { email, password, name })
    return response.data
  },
  userLogin: async (email: string, password: string) => {
    const response = await api.post('/api/auth/login', { email, password })
    const loginData = response.data
    // Fetch user details
    const userResponse = await api.get('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${loginData.access_token}` }
    })
    return { ...loginData, user: userResponse.data }
  },
}

// Donations API
export const donationsAPI = {
  create: async (donation: Omit<Donation, 'id' | 'donated_at'>) => {
    const response = await api.post('/api/donations/', donation)
    return response.data
  },
  
  getAll: async () => {
    const response = await api.get('/api/donations/')
    return response.data
  },
  
  getStats: async (): Promise<DonationStats> => {
    const response = await api.get('/api/donations/stats')
    return response.data
  },
  
  calculateZakat: async (calculation: ZakatCalculation): Promise<ZakatResult> => {
    const response = await api.post('/api/donations/calculate-zakat', calculation)
    return response.data
  },
  
  createPaymentSession: async (payment: {
    amount: number
    name: string
    email: string
    purpose?: string
    frequency?: string
  }): Promise<PaymentSession> => {
    const response = await api.post('/api/donations/create-payment-session', payment)
    return response.data
  },
  
  createSubscription: async (subscription: {
    amount: number
    name: string
    email: string
    purpose?: string
    interval: 'month' | 'year'
    payment_day: number
    payment_month?: number
  }): Promise<{ id: string }> => {
    const response = await api.post('/api/donations/create-subscription', subscription)
    return response.data
  },
  
  cancelSubscription: async (subscriptionId: string) => {
    const response = await api.post('/api/donations/cancel-subscription', { subscription_id: subscriptionId })
    return response.data
  },
  
  getSubscriptions: async () => {
    const response = await api.get('/api/donations/subscriptions')
    return response.data
  },
  
  syncStripeData: async () => {
    const response = await api.post('/api/donations/sync-stripe-data')
    return response.data
  },
  
  updateSubscriptionStatus: async () => {
    const response = await api.post('/api/donations/update-subscription-status')
    return response.data
  },
}

// Contact API
export const contactAPI = {
  create: async (contact: Omit<ContactSubmission, 'id' | 'submitted_at' | 'resolved'>) => {
    const response = await api.post('/api/contact/', contact)
    return response.data
  },
  
  getAll: async (resolved?: boolean) => {
    const params = resolved !== undefined ? { resolved } : {}
    const response = await api.get('/api/contact/', { params })
    return response.data
  },
  
  resolve: async (id: number) => {
    const response = await api.patch(`/api/contact/${id}/resolve`)
    return response.data
  },
  
  reply: async (id: number, replyMessage: string) => {
    const response = await api.post(`/api/contact/${id}/reply`, {
      reply_message: replyMessage
    })
    return response.data
  },
  
  delete: async (id: number) => {
    const response = await api.delete(`/api/contact/${id}`)
    return response.data
  },
}

// Gallery API
export const galleryAPI = {
  getAll: async (activeOnly: boolean = true) => {
    const response = await api.get(`/api/gallery/?active_only=${activeOnly}`)
    return response.data
  },
  
  get: async (id: number) => {
    const response = await api.get(`/api/gallery/${id}`)
    return response.data
  },
  
  create: async (item: { media_filename: string; display_order?: number; is_active?: boolean }) => {
    const formData = new FormData()
    formData.append('media_filename', item.media_filename)
    if (item.display_order !== undefined) formData.append('display_order', item.display_order.toString())
    if (item.is_active !== undefined) formData.append('is_active', item.is_active.toString())
    const response = await api.post('/api/gallery/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  },
  
  upload: async (params: { file: File; display_order?: number; is_active?: boolean }) => {
    const formData = new FormData()
    formData.append('file', params.file)
    if (params.display_order !== undefined) formData.append('display_order', params.display_order.toString())
    if (params.is_active !== undefined) formData.append('is_active', params.is_active.toString())
    const response = await api.post('/api/gallery/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  },
  
  update: async (id: number, item: { media_filename?: string; display_order?: number; is_active?: boolean }) => {
    const response = await api.put(`/api/gallery/${id}`, item)
    return response.data
  },
  
  delete: async (id: number) => {
    const response = await api.delete(`/api/gallery/${id}`)
    return response.data
  },
  
  reorder: async (itemOrders: Array<{id: number; display_order: number}>) => {
    const response = await api.post('/api/gallery/reorder', itemOrders)
    return response.data
  },
}

// Media API
export const mediaAPI = {
  uploadVideo: async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await api.post('/api/media/upload-video', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  },
  
  listVideos: async () => {
    const response = await api.get('/api/media/videos')
    return response.data
  },
  
  deleteVideo: async (filename: string) => {
    const response = await api.delete(`/api/media/videos/${filename}`)
    return response.data
  },
  
  getVideoInfo: async (filename: string) => {
    const response = await api.get(`/api/media/videos/${filename}/info`)
    return response.data
  },
}

// Events API
export const eventsAPI = {
  getAll: async (upcomingOnly?: boolean) => {
    const params = upcomingOnly ? { upcoming_only: true } : {}
    const response = await api.get('/api/events/', { params })
    return response.data
  },
  
  getById: async (id: number): Promise<Event> => {
    const response = await api.get(`/api/events/${id}`)
    return response.data
  },
  
  create: async (eventData: any) => {
    // Backend expects multipart/form-data, not JSON
    const formData = new FormData()
    formData.append('title', eventData.title)
    formData.append('description', eventData.description)
    formData.append('date', eventData.date)
    formData.append('location', eventData.location)
    
    // Handle image - if it's a File, send as file upload, otherwise send as image_url
    if (eventData.image instanceof File) {
      formData.append('image', eventData.image)
    } else if (eventData.image && typeof eventData.image === 'string') {
      // Send as image_url parameter
      formData.append('image_url', eventData.image)
    }
    
    const response = await api.post('/api/events/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  },
  
  update: async (id: number, eventData: any) => {
    // Backend expects multipart/form-data, not JSON
    const formData = new FormData()
    formData.append('title', eventData.title)
    formData.append('description', eventData.description)
    formData.append('date', eventData.date)
    formData.append('location', eventData.location)
    
    // Handle image - if it's a File, send as file upload, otherwise send as image_url
    if (eventData.image instanceof File) {
      formData.append('image', eventData.image)
    } else if (eventData.image !== undefined) {
      // Send as image_url parameter (can be empty string to clear)
      formData.append('image_url', eventData.image || '')
    }
    
    const response = await api.put(`/api/events/${id}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  },
  
  delete: async (id: number) => {
    const response = await api.delete(`/api/events/${id}`)
    return response.data
  },
}

// Stories API
export const storiesAPI = {
  getAll: async (activeOnly = true, featuredOnly = false) => {
    const params = { active_only: activeOnly, featured_only: featuredOnly }
    const response = await api.get('/api/stories/', { params })
    return response.data
  },
  
  getById: async (id: number): Promise<Story> => {
    const response = await api.get(`/api/stories/${id}`)
    return response.data
  },
  
  create: async (storyData: FormData | any) => {
    // Backend expects multipart/form-data
    const formData = storyData instanceof FormData 
      ? storyData 
      : (() => {
          const fd = new FormData()
          fd.append('title', storyData.title)
          fd.append('summary', storyData.summary)
          fd.append('content', storyData.content)
          fd.append('is_active', (storyData.is_active ?? true).toString())
          fd.append('is_featured', (storyData.is_featured ?? false).toString())
          if (storyData.image_filename) {
            fd.append('image_filename', storyData.image_filename)
          }
          if (storyData.video instanceof File) {
            fd.append('video', storyData.video)
          }
          return fd
        })()
    
    const response = await api.post('/api/stories/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  },
  
  update: async (id: number, storyData: FormData | any) => {
    // Backend expects multipart/form-data
    const formData = storyData instanceof FormData 
      ? storyData 
      : (() => {
          const fd = new FormData()
          fd.append('title', storyData.title)
          fd.append('summary', storyData.summary)
          fd.append('content', storyData.content)
          fd.append('is_active', (storyData.is_active ?? true).toString())
          fd.append('is_featured', (storyData.is_featured ?? false).toString())
          if (storyData.image_filename !== undefined) {
            fd.append('image_filename', storyData.image_filename || '')
          }
          if (storyData.video instanceof File) {
            fd.append('video', storyData.video)
          }
          if (storyData.remove_video) {
            fd.append('remove_video', 'true')
          }
          return fd
        })()
    
    const response = await api.put(`/api/stories/${id}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  },
  
  delete: async (id: number) => {
    const response = await api.delete(`/api/stories/${id}`)
    return response.data
  },
}

// Testimonials API
export const testimonialsAPI = {
  getAll: async (approvedOnly = true) => {
    const params = { approved_only: approvedOnly }
    const response = await api.get('/api/testimonials/', { params })
    return response.data
  },
  
  create: async (testimonialData: any) => {
    // Backend expects multipart/form-data
    const formData = testimonialData instanceof FormData 
      ? testimonialData 
      : (() => {
          const fd = new FormData()
          fd.append('name', testimonialData.name)
          fd.append('country', testimonialData.country || '')
          fd.append('text', testimonialData.text)
          fd.append('rating', (testimonialData.rating || 5).toString())
          fd.append('category', testimonialData.category || 'donor')
          fd.append('is_approved', (testimonialData.is_approved || false).toString())
          if (testimonialData.image_url) {
            fd.append('image_url', testimonialData.image_url)
          }
          if (testimonialData.video instanceof File) {
            fd.append('video', testimonialData.video)
          }
          return fd
        })()
    
    const response = await api.post('/api/testimonials/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  },
  
  update: async (id: number, testimonialData: any) => {
    // Backend expects multipart/form-data
    const formData = testimonialData instanceof FormData 
      ? testimonialData 
      : (() => {
          const fd = new FormData()
          fd.append('name', testimonialData.name)
          fd.append('country', testimonialData.country || '')
          fd.append('text', testimonialData.text)
          fd.append('rating', (testimonialData.rating || 5).toString())
          fd.append('category', testimonialData.category || 'donor')
          fd.append('is_approved', (testimonialData.is_approved || false).toString())
          if (testimonialData.image_url !== undefined) {
            fd.append('image_url', testimonialData.image_url || '')
          }
          if (testimonialData.video instanceof File) {
            fd.append('video', testimonialData.video)
          }
          if (testimonialData.remove_video) {
            fd.append('remove_video', 'true')
          }
          return fd
        })()
    
    const response = await api.put(`/api/testimonials/${id}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  },
  
  approve: async (id: number) => {
    const response = await api.patch(`/api/testimonials/${id}/approve`)
    return response.data
  },
  
  delete: async (id: number) => {
    const response = await api.delete(`/api/testimonials/${id}`)
    return response.data
  },
}

// Volunteers API
export const volunteersAPI = {
  create: async (volunteer: Omit<Volunteer, 'id' | 'submitted_at'>) => {
    const response = await api.post('/api/volunteers/', volunteer)
    return response.data
  },
  
  getAll: async () => {
    const response = await api.get('/api/volunteers/')
    return response.data
  },
  
  delete: async (id: number) => {
    const response = await api.delete(`/api/volunteers/${id}`)
    return response.data
  },
}

// Subscriptions API
export const subscriptionsAPI = {
  create: async (subscription: Omit<Subscription, 'id' | 'subscribed_at'>) => {
    const response = await api.post('/api/subscriptions/', subscription)
    return response.data
  },
  
  getAll: async () => {
    const response = await api.get('/api/subscriptions/')
    return response.data
  },
  
  delete: async (id: number) => {
    const response = await api.delete(`/api/subscriptions/${id}`)
    return response.data
  },
  
  sendNewsletter: async (newsletter: { subject: string; body: string }) => {
    const response = await api.post('/api/subscriptions/send-newsletter', newsletter)
    return response.data
  },
}

// Admin API
export const adminAPI = {
  uploadMedia: async (file: File, type: string) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('type', type)
    const response = await api.post('/api/admin/upload-media', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  },
  getDashboardStats: async (): Promise<DashboardStats> => {
    const response = await api.get('/api/admin/dashboard')
    return response.data
  },
  getAllUsers: async () => {
    const response = await api.get('/api/admin/users')
    return response.data
  },
  getUserDetails: async (userId: number) => {
    const response = await api.get(`/api/admin/users/${userId}`)
    return response.data
  },
  toggleUserActive: async (userId: number) => {
    const response = await api.patch(`/api/admin/users/${userId}/toggle-active`)
    return response.data
  },
  toggleUserAdmin: async (userId: number) => {
    const response = await api.patch(`/api/admin/users/${userId}/toggle-admin`)
    return response.data
  },
  deleteUser: async (userId: number) => {
    const response = await api.delete(`/api/admin/users/${userId}`)
    return response.data
  },
}

// User API
export const userAPI = {
  getDashboardStats: async () => {
    const response = await api.get('/api/user/dashboard-stats')
    return response.data
  },
  getDonations: async () => {
    const response = await api.get('/api/user/donations')
    return response.data
  },
  getActiveSubscriptions: async () => {
    const response = await api.get('/api/user/subscriptions')
    return response.data
  },
  getAllSubscriptions: async () => {
    const response = await api.get('/api/user/all-subscriptions')
    return response.data
  },
  cancelSubscription: async (subscriptionId: string) => {
    const response = await api.post(`/api/user/cancel-subscription/${subscriptionId}`)
    return response.data
  },
}

// Settings API
export const settingsAPI = {
  getAll: async () => {
    const response = await api.get('/api/settings/')
    return response.data
  },
  
  get: async (key: string) => {
    const response = await api.get(`/api/settings/${key}`)
    return response.data
  },
  
  create: async (setting: { key: string; value: string; description?: string }) => {
    const response = await api.post('/api/settings/', setting)
    return response.data
  },
  
  update: async (key: string, setting: { value: string; description?: string }) => {
    const response = await api.put(`/api/settings/${key}`, setting)
    return response.data
  },
  
  delete: async (key: string) => {
    const response = await api.delete(`/api/settings/${key}`)
    return response.data
  },
}

// Slideshow API
export const slideshowAPI = {
  getAll: async (activeOnly: boolean = false) => {
    const response = await api.get(`/api/slideshow/?active_only=${activeOnly}`)
    return response.data
  },
  
  get: async (id: number) => {
    const response = await api.get(`/api/slideshow/${id}`)
    return response.data
  },
  
  create: async (slide: {
    title: string
    description?: string
    image_filename?: string
    image_url?: string
    cta_text?: string
    cta_url?: string
    display_order?: number
    is_active?: boolean
  }) => {
    const response = await api.post('/api/slideshow/', slide)
    return response.data
  },
  
  update: async (id: number, slide: {
    title?: string
    description?: string
    image_filename?: string
    image_url?: string
    cta_text?: string
    cta_url?: string
    display_order?: number
    is_active?: boolean
  }) => {
    const response = await api.put(`/api/slideshow/${id}`, slide)
    return response.data
  },
  
  delete: async (id: number) => {
    const response = await api.delete(`/api/slideshow/${id}`)
    return response.data
  },
  
  uploadImage: async (id: number, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await api.post(`/api/slideshow/${id}/upload-image`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  },
}

// Urgent Needs API
export const urgentNeedsAPI = {
  getAll: async (activeOnly: boolean = false) => {
    const response = await api.get(`/api/urgent-needs/?active_only=${activeOnly}`)
    return response.data
  },
  
  getBySlug: async (slug: string) => {
    const response = await api.get(`/api/urgent-needs/${slug}`)
    return response.data
  },
  
  getById: async (id: number) => {
    const response = await api.get(`/api/urgent-needs/id/${id}`)
    return response.data
  },
  
  create: async (need: {
    title: string
    slug?: string
    short_description?: string
    html_content?: string
    css_content?: string
    js_content?: string
    image_url?: string
    display_order?: number
    is_active?: boolean
  }) => {
    const response = await api.post('/api/urgent-needs/', need)
    return response.data
  },
  
  update: async (id: number, need: {
    title?: string
    slug?: string
    short_description?: string
    html_content?: string
    css_content?: string
    js_content?: string
    image_url?: string
    display_order?: number
    is_active?: boolean
  }) => {
    const response = await api.put(`/api/urgent-needs/${id}`, need)
    return response.data
  },
  
  delete: async (id: number) => {
    const response = await api.delete(`/api/urgent-needs/${id}`)
    return response.data
  },
}

export default api
