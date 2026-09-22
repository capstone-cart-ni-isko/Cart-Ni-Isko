import { Navigate, Outlet } from 'react-router-dom'
import { useAdmin } from '../../hooks/useAdmin.js'

/**
 * Guards the admin portal: redirects unauthenticated staff to the
 * Staff & Admin login screen. Authenticated staff pass through.
 */
export default function RequireAdmin() {
  const { currentAdminUser } = useAdmin()

  if (!currentAdminUser) {
    return <Navigate to="/admin/login" replace />
  }

  return <Outlet />
}