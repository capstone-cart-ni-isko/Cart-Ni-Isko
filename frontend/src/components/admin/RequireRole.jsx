import { Navigate, Outlet } from 'react-router-dom'
import { useAdmin } from '../../hooks/useAdmin.js'

/**
 * Mirrors the backend `role:` middleware for admin screens: staff may only
 * open what the API lets them call, and are bounced to the dashboard otherwise.
 */
export default function RequireRole({ roles }) {
  const { currentAdminUser } = useAdmin()

  if (!currentAdminUser) {
    return <Navigate to="/admin/login" replace />
  }

  if (!roles.includes(currentAdminUser.roleKey)) {
    return <Navigate to="/admin/dashboard" replace />
  }

  return <Outlet />
}
