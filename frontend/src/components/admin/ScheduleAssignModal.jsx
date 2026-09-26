import { useState } from 'react'
import { SHIFT_TYPES } from '../../services/shifts.js'

const DEFAULT_TYPE = SHIFT_TYPES[0].value

/**
 * Assign Duty modal. The form owns only its own inputs; the block itself is
 * written by POST /shifts through the parent's onSubmit handler. The parent
 * keys this component, so the inputs reset every time it opens.
 */
export default function ScheduleAssignModal({
  officers = [],
  initialOfficerId = '',
  dateLabel = '',
  isSaving = false,
  onClose,
  onSubmit,
}) {
  const [officerId, setOfficerId] = useState(initialOfficerId)
  const [shiftType, setShiftType] = useState(DEFAULT_TYPE)
  const [startTime, setStartTime] = useState('08:00')
  const [endTime, setEndTime] = useState('13:00')
  const [location, setLocation] = useState('Main Counter')

  const submit = (event) => {
    event.preventDefault()
    if (!officerId) return

    onSubmit({
      emp_id: Number(officerId),
      shift_type: shiftType,
      // The API stores the window as 'HH:MM' 24-hour strings.
      shift_start: startTime,
      shift_end: endTime,
      shift_location: location.trim() || 'Main Counter',
    })
  }

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
      <div className="bg-white rounded-lg p-4 max-w-sm w-full border border-slate-200 space-y-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Assign Officer Duty</h3>
          <p className="text-[11px] text-slate-400">{dateLabel}</p>
        </div>

        <form onSubmit={submit} className="space-y-2.5 text-xs font-medium">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Officer</label>
            <select
              value={officerId}
              onChange={(event) => setOfficerId(event.target.value)}
              className="w-full h-8 px-2.5 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-orange text-xs"
            >
              {officers.map((officer) => (
                <option key={officer.id} value={officer.id}>
                  {officer.name} ({officer.availability})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Duty Type</label>
            <select
              value={shiftType}
              onChange={(event) => setShiftType(event.target.value)}
              className="w-full h-8 px-2.5 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-orange text-xs"
            >
              {SHIFT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Start Time</label>
              <input
                type="time"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                className="w-full h-8 px-2.5 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-orange text-xs"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">End Time</label>
              <input
                type="time"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
                className="w-full h-8 px-2.5 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-orange text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Room / Location</label>
            <input
              type="text"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="e.g. Main Campus USC Org Room"
              className="w-full h-8 px-2.5 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-orange text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1.5">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 bg-slate-100 rounded-md font-semibold text-slate-600 hover:bg-slate-200 cursor-pointer text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !officerId}
              className="h-8 px-3 bg-brand-orange rounded-md font-semibold text-white hover:bg-brand-orange-dark cursor-pointer text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Assigning…' : 'Assign Shift'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
