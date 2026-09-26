import { apiGet, apiPost, apiPut, cacheRead, cacheWrite } from './api.js'

/* The inbox mirrors its last answer for 60s: reopening it paints straight
   away and the request that follows only refreshes what is on screen. */
const CACHE_KEY = (recipientType, recipientId) => `cartniisko:notifs:${recipientType}:${recipientId}`

export function readNotificationsCache(recipientType, recipientId) {
  return cacheRead(CACHE_KEY(recipientType, recipientId))
}

export function writeNotificationsCache(recipientType, recipientId, rows) {
  cacheWrite(CACHE_KEY(recipientType, recipientId), rows)
}

/** GET /notif/display - inbox for one account (unread have no *_read stamp). */
export async function fetchNotifications(recipientType, recipientId) {
  const data = await apiGet('/notif/display', {
    recipient_type: recipientType,
    recipient_id: recipientId,
  })
  const rows = data.data || []
  writeNotificationsCache(recipientType, recipientId, rows)
  return rows
}

/** POST /notif/create - manual notification. */
export function createNotification(recipientType, recipientId, message) {
  return apiPost('/notif/create', {
    recipient_type: recipientType,
    recipient_id: recipientId,
    notif_msg: message,
  })
}

/** PUT /notif/update - mark as read (only by clicking it, REQ-AN-01). */
export function markRead(notifId, recipientType) {
  return apiPut('/notif/update', { notif_id: notifId, recipient_type: recipientType })
}

export function unreadCount(notifications) {
  return notifications.filter((n) => !(n.custnotif_read || n.empnotif_read)).length
}
