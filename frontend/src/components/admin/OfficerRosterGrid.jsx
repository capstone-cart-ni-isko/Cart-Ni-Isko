import StatusPill from './StatusPill.jsx'
import { fmtTime } from './scheduleTime.js'

/**
 * Officer availability cards (REQ-SS-01). On Duty / Off Duty writes emp_instore
 * through the parent, which talks to the API — the card holds no shift state;
 * the blocks it lists for the day come straight from GET /shifts.
 */
export default function OfficerRosterGrid({
  officers = [],
  shifts = [],
  isLoading = false,
  error = '',
  savingId = null,
  canEdit = true,
  // Rule 38: only admins and super admins change ANOTHER employee's
  // availability; everyone else keeps their own card (FLOW-EMP_SCHED-04).
  canAssign = true,
  selfEmpId = null,
  onRetry,
  onAssign,
  onEditShift,
  onToggleDuty,
}) {
  if (isLoading) {
    return (
      <div className="py-10 text-center text-xs font-semibold text-slate-500 flex items-center justify-center gap-2">
        <span className="spinner-circle !w-3.5 !h-3.5" /> Loading employees…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-md px-3 py-2">
        <p className="text-xs font-semibold text-red-700">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="text-xs font-bold text-red-700 border border-red-300 rounded-md px-2 py-1 hover:bg-red-100 cursor-pointer"
        >
          Retry
        </button>
      </div>
    )
  }

  if (officers.length === 0) {
    return <div className="py-10 text-center text-xs text-slate-400">No employee accounts found.</div>
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {officers.map((officer) => {
        const isSaving = savingId === officer.id
        // Rule 38 / FLOW-EMP_SCHED-04: an admin may change anyone's
        // availability, everybody else only their own card.
        const canToggleOfficer =
          canAssign || (selfEmpId != null && String(officer.id) === String(selfEmpId))

        const blocks = shifts
          .filter(
            (shift) =>
              String(shift.emp_id) === String(officer.id) &&
              (shift.status === 'SCHEDULED' || shift.status === 'ACTIVE' || shift.status === 'PENDING REPLACEMENT')
          )
          .sort((a, b) => String(a.shift_start).localeCompare(String(b.shift_start)))

        return (
          <div
            key={officer.id}
            className="p-4 rounded-lg border border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm transition-all flex flex-col justify-between space-y-3"
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                  officer.avatarColor || 'bg-slate-100 text-slate-600'
                }`}
              >
                {officer.initials}
              </div>
              <div className="min-w-0">
                <p className="font-bold text-slate-900 text-xs truncate">{officer.name}</p>
                <p className="text-[10px] text-slate-500 font-semibold truncate">
                  {officer.roleLabel}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <StatusPill status={officer.availability} />
              {!officer.available && (
                <span className="text-[10px] font-semibold text-slate-400">
                  Needs a substitute
                </span>
              )}
            </div>

            {blocks.length > 0 && (
              <ul className="space-y-1">
                {blocks.map((block) => (
                  <li key={block.shift_id}>
                    <button
                      type="button"
                      onClick={() => canEdit && onEditShift && onEditShift(block)}
                      disabled={!canEdit || !onEditShift}
                      className={`w-full text-left rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors disabled:cursor-default ${
                        block.unavailable
                          ? 'bg-slate-50 border-slate-200 text-slate-400'
                          : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
                      }`}
                    >
                      <span className={block.unavailable ? 'line-through' : undefined}>
                        {fmtTime(block.shift_start)} – {fmtTime(block.shift_end)}
                      </span>
                      <span className="ml-1 font-normal opacity-70">
                        {block.unavailable ? 'unavailable' : `#${block.shift_id}`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-1.5">
              {canAssign ? (
                <button
                  type="button"
                  onClick={() => onAssign(officer)}
                  disabled={isSaving || !canEdit}
                  className="w-full py-2 bg-white hover:bg-brand-orange hover:text-white text-slate-700 font-bold text-xs rounded-md border border-slate-200 transition-all disabled:opacity-50 cursor-pointer"
                >
                  + Assign Shift
                </button>
              ) : (
                <p className="text-[10px] text-slate-400 font-semibold text-center py-2">
                  Only an admin can schedule this employee.
                </p>
              )}

              {officer.available ? (
                <button
                  type="button"
                  onClick={() => onToggleDuty(officer, false)}
                  disabled={isSaving || !canEdit || !canToggleOfficer}
                  title={
                    canToggleOfficer
                      ? 'Mark this employee out of the store. Their shifts will need a substitute.'
                      : 'Only this employee or an admin can change their availability.'
                  }
                  className="w-full py-1 text-[10px] font-semibold text-slate-500 hover:text-rose-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isSaving ? 'Saving…' : 'Mark Off Duty'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onToggleDuty(officer, true)}
                  disabled={isSaving || !canEdit || !canToggleOfficer}
                  title={
                    canToggleOfficer
                      ? 'Mark this employee back in the store.'
                      : 'Only this employee or an admin can change their availability.'
                  }
                  className="w-full py-2 bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-700 font-bold text-xs rounded-md border border-emerald-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isSaving ? 'Saving…' : 'Mark On Duty'}
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
