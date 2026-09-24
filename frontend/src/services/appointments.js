import { apiGet, apiPost, apiPut } from './api.js'

/** Timeslot geometry from the SRS (REQ-AB-01/02, REQ-SC-02). */
export const SLOT_RULES = {
  CLAIM: { minutes: 30, capacity: 10 },
  VISIT: { minutes: 10, capacity: 1 },
}

/** GET /appoint/display - own appointments, or all for staff (REQ-SC-01). */
export async function fetchAppointments(params = {}) {
  const data = await apiGet('/appoint/display', params)
  return data.data || []
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
