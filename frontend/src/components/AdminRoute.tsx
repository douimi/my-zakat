import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { ReactNode } from 'react'

interface AdminRouteProps {
  children: ReactNode
}

const AdminRoute = ({ children }: AdminRouteProps) => {
  const { isAuthenticated, isStaff } = useAuthStore()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // Both admins and managers can access /admin/*; route-level gating in the
  // layout / individual pages enforces per-section permissions.
  if (!isStaff) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

export default AdminRoute
