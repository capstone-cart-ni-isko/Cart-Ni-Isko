/**
 * View-mode toggle plus the date navigator. Pure presentation: the page owns
 * the selected date and the view mode.
 *
 * FLOW-EMP_SCHED-01..02 offer the three calendar layouts the schedule calendar
 * needs - Day, Week (FLOW-EMP_SCHED-02) and Month (the REQ-SS-03 staffing
 * overview) - so the stepping buttons say which unit they move in.
 */
export default function ScheduleToolbar({
  viewMode,
  dateLabel,
  isToday,
  onViewChange,
  onShiftDate,
  onToday,
}) {
  const isWeek = viewMode === 'Week'
  const isMonth = viewMode === 'Month'
  const unit = isMonth ? 'month' : isWeek ? 'week' : 'day'

  return (
    <div className="bg-white rounded-lg p-3 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
      <div className="flex bg-slate-100 p-0.5 rounded-md border border-slate-200/60">
        {['Day', 'Week', 'Month'].map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onViewChange(tab)}
            aria-current={viewMode === tab ? 'page' : undefined}
            className={`h-7 px-3 rounded text-xs font-semibold transition-all cursor-pointer ${
              viewMode === tab ? 'bg-brand-orange text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onShiftDate(-1)}
          aria-label={`Previous ${unit}`}
          className="w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 hover:bg-slate-50 text-slate-500 cursor-pointer"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <button
          type="button"
          onClick={() => onToday?.()}
          title="Jump to today"
          className="px-2.5 py-1 bg-slate-50 hover:bg-slate-100 rounded-md text-xs font-semibold text-slate-900 border border-slate-200 cursor-pointer"
        >
          {isToday ? 'Today: ' : ''}
          {dateLabel}
        </button>

        <button
          type="button"
          onClick={() => onShiftDate(1)}
          aria-label={`Next ${unit}`}
          className="w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 hover:bg-slate-50 text-slate-500 cursor-pointer"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  )
}
