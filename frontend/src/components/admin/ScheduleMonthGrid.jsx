import { useEffect, useMemo, useState } from 'react'
import { fetchShifts } from '../../services/shifts.js'
import {
  DAY_LABELS,
  MIN_WEEKLY_MINUTES,
  addDays,
  dayKey,
  isLockedDay,
  minutesBetween,
  monthStartOf,
} from './scheduleTime.js'

/**
 * REQ-SS-03 staffing overview for one month.
 *
 * The toolbar has always offered Day / Week / Month, but only the first two
 * had a screen, so choosing Month silently did nothing. This is that screen:
 * the whole month at a glance, with the in-store headcount the schedule
 * calendar gates on (a VISIT slot needs two, a CLAIM one) and the weekly floor
 * of FLOW-EMP_SCHED-05 per week, so a roster that is about to be refused by
 * the server is visible before anyone tries to save it.
 *
 * Every figure comes from GET /shifts over the month's date range.
 */
export default function ScheduleMonthGrid({
  monthStart,
  officers = [],
  canEdit = true,
  onPickDay,
}) {
  const [shifts, setShifts] = useState([])
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  const month = useMemo(() => monthStartOf(monthStart), [monthStart])
  const monthKey = dayKey(month)

  // Six weeks always covers a month, and keeps the grid a fixed height.
  const days = useMemo(() => {
    const start = addDays(month, -((month.getDay() + 6) % 7))
    return Array.from({ length: 42 }, (_, index) => addDays(start, index))
  }, [month])

  useEffect(() => {
    let cancelled = false
    setError('')

    const from = dayKey(days[0])
    const to = dayKey(days[41])

    fetchShifts({ date_from: from, date_to: to })
      .then((rows) => {
        if (cancelled) return
        setShifts(rows)
      })
      .catch((err) => {
        if (cancelled) return
        setShifts([])
        setError(err?.message || 'Unable to load this month’s schedule.')
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey, reloadKey])

  const byDay = useMemo(() => {
    const map = new Map()
    shifts.forEach((shift) => {
      const key = shift.shift_date
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(shift)
    })
    return map
  }, [shifts])

  // Weekly floor per ISO week, so a short week is visible next to the month.
  const weekTotals = useMemo(() => {
    const totals = new Map()
    shifts.forEach((shift) => {
      if (shift.unavailable || !shift.shift_date) return
      const [year, monthPart, dayPart] = String(shift.shift_date).split('-').map(Number)
      if (!year || !monthPart || !dayPart) return
      const day = new Date(year, monthPart - 1, dayPart)
      const monday = addDays(day, -((day.getDay() + 6) % 7))
      const key = dayKey(monday)

      totals.set(key, (totals.get(key) || 0) + minutesBetween(shift.shift_start, shift.shift_end))
    })
    return totals
  }, [shifts])

  const monthLabel = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const scheduledMinutes = [...weekTotals.values()].reduce((sum, value) => sum + value, 0)

  return (
    <section className="bg-white rounded-lg p-4 border border-slate-200 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Monthly Staffing Overview</h2>
          <p className="text-[11px] text-slate-400 font-normal mt-0.5">
            {monthLabel} · in-store headcount per day (REQ-SS-03) and the {MIN_WEEKLY_MINUTES}-minute
            weekly floor (FLOW-EMP_SCHED-05)
          </p>
        </div>
        {/* No write action lives here: this is the month's staffing overview.
            A duty date/time is added or removed from the employee list on the
            Day view (the officer card's "+ Assign Shift" and each block's
            editor), which is the one place the SRS points at
            (FLOW-EMP_SCHED-03/04). */}
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
        <>
          <div className="grid grid-cols-7 gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 select-none">
            {DAY_LABELS.map((label) => (
              <span key={label} className="text-center">
                {label}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {days.map((day) => {
              const key = dayKey(day)
              const blocks = byDay.get(key) || []
              const staffed = blocks.filter((block) => !block.unavailable)
              const offDuty = blocks.length - staffed.length
              // REQ-AB-03 headcount is people, not blocks: one employee with
              // two blocks on a day is still one body in the store.
              const headcount = new Set(staffed.map((block) => String(block.emp_id))).size
              const locked = isLockedDay(day)
              const tone =
                headcount >= 2
                  ? 'border-emerald-200 bg-emerald-50/60'
                  : headcount === 1
                    ? 'border-amber-200 bg-amber-50/60'
                    : 'border-slate-200 bg-slate-50/60'

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onPickDay?.(day)}
                  title={`${day.toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })} · ${headcount} in store of ${officers.length} employees${
                    locked && !canEdit ? ' · locked (REQ-SS-02)' : ''
                  }`}
                  className={`min-h-[74px] rounded-md border p-1.5 text-left transition-colors ${
                    canEdit ? 'cursor-pointer' : 'cursor-default'
                  } ${tone} ${
                    day.getMonth() !== month.getMonth() ? 'opacity-45' : ''
                  } hover:border-brand-orange`}
                >
                  <span className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-700">{day.getDate()}</span>
                    {headcount > 0 && (
                      <span className="text-[9px] font-bold text-slate-500">{headcount} in</span>
                    )}
                  </span>

                  {locked && (
                    <span className="block text-[9px] font-semibold text-rose-500 mt-0.5">locked</span>
                  )}

                  <span className="mt-1 flex flex-wrap gap-0.5">
                    {staffed.slice(0, 4).map((block) => (
                      <span
                        key={block.shift_id}
                        className="w-1.5 h-1.5 rounded-full bg-blue-400"
                        title={`${block.employee_name || `#${block.emp_id}`} ${block.shift_start}–${block.shift_end}`}
                      />
                    ))}
                    {offDuty > 0 && (
                      <span className="text-[9px] font-bold text-slate-400">
                        +{offDuty} off
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>

          <p className="text-[11px] text-slate-400">
            {scheduledMinutes} scheduled minutes across the month ·{' '}
            {[...weekTotals.entries()]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([week, minutes]) => (
                <span key={week} className="mr-2">
                  w/c {week.slice(5)}: {minutes}/{MIN_WEEKLY_MINUTES} min
                </span>
              ))}
            {' · click a day to open it in the Day view.'}
          </p>
        </>
      )}
    </section>
  )
}
