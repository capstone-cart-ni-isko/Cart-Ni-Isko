import {
  CLOSE_HOUR,
  HOUR_LABELS,
  OPEN_HOUR,
  fmtTime,
  minutesOf,
} from './scheduleTime.js'

/**
 * FLOW-EMP_SCHED-02 — the day view of the roster.
 *
 * One row per employee holding a block on the selected date, drawn from
 * GET /shifts, positioned inside the store's operating day (07:00–20:00).
 * FLOW-EMP_SCHED-03 makes the underlying granularity 10 minutes, so a block's
 * column span is measured in 10-minute slices rather than whole hours — a
 * 07:30–08:30 block has to sit on the half-hour, not snap to 08:00.
 *
 * A block the employee flagged unavailable (FLOW-EMP_SCHED-04) is drawn greyed
 * and struck through: the row is still there, but it no longer staffs the shop.
 * Clicking a block opens the block editor.
 */

/** 10-minute slices across the operating day, one gutter per slice. */
const SLICES = (CLOSE_HOUR - OPEN_HOUR) * 6

const GRID_STYLE = {
  display: 'grid',
  gridTemplateColumns: `repeat(${SLICES}, minmax(0, 1fr))`,
}

/** Minutes past the shop's opening hour at 'HH:MM', clamped into the day. */
function offsetOf(value) {
  const minutes = minutesOf(value)
  if (minutes === null) return 0
  return Math.min(CLOSE_HOUR * 60, Math.max(OPEN_HOUR * 60, minutes)) - OPEN_HOUR * 60
}

/** Grid-column start / span for one block, in 10-minute slices. */
function blockPosition(shift) {
  const start = offsetOf(shift.shift_start) / 10
  const end = offsetOf(shift.shift_end) / 10

  return { first: start + 1, span: Math.max(1, end - start) }
}

export default function ScheduleTimelineGrid({
  shifts = [],
  officers = [],
  onShiftClick,
  canEdit = true,
}) {
  const rows = officers
    .map((officer) => ({
      officer,
      blocks: shifts
        .filter((shift) => String(shift.emp_id) === String(officer.id))
        .sort((a, b) => String(a.shift_start).localeCompare(String(b.shift_start))),
    }))
    .filter((row) => row.blocks.length > 0)

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-xs text-slate-400">
        No duty blocks on the timeline for this date yet.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-left border-collapse min-w-[760px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/70 text-2xs font-bold uppercase tracking-wider text-slate-500">
            <th className="py-2.5 px-3.5 w-44 sticky left-0 bg-slate-50 z-10">Employee</th>
            {/* The hour marks sit on the SAME 10-minute grid the blocks use,
                so a label can never drift away from the column it names. */}
            <th colSpan={HOUR_LABELS.length} className="py-2.5 px-2">
              <div className="relative min-h-[14px]" style={GRID_STYLE}>
                {HOUR_LABELS.slice(0, -1).map((time, index) => (
                  <span
                    key={time}
                    className="text-center truncate"
                    style={{ gridColumn: `${index * 6 + 1} / span 6` }}
                  >
                    {time}
                  </span>
                ))}
              </div>
            </th>
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-100 text-xs">
          {rows.map(({ officer, blocks }) => (
            <tr key={officer.id} className="hover:bg-slate-50/40 transition-colors">
              <td className="py-2 px-3.5 sticky left-0 bg-white z-10">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-2xs font-bold shrink-0 ${
                      officer.avatarColor || 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {officer.initials}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 truncate">{officer.name}</p>
                    <p className="text-2xs text-slate-400">{officer.roleLabel}</p>
                  </div>
                </div>
              </td>

              <td colSpan={HOUR_LABELS.length} className="py-1.5 px-2">
                <div className="relative min-h-[46px] items-center" style={GRID_STYLE}>
                  {blocks.map((shift) => {
                    const { first, span } = blockPosition(shift)
                    const unavailable = !!shift.unavailable

                    return (
                      <button
                        key={shift.shift_id}
                        type="button"
                        onClick={() => canEdit && onShiftClick && onShiftClick(shift)}
                        title={`${
                          shift.employee_name ? `${shift.employee_name}: ` : ''
                        }${fmtTime(shift.shift_start)} – ${fmtTime(shift.shift_end)}${
                          unavailable ? ' · unavailable' : ''
                        }${canEdit ? ' · click to edit' : ''}`}
                        className={`relative rounded-md border px-1.5 py-1 text-left transition-colors ${
                          unavailable
                            ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-pointer hover:bg-slate-200'
                            : 'bg-blue-50 border-blue-200 text-blue-700 cursor-pointer hover:bg-blue-100'
                        }`}
                        style={{ gridColumn: `${first} / span ${span}` }}
                      >
                        <span
                          className={`block text-2xs font-bold truncate ${
                            unavailable ? 'line-through' : ''
                          }`}
                        >
                          {fmtTime(shift.shift_start)} – {fmtTime(shift.shift_end)}
                        </span>
                        <span className="block text-2xs font-normal opacity-80 truncate">
                          {unavailable ? 'Unavailable' : `#${shift.shift_id}`}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
