import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAdmin } from '../../hooks/useAdmin.js'
import { useToast } from '../../hooks/useToast.js'
import { useApiChange } from '../../hooks/useApiChange.js'
import { fetchMyAccount, updateAccount } from '../../services/accounts.js'
import { fetchShifts, setShiftUnavailable } from '../../services/shifts.js'
import Modal from '../ui/Modal.jsx'
import Button from '../ui/Button.jsx'

/**
 * DOMAIN 7 / FLOW-EMP_SCHED-04 + REQ-SS-03 — the docked sidebar's
 * "clock in / clock out" entry (above Logout).
 *
 * WHAT IT SHOWS
 * The signed-in employee's own schedule for today, read straight from
 * GET /shifts?emp_id=me&date=today, plus their own in-store flag
 * (emp_instore / emp_present from GET /accounts/me):
 *   • "On duty until 17:00"   — a staffed block covers right now
 *   • "Scheduled 13:00–17:00" — the next staffed block is still ahead
 *   • "No shift scheduled today"
 *
 * WHAT IT DOES
 *   • Clock In  → marks the employee in store (PUT /accounts/update) and clears
 *     any early time-out exception on their still-running blocks, so the block
 *     staffs the roster again.
 *   • Clock Out → the "request to time out ahead of schedule": marks the
 *     employee out of store AND flags every not-yet-finished block
 *     `unavailable`, which is exactly FLOW-EMP_SCHED-04's exception and what
 *     raises the substitute request the super admins are alerted to (REQ-SS-03).
 *
 * Nothing is stored outside the columns that already exist: the blocks live in
 * `schedules` and the presence flag on `employee`, so no new table or row shape
 * is introduced. All writes go through the backend API only.
 */

const ICON = 'w-4 h-4'

/** 'HH:MM' → minutes after midnight (null when unreadable). */
const minutesOf = (value) => {
  const [hours, minutes] = String(value || '').split(':').map(Number)
  return Number.isFinite(hours) ? hours * 60 + (Number.isFinite(minutes) ? minutes : 0) : null
}

const nowMinutes = () => {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}

const localDateKey = () => {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** 12-hour label for a 'HH:MM' block edge ('17:00' → '5:00 PM'). */
const clockLabel = (value) => {
  const minutes = minutesOf(value)
  if (minutes === null) return '—'
  const hour24 = Math.floor(minutes / 60)
  const minute = String(minutes % 60).padStart(2, '0')
  const suffix = hour24 < 12 ? 'AM' : 'PM'
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return `${hour12}:${minute} ${suffix}`
}

export default function ClockInOut() {
  const { currentAdminUser } = useAdmin()
  const { showToast } = useToast()

  const empId = currentAdminUser?.emp_id ?? currentAdminUser?.id ?? null

  const [isLoading, setIsLoading] = useState(true)
  const [isBusy, setIsBusy] = useState(false)
  const [confirmingOut, setConfirmingOut] = useState(false)
  const [inStore, setInStore] = useState(false)
  const [blocks, setBlocks] = useState([])

  const load = useCallback(async () => {
    if (!empId) {
      setInStore(false)
      setBlocks([])
      setIsLoading(false)
      return
    }

    try {
      // Both reads are the employee's OWN data: the roster never exposes
      // another employee's availability through this entry.
      const [account, rows] = await Promise.all([
        fetchMyAccount().catch(() => null),
        fetchShifts({ emp_id: empId, date: localDateKey() }).catch(() => []),
      ])

      setInStore(Boolean(account?.emp_instore ?? account?.emp_present ?? false))
      setBlocks(Array.isArray(rows) ? rows : [])
    } catch {
      // A failed read keeps the previous state on screen; the API stays the
      // single source of truth and the next poll repairs it.
    } finally {
      setIsLoading(false)
    }
  }, [empId])

  // Keep the entry live: a schedule or availability changed on another screen
  // (or by a super admin) shows up here within a minute - and at once when the
  // realtime layer pings (a shift edit, a roster rebuild, a clock-in elsewhere).
  const version = useApiChange(['shifts', 'accounts', 'access'])

  useEffect(() => {
    load()
  }, [load, version])

  useEffect(() => {
    if (!empId) return undefined
    const timer = setInterval(load, 60000)
    return () => clearInterval(timer)
  }, [empId, load])

  const { current, next, remaining } = useMemo(() => {
    const now = nowMinutes()
    const staffed = blocks
      .filter((block) => block && !block.unavailable)
      .slice()
      .sort((a, b) => String(a.shift_start).localeCompare(String(b.shift_start)))

    const toEnd = (block) => minutesOf(block.shift_end) ?? 0

    return {
      current: staffed.find(
        (block) =>
          (minutesOf(block.shift_start) ?? 0) <= now && now < (minutesOf(block.shift_end) ?? 0)
      ),
      next: staffed.find((block) => (minutesOf(block.shift_start) ?? 0) > now),
      // Every staffed block that has not finished yet: the ones an early
      // time-out has to hand over to a substitute.
      remaining: staffed.filter((block) => toEnd(block) > now),
    }
  }, [blocks])

  const statusLabel = current
    ? `On duty until ${clockLabel(current.shift_end)}`
    : next
      ? `Scheduled ${clockLabel(next.shift_start)}–${clockLabel(next.shift_end)}`
      : 'No shift scheduled today'

  // Only an employee who is either in store (must be able to leave) or holds a
  // staffed block today (must be able to start) gets an actionable button.
  const canAct = inStore || remaining.length > 0 || Boolean(next)
  const isClockingOut = inStore

  const handleClockIn = async () => {
    if (isBusy) return
    setIsBusy(true)
    try {
      await updateAccount('employee', empId, { emp_instore: true })

      // Returning clears the early time-out exception on the blocks that are
      // still ahead, so they staff the roster again (FLOW-EMP_SCHED-04).
      const flagged = blocks.filter(
        (block) => block.unavailable && (minutesOf(block.shift_end) ?? 0) > nowMinutes()
      )
      for (const block of flagged) {
        await setShiftUnavailable(block.shift_id, false).catch(() => {})
      }

      await load()
      showToast('You are clocked in and on duty.', 'success')
    } catch (err) {
      showToast(err?.message || 'Could not clock you in. Please try again.', 'error')
    } finally {
      setIsBusy(false)
    }
  }

  const handleClockOut = async () => {
    if (isBusy) return
    setIsBusy(true)
    try {
      await updateAccount('employee', empId, { emp_instore: false })

      // The request itself: every block that has not finished stops staffing
      // the roster, which is what alerts the super admins to find a
      // substitute (REQ-SS-03 / FLOW-EMP_SCHED-06-07).
      const handedOver = []
      for (const block of remaining) {
        if (block.unavailable) continue
        await setShiftUnavailable(block.shift_id, true).catch(() => {})
        handedOver.push(`${clockLabel(block.shift_start)}–${clockLabel(block.shift_end)}`)
      }

      setConfirmingOut(false)
      await load()
      showToast(
        handedOver.length > 0
          ? `Time-out requested. ${handedOver.join(', ')} needs a substitute — super admins were alerted.`
          : 'You are clocked out of the store.',
        'success'
      )
    } catch (err) {
      showToast(err?.message || 'Could not clock you out. Please try again.', 'error')
    } finally {
      setIsBusy(false)
    }
  }

  if (isLoading) {
    return (
      <p className="px-2.5 py-1.5 text-2xs font-semibold text-gray-400 flex items-center gap-2">
        <span className="spinner-circle !w-3.5 !h-3.5 shrink-0" /> Loading your schedule…
      </p>
    )
  }

  return (
    <div className="space-y-1">
      <p className="px-2.5 text-2xs font-bold uppercase tracking-wider text-gray-400">
        {statusLabel}
      </p>

      {isClockingOut ? (
        <button
          type="button"
          onClick={() => setConfirmingOut(true)}
          disabled={isBusy}
          className="flex items-center w-full gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] font-semibold text-rose-600 hover:bg-rose-50 transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          title="Mark yourself out of the store and hand your remaining blocks to a substitute"
        >
          <span className="shrink-0 flex justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
              <circle cx="12" cy="12" r="9" />
              <polyline points="12 7 12 12 15.5 14" />
            </svg>
          </span>
          <span className="truncate">{isBusy ? 'Saving…' : 'Clock Out'}</span>
          {isBusy && <span className="spinner-circle !w-3.5 !h-3.5 shrink-0 ml-auto" />}
        </button>
      ) : (
        <button
          type="button"
          onClick={handleClockIn}
          disabled={isBusy || !canAct}
          className="flex items-center w-full gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] font-semibold text-emerald-700 hover:bg-emerald-50 transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          title={
            canAct
              ? 'Mark yourself in the store for your scheduled block'
              : 'You have no scheduled block today — a super admin preschedules you from the Schedules screen'
          }
        >
          <span className="shrink-0 flex justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
              <circle cx="12" cy="12" r="9" />
              <polyline points="12 7 12 12 15.5 14" />
            </svg>
          </span>
          <span className="truncate">{isBusy ? 'Saving…' : 'Clock In'}</span>
          {isBusy && <span className="spinner-circle !w-3.5 !h-3.5 shrink-0 ml-auto" />}
        </button>
      )}

      {/* Confirmation: an early time-out is a roster change other people feel,
          so it is never a one-click action (REQ-SS-02 / REQ-SS-03).
          Shared popup shell - same look as every other dialog in the system. */}
      {confirmingOut && (
        <Modal
          isOpen={confirmingOut}
          onClose={() => setConfirmingOut(false)}
          title="Request to time out?"
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirmingOut(false)} className="px-3.5">
                Cancel
              </Button>
              <Button variant="danger" onClick={handleClockOut} className="px-3.5">
                Time out
              </Button>
            </>
          }
        >
          <p className="text-sm text-gray-600 font-medium leading-relaxed">
            You will be marked out of the store, and your remaining duty shift
            {remaining.length === 1 ? '' : 's'} today will be flagged so a supervisor can assign a replacement if needed.
          </p>
        </Modal>
      )}
    </div>
  )
}
