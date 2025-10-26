import { create } from 'zustand'

export interface User {
  id: number
  email: string
  name?: string
  is_active: boolean
  is_admin: boolean
  created_at: string
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isAdmin: boolean
  login: (user: User, token: string) => void
  logout: () => void
  initFromStorage: () => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isAdmin: false,
  
  login: (user, token) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token)
      localStorage.setItem('user_data', JSON.stringify(user))
    }
    set({ 
      user, 
      token,
      isAuthenticated: true,
      isAdmin: user.is_admin 
    })
  },
  
  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('user_data')
    }
    set({ 
      user: null,
      token: null,
      isAuthenticated: false,
      isAdmin: false 
    })
  },
  
  initFromStorage: () => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('auth_token')
      const userData = localStorage.getItem('user_data')
      
      if (token && userData) {
        try {
          const user = JSON.parse(userData)
          set({ 
            user, 
            token,
            isAuthenticated: true,
            isAdmin: user.is_admin 
          })
        } catch (error) {
          console.error('Error parsing user data:', error)
          localStorage.removeItem('auth_token')
          localStorage.removeItem('user_data')
        }
      }
    }
  },
}))
