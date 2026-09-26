/** The three time columns the timeline shows. */
const TIME_SLOTS = ['7:00 AM', '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM']

/**
 * Day / Week / Month toggle plus the date navigator. Pure presentation: the
 * page owns the selected date and the view mode.
 */
export default function ScheduleToolbar({ viewMode, dateLabel, isToday, onViewChange, onShiftDate }) {
  return (
    <div className="bg-white rounded-lg p-3 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
      <div className="flex bg-slate-100 p-0.5 rounded-md border border-slate-200/60">
        {['Day', 'Week', 'Month'].map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onViewChange(tab)}
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
          aria-label="Previous day"
          className="w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 hover:bg-slate-50 text-slate-500 cursor-pointer"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span className="px-2.5 py-1 bg-slate-50 rounded-md text-xs font-semibold text-slate-900 border border-slate-200">
          {isToday ? 'Today: ' : ''}
          {dateLabel}
        </span>
        <button
          type="button"
          onClick={() => onShiftDate(1)}
          aria-label="Next day"
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

export { TIME_SLOTS }
