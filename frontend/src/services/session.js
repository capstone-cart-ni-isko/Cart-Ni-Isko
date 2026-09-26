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
