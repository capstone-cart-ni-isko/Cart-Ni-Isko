import StatusPill from './StatusPill.jsx'

/**
 * Officer availability cards (REQ-SS-01). On Duty / Off Duty writes emp_instore
 * through the parent, which talks to the API — the card holds no shift state.
 */
export default function OfficerRosterGrid({
  officers = [],
  isLoading = false,
  error = '',
  savingId = null,
  canEdit = true,
  onRetry,
  onAssign,
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

        return (
          <div
            key={officer.id}
            className="p-4 rounded-2xl border border-gray-100 bg-gray-50/50 hover:bg-white hover:shadow-sm hover:border-gray-200 transition-all flex flex-col justify-between space-y-3"
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-xs shrink-0 ${officer.avatarColor}`}
              >
                {officer.initials}
              </div>
              <div className="min-w-0">
                <p className="font-black text-gray-900 text-xs truncate">{officer.name}</p>
                <p className="text-[10px] text-gray-500 font-semibold truncate">
                  {officer.roleLabel}
                </p>
              </div>
            </div>

            <div className="py-1">
              <StatusPill status={officer.availability} />
            </div>

            <div className="space-y-1.5">
              {officer.available ? (
                <button
                  type="button"
                  onClick={() => onAssign(officer)}
                  disabled={isSaving}
                  className="w-full py-2 bg-white hover:bg-brand-orange hover:text-white text-gray-700 font-bold text-xs rounded-xl border border-gray-200 shadow-2xs transition-all disabled:opacity-50 cursor-pointer"
                >
                  + Assign Shift
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onToggleDuty(officer, true)}
                  disabled={isSaving || !canEdit}
                  className="w-full py-2 bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-700 font-bold text-xs rounded-xl border border-emerald-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isSaving ? 'Saving…' : 'Mark On Duty'}
                </button>
              )}

              {officer.available && (
                <button
                  type="button"
                  onClick={() => onToggleDuty(officer, false)}
                  disabled={isSaving || !canEdit}
                  className="w-full py-1 text-[10px] font-semibold text-slate-400 hover:text-rose-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isSaving ? 'Saving…' : 'Mark Off Duty'}
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
