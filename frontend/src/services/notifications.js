import { apiGet, apiPost, apiPut } from './api.js'

/** GET /notif/display - inbox for one account (unread have no *_read stamp). */
export async function fetchNotifications(recipientType, recipientId) {
  const data = await apiGet('/notif/display', {
    recipient_type: recipientType,
    recipient_id: recipientId,
  })
  return data.data || []
}

/** GET /notif/display - the signed-in employee's inbox (id comes from the token). */
export async function fetchStaffNotifications() {
  const data = await apiGet('/notif/display', { recipient_type: 'employee' })
  return data.data || []
}

/** POST /notif/distribute - broadcast to every active account of a type, or to recipientIds only. */
export function distributeNotifications(recipientType, message, recipientIds = []) {
  const body = { recipient_type: recipientType, notif_msg: message }
  if (recipientIds.length > 0) body.recipient_ids = recipientIds
  return apiPost('/notif/distribute', body)
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
