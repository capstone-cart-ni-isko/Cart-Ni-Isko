import { apiPost, ApiError } from './api.js'
import { mapEmployee } from './auth.js'

/**
 * Login an admin/employee via the backend.
 * Returns { success, user } on success or { success, error } on failure.
 */
export async function adminLogin(email, password) {
  try {
    const data = await apiPost('/auth/emp_login', { email, password })
    const user = mapEmployee(data?.data)
    if (!user) {
      return { success: false, error: 'Invalid staff credentials. Access denied.' }
    }
    return { success: true, user }
  } catch (err) {
    if (err instanceof ApiError) {
      return { success: false, error: err.message || 'Invalid staff credentials. Access denied.' }
    }
    return { success: false, error: err?.message || 'Login failed' }
  }
}