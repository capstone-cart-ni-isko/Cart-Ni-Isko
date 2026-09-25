import { apiPost, ApiError, setApiToken } from './api.js'
import { mapEmployee } from './auth.js'

/**
 * Login an admin/employee via the backend.
 * Returns { success, user } on success or { success, error } on failure.
 *
 * POST /auth/emp_login answers `{ success, message, data: { ...employee, token } }`.
 * The Sanctum bearer token is persisted with the shared `isko_session` slot
 * (services/session.js), so the staff session survives reloads and updates.
 */
export async function adminLogin(email, password) {
  try {
    const data = await apiPost('/auth/emp_login', { email, password })
    const token = data?.token || data?.data?.token || null
    setApiToken(token)

    const user = mapEmployee(data?.data)
    if (!user) {
      return { success: false, error: 'Invalid staff credentials. Access denied.' }
    }
    return { success: true, user, token }
  } catch (err) {
    if (err instanceof ApiError) {
      return { success: false, error: err.message || 'Invalid staff credentials. Access denied.' }
    }
    return { success: false, error: err?.message || 'Login failed' }
  }
}

export function adminLogout() {
  return apiPost('/auth/logout', {})
}
