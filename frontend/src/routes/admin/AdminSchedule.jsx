import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useAdmin } from '../../hooks/useAdmin.js'
import { useToast } from '../../hooks/useToast.js'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import ScheduleTimelineGrid from '../../components/admin/ScheduleTimelineGrid.jsx'
import DrawerPanel from '../../components/admin/DrawerPanel.jsx'
import StatusPill from '../../components/admin/StatusPill.jsx'

import { fetchAccounts, updateAccount } from '../../services/accounts.js'
import { fetchSlots, SLOT_RULES } from '../../services/appointments.js'
import { logAction } from '../../services/access.js'
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
  d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

const AVATAR_COLORS = [
  'bg-orange-100 text-orange-700',
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-purple-100 text-purple-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
]

const errMsg = (err, fallback) => err?.message || fallback

const isOnDuty = (v) => v === true || v === 1 || v === '1'

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

/** Minimal defensive slot row (GET /appoint/slots field names still evolving). */
const normalizeSlotRow = (raw) => {
  const t = String(raw?.type ?? raw?.appoint_type ?? raw?.slot_type ?? 'VISIT').toUpperCase()
  const type = t === 'CLAIM' ? 'CLAIM' : 'VISIT'
  const rules = SLOT_RULES[type]
  const capacity = Number(raw?.capacity ?? raw?.slot_capacity ?? rules.capacity)
  const occupied = Number(raw?.occupied ?? raw?.booked ?? raw?.slot_booked ?? raw?.count ?? 0)
  const reason = raw?.reason || raw?.unavailable_reason || raw?.slot_reason || ''
  const full = Number.isFinite(capacity) && occupied >= capacity
  return { type, available: raw?.available !== false && !reason && !full }
}

export default function AdminSchedule() {
  const { currentAdminUser, isSuperAdmin } = useAdmin() || {}
  const { showToast } = useToast()

  const [viewMode, setViewMode] = useState('Day') // 'Day' | 'Week' | 'Month'
  const [activeFilter, setActiveFilter] = useState('all') // 'all' | 'available' | 'conflict'
  const [showDutyRequestsDrawer, setShowDutyRequestsDrawer] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(false)

  // Assign shift modal form state
  const [selectedOfficerId, setSelectedOfficerId] = useState('')
  const [shiftType, setShiftType] = useState('desk_duty')
  const [shiftTime, setShiftTime] = useState('10:00 AM - 1:00 PM')
  const [dutyLocation, setDutyLocation] = useState('Main Campus Org Room')
  const [isAssigning, setIsAssigning] = useState(false)

  // Real data (REQ-SS-01 staff roster + REQ-SS-03 thresholds)
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()))
  const [officers, setOfficers] = useState([])
  const [isLoadingOfficers, setIsLoadingOfficers] = useState(true)
  const [officersError, setOfficersError] = useState('')
  const [savingOfficerId, setSavingOfficerId] = useState(null)
  const [slots, setSlots] = useState([])
  const [reloadKey, setReloadKey] = useState(0)

  // No duty/shift-swap request endpoint exists yet — drawer keeps its empty state.
  const dutyRequests = []

  const notifiedShortfallRef = useRef(new Set())

  // ── Load employee roster (in-store duty status = emp_instore) ──
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
        const mapped = rows
          .filter((r) => !r.emp_deleted)
          .map((r, idx) => {
            const name =
              `${r.emp_givname || ''} ${r.emp_surname || ''}`.trim() ||
              r.emp_email ||
              `Employee #${r.emp_id}`
            const instore = isOnDuty(r.emp_instore)
            return {
              id: r.emp_id,
              name,
              initials: initialsFor(name),
              avatarColor: AVATAR_COLORS[idx % AVATAR_COLORS.length],
              available: instore,
              // NB: avoid the word "available" — StatusPill matches it as green.
              availability: instore ? 'On Duty' : 'Off Duty',
              roleLabel: roleLabel(r.emp_type),
              empType: r.emp_type,
              raw: r,
            }
          })
        setOfficers(mapped)
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
  }, [reloadKey])

  // ── Slot availability for threshold checks (REQ-SS-03: VISIT ≥2, CLAIM ≥1) ──
  useEffect(() => {
    let cancelled = false
    fetchSlots(dayKey(selectedDate))
      .then((rows) => {
        if (cancelled) return
        const list = Array.isArray(rows) ? rows : Array.isArray(rows?.data) ? rows.data : []
        setSlots(list.map(normalizeSlotRow))
      })
      .catch(() => {
        if (!cancelled) setSlots([]) // route may be missing — thresholds show as unknown
      })
    return () => {
      cancelled = true
    }
  }, [selectedDate])

  const visitOpen = useMemo(
    () => slots.filter((s) => s.type === 'VISIT' && s.available).length,
    [slots]
  )
  const claimOpen = useMemo(
    () => slots.filter((s) => s.type === 'CLAIM' && s.available).length,
    [slots]
  )
  const visitOk = slots.length > 0 && visitOpen >= 2
  const claimOk = slots.length > 0 && claimOpen >= 1
  const hasShortfall = slots.length > 0 && (!visitOk || !claimOk)

  // Notify super admins once per day/kind when thresholds are not met (REQ-SS-03)
  useEffect(() => {
    if (!hasShortfall || officers.length === 0) return
    const superAdmins = officers.filter((o) => String(o.empType || '').toUpperCase().includes('SUPER'))
    if (superAdmins.length === 0) return
    const kind = !visitOk ? 'visit' : 'claim'
    const key = `${dayKey(selectedDate)}-${kind}`
    if (notifiedShortfallRef.current.has(key)) return
    notifiedShortfallRef.current.add(key)
    const msg = !visitOk
      ? `[PRIORITY] VISIT slot shortfall on ${fmtLongDate(selectedDate)}: only ${visitOpen} open (minimum 2 required).`
      : `[PRIORITY] CLAIM slot shortfall on ${fmtLongDate(selectedDate)}: only ${claimOpen} open (minimum 1 required).`
    superAdmins.forEach((sa) => {
      createNotification('employee', sa.id, msg).catch(() => {})
    })
  }, [hasShortfall, visitOk, claimOk, visitOpen, claimOpen, officers, selectedDate])

  // ── REQ-SS-02: staff can't change availability for past dates / after 7:00 AM ──
  const now = new Date()
  const isPastDate = selectedDate.getTime() < startOfDay(now).getTime()
  const blockStarted = dayKey(selectedDate) === dayKey(now) && now.getHours() >= 7
  const canEditAvailability = isSuperAdmin || (!isPastDate && !blockStarted)
  const lockMessage =
    'Availability can no longer be changed for this date (locked after 7:00 AM — REQ-SS-02).'

  const onDutyCount = officers.filter((o) => o.available).length
  const offDutyCount = officers.length - onDutyCount

  // Filter officers for bottom grid
  const filteredOfficers = officers.filter((off) => {
    if (activeFilter === 'available') return off.available
    if (activeFilter === 'conflict') return !off.available
    return true
  })

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])
  const shiftDate = (delta) => setSelectedDate((d) => addDays(d, delta))

  const recordLog = (action, desc) => {
    logAction({
      user_id: currentAdminUser?.id ?? 0,
      user_type: 'employee',
      action,
      desc: `${desc} (by ${currentAdminUser?.name || 'Staff'})`,
    }).catch(() => {})
  }

  const handleOpenAssignForOfficer = (off) => {
    if (!canEditAvailability) {
      showToast(lockMessage, 'error')
      return
    }
    setSelectedOfficerId(off.id)
    setShowAssignModal(true)
  }

  // Toggle in-store availability (emp_instore) for a single employee (REQ-SS-01)
  const handleToggleDuty = async (off) => {
    if (!canEditAvailability) {
      showToast(lockMessage, 'error')
      return
    }
    const next = !off.available
    setSavingOfficerId(off.id)
    try {
      await updateAccount('employee', off.id, { emp_instore: next })
      setOfficers((list) =>
        list.map((o) =>
          o.id === off.id
            ? {
                ...o,
                available: next,
                availability: next ? 'On Duty' : 'Off Duty',
                raw: { ...o.raw, emp_instore: next },
              }
            : o
        )
      )
      recordLog(
        next ? 'SET IN-STORE' : 'SET OFF-STORE',
        `${next ? 'Marked' : 'Unmarked'} ${off.name} as ${next ? 'On Duty' : 'Off Duty'} for ${fmtLongDate(selectedDate)}`
      )
      showToast(`${off.name} is now ${next ? 'On Duty' : 'Off Duty'}.`, 'success')
    } catch (err) {
      showToast(errMsg(err, 'Failed to update duty status.'), 'error')
    } finally {
      setSavingOfficerId(null)
    }
  }

  const handleAssignSubmit = async (e) => {
    e.preventDefault()
    if (!selectedOfficerId) return
    if (!canEditAvailability) {
      showToast(lockMessage, 'error')
      setShowAssignModal(false)
      return
    }

    const typeTitle =
      shiftType === 'desk_duty'
        ? 'Desk Duty'
        : shiftType === 'event_prep'
        ? 'Event Prep'
        : shiftType === 'inventory'
        ? 'Inventory Audit'
        : 'POS Cashier'

    const target = officers.find((o) => String(o.id) === String(selectedOfficerId))
    setIsAssigning(true)
    try {
      // Assigning a duty puts the officer in-store for the day.
      await updateAccount('employee', selectedOfficerId, { emp_instore: true })
      setOfficers((list) =>
        list.map((o) =>
          String(o.id) === String(selectedOfficerId)
            ? { ...o, available: true, availability: 'On Duty', raw: { ...o.raw, emp_instore: true } }
            : o
        )
      )
      recordLog(
        'ASSIGN DUTY',
        `Assigned ${typeTitle} (${shiftTime}, ${dutyLocation}) on ${fmtLongDate(
          selectedDate
        )} to ${target?.name || `employee #${selectedOfficerId}`}`
      )
      setShowAssignModal(false)
      showToast(`Duty assigned to ${target?.name || 'officer'}.`, 'success')
    } catch (err) {
      showToast(errMsg(err, 'Failed to assign the duty.'), 'error')
    } finally {
      setIsAssigning(false)
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-4">
        {/* Compacted Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
              Student Officer Duty &amp; Shift Scheduler
            </h1>
            <p className="text-xs text-slate-500 font-normal mt-0.5">
              Educational Portal • Student Council Organization Management
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Duty Requests Drawer Trigger */}
            <button
              type="button"
              onClick={() => setShowDutyRequestsDrawer(true)}
              className="h-8 px-3 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-xs rounded-md border border-slate-200 flex items-center gap-2 transition-colors relative cursor-pointer"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-brand-orange">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span>Duty Requests</span>
              {dutyRequests.length > 0 && (
                <span className="w-4 h-4 bg-brand-orange text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {dutyRequests.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                if (!canEditAvailability) {
                  showToast(lockMessage, 'error')
                  return
                }
                setSelectedOfficerId(officers[0]?.id || '')
                setShowAssignModal(true)
              }}
              className="h-8 px-3 bg-brand-orange hover:bg-brand-orange-dark text-white font-semibold text-xs rounded-md flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Assign Duty</span>
            </button>
          </div>
        </div>

        {/* View Mode & Date Navigator Bar */}
        <div className="bg-white rounded-lg p-3 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          {/* Day / Week / Month toggle */}
          <div className="flex bg-slate-100 p-0.5 rounded-md border border-slate-200/60">
            {['Day', 'Week', 'Month'].map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setViewMode(tab)}
                className={`h-7 px-3 rounded text-xs font-semibold transition-all cursor-pointer ${
                  viewMode === tab
                    ? 'bg-brand-orange text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Date Navigator */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => shiftDate(-1)}
              className="w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 hover:bg-slate-50 text-slate-500 cursor-pointer"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <span className="px-2.5 py-1 bg-slate-50 rounded-md text-xs font-semibold text-slate-900 border border-slate-200">
              {dayKey(selectedDate) === dayKey(new Date()) ? 'Today: ' : ''}
              {fmtLongDate(selectedDate)}
            </span>
            <button
              type="button"
              onClick={() => shiftDate(1)}
              className="w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 hover:bg-slate-50 text-slate-500 cursor-pointer"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </div>

        {/* Threshold chips + shortfall warning (REQ-SS-03) */}
        <div className="bg-white rounded-lg p-3 border border-slate-200 flex flex-col sm:flex-row sm:items-center gap-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Staffing thresholds
          </span>
          <StatusPill
            status={`VISIT ≥2 · ${slots.length ? `${visitOpen} open` : 'unverified'}`}
            variant={slots.length === 0 ? 'amber' : visitOk ? 'green' : 'red'}
          />
          <StatusPill
            status={`CLAIM ≥1 · ${slots.length ? `${claimOpen} open` : 'unverified'}`}
            variant={slots.length === 0 ? 'amber' : claimOk ? 'green' : 'red'}
          />
          {hasShortfall && (
            <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
              ⚠ Shortfall — super admins notified (REQ-SS-03)
            </span>
          )}
          {!canEditAvailability && (
            <span className="text-xs font-semibold text-slate-500 ml-auto">{lockMessage}</span>
          )}
        </div>

        {/* Section 1: Timeline Grid */}
        <div className="space-y-2">
          <ScheduleTimelineGrid
            officers={officers}
            onOpenSlotClick={(off, time) => {
              if (!canEditAvailability) {
                showToast(lockMessage, 'error')
                return
              }
              setSelectedOfficerId(off.id)
              setShiftTime(time)
              setShowAssignModal(true)
            }}
            onShiftClick={(off, title) => {
              showToast(`${off.name} is scheduled for: ${title}`, 'info')
            }}
          />
        </div>

        {/* Section 2: Officer Schedules & Free Windows */}
        <div className="bg-white rounded-lg p-4 border border-slate-200 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Officer Schedules &amp; Free Windows
              </h2>
              <p className="text-[11px] text-slate-400 font-normal mt-0.5">
                Manage in-store availability and assign shifts based on class schedules
              </p>
            </div>

            {/* Filter pills */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setActiveFilter('all')}
                className={`h-7 px-2.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  activeFilter === 'all'
                    ? 'bg-brand-orange text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All ({officers.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter('available')}
                className={`h-7 px-2.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  activeFilter === 'available'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                On Duty ({onDutyCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter('conflict')}
                className={`h-7 px-2.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  activeFilter === 'conflict'
                    ? 'bg-rose-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Off Duty ({offDutyCount})
              </button>
            </div>
          </div>

          {/* Officer Cards Grid */}
          {isLoadingOfficers ? (
            <div className="py-10 text-center text-xs font-semibold text-slate-500 flex items-center justify-center gap-2">
              <span className="spinner-circle !w-3.5 !h-3.5" /> Loading employees…
            </div>
          ) : officersError ? (
            <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              <p className="text-xs font-semibold text-red-700">{officersError}</p>
              <button
                type="button"
                onClick={reload}
                className="text-xs font-bold text-red-700 border border-red-300 rounded-md px-2 py-1 hover:bg-red-100 cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : filteredOfficers.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              {officers.length === 0
                ? 'No employee accounts found.'
                : 'No officers match this filter.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {filteredOfficers.map((off) => (
                <div
                  key={off.id}
                  className="p-4 rounded-2xl border border-gray-100 bg-gray-50/50 hover:bg-white hover:shadow-sm hover:border-gray-200 transition-all flex flex-col justify-between space-y-3"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-xs shrink-0 ${off.avatarColor}`}
                    >
                      {off.initials}
                    </div>
                    <div className="min-w-0">
                      <p className="font-black text-gray-900 text-xs truncate">
                        {off.name}
                      </p>
                      <p className="text-[10px] text-gray-500 font-semibold truncate">
                        {off.roleLabel}
                      </p>
                    </div>
                  </div>

                  <div className="py-1">
                    <StatusPill status={off.availability} />
                  </div>

                  <div className="space-y-1.5">
                    {off.available ? (
                      <button
                        type="button"
                        onClick={() => handleOpenAssignForOfficer(off)}
                        disabled={savingOfficerId === off.id}
                        className="w-full py-2 bg-white hover:bg-brand-orange hover:text-white text-gray-700 font-bold text-xs rounded-xl border border-gray-200 shadow-2xs transition-all disabled:opacity-50 cursor-pointer"
                      >
                        + Assign Shift
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleToggleDuty(off)}
                        disabled={savingOfficerId === off.id || !canEditAvailability}
                        className="w-full py-2 bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-700 font-bold text-xs rounded-xl border border-emerald-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        {savingOfficerId === off.id ? 'Saving…' : 'Mark On Duty'}
                      </button>
                    )}
                    {off.available && (
                      <button
                        type="button"
                        onClick={() => handleToggleDuty(off)}
                        disabled={savingOfficerId === off.id || !canEditAvailability}
                        className="w-full py-1 text-[10px] font-semibold text-slate-400 hover:text-rose-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        {savingOfficerId === off.id ? 'Saving…' : 'Mark Off Duty'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Duty Requests Sliding Drawer */}
      <DrawerPanel
        isOpen={showDutyRequestsDrawer}
        onClose={() => setShowDutyRequestsDrawer(false)}
        title={`Duty Requests (${dutyRequests.length})`}
        subtitle="Shift swap and cover requests from officers"
      >
        <div className="space-y-4">
          {dutyRequests.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8">
              No pending duty requests. (Shift-swap requests are not yet exposed by the API.)
            </p>
          ) : (
            dutyRequests.map((req) => (
              <div
                key={req.id}
                className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-2.5 text-xs"
              >
                <div className="flex justify-between items-start">
                  <h4 className="font-black text-gray-900">{req.officerName}</h4>
                  <span className="text-[10px] text-gray-400 font-semibold">{req.time}</span>
                </div>
                <p className="font-bold text-brand-orange">{req.requestedShift}</p>
                <p className="text-gray-600 bg-white p-2.5 rounded-xl border border-gray-200/70">
                  &ldquo;{req.reason}&rdquo;
                </p>
              </div>
            ))
          )}
        </div>
      </DrawerPanel>

      {/* Assign Duty Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
          <div className="bg-white rounded-lg p-4 max-w-sm w-full border border-slate-200 space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Assign Officer Duty</h3>
            <form onSubmit={handleAssignSubmit} className="space-y-2.5 text-xs font-medium">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Officer</label>
                <select
                  value={selectedOfficerId}
                  onChange={(e) => setSelectedOfficerId(e.target.value)}
                  className="w-full h-8 px-2.5 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-orange text-xs"
                >
                  {officers.map((off) => (
                    <option key={off.id} value={off.id}>
                      {off.name} ({off.availability})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Duty Type</label>
                <select
                  value={shiftType}
                  onChange={(e) => setShiftType(e.target.value)}
                  className="w-full h-8 px-2.5 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-orange text-xs"
                >
                  <option value="desk_duty">Desk Duty (Main Counter)</option>
                  <option value="event_prep">Event Prep (Merch Distribution)</option>
                  <option value="inventory">Inventory Audit (Org Stockroom)</option>
                  <option value="cashier">POS Cashier (In-Store)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Time Slot</label>
                <input
                  type="text"
                  value={shiftTime}
                  onChange={(e) => setShiftTime(e.target.value)}
                  placeholder="e.g. 10:00 AM - 1:00 PM"
                  className="w-full h-8 px-2.5 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-orange text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Room / Location</label>
                <input
                  type="text"
                  value={dutyLocation}
                  onChange={(e) => setDutyLocation(e.target.value)}
                  placeholder="e.g. Main Campus USC Org Room"
                  className="w-full h-8 px-2.5 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-orange text-xs"
                />
              </div>

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
    </AdminLayout>
  )
}
