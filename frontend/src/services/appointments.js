import { apiGet, apiPost, apiPut } from './api.js'

/** Timeslot geometry from the SRS (REQ-AB-01/02, REQ-SC-02). */
export const SLOT_RULES = {
  CLAIM: { minutes: 30, capacity: 10 },
  VISIT: { minutes: 10, capacity: 1 },
}

/**
 * Appointment kinds. The customer never picks one: the Appointments page books
 * a VISIT, Checkout's "In-Store Pickup" books a CLAIM.
 */
export const APPOINT_TYPE = { VISIT: 'VISIT', CLAIM: 'CLAIM' }

/** GET /appoint/display - own appointments, or all for staff (REQ-SC-01). */
export async function fetchAppointments(params = {}) {
  const data = await apiGet('/appoint/display', params)
  return data.data || []
}

/* The ribbon opens the list often, so the last answer for each
   (customer, filter) is mirrored in localStorage: the page paints instantly
   and the request that follows only refreshes what is on screen. */
const CACHE_KEY = (custId, status) => `cartniisko:appointments:${custId}:${status}`
const CACHE_TTL = 60 * 1000

export function readAppointmentsCache(custId, status) {
  try {
    const hit = JSON.parse(localStorage.getItem(CACHE_KEY(custId, status)) || 'null')
    return hit && Date.now() - hit.at < CACHE_TTL ? hit.rows : null
  } catch {
    return null
  }
}

export function writeAppointmentsCache(custId, status, rows) {
  try {
    localStorage.setItem(CACHE_KEY(custId, status), JSON.stringify({ at: Date.now(), rows }))
  } catch {
    // A full or blocked storage must never break the list.
  }
}

/** GET /appoint/slots?date= - bookable slots with availability + reasons. */
export async function fetchSlots(date) {
  const data = await apiGet('/appoint/slots', { date })
  const payload = data.data
  return Array.isArray(payload) ? payload : payload?.slots || []
}

/** POST /appoint/create - book a slot (validated server-side). */
export function createAppointment(payload) {
  return apiPost('/appoint/create', payload)
}

/** POST /appoint/close - cancel/close a slot, notifying the customer. */
export function closeAppointment(appointId, reason = '') {
  return apiPost('/appoint/close', { appoint_id: appointId, reason })
}

/** PUT /appoint/update - reschedule or amend an appointment. */
export function updateAppointment(appointId, changes) {
  return apiPut('/appoint/update', { appoint_id: appointId, ...changes })
}
