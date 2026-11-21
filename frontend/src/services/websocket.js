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

/**
 * Signs the private channel through the API. Reads the CURRENT token of
 * whichever portal is on screen at authorize time, not construction time, so
 * the socket keeps working across a token renewal (rule 71: each portal keeps
 * its own bearer).
 */
function channelAuthorizer(origin) {
  return (channel) => ({
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
  })
}

export function getEcho() {
  if (echoInstance) return echoInstance

  const origin = apiOrigin()
  const shared = {
    // No analytics beacon.
    disableStats: true,
    // Keep the event name exactly what the server's broadcastAs() sends
    // ('ApiDataChanged'). Echo's default 'App.Events' prefix would rewrite it
    // to 'App.Events\ApiDataChanged' and the listener would never fire.
    namespace: '',
    authorizer: channelAuthorizer(origin),
  }

  // Production: hosted Pusher Channels (the deployed API broadcasts with
  // BROADCAST_CONNECTION=pusher). Without a Pusher key - local dev - the
  // self-hosted Reverb server is used as before.
  const pusherKey = import.meta.env.VITE_PUSHER_APP_KEY
  if (pusherKey) {
    echoInstance = new Echo({
      ...shared,
      broadcaster: 'pusher',
      key: pusherKey,
      cluster: import.meta.env.VITE_PUSHER_APP_CLUSTER || 'ap1',
      forceTLS: true,
    })
    return echoInstance
  }

  const scheme = import.meta.env.VITE_REVERB_SCHEME || 'http'
  const port = Number(import.meta.env.VITE_REVERB_PORT || 8080)
  echoInstance = new Echo({
    ...shared,
    broadcaster: 'reverb',
    key: import.meta.env.VITE_REVERB_APP_KEY || 'cartniisko-key',
    wsHost: import.meta.env.VITE_REVERB_HOST || '127.0.0.1',
    wsPort: port,
    wssPort: port,
    // Reverb terminates plain ws/wss itself; only the "https" scheme wraps TLS.
    forceTLS: scheme === 'https',
    enabledTransports: ['ws', 'wss'],
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
