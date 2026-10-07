import { apiGet, apiPost, apiPut, apiDelete } from './api.js'

/** Duty block statuses. The API derives them: duty_shift has no status column. */
export const SHIFT_STATUS = {
  SCHEDULED: 'SCHEDULED',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  PENDING_REPLACEMENT: 'PENDING REPLACEMENT',
}

/** GET /shifts - list duty blocks, filtered by employee, date or status. */
export async function fetchShifts(params = {}) {
  const data = await apiGet('/shifts', params)
  return data.data || []
}

/** POST /shifts - assign a duty block. Times are 'HH:MM' 24-hour. */
export function createShift(payload) {
  return apiPost('/shifts', payload)
}

/** PUT /shifts/{id} - amend a block, and optionally flip emp_instore. */
export function updateShift(shiftId, changes) {
  return apiPut(`/shifts/${shiftId}`, changes)
}

/** DELETE /shifts/{id} - cancel a block. */
export function cancelShift(shiftId) {
  return apiDelete(`/shifts/${shiftId}`)
}
