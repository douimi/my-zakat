import { create } from 'zustand'
import type { Admin } from '../types'

interface AuthState {
  admin: Admin | null
  token: string | null
  isAuthenticated: boolean
  login: (admin: Admin, token: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  admin: null,
  token: null,
  isAuthenticated: false,
  login: (admin, token) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('admin_token', token)
    }
    set({ admin, token, isAuthenticated: true })
  },
  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('admin_token')
    }
    set({ admin: null, token: null, isAuthenticated: false })
  },
}))
