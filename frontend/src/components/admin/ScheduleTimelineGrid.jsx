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
  'DESK DUTY': 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
  'EVENT PREP': 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100',
  INVENTORY: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
  'POS CASHIER': 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
}

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
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-left border-collapse min-w-[860px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-500">
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
                              TYPE_STYLES[shift.shift_type] || TYPE_STYLES['DESK DUTY']
                            }`}
                            title={`${titleCase(shift.shift_type)} · ${timeLabel(shift.shift_start)} – ${timeLabel(shift.shift_end)}${
                              shift.shift_location ? ` · ${shift.shift_location}` : ''
                            }`}
                          >
                            <p className="font-bold text-[11px] truncate">{titleCase(shift.shift_type)}</p>
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
