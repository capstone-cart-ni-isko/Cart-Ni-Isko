import Echo from 'laravel-echo'
import Pusher from 'pusher-js'
import { API_BASE_URL, getApiToken } from './api.js'

// Echo's pusher connector reaches for a global Pusher unless one is handed to
// it through options.client.
window.Pusher = Pusher

/*
    The realtime transport (DOMAIN 31 / REQ-SD-02 and every "real-time"
    requirement): one Laravel Echo client over Reverb, one private channel.

    Every successful API mutation pushes a bare "resource changed" ping
    (App\Events\ApiDataChanged) on the private `api` channel. The ping carries
    no rows - it only tells the client its cached reads are stale - so a single
    shared channel is safe: the refresh that follows is the same
    account-scoped REST read the screen already performs (REQ-NOTIF-03).

    This replaces the old per-feature listeners (orders/notifications/...):
    they subscribed to channels and event names the backend never broadcast,
    and read the bearer from `localStorage.auth_token`, which this app never
    writes (session.js owns the per-portal slots). That is why nothing was live.
*/

let echoInstance = null

/**
 * Origin of the API, with the trailing `/api` removed.
 *
 * VITE_API_BASE_URL already ends in `/api` (api.js strips only a trailing
 * slash), but the broadcast auth route is registered at `/broadcasting/auth`,
 * *not* `/api/broadcasting/auth` - so the authorizer must not reuse the API
 * base verbatim.
 */
function apiOrigin() {
  try {
    return new URL(API_BASE_URL, window.location.href).origin
  } catch {
    return API_BASE_URL.replace(/\/api\/?$/, '')
  }
}

export function getEcho() {
  if (echoInstance) return echoInstance

  const appKey = import.meta.env.VITE_REVERB_APP_KEY || 'cartniisko-key'
  const host = import.meta.env.VITE_REVERB_HOST || '127.0.0.1'
  const port = Number(import.meta.env.VITE_REVERB_PORT || 8080)
  const scheme = import.meta.env.VITE_REVERB_SCHEME || 'http'
  const origin = apiOrigin()

  echoInstance = new Echo({
    broadcaster: 'reverb',
    key: appKey,
    wsHost: host,
    wsPort: port,
    wssPort: port,
    // Reverb terminates plain ws/wss itself; only the "https" scheme wraps TLS.
    forceTLS: scheme === 'https',
    enabledTransports: ['ws', 'wss'],
    // No analytics beacon to a Pusher endpoint we do not own.
    disableStats: true,
    // Keep the event name exactly what the server's broadcastAs() sends
    // ('ApiDataChanged'). Echo's default 'App.Events' prefix would rewrite it
    // to 'App.Events\ApiDataChanged' and the listener would never fire.
    namespace: '',
    /*
        A custom authorizer rather than a one-shot `auth.headers` snapshot.
        The employee bearer slides (X-Renewed-Token) and a reconnect re-signs
        the channel, so the request has to carry the CURRENT token of whichever
        portal is on screen. services/api.js owns that live copy; reading it
        here - at authorize time, not construction time - keeps the socket
        working across a renewal (rule 71: each portal keeps its own bearer).
    */
    authorizer: (channel) => ({
      authorize: (socketId, callback) => {
        const token = getApiToken()
        fetch(`${origin}/broadcasting/auth`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: new URLSearchParams({
            socket_id: socketId,
            channel_name: channel.name,
          }).toString(),
        })
          .then((res) => {
            if (!res.ok) throw new Error(`Broadcast auth failed (${res.status})`)
            return res.json()
          })
          .then((data) => callback(null, data))
          .catch((err) => callback(err, null))
      },
    }),
  })

  return echoInstance
}

export function disconnectEcho() {
  if (!echoInstance) return
  try {
    echoInstance.disconnect()
  } catch {
    // A socket that never opened has nothing to tear down.
  }
  echoInstance = null
}

/**
 * Join the private `api` channel. `handler` receives `{ resource, version }`
 * for every ping. Returns an unsubscribe function.
 */
export function subscribeToApiChanges(handler) {
  const echo = getEcho()
  const channel = echo.private('api')
  channel.listen('ApiDataChanged', (payload) => handler(payload || {}))

  return () => {
    try {
      echo.leave('api')
    } catch {
      // Already left (disconnect ran first).
    }
  }
}
