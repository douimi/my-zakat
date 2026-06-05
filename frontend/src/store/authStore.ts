import { create } from 'zustand'

export type Role = 'admin' | 'manager' | 'user'

export interface User {
  id: number
  email: string
  name?: string
  is_active: boolean
  is_admin: boolean
  role?: Role
  created_at: string
}

function deriveRole(user: User | null): Role {
  if (!user) return 'user'
  if (user.role === 'admin' || user.role === 'manager' || user.role === 'user') return user.role
  return user.is_admin ? 'admin' : 'user'
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isAdmin: boolean
  isManager: boolean
  isStaff: boolean // admin OR manager — anyone who can access /admin/*
  role: Role
  login: (user: User, token: string) => void
  logout: () => void
  initFromStorage: () => void
}

function buildAuthState(user: User | null) {
  const role = deriveRole(user)
  return {
    isAdmin: role === 'admin',
    isManager: role === 'manager',
    isStaff: role === 'admin' || role === 'manager',
    role,
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isAdmin: false,
  isManager: false,
  isStaff: false,
  role: 'user',

  login: (user, token) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token)
      localStorage.setItem('user_data', JSON.stringify(user))
    }
    set({
      user,
      token,
      isAuthenticated: true,
      ...buildAuthState(user),
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
      isAdmin: false,
      isManager: false,
      isStaff: false,
      role: 'user',
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
            ...buildAuthState(user),
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
