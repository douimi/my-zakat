import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock axios BEFORE importing the API module
vi.mock('axios', () => {
  const mockAxiosInstance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn((fn) => fn) },
      response: { use: vi.fn((fn) => fn) },
    },
  }
  
  return {
    default: {
      create: vi.fn(() => mockAxiosInstance),
      ...mockAxiosInstance
    }
  }
})

import axios from 'axios'
import { donationsAPI, contactAPI, authAPI } from '../api'

const mockedAxios = vi.mocked(axios)

// Get the mocked axios instance that was created in the vi.mock call
const mockAxiosInstance = mockedAxios.create() as any

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
})

describe('API Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('API Instance Setup', () => {
    it('has axios instance configured', () => {
      // Verify that the API module is properly loaded with mocked axios
      expect(mockAxiosInstance).toBeDefined()
      expect(mockAxiosInstance.get).toBeDefined()
      expect(mockAxiosInstance.post).toBeDefined()
    })
  })

  describe('Auth API', () => {
    it('logs in user with credentials', async () => {
      const mockResponse = { data: { token: 'mock-token', user: { id: 1 } } }
      mockAxiosInstance.post.mockResolvedValue(mockResponse)

      const result = await authAPI.login('admin', 'password')

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/api/auth/login', {
        email: 'admin',
        password: 'password',
      })
      expect(result).toEqual(mockResponse.data)
    })
  })

  describe('Donations API', () => {
    it('creates a new donation', async () => {
      const donationData = {
        amount: 100,
        name: 'John Doe',
        email: 'john@example.com',
        purpose: 'Zakat',
      }
      const mockResponse = { data: { id: 1, ...donationData } }
      mockAxiosInstance.post.mockResolvedValue(mockResponse)

      const result = await donationsAPI.create(donationData)

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/api/donations/', donationData)
      expect(result).toEqual(mockResponse.data)
    })

    it('calculates zakat correctly', async () => {
      const zakatData = {
        gold_grams: 100,
        silver_grams: 0,
        cash: 5000,
        investments: 2000,
        business_assets: 0,
        debts: 500,
      }
      const mockResponse = { 
        data: { 
          total_wealth: 6500,
          nisab_threshold: 4000,
          zakat_due: true,
          zakat_amount: 162.5
        } 
      }
      mockAxiosInstance.post.mockResolvedValue(mockResponse)

      const result = await donationsAPI.calculateZakat(zakatData)

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/api/donations/calculate-zakat', zakatData)
      expect(result).toEqual(mockResponse.data)
    })

    it('gets donation statistics', async () => {
      const mockStats = {
        total_amount: 50000,
        total_donations: 150,
        monthly_amount: 5000,
        top_purposes: [{ purpose: 'Zakat', amount: 25000 }]
      }
      const mockResponse = { data: mockStats }
      mockAxiosInstance.get.mockResolvedValue(mockResponse)

      const result = await donationsAPI.getStats()

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/donations/stats')
      expect(result).toEqual(mockStats)
    })

    it('creates payment session', async () => {
      const paymentData = {
        amount: 250,
        name: 'Jane Doe',
        email: 'jane@example.com',
        purpose: 'Emergency Relief',
      }
      const mockResponse = { 
        data: { 
          session_id: 'cs_test_123',
          url: 'https://checkout.stripe.com/pay/cs_test_123'
        } 
      }
      mockAxiosInstance.post.mockResolvedValue(mockResponse)

      const result = await donationsAPI.createPaymentSession(paymentData)

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/api/donations/create-payment-session', paymentData)
      expect(result).toEqual(mockResponse.data)
    })
  })

  describe('Contact API', () => {
    it('creates a contact submission', async () => {
      const contactData = {
        name: 'John Doe',
        email: 'john@example.com',
        subject: 'Question',
        message: 'I have a question about donations',
      }
      const mockResponse = { data: { id: 1, ...contactData } }
      mockAxiosInstance.post.mockResolvedValue(mockResponse)

      const result = await contactAPI.create(contactData)

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/api/contact/', contactData)
      expect(result).toEqual(mockResponse.data)
    })

    it('gets all contact submissions', async () => {
      const mockContacts = [
        { id: 1, name: 'John', email: 'john@example.com', resolved: false },
        { id: 2, name: 'Jane', email: 'jane@example.com', resolved: true },
      ]
      const mockResponse = { data: mockContacts }
      mockAxiosInstance.get.mockResolvedValue(mockResponse)

      const result = await contactAPI.getAll()

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/contact/', { params: {} })
      expect(result).toEqual(mockContacts)
    })

    it('gets filtered contact submissions', async () => {
      const mockContacts = [
        { id: 1, name: 'John', email: 'john@example.com', resolved: false },
      ]
      const mockResponse = { data: mockContacts }
      mockAxiosInstance.get.mockResolvedValue(mockResponse)

      const result = await contactAPI.getAll(false)

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/contact/', { 
        params: { resolved: false } 
      })
      expect(result).toEqual(mockContacts)
    })

    it('resolves a contact submission', async () => {
      const mockResponse = { data: { id: 1, resolved: true } }
      mockAxiosInstance.patch.mockResolvedValue(mockResponse)

      const result = await contactAPI.resolve(1)

      expect(mockAxiosInstance.patch).toHaveBeenCalledWith('/api/contact/1/resolve')
      expect(result).toEqual(mockResponse.data)
    })

    it('deletes a contact submission', async () => {
      const mockResponse = { data: { message: 'Contact deleted' } }
      mockAxiosInstance.delete.mockResolvedValue(mockResponse)

      const result = await contactAPI.delete(1)

      expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/api/contact/1')
      expect(result).toEqual(mockResponse.data)
    })
  })

  describe('Error Handling', () => {
    it('handles API errors gracefully', async () => {
      const error = new Error('Network Error')
      mockAxiosInstance.get.mockRejectedValue(error)

      await expect(donationsAPI.getAll()).rejects.toThrow('Network Error')
    })
  })
})

