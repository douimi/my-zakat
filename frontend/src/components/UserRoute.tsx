import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { ReactNode } from 'react'

interface UserRouteProps {
  children: ReactNode
}

const UserRoute = ({ children }: UserRouteProps) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

export default UserRoute

