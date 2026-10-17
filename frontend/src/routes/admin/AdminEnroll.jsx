import { useState, useMemo } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAdmin } from '../../hooks/useAdmin.js'
import { useToast } from '../../hooks/useToast.js'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import { apiPost } from '../../services/api.js'
import { empCateg, empHomePath } from '../../components/admin/schema.js'

const BICOL_DOMAIN = '@bicol-u.edu.ph'

const CATEGORY_OPTIONS = [
  { value: 'staff', label: 'Staff' },
  { value: 'admin', label: 'Admin' },
  { value: 'super admin', label: 'Super Admin' },
]

/** 'YYYY-MM-DD' local date key for today (the date input's floor). */
const todayKey = () => {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Monday-based week key, so a short week is visible before the server says so. */
const weekKeyOf = (dateKey) => {
  const [year, month, day] = String(dateKey).split('-').map(Number)
  if (!year || !month || !day) return null
  const date = new Date(year, month - 1, day)
  const monday = new Date(date)
  monday.setDate(date.getDate() - ((date.getDay() + 6) % 7))
  const pad = (n) => String(n).padStart(2, '0')
  return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`
}

const minutesOf = (hhmm) => {
  const [hours, minutes] = String(hhmm || '').split(':').map(Number)
  return Number.isFinite(hours) ? hours * 60 + (Number.isFinite(minutes) ? minutes : 0) : null
}

/** Rule 46 / FLOW-EMP_SCHED-05: the weekly floor the server enforces too. */
const MIN_WEEKLY_MINUTES = 180

const toHhmm = (minutes) => {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}`
}

/** Days of the week for recurring duty block assignment */
const DAYS_OF_WEEK = [
  { value: 'monday', label: 'Monday', dayIndex: 1 },
  { value: 'tuesday', label: 'Tuesday', dayIndex: 2 },
  { value: 'wednesday', label: 'Wednesday', dayIndex: 3 },
  { value: 'thursday', label: 'Thursday', dayIndex: 4 },
  { value: 'friday', label: 'Friday', dayIndex: 5 },
  { value: 'saturday', label: 'Saturday', dayIndex: 6 },
  { value: 'sunday', label: 'Sunday', dayIndex: 0 },
]

/**
 * Returns the 'YYYY-MM-DD' for a given weekday name ('monday', 'tuesday', etc.)
 * in the current/upcoming reference week starting from the current week's Monday.
 */
const dateKeyForDayName = (dayName) => {
  const item = DAYS_OF_WEEK.find((d) => d.value === String(dayName).toLowerCase())
  const targetDay = item ? item.dayIndex : 1
  const now = new Date()
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const offset = (monday.getDay() + 6) % 7 // days since Monday
  monday.setDate(monday.getDate() - offset)

  // Distance from Monday (0 to 6)
  const dayOffset = targetDay === 0 ? 6 : targetDay - 1
  const targetDate = new Date(monday)
  targetDate.setDate(monday.getDate() + dayOffset)

  const pad = (n) => String(n).padStart(2, '0')
  return `${targetDate.getFullYear()}-${pad(targetDate.getMonth() + 1)}-${pad(targetDate.getDate())}`
}

/**
 * Derives the weekday name ('monday', 'tuesday', etc.) from a date or day value.
 */
const dayNameFromDateKey = (val) => {
  if (!val) return 'monday'
  const match = DAYS_OF_WEEK.find((d) => d.value === String(val).toLowerCase())
  if (match) return match.value
  const [year, month, day] = String(val).split('-').map(Number)
  if (!year || !month || !day) return 'monday'
  const date = new Date(year, month - 1, day)
  const dIndex = date.getDay()
  const found = DAYS_OF_WEEK.find((d) => d.dayIndex === dIndex)
  return found ? found.value : 'monday'
}

/**
 * Creates a duty block whose initially-set timeslot is not the same as or overlapping
 * any existing block on that day.
 */
const nextAvailableShift = (existingShifts = []) => {
  const lastShift = existingShifts[existingShifts.length - 1]
  const lastDay = lastShift?.day || dayNameFromDateKey(lastShift?.shift_date) || 'monday'
  const sameDayShifts = existingShifts.filter(
    (s) => (s.day || dayNameFromDateKey(s.shift_date)) === lastDay
  )

  // Standard duration: 180 minutes (3 hours, e.g. 09:00 - 12:00)
  const duration = 180
  const openMinutes = 7 * 60 // 07:00
  const closeMinutes = 20 * 60 // 20:00

  // Find candidate start times in 60-minute intervals between 09:00 and 20:00 - duration
  let candidateStart = null
  for (let start = 9 * 60; start <= closeMinutes - duration; start += 60) {
    const end = start + duration
    const overlaps = sameDayShifts.some((s) => {
      const sStart = minutesOf(s.shift_start)
      const sEnd = minutesOf(s.shift_end)
      if (sStart === null || sEnd === null) return false
      return Math.max(start, sStart) < Math.min(end, sEnd)
    })
    if (!overlaps) {
      candidateStart = start
      break
    }
  }

  // If no slot found during the afternoon, check earlier from 07:00
  if (candidateStart === null) {
    for (let start = openMinutes; start <= closeMinutes - duration; start += 60) {
      const end = start + duration
      const overlaps = sameDayShifts.some((s) => {
        const sStart = minutesOf(s.shift_start)
        const sEnd = minutesOf(s.shift_end)
        if (sStart === null || sEnd === null) return false
        return Math.max(start, sStart) < Math.min(end, sEnd)
      })
      if (!overlaps) {
        candidateStart = start
        break
      }
    }
  }

  // If this day is completely packed, pick next day with 09:00 - 12:00
  if (candidateStart === null) {
    const currentIndex = DAYS_OF_WEEK.findIndex((d) => d.value === lastDay)
    const nextDay = DAYS_OF_WEEK[(currentIndex + 1) % DAYS_OF_WEEK.length].value
    return {
      day: nextDay,
      shift_date: dateKeyForDayName(nextDay),
      shift_start: '09:00',
      shift_end: '12:00',
    }
  }

  return {
    day: lastDay,
    shift_date: dateKeyForDayName(lastDay),
    shift_start: toHhmm(candidateStart),
    shift_end: toHhmm(candidateStart + duration),
  }
}

const emptyShift = () => ({
  day: 'monday',
  shift_date: dateKeyForDayName('monday'),
  shift_start: '09:00',
  shift_end: '12:00',
})

/**
 * DOMAIN 6 — Employee enrollment (super admin only).
 * The Bicol University email domain is validated in realtime; on
 * success the generated temporary password is shown with a
 * confirmation, and a duplicate email surfaces a clear error.
 */
function AdminEnrollForm() {
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [surname, setSurname] = useState('')
  const [givname, setGivname] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [category, setCategory] = useState('staff')
  // FLOW-EMP_ENROLL-02: the schedule of the employee being enrolled is part of
  // the enrollment form itself. Adding or removing their dates and times later
  // is done from the employee list on the schedule screen (FLOW-EMP_SCHED-03).
  const [shifts, setShifts] = useState(() => [emptyShift()])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState(null) // { tempPassword, name, email, category, shifts }

  // Realtime @bicol-u.edu.ph domain validation (REQ-EMP_ENROLL).
  const emailValue = email.trim().toLowerCase()
  const emailValid = useMemo(
    () => emailValue.endsWith(BICOL_DOMAIN) && emailValue.length > BICOL_DOMAIN.length,
    [emailValue]
  )
  const emailTouched = emailValue.length > 0

  // Realtime validation of every duty row (system rule 66): the 10-minute
  // grid of FLOW-EMP_SCHED-03, an end after the start, and no duplicate/overlapping
  // timeslots between blocks on the same day (REQ-EMP_SCHED-04).
  const shiftRowErrors = useMemo(
    () =>
      shifts.map((row, index) => {
        const day = row.day || dayNameFromDateKey(row.shift_date)
        const start = String(row.shift_start || '').trim()
        const end = String(row.shift_end || '').trim()

        if (!day) return 'Select the day of the duty block.'
        if (!start || !end) return 'Set both a start and an end time.'

        const startMinutes = minutesOf(start)
        const endMinutes = minutesOf(end)
        if (startMinutes === null || endMinutes === null) return 'Times must use the HH:MM 24-hour format.'
        if (endMinutes <= startMinutes) return 'The end time must be later than the start time.'
        if (startMinutes % 10 !== 0 || endMinutes % 10 !== 0) {
          return 'Duty blocks must be set in 10-minute steps. For example: 09:00, 09:10, 09:20.'
        }

        // Check collision against other blocks in the form on the same day
        const conflict = shifts.some((other, otherIdx) => {
          if (otherIdx === index) return false
          const otherDay = other.day || dayNameFromDateKey(other.shift_date)
          if (otherDay !== day) return false
          const oStart = minutesOf(other.shift_start)
          const oEnd = minutesOf(other.shift_end)
          if (oStart === null || oEnd === null) return false
          return Math.max(startMinutes, oStart) < Math.min(endMinutes, oEnd)
        })
        if (conflict) {
          return 'This timeslot conflicts or overlaps with another block on the same day.'
        }

        return ''
      }),
    [shifts]
  )

  const hasShiftErrors = shiftRowErrors.some((message) => message !== '')

  // Rule 46 / FLOW-EMP_SCHED-05, judged per week so a short week is visible
  // here instead of coming back from the server.
  const shortWeeks = useMemo(() => {
    const totals = new Map()
    shifts.forEach((row, index) => {
      if (shiftRowErrors[index]) return
      const key = weekKeyOf(row.shift_date)
      if (!key) return
      const minutes = (minutesOf(row.shift_end) ?? 0) - (minutesOf(row.shift_start) ?? 0)
      totals.set(key, (totals.get(key) || 0) + Math.max(0, minutes))
    })

    return [...totals.entries()]
      .filter(([, minutes]) => minutes < MIN_WEEKLY_MINUTES)
      .map(([week, minutes]) => ({ week, minutes }))
  }, [shifts, shiftRowErrors])

  const totalShiftMinutes = useMemo(
    () =>
      shifts.reduce(
        (sum, row) => sum + Math.max(0, (minutesOf(row.shift_end) ?? 0) - (minutesOf(row.shift_start) ?? 0)),
        0
      ),
    [shifts]
  )

  const updateShift = (index, field, value) => {
    setShifts((rows) =>
      rows.map((row, i) => {
        if (i !== index) return row
        if (field === 'day') {
          return {
            ...row,
            day: value,
            shift_date: dateKeyForDayName(value),
          }
        }
        return { ...row, [field]: value }
      })
    )
  }

  const addShift = () => setShifts((rows) => [...rows, nextAvailableShift(rows)])
  const removeShift = (index) =>
    setShifts((rows) => (rows.length === 1 ? rows : rows.filter((_, i) => i !== index)))

  const canSubmit =
    surname.trim().length > 0 &&
    givname.trim().length > 0 &&
    emailValid &&
    phone.trim().length > 0 &&
    shifts.length > 0 &&
    !hasShiftErrors &&
    !isSubmitting

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canSubmit) return

    setIsSubmitting(true)
    setResult(null)
    try {
      const res = await apiPost('/auth/emp_signup', {
        surname: surname.trim(),
        givname: givname.trim(),
        email: emailValue,
        phone: phone.trim(),
        callcode: '+63',
        pronoun: 'they/them',
        // New-schema vocabulary; the backend also accepts the legacy
        // uppercase alias for the same column.
        categ: category,
        type: category.toUpperCase(),
        // FLOW-EMP_ENROLL-02: the duty blocks the new employee is enrolled
        // with. The server validates them against DOMAIN 7 (10-minute grid,
        // overlaps, the 180-minute weekly floor) before anything is written.
        shifts: shifts.map((row) => ({
          shift_date: row.shift_date,
          shift_start: row.shift_start,
          shift_end: row.shift_end,
        })),
      })

      const user = res?.data || {}
      const tempPassword =
        user.temporary_password || user.temp_password || user.password || null

      // REQ-EMP_ENROLL-05: the enrollment - successes and failures alike - is
      // written to the access log by the backend (FLOW-EMP_ENROLL-07), so the
      // screen never posts a log row of its own.

      setResult({
        tempPassword,
        name: `${givname.trim()} ${surname.trim()}`,
        email: emailValue,
        category,
        shifts: shifts.map((row) => ({ ...row })),
      })
      showToast(
        `Employee enrolled${tempPassword ? ' — temporary password generated' : ''} with ${shifts.length} duty block${shifts.length === 1 ? '' : 's'}.`,
        'success'
      )
    } catch (err) {
      // REQ-EMP_ENROLL-04: the duplicate answer from POST /auth/emp_signup
      // (409) and every other backend message is surfaced verbatim instead of
      // being replaced with a generic "enrollment failed".
      const status = err?.status || err?.response?.status
      const message = String(err?.payload?.message || err?.message || 'Enrollment failed')
      if (status === 409 || /duplicate|already exists|already taken|exists/i.test(message)) {
        showToast(`The email ${emailValue} is already enrolled. Use a different Bicol University email.`, 'error')
      } else {
        showToast(message, 'error')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetForm = () => {
    setSurname('')
    setGivname('')
    setEmail('')
    setPhone('')
    setCategory('staff')
    setShifts([emptyShift()])
    setResult(null)
  }

  return (
    <AdminLayout>
      <div className="max-w-2xl mx-auto space-y-5">
        <div>
          <h1 className="page-title text-slate-900 dark:text-[var(--ink)]">
            Enroll Staff
          </h1>
          <p className="text-sm text-slate-500 font-normal mt-1">
            Create a new employee account with a Bicol University email.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-5 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-2xs font-semibold text-slate-700 mb-1">
                Surname <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={surname}
                onChange={(e) => setSurname(e.target.value)}
                placeholder="e.g. Dela Cruz"
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange transition-all"
              />
            </div>
            <div>
              <label className="block text-2xs font-semibold text-slate-700 mb-1">
                Given name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={givname}
                onChange={(e) => setGivname(e.target.value)}
                placeholder="e.g. Juan"
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-2xs font-semibold text-slate-700 mb-1">
              Bicol University email <span className="text-rose-500">*</span>
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@bicol-u.edu.ph"
              aria-invalid={emailTouched && !emailValid}
              className={`w-full bg-white border rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-1 transition-all ${
                emailTouched && !emailValid
                  ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500'
                  : 'border-slate-200 focus:border-brand-orange focus:ring-brand-orange'
              }`}
            />
            <p className={`text-2xs mt-1 ${emailTouched && !emailValid ? 'text-rose-600 font-medium' : 'text-slate-400'}`}>
              {emailTouched && !emailValid
                ? `Email must end with ${BICOL_DOMAIN}`
                : `Must be a valid ${BICOL_DOMAIN} address.`}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-2xs font-semibold text-slate-700 mb-1">
                Phone number <span className="text-rose-500">*</span>
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+63 912 345 6789"
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange transition-all"
              />
            </div>
            <div>
              <label className="block text-2xs font-semibold text-slate-700 mb-1">
                Initial category <span className="text-rose-500">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange transition-all cursor-pointer"
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ── FLOW-EMP_ENROLL-02: the schedule the new employee is enrolled
              with. Every row is one duty block (date + 24-hour start/end on the
              10-minute grid); adding or removing dates and times afterwards is
              done from the employee list on the schedule screen. ── */}
          <div className="pt-2 border-t border-slate-100 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-2xs font-bold uppercase tracking-wider text-slate-700">
                  Initial duty schedule
                </h2>
                <p className="text-2xs text-slate-400 mt-0.5">
                  Each row is one duty block · 10-minute steps · at least {MIN_WEEKLY_MINUTES} minutes
                  per week (minimum 180 minutes)
                </p>
              </div>
              <button
                type="button"
                onClick={addShift}
                className="h-8 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3.5 h-3.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add block
              </button>
            </div>

            <div className="space-y-2">
              {shifts.map((row, index) => {
                const error = shiftRowErrors[index]
                return (
                  <div
                    key={`shift-row-${index}`}
                    className={`rounded-xl border p-3 space-y-2 ${
                      error ? 'border-rose-200 bg-rose-50/40' : 'border-slate-200 bg-slate-50/50'
                    }`}
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] items-end gap-2">
                      <div>
                        <label className="block text-2xs font-semibold text-slate-700 mb-1">Day</label>
                        <select
                          value={row.day || dayNameFromDateKey(row.shift_date)}
                          onChange={(e) => updateShift(index, 'day', e.target.value)}
                          className={`w-full bg-white border rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-1 transition-all cursor-pointer ${
                            error
                              ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500'
                              : 'border-slate-200 focus:border-brand-orange focus:ring-brand-orange'
                          }`}
                        >
                          {DAYS_OF_WEEK.map((d) => (
                            <option key={d.value} value={d.value}>
                              {d.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-2xs font-semibold text-slate-700 mb-1">Start</label>
                        <input
                          type="time"
                          step={600}
                          value={row.shift_start}
                          onChange={(e) => updateShift(index, 'shift_start', e.target.value)}
                          className={`w-32 bg-white border rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-1 transition-all cursor-pointer ${
                            error
                              ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500'
                              : 'border-slate-200 focus:border-brand-orange focus:ring-brand-orange'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="block text-2xs font-semibold text-slate-700 mb-1">End</label>
                        <input
                          type="time"
                          step={600}
                          value={row.shift_end}
                          onChange={(e) => updateShift(index, 'shift_end', e.target.value)}
                          className={`w-32 bg-white border rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-1 transition-all cursor-pointer ${
                            error
                              ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500'
                              : 'border-slate-200 focus:border-brand-orange focus:ring-brand-orange'
                          }`}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeShift(index)}
                        disabled={shifts.length === 1}
                        title={shifts.length === 1 ? 'An enrollment needs at least one duty block' : 'Remove this block'}
                        className="h-10 px-3 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        aria-label={`Remove duty block ${index + 1}`}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>

                    {error && <p className="text-2xs font-semibold text-rose-600">{error}</p>}
                  </div>
                )
              })}
            </div>

            {shortWeeks.length > 0 && (
              <p className="text-2xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {shortWeeks
                  .map(({ week, minutes }) => `week of ${week}: ${minutes} of ${MIN_WEEKLY_MINUTES} minutes`)
                  .join(' · ')}{' '}
                — these weeks are below the 180-minute weekly minimum and will be rejected.
              </p>
            )}

            <p className="text-2xs text-slate-400">
              {shifts.length} block{shifts.length === 1 ? '' : 's'} · {totalShiftMinutes} scheduled minutes in total.
              The schedule can be changed later from the{' '}
              <span className="font-semibold text-slate-500">Schedules</span> screen.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={resetForm}
              className="h-9 px-4 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200 cursor-pointer transition-colors"
            >
              Clear
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="h-9 px-4 rounded-xl bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Enrolling…' : 'Enroll employee'}
            </button>
          </div>
        </form>

        {/* Success confirmation with the generated temporary password */}
        {result && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 space-y-3 animate-slide-up">
            <div className="flex items-start gap-3">
              <span className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
              <div>
                <h2 className="text-sm font-bold text-emerald-900">
                  Employee enrolled
                </h2>
                <p className="text-xs text-emerald-700">
                  {result.name} ({result.email}) is now a{' '}
                  <span className="font-semibold">{result.category}</span> with an active
                  account, scheduled for{' '}
                  {result.shifts?.length || 0} duty block
                  {(result.shifts?.length || 0) === 1 ? '' : 's'}.
                </p>
              </div>
            </div>
            {result.tempPassword ? (
              <div className="bg-white border border-emerald-200 rounded-xl p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-2xs font-semibold text-slate-500">
                    Temporary password
                  </p>
                  <p className="text-sm font-mono font-bold text-slate-900 break-all">
                    {result.tempPassword}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(result.tempPassword).catch(() => {})
                    showToast('Temporary password copied.', 'success')
                  }}
                  className="h-8 px-3 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 cursor-pointer shrink-0"
                >
                  Copy
                </button>
              </div>
            ) : (
              <p className="text-xs text-emerald-700">
                The account is active — the employee can sign in with the
                credentials issued by the system.
              </p>
            )}
            <p className="text-2xs text-emerald-700/80">
              Share the temporary password securely — a copy has also been
              emailed to the employee's Bicol University inbox
              (FLOW-EMP_ENROLL-04). The employee will be prompted to set
              their own password on first sign-in, and the temporary
              password expires 24 hours after enrollment.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={resetForm}
                className="h-8 px-3 rounded-lg bg-white border border-emerald-200 text-emerald-800 text-xs font-semibold hover:bg-emerald-100/60 cursor-pointer"
              >
                Enroll another
              </button>
              <button
                type="button"
                onClick={() => navigate('/admin/staff')}
                className="h-8 px-3 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 cursor-pointer"
              >
                Go to staff directory
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}

/** Super admins only (D5/D6). The route itself is guarded in App.jsx too. */
export default function AdminEnroll() {
  const { currentAdminUser } = useAdmin()
  const categ = empCateg(currentAdminUser || {})
  const roleKey = currentAdminUser?.roleKey
  if (roleKey && roleKey !== 'SUPER_ADMIN') return <Navigate to={empHomePath(currentAdminUser)} replace />
  if (!roleKey && categ !== 'super admin') return <Navigate to={empHomePath(currentAdminUser)} replace />
  return <AdminEnrollForm />
}
