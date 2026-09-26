import StatusPill from './StatusPill.jsx'

// Status is derived by the API (duty_shift has no status column), so the pill
// colour only needs the keyword. COMPLETED keeps StatusPill's default grey.
const STATUS_VARIANT = {
  ACTIVE: 'green',
  SCHEDULED: 'blue',
  'PENDING REPLACEMENT': 'amber',
}

/**
 * The duty blocks the API returned for the selected date, with the cancel
 * action (DELETE /shifts/{id}). Nothing is stored locally, so a reload always
 * repaints from the server.
 */
export default function ScheduleShiftList({
  shifts = [],
  isLoading = false,
  error = '',
  busyId = null,
  onRetry,
  onCancel,
}) {
  if (isLoading) {
    return (
      <div className="py-8 text-center text-xs font-semibold text-slate-500 flex items-center justify-center gap-2">
        <span className="spinner-circle !w-3.5 !h-3.5" /> Loading duty blocks…
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

  if (shifts.length === 0) {
    return (
      <p className="py-8 text-center text-xs text-slate-400">
        No duty blocks assigned for this date yet.
      </p>
    )
  }

  return (
    <div className="divide-y divide-slate-100">
      {shifts.map((shift) => (
        <div
          key={shift.shift_id}
          className="py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 justify-between"
        >
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-900 truncate">
              {shift.employee_name || `Employee #${shift.emp_id}`}
              <span className="font-semibold text-slate-500">
                {' '}
                · {shift.shift_type}
              </span>
            </p>
            <p className="text-[11px] text-slate-500">
              {shift.shift_start} – {shift.shift_end}
              {shift.shift_location ? ` · ${shift.shift_location}` : ''}
              {' · block #'}
              {shift.shift_id}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <StatusPill status={shift.status} variant={STATUS_VARIANT[shift.status]} />
            <button
              type="button"
              onClick={() => onCancel(shift)}
              disabled={busyId === shift.shift_id}
              className="h-7 px-2.5 rounded-md text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-600 hover:text-white transition-colors disabled:opacity-50 cursor-pointer"
            >
              {busyId === shift.shift_id ? 'Cancelling…' : 'Cancel'}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
