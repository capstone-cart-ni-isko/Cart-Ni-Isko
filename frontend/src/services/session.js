/**
 * One shared storage slot for the last signed-in account.
 *
 * Both the customer context and the staff context write to it, tagged with a
 * `kind`, so the most recent login survives reloads and code updates while
 * the other role's sign-in is simply replaced (last login wins).
 */

const KEY = 'isko_session'

/** Persist a session: `{ kind: 'customer'|'staff', token, user }`. */
export function saveSession(kind, token, user) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ kind, token, user }))
  } catch {
    /* storage unavailable - the session then only lives in memory */
  }
}

/** Restore a session only when it was written by the same `kind`. */
export function loadSession(kind) {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY))
    return saved && saved.kind === kind && saved.token && saved.user ? saved : null
  } catch {
    return null
  }
}

/** Drop the slot - only when it belongs to `kind`, so logging out one role
 *  never wipes the other's session. */
export function clearSession(kind) {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY))
    if (!saved || saved.kind === kind) localStorage.removeItem(KEY)
  } catch {
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* ignore */
    }
  }
}
