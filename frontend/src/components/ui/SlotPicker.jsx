import { useEffect, useState } from 'react'
import { fetchSlots } from '../../services/appointments.js'

/** "2026-09-26 10:30" -> "10:30 AM". */
function slotTimeLabel(start) {
  const [h, m] = String(start || '').slice(11, 16).split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m || 0).padStart(2, '0')} ${suffix}`
}

function isPast(start) {
  const at = new Date(String(start).replace(' ', 'T'))
  return !Number.isNaN(at.getTime()) && at.getTime() <= Date.now()
}

/**
 * Time-slot grid for one appointment type on one date (GET /appoint/slots).
 * `value` / `onChange` carry the slot's full start ("YYYY-MM-DD HH:MM"),
 * which is exactly what POST /appoint/create expects as appoint_date.
 */
export default function SlotPicker({ date, type = 'CLAIM', value = '', onChange }) {
  const [slots, setSlots] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!date) {
      setSlots([])
      return undefined
    }
    let cancelled = false
    setLoading(true)
    setError('')
    fetchSlots(date)
      .then((rows) => {
        if (cancelled) return
        setSlots((Array.isArray(rows) ? rows : []).filter((s) => s.type === type && !isPast(s.start)))
      })
      .catch((err) => {
        if (cancelled) return
        setSlots([])
        setError(err?.message || 'Unable to load time slots right now.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [date, type, reloadKey])

  // A selection from another date or type is never kept
  useEffect(() => {
    if (value && !String(value).startsWith(date || '')) onChange?.('')
  }, [date, value, onChange])

  if (!date) {
    return (
      <p className="text-xs text-gray-500 bg-slate-50 rounded-lg p-3">
        Pick a date to see available times.
      </p>
    )
  }
  if (loading) {
    return <p className="text-xs text-gray-500 bg-slate-50 rounded-lg p-3">Loading times…</p>
  }
  if (error) {
    return (
      <div className="flex items-center justify-between gap-2 text-xs text-red-600 bg-red-50 rounded-lg p-3">
        <span>{error}</span>
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          className="font-bold underline cursor-pointer shrink-0"
        >
          Retry
        </button>
      </div>
    )
  }

  const open = slots.filter((s) => s.available)
  if (slots.length === 0) {
    return (
      <p className="text-xs text-gray-500 bg-slate-50 rounded-lg p-3">
        No times left on this date. Try another date.
      </p>
    )
  }
  if (open.length === 0) {
    const staffed = slots.some((s) => !/employee|staff/i.test(String(s.reason || '')))
    return (
      <p className="text-xs text-gray-600 bg-amber-50 border border-amber-100 rounded-lg p-3">
        {staffed
          ? 'Every time on this date is fully booked. Try another date.'
          : 'No staff are scheduled on this date yet. Try another date.'}
      </p>
    )
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
      {slots.map((s) => {
        const active = s.available && value === s.start
        const full = /booked/i.test(String(s.reason || ''))
        return (
          <button
            key={`${s.type}|${s.start}`}
            type="button"
            disabled={!s.available}
            title={s.available ? slotTimeLabel(s.start) : s.reason || 'Unavailable'}
            onClick={() => onChange?.(s.start)}
            className={`py-2 rounded-md text-xs font-semibold border transition-colors ${
              active
                ? 'bg-brand-orange text-white border-brand-orange'
                : s.available
                ? 'bg-white text-gray-700 border-slate-200 hover:border-brand-orange cursor-pointer'
                : 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed'
            }`}
          >
            {slotTimeLabel(s.start)}
            {!s.available && (
              <span className="block text-[10px] font-normal">{full ? 'Full' : 'No staff'}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

