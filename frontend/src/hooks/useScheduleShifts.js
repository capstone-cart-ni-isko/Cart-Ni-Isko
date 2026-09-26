import { useCallback, useEffect, useState } from 'react'
import { cancelShift, createShift, fetchShifts, updateShift } from '../services/shifts.js'

/**
 * Duty blocks for one date, read from GET /shifts. Nothing is kept in local
 * component state, so the list survives a page reload (the API is the only
 * source of truth) and stays correct after another admin writes a change.
 */
export function useScheduleShifts(dateKey) {
  const [shifts, setShifts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

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

  // DELETE /shifts/{id} - cancel a block
  const remove = useCallback(
    (shiftId) => run(shiftId, () => cancelShift(shiftId)),
    [run]
  )

  return { shifts, isLoading, error, busyId, reload, assign, amend, remove }
}
