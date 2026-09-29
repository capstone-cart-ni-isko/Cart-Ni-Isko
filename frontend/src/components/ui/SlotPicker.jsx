import { useEffect, useState } from 'react'
import { fetchSlots } from '../../services/appointments.js'

/** "2026-09-26 10:30" -> "10:30 AM". */
export function slotTimeLabel(start) {
  const [h, m] = String(start || '').slice(11, 16).split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return String(start || '')
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m || 0).padStart(2, '0')} ${suffix}`
}

function isPast(start) {
  const at = new Date(String(start).replace(' ', 'T'))
  return !Number.isNaN(at.getTime()) && at.getTime() <= Date.now()
}

/**
 * Time-slot selector for appointment booking and rescheduling.
 * Displays only clean, available time chips faithful to Store Pickup in Checkout.
 */
export default function SlotPicker({
  date,
  type = 'CLAIM',
  value = '',
  onChange,
  currentSlot = '',
}) {
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
        const normalized = (Array.isArray(rows) ? rows : []).filter((s) => {
          // Keep only slots matching this appointment type
          if (s.type && s.type !== type) return false
          // Keep future slots, or the user's currently held booking if rescheduling
          const isCurrent = currentSlot && s.start === currentSlot
          if (isPast(s.start) && !isCurrent) return false
          return true
        })
        setSlots(normalized)
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
  }, [date, type, reloadKey, currentSlot])

  // A selection from another date is cleared unless it matches
  useEffect(() => {
    if (value && !String(value).startsWith(date || '')) {
      onChange?.('')
    }
  }, [date, value, onChange])

  if (!date) {
    return (
      <p className="text-xs text-gray-500 bg-slate-50 rounded-lg p-3">
        Pick a date to see available times.
      </p>
    )
  }

  if (loading) {
    return (
      <p className="text-xs text-gray-500 bg-slate-50 rounded-lg p-3 animate-pulse">
        Loading available times…
      </p>
    )
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

  // Filter to available slots or the user's current booking
  const availableSlots = slots.filter(
    (s) => s.available || (currentSlot && s.start === currentSlot) || (value && s.start === value)
  )

  if (slots.length === 0 || availableSlots.length === 0) {
    const isPastDate = new Date(`${date}T23:59:59`).getTime() < Date.now()
    return (
      <p className="text-xs text-gray-600 bg-amber-50 border border-amber-200/70 rounded-xl p-3">
        {isPastDate
          ? 'This date has already passed. Please select a future date.'
          : 'No available time slots on this date. Try another date.'}
      </p>
    )
  }

  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {availableSlots.map((s) => {
        const isCurrent = currentSlot && s.start === currentSlot
        const active = value === s.start

        return (
          <button
            key={`${s.type || type}|${s.start}`}
            type="button"
            onClick={() => onChange?.(s.start)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
              active
                ? 'bg-brand-orange text-white border-brand-orange shadow-xs'
                : 'bg-white text-gray-800 border-slate-200 hover:border-brand-orange hover:bg-orange-50/40'
            }`}
          >
            <span>{slotTimeLabel(s.start)}</span>
            {isCurrent && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-tight ${
                  active ? 'bg-white/20 text-white' : 'bg-orange-100 text-brand-orange'
                }`}
              >
                Current
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
