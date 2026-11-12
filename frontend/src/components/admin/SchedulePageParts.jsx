import { useState } from 'react'
import ScheduleShiftList from './ScheduleShiftList.jsx'
import OfficerRosterGrid from './OfficerRosterGrid.jsx'
import { humanMinutes, minutesOf } from './scheduleTime.js'
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
          label="Info & how-to"
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
