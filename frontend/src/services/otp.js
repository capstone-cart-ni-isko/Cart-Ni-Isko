import { apiPost } from './api.js'

/**
 * DOMAIN 29 / REQ-CUST_SET-02 - phone OTP for sensitive settings changes.
 *
 * The code is hashed on the server and delivered through the account's own
 * notification inbox (no table was added for it), so `issue` only reports
 * where to look; `verify` marks the purpose verified for a short window and
 * the change itself is sent with that verification.
 *
 * purpose - 'password_change' | 'backup_contacts'
 */

/** POST /otp/issue - generate and deliver a fresh 6-digit code. */
export async function issueOtp(purpose) {
  try {
    const data = await apiPost('/otp/issue', { purpose })
    return { data: data.data || {}, error: null }
  } catch (err) {
    return { data: null, error: err.message || 'Unable to send a verification code' }
  }
}

/** POST /otp/verify - check the code the customer typed. */
export async function verifyOtp(purpose, code) {
  try {
    const data = await apiPost('/otp/verify', { purpose, code })
    return { data: data.data || {}, error: null }
  } catch (err) {
    return { data: null, error: err.message || 'That code is not correct' }
  }
}
