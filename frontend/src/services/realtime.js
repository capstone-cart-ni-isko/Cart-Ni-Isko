import { invalidateCache } from './api.js'
import { subscribeToApiChanges } from './websocket.js'

/*
    The frontend half of the realtime layer (DOMAIN 31 / REQ-SD-02 and every
    "real-time" requirement).

    screens/references do not talk to Echo directly. They register here with
    `onApiChange(resources, handler)` (or the `useApiChange` hook) and the
    module fans a single server ping out to whoever cares about that resource.

    Every ping also drops the in-memory read cache (services/api.js), so a
    screen that re-reads can never be answered from a copy that predates the
    write that just happened. Polling is left in place underneath - it is the
    fallback for guests (the channel is private) and for a Reverb outage.
*/

let started = false
let unsubscribe = null
let lastVersion = 0

/** Registered `{ resources, handler, debounce, timer }` entries. */
const listeners = new Set()

/**
 * Subscribe to realtime changes.
 *
 * `resources` is one resource name ('orders'), an array of names, or '*' for
 * every ping. The handler is debounced per registration, so a burst of writes
 * (a POS checkout touches orders, products and the bag at once) collapses into
 * a single refresh. Returns an unsubscribe function.
 */
export function onApiChange(resources, handler, { debounce = 400 } = {}) {
  const entry = { resources, handler, debounce, timer: null }
  listeners.add(entry)

  return () => {
    if (entry.timer) clearTimeout(entry.timer)
    listeners.delete(entry)
  }
}

function matches(entry, resource) {
  if (entry.resources === '*' || entry.resources == null) return true
  const wanted = Array.isArray(entry.resources) ? entry.resources : [entry.resources]
  return wanted.includes('*') || wanted.includes(resource)
}

function emit(resource, version) {
  // A ping means at least one cached GET is now stale. Drop the whole cache so
  // every re-read hits the network instead of replaying an old answer.
  invalidateCache()

  // A stable window event other surfaces (notification badges) can listen for
  // without importing this module.
  window.dispatchEvent(new CustomEvent('api-changed', { detail: { resource, version } }))

  listeners.forEach((entry) => {
    if (!matches(entry, resource)) return
    if (entry.timer) clearTimeout(entry.timer)
    entry.timer = setTimeout(() => {
      entry.timer = null
      try {
        entry.handler({ resource, version })
      } catch {
        // One bad listener must never stop the others from refreshing.
      }
    }, entry.debounce)
  })
}

function handlePing({ resource, version }) {
  const next = Number(version) || 0
  // A socket that reconnects can re-deliver an older ping; ignore anything the
  // client has already acted on so screens do not thrash.
  if (next && next < lastVersion) return
  if (next) lastVersion = next
  emit(resource || '*', next)
}

/** Open the channel. Safe to call repeatedly; only the first call connects. */
export function startRealtime() {
  if (started) return
  started = true
  try {
    unsubscribe = subscribeToApiChanges(handlePing)
  } catch {
    // Echo/Pusher not configured: stay on polling.
    started = false
    unsubscribe = null
  }
}

/** Close the channel (sign-out / unmount). */
export function stopRealtime() {
  if (unsubscribe) {
    try {
      unsubscribe()
    } catch {
      // Nothing left to close.
    }
  }
  unsubscribe = null
  started = false
}
