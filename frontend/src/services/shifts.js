import { apiGet, apiPost, apiPut, apiDelete } from './api.js'

/**
 * Duty-shift API (REQ-SS-01 / REQ-SS-02 / REQ-SS-03, FLOW-EMP_SCHED-01..08).
 *
 * The API derives a block's status: `schedules` has no status column, so what
 * comes back is the SCHEDULED / ACTIVE / COMPLETED / PENDING REPLACEMENT value
 * SystemAPI computes from the block window and the assignee's availability.
 */
export const SHIFT_STATUS = {
  SCHEDULED: 'SCHEDULED',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  PENDING_REPLACEMENT: 'PENDING REPLACEMENT',
}

/** GET /shifts - list duty blocks, filtered by employee, date or status. */
export async function fetchShifts(params = {}) {
  const data = await apiGet('/shifts', params)
  return Array.isArray(data.data) ? data.data : []
}

/** POST /shifts - assign a duty block. Times are 'HH:MM' 24-hour. */
export function createShift(payload) {
  return apiPost('/shifts', payload)
}

/** PUT /shifts/{id} - amend a block, and optionally flip emp_instore. */
export function updateShift(shiftId, changes) {
  return apiPut(`/shifts/${shiftId}`, changes)
}

/**
 * PUT /shifts/{id} - FLOW-EMP_SCHED-04: the employee's own "unavailable"
 * exception on one block. Stored as `sched_disabled` server-side; passing
 * false clears the exception and puts the block back on the roster.
 */
export function setShiftUnavailable(shiftId, unavailable) {
  return updateShift(shiftId, { unavailable: !!unavailable })
}

/** DELETE /shifts/{id} - cancel a block. */
export function cancelShift(shiftId) {
  return apiDelete(`/shifts/${shiftId}`)
}
