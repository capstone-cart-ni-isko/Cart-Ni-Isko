import { useState } from 'react'
import { GRID_MINUTES, fmtTime, humanMinutes, minutesOf } from './scheduleTime.js'
import Modal from '../ui/Modal.jsx'
import Button from '../ui/Button.jsx'

/**
 * Assign Duty dialog (FLOW-EMP_SCHED-03 / REQ-EMP_SCHED-06).
 *
 * The form owns only its own inputs; the blocks themselves are written by POST
 * /shifts through the parent's onSubmit handler. The parent keys this
 * component, so the inputs reset every time it opens.
 *
 * The form collects only what `schedules` can hold - who and when. Duty type
 * and location used to be offered here too, but DOMAIN 7's table has no column
 * for either (FLOW-EMP_SCHED-03 schedules on start and end times alone), so
 * asking for them only produced a value that vanished on reload.
 *
 * REQ-EMP_SCHED-06: several employees may be picked at once, so one window is
 * scheduled for the whole batch in a single save.
 */
export default function ScheduleAssignModal({
  officers = [],
  initialOfficerId = '',
  date = '',
  isSaving = false,
  onClose,
  onSubmit,
}) {
  // Batch scheduling: a Set of the picked ids, seeded with the officer the
  // card-level "Assign" action was opened from (empty = pick everyone here).
  const [selectedIds, setSelectedIds] = useState(() =>
    initialOfficerId ? new Set([String(initialOfficerId)]) : new Set()
  )
  const [shiftDate, setShiftDate] = useState(() => date)
  const [startTime, setStartTime] = useState('08:00')
  const [endTime, setEndTime] = useState('13:00')
  const [formError, setFormError] = useState('')

  const toggleOfficer = (id) => {
    setFormError('')
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const blockMinutes = () => {
    const start = minutesOf(startTime)
    const end = minutesOf(endTime)
    if (start === null || end === null) return 0
    return Math.max(0, end - start)
  }

  const submit = (event) => {
    event.preventDefault()

    // FLOW-EMP_SCHED-03: 10-minute steps. The browser's time stepper already
    // offers them, but a typed value can bypass `step`, so the rule is checked
    // here too and the message stays inside the dialog instead of a toast the
    // cashier has to chase.
    const start = minutesOf(startTime)
    const end = minutesOf(endTime)

    if (selectedIds.size === 0) {
      setFormError('Pick at least one employee to schedule.')
      return
    }
    if (!shiftDate) {
      setFormError('Pick the date of the block.')
      return
    }
    if (start === null || end === null) {
      setFormError('Both a start and an end time are needed.')
      return
    }
    if (start % GRID_MINUTES !== 0 || end % GRID_MINUTES !== 0) {
      setFormError(
        `Times are scheduled in ${GRID_MINUTES}-minute steps. Use 08:00, 08:10, 08:20 …`
      )
      return
    }
    if (end <= start) {
      setFormError('The end time must be later than the start time.')
      return
    }

    onSubmit({
      emp_ids: [...selectedIds].map(Number),
      shift_date: shiftDate,
      shift_start: startTime,
      shift_end: endTime,
    })
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Add Shift"
      subtitle="Choose employees, then set the date and hours for their shift."
      size="wide"
      bodyClassName="modal-scroll"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="schedule-assign-form"
            disabled={isSaving || selectedIds.size === 0}
            className="px-3.5"
          >
            {isSaving
              ? 'Scheduling…'
              : selectedIds.size > 1
                ? `Schedule ${selectedIds.size} employees`
                : 'Schedule Shift'}
          </Button>
        </>
      }
    >
      <form id="schedule-assign-form" onSubmit={submit} className="space-y-4 text-xs font-medium">
        <fieldset className="space-y-2">
      <legend className="font-semibold text-slate-800">
        Choose employees
        <span className="ml-2 text-slate-400 font-normal">{selectedIds.size} selected</span>
      </legend>
      <div className="flex items-center justify-between gap-3">
        <p className="text-2xs text-slate-500 font-normal">
          Everyone selected will receive the same date and shift hours.
        </p>
        <button
          type="button"
          disabled={officers.length === 0}
          onClick={() =>
            setSelectedIds((current) =>
              current.size === officers.length
                ? new Set()
                : new Set(officers.map((officer) => String(officer.id)))
            )
          }
          className="text-2xs font-bold text-brand-orange hover:underline disabled:text-slate-300 disabled:no-underline disabled:cursor-not-allowed"
        >
          {selectedIds.size === officers.length && officers.length > 0
            ? 'Clear selection'
            : 'Select all'}
        </button>
      </div>
      <div className="max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 divide-y divide-slate-100">
        {officers.length === 0 && (
          <p className="px-3 py-4 text-xs text-slate-500 text-center">
            No employees are available to schedule.
          </p>
        )}
        {officers.map((officer) => {
          const checked = selectedIds.has(String(officer.id))
          return (
            <label
              key={officer.id}
              className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-slate-100"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleOfficer(String(officer.id))}
                className="w-4 h-4 accent-[#F97316] cursor-pointer"
              />
              <span className="flex-1 truncate text-slate-800">{officer.name}</span>
              <span className="text-2xs text-slate-500 shrink-0">{officer.availability}</span>
            </label>
          )
        })}
      </div>
      <p className="text-2xs text-slate-400 font-normal">
        In-store status shows who is currently at the store; it does not prevent scheduling.
      </p>
        </fieldset>

        <fieldset className="space-y-2">
      <legend className="font-semibold text-slate-800">Set shift details</legend>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label htmlFor="assign-date" className="block font-semibold text-slate-700 mb-1">
            Date
          </label>
          <input
            id="assign-date"
            type="date"
            value={shiftDate}
                onChange={(event) => {
              setShiftDate(event.target.value)
                  setFormError('')
                }}
            className="w-full h-9 px-2.5 bg-slate-50 border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-brand-orange"
              />
            </div>
            <div>
          <label htmlFor="assign-start" className="block font-semibold text-slate-700 mb-1">
            Start time
              </label>
              <input
            id="assign-start"
                type="time"
            value={startTime}
                step={GRID_MINUTES * 60}
                onChange={(event) => {
              setStartTime(event.target.value)
                  setFormError('')
                }}
            className="w-full h-9 px-2.5 bg-slate-50 border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-brand-orange"
              />
            </div>
        <div>
          <label htmlFor="assign-end" className="block font-semibold text-slate-700 mb-1">
            End time
          </label>
          <input
            id="assign-end"
            type="time"
            value={endTime}
            step={GRID_MINUTES * 60}
            onChange={(event) => {
              setEndTime(event.target.value)
              setFormError('')
            }}
            className="w-full h-9 px-2.5 bg-slate-50 border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-brand-orange"
          />
        </div>
      </div>
      <div className="rounded-md bg-orange-50 border border-orange-100 px-3 py-2">
        <p className="font-semibold text-slate-800">
          {fmtTime(startTime)} – {fmtTime(endTime)}
          <span className="ml-2 text-slate-600 font-medium">
            ({humanMinutes(blockMinutes())})
          </span>
        </p>
        <p className="mt-1 text-2xs text-slate-600 font-normal">
          Use 10-minute time steps. Each employee must meet the 3-hour weekly minimum; shifts
          cannot overlap, and the same-day scheduling cutoff applies.
        </p>
      </div>
        </fieldset>

        {formError && (
      <p
        role="alert"
        className="text-2xs font-semibold text-rose-600 bg-rose-50 border border-rose-100 rounded px-2 py-1.5"
      >
        {formError}
      </p>
        )}
      </form>
    </Modal>
  )
}
