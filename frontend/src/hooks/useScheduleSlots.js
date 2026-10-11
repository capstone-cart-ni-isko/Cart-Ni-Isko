import { useEffect, useState } from 'react'
import { fetchSlots, SLOT_RULES } from '../services/appointments.js'

/** Minimal defensive slot row (GET /appoint/slots field names still evolving). */
const normalizeSlotRow = (raw) => {
  const isClaim = String(raw?.type ?? raw?.appoint_type ?? 'VISIT').toUpperCase() === 'CLAIM'
  const type = isClaim ? 'CLAIM' : 'VISIT'
  const capacity = Number(raw?.capacity ?? SLOT_RULES[type].capacity)
  const occupied = Number(raw?.occupied ?? raw?.booked ?? raw?.count ?? 0)
  const reason = raw?.reason || ''
  const isFull = Number.isFinite(capacity) && occupied >= capacity

  return { type, available: raw?.available !== false && !reason && !isFull }
}

/**
 * Bookable slots for one date, used only for the REQ-SS-03 staffing
 * thresholds. A failed request leaves the list empty so the thresholds read
 * as "unverified" instead of showing a false shortfall.
 */
export function useScheduleSlots(dateKey) {
  const [slots, setSlots] = useState([])

  useEffect(() => {
    let cancelled = false

    fetchSlots(dateKey)
      .then((payload) => {
        if (cancelled) return
        const rows = Array.isArray(payload) ? payload : payload?.data || []
        setSlots(rows.map(normalizeSlotRow))
      })
      .catch(() => {
        if (!cancelled) setSlots([])
      })

    return () => {
      cancelled = true
    }
  }, [dateKey])

  return slots
}
