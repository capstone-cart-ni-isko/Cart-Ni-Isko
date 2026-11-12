import StatusPill from './StatusPill.jsx'
import Avatar from '../ui/Avatar.jsx'
import SkeletonBlock from '../ui/SkeletonBlock.jsx'

/**
 * Live employee attendance cards. These show current emp_instore state, not
 * whether a shift exists on the selected schedule date.
 */
export default function OfficerRosterGrid({
  officers = [],
  isLoading = false,
  error = '',
  savingId = null,
  canEdit = true,
  // Rule 38: only admins and super admins change ANOTHER employee's
  // availability; everyone else keeps their own card (FLOW-EMP_SCHED-04).
  canManageOthers = true,
  selfEmpId = null,
  onRetry,
  onToggleDuty,
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3" aria-hidden="true">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="p-4 rounded-lg border border-slate-200 bg-white flex flex-col justify-between space-y-3"
          >
            <div className="flex items-center gap-3">
              <SkeletonBlock className="w-9 h-9 rounded-full shrink-0" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <SkeletonBlock className="h-3.5 w-3/4 rounded" />
                <SkeletonBlock className="h-2.5 w-1/2 rounded" />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <SkeletonBlock className="h-6 w-20 rounded-md" />
            </div>

            <div className="space-y-1.5 pt-2">
              <SkeletonBlock className="h-8 w-full rounded-md" />
            </div>
          </div>
        ))}
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
          canManageOthers || (selfEmpId != null && String(officer.id) === String(selfEmpId))

        return (
          <div
            key={officer.id}
            className="p-4 rounded-lg border border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm transition-all flex flex-col justify-between space-y-3"
          >
            <div className="flex items-center gap-3">
              <Avatar name={officer.name} userId={officer.id} size={36} />
              <div className="min-w-0">
                <p className="font-bold text-slate-900 text-xs truncate">{officer.name}</p>
                <p className="text-2xs text-slate-500 font-semibold truncate">
                  {officer.roleLabel}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <StatusPill
                status={officer.available ? 'In Store' : 'Out of Store'}
                variant={officer.available ? 'green' : undefined}
              />
            </div>

            <div className="space-y-1.5">
              {canToggleOfficer ? (
                <button
                  type="button"
                  onClick={() => onToggleDuty(officer, !officer.available)}
                  disabled={isSaving || !canEdit}
                  className={`w-full py-2 font-bold text-xs rounded-md border transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
                    officer.available
                      ? 'bg-white hover:bg-brand-orange hover:text-white text-slate-700 border-slate-200'
                      : 'bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-700 border-emerald-200'
                  }`}
                >
                  {isSaving ? 'Saving…' : officer.available ? 'Mark Out of Store' : 'Mark In Store'}
                </button>
              ) : (
                <p className="text-2xs text-slate-400 font-semibold text-center">
                  Only this employee or an admin can change this status.
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
