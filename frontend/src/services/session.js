/**
 * The signed-in account slots - one per portal.
 *
 * System rule 71: "The customer portal and the admin portal must be
 * separate." That separation has to hold for the session too, otherwise the
 * two portals overwrite each other's bearer on the shared slot and a reload
 * can quietly hand an employee's tab to a customer (or the other way round).
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
 * STAFF (kind: 'staff') - DOMAIN 16 / FLOW-EMP_LOGOUT-03. An employee stays
 * signed in across a reload of the portal the same way, because the session
 * is ended by the server (POST /auth/logout, an idle timeout or a password
 * change), never by the browser losing its copy. Closing the tab still drops
 * the local copy, and `ApiToken::EMPLOYEE_TTL` still cuts an idle token off
 * after thirty minutes (REQ-EMP_LOGOUT-03).
 *
 * Both roles keep their own slot, so signing in as one never disturbs the
 * other (rule 71).
 */

const STORAGE_KEYS = {
  customer: 'isko_session',
  staff: 'isko_staff_session',
}

/** In-memory mirror of both slots: `{ customer: entry|null, staff: entry|null }`. */
const sessions = { customer: null, staff: null }

/** sessionStorage can be unavailable (private mode, blocked storage). */
function readStored(kind) {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEYS[kind])
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && parsed.kind === kind ? parsed : null
  } catch {
    return null
  }
}

function writeStored(kind, value) {
  try {
    const key = STORAGE_KEYS[kind]
    if (value) sessionStorage.setItem(key, JSON.stringify(value))
    else sessionStorage.removeItem(key)
  } catch {
    // A blocked storage must never break the screen: the in-memory copy below
    // still carries this tab's session.
  }
}

/** Persist a session for this tab: `{ kind: 'customer'|'staff', token, user }`. */
export function saveSession(kind, token, user) {
  if (!STORAGE_KEYS[kind]) return
  // `at` is the tie-breaker when a browser holds both portals at once: the
  // portal the person signed in to LAST is the one the bare "/" entry serves.
  sessions[kind] = { kind, token, user, at: Date.now() }
  writeStored(kind, sessions[kind])
}

/** Restore a session only when it was written by the same `kind`. */
export function loadSession(kind) {
  if (!STORAGE_KEYS[kind]) return null
  if (!sessions[kind]) sessions[kind] = readStored(kind)
  const entry = sessions[kind]
  return entry && entry.kind === kind && entry.token && entry.user ? entry : null
}

/**
 * Drop a slot. Passing a `kind` only drops that portal's copy, so signing out
 * of one never wipes the other (rule 71). Passing nothing drops both, which
 * is what an expired token needs when it cannot say who it belonged to.
 */
export function clearSession(kind) {
  const kinds = kind ? [kind] : ['customer', 'staff']
  kinds.forEach((slot) => {
    sessions[slot] = null
    writeStored(slot, null)
  })
}

/**
 * Read a slot without touching it (used by the sliding token renew in
 * api.js: the renewed bearer must re-persist whichever role it belongs to,
 * without touching the user object).
 */
export function peekSession(kind) {
  return kind ? loadSession(kind) : null
}

/**
 * Which portal owns the tab right now: the most recently signed-in session,
 * or null when nobody is signed in. EntryRoute uses it so an employee who
 * types the bare domain is served the employee portal instead of being sent
 * to the customer login (and vice versa).
 */
export function latestSessionKind() {
  const customer = loadSession('customer')
  const staff = loadSession('staff')

  if (!customer && !staff) return null
  if (!customer) return 'staff'
  if (!staff) return 'customer'

  return (staff.at || 0) >= (customer.at || 0) ? 'staff' : 'customer'
}
