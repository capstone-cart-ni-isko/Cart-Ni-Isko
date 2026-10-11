import { fetchShifts as fetchScheduleBlocks, SHIFT_STATUS } from './shifts.js'

/**
 * One day's duty blocks for the dashboard widgets, read from GET /shifts
 * (SystemAPI over the `schedules` table). Blocks an employee flagged
 * unavailable (FLOW-EMP_SCHED-04) no longer staff the store, so they are left
 * out of "who is on duty".
 */
export async function fetchShifts(date) {
  const rows = await fetchScheduleBlocks({ date })
  return {
    shifts: rows
      .filter((row) => !row.unavailable)
      .map((row) => ({
        ...row,
        emp_name: row.employee_name || `Employee #${row.emp_id}`,
        pending_replacement: row.status === SHIFT_STATUS.PENDING_REPLACEMENT,
      })),
    locked: false,
  }
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
