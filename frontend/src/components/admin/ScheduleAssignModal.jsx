import { useState } from 'react'
import { GRID_MINUTES, MIN_WEEKLY_MINUTES, fmtTime, humanMinutes, minutesOf } from './scheduleTime.js'
import Modal from '../ui/Modal.jsx'
import Button from '../ui/Button.jsx'
import { useToast } from '../../hooks/useToast.js'

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
  const [showInfo, setShowInfo] = useState(false)
  const { showToast } = useToast()

  // A broken rule is reported as a toast; the dialog stays open so the value
  // can be fixed. Rules the server checks (overlap, weekly minimum) arrive the
  // same way through the parent's onSubmit handler.
  const reject = (message) => showToast(message, 'error')

  const toggleOfficer = (id) => {
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
    // here too.
    const start = minutesOf(startTime)
    const end = minutesOf(endTime)

    if (selectedIds.size === 0) {
      reject('Choose at least one employee to schedule.')
      return
    }
    if (!shiftDate) {
      reject('Choose a date for the shift.')
      return
    }
    if (start === null || end === null) {
      reject('Set both a start time and an end time.')
      return
    }
    if (start % GRID_MINUTES !== 0 || end % GRID_MINUTES !== 0) {
      reject('Shift times must end in :00, :10, :20, :30, :40 or :50 (for example 9:10, not 9:05).')
      return
    }
    if (end <= start) {
      reject('The end time must be later than the start time.')
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
      ariaLabel="Add Shift"
      title={
        <span className="inline-flex items-center gap-2">
          Add Shift
          <button
            type="button"
            onClick={() => setShowInfo((open) => !open)}
            aria-expanded={showInfo}
            aria-controls="assign-shift-info"
            aria-label="Scheduling rules"
            title="Scheduling rules"
            className={`inline-flex h-6 w-6 items-center justify-center rounded-full border transition-colors cursor-pointer ${
              showInfo
                ? 'border-brand-orange text-brand-orange bg-orange-50'
                : 'border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <line x1="12" y1="11" x2="12" y2="16" />
              <circle cx="12" cy="7.5" r=".75" fill="currentColor" stroke="none" />
            </svg>
          </button>
        </span>
      }
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
      <form id="schedule-assign-form" onSubmit={submit} noValidate className="space-y-4 text-xs font-medium">
        {showInfo && (
          <div
            id="assign-shift-info"
            className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-2xs text-slate-600 font-normal space-y-1"
          >
            <p className="font-semibold text-slate-800 text-xs">Scheduling rules</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Times go in 10-minute steps: :00, :10, :20, :30, :40 or :50.</li>
              <li>
                Each employee needs at least {humanMinutes(MIN_WEEKLY_MINUTES)} of shifts per week,
                counting the one you are adding.
              </li>
              <li>An employee cannot have two shifts that overlap.</li>
            </ul>
            <p>If a rule is not met, a message tells you what to fix.</p>
          </div>
        )}

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
              {/* Custom-drawn box: the native accent-color picks its own
                  (black) tick on a light orange, so the tick is drawn white. */}
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleOfficer(String(officer.id))}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className={`w-4 h-4 rounded-[4px] border flex items-center justify-center shrink-0 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand-orange/40 ${
                  checked ? 'bg-brand-orange border-brand-orange' : 'bg-white border-slate-300'
                }`}
              >
                {checked && (
                  <svg viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                    <polyline points="3.5 8.5 6.5 11.5 12.5 4.5" />
                  </svg>
                )}
              </span>
              <span className="flex-1 truncate text-slate-800">{officer.name}</span>
              <span className="text-2xs text-slate-500 shrink-0">{officer.availability}</span>
            </label>
          )
        })}
      </div>
      <p className="text-2xs text-slate-400 font-normal">
        In-store status shows who is currently at the store.
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
            }}
            className="w-full h-9 px-2.5 bg-slate-50 border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-brand-orange"
          />
        </div>
      </div>
      <p className="text-2xs text-slate-500 font-normal">
        Shift length: <span className="font-semibold text-slate-800">{fmtTime(startTime)} – {fmtTime(endTime)}</span>
        <span className="ml-1">({humanMinutes(blockMinutes())})</span>
      </p>
        </fieldset>
      </form>
    </Modal>
  )
}
