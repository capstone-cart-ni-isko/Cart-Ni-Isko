/**
 * The signed-in account, held in memory only.
 *
 * REQ-ALR-01: login is required every time after a logout, a refresh, a
 * browser reopen, or a device restart. Nothing is written to localStorage or
 * sessionStorage, so a reload always starts from the signed-out state.
 *
 * Within one open tab the slot lives in a module variable, which is enough for
 * the token to survive client-side navigation. Both the customer context and
 * the staff context write to it, tagged with a `kind`, so signing in as one
 * role never disturbs the other (last login wins).
 */

let session = null

/** Persist a session for this tab: `{ kind: 'customer'|'staff', token, user }`. */
export function saveSession(kind, token, user) {
  session = { kind, token, user }
}

/** Restore a session only when it was written by the same `kind`. */
export function loadSession(kind) {
  return session && session.kind === kind && session.token && session.user ? session : null
}

/**
 * Drop the slot. Passing a `kind` only drops it when it belongs to that role,
 * so signing out one role never wipes the other. Passing nothing drops it
 * either way, which is what an expired token needs.
 */
export function clearSession(kind) {
  if (!kind || !session || session.kind === kind) session = null
}

/*
 * The one exception to REQ-ALR-01: PayMongo's hosted checkout is a full page
 * redirect, so the in-memory session would be lost on the way back. Just
 * before leaving, the session is parked in this tab's sessionStorage; on the
 * return it is read once, deleted immediately, and dropped if stale. Any other
 * reload still starts signed out.
 */
const REDIRECT_KEY = 'cartniisko:paymongo_session'
const REDIRECT_TTL_MS = 30 * 60 * 1000

export function stashSessionForRedirect() {
  if (!session) return
  try {
    sessionStorage.setItem(REDIRECT_KEY, JSON.stringify({ ...session, at: Date.now() }))
  } catch {
    // Blocked storage: the customer simply signs in again on return.
  }
}

export function restoreRedirectSession() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(REDIRECT_KEY) || 'null')
    sessionStorage.removeItem(REDIRECT_KEY)
    if (saved?.token && saved?.user && Date.now() - (saved.at || 0) < REDIRECT_TTL_MS) {
      saveSession(saved.kind, saved.token, saved.user)
    }
  } catch {
    // Unreadable or blocked storage: fall back to the signed-out state.
  }
}
