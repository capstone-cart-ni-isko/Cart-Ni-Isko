import { useEffect, useMemo, useState } from 'react'
import { fetchShifts } from '../../services/shifts.js'
import {
  DAY_LABELS,
  MIN_WEEKLY_MINUTES,
  addDays,
  dayKey,
  humanMinutes,
  minutesBetween,
  weekStartOf,
} from './scheduleTime.js'

/**
 * FLOW-EMP_SCHED-02 — the schedule calendar must show every employee with
 * their prescheduled availability for the CURRENT AND FUTURE WEEKS, not only
 * the single day the day-view positions on.
 *
 * One row per employee, one column per day of the selected week (Monday to
 * Sunday), read straight from GET /shifts?date_from&date_to so the grid is the
 * API's data and never a local copy. The last column totals the week against
 * the 180-minute floor of FLOW-EMP_SCHED-05, so a roster that is about to be
 * refused by the server is visible before anyone tries to save it. A block
 * flagged unavailable (FLOW-EMP_SCHED-04) counts for nothing and is drawn grey.
 */
export default function ScheduleWeekGrid({
  weekStart,
  officers = [],
  canEdit = true,
  onAssignOfficer,
  onEditBlock,
}) {
  const [shifts, setShifts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStartOf(weekStart), index)),
    [weekStart]
  )
  const dateFrom = dayKey(days[0])
  const dateTo = dayKey(days[6])

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError('')

    fetchShifts({ date_from: dateFrom, date_to: dateTo })
      .then((rows) => {
        if (cancelled) return
        setShifts(rows)
        setIsLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setShifts([])
        setError(err?.message || 'Unable to load this week’s schedule.')
        setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [dateFrom, dateTo, reloadKey])

  // officer id -> 'YYYY-MM-DD' -> blocks of that day
  const byOfficer = useMemo(() => {
    const map = new Map()
    shifts.forEach((shift) => {
      const key = String(shift.emp_id)
      if (!map.has(key)) map.set(key, {})
      const perDay = map.get(key)
      const date = shift.shift_date
      if (!perDay[date]) perDay[date] = []
      perDay[date].push(shift)
    })
    return map
  }, [shifts])

  const weekLabel = `${days[0].toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })} – ${days[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

  return (
    <section className="bg-white rounded-lg p-4 border border-slate-200 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Weekly Preschedule</h2>
          <p className="text-[11px] text-slate-400 font-normal mt-0.5">
            {weekLabel} · every employee’s prescheduled availability (FLOW-EMP_SCHED-02)
          </p>
        </div>
        {onAssignOfficer && (
          <button
            type="button"
            onClick={() => onAssignOfficer(null)}
            className="h-8 px-3 bg-brand-orange hover:bg-brand-orange-dark text-white font-semibold text-xs rounded-md transition-colors cursor-pointer"
          >
            Schedule this week
          </button>
        )}
      </div>

      {error ? (
        <div className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5 text-xs font-medium bg-rose-50 border-rose-200 text-rose-700">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setReloadKey((key) => key + 1)}
            className="font-bold underline cursor-pointer shrink-0"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[860px]">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400 select-none">
                <th className="py-2.5 pr-3 sticky left-0 bg-white">Employee</th>
                {days.map((day) => (
                  <th key={dayKey(day)} className="py-2.5 px-2 whitespace-nowrap">
                    {DAY_LABELS[(day.getDay() + 6) % 7]}{' '}
                    <span className="font-normal text-slate-400">{day.getDate()}</span>
                  </th>
                ))}
                <th className="py-2.5 px-2 text-right whitespace-nowrap">Week total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs align-top">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-400">
                    <span className="inline-flex items-center gap-2">
                      <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-200 border-t-brand-orange animate-spin" />
                      Loading this week’s schedule…
                    </span>
                  </td>
                </tr>
              ) : officers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-400">
                    No employees to schedule yet. Enroll staff from the Staff tab first.
                  </td>
                </tr>
              ) : (
                officers.map((officer) => {
                  const perDay = byOfficer.get(String(officer.id)) || {}
                  let weekMinutes = 0

                  return (
                    <tr key={officer.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-2.5 pr-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                              officer.avatarColor || 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {officer.initials}
                          </span>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 truncate">{officer.name}</p>
                            <p className="text-[10px] text-slate-400">{officer.roleLabel}</p>
                          </div>
                        </div>
                      </td>

                      {days.map((day) => {
                        const key = dayKey(day)
                        const blocks = perDay[key] || []
                        return (
                          <td key={key} className="py-2.5 px-2 align-top">
                            {blocks.length === 0 ? (
                              <span className="text-[10px] text-slate-300">—</span>
                            ) : (
                              <div className="space-y-1">
                                {blocks.map((block) => {
                                  // REQ-EMP_SCHED-01: an unavailable block no
                                  // longer counts toward the weekly floor.
                                  const minutes = minutesBetween(block.shift_start, block.shift_end)
                                  if (!block.unavailable) weekMinutes += minutes

                                  return (
                                    <button
                                      key={block.shift_id}
                                      type="button"
                                      disabled={!canEdit || !onEditBlock}
                                      onClick={() => onEditBlock(block)}
                                      title={`${block.status} · ${block.shift_start}–${block.shift_end}${
                                        block.unavailable ? ' · unavailable' : ''
                                      }${canEdit ? ' · click to edit' : ''}`}
                                      className={`block w-full text-left px-1.5 py-0.5 rounded border text-[10px] font-semibold whitespace-nowrap transition-colors disabled:cursor-default ${
                                        block.unavailable
                                          ? 'bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100'
                                          : 'bg-emerald-50 border-emerald-100 text-emerald-700 hover:bg-emerald-100'
                                      }`}
                                    >
                                      <span className={block.unavailable ? 'line-through' : undefined}>
                                        {block.shift_start}–{block.shift_end}
                                      </span>
                                      <span className="ml-1 font-normal opacity-70">
                                        {block.unavailable ? 'off' : `${minutes}m`}
                                      </span>
                                    </button>
                                  )
                                })}
                              </div>
                            )}
                          </td>
                        )
                      })}

                      <td className="py-2.5 px-2 text-right whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            weekMinutes >= MIN_WEEKLY_MINUTES
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                          title={
                            weekMinutes >= MIN_WEEKLY_MINUTES
                              ? 'Clears the 180-minute weekly minimum (FLOW-EMP_SCHED-05)'
                              : 'Below the 180-minute weekly minimum — add a block before saving (FLOW-EMP_SCHED-05)'
                          }
                        >
                          {humanMinutes(weekMinutes)} / {MIN_WEEKLY_MINUTES} min
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && !error && (
        <p className="text-[11px] text-slate-400">
          Blocks are read from GET /shifts?date_from={dateFrom}&amp;date_to={dateTo} — REQ-EMP_SCHED-07
          keeps every week queryable by date range for payroll and reporting.
        </p>
      )}
    </section>
  )
}
