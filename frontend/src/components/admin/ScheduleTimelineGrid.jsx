import { timeLabel } from '../../services/duty.js'

// Store hours, matching the appointment slot grid on the backend (08:00-18:00)
const OPEN_MIN = 8 * 60
const CLOSE_MIN = 18 * 60
const STEP_MIN = 30
const HOURS = Array.from({ length: (CLOSE_MIN - OPEN_MIN) / 60 }, (_, i) => OPEN_MIN / 60 + i)
const STEPS = (CLOSE_MIN - OPEN_MIN) / STEP_MIN

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm || '').split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

const hourLabel = (hour) => {
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const h = hour % 12 === 0 ? 12 : hour % 12
  return `${h}:00 ${suffix}`
}

const TYPE_STYLES = {
  'DESK DUTY': 'bg-isko-blue/10 text-isko-blue-dark border-isko-blue/30 hover:bg-isko-blue/20',
  'EVENT PREP': 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100',
  INVENTORY: 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200',
  'POS CASHIER': 'bg-isko-orange/10 text-isko-orange-dark border-isko-orange/30 hover:bg-isko-orange/20',
}

// REQ-SS-03: the assignee can no longer work this shift (disabled/deleted)
const PENDING_STYLE = 'bg-rose-50 text-rose-700 border-rose-300 border-dashed hover:bg-rose-100'

const titleCase = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/(^|\s)[a-z]/g, (c) => c.toUpperCase())

/**
 * One row per employee for the selected date. Shift blocks are placed on a
 * 30-minute grid; clicking an empty hour starts an assignment at that time.
 */
export default function ScheduleTimelineGrid({
  officers = [],
  shifts = [],
  onEmptyClick,
  onShiftClick,
  disabled = false,
}) {
  return (
    <div className="h-full overflow-auto rounded-md border border-slate-100 bg-white">
      <table className="w-full text-left border-collapse min-w-[860px]">
        <thead className="sticky top-0 z-20">
          <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            <th className="py-2.5 px-3.5 w-44 sticky left-0 bg-slate-50 z-10">Staff</th>
            <th className="py-2.5 px-2">
              <div className="grid" style={{ gridTemplateColumns: `repeat(${HOURS.length}, minmax(0, 1fr))` }}>
                {HOURS.map((hour) => (
                  <span key={hour} className="text-center">
                    {hourLabel(hour)}
                  </span>
                ))}
              </div>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-xs">
          {officers.length === 0 && (
            <tr>
              <td colSpan={2} className="py-6 text-center text-slate-400">
                No employee accounts found.
              </td>
            </tr>
          )}
          {officers.map((officer) => {
            const own = shifts.filter((s) => String(s.emp_id) === String(officer.id))
            return (
              <tr key={officer.id} className="hover:bg-slate-50/40 transition-colors">
                <td className="py-2 px-3.5 font-bold text-slate-900 sticky left-0 bg-white z-10">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${officer.avatarColor}`}
                    >
                      {officer.initials}
                    </div>
                    <span className="truncate">{officer.name}</span>
                  </div>
                </td>
                <td className="py-1.5 px-2">
                  <div className="relative min-h-[40px]">
                    {/* Empty hours: click to assign starting at that hour */}
                    <div
                      className="grid gap-1 absolute inset-0"
                      style={{ gridTemplateColumns: `repeat(${HOURS.length}, minmax(0, 1fr))` }}
                    >
                      {HOURS.map((hour) => (
                        <button
                          key={hour}
                          type="button"
                          disabled={disabled}
                          onClick={() => onEmptyClick?.(officer, `${String(hour).padStart(2, '0')}:00`)}
                          title={disabled ? 'This date is locked' : `Assign ${officer.name} from ${hourLabel(hour)}`}
                          className="rounded-md border border-dashed border-slate-100 hover:border-brand-orange hover:bg-orange-50/40 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:hover:border-slate-100 disabled:hover:bg-transparent"
                        />
                      ))}
                    </div>

                    {/* Real shifts for this date */}
                    <div
                      className="grid gap-1 relative pointer-events-none min-h-[40px] items-stretch"
                      style={{ gridTemplateColumns: `repeat(${STEPS}, minmax(0, 1fr))` }}
                    >
                      {own.map((shift) => {
                        const start = Math.max(toMinutes(shift.shift_start), OPEN_MIN)
                        const end = Math.min(toMinutes(shift.shift_end), CLOSE_MIN)
                        const col = (start - OPEN_MIN) / STEP_MIN + 1
                        const span = Math.max(1, (end - start) / STEP_MIN)
                        return (
                          <button
                            key={shift.shift_id}
                            type="button"
                            onClick={() => onShiftClick?.(shift)}
                            style={{ gridColumn: `${col} / span ${span}`, gridRow: 1 }}
                            className={`pointer-events-auto rounded-md px-1.5 py-1 text-left border transition-colors cursor-pointer overflow-hidden ${
                              shift.pending_replacement
                                ? PENDING_STYLE
                                : TYPE_STYLES[shift.shift_type] || TYPE_STYLES['DESK DUTY']
                            }`}
                            title={`${titleCase(shift.shift_type)} · ${timeLabel(shift.shift_start)} – ${timeLabel(shift.shift_end)}${
                              shift.shift_location ? ` · ${shift.shift_location}` : ''
                            }${shift.pending_replacement ? ' · PENDING REPLACEMENT' : ''}`}
                          >
                            <p className="font-bold text-[11px] truncate">
                              {shift.pending_replacement ? 'Needs replacement' : titleCase(shift.shift_type)}
                            </p>
                            <p className="text-[10px] font-normal truncate">
                              {timeLabel(shift.shift_start)} – {timeLabel(shift.shift_end)}
                            </p>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
