import { Navigate, Outlet } from 'react-router-dom'
import { useAdmin } from '../../hooks/useAdmin.js'
import { empHomePath } from './schema.js'

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
    // Never fall back to a screen this role is not allowed to open - that
    // would loop for /admin/dashboard itself. Staff go to their own home.
    return <Navigate to={empHomePath(currentAdminUser)} replace />
  }

  return <Outlet />
}
