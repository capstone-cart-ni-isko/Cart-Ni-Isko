import { useCallback, useEffect, useState } from 'react'
import { cancelShift, createShift, fetchShifts, setShiftUnavailable, updateShift } from '../services/shifts.js'
import { SHIFT_STATUS } from '../services/shifts.js'

/**
 * Duty blocks for one date, read from GET /shifts. Nothing is kept in local
 * component state, so the list survives a page reload (the API is the only
 * source of truth) and stays correct after another admin writes a change.
 *
 * `pendingReplacements` is the FLOW-EMP_SCHED-06/07 cover queue: every block
 * the API derived as PENDING REPLACEMENT, across the whole roster, because a
 * substitute may be found on a different day than the shortage.
 */
export function useScheduleShifts(dateKey, { includePending = true } = {}) {
  const [shifts, setShifts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [pendingReplacements, setPendingReplacements] = useState([])
  const [isLoadingPending, setIsLoadingPending] = useState(false)

  const reload = useCallback(() => setReloadKey((key) => key + 1), [])

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError('')

    fetchShifts({ date: dateKey })
      .then((rows) => {
        if (cancelled) return
        setShifts(rows)
        setIsLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setShifts([])
        setError(err?.message || 'Unable to load duty shifts.')
        setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [dateKey, reloadKey])

  useEffect(() => {
    if (!includePending) {
      setPendingReplacements([])
      return undefined
    }

    let cancelled = false
    setIsLoadingPending(true)

    fetchShifts({ status: SHIFT_STATUS.PENDING_REPLACEMENT })
      .then((rows) => {
        if (cancelled) return
        setPendingReplacements(rows)
        setIsLoadingPending(false)
      })
      .catch(() => {
        if (!cancelled) {
          setPendingReplacements([])
          setIsLoadingPending(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [includePending, reloadKey])

  // Every write reports back through onError so the page can raise a toast.
  const run = useCallback(
    async (busyKey, action) => {
      setBusyId(busyKey)
      try {
        await action()
        reload()
        return null
      } catch (err) {
        return err?.message || 'The shift request failed.'
      } finally {
        setBusyId(null)
      }
    },
    [reload]
  )

  // POST /shifts - assign a block
  const assign = useCallback(
    (payload) => run('new', () => createShift(payload)),
    [run]
  )

  // PUT /shifts/{id} - amend a block, optionally with emp_instore
  const amend = useCallback(
    (shiftId, changes) => run(shiftId, () => updateShift(shiftId, changes)),
    [run]
  )

  // PUT /shifts/{id} - FLOW-EMP_SCHED-04: flag one block unavailable
  const setUnavailable = useCallback(
    (shiftId, unavailable) => run(shiftId, () => setShiftUnavailable(shiftId, unavailable)),
    [run]
  )

  // DELETE /shifts/{id} - cancel a block
  const remove = useCallback(
    (shiftId) => run(shiftId, () => cancelShift(shiftId)),
    [run]
  )

  return {
    shifts,
    isLoading,
    error,
    busyId,
    reload,
    assign,
    amend,
    setUnavailable,
    remove,
    pendingReplacements,
    isLoadingPending,
  }
}
