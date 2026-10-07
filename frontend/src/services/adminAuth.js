import { apiPost, ApiError, setApiToken } from './api.js'
import { mapEmployee } from './auth.js'

/**
 * Login an admin/employee via the backend.
 * Returns { success, user } on success or { success, error } on failure.
 *
 * POST /auth/emp_login answers `{ success, message, data: { ...employee, token } }`.
 * The Sanctum bearer is installed in the STAFF slot of services/api.js, so
 * it is only ever sent by /admin/* requests and a customer session in the
 * same browser is left untouched (system rule 71).
 */
export async function adminLogin(email, password) {
  try {
    const data = await apiPost('/auth/emp_login', { email, password })
    const token = data?.token || data?.data?.token || null
    setApiToken(token, 'staff')

    const user = mapEmployee(data?.data)
    if (!user) {
      return { success: false, error: 'Invalid staff credentials. Access denied.' }
    }
    return { success: true, user, token }
  } catch (err) {
    if (err instanceof ApiError) {
      // DOMAIN 2 (FLOW-EMP_LOGIN-02..08): the backend's own vocabulary and
      // machine code travel with the error so the form can put the message
      // under the right field instead of inventing one.
      return {
        success: false,
        error: err.message || 'Invalid staff credentials. Access denied.',
        code: err.payload?.code || null,
        status: err.status,
      }
    }
    return { success: false, error: err?.message || 'Login failed' }
  }
}

export function adminLogout() {
  return apiPost('/auth/logout', {})
}
