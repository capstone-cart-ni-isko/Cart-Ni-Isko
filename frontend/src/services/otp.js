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

/**
 * DOMAIN 17 / DOMAIN 18 - the pre-session challenge.
 *
 * A signup (FLOW-CUST_SIGNUP-05) and a stale login (FLOW-CUST_LOGIN-02) are
 * answered with a signed `challenge` instead of a token: the caller owns no
 * session yet, so that blob is what ties the six-digit code to its account.
 * All three calls are POST-only, so the signed state never lands in a URL.
 */

/** POST /otp/challenge/start - issue a fresh code for the challenge. */
export async function startOtpChallenge(challenge, purpose) {
  try {
    const data = await apiPost('/otp/challenge/start', { challenge, purpose })
    return { data: data.data || {}, error: null }
  } catch (err) {
    return { data: null, error: err.message || 'Unable to send a verification code' }
  }
}

/**
 * POST /otp/challenge/verify - clear the code. The answer carries the full
 * account plus its bearer token: this is the call that finalizes a signup
 * and opens the session.
 */
export async function redeemOtpChallenge(challenge, purpose, code) {
  try {
    const data = await apiPost('/otp/challenge/verify', { challenge, purpose, code })
    return { data: data.data || {}, error: null }
  } catch (err) {
    return { data: null, error: err.message || 'That code is not correct' }
  }
}

/**
 * POST /otp/challenge/inbox - read the code back out of the account's own
 * notification inbox (REQ-CUST_SIGNUP-04 allows in-app delivery, and this
 * screen is shown before any session exists).
 */
export async function readChallengeInbox(challenge, purpose) {
  try {
    const data = await apiPost('/otp/challenge/inbox', { challenge, purpose })
    return { data: data.data || {}, error: null }
  } catch (err) {
    return { data: null, error: err.message || 'Unable to read your notifications' }
  }
}
