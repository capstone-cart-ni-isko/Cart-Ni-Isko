import { useMemo, useState } from 'react'

/**
 * Month calendar for picking an appointment day.
 *
 * Past days and the store's closed days (holidays, class/work suspensions -
 * GET /appoint/closed-dates) are blacked out and cannot be chosen; hovering a
 * closed day shows why it is closed. Replaces the plain <input type="date">,
 * which could only block past dates.
 */
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const pad = (n) => String(n).padStart(2, '0')
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export default function BookingCalendar({ value, onChange, min, closedDates = [] }) {
  const closed = useMemo(() => {
    const map = new Map()
    closedDates.forEach((row) => row?.date && map.set(row.date, row.reason || 'Store closed'))
    return map
  }, [closedDates])

  const initial = value || min || isoOf(new Date())
  const [cursor, setCursor] = useState(() => {
    const [y, m] = initial.split('-').map(Number)
    return new Date(y, m - 1, 1)
  })

  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const minMonth = min ? new Date(Number(min.slice(0, 4)), Number(min.slice(5, 7)) - 1, 1) : null
  const canGoBack = !minMonth || cursor > minMonth

  const cells = useMemo(() => {
    const first = new Date(year, month, 1).getDay()
    const days = new Date(year, month + 1, 0).getDate()
    const out = Array.from({ length: first }, () => null)
    for (let d = 1; d <= days; d++) out.push(isoOf(new Date(year, month, d)))
    return out
  }, [year, month])

  const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 w-full max-w-xs select-none">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => canGoBack && setCursor(new Date(year, month - 1, 1))}
          disabled={!canGoBack}
          className="w-7 h-7 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
          aria-label="Previous month"
        >
          ‹
        </button>
        <span className="text-xs font-semibold text-slate-800">{monthLabel}</span>
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          className="w-7 h-7 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer"
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w) => (
          <span key={w} className="text-[10px] font-semibold text-slate-400 py-1">{w}</span>
        ))}
        {cells.map((iso, i) => {
          if (!iso) return <span key={`pad-${i}`} />
          const past = min && iso < min
          const reason = closed.get(iso)
          const disabled = past || Boolean(reason)
          const selected = iso === value
          return (
            <button
              key={iso}
              type="button"
              disabled={disabled}
              onClick={() => onChange(iso)}
              title={reason ? `Closed: ${reason}` : past ? 'Past date' : undefined}
              aria-label={`${iso}${reason ? ` (closed: ${reason})` : ''}`}
              aria-pressed={selected}
              className={`h-8 rounded-lg text-xs font-medium transition-colors ${
                selected
                  ? 'bg-brand-orange text-white font-semibold'
                  : reason
                    ? 'bg-slate-800 text-slate-400 line-through cursor-not-allowed'
                    : past
                      ? 'text-slate-300 cursor-not-allowed'
                      : 'text-slate-700 hover:bg-orange-50 hover:text-brand-orange cursor-pointer'
              }`}
            >
              {Number(iso.slice(8))}
            </button>
          )
        })}
      </div>

      {closed.size > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500">
          <span className="inline-block w-3 h-3 rounded bg-slate-800" /> Store closed
        </p>
      )}
    </div>
  )
}
