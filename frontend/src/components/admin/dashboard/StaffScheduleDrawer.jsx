import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import DrawerPanel from '../DrawerPanel.jsx'
import { fetchShifts, timeLabel } from '../../../services/duty.js'
import { BTN_SECONDARY } from './ui.js'

function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const titleCase = (value) => String(value || '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())

/* Today's full shift list (GET /duty/display), opened from the duty widget. */
export default function StaffScheduleDrawer({ isOpen, onClose }) {
  const [shifts, setShifts] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen) return undefined
    let cancelled = false
    setLoading(true)
    setError('')
    fetchShifts(localDate())
      .then((res) => {
        if (!cancelled) setShifts(res.shifts || [])
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Could not load today’s schedule.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen])

  return (
    <DrawerPanel
      isOpen={isOpen}
      onClose={onClose}
      title="Today’s schedule"
      subtitle={new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
      footer={<Link to="/admin/schedule" className={BTN_SECONDARY}>Open full schedule</Link>}
    >
      {loading && <p className="text-xs text-slate-500">Loading…</p>}
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {!loading && !error && shifts.length === 0 && (
        <p className="text-xs text-slate-400 text-center py-6">No shifts are assigned today.</p>
      )}
      <ol className="space-y-1.5">
        {shifts.map((shift) => (
          <li key={shift.shift_id} className="flex items-start gap-3 p-2.5 rounded-md border border-slate-200">
            <span className="w-24 shrink-0 text-xs font-semibold text-slate-900 tabular-nums">
              {timeLabel(shift.shift_start)} – {timeLabel(shift.shift_end)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-slate-900 truncate">{shift.emp_name}</span>
              <span className="block text-[11px] text-slate-500 truncate">
                {titleCase(shift.shift_type)}
                {shift.shift_location ? ` · ${shift.shift_location}` : ''}
              </span>
              {shift.pending_replacement && (
                <span className="inline-block mt-1 text-[10px] font-semibold text-isko-orange-dark bg-isko-orange/10 border border-isko-orange/30 rounded px-1.5 py-0.5">
                  Pending replacement
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </DrawerPanel>
  )
}
