import { apiGet, apiPost, apiPut } from './api.js'

/** GET /notif/display - inbox for one account (unread have no *_read stamp). */
export async function fetchNotifications(recipientType, recipientId) {
  const data = await apiGet('/notif/display', {
    recipient_type: recipientType,
    recipient_id: recipientId,
  })
  return data.data || []
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
