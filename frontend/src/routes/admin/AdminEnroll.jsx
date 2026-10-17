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
 * Calculates the reference Monday for weekly recurring duty blocks.
 * To ensure that duty shift dates are never in the past (> 24 hours ago) and
 * all days of the weekly recurring schedule fall into the same 7-day aggregation
 * window, we anchor to the upcoming weekly cycle (or today if today is Monday).
 */
const getReferenceMonday = () => {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dayOfWeek = today.getDay() // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const daysSinceMonday = (dayOfWeek + 6) % 7 // 0 for Monday, 1 for Tue, ..., 6 for Sun
  const monday = new Date(today)
  if (daysSinceMonday > 0) {
    monday.setDate(today.getDate() + (7 - daysSinceMonday))
  }
  return monday
}

/**
 * Returns the 'YYYY-MM-DD' for a given weekday name ('monday', 'tuesday', etc.)
 * in the upcoming reference week starting from the reference Monday.
 */
const dateKeyForDayName = (dayName) => {
  const item = DAYS_OF_WEEK.find((d) => d.value === String(dayName).toLowerCase())
  const targetDay = item ? item.dayIndex : 1
  const monday = getReferenceMonday()

  // Distance from Monday (0 to 6): Monday=0, Tuesday=1, ..., Sunday=6
  const dayOffset = targetDay === 0 ? 6 : targetDay - 1
  const targetDate = new Date(monday)
  targetDate.setDate(monday.getDate() + dayOffset)

  const pad = (n) => String(n).padStart(2, '0')
  return `${targetDate.getFullYear()}-${pad(targetDate.getMonth() + 1)}-${pad(targetDate.getDate())}`
}

/**
 * Formats 24-hour 'HH:MM' time into human-friendly 12-hour AM/PM format (e.g. '1:00 PM').
 */
const formatTime12h = (hhmm) => {
  if (!hhmm) return ''
  const parts = String(hhmm).trim().split(':')
  if (parts.length < 2) return hhmm
  const h = Number(parts[0])
  const m = Number(parts[1])
  if (isNaN(h) || isNaN(m)) return hhmm
  const period = h >= 12 ? 'PM' : 'AM'
  const displayH = h % 12 === 0 ? 12 : h % 12
  const displayM = String(m).padStart(2, '0')
  return `${displayH}:${displayM} ${period}`
}

/**
 * Returns human-readable duration between start and end times (e.g. '6 hrs' or '3 hrs 30 mins').
 */
const formatDuration = (startHhmm, endHhmm) => {
  const s = minutesOf(startHhmm)
  const e = minutesOf(endHhmm)
  if (s === null || e === null || e <= s) return ''
  const diff = e - s
  const hrs = Math.floor(diff / 60)
  const mins = diff % 60
  if (hrs > 0 && mins > 0) return `${hrs} hr${hrs > 1 ? 's' : ''} ${mins} min${mins > 1 ? 's' : ''}`
  if (hrs > 0) return `${hrs} hr${hrs > 1 ? 's' : ''}`
  return `${mins} mins`
}

/** Common standard weekly shift presets */
const SHIFT_PRESETS = [
  { label: '1:00 PM – 7:00 PM (6 hrs)', start: '13:00', end: '19:00' },
  { label: '8:00 AM – 12:00 PM (4 hrs)', start: '08:00', end: '12:00' },
  { label: '1:00 PM – 5:00 PM (4 hrs)', start: '13:00', end: '17:00' },
  { label: '9:00 AM – 1:00 PM (4 hrs)', start: '09:00', end: '13:00' },
  { label: '9:00 AM – 12:00 PM (3 hrs)', start: '09:00', end: '12:00' },
]

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
 * Suggests the next available weekly duty block without colliding with existing blocks.
 */
const nextAvailableShift = (existingShifts = []) => {
  // Find the first weekday that has no duty block scheduled yet
  const usedDays = new Set(existingShifts.map((s) => s.day || dayNameFromDateKey(s.shift_date)))
  const nextUnusedDay = DAYS_OF_WEEK.find((d) => !usedDays.has(d.value))

  if (nextUnusedDay) {
    return {
      day: nextUnusedDay.value,
      shift_date: dateKeyForDayName(nextUnusedDay.value),
      shift_start: '13:00',
      shift_end: '19:00',
    }
  }

  // If all days have a block, find a non-overlapping slot on the last day or Monday
  const lastShift = existingShifts[existingShifts.length - 1]
  const targetDay = lastShift?.day || 'monday'
  const sameDayShifts = existingShifts.filter(
    (s) => (s.day || dayNameFromDateKey(s.shift_date)) === targetDay
  )

  const duration = 180 // 3 hours
  const candidateStarts = [8 * 60, 9 * 60, 13 * 60, 14 * 60, 16 * 60, 7 * 60]
  for (const start of candidateStarts) {
    const end = start + duration
    if (end > 20 * 60) continue
    const overlaps = sameDayShifts.some((s) => {
      const sStart = minutesOf(s.shift_start)
      const sEnd = minutesOf(s.shift_end)
      if (sStart === null || sEnd === null) return false
      return Math.max(start, sStart) < Math.min(end, sEnd)
    })
    if (!overlaps) {
      return {
        day: targetDay,
        shift_date: dateKeyForDayName(targetDay),
        shift_start: toHhmm(start),
        shift_end: toHhmm(end),
      }
    }
  }

  return {
    day: targetDay,
    shift_date: dateKeyForDayName(targetDay),
    shift_start: '08:00',
    shift_end: '11:00',
  }
}

/** Default starting duty block: Monday 1:00 PM – 7:00 PM (repeats weekly) */
const emptyShift = () => ({
  day: 'monday',
  shift_date: dateKeyForDayName('monday'),
  shift_start: '13:00',
  shift_end: '19:00',
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

  // Realtime validation of every duty row: 10-minute intervals, store hours,
  // end after start, and no overlapping timeslots on the same weekday.
  const shiftRowErrors = useMemo(
    () =>
      shifts.map((row, index) => {
        const day = row.day || dayNameFromDateKey(row.shift_date)
        const start = String(row.shift_start || '').trim()
        const end = String(row.shift_end || '').trim()

        if (!day) return 'Please select a day of the week.'
        if (!start || !end) return 'Please enter both a start time and an end time.'

        const startMinutes = minutesOf(start)
        const endMinutes = minutesOf(end)
        if (startMinutes === null || endMinutes === null) return 'Please enter valid times in 24-hour format.'
        if (endMinutes <= startMinutes) return 'The end time must be later than the start time.'
        if (startMinutes < 7 * 60 || endMinutes > 20 * 60) {
          return 'Duty shifts must fall within store operating hours (7:00 AM – 8:00 PM).'
        }
        if (startMinutes % 10 !== 0 || endMinutes % 10 !== 0) {
          return 'Duty shifts must be set in 10-minute intervals (for example: 09:00, 09:10, 09:20).'
        }

        // Check collision against other blocks on the same weekday
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
          return 'This timeslot overlaps with another duty block scheduled on the same day.'
        }

        return ''
      }),
    [shifts]
  )

  const hasShiftErrors = shiftRowErrors.some((message) => message !== '')

  // Total weekly duty minutes (minimum 180 minutes / 3 hours per week required)
  const totalShiftMinutes = useMemo(
    () =>
      shifts.reduce((sum, row, index) => {
        if (shiftRowErrors[index]) return sum
        const s = minutesOf(row.shift_start)
        const e = minutesOf(row.shift_end)
        if (s === null || e === null || e <= s) return sum
        return sum + (e - s)
      }, 0),
    [shifts, shiftRowErrors]
  )

  const isUnderWeeklyMinimum = totalShiftMinutes < MIN_WEEKLY_MINUTES

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

  const applyPreset = (index, preset) => {
    setShifts((rows) =>
      rows.map((row, i) => {
        if (i !== index) return row
        return {
          ...row,
          shift_start: preset.start,
          shift_end: preset.end,
        }
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
    !isUnderWeeklyMinimum &&
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
        categ: category,
        type: category.toUpperCase(),
        shifts: shifts.map((row) => ({
          shift_date: row.shift_date,
          shift_start: row.shift_start,
          shift_end: row.shift_end,
        })),
      })

      const user = res?.data || {}
      const tempPassword =
        user.temporary_password || user.temp_password || user.password || null

      setResult({
        tempPassword,
        name: `${givname.trim()} ${surname.trim()}`,
        email: emailValue,
        category,
        shifts: shifts.map((row) => ({ ...row })),
      })
      showToast(
        `Employee enrolled${tempPassword ? ' — temporary password generated' : ''} with ${shifts.length} weekly recurring shift${shifts.length === 1 ? '' : 's'}.`,
        'success'
      )
    } catch (err) {
      const status = err?.status || err?.response?.status
      const message = String(err?.payload?.message || err?.message || 'Enrollment could not be completed. Please try again.')
      if (status === 409 || /duplicate|already exists|already taken|exists/i.test(message)) {
        showToast(`The email ${emailValue} is already registered. Please use another Bicol University email address.`, 'error')
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

          {/* ── Weekly recurring duty schedule ── */}
          <div className="pt-2 border-t border-slate-100 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-2xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <span>Weekly Recurring Duty Schedule</span>
                  <span className="text-3xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-semibold normal-case">
                    Repeats Weekly
                  </span>
                </h2>
                <p className="text-2xs text-slate-400 mt-0.5">
                  Assigned timeslots repeat every week on the selected weekday (minimum 180 minutes / 3 hours per week).
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
                Add shift
              </button>
            </div>

            <div className="space-y-3">
              {shifts.map((row, index) => {
                const error = shiftRowErrors[index]
                const dayName = row.day || dayNameFromDateKey(row.shift_date)
                const dayItem = DAYS_OF_WEEK.find((d) => d.value === dayName)
                const dayLabel = dayItem ? dayItem.label : 'Monday'
                const durationText = formatDuration(row.shift_start, row.shift_end)

                return (
                  <div
                    key={`shift-row-${index}`}
                    className={`rounded-2xl border p-4 space-y-3 transition-colors ${
                      error ? 'border-rose-200 bg-rose-50/40' : 'border-slate-200/90 bg-slate-50/60'
                    }`}
                  >
                    {/* Header with recurring badge and duration */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-semibold bg-blue-100/80 text-blue-800">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3">
                            <polyline points="23 4 23 10 17 10" />
                            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                          </svg>
                          Repeats every {dayLabel}
                        </span>
                        {durationText && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-medium bg-slate-200/80 text-slate-700">
                            {durationText}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => removeShift(index)}
                        disabled={shifts.length === 1}
                        title={shifts.length === 1 ? 'An enrollment requires at least one duty shift' : 'Remove this shift'}
                        className="h-7 px-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-2xs flex items-center gap-1"
                        aria-label={`Remove duty shift ${index + 1}`}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3.5 h-3.5">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                        <span>Remove</span>
                      </button>
                    </div>

                    {/* Quick Timeslot Presets */}
                    <div>
                      <span className="block text-3xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                        Quick Timeslot Presets
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {SHIFT_PRESETS.map((preset) => {
                          const isSelected = row.shift_start === preset.start && row.shift_end === preset.end
                          return (
                            <button
                              key={preset.label}
                              type="button"
                              onClick={() => applyPreset(index, preset)}
                              className={`h-7 px-2.5 rounded-lg text-2xs font-medium transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-[#F97316] text-white shadow-2xs font-semibold'
                                  : 'bg-white border border-slate-200 text-slate-700 hover:border-orange-300 hover:bg-orange-50/50'
                              }`}
                            >
                              {preset.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Inputs Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                      <div>
                        <label className="block text-2xs font-semibold text-slate-700 mb-1">
                          Day of the Week
                        </label>
                        <select
                          value={dayName}
                          onChange={(e) => updateShift(index, 'day', e.target.value)}
                          className={`w-full bg-white border rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-1 transition-all cursor-pointer ${
                            error
                              ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500'
                              : 'border-slate-200 focus:border-brand-orange focus:ring-brand-orange'
                          }`}
                        >
                          {DAYS_OF_WEEK.map((d) => (
                            <option key={d.value} value={d.value}>
                              Every {d.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-2xs font-semibold text-slate-700 mb-1">
                          Start Time
                        </label>
                        <input
                          type="time"
                          step={600}
                          value={row.shift_start}
                          onChange={(e) => updateShift(index, 'shift_start', e.target.value)}
                          className={`w-full bg-white border rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-1 transition-all cursor-pointer ${
                            error
                              ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500'
                              : 'border-slate-200 focus:border-brand-orange focus:ring-brand-orange'
                          }`}
                        />
                        <p className="text-2xs text-slate-500 mt-1 font-medium">
                          {row.shift_start ? formatTime12h(row.shift_start) : '--:--'}
                        </p>
                      </div>

                      <div>
                        <label className="block text-2xs font-semibold text-slate-700 mb-1">
                          End Time
                        </label>
                        <input
                          type="time"
                          step={600}
                          value={row.shift_end}
                          onChange={(e) => updateShift(index, 'shift_end', e.target.value)}
                          className={`w-full bg-white border rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-1 transition-all cursor-pointer ${
                            error
                              ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500'
                              : 'border-slate-200 focus:border-brand-orange focus:ring-brand-orange'
                          }`}
                        />
                        <p className="text-2xs text-slate-500 mt-1 font-medium">
                          {row.shift_end ? formatTime12h(row.shift_end) : '--:--'}
                        </p>
                      </div>
                    </div>

                    {error && (
                      <div className="flex items-center gap-1.5 text-2xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 shrink-0">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="12" />
                          <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        <span>{error}</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Weekly Total Hours & Status Banner */}
            {isUnderWeeklyMinimum ? (
              <div className="flex items-start gap-2.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-amber-600 shrink-0 mt-0.5">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <div className="space-y-0.5">
                  <p className="font-bold">Weekly Schedule: {totalShiftMinutes} of 180 required minutes</p>
                  <p className="text-2xs text-amber-700">
                    A minimum of 180 minutes (3 hours) per week is required. Please add at least {MIN_WEEKLY_MINUTES - totalShiftMinutes} more minutes before enrolling.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2 text-2xs bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-3.5 py-2">
                <div className="flex items-center gap-2">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 text-emerald-600">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span className="font-semibold">
                    Total weekly schedule: {Math.floor(totalShiftMinutes / 60)} hr{Math.floor(totalShiftMinutes / 60) === 1 ? '' : 's'} {totalShiftMinutes % 60 > 0 ? `${totalShiftMinutes % 60} mins ` : ''}({totalShiftMinutes} mins total)
                  </span>
                </div>
                <span className="font-semibold text-emerald-700">Weekly requirement met</span>
              </div>
            )}

            <p className="text-2xs text-slate-400">
              {shifts.length} weekly recurring shift{shifts.length === 1 ? '' : 's'}. You can always adjust or add further shifts later from the{' '}
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
                  Employee enrolled successfully
                </h2>
                <p className="text-xs text-emerald-700">
                  {result.name} ({result.email}) has been enrolled as{' '}
                  <span className="font-semibold">{result.category}</span> with an active
                  account, scheduled for{' '}
                  {result.shifts?.length || 0} weekly recurring shift
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
                    showToast('Temporary password copied to clipboard.', 'success')
                  }}
                  className="h-8 px-3 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 cursor-pointer shrink-0"
                >
                  Copy
                </button>
              </div>
            ) : (
              <p className="text-xs text-emerald-700">
                The account is active — the employee can now sign in with their credentials.
              </p>
            )}
            <p className="text-2xs text-emerald-700/80">
              Share the temporary password securely — a copy has also been sent to the employee's Bicol University email address. The employee will be prompted to set their own password upon first sign-in.
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
