/*
 * Shared date / time helpers for the employee scheduling screens
 * (FLOW-EMP_SCHED-01..08 / REQ-SS-01..03 / REQ-EMP_SCHED-01..07).
 *
 * Everything the day grid, the week grid, the month grid and the schedule
 * forms need to talk about a block lives here, so the four never disagree
 * about what "this week" or "08:00" means.
 */

/** The shop's operating day, the timeline and every form default to it. */
export const OPEN_HOUR = 7
export const CLOSE_HOUR = 20

/** Rule 46 / FLOW-EMP_SCHED-05 — the weekly floor the backend enforces. */
export const MIN_WEEKLY_MINUTES = 180

/** FLOW-EMP_SCHED-03 — every block lands on the 10-minute grid. */
export const GRID_MINUTES = 10

export const pad = (value) => String(value).padStart(2, '0')

/** 'YYYY-MM-DD' in LOCAL time (never toISOString, which shifts the day). */
export function dayKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function addDays(date, count) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  next.setDate(next.getDate() + count)
  return next
}

export function addMonths(date, count) {
  return new Date(date.getFullYear(), date.getMonth() + count, 1)
}

/** Monday 00:00 of the week the given date falls in. */
export function weekStartOf(date) {
  const start = startOfDay(date)
  const offset = (start.getDay() + 6) % 7 // getDay(): 0 = Sunday
  start.setDate(start.getDate() - offset)
  return start
}

/** First day of the month the given date falls in. */
export function monthStartOf(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** 'HH:MM' -> minutes since midnight, or null when unparseable. */
export function minutesOf(value) {
  const [hours, minutes] = String(value || '').split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return hours * 60 + minutes
}

export function minutesBetween(start, end) {
  const from = minutesOf(start)
  const to = minutesOf(end)
  if (from === null || to === null) return 0
  return Math.max(0, to - from)
}

/** 1 -> '1 h 0 m', 90 -> '1 h 30 m', 45 -> '45 min'. */
export function humanMinutes(total) {
  const minutes = Math.max(0, Math.round(total || 0))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} m`
}

/**
 * REQ-SS-02: a past day, or today at/after the shop's opening hour, is locked
 * for everybody except a super admin. The server enforces the same rule on the
 * block itself, so this only decides what the UI offers.
 */
export function isLockedDay(date, now = new Date()) {
  const isPast = date.getTime() < startOfDay(now).getTime()
  const isTodayAfterOpen =
    dayKey(date) === dayKey(now) &&
    (now.getHours() > OPEN_HOUR || (now.getHours() === OPEN_HOUR && now.getMinutes() > 0))

  return isPast || isTodayAfterOpen
}

export const fmtLongDate = (date) =>
  date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

export const fmtShortDate = (date) =>
  date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

/** 'HH:MM' -> '8:00 AM', so the grid and the forms read the same way. */
export function fmtTime(value) {
  const parts = String(value || '').split(':').map(Number)
  if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return String(value || '')
  const hours = parts[0]
  const suffix = hours >= 12 ? 'PM' : 'AM'
  const clock = hours % 12 === 0 ? 12 : hours % 12
  return `${clock}:${pad(parts[1])} ${suffix}`
}

/** The hour columns of the store day, oldest first. */
export const HOUR_LABELS = Array.from(
  { length: CLOSE_HOUR - OPEN_HOUR + 1 },
  (_, index) => fmtTime(`${pad(OPEN_HOUR + index)}:00`)
)

export default {
  addDays,
  addMonths,
  dayKey,
  fmtLongDate,
  fmtShortDate,
  fmtTime,
  startOfDay,
  weekStartOf,
}
