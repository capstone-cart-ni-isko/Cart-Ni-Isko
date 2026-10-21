import { useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth.js'
import { useAdmin } from '../../hooks/useAdmin.js'
import { startRealtime, stopRealtime, onApiChange } from '../../services/realtime.js'

/*
    Owns the realtime connection for the whole app.

    Mounted once, inside both providers, so a single Echo client serves
    whichever portal is signed in. The channel is private and authorized with
    the bearer of the portal currently on screen (services/websocket.js reads
    the live token), so this only connects while somebody is signed in - a
    guest keeps the polling behaviour with no failing handshakes.

    A write that generates notifications (a checkout, an order status change,
    a booking) is broadcast under its own resource, not 'notif', so the badge
    refresh listens to the whole set that can produce a notification rather
    than only the notification endpoints themselves (FLOW-NOTIF-01).
*/

const NOTIFICATION_SOURCES = [
  'notif',
  'orders',
  'checkout',
  'pos',
  'delivery',
  'tracking',
  'appoint',
  'products',
  'shifts',
  'accounts',
  'reviews',
]

export default function RealtimeBridge() {
  const { currentUser } = useAuth()
  const adminContext = useAdmin()
  const currentAdminUser = adminContext?.currentAdminUser || null

  const signedIn = Boolean(currentUser || currentAdminUser)

  useEffect(() => {
    if (!signedIn) {
      stopRealtime()
      return undefined
    }
    startRealtime()
    return () => stopRealtime()
    // Re-run when the account identity changes so the channel is re-authorized
    // with the new bearer (signing in as another account).
  }, [signedIn, currentUser?.cust_id, currentAdminUser?.emp_id])

  // The unread badges across both portals (BottomNav, DesktopHeader,
  // AdminTopBar) already listen for this window event, so one ping fans out to
  // all of them without any of them importing the realtime service.
  useEffect(() => {
    return onApiChange(NOTIFICATION_SOURCES, () => {
      window.dispatchEvent(new Event('notifications-changed'))
    })
  }, [])

  return null
}
