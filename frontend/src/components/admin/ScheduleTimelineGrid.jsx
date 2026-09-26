import { TIME_SLOTS } from './ScheduleToolbar.jsx'

// The grid shows a fixed 7:00 AM – 1:00 PM window, so a block is placed by
// clamping its window into that range.
const WINDOW_START_HOUR = 7
const WINDOW_END_HOUR = 13

const BLOCK_STYLE = {
  'DESK DUTY': 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
  'EVENT PREP': 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
  'INVENTORY AUDIT': 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100',
  'POS CASHIER': 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
}

// 'HH:MM' -> hour as a number
const hourOf = (time) => Number(String(time || '00:00').slice(0, 2)) || 0

// Turns one block into the 1-based column / span the CSS grid needs
const blockPosition = (shift) => {
  const start = Math.max(hourOf(shift.shift_start), WINDOW_START_HOUR)
  const end = Math.min(hourOf(shift.shift_end), WINDOW_END_HOUR)
  const first = start - WINDOW_START_HOUR + 1
  const span = Math.max(1, end - start)

  return { first, span }
}

/**
 * Duty blocks for the selected date, drawn from the shifts the API returned.
 * One row per officer who holds at least one block that day.
 */
export default function ScheduleTimelineGrid({ shifts = [], officers = [], onShiftClick }) {
  // Group the blocks by employee, so each row only lists its own shifts
  const rows = officers
    .map((officer) => ({
      officer,
      blocks: shifts.filter((shift) => String(shift.emp_id) === String(officer.id)),
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
      <table className="w-full text-left border-collapse min-w-[720px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <th className="py-2.5 px-3.5 w-44 sticky left-0 bg-slate-50 z-10">Student Officers</th>
            {TIME_SLOTS.map((time) => (
              <th key={time} className="py-2.5 px-2 text-center min-w-[80px]">
                {time}
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-100 text-xs">
          {rows.map(({ officer, blocks }) => (
            <tr key={officer.id} className="hover:bg-slate-50/40 transition-colors">
              <td className="py-2 px-3.5 font-bold text-slate-900 sticky left-0 bg-white z-10 flex items-center gap-2">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${officer.avatarColor}`}
                >
                  {officer.initials}
                </div>
                <span className="truncate">{officer.name}</span>
              </td>

              <td colSpan={TIME_SLOTS.length} className="py-1.5 px-2">
                <div className="grid grid-cols-7 gap-1.5 relative min-h-[38px] items-center">
                  {blocks.map((shift) => {
                    const { first, span } = blockPosition(shift)

                    return (
                      <div
                        key={shift.shift_id}
                        onClick={() => onShiftClick && onShiftClick(shift)}
                        title={`${shift.shift_type}: ${shift.shift_start} - ${shift.shift_end}`}
                        className={`rounded-md p-1.5 text-xs font-semibold border transition-colors cursor-pointer ${
                          BLOCK_STYLE[shift.shift_type] || BLOCK_STYLE['DESK DUTY']
                        }`}
                        style={{ gridColumn: `${first} / span ${span}` }}
                      >
                        <p className="font-bold text-xs">{shift.shift_type}</p>
                        <p className="text-[10px] opacity-80 font-normal">
                          {shift.shift_start} - {shift.shift_end}
                        </p>
                      </div>
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
