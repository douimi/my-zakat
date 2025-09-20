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

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Auth API
export const authAPI = {
  login: async (username: string, password: string) => {
    const response = await api.post('/api/auth/login', { username, password })
    return response.data
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
  
  delete: async (id: number) => {
    const response = await api.delete(`/api/contact/${id}`)
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
    const response = await api.post('/api/events/', eventData)
    return response.data
  },
  
  update: async (id: number, eventData: any) => {
    const response = await api.put(`/api/events/${id}`, eventData)
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
  
  create: async (storyData: any) => {
    const response = await api.post('/api/stories/', storyData)
    return response.data
  },
  
  update: async (id: number, storyData: any) => {
    const response = await api.put(`/api/stories/${id}`, storyData)
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
    const response = await api.post('/api/testimonials/', testimonialData)
    return response.data
  },
  
  update: async (id: number, testimonialData: any) => {
    const response = await api.put(`/api/testimonials/${id}`, testimonialData)
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
  getDashboardStats: async (): Promise<DashboardStats> => {
    const response = await api.get('/api/admin/dashboard')
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

export default api
