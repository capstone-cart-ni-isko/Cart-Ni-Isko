import Echo from 'laravel-echo'
import Pusher from 'pusher-js'

window.Pusher = Pusher

let echoInstance = null

export function getEcho() {
  if (!echoInstance) {
    const appKey = import.meta.env.VITE_REVERB_APP_KEY || 'cartniisko-key'
    const host = import.meta.env.VITE_REVERB_HOST || '127.0.0.1'
    const port = import.meta.env.VITE_REVERB_PORT || 8080
    const scheme = import.meta.env.VITE_REVERB_SCHEME || 'http'

    echoInstance = new Echo({
      broadcaster: 'reverb',
      key: appKey,
      wsHost: host,
      wsPort: port,
      wssPort: port,
      forceTLS: scheme === 'https',
      enabledTransports: ['ws', 'wss'],
      disableStats: true,
      authEndpoint: `${import.meta.env.VITE_API_BASE_URL}/broadcasting/auth`,
      auth: {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
        },
      },
    })
  }
  return echoInstance
}

export function disconnectEcho() {
  if (echoInstance) {
    echoInstance.disconnect()
    echoInstance = null
  }
}

export function listenToOrderUpdates(callback) {
  const echo = getEcho()
  return echo.private('orders').listen('OrderStatusUpdated', (e) => {
    callback(e)
  })
}

export function listenToNotifications(callback) {
  const echo = getEcho()
  const userId = JSON.parse(localStorage.getItem('user') || '{}').cust_id || 
                 JSON.parse(localStorage.getItem('user') || '{}').emp_id
  
  if (userId) {
    return echo.private(`notifications.${userId}`).listen('NotificationCreated', (e) => {
      callback(e)
    })
  }
}

export function listenToAppointmentUpdates(callback) {
  const echo = getEcho()
  return echo.private('appointments').listen('AppointmentUpdated', (e) => {
    callback(e)
  })
}

export function listenToDashboardUpdates(callback) {
  const echo = getEcho()
  return echo.private('dashboard').listen('DashboardUpdated', (e) => {
    callback(e)
  })
}

export function listenToInventoryUpdates(callback) {
  const echo = getEcho()
  return echo.private('inventory').listen('InventoryUpdated', (e) => {
    callback(e)
  })
}