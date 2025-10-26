import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAuthStore, type User } from '../authStore'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    }
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
})

describe('AuthStore', () => {
  beforeEach(() => {
    // Reset store state
    useAuthStore.setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isAdmin: false
    })
    
    // Clear localStorage
    localStorageMock.clear()
  })

  describe('Initial State', () => {
    it('starts with unauthenticated state', () => {
      const state = useAuthStore.getState()
      
      expect(state.user).toBeNull()
      expect(state.token).toBeNull()
      expect(state.isAuthenticated).toBe(false)
      expect(state.isAdmin).toBe(false)
    })
  })

  describe('Login', () => {
    it('updates state with user and token', () => {
      const mockUser: User = {
        id: 1,
        email: 'testadmin@example.com',
        name: 'Test Admin',
        is_active: true,
        is_admin: true,
        created_at: '2023-01-01T00:00:00Z'
      }
      const mockToken = 'test-token-123'
      
      useAuthStore.getState().login(mockUser, mockToken)
      
      const state = useAuthStore.getState()
      expect(state.user).toEqual(mockUser)
      expect(state.token).toBe(mockToken)
      expect(state.isAuthenticated).toBe(true)
      expect(state.isAdmin).toBe(true)
    })

    it('stores token in localStorage', () => {
      const mockUser: User = {
        id: 1,
        email: 'testadmin@example.com',
        name: 'Test Admin',
        is_active: true,
        is_admin: true,
        created_at: '2023-01-01T00:00:00Z'
      }
      const mockToken = 'test-token-123'
      
      useAuthStore.getState().login(mockUser, mockToken)
      
      expect(localStorage.getItem('auth_token')).toBe(mockToken)
    })

    it('updates isAuthenticated to true', () => {
      const mockUser: User = {
        id: 1,
        email: 'testadmin@example.com',
        name: 'Test Admin',
        is_active: true,
        is_admin: true,
        created_at: '2023-01-01T00:00:00Z'
      }
      
      useAuthStore.getState().login(mockUser, 'token')
      
      expect(useAuthStore.getState().isAuthenticated).toBe(true)
      expect(useAuthStore.getState().isAdmin).toBe(true)
    })
  })

  describe('Logout', () => {
    beforeEach(() => {
      // Set up authenticated state
      const mockUser: User = {
        id: 1,
        email: 'testadmin@example.com',
        name: 'Test Admin',
        is_active: true,
        is_admin: true,
        created_at: '2023-01-01T00:00:00Z'
      }
      useAuthStore.getState().login(mockUser, 'test-token')
    })

    it('clears user and token from state', () => {
      useAuthStore.getState().logout()
      
      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
      expect(state.token).toBeNull()
      expect(state.isAuthenticated).toBe(false)
      expect(state.isAdmin).toBe(false)
    })

    it('removes token from localStorage', () => {
      expect(localStorage.getItem('auth_token')).toBe('test-token')
      
      useAuthStore.getState().logout()
      
      expect(localStorage.getItem('auth_token')).toBeNull()
    })

    it('sets isAuthenticated to false', () => {
      expect(useAuthStore.getState().isAuthenticated).toBe(true)
      
      useAuthStore.getState().logout()
      
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
    })
  })

  describe('State Persistence', () => {
    it('maintains state across multiple operations', () => {
      const user1: User = { 
        id: 1, 
        email: 'admin1@example.com',
        name: 'Admin 1',
        is_active: true,
        is_admin: true,
        created_at: '2023-01-01T00:00:00Z'
      }
      const user2: User = { 
        id: 2, 
        email: 'admin2@example.com',
        name: 'Admin 2',
        is_active: true,
        is_admin: true,
        created_at: '2023-01-01T00:00:00Z'
      }
      
      // Login as user1
      useAuthStore.getState().login(user1, 'token1')
      expect(useAuthStore.getState().user).toEqual(user1)
      
      // Logout
      useAuthStore.getState().logout()
      expect(useAuthStore.getState().user).toBeNull()
      
      // Login as user2
      useAuthStore.getState().login(user2, 'token2')
      expect(useAuthStore.getState().user).toEqual(user2)
      expect(localStorage.getItem('auth_token')).toBe('token2')
    })
  })

  describe('Store Subscription', () => {
    it('notifies subscribers of state changes', () => {
      const subscriber = vi.fn()
      
      // Subscribe to store
      const unsubscribe = useAuthStore.subscribe(subscriber)
      
      // Trigger state change
      useAuthStore.getState().login({ 
        id: 1, 
        email: 'test@example.com',
        name: 'Test User',
        is_active: true,
        is_admin: false,
        created_at: '2023-01-01T00:00:00Z'
      }, 'token')
      
      expect(subscriber).toHaveBeenCalled()
      
      unsubscribe()
    })
  })
})
