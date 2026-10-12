import { useEffect, useState } from 'react'
import { GRID_MINUTES, fmtTime, minutesOf } from './scheduleTime.js'

/**
 * Schedule block editor (FLOW-EMP_SCHED-04 / 08).
 *
 * The create flow lives in ScheduleAssignModal (one dialog, a batch of
 * employees, REQ-EMP_SCHED-06). This one owns the block that already exists:
 * until now PUT /shifts/{id} and DELETE /shifts/{id} had no screen at all, so a
 * prescheduled block could only be cancelled, never amended or flagged
 * unavailable.
 *
 * The server is the authority on every rule - the 10-minute grid, the
 * no-overlap check (REQ-EMP_SCHED-04), the weekly minimum (REQ-EMP_SCHED-01)
 * and the REQ-SS-02 deadline - so this form validates only what it can answer
 * itself and shows the API's message verbatim when it refuses.
 *
 * @param {Object}  shift            block being edited (required)
 * @param {boolean} locked           REQ-SS-02 deadline passed for this block
 * @param {string}  lockMessage      why it is locked, in the server's words
 * @param {Function} onSubmit        ({ shift_date, shift_start, shift_end, unavailable })
 * @param {Function} onFlagUnavailable (shift, next) - FLOW-EMP_SCHED-04 toggle
 * @param {Function} onCancelBlock   (shift) - DELETE /shifts/{id}
 */
export default function ScheduleBlockModal({
  shift,
  dateLabel = '',
  locked = false,
  lockMessage = '',
  isSaving = false,
  onClose,
  onSubmit,
  onCancelBlock,
}) {
  const [date, setDate] = useState(() => shift?.shift_date ?? '')
  const [startTime, setStartTime] = useState(() => shift?.shift_start ?? '08:00')
  const [endTime, setEndTime] = useState(() => shift?.shift_end ?? '13:00')
  const [unavailable, setUnavailable] = useState(() => !!shift?.unavailable)
  const [formError, setFormError] = useState('')

  // A different block re-opens the dialog with that block's values.
  useEffect(() => {
    if (!shift) return
    setDate(shift.shift_date ?? '')
    setStartTime(shift.shift_start ?? '08:00')
    setEndTime(shift.shift_end ?? '13:00')
    setUnavailable(!!shift.unavailable)
    setFormError('')
  }, [shift])

  if (!shift) return null

  const onGrid = (value) => {
    const minutes = minutesOf(value)
    if (minutes === null) return true
    return minutes % GRID_MINUTES === 0
  }

  const submit = (event) => {
    event.preventDefault()

    if (!date) {
      setFormError('Pick the date of the block.')
      return
    }
    if (!onGrid(startTime) || !onGrid(endTime)) {
      setFormError(
        `Blocks move in ${GRID_MINUTES}-minute steps. Use 08:00, 08:10, 08:20 …`
      )
      return
    }

    const start = minutesOf(startTime)
    const end = minutesOf(endTime)
    if (start === null || end === null || end <= start) {
      setFormError('The end time must be later than the start time.')
      return
    }

    onSubmit({
      emp_id: Number(shift.emp_id),
      shift_date: date,
      shift_start: startTime,
      shift_end: endTime,
      unavailable,
    })
  }

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
      <form
        onSubmit={submit}
        className="bg-white rounded-lg border border-slate-200 w-full max-w-md max-h-[90vh] overflow-y-auto p-4 space-y-3"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Block #{shift.shift_id} · {shift.employee_name || `Employee #${shift.emp_id}`}
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {dateLabel || shift.shift_date} · {shift.status}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-6 h-6 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 flex items-center justify-center cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="space-y-2.5 text-xs font-medium">
          <div className="grid grid-cols-3 gap-2.5">
            <div className="col-span-3 sm:col-span-1">
              <label htmlFor="block-date" className="block font-semibold text-slate-700 mb-1">
                Date
              </label>
              <input
                id="block-date"
                type="date"
                value={date}
                disabled={locked}
                onChange={(event) => {
                  setDate(event.target.value)
                  setFormError('')
                }}
                className="w-full h-8 px-2 bg-slate-50 border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-brand-orange disabled:opacity-60"
              />
            </div>
            <div>
              <label htmlFor="block-start" className="block font-semibold text-slate-700 mb-1">
                Start
              </label>
              <input
                id="block-start"
                type="time"
                step={GRID_MINUTES * 60}
                value={startTime}
                disabled={locked}
                onChange={(event) => {
                  setStartTime(event.target.value)
                  setFormError('')
                }}
                className="w-full h-8 px-2 bg-slate-50 border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-brand-orange disabled:opacity-60"
              />
            </div>
            <div>
              <label htmlFor="block-end" className="block font-semibold text-slate-700 mb-1">
                End
              </label>
              <input
                id="block-end"
                type="time"
                step={GRID_MINUTES * 60}
                value={endTime}
                disabled={locked}
                onChange={(event) => {
                  setEndTime(event.target.value)
                  setFormError('')
                }}
                className="w-full h-8 px-2 bg-slate-50 border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-brand-orange disabled:opacity-60"
              />
            </div>
          </div>
          <p className="text-[10px] text-slate-400 font-normal">
            {fmtTime(startTime)} – {fmtTime(endTime)} · blocks land on {GRID_MINUTES}-minute steps and
            may not overlap another block for the same employee.
          </p>

          <label className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 cursor-pointer">
            <input
              type="checkbox"
              checked={unavailable}
              disabled={locked}
              onChange={(event) => {
                setUnavailable(event.target.checked)
                setFormError('')
              }}
              className="w-3.5 h-3.5 mt-0.5 accent-[#F97316] cursor-pointer disabled:opacity-50"
            />
            <span>
              <span className="block font-semibold text-slate-700">
                {unavailable ? 'Unavailable' : 'Available'} on this block
              </span>
              <span className="block text-[10px] text-slate-400 font-normal">
                Their class or personal conflict. Marking it
                unavailable stops the block from covering the shop, tells affected customers to
                reschedule, and alerts the admins to find a substitute.
              </span>
            </span>
          </label>

          {locked ? (
            <p className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              {lockMessage} A super admin may still override this change.
            </p>
          ) : null}

          {formError && (
            <p
              role="alert"
              className="text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 rounded px-2 py-1.5"
            >
              {formError}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2 pt-1.5">
            {onCancelBlock && (
              <button
                type="button"
                disabled={isSaving}
                onClick={() => onCancelBlock(shift)}
                className="h-8 px-3 rounded-md font-semibold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-600 hover:text-white transition-colors cursor-pointer text-xs disabled:opacity-50"
              >
                {isSaving ? 'Working…' : 'Cancel block'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 bg-slate-100 rounded-md font-semibold text-slate-600 hover:bg-slate-200 cursor-pointer text-xs"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={isSaving || locked}
              className="h-8 px-3 bg-brand-orange rounded-md font-semibold text-white hover:bg-brand-orange-dark cursor-pointer text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Saving…' : 'Save block'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
