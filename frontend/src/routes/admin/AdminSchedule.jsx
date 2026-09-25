import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useAdmin } from '../../hooks/useAdmin.js'
import { useToast } from '../../hooks/useToast.js'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import ScheduleTimelineGrid from '../../components/admin/ScheduleTimelineGrid.jsx'
import StatusPill from '../../components/admin/StatusPill.jsx'
import ConfirmModal from '../../components/ui/ConfirmModal.jsx'

import { fetchAccounts } from '../../services/accounts.js'
import { fetchSlots } from '../../services/appointments.js'
import { fetchShifts, assignShift, removeShift, timeLabel, DUTY_TYPES } from '../../services/duty.js'
import { createNotification } from '../../services/notifications.js'

// ── Date helpers ───────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0')
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d, n) => {
  const next = new Date(d)
  next.setDate(next.getDate() + n)
  return next
}
const fmtLongDate = (d) =>
  d.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })

// Shift times: store hours 8:00 AM - 6:00 PM in 30-minute steps
const TIME_OPTIONS = Array.from({ length: 21 }, (_, i) => {
  const minutes = 8 * 60 + i * 30
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
})

const AVATAR_COLORS = [
  'bg-orange-100 text-orange-700',
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-purple-100 text-purple-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
]

const errMsg = (err, fallback) => err?.message || fallback

const initialsFor = (name) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?'

const roleLabel = (empType) => {
  const t = String(empType || '').toUpperCase()
  if (t.includes('SUPER')) return 'Super Admin'
  if (t === 'ADMIN') return 'Admin'
  return 'Student Officer'
}

const titleCase = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/(^|\s)[a-z]/g, (c) => c.toUpperCase())

const LOCK_MESSAGE = 'This date can no longer be changed (the schedule locks at 7:00 AM on the day itself). Only a super admin can still edit it.'

export default function AdminSchedule() {
  const { currentAdminUser, isSuperAdmin } = useAdmin() || {}
  const { showToast } = useToast()
  const isAdmin = isSuperAdmin || currentAdminUser?.roleKey === 'ADMIN'

  const [activeFilter, setActiveFilter] = useState('all') // 'all' | 'on' | 'off'
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()))
  const date = dayKey(selectedDate)

  // Staff roster (REQ-SS-01)
  const [officers, setOfficers] = useState([])
  const [isLoadingOfficers, setIsLoadingOfficers] = useState(true)
  const [officersError, setOfficersError] = useState('')
  const [rosterKey, setRosterKey] = useState(0)

  // The selected day's shifts + slot staffing (REQ-SS-03)
  const [shifts, setShifts] = useState([])
  const [locked, setLocked] = useState(false)
  const [shiftsError, setShiftsError] = useState('')
  const [slots, setSlots] = useState([])
  const [dayKeyVersion, setDayKeyVersion] = useState(0)

  // Assign modal
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [selectedOfficerId, setSelectedOfficerId] = useState('')
  const [shiftType, setShiftType] = useState(DUTY_TYPES[0].value)
  const [shiftStart, setShiftStart] = useState('08:00')
  const [shiftEnd, setShiftEnd] = useState('12:00')
  const [dutyLocation, setDutyLocation] = useState('Main Counter')
  const [assignError, setAssignError] = useState('')
  const [isAssigning, setIsAssigning] = useState(false)

  const [removeTarget, setRemoveTarget] = useState(null)

  const notifiedShortfallRef = useRef(new Set())

  // ── Load employee roster ──
  useEffect(() => {
    let cancelled = false
    setIsLoadingOfficers(true)
    setOfficersError('')
    fetchAccounts({ account_type: 'employee' })
      .then((payload) => {
        if (cancelled) return
        const rows = Array.isArray(payload)
          ? payload.filter((r) => r.emp_id != null)
          : Array.isArray(payload?.employees)
          ? payload.employees
          : []
        setOfficers(
          rows
            .filter((r) => !r.emp_deleted && !r.emp_disabled)
            .map((r, idx) => {
              const name =
                `${r.emp_givname || ''} ${r.emp_surname || ''}`.trim() || r.emp_email || `Employee #${r.emp_id}`
              return {
                id: r.emp_id,
                name,
                initials: initialsFor(name),
                avatarColor: AVATAR_COLORS[idx % AVATAR_COLORS.length],
                roleLabel: roleLabel(r.emp_type),
              }
            })
        )
        setIsLoadingOfficers(false)
      })
      .catch((err) => {
        if (cancelled) return
        setOfficers([])
        setOfficersError(errMsg(err, 'Unable to load employees.'))
        setIsLoadingOfficers(false)
      })
    return () => {
      cancelled = true
    }
  }, [rosterKey])

  // ── Load the selected day's shifts and slot staffing ──
  useEffect(() => {
    let cancelled = false
    setShiftsError('')
    fetchShifts(date)
      .then((res) => {
        if (cancelled) return
        setShifts(res.shifts)
        setLocked(res.locked)
      })
      .catch((err) => {
        if (cancelled) return
        setShifts([])
        setShiftsError(errMsg(err, 'Unable to load the duty schedule.'))
      })
    fetchSlots(date)
      .then((rows) => {
        if (!cancelled) setSlots(Array.isArray(rows) ? rows : [])
      })
      .catch(() => {
        if (!cancelled) setSlots([])
      })
    return () => {
      cancelled = true
    }
  }, [date, dayKeyVersion])

  const reloadDay = useCallback(() => setDayKeyVersion((k) => k + 1), [])

  // ── Staffing thresholds (REQ-SS-03: VISIT needs 2 on shift, CLAIM needs 1) ──
  const visitOpen = useMemo(() => slots.filter((s) => s.type === 'VISIT' && s.available).length, [slots])
  const claimOpen = useMemo(() => slots.filter((s) => s.type === 'CLAIM' && s.available).length, [slots])
  const visitOk = slots.length > 0 && visitOpen > 0
  const claimOk = slots.length > 0 && claimOpen > 0
  const isPastDate = selectedDate.getTime() < startOfDay(new Date()).getTime()
  const hasShortfall = slots.length > 0 && !isPastDate && (!visitOk || !claimOk)

  // Notify super admins once per day/kind when no slot can be staffed (REQ-SS-03)
  useEffect(() => {
    if (!hasShortfall || officers.length === 0) return
    const superAdmins = officers.filter((o) => o.roleLabel === 'Super Admin')
    if (superAdmins.length === 0) return
    const kind = !claimOk ? 'claim' : 'visit'
    const key = `${date}-${kind}`
    if (notifiedShortfallRef.current.has(key)) return
    notifiedShortfallRef.current.add(key)
    const msg = !claimOk
      ? `[PRIORITY] No staff scheduled for order pickups on ${fmtLongDate(selectedDate)} (at least 1 person must be on shift).`
      : `[PRIORITY] Walk-in visits unavailable on ${fmtLongDate(selectedDate)} (at least 2 people must be on shift at the same time).`
    superAdmins.forEach((sa) => {
      createNotification('employee', sa.id, msg).catch(() => {})
    })
  }, [hasShortfall, claimOk, officers, selectedDate, date])

  const canEdit = !locked && !isPastDate

  // Staff members may only schedule themselves
  const assignableOfficers = isAdmin
    ? officers
    : officers.filter((o) => String(o.id) === String(currentAdminUser?.id))

  const onDutyIds = useMemo(() => new Set(shifts.map((s) => String(s.emp_id))), [shifts])
  const onDutyCount = officers.filter((o) => onDutyIds.has(String(o.id))).length
  const offDutyCount = officers.length - onDutyCount
  const filteredOfficers = officers.filter((o) => {
    if (activeFilter === 'on') return onDutyIds.has(String(o.id))
    if (activeFilter === 'off') return !onDutyIds.has(String(o.id))
    return true
  })

  const shiftDate = (delta) => setSelectedDate((d) => addDays(d, delta))

  const openAssign = (officerId, start = '08:00') => {
    if (!canEdit) {
      showToast(isPastDate ? 'Past dates can no longer be scheduled.' : LOCK_MESSAGE, 'error')
      return
    }
    const allowed = assignableOfficers.some((o) => String(o.id) === String(officerId))
    setSelectedOfficerId(allowed ? officerId : assignableOfficers[0]?.id || '')
    const startIdx = Math.max(0, TIME_OPTIONS.indexOf(start))
    setShiftStart(TIME_OPTIONS[Math.min(startIdx, TIME_OPTIONS.length - 2)])
    setShiftEnd(TIME_OPTIONS[Math.min(startIdx + 8, TIME_OPTIONS.length - 1)]) // 4 hours by default
    setAssignError('')
    setShowAssignModal(true)
  }

  const handleAssignSubmit = async (e) => {
    e.preventDefault()
    if (!selectedOfficerId) return
    if (shiftEnd <= shiftStart) {
      setAssignError('The shift must end after it starts.')
      return
    }
    setIsAssigning(true)
    setAssignError('')
    try {
      await assignShift({
        emp_id: Number(selectedOfficerId),
        shift_date: date,
        shift_start: shiftStart,
        shift_end: shiftEnd,
        shift_type: shiftType,
        shift_location: dutyLocation.trim(),
      })
      const target = officers.find((o) => String(o.id) === String(selectedOfficerId))
      setShowAssignModal(false)
      showToast(
        `${target?.name || 'Officer'} is on duty ${timeLabel(shiftStart)} – ${timeLabel(shiftEnd)}.`,
        'success'
      )
      reloadDay()
    } catch (err) {
      // Overlaps, store hours and the 7:00 AM lock are enforced server-side
      setAssignError(errMsg(err, 'Failed to assign the duty.'))
    } finally {
      setIsAssigning(false)
    }
  }

  const handleConfirmRemove = async () => {
    const shift = removeTarget
    setRemoveTarget(null)
    if (!shift) return
    try {
      await removeShift(shift.shift_id)
      showToast(`Removed ${shift.emp_name}'s shift.`, 'success')
      reloadDay()
    } catch (err) {
      showToast(errMsg(err, 'Failed to remove the shift.'), 'error')
    }
  }

  const canRemove = (shift) =>
    canEdit && (isAdmin || String(shift.emp_id) === String(currentAdminUser?.id))

  return (
    <AdminLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
              Staff Duty Schedule
            </h1>
            <p className="text-xs text-slate-500 font-normal mt-0.5">
              Customers can only book store time slots when enough staff are on shift.
            </p>
          </div>

          <button
            type="button"
            onClick={() => openAssign(isAdmin ? officers[0]?.id : currentAdminUser?.id)}
            disabled={assignableOfficers.length === 0}
            className="h-8 px-3 bg-brand-orange hover:bg-brand-orange-dark text-white font-semibold text-xs rounded-md flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed w-fit"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Assign Duty</span>
          </button>
        </div>

        {/* Date navigator */}
        <div className="bg-white rounded-lg p-3 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => shiftDate(-1)}
              aria-label="Previous day"
              className="w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 hover:bg-slate-50 text-slate-500 cursor-pointer"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <span className="px-2.5 py-1 bg-slate-50 rounded-md text-xs font-semibold text-slate-900 border border-slate-200">
              {date === dayKey(new Date()) ? 'Today: ' : ''}
              {fmtLongDate(selectedDate)}
            </span>
            <button
              type="button"
              onClick={() => shiftDate(1)}
              aria-label="Next day"
              className="w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 hover:bg-slate-50 text-slate-500 cursor-pointer"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
            <input
              type="date"
              value={date}
              onChange={(e) => {
                const [y, m, d] = e.target.value.split('-').map(Number)
                if (y && m && d) setSelectedDate(new Date(y, m - 1, d))
              }}
              aria-label="Pick a date"
              className="h-7 px-2 rounded-md border border-slate-200 text-xs text-slate-700"
            />
          </div>
          {date !== dayKey(new Date()) && (
            <button
              type="button"
              onClick={() => setSelectedDate(startOfDay(new Date()))}
              className="text-xs font-semibold text-brand-orange hover:underline cursor-pointer w-fit"
            >
              Back to today
            </button>
          )}
        </div>

        {/* Staffing status for the selected day */}
        <div className="bg-white rounded-lg p-3 border border-slate-200 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 flex-wrap">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Bookable slots</span>
          <StatusPill
            status={`Order pickup · ${slots.length ? `${claimOpen} open` : '—'}`}
            variant={slots.length === 0 ? 'amber' : claimOk ? 'green' : 'red'}
          />
          <StatusPill
            status={`Walk-in visit · ${slots.length ? `${visitOpen} open` : '—'}`}
            variant={slots.length === 0 ? 'amber' : visitOk ? 'green' : 'red'}
          />
          <span className="text-[11px] text-slate-500">
            Pickup slots need 1 person on shift · walk-in visits need 2 at the same time
          </span>
          {!canEdit && (
            <span className="text-xs font-semibold text-slate-500 sm:ml-auto">
              🔒 {isPastDate ? 'Past date — view only' : 'Locked after 7:00 AM'}
            </span>
          )}
        </div>

        {shiftsError && (
          <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            <p className="text-xs font-semibold text-red-700">{shiftsError}</p>
            <button
              type="button"
              onClick={reloadDay}
              className="text-xs font-bold text-red-700 border border-red-300 rounded-md px-2 py-1 hover:bg-red-100 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Timeline */}
        <ScheduleTimelineGrid
          officers={officers}
          shifts={shifts}
          disabled={!canEdit}
          onEmptyClick={(off, start) => openAssign(off.id, start)}
          onShiftClick={(shift) => {
            if (canRemove(shift)) setRemoveTarget(shift)
            else
              showToast(
                `${shift.emp_name}: ${titleCase(shift.shift_type)}, ${timeLabel(shift.shift_start)} – ${timeLabel(shift.shift_end)}${
                  shift.shift_location ? ` at ${shift.shift_location}` : ''
                }`,
                'info'
              )
          }}
        />

        {/* Staff cards */}
        <div className="bg-white rounded-lg p-4 border border-slate-200 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Staff on {fmtLongDate(selectedDate)}</h2>
              <p className="text-[11px] text-slate-400 font-normal mt-0.5">
                Click a shift to remove it, or an empty hour on the timeline to add one.
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              {[
                ['all', `All (${officers.length})`, 'bg-brand-orange'],
                ['on', `On Duty (${onDutyCount})`, 'bg-emerald-600'],
                ['off', `Off Duty (${offDutyCount})`, 'bg-rose-600'],
              ].map(([key, label, active]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveFilter(key)}
                  className={`h-7 px-2.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                    activeFilter === key ? `${active} text-white` : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {isLoadingOfficers ? (
            <div className="py-10 text-center text-xs font-semibold text-slate-500 flex items-center justify-center gap-2">
              <span className="spinner-circle !w-3.5 !h-3.5" /> Loading employees…
            </div>
          ) : officersError ? (
            <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              <p className="text-xs font-semibold text-red-700">{officersError}</p>
              <button
                type="button"
                onClick={() => setRosterKey((k) => k + 1)}
                className="text-xs font-bold text-red-700 border border-red-300 rounded-md px-2 py-1 hover:bg-red-100 cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : filteredOfficers.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              {officers.length === 0 ? 'No employee accounts found.' : 'No staff match this filter.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {filteredOfficers.map((off) => {
                const own = shifts.filter((s) => String(s.emp_id) === String(off.id))
                const mayAssign = assignableOfficers.some((o) => String(o.id) === String(off.id))
                return (
                  <div
                    key={off.id}
                    className="p-4 rounded-2xl border border-gray-100 bg-gray-50/50 flex flex-col gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-xs shrink-0 ${off.avatarColor}`}
                      >
                        {off.initials}
                      </div>
                      <div className="min-w-0">
                        <p className="font-black text-gray-900 text-xs truncate">{off.name}</p>
                        <p className="text-[10px] text-gray-500 font-semibold truncate">{off.roleLabel}</p>
                      </div>
                    </div>

                    {own.length === 0 ? (
                      <StatusPill status="Off Duty" />
                    ) : (
                      <ul className="space-y-1.5">
                        {own.map((s) => (
                          <li
                            key={s.shift_id}
                            className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5"
                          >
                            <span className="min-w-0">
                              <span className="block text-xs font-bold text-slate-900">
                                {timeLabel(s.shift_start)} – {timeLabel(s.shift_end)}
                              </span>
                              <span className="block text-[10px] text-slate-500 truncate">
                                {titleCase(s.shift_type)}
                                {s.shift_location ? ` · ${s.shift_location}` : ''}
                              </span>
                            </span>
                            {canRemove(s) && (
                              <button
                                type="button"
                                onClick={() => setRemoveTarget(s)}
                                className="text-[10px] font-semibold text-slate-400 hover:text-rose-600 cursor-pointer shrink-0"
                              >
                                Remove
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}

                    {mayAssign && (
                      <button
                        type="button"
                        onClick={() => openAssign(off.id)}
                        disabled={!canEdit}
                        className="w-full py-2 bg-white hover:bg-brand-orange hover:text-white text-gray-700 font-bold text-xs rounded-xl border border-gray-200 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:text-gray-700"
                      >
                        + Assign Shift
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Assign Duty Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
          <div className="bg-white rounded-lg p-4 max-w-sm w-full border border-slate-200 space-y-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Assign Duty</h3>
              <p className="text-[11px] text-slate-500">{fmtLongDate(selectedDate)}</p>
            </div>
            <form onSubmit={handleAssignSubmit} className="space-y-2.5 text-xs font-medium">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Staff member</label>
                <select
                  value={selectedOfficerId}
                  onChange={(e) => setSelectedOfficerId(e.target.value)}
                  className="w-full h-8 px-2.5 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-orange text-xs"
                >
                  {assignableOfficers.map((off) => (
                    <option key={off.id} value={off.id}>
                      {off.name} ({off.roleLabel})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Start</label>
                  <select
                    value={shiftStart}
                    onChange={(e) => setShiftStart(e.target.value)}
                    className="w-full h-8 px-2.5 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-orange text-xs"
                  >
                    {TIME_OPTIONS.slice(0, -1).map((t) => (
                      <option key={t} value={t}>{timeLabel(t)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">End</label>
                  <select
                    value={shiftEnd}
                    onChange={(e) => setShiftEnd(e.target.value)}
                    className="w-full h-8 px-2.5 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-orange text-xs"
                  >
                    {TIME_OPTIONS.filter((t) => t > shiftStart).map((t) => (
                      <option key={t} value={t}>{timeLabel(t)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Duty type</label>
                <select
                  value={shiftType}
                  onChange={(e) => setShiftType(e.target.value)}
                  className="w-full h-8 px-2.5 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-orange text-xs"
                >
                  {DUTY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Location (optional)</label>
                <input
                  type="text"
                  value={dutyLocation}
                  maxLength={100}
                  onChange={(e) => setDutyLocation(e.target.value)}
                  placeholder="e.g. Main Counter"
                  className="w-full h-8 px-2.5 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-orange text-xs"
                />
              </div>

              {assignError && (
                <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-md p-2">{assignError}</p>
              )}

              <div className="flex justify-end gap-2 pt-1.5">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="h-8 px-3 bg-slate-100 rounded-md font-semibold text-slate-600 hover:bg-slate-200 cursor-pointer text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAssigning || !selectedOfficerId}
                  className="h-8 px-3 bg-brand-orange rounded-md font-semibold text-white hover:bg-brand-orange-dark cursor-pointer text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isAssigning ? 'Assigning…' : 'Assign Shift'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={handleConfirmRemove}
        title="Remove this shift?"
        message={
          removeTarget
            ? `${removeTarget.emp_name} · ${timeLabel(removeTarget.shift_start)} – ${timeLabel(removeTarget.shift_end)}. Customers will no longer be able to book slots that depend on this shift.`
            : ''
        }
        confirmText="Remove Shift"
      />
    </AdminLayout>
  )
}
