import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchAccounts, updateAccount } from '../services/accounts.js'

// ── Shared formatting helpers ───────────────────────────────────────────────
const AVATAR_COLORS = [
  'bg-orange-100 text-orange-700',
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-purple-100 text-purple-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
]

const initialsFor = (name) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('') || '?'

const roleLabel = (empType) => {
  const type = String(empType || '').toUpperCase()
  if (type.includes('SUPER')) return 'Super Admin'
  if (type === 'ADMIN') return 'Admin'
  return 'Student Officer'
}

const isOnDuty = (value) => value === true || value === 1 || value === '1'

// Maps one employee row into the shape every schedule component expects
const toOfficer = (row, index) => {
  const name =
    `${row.emp_givname || ''} ${row.emp_surname || ''}`.trim() ||
    row.emp_email ||
    `Employee #${row.emp_id}`
  const inStore = isOnDuty(row.emp_instore)

  return {
    id: row.emp_id,
    name,
    initials: initialsFor(name),
    avatarColor: AVATAR_COLORS[index % AVATAR_COLORS.length],
    available: inStore,
    // NB: avoid the word "available" — StatusPill matches it as green.
    availability: inStore ? 'On Duty' : 'Off Duty',
    roleLabel: roleLabel(row.emp_type),
    empType: row.emp_type,
    raw: row,
  }
}

/**
 * Staff roster for the schedule page (REQ-SS-01). Availability lives on
 * emp_instore, and the API is the only source of truth: the row is refetched
 * after every change so a page reload always shows the stored value.
 */
export function useScheduleRoster() {
  const [officers, setOfficers] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  const reload = useCallback(() => setReloadKey((key) => key + 1), [])

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError('')

    fetchAccounts({ account_type: 'employee' })
      .then((payload) => {
        if (cancelled) return
        const rows = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.employees)
          ? payload.employees
          : []
        setOfficers(
          rows
            .filter((row) => row.emp_id != null && !row.emp_deleted)
            .map(toOfficer)
        )
        setIsLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setOfficers([])
        setError(err?.message || 'Unable to load employees.')
        setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [reloadKey])

  // Flips emp_instore through PUT /accounts/update and refreshes from the API.
  // REQ-SS-02 (the block-start deadline) is enforced server-side, so the API
  // error message is what the page shows.
  const setDuty = useCallback(
    async (officerId, inStore) => {
      setSavingId(officerId)
      try {
        await updateAccount('employee', officerId, { emp_instore: inStore })
        reload()
        return null
      } catch (err) {
        return err?.message || 'Failed to update duty status.'
      } finally {
        setSavingId(null)
      }
    },
    [reload]
  )

  const onDutyCount = useMemo(
    () => officers.filter((officer) => officer.available).length,
    [officers]
  )

  return {
    officers,
    isLoading,
    error,
    savingId,
    reload,
    setDuty,
    onDutyCount,
    offDutyCount: officers.length - onDutyCount,
  }
}
