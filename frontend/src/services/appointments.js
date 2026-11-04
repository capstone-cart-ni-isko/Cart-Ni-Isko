import { apiGet, apiPost, apiPut, invalidateCache } from './api.js'

/** Timeslot geometry (DOMAIN 8 / DOMAIN 21 / DOMAIN 22): pickup and visit slots are both
 *  10 minutes; a pickup block holds up to 5 open bookings, a visit exactly 1. */
export const SLOT_RULES = {
  CLAIM: { minutes: 10, capacity: 5 },
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
  return Array.isArray(data.data) ? data.data : []
}

export function appointmentStatusLabel(status) {
  const normalized = String(status || '').trim().toLowerCase().replace(/[\s_-]+/g, ' ')
  if (['done', 'complete', 'completed', 'claimed', 'closed'].includes(normalized)) return 'Complete'
  if (['absent', 'no show'].includes(normalized)) return 'No Show'
  if (['cancelled', 'canceled'].includes(normalized)) return 'Cancelled'
  if (['upcoming', 'open'].includes(normalized)) return 'Upcoming'
  return status || '—'
}

/** GET /appoint/slots?date= - bookable slots with availability + reasons. */
export async function fetchSlots(date) {
  const data = await apiGet('/appoint/slots', { date })
  const payload = data.data
  return Array.isArray(payload) ? payload : payload?.slots || []
}

/** POST /appoint/create - book a slot (validated server-side). */
export async function createAppointment(payload) {
  const result = await apiPost('/appoint/create', payload)
  invalidateCache()
  return result
}

/** POST /appoint/close - cancel/close a slot, notifying the customer. */
export async function closeAppointment(appointId, reason = '') {
  const result = await apiPost('/appoint/close', { appoint_id: appointId, reason })
  invalidateCache()
  return result
}

/** PUT /appoint/update - reschedule or amend an appointment. */
export async function updateAppointment(appointId, changes) {
  const result = await apiPut('/appoint/update', { appoint_id: appointId, ...changes })
  invalidateCache()
  return result
}
