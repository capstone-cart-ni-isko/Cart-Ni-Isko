import StatusPill from './StatusPill.jsx'
import ScheduleShiftList from './ScheduleShiftList.jsx'
import OfficerRosterGrid from './OfficerRosterGrid.jsx'
import { humanMinutes, minutesOf } from './scheduleTime.js'

/**
 * Page header: title plus the Pending Covers action.
 *
 * There is deliberately NO "assign duty" button here: adding or removing an
 * employee's duty dates and times is done from the employee list itself (the
 * "+ Assign Shift" action on every officer card, and the block editor behind
 * each block), which is the single place the SRS points at for that change
 * (FLOW-EMP_SCHED-03/04). Enrollment carries its own schedule, so a
 * date-less assign action on the page header was only ever a second, weaker
 * copy of the per-employee one.
 */
export function ScheduleHeader({
  onOpenCovers,
  coverCount = 0,
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
      <div>
        <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
          Employee Scheduling
        </h1>
        <p className="text-xs text-slate-500 font-normal mt-0.5">
          Tindahan ni Isko · preschedule duty blocks and manage in-store availability
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenCovers}
          className="h-8 px-3 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-xs rounded-md border border-slate-200 flex items-center gap-2 transition-colors cursor-pointer"
        >
          <span>Pending Covers</span>
          {coverCount > 0 && (
            <span className="w-4 h-4 bg-brand-orange text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {coverCount}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}

/**
 * Staffing headcount for the selected date (REQ-AB-03 / REQ-SS-03: both a
 * VISIT and a CLAIM slot need at least one in-store employee - rule 10). The
 * count is the roster's own blocks, so it is the number the schedule calendar
 * gates on. Empty slots means the calendar route is unverified, so nothing is
 * claimed either way.
 */
export function ThresholdBar({
  slots = [],
  officers = [],
  shifts = [],
  canEditAvailability = true,
  lockMessage = '',
}) {
  const rostered = officers.filter((officer) => officer.available)

  // The headcount a block of the day reports: how many DISTINCT in-store
  // employees hold a block that is not flagged unavailable
  // (FLOW-EMP_SCHED-04). One employee with two blocks is still one body.
  const staffedBlocks = shifts.filter((shift) => !shift.unavailable)
  const headcount = staffedBlocks.length > 0
    ? new Set(staffedBlocks.map((shift) => String(shift.emp_id))).size
    : rostered.length
  const rosteredMinutes = rostered.reduce(
    (sum, officer) => sum + shiftMinutesFor(shifts, officer),
    0
  )

  const openVisits = slots.filter((slot) => slot.type === 'VISIT' && slot.available).length
  const openClaims = slots.filter((slot) => slot.type === 'CLAIM' && slot.available).length
  // Rule 10: the pickup and visit thresholds are identical - one or more
  // employees prescheduled in the timeslot, never a headcount difference.
  const visitOk = slots.length > 0 && openVisits >= 1
  const claimOk = slots.length > 0 && openClaims >= 1
  const hasShortfall = slots.length > 0 && (!visitOk || !claimOk)

  return (
    <div className="bg-white rounded-lg p-3 border border-slate-200 flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
        Staffing thresholds
      </span>

      <StatusPill
        status={`VISIT needs 1 · ${slots.length ? `${openVisits} open` : 'no slots loaded'}`}
        variant={slots.length === 0 ? 'amber' : visitOk ? 'green' : 'red'}
      />
      <StatusPill
        status={`CLAIM needs 1 · ${slots.length ? `${openClaims} open` : 'no slots loaded'}`}
        variant={slots.length === 0 ? 'amber' : claimOk ? 'green' : 'red'}
      />

      <StatusPill
        status={`In-store today: ${headcount} of ${officers.length}`}
        variant={headcount >= 2 ? 'green' : headcount >= 1 ? 'amber' : 'red'}
      />
      <StatusPill
        status={`Rostered: ${humanMinutes(rosteredMinutes)}`}
        variant={rosteredMinutes > 0 ? 'blue' : 'amber'}
      />

      {hasShortfall && (
        <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
          ⚠ Shortfall — super admins notified (REQ-SS-03)
        </span>
      )}
      {!canEditAvailability && (
        <span className="text-xs font-semibold text-slate-500 sm:ml-auto">{lockMessage}</span>
      )}
    </div>
  )
}

/** All / On Duty / Off Duty filter pills for the officer grid. */
export function FilterPills({ activeFilter, total, onDutyCount, offDutyCount, onChange }) {
  const pills = [
    { key: 'all', label: `All (${total})`, active: 'bg-brand-orange text-white' },
    { key: 'available', label: `On Duty (${onDutyCount})`, active: 'bg-emerald-600 text-white' },
    { key: 'conflict', label: `Off Duty (${offDutyCount})`, active: 'bg-rose-600 text-white' },
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
  totalCount,
  activeFilter,
  onDutyCount,
  offDutyCount,
  onFilterChange,
}) {
  return (
    <section className="bg-white rounded-lg p-4 border border-slate-200 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Assigned Duty Blocks</h2>
          <p className="text-[11px] text-slate-400 font-normal mt-0.5">
            Every block below is read back from GET /shifts · click one to amend or flag it
            unavailable
          </p>
        </div>
        <FilterPills
          activeFilter={activeFilter}
          total={totalCount}
          onDutyCount={onDutyCount}
          offDutyCount={offDutyCount}
          onChange={onFilterChange}
        />
      </div>

      <ScheduleShiftList
        shifts={shifts}
        isLoading={isLoading}
        error={error}
        busyId={busyId}
        onRetry={onRetry}
        onEdit={canEdit ? onEdit : null}
        onCancel={canEdit ? onCancel : null}
      />
    </section>
  )
}

/** Section wrapper: the officer availability cards (REQ-SS-01). */
export function RosterSection({
  roster,
  canEdit,
  filteredOfficers,
  shifts = [],
  onAssign,
  onToggleDuty,
  canAssign = true,
  selfEmpId = null,
}) {
  return (
    <section className="bg-white rounded-lg p-4 border border-slate-200 space-y-3">
      <div>
        <h2 className="text-sm font-bold text-slate-900">Officer Availability</h2>
        <p className="text-[11px] text-slate-400 font-normal mt-0.5">
          REQ-SS-01: every active employee is prescheduled available until they log a conflict ·
          {roster.onDutyCount} in store, {roster.offDutyCount} out
        </p>
      </div>

      <OfficerRosterGrid
        officers={filteredOfficers}
        shifts={shifts}
        isLoading={roster.isLoading}
        error={roster.error}
        savingId={roster.savingId}
        canEdit={canEdit}
        canAssign={canAssign}
        selfEmpId={selfEmpId}
        onRetry={roster.reload}
        onAssign={onAssign}
        onToggleDuty={onToggleDuty}
      />
    </section>
  )
}

/** Minutes one officer holds on the selected date, ignoring unavailable blocks. */
function shiftMinutesFor(shifts, officer) {
  return shifts
    .filter((shift) => String(shift.emp_id) === String(officer.id) && !shift.unavailable)
    .reduce(
      (sum, shift) =>
        sum + Math.max(0, (minutesOf(shift.shift_end) ?? 0) - (minutesOf(shift.shift_start) ?? 0)),
      0
    )
}
