/*
  Today's duty roster. Everyone with a shift today is listed, on-shift-now
  first. The dot shows whether the person is clocked in (emp_instore). Staff
  can clock themselves in or out; a super admin can do it for anyone, which
  mirrors what PUT /accounts/update allows.
*/
export default function OnDutyWidget({ roster = [], currentEmpId, canManageAll = false, pendingIds = [], onToggleClock }) {
  if (roster.length === 0) {
    return (
      <p className="h-full flex items-center justify-center text-xs text-slate-400 text-center px-4">
        Nobody is scheduled today. Assign shifts from the Schedule page.
      </p>
    )
  }

  return (
    <ul className="h-full overflow-auto space-y-1.5 pb-4 [mask-image:linear-gradient(to_bottom,black_calc(100%-20px),transparent)]">
      {roster.map((staff) => {
        const isSelf = Number(currentEmpId) === staff.empId
        const canToggle = isSelf || canManageAll
        const pending = pendingIds.includes(staff.empId)
        return (
          <li key={staff.empId} className="flex items-center gap-2.5 p-2 rounded-md border border-slate-100 bg-slate-50/60">
            <span className="relative w-8 h-8 rounded-full bg-slate-200 text-slate-700 text-[11px] font-semibold flex items-center justify-center shrink-0">
              {staff.avatar}
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${staff.clockedIn ? 'bg-emerald-500' : 'bg-slate-300'}`}
                title={staff.clockedIn ? 'Clocked in' : 'Clocked out'}
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-900 truncate">
                {staff.name}
                {isSelf && <span className="ml-1 font-normal text-slate-400">(you)</span>}
              </p>
              <p className="text-[11px] text-slate-500 truncate">
                {staff.timeSlot}
                {staff.onShiftNow ? ' · on shift now' : ''}
              </p>
              {staff.pendingReplacement && (
                <p className="text-[10px] font-semibold text-orange-600">Pending replacement</p>
              )}
            </div>
            {canToggle ? (
              <button
                type="button"
                onClick={() => onToggleClock?.(staff.empId, !staff.clockedIn)}
                disabled={pending}
                aria-label={`${staff.clockedIn ? 'Clock out' : 'Clock in'} ${staff.name}`}
                className={`h-8 px-2.5 rounded-md text-[11px] font-semibold border transition-colors cursor-pointer disabled:opacity-50 shrink-0 ${
                  staff.clockedIn
                    ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                    : 'bg-slate-900 border-slate-900 text-white hover:bg-slate-700'
                }`}
              >
                {pending ? '…' : staff.clockedIn ? 'Clock out' : 'Clock in'}
              </button>
            ) : (
              <span className="text-[11px] font-medium text-slate-500 shrink-0">
                {staff.clockedIn ? 'In store' : 'Not in'}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
