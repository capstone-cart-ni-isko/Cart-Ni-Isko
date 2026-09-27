import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useAdmin } from '../../hooks/useAdmin.js'
import { useToast } from '../../hooks/useToast.js'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import ScheduleTimelineGrid from '../../components/admin/ScheduleTimelineGrid.jsx'
import StatusPill from '../../components/admin/StatusPill.jsx'
import ConfirmModal from '../../components/ui/ConfirmModal.jsx'
import Panel from '../../components/admin/kit/Panel.jsx'
import AdminPageHeader from '../../components/admin/kit/AdminPageHeader.jsx'
import Segmented from '../../components/admin/kit/Segmented.jsx'
import { BTN_PRIMARY_SM, BTN_SECONDARY_SM, ICON_BTN, INPUT, SELECT_SM, SCROLL_FADE, PAGE_ROOT } from '../../components/admin/kit/ui.js'

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
  'bg-isko-orange/15 text-isko-orange-dark',
  'bg-isko-blue/15 text-isko-blue-dark',
  'bg-slate-200 text-slate-700',
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
      <div className={PAGE_ROOT}>
        {/* Header: title + day navigation (assigning happens per staff row) */}
        <AdminPageHeader
          title="Staff Duty Schedule"
          subtitle="Customers can only book store time slots when enough staff are on shift."
        >
          {date !== dayKey(new Date()) && (
            <button
              type="button"
              onClick={() => setSelectedDate(startOfDay(new Date()))}
              className="h-8 px-2 text-xs font-semibold text-isko-blue hover:text-isko-blue-dark cursor-pointer"
            >
              Back to today
            </button>
          )}
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => shiftDate(-1)} aria-label="Previous day" className={ICON_BTN}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <span className="h-8 px-3 inline-flex items-center rounded-md bg-isko-blue/10 text-isko-blue-dark text-xs font-semibold whitespace-nowrap">
              {date === dayKey(new Date()) ? 'Today · ' : ''}
              {fmtLongDate(selectedDate)}
            </span>
            <button type="button" onClick={() => shiftDate(1)} aria-label="Next day" className={ICON_BTN}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
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
              className={`${SELECT_SM} pr-2.5`}
            />
          </div>
        </AdminPageHeader>

        {/* Staffing status for the selected day */}
        <Panel className="shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Bookable slots</span>
            <StatusPill
              status={`Order pickup · ${slots.length ? `${claimOpen} open` : 'none'}`}
              variant={slots.length > 0 && claimOk ? 'blue' : 'amber'}
            />
            <StatusPill
              status={`Walk-in visit · ${slots.length ? `${visitOpen} open` : 'none'}`}
              variant={slots.length > 0 && visitOk ? 'blue' : 'amber'}
            />
            <span className="text-[11px] text-slate-500">
              Pickup slots need 1 person on shift · walk-in visits need 2 at the same time
            </span>
            {!canEdit && (
              <span className="text-xs font-semibold text-slate-500 sm:ml-auto">
                {isPastDate ? 'Past date · view only' : 'Locked after 7:00 AM'}
              </span>
            )}
          </div>
        </Panel>

        {shiftsError && (
          <div className="shrink-0 flex items-center justify-between gap-3 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
            <p className="text-xs font-semibold text-rose-700">{shiftsError}</p>
            <button type="button" onClick={reloadDay} className={BTN_SECONDARY_SM}>
              Retry
            </button>
          </div>
        )}

        {/* Body: timeline over staff cards; each scrolls inside its panel */}
        <div className="grid grid-cols-1 gap-3 lg:flex-1 lg:min-h-0 lg:grid-rows-[minmax(0,1fr)_minmax(0,1fr)]">
          <Panel title="Timeline" meta="Click an empty hour to add a shift, or a shift to remove it" className="min-h-[16rem] lg:min-h-0">
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
          </Panel>

          <Panel
            title="Staff"
            meta={fmtLongDate(selectedDate)}
            className="min-h-[18rem] lg:min-h-0"
            actions={
              <Segmented
                size="sm"
                label="Filter staff"
                value={activeFilter}
                onChange={setActiveFilter}
                options={[
                  { value: 'all', label: 'All', count: officers.length },
                  { value: 'on', label: 'On duty', count: onDutyCount },
                  { value: 'off', label: 'Off duty', count: offDutyCount },
                ]}
              />
            }
          >
            {isLoadingOfficers ? (
              <div className="h-full flex items-center justify-center gap-2 text-xs font-semibold text-slate-500">
                <span className="spinner-circle !w-3.5 !h-3.5" /> Loading employees…
              </div>
            ) : officersError ? (
              <div className="flex items-center justify-between gap-3 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
                <p className="text-xs font-semibold text-rose-700">{officersError}</p>
                <button type="button" onClick={() => setRosterKey((k) => k + 1)} className={BTN_SECONDARY_SM}>
                  Retry
                </button>
              </div>
            ) : filteredOfficers.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                {officers.length === 0 ? 'No employee accounts found.' : 'No staff match this filter.'}
              </div>
            ) : (
              <div className={`h-full ${SCROLL_FADE}`}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {filteredOfficers.map((off) => {
                    const own = shifts.filter((s) => String(s.emp_id) === String(off.id))
                    const mayAssign = assignableOfficers.some((o) => String(o.id) === String(off.id))
                    return (
                      <div key={off.id} className="p-3 rounded-lg border border-slate-200 bg-slate-50/60 flex flex-col gap-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-[11px] shrink-0 ${off.avatarColor}`}>
                            {off.initials}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 text-xs truncate">{off.name}</p>
                            <p className="text-[11px] text-slate-500 truncate">{off.roleLabel}</p>
                          </div>
                        </div>

                        {own.length === 0 ? (
                          <StatusPill status="Off Duty" />
                        ) : (
                          <ul className="space-y-1.5">
                            {own.map((s) => (
                              <li
                                key={s.shift_id}
                                className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-md px-2.5 py-1.5"
                              >
                                <span className="min-w-0">
                                  <span className="block text-xs font-semibold text-slate-900">
                                    {timeLabel(s.shift_start)} – {timeLabel(s.shift_end)}
                                    {s.pending_replacement && (
                                      <span className="ml-1.5 text-[9px] font-bold uppercase text-rose-700 bg-rose-50 px-1 py-0.5 rounded">
                                        Pending replacement
                                      </span>
                                    )}
                                  </span>
                                  <span className="block text-[11px] text-slate-500 truncate">
                                    {titleCase(s.shift_type)}
                                    {s.shift_location ? ` · ${s.shift_location}` : ''}
                                  </span>
                                </span>
                                {canRemove(s) && (
                                  <button
                                    type="button"
                                    onClick={() => setRemoveTarget(s)}
                                    className="text-[11px] font-medium text-slate-400 hover:text-rose-600 cursor-pointer shrink-0"
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
                            className={`${BTN_PRIMARY_SM} w-full mt-auto`}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5" aria-hidden="true">
                              <line x1="12" y1="5" x2="12" y2="19" />
                              <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                            Assign Shift
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </Panel>
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
                  className={`${INPUT} h-8 text-xs`}
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
                    className={`${INPUT} h-8 text-xs`}
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
                    className={`${INPUT} h-8 text-xs`}
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
                  className={`${INPUT} h-8 text-xs`}
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
                  className={`${INPUT} h-8 text-xs`}
                />
              </div>

              {assignError && (
                <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-md p-2">{assignError}</p>
              )}

              <div className="flex justify-end gap-2 pt-1.5">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className={BTN_SECONDARY_SM}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAssigning || !selectedOfficerId}
                  className="h-8 px-3 bg-isko-orange rounded-md font-semibold text-white hover:bg-isko-orange-dark cursor-pointer text-xs disabled:opacity-50 disabled:cursor-not-allowed"
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
