/**
 * The signed-in account slot.
 *
 * CUSTOMER (kind: 'customer') - REQ-CUST_LOGIN-01 / FLOW-CUST_LOGIN-01:
 * the session lives in `sessionStorage`, so it survives a reload and every
 * client-side navigation (FLOW-CUST_LOGIN-03: "no longer need to log in when
 * going to other pages and tabs"), but it is thrown away the moment the
 * browser closes - which is exactly where REQ-CUST_LOGIN-01 wants a fresh
 * login. REQ-CUST_LOGOUT-01 says closing the browser must NOT log the
 * customer out, and it does not: nothing is sent to the server, the row keeps
 * its `cust_last_logout`, only this tab's copy of the bearer goes away.
 *
 * STAFF (kind: 'staff') - unchanged: held in memory only, so the admin side
 * keeps its previous behaviour.
 *
 * Both roles write to the same slot tagged with `kind`, so signing in as one
 * role never disturbs the other (last login wins).
 */

const STORAGE_KEY = 'isko_session'

let session = null

/** sessionStorage can be unavailable (private mode, blocked storage). */
function readStored() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeStored(value) {
  try {
    if (value) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // A blocked storage must never break the screen: the in-memory copy below
    // still carries this tab's session.
  }
}

/** Persist a session for this tab: `{ kind: 'customer'|'staff', token, user }`. */
export function saveSession(kind, token, user) {
  session = { kind, token, user }
  if (kind === 'customer') writeStored(session)
}

/** Restore a session only when it was written by the same `kind`. */
export function loadSession(kind) {
  if (!session) session = readStored()
  return session && session.kind === kind && session.token && session.user ? session : null
}

/**
 * Drop the slot. Passing a `kind` only drops it when it belongs to that role,
 * so signing out one role never wipes the other. Passing nothing drops it
 * either way, which is what an expired token needs.
 */
export function clearSession(kind) {
  const current = session || readStored()
  if (kind && current && current.kind !== kind) return

  session = null
  // Only the customer's copy was ever written to storage.
  if (!current || current.kind === 'customer') writeStored(null)
}

/**
 * Read the shared slot without the `kind` filter (used by the sliding
 * token renew in api.js: the renewed bearer must re-persist whichever
 * role is signed in, without touching the user object).
 */
export function peekSession() {
  if (!session) session = readStored()
  return session
}
