import StatusPill from './StatusPill.jsx'
import ScheduleShiftList from './ScheduleShiftList.jsx'
import OfficerRosterGrid from './OfficerRosterGrid.jsx'

/** Page header: title plus the Duty Requests and Assign Duty actions. */
export function ScheduleHeader({ onOpenDutyRequests, requestCount, onAssign }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
      <div>
        <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
          Student Officer Duty &amp; Shift Scheduler
        </h1>
        <p className="text-xs text-slate-500 font-normal mt-0.5">
          Educational Portal • Student Council Organization Management
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenDutyRequests}
          className="h-8 px-3 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-xs rounded-md border border-slate-200 flex items-center gap-2 transition-colors cursor-pointer"
        >
          <span>Duty Requests</span>
          {requestCount > 0 && (
            <span className="w-4 h-4 bg-brand-orange text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {requestCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={onAssign}
          className="h-8 px-3 bg-brand-orange hover:bg-brand-orange-dark text-white font-semibold text-xs rounded-md flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <span>Assign Duty</span>
        </button>
      </div>
    </div>
  )
}

/**
 * Staffing thresholds for the selected date (REQ-SS-03: VISIT needs 2 open
 * slots, CLAIM needs 1). No slots returned means the route is unverified.
 */
export function ThresholdBar({ slots, canEditAvailability, lockMessage }) {
  const openVisits = slots.filter((slot) => slot.type === 'VISIT' && slot.available).length
  const openClaims = slots.filter((slot) => slot.type === 'CLAIM' && slot.available).length
  const visitOk = slots.length > 0 && openVisits >= 2
  const claimOk = slots.length > 0 && openClaims >= 1
  const hasShortfall = slots.length > 0 && (!visitOk || !claimOk)

  return (
    <div className="bg-white rounded-lg p-3 border border-slate-200 flex flex-col sm:flex-row sm:items-center gap-3">
      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
        Staffing thresholds
      </span>
      <StatusPill
        status={`VISIT ≥2 · ${slots.length ? `${openVisits} open` : 'unverified'}`}
        variant={slots.length === 0 ? 'amber' : visitOk ? 'green' : 'red'}
      />
      <StatusPill
        status={`CLAIM ≥1 · ${slots.length ? `${openClaims} open` : 'unverified'}`}
        variant={slots.length === 0 ? 'amber' : claimOk ? 'green' : 'red'}
      />
      {hasShortfall && (
        <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
          ⚠ Shortfall — super admins notified (REQ-SS-03)
        </span>
      )}
      {!canEditAvailability && (
        <span className="text-xs font-semibold text-slate-500 ml-auto">{lockMessage}</span>
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

/** Section wrapper: the duty blocks the API returned, with the cancel action. */
export function ShiftBlocksSection({
  shifts,
  isLoading,
  error,
  busyId,
  onRetry,
  onCancel,
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
            Every block below is stored in duty_shift and read back from GET /shifts
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
        onCancel={onCancel}
      />
    </section>
  )
}

/** Section wrapper: the officer availability cards (REQ-SS-01). */
export function RosterSection({ roster, canEdit, filteredOfficers, onAssign, onToggleDuty }) {
  return (
    <section className="bg-white rounded-lg p-4 border border-slate-200 space-y-3">
      <div>
        <h2 className="text-sm font-bold text-slate-900">Officer Schedules &amp; Free Windows</h2>
        <p className="text-[11px] text-slate-400 font-normal mt-0.5">
          Manage in-store availability and assign shifts based on class schedules
        </p>
      </div>

      <OfficerRosterGrid
        officers={filteredOfficers}
        isLoading={roster.isLoading}
        error={roster.error}
        savingId={roster.savingId}
        canEdit={canEdit}
        onRetry={roster.reload}
        onAssign={onAssign}
        onToggleDuty={onToggleDuty}
      />
    </section>
  )
}
