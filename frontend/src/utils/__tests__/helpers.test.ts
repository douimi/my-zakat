import { describe, it, expect } from 'vitest'

// Helper functions for testing common utilities
describe('Utility Helpers', () => {
  describe('Currency Formatting', () => {
    it('formats numbers as USD currency', () => {
      const formatCurrency = (amount: number): string => {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD'
        }).format(amount)
      }

      expect(formatCurrency(100)).toBe('$100.00')
      expect(formatCurrency(1234.56)).toBe('$1,234.56')
      expect(formatCurrency(0)).toBe('$0.00')
    })
  })

  describe('Date Formatting', () => {
    it('formats dates correctly', () => {
      const formatDate = (dateString: string): string => {
        return new Date(dateString).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      }

      expect(formatDate('2024-01-15')).toBe('January 15, 2024')
    })
  })

  describe('Email Validation', () => {
    it('validates email addresses', () => {
      const isValidEmail = (email: string): boolean => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        return emailRegex.test(email)
      }

      expect(isValidEmail('test@example.com')).toBe(true)
      expect(isValidEmail('user.name@domain.co.uk')).toBe(true)
      expect(isValidEmail('invalid.email')).toBe(false)
      expect(isValidEmail('missing@domain')).toBe(false)
      expect(isValidEmail('@domain.com')).toBe(false)
    })
  })

  describe('String Truncation', () => {
    it('truncates long strings with ellipsis', () => {
      const truncate = (str: string, maxLength: number): string => {
        if (str.length <= maxLength) return str
        return str.slice(0, maxLength) + '...'
      }

      expect(truncate('Short', 10)).toBe('Short')
      expect(truncate('This is a very long string', 10)).toBe('This is a ...')
      expect(truncate('Exactly ten', 11)).toBe('Exactly ten')
    })
  })

  describe('Percentage Calculation', () => {
    it('calculates percentage correctly', () => {
      const calculatePercentage = (value: number, total: number): number => {
        if (total === 0) return 0
        return Math.round((value / total) * 100)
      }

      expect(calculatePercentage(50, 100)).toBe(50)
      expect(calculatePercentage(25, 100)).toBe(25)
      expect(calculatePercentage(1, 3)).toBe(33)
      expect(calculatePercentage(10, 0)).toBe(0)
    })
  })

  describe('Array Utilities', () => {
    it('removes duplicates from array', () => {
      const removeDuplicates = <T,>(arr: T[]): T[] => {
        return Array.from(new Set(arr))
      }

      expect(removeDuplicates([1, 2, 2, 3, 3, 4])).toEqual([1, 2, 3, 4])
      expect(removeDuplicates(['a', 'b', 'a', 'c'])).toEqual(['a', 'b', 'c'])
      expect(removeDuplicates([])).toEqual([])
    })

    it('chunks array into smaller arrays', () => {
      const chunkArray = <T,>(arr: T[], size: number): T[][] => {
        const chunks: T[][] = []
        for (let i = 0; i < arr.length; i += size) {
          chunks.push(arr.slice(i, i + size))
        }
        return chunks
      }

      expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
      expect(chunkArray([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]])
      expect(chunkArray([1], 3)).toEqual([[1]])
    })
  })

  describe('Object Utilities', () => {
    it('checks if object is empty', () => {
      const isEmpty = (obj: object): boolean => {
        return Object.keys(obj).length === 0
      }

      expect(isEmpty({})).toBe(true)
      expect(isEmpty({ key: 'value' })).toBe(false)
      expect(isEmpty({ a: 1, b: 2 })).toBe(false)
    })

    it('deeply clones objects', () => {
      const deepClone = <T,>(obj: T): T => {
        return JSON.parse(JSON.stringify(obj))
      }

      const original = { a: 1, b: { c: 2 } }
      const cloned = deepClone(original)
      
      cloned.b.c = 3
      
      expect(original.b.c).toBe(2)
      expect(cloned.b.c).toBe(3)
    })
  })

  describe('URL Utilities', () => {
    it('builds query string from object', () => {
      const buildQueryString = (params: Record<string, string | number>): string => {
        const query = Object.entries(params)
          .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
          .join('&')
        return query ? `?${query}` : ''
      }

      expect(buildQueryString({ page: 1, limit: 10 })).toBe('?page=1&limit=10')
      expect(buildQueryString({ q: 'search term' })).toBe('?q=search%20term')
      expect(buildQueryString({})).toBe('')
    })
  })

  describe('Number Utilities', () => {
    it('formats large numbers with K/M suffix', () => {
      const formatLargeNumber = (num: number): string => {
        if (num >= 1000000) {
          return (num / 1000000).toFixed(1) + 'M'
        }
        if (num >= 1000) {
          return (num / 1000).toFixed(1) + 'K'
        }
        return num.toString()
      }

      expect(formatLargeNumber(500)).toBe('500')
      expect(formatLargeNumber(1500)).toBe('1.5K')
      expect(formatLargeNumber(1000000)).toBe('1.0M')
      expect(formatLargeNumber(2500000)).toBe('2.5M')
    })

    it('clamps number between min and max', () => {
      const clamp = (num: number, min: number, max: number): number => {
        return Math.min(Math.max(num, min), max)
      }

      expect(clamp(5, 0, 10)).toBe(5)
      expect(clamp(-5, 0, 10)).toBe(0)
      expect(clamp(15, 0, 10)).toBe(10)
    })
  })
})
