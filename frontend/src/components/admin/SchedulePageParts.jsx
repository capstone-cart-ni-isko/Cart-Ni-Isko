import { useEffect, useMemo, useState } from 'react'
import ScheduleShiftList from './ScheduleShiftList.jsx'
import OfficerRosterGrid from './OfficerRosterGrid.jsx'
import StatusPill from './StatusPill.jsx'
import {
  MIN_WEEKLY_MINUTES,
  OPEN_HOUR,
  addDays,
  dayKey,
  fmtLongDate,
  fmtTime,
  humanMinutes,
  minutesBetween,
  minutesOf,
  pad,
  weekStartOf,
} from './scheduleTime.js'
import { fetchShifts } from '../../services/shifts.js'
import Modal from '../ui/Modal.jsx'

function InfoDialogButton({ title, subtitle, label = 'Info', children, visibleLabel = false }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label={visibleLabel ? undefined : `Info: ${title}`}
        title={title}
        className={`inline-flex h-7 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 cursor-pointer ${
          visibleLabel ? '' : 'w-7 px-0'
        }`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="11" x2="12" y2="16" />
          <circle cx="12" cy="7.5" r=".75" fill="currentColor" stroke="none" />
        </svg>
        {visibleLabel && <span>{label}</span>}
      </button>
      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={title} subtitle={subtitle} size="wide">
        {children}
      </Modal>
    </>
  )
}

export function ScheduleHeader({
  onOpenCovers,
  coverCount = 0,
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
      <div>
        <h1 className="page-title text-slate-900 dark:text-[var(--ink)]">
          Employee Scheduling
        </h1>
        <p className="text-xs text-slate-500 font-normal mt-0.5">
          Plan shifts, review coverage, and check current in-store status
        </p>
      </div>

      <div className="flex items-center gap-2">
        <InfoDialogButton
          title="How employee scheduling works"
          subtitle="Purpose, workflow, and the difference between planned shifts and live attendance."
          label="Info"
          visibleLabel
        >
          <div className="space-y-4 text-sm text-slate-600">
            <section className="space-y-1">
              <h3 className="font-bold text-slate-900">Purpose</h3>
              <p>Use this page to plan employee shifts, review coverage, and respond when an assigned employee needs a substitute.</p>
            </section>
            <section className="space-y-1">
              <h3 className="font-bold text-slate-900">Add a shift</h3>
              <p>Choose <strong>Add shift</strong>, select one or more employees, then set the date and start/end times. Times use 10-minute increments; the system prevents overlapping shifts and enforces the weekly minimum.</p>
            </section>
            <section className="space-y-1">
              <h3 className="font-bold text-slate-900">Review and edit</h3>
              <p>Use Day, Week, or Month to review the plan. In Day view, switch between Timeline and List. Select a shift to edit its time or cancel it. If a shift needs a substitute, review it under Pending Covers.</p>
            </section>
            <section className="space-y-1">
              <h3 className="font-bold text-slate-900">Scheduled shifts vs. attendance</h3>
              <p>Schedule coverage is based on assigned shift blocks. Live Attendance shows who is currently marked in or out of the store; it does not create a shift. Marking someone out can flag an in-progress shift for cover, but does not change future shifts.</p>
            </section>
          </div>
        </InfoDialogButton>
        <button
          type="button"
          onClick={onOpenCovers}
          className="h-8 px-3 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-xs rounded-md border border-slate-200 flex items-center gap-2 transition-colors cursor-pointer"
        >
          <span>Pending Covers</span>
          {coverCount > 0 && (
            <span className="w-4 h-4 bg-brand-orange text-white text-2xs font-bold rounded-full flex items-center justify-center">
              {coverCount}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}

/**
 * Staff view header. Staff do not plan the roster (rule 38), so the page is
 * framed around their own duty and the one thing they may change: flagging
 * their own shift as unavailable (FLOW-EMP_SCHED-04).
 */
export function StaffScheduleHeader() {
  const openLabel = fmtTime(`${pad(OPEN_HOUR)}:00`)

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
      <div>
        <h1 className="page-title text-slate-900 dark:text-[var(--ink)]">My Schedule</h1>
        <p className="text-xs text-slate-500 font-normal mt-0.5">
          See when you are on duty and who you are working with. Use Day, Week or Month to browse dates.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <InfoDialogButton
          title="Using your schedule"
          subtitle="What this page shows and what you can do here."
          label="How to use this page"
          visibleLabel
        >
          <div className="space-y-4 text-sm text-slate-600">
            <section className="space-y-1">
              <h3 className="font-bold text-slate-900">Your duty status</h3>
              <p>The <strong>My duty</strong> card tells you whether you are scheduled on the selected date, your shift times, your next shift, and your scheduled hours this week.</p>
            </section>
            <section className="space-y-1">
              <h3 className="font-bold text-slate-900">Browse dates</h3>
              <p>Switch between <strong>Day</strong>, <strong>Week</strong> and <strong>Month</strong>, use the arrows to move between dates, and select the date label to jump back to today. In Day view, <strong>Timeline</strong> and <strong>List</strong> show everyone on duty that day.</p>
            </section>
            <section className="space-y-1">
              <h3 className="font-bold text-slate-900">Can’t make a shift?</h3>
              <p>Select <strong>Can’t make it</strong> on your shift (or select your own shift on the schedule) and mark it unavailable. You can do this until the store opens at {openLabel} on that day. Admins are alerted so they can find a cover. After that time, contact an admin directly.</p>
            </section>
            <section className="space-y-1">
              <h3 className="font-bold text-slate-900">Clocking in and out</h3>
              <p>Use <strong>Clock In</strong> and <strong>Clock Out</strong> in the sidebar when your shift starts and ends.</p>
            </section>
            <section className="space-y-1">
              <h3 className="font-bold text-slate-900">Need a different schedule?</h3>
              <p>Shifts are assigned by admins. Ask an admin if you need a shift added, moved or changed.</p>
            </section>
          </div>
        </InfoDialogButton>
      </div>
    </div>
  )
}

const MY_STATUS_VARIANT = {
  ACTIVE: 'green',
  SCHEDULED: 'blue',
  'PENDING REPLACEMENT': 'amber',
}

const shortDay = (key) =>
  new Date(`${key}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

/**
 * "My duty": whether the signed-in employee is scheduled on the selected date,
 * their next shift, and this week's scheduled hours against the weekly minimum.
 * Reads GET /shifts filtered to the employee's own id - nothing is stored.
 */
export function MyDutySummary({
  selfEmpId,
  selectedDate,
  dayShifts = [],
  isLoading = false,
  error = '',
  canEdit = false,
  onOpenShift,
}) {
  const [myShifts, setMyShifts] = useState([])
  const today = new Date()
  const todayKey = dayKey(today)
  const weekStart = weekStartOf(today)
  const weekStartKey = dayKey(weekStart)
  const weekEndKey = dayKey(addDays(weekStart, 6))
  const rangeEndKey = dayKey(addDays(today, 60))

  // Re-read whenever the day's shifts change, so a shift flagged unavailable
  // here updates the next-shift and weekly figures straight away.
  useEffect(() => {
    if (selfEmpId == null) return undefined
    let cancelled = false
    fetchShifts({ emp_id: selfEmpId, date_from: weekStartKey, date_to: rangeEndKey })
      .then((rows) => {
        if (!cancelled) setMyShifts(Array.isArray(rows) ? rows : [])
      })
      .catch(() => {
        if (!cancelled) setMyShifts([])
      })
    return () => {
      cancelled = true
    }
  }, [selfEmpId, weekStartKey, rangeEndKey, dayShifts])

  const mine = useMemo(
    () => dayShifts.filter((shift) => String(shift.emp_id) === String(selfEmpId)),
    [dayShifts, selfEmpId]
  )
  const onDuty = mine.filter((shift) => !shift.unavailable)
  const isSelectedToday = dayKey(selectedDate) === todayKey

  const nowMinutes = today.getHours() * 60 + today.getMinutes()
  const nextShift = myShifts.find(
    (shift) =>
      !shift.unavailable &&
      (shift.shift_date > todayKey ||
        (shift.shift_date === todayKey && (minutesOf(shift.shift_end) ?? 0) > nowMinutes))
  )
  const weekMinutes = myShifts
    .filter((shift) => !shift.unavailable && shift.shift_date >= weekStartKey && shift.shift_date <= weekEndKey)
    .reduce((sum, shift) => sum + minutesBetween(shift.shift_start, shift.shift_end), 0)
  const weekProgress = Math.min(100, Math.round((weekMinutes / MIN_WEEKLY_MINUTES) * 100))

  let tone = 'neutral'
  let headline = `You are not scheduled on ${isSelectedToday ? 'today' : fmtLongDate(selectedDate)}`
  let detail = 'No shift for today.'
  if (onDuty.some((shift) => shift.status === 'ACTIVE')) {
    tone = 'active'
    headline = 'You are on duty right now'
    detail = 'Remember to Clock In from the sidebar if you have not yet.'
  } else if (onDuty.length > 0) {
    tone = 'scheduled'
    headline = `You are scheduled ${isSelectedToday ? 'today' : `on ${fmtLongDate(selectedDate)}`}`
    detail = onDuty.length > 1 ? `${onDuty.length} shifts on this date.` : 'One shift on this date.'
  } else if (mine.length > 0) {
    tone = 'away'
    headline = 'You marked yourself unavailable'
    detail = 'Admins have been alerted to find a cover for this shift.'
  }

  const toneClasses = {
    neutral: 'bg-slate-100 text-slate-500',
    scheduled: 'bg-blue-50 text-blue-600',
    active: 'bg-emerald-50 text-emerald-600',
    away: 'bg-amber-50 text-amber-600',
  }

  return (
    <section className="bg-white rounded-lg p-4 border border-slate-200 space-y-3">
      <div>
        <h2 className="text-sm font-bold text-slate-900">My duty</h2>
        <p className="text-2xs text-slate-400 mt-0.5">{fmtLongDate(selectedDate)}</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        {/* Selected-date status */}
        <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3">
          {isLoading ? (
            <p className="text-xs text-slate-400">Checking your schedule…</p>
          ) : error ? (
            <p className="text-xs font-semibold text-rose-600">Your schedule could not be loaded. Try again shortly.</p>
          ) : (
            <div className="flex items-start gap-3">
              <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${toneClasses[tone]}`} aria-hidden="true">
                {tone === 'neutral' ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                ) : tone === 'away' ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    <circle cx="12" cy="12" r="9" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <circle cx="12" cy="16" r=".75" fill="currentColor" stroke="none" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" className="w-4 h-4">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </span>
              <div className="min-w-0 flex-1 space-y-2">
                <div>
                  <p className="text-sm font-bold text-slate-900">{headline}</p>
                  <p className="text-xs text-slate-500">{detail}</p>
                </div>
                {mine.length > 0 && (
                  <ul className="space-y-1.5">
                    {mine.map((shift) => {
                      const canFlag =
                        canEdit && !shift.unavailable && shift.status === 'SCHEDULED' && typeof onOpenShift === 'function'
                      return (
                        <li
                          key={shift.shift_id}
                          className="flex flex-wrap items-center gap-2 rounded-md bg-white border border-slate-200 px-2.5 py-1.5"
                        >
                          <span className="text-xs font-semibold text-slate-900 tabular-nums">
                            {fmtTime(shift.shift_start)} – {fmtTime(shift.shift_end)}
                          </span>
                          <StatusPill
                            status={shift.unavailable ? 'Unavailable' : shift.status === 'PENDING REPLACEMENT' ? 'Needs cover' : shift.status}
                            variant={shift.unavailable ? 'amber' : MY_STATUS_VARIANT[shift.status]}
                          />
                          {canFlag && (
                            <button
                              type="button"
                              onClick={() => onOpenShift(shift)}
                              className="ml-auto h-7 px-2.5 rounded-md border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                            >
                              Can’t make it
                            </button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Next shift */}
        <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3">
          <p className="text-2xs font-semibold text-slate-500">Next shift</p>
          {nextShift ? (
            <>
              <p className="mt-0.5 text-sm font-bold text-slate-900">
                {nextShift.shift_date === todayKey ? 'Today' : shortDay(nextShift.shift_date)}
              </p>
              <p className="text-xs text-slate-500 tabular-nums">
                {fmtTime(nextShift.shift_start)} – {fmtTime(nextShift.shift_end)}
              </p>
            </>
          ) : (
            <>
              <p className="mt-0.5 text-sm font-bold text-slate-900">None yet</p>
              <p className="text-xs text-slate-500">No upcoming shifts in the next 60 days.</p>
            </>
          )}
        </div>

        {/* This week */}
        <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3">
          <p className="text-2xs font-semibold text-slate-500">This week</p>
          <p className="mt-0.5 text-sm font-bold text-slate-900 tabular-nums">{humanMinutes(weekMinutes)} scheduled</p>
          <div className="mt-1.5 h-1.5 rounded-full bg-slate-200 overflow-hidden" aria-hidden="true">
            <div className="h-full rounded-full bg-brand-orange" style={{ width: `${weekProgress}%` }} />
          </div>
          <p className="mt-1 text-2xs text-slate-500">
            Weekly minimum: {humanMinutes(MIN_WEEKLY_MINUTES)}
          </p>
        </div>
      </div>
    </section>
  )
}

export function ScheduleCoverageSummary({
  shifts = [],
  dateLabel,
  isLoading = false,
  error = '',
}) {
  const plannedShifts = shifts.filter((shift) => !shift.unavailable)
  const plannedEmployees = new Set(plannedShifts.map((shift) => String(shift.emp_id))).size
  const plannedMinutes = plannedShifts.reduce(
    (sum, shift) =>
      sum + Math.max(0, (minutesOf(shift.shift_end) ?? 0) - (minutesOf(shift.shift_start) ?? 0)),
    0
  )
  const needsCover = shifts.filter((shift) => shift.status === 'PENDING REPLACEMENT').length

  return (
    <section className="bg-white rounded-lg p-4 border border-slate-200 space-y-3">
      <div className="flex items-center gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Scheduled coverage</h2>
          <p className="text-2xs text-slate-400 mt-0.5">
            {dateLabel}
          </p>
        </div>
        <InfoDialogButton
          title="About scheduled coverage"
          subtitle="How the figures for this date are calculated."
        >
          <div className="space-y-2 text-sm text-slate-600">
            <p>These figures come from the shift blocks assigned to the selected date. An employee with multiple blocks counts once in the employee total.</p>
            <p>Unavailable shifts are excluded from planned hours. Needs cover reflects shifts the system marks as pending replacement, such as explicitly unavailable blocks or an in-progress shift whose employee is out of store.</p>
            <p>Live in-store status is shown separately below and does not add planned hours.</p>
          </div>
        </InfoDialogButton>
      </div>

      {isLoading ? (
        <p className="text-xs text-slate-400">Loading the selected date’s schedule…</p>
      ) : error ? (
        <p className="text-xs font-semibold text-rose-600">Coverage could not be calculated because the schedule did not load.</p>
      ) : shifts.length === 0 ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-3">
          <p className="text-xs font-medium text-amber-800">
            No shifts are scheduled for this date yet.
          </p>
          <p className="text-xs text-amber-800">Use <strong>Add shift</strong> above to assign employees.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: 'Assigned shifts', value: shifts.length },
            { label: 'Employees scheduled', value: plannedEmployees },
            { label: 'Planned hours', value: humanMinutes(plannedMinutes) },
            { label: 'Needs cover', value: needsCover },
          ].map((item) => (
            <div key={item.label} className="rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2">
              <p className="text-2xs font-semibold text-slate-500">{item.label}</p>
              <p className={`mt-0.5 text-sm font-bold ${item.label === 'Needs cover' && needsCover > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
                {item.value}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/** All / In Store / Out of Store filter pills for the attendance cards. */
export function FilterPills({ activeFilter, total, inStoreCount, outOfStoreCount, onChange }) {
  const pills = [
    { key: 'all', label: `All (${total})`, active: 'bg-brand-orange text-white' },
    { key: 'in-store', label: `In Store (${inStoreCount})`, active: 'bg-emerald-600 text-white' },
    { key: 'out-of-store', label: `Out of Store (${outOfStoreCount})`, active: 'bg-rose-600 text-white' },
  ]

  return (
    <div className="flex items-center gap-1.5">
      {pills.map((pill) => (
        <button
          key={pill.key}
          type="button"
          onClick={() => onChange(pill.key)}
          className={`h-7 px-2.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
            activeFilter === pill.key ? pill.active : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          {pill.label}
        </button>
      ))}
    </div>
  )
}

/** Section wrapper: the duty blocks the API returned, with the block actions. */
export function ShiftBlocksSection({
  shifts,
  isLoading,
  error,
  busyId,
  onRetry,
  onEdit,
  onCancel,
  canEdit = true,
}) {
  return (
    <ScheduleShiftList
      shifts={shifts}
      isLoading={isLoading}
      error={error}
      busyId={busyId}
      onRetry={onRetry}
      onEdit={canEdit ? onEdit : null}
      onCancel={canEdit ? onCancel : null}
    />
  )
}

/** Current in-store status, separate from the selected date's shift plan. */
export function RosterSection({
  roster,
  canEdit,
  filteredOfficers,
  activeFilter,
  onFilterChange,
  onToggleDuty,
  canManageOthers = true,
  selfEmpId = null,
}) {
  return (
    <section className="bg-white rounded-lg p-4 border border-slate-200 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-start gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Live Attendance</h2>
            <p className="text-2xs text-slate-400 font-normal mt-0.5">
              {canEdit
                ? 'Current in-store status'
                : 'Attendance changes are locked after opening time; a super admin can override'}
            </p>
          </div>
          <InfoDialogButton
            title="About live attendance"
            subtitle="These controls update current employee in-store status."
          >
            <div className="space-y-2 text-sm text-slate-600">
              <p>Live Attendance shows whether an employee is currently marked in or out of the store. Changing this status does not create, edit, or cancel a shift.</p>
              <p>Marking an employee out of the store can flag their in-progress shift as needing cover. Future shifts stay scheduled; use the shift editor to mark a future block unavailable when a substitute is needed.</p>
              <p>Use the sidebar’s Clock In or Clock Out controls for an employee to update their own status during a shift.</p>
            </div>
          </InfoDialogButton>
        </div>
        <FilterPills
          activeFilter={activeFilter}
          total={roster.officers.length}
          inStoreCount={roster.inStoreCount}
          outOfStoreCount={roster.outOfStoreCount}
          onChange={onFilterChange}
        />
      </div>

      <OfficerRosterGrid
        officers={filteredOfficers}
        isLoading={roster.isLoading}
        error={roster.error}
        savingId={roster.savingId}
        canEdit={canEdit}
        canManageOthers={canManageOthers}
        selfEmpId={selfEmpId}
        onRetry={roster.reload}
        onToggleDuty={onToggleDuty}
      />
    </section>
  )
}
