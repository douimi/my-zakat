import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { ReactNode } from 'react'

interface AdminRouteProps {
  children: ReactNode
}

const AdminRoute = ({ children }: AdminRouteProps) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  return isAuthenticated ? <>{children}</> : <Navigate to="/admin/login" replace />
}

export default AdminRoute
