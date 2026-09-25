import { apiGet, apiPost, apiDelete } from './api.js'

/** Duty types accepted by POST /duty/assign (stored upper-case). */
export const DUTY_TYPES = [
  { value: 'DESK DUTY', label: 'Desk Duty (Main Counter)' },
  { value: 'EVENT PREP', label: 'Event Prep (Merch Distribution)' },
  { value: 'INVENTORY', label: 'Inventory Audit (Stockroom)' },
  { value: 'POS CASHIER', label: 'POS Cashier (In-Store)' },
]

/** GET /duty/display - one day's shifts plus whether it is locked for the reader. */
export async function fetchShifts(date) {
  const data = await apiGet('/duty/display', { date })
  return {
    shifts: data?.data?.shifts || [],
    locked: Boolean(data?.data?.locked),
  }
}

/** POST /duty/assign - { emp_id, shift_date, shift_start, shift_end, shift_type, shift_location }. */
export function assignShift(payload) {
  return apiPost('/duty/assign', payload)
}

/** DELETE /duty/remove - remove one shift. */
export function removeShift(shiftId) {
  return apiDelete('/duty/remove', { shift_id: shiftId })
}

/** "13:30" -> "1:30 PM". */
export function timeLabel(hhmm) {
  const [h, m] = String(hhmm || '').split(':').map(Number)
  const hour = h || 0
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${h12}:${String(m || 0).padStart(2, '0')} ${suffix}`
}

/** Shifts covering a moment ("HH:MM") - who is in the store right then. */
export function onDutyAt(shifts, hhmm) {
  return shifts.filter((s) => s.shift_start <= hhmm && s.shift_end > hhmm)
}
