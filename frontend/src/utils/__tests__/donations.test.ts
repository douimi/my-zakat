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
      ...mockAxiosInstance,
    },
  }
})

import axios from 'axios'
import { donationsAPI } from '../api'

const mockedAxios = vi.mocked(axios)
const mockAxiosInstance = mockedAxios.create() as any

describe('Donations API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createPaymentSession', () => {
    it('sends correct payment data to the API', async () => {
      const mockResponse = { data: { id: 'cs_test_123', url: 'https://checkout.stripe.com/pay/cs_test_123' } }
      mockAxiosInstance.post.mockResolvedValueOnce(mockResponse)

      const paymentData = {
        amount: 100,
        name: 'John Doe',
        email: 'john@example.com',
        purpose: 'Zakat',
        frequency: 'One-Time',
      }

      await donationsAPI.createPaymentSession(paymentData)

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/api/donations/create-payment-session',
        paymentData,
      )
    })

    it('returns session id on success', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: { id: 'cs_test_abc', url: 'https://checkout.stripe.com/pay/cs_test_abc' },
      })

      const result = await donationsAPI.createPaymentSession({
        amount: 50,
        name: 'Jane',
        email: 'jane@example.com',
        purpose: 'General',
        frequency: 'One-Time',
      })

      expect(result).toEqual({ id: 'cs_test_abc', url: 'https://checkout.stripe.com/pay/cs_test_abc' })
    })

    it('propagates API errors', async () => {
      mockAxiosInstance.post.mockRejectedValueOnce(new Error('Network Error'))

      await expect(
        donationsAPI.createPaymentSession({
          amount: 100,
          name: 'Test',
          email: 'test@example.com',
          purpose: 'Zakat',
          frequency: 'One-Time',
        }),
      ).rejects.toThrow('Network Error')
    })
  })

  describe('createSubscription', () => {
    it('sends correct subscription data', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: { id: 'cs_test_sub_123' },
      })

      const subData = {
        name: 'Monthly Donor',
        email: 'monthly@example.com',
        amount: 50,
        purpose: 'General Donation',
        interval: 'month',
        payment_day: 15,
      }

      await donationsAPI.createSubscription(subData)

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/api/donations/create-subscription',
        subData,
      )
    })
  })

  describe('calculateZakat', () => {
    it('sends calculation data and returns result', async () => {
      const mockResult = {
        data: { wealth: 250, gold: 175, silver: 10, business_goods: 75, agriculture: 100, total: 610 },
      }
      mockAxiosInstance.post.mockResolvedValueOnce(mockResult)

      const calcData = {
        cash: 10000,
        gold_weight: 100,
        gold_price_per_gram: 70,
        silver_weight: 500,
        silver_price_per_gram: 0.8,
        business_goods: 3000,
        agriculture_value: 2000,
        liabilities: 1000,
      }

      const result = await donationsAPI.calculateZakat(calcData)

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/api/donations/calculate-zakat',
        calcData,
      )
      expect(result.total).toBe(610)
    })
  })

  describe('getStats', () => {
    it('fetches donation statistics', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          total_donations: 50000,
          total_donors: 200,
          recent_donations: [],
          impact: { meals: 25000, families: 1200, orphans: 500 },
        },
      })

      const stats = await donationsAPI.getStats()

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/donations/stats')
      expect(stats.total_donations).toBe(50000)
      expect(stats.impact.meals).toBe(25000)
    })
  })

  describe('cancelSubscription', () => {
    it('sends cancellation request with subscription id', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: { status: 'success', message: 'Subscription canceled' },
      })

      await donationsAPI.cancelSubscription('sub_test_123')

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/api/donations/cancel-subscription',
        { subscription_id: 'sub_test_123' },
      )
    })
  })
})
