import { useState, useEffect, useCallback, useMemo } from 'react'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import { useAdmin } from '../../hooks/useAdmin.js'
import { useToast } from '../../hooks/useToast.js'
import { CloseIcon } from '../../components/ui/Icons.jsx'
import {
  fetchAppointments,
  fetchSlots,
  closeAppointment,
  SLOT_RULES,
} from '../../services/appointments.js'
import { fetchAccounts } from '../../services/accounts.js'
import { logAction } from '../../services/access.js'

// ── Date / time helpers (Schedule Calendar, REQ-SC-01 master view) ─────────
const pad = (n) => String(n).padStart(2, '0')
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const addDays = (d, n) => {
  const next = new Date(d)
  next.setDate(next.getDate() + n)
  return next
}
const sameDay = (a, b) => dayKey(a) === dayKey(b)
const fmtBadgeDate = (d) =>
  d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
const fmtTime = (d) =>
  d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

function parseDateish(value) {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const raw = String(value).trim()
  if (!raw) return null
  let d = new Date(raw)
  if (Number.isNaN(d.getTime()) && /^\d{1,2}:\d{2}/.test(raw)) d = new Date(`${raw}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Slot rows come from GET /appoint/slots; field names are defensive because
 * the endpoint is evolving (occupied/capacity/reason variants all handled).
 */
function normalizeSlot(raw, idx) {
  const rawType = String(raw?.type ?? raw?.appoint_type ?? raw?.slot_type ?? 'VISIT').toUpperCase()
  const type = rawType === 'CLAIM' ? 'CLAIM' : 'VISIT'
  const rules = SLOT_RULES[type]
  const capacity = Number(raw?.capacity ?? raw?.slot_capacity ?? raw?.max ?? rules.capacity)
  const occupied = Number(raw?.occupied ?? raw?.booked ?? raw?.slot_booked ?? raw?.count ?? 0)
  const reason = raw?.reason || raw?.unavailable_reason || raw?.slot_reason || ''
  const startLabel = raw?.start ?? raw?.slot_start ?? raw?.time ?? raw?.from ?? ''
  const endLabel = raw?.end ?? raw?.slot_end ?? raw?.to ?? ''
  const start = parseDateish(startLabel)
  const end = parseDateish(endLabel) ||
    (start ? new Date(start.getTime() + rules.minutes * 60000) : null)
  const full = (Number.isFinite(capacity) ? occupied >= capacity : false)
  return {
    id: raw?.slot_id ?? raw?.id ?? `slot-${idx}`,
    type,
    minutes: rules.minutes,
    capacity: Number.isFinite(capacity) ? capacity : rules.capacity,
    occupied: Number.isFinite(occupied) ? occupied : 0,
    reason,
    start,
    end,
    startLabel: start ? fmtTime(start) : String(startLabel || ''),
    endLabel: end ? fmtTime(end) : String(endLabel || ''),
    available: raw?.available !== false && !reason && !full,
    full,
  }
}

const errMsg = (err, fallback) => err?.message || fallback

export default function AdminAppointments() {
  const { currentAdminUser } = useAdmin() || {}
  const { showToast } = useToast()

  // Selected day for the master schedule calendar (REQ-SC-01)
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  })
  const [appointments, setAppointments] = useState([])
  const [slots, setSlots] = useState([])
  const [inStoreStaff, setInStoreStaff] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [slotsUnavailable, setSlotsUnavailable] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  // Cancel-appointment flow (required reason — REQ-SC-04)
  const [showDeclineModal, setShowDeclineModal] = useState(false)
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelReason, setCancelReason] = useState('')
  const [isCancelling, setIsCancelling] = useState(false)

  const staffName = currentAdminUser?.name ? currentAdminUser.name.split(' ')[0] : 'Staff'

  // ── Load master appointments + slot availability for the selected day ──
  const loadSchedule = useCallback(async (date) => {
    setIsLoading(true)
    setLoadError('')
    const [apptResult, slotResult] = await Promise.allSettled([
      fetchAppointments({ scope: 'master' }),
      fetchSlots(dayKey(date)),
    ])

    if (apptResult.status === 'fulfilled') {
      const rows = apptResult.value
      setAppointments(Array.isArray(rows) ? rows : Array.isArray(rows?.data) ? rows.data : [])
    } else {
      setAppointments([])
      setLoadError(errMsg(apptResult.reason, 'Unable to load appointments.'))
    }

    if (slotResult.status === 'fulfilled') {
      const rows = slotResult.value
      const list = Array.isArray(rows) ? rows : Array.isArray(rows?.data) ? rows.data : []
      setSlots(list.map(normalizeSlot))
      setSlotsUnavailable(false)
    } else {
      // Slot feed not available from the server yet — bookings still render.
      setSlots([])
      setSlotsUnavailable(true)
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    loadSchedule(selectedDate)
  }, [selectedDate, reloadKey, loadSchedule])

  // In-store headcount (REQ-AB-03 thresholds drive the summary copy)
  useEffect(() => {
    let cancelled = false
    fetchAccounts({ account_type: 'employee' })
      .then((payload) => {
        if (cancelled) return
        const employees = Array.isArray(payload?.employees)
          ? payload.employees
          : Array.isArray(payload)
          ? payload.filter((r) => r.emp_id != null)
          : []
        const count = employees.filter((r) => {
          const v = r.emp_instore
          return v === true || v === 1 || v === '1'
        }).length
        setInStoreStaff(count)
      })
      .catch(() => { if (!cancelled) setInStoreStaff(null) })
    return () => { cancelled = true }
  }, [])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])
  const shiftDate = (delta) => setSelectedDate((d) => addDays(d, delta))

  // Open (not closed) bookings on the selected day
  const dayBookings = useMemo(() => {
    return appointments
      .filter((a) => !a.appoint_closed)
      .map((a) => ({ ...a, _at: parseDateish(a.appoint_date) }))
      .filter((a) => a._at && sameDay(a._at, selectedDate))
      .sort((a, b) => a._at - b._at)
  }, [appointments, selectedDate])

  const dayTotals = useMemo(() => {
    let claims = 0
    let visits = 0
    let cancelled = 0
    appointments.forEach((a) => {
      const at = parseDateish(a.appoint_date)
      if (!at || !sameDay(at, selectedDate)) return
      if (a.appoint_closed) { cancelled += 1; return }
      if (String(a.appoint_type || '').toUpperCase() === 'CLAIM') claims += 1
      else visits += 1
    })
    return { claims, visits, cancelled }
  }, [appointments, selectedDate])

  // ── Merge bookings + slot blocks into the existing timeline item shape ──
  const timelineItems = useMemo(() => {
    const items = []

    dayBookings.forEach((a) => {
      const type = String(a.appoint_type || '').toUpperCase() === 'CLAIM' ? 'CLAIM' : 'VISIT'
      const rules = SLOT_RULES[type]
      const end = a._at ? new Date(a._at.getTime() + rules.minutes * 60000) : null
      items.push({
        key: `appt-${a.appoint_id}`,
        sortAt: a._at ? a._at.getTime() : Number.MAX_SAFE_INTEGER,
        time: a._at ? `${fmtTime(a._at)} – ${end ? fmtTime(end) : ''}` : String(a.appoint_date || ''),
        type: 'shift',
        typeLabel: type === 'CLAIM' ? 'Claim' : 'Visit',
        title: type === 'CLAIM' ? 'Order Claiming Booking' : 'Store Visit Booking',
        location: a.appoint_desc || (a.appoint_qr ? `QR ${a.appoint_qr}` : 'Campus Merch Shop'),
        subtext: `Customer #${a.cust_id} · ${rules.minutes} min slot`,
        icon: 'desk',
        action: 'Cancel',
        actionKind: 'cancel',
        onAction: () => {
          setCancelTarget(a)
          setCancelReason('')
          setShowDeclineModal(true)
        },
        raw: a,
      })
    })

    slots.forEach((s, idx) => {
      const startAt = s.start ? s.start.getTime() : null
      const label = `${s.startLabel || '--:--'} – ${s.endLabel || '--:--'}`
      if (s.available) {
        const remaining = Math.max(0, s.capacity - s.occupied)
        items.push({
          key: `slot-${s.id}-${idx}`,
          sortAt: startAt ?? Number.MAX_SAFE_INTEGER - 1,
          time: label,
          type: 'free',
          typeLabel: s.type === 'CLAIM' ? 'Claim 30m' : 'Visit 10m',
          title: `${remaining} of ${s.capacity} slots open`,
          subtitle: `${s.occupied} booked · unbookable slots are flagged with a reason (REQ-AB-04)`,
          icon: 'clock',
        })
      } else {
        items.push({
          key: `slot-${s.id}-${idx}`,
          sortAt: startAt ?? Number.MAX_SAFE_INTEGER - 1,
          time: label,
          type: 'class',
          typeLabel: 'Unavailable',
          title: s.full ? 'Slot full — unavailable' : 'Slot unavailable',
          location: s.reason || `Capacity reached (${s.occupied}/${s.capacity} booked)`,
          icon: 'book',
        })
      }
    })

    items.sort((a, b) => a.sortAt - b.sortAt)
    return items
  }, [dayBookings, slots])

  // ── Weekly availability summary (derived from real bookings) ──
  const weekDays = useMemo(() => {
    const monday = addDays(selectedDate, -((selectedDate.getDay() + 6) % 7))
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(monday, i)
      let bookedMinutes = 0
      let bookings = 0
      appointments.forEach((a) => {
        if (a.appoint_closed) return
        const at = parseDateish(a.appoint_date)
        if (!at || !sameDay(at, day)) return
        bookings += 1
        bookedMinutes +=
          String(a.appoint_type || '').toUpperCase() === 'CLAIM'
            ? SLOT_RULES.CLAIM.minutes
            : SLOT_RULES.VISIT.minutes
      })
      return {
        day,
        label: day.toLocaleDateString('en-US', { weekday: 'short' }),
        hours: `${Math.round((bookedMinutes / 60) * 10) / 10}h`,
        status: bookings > 0 ? 'shift' : day.getDay() === 0 ? 'busy' : 'free',
        bookings,
      }
    })
  }, [selectedDate, appointments])

  const weekBookingCount = weekDays.reduce((sum, d) => sum + d.bookings, 0)

  const availableSlotCount = useMemo(
    () => slots.filter((s) => s.available).length,
    [slots]
  )

  // ── Cancel flow (reason required, notified via /appoint/close) ──
  const handleOpenCancel = (appt) => {
    setCancelTarget(appt)
    setCancelReason('')
    setShowDeclineModal(true)
  }

  const handleBannerCancelClick = () => {
    if (dayBookings.length === 0) {
      showToast('No bookings to cancel on this date.', 'info')
      return
    }
    handleOpenCancel(dayBookings[0])
  }

  const handleConfirmCancel = async () => {
    if (!cancelTarget) return
    const reason = cancelReason.trim()
    if (!reason) {
      showToast('A reason is required to cancel an appointment.', 'error')
      return
    }
    setIsCancelling(true)
    try {
      await closeAppointment(cancelTarget.appoint_id, reason)
      logAction({
        user_id: currentAdminUser?.id ?? 0,
        user_type: 'employee',
        action: 'CANCEL APPOINTMENT',
        desc: `Cancelled ${cancelTarget.appoint_type || 'appointment'} #${
          cancelTarget.appoint_id
        } on ${cancelTarget.appoint_date}. Reason: ${reason} (by ${currentAdminUser?.name || 'Staff'})`,
      }).catch(() => {})
      setShowDeclineModal(false)
      setCancelTarget(null)
      setCancelReason('')
      reload()
      showToast('Appointment cancelled and the customer notified.', 'success')
    } catch (err) {
      showToast(errMsg(err, 'Failed to cancel the appointment.'), 'error')
    } finally {
      setIsCancelling(false)
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-4 animate-fade-in">
        {/* Compacted Top Greeting Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
              <span>{new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening'}, {staffName}!</span>
            </h1>
            <p className="text-xs text-slate-500 font-normal mt-0.5">
              Here's your assigned shift and today's schedule at a glance.
            </p>
          </div>

          {/* Date Selector Badge */}
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-md px-2 py-1 self-start sm:self-auto">
            <div className="flex items-center gap-2 px-2 py-0.5 text-xs font-semibold text-slate-800">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-slate-400">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span>{fmtBadgeDate(selectedDate)}</span>
            </div>
            <div className="flex items-center gap-0.5 border-l border-slate-100 pl-1">
              <button
                type="button"
                onClick={() => shiftDate(-1)}
                className="p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => shiftDate(1)}
                className="p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* 2-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Left Column (8 cols) */}
          <div className="lg:col-span-8 space-y-4">
            {/* 1. Assigned Shift Card */}
            <div className="bg-[#FFF9F5] border border-[#FFE7D6] rounded-lg p-4 relative overflow-hidden">
              <div className="flex flex-col md:flex-row items-start justify-between gap-4">
                {/* Shift Info */}
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-md bg-[#FFE8D6] text-[#FF6A00] flex items-center justify-center shrink-0">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                    </svg>
                  </div>
                  <div className="space-y-1">
                    <span className="inline-block bg-[#FFEDE1] text-[#E65100] text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md">
                      Master Calendar
                    </span>
                    <h2 className="text-base font-bold text-slate-900">{fmtBadgeDate(selectedDate)}</h2>
                    <div className="space-y-0.5 text-xs text-slate-600 font-medium">
                      <div className="flex items-center gap-1.5">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-slate-400">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        <span>Campus Merch Shop · Student Help Desk</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-slate-400">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                        <span className="font-bold text-slate-800">
                          {slotsUnavailable
                            ? 'Slot feed unavailable'
                            : `${availableSlotCount} slot${availableSlotCount === 1 ? '' : 's'} open`}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-slate-400">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                        <span>
                          In-store staff: {inStoreStaff == null ? '—' : inStoreStaff}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Day Summary Bullets */}
                <div className="space-y-1 text-xs text-slate-600 border-t md:border-t-0 md:border-l border-orange-100 pt-2.5 md:pt-0 md:pl-4">
                  <p className="font-semibold text-slate-900 mb-0.5">Day Summary</p>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                    <span>{dayTotals.claims} claim booking{dayTotals.claims === 1 ? '' : 's'} (30 min, capacity 10)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                    <span>{dayTotals.visits} visit booking{dayTotals.visits === 1 ? '' : 's'} (10 min, capacity 1)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                    <span>{dayTotals.cancelled} closed appointment{dayTotals.cancelled === 1 ? '' : 's'}</span>
                  </div>
                </div>

                {/* Reload Button */}
                <button
                  type="button"
                  onClick={reload}
                  className="self-start md:self-center border border-[#FF6A00] text-[#FF6A00] bg-white hover:bg-orange-50 text-xs font-semibold h-8 px-3 rounded-md flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {/* 2. Today's Timeline */}
            <div className="bg-white rounded-lg p-4 border border-slate-200 space-y-4">
              {/* Timeline Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#EBF2FF] text-[#2563EB] flex items-center justify-center shrink-0">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-5 h-5">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-gray-900">Appointments Timeline</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Bookings and time slots in chronological order.</p>
                  </div>
                </div>

                <div className="flex items-center gap-1 text-xs text-gray-500 font-semibold bg-gray-50 px-2 py-1 rounded-xl border border-gray-100">
                  <button type="button" onClick={() => shiftDate(-1)} className="p-1 hover:text-gray-900">‹</button>
                  <span className="px-1.5">{fmtBadgeDate(selectedDate)}</span>
                  <button type="button" onClick={() => shiftDate(1)} className="p-1 hover:text-gray-900">›</button>
                </div>
              </div>

              {loadError && (
                <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  <p className="text-xs font-semibold text-red-700">{loadError}</p>
                  <button
                    type="button"
                    onClick={reload}
                    className="text-xs font-bold text-red-700 border border-red-300 rounded-md px-2 py-1 hover:bg-red-100 cursor-pointer"
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Timeline Items */}
              <div className="space-y-4 relative before:absolute before:left-[102px] before:top-4 before:bottom-4 before:w-0.5 before:bg-gray-100">
                {isLoading && (
                  <div className="flex items-center gap-4 relative">
                    <div className="w-24 text-right shrink-0">
                      <p className="text-xs font-bold leading-tight text-gray-700">…</p>
                    </div>
                    <div className="w-3 h-3 rounded-full border-2 border-white z-10 shrink-0 bg-slate-300" />
                    <div className="flex-1 rounded-md p-3 bg-slate-50 border border-slate-200 flex items-center gap-2">
                      <span className="spinner-circle !w-3.5 !h-3.5" />
                      <p className="text-sm font-bold text-gray-900">Loading schedule…</p>
                      <p className="text-xs text-gray-500 mt-0.5">Fetching bookings and time slots</p>
                    </div>
                  </div>
                )}
                {!isLoading && timelineItems.length === 0 && (
                  <div className="flex items-center gap-4 relative">
                    <div className="w-24 text-right shrink-0">
                      <p className="text-xs font-bold leading-tight text-gray-700">—</p>
                    </div>
                    <div className="w-3 h-3 rounded-full border-2 border-white z-10 shrink-0 bg-slate-300" />
                    <div className="flex-1 rounded-md p-3 bg-slate-50 border border-slate-200">
                      <p className="text-sm font-bold text-gray-900">No bookings or slots for this day</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Customer CLAIM/VISIT bookings and open slots will appear here.
                      </p>
                    </div>
                  </div>
                )}
                {timelineItems.map((item, idx) => {
                  const isShift = item.type === 'shift'
                  const isFree = item.type === 'free'

                  return (
                    <div key={idx} className="flex items-center gap-4 relative">
                      {/* Time Column (Left) */}
                      <div className="w-24 text-right shrink-0">
                        <p className={`text-xs font-bold leading-tight ${isShift ? 'text-[#FF6A00]' : 'text-gray-700'}`}>
                          {item.time.split('–')[0]}
                        </p>
                        <p className="text-[11px] text-gray-400">
                          {item.time.split('–')[1] ? `– ${item.time.split('–')[1]}` : ''}
                        </p>
                        {/* Type Badge */}
                        <span
                          className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 ${
                            isShift
                              ? 'bg-[#FFE2D1] text-[#E65100]'
                              : isFree
                              ? 'bg-[#E8F8EE] text-[#10B981]'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {item.typeLabel}
                        </span>
                      </div>

                      {/* Timeline Dot */}
                      <div
                        className={`w-3 h-3 rounded-full border-2 border-white z-10 shrink-0 ${
                          isShift
                            ? 'bg-[#FF6A00] ring-2 ring-orange-100'
                            : isFree
                            ? 'bg-[#10B981] ring-2 ring-emerald-100'
                            : 'bg-slate-300'
                        }`}
                      />

                      {/* Content Card (Right) */}
                      <div
                        className={`flex-1 rounded-md p-3 flex items-center justify-between gap-3 transition-all ${
                          isShift
                            ? 'bg-[#FFF5ED] border border-[#FFE2D1]'
                            : isFree
                            ? 'bg-[#F0FDF4] border border-[#DCFCE7]'
                            : 'bg-slate-50 border border-slate-200 hover:bg-slate-100/60'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${
                              isShift
                                ? 'bg-[#FFE8D6] text-[#FF6A00]'
                                : isFree
                                ? 'bg-emerald-100 text-[#10B981]'
                                : 'bg-white text-slate-500 border border-slate-200'
                            }`}
                          >
                            {item.icon === 'desk' ? (
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                                <rect x="3" y="4" width="18" height="12" rx="2" />
                                <line x1="7" y1="20" x2="7" y2="16" />
                                <line x1="17" y1="20" x2="17" y2="16" />
                              </svg>
                            ) : item.icon === 'clock' ? (
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                                <circle cx="12" cy="12" r="10" />
                                <polyline points="12 6 12 12 16 14" />
                              </svg>
                            ) : (
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                              </svg>
                            )}
                          </div>

                          <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-900 truncate">{item.title}</p>
                            {item.location && (
                              <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                <span>{item.location}</span>
                                {item.subtext && <span>• {item.subtext}</span>}
                              </p>
                            )}
                            {item.subtitle && (
                              <p className="text-xs text-gray-500 mt-0.5">{item.subtitle}</p>
                            )}
                          </div>
                        </div>

                        {/* Action on right */}
                        {item.action ? (
                          <button
                            type="button"
                            onClick={item.onAction}
                            className={`text-xs font-bold px-3 py-1.5 rounded-xl border active:scale-95 transition-all shadow-2xs whitespace-nowrap cursor-pointer ${
                              item.actionKind === 'cancel'
                                ? 'border-red-300 text-red-700 bg-white hover:bg-red-50'
                                : 'border-emerald-300 text-emerald-700 bg-white hover:bg-emerald-50'
                            }`}
                          >
                            {item.action}
                          </button>
                        ) : (
                          <span className="text-gray-300 text-lg">›</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 3. Can't make it to a shift? Banner */}
            <div className="bg-[#FFF8F3] border border-[#FFE5D3] rounded-3xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-2xs">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-orange-100 text-[#FF6A00] flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">
                  i
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-900">Need to cancel a booking?</h4>
                  <p className="text-xs text-gray-600 mt-0.5">
                    Closing an appointment requires a reason and is logged for audit (REQ-SC-04).
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleBannerCancelClick}
                disabled={dayBookings.length === 0}
                className="border border-brand-orange text-brand-orange bg-white hover:bg-orange-50 font-bold text-xs h-8 px-3 rounded-md whitespace-nowrap cursor-pointer self-end sm:self-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel Appointment
              </button>
            </div>
          </div>

          {/* Right Column (4 cols) */}
          <div className="lg:col-span-4 space-y-6">
            {/* 1. Weekly Availability Summary */}
            <div className="bg-white rounded-3xl p-6 border border-gray-100/90 shadow-xs space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-2xl bg-[#EBF2FF] text-[#2563EB] flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-5 h-5">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-black text-gray-900 leading-tight">Weekly Availability Summary</h3>
                  <p className="text-xs text-gray-500 font-medium mt-0.5">
                    {weekBookingCount} booking{weekBookingCount === 1 ? '' : 's'} this week
                  </p>
                </div>
              </div>

              {/* Day Pillars */}
              <div className="grid grid-cols-7 gap-1.5 pt-2">
                {weekDays.map((d) => {
                  const isSelected = sameDay(d.day, selectedDate)
                  return (
                    <button
                      type="button"
                      key={dayKey(d.day)}
                      onClick={() => setSelectedDate(d.day)}
                      className={`flex flex-col items-center py-2.5 px-1 rounded-2xl transition-all cursor-pointer ${
                        isSelected
                          ? 'border-2 border-blue-400 bg-blue-50/40 shadow-2xs'
                          : 'border border-gray-100 hover:bg-gray-50'
                      }`}
                    >
                      <span className="text-[11px] font-bold text-gray-600">{d.label}</span>
                      <span
                        className={`w-2 h-2 rounded-full my-2 ${
                          d.status === 'shift'
                            ? 'bg-[#FF6A00]'
                            : d.status === 'free'
                            ? 'bg-[#10B981]'
                            : 'bg-gray-300'
                        }`}
                      />
                      <span className="text-xs font-extrabold text-gray-800">{d.hours}</span>
                    </button>
                  )
                })}
              </div>

              {/* Legend */}
              <div className="flex items-center justify-between text-[11px] font-semibold text-gray-500 pt-2 border-t border-gray-100">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#10B981]" />
                  <span>No bookings</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#FF6A00]" />
                  <span>Bookings</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-gray-300" />
                  <span>Closed</span>
                </div>
              </div>
            </div>

            {/* 2. Want more hours? */}
            <div className="bg-[#F0F7FF] border border-[#DCEBFE] rounded-3xl p-5 flex items-center justify-between gap-3 shadow-2xs hover:bg-blue-50/80 transition-colors cursor-pointer group">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-100 text-[#2563EB] flex items-center justify-center shrink-0 mt-0.5">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-[#2563EB]">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-900 group-hover:text-blue-700 transition-colors">
                    Want more hours?
                  </h4>
                  <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
                    You can pick up available shifts or report your availability for extra hours.
                  </p>
                </div>
              </div>
              <span className="text-gray-400 text-lg group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all">›</span>
            </div>

            {/* 3. Quick Actions */}
            <div className="bg-white rounded-lg p-5 border border-slate-200 space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Quick Actions</h3>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* View Full Schedule */}
                <button
                  type="button"
                  className="bg-[#F8F9FA] hover:bg-gray-100/80 active:scale-95 transition-all p-4 rounded-2xl border border-gray-100 text-left space-y-2 cursor-pointer shadow-2xs group"
                >
                  <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#2563EB] flex items-center justify-center group-hover:scale-105 transition-transform">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-black text-gray-900 leading-tight">View Full Schedule</p>
                    <p className="text-[10px] text-gray-500 font-medium mt-1 leading-snug">
                      See all committee schedules and availability.
                    </p>
                  </div>
                </button>

                {/* Need Help? */}
                <button
                  type="button"
                  className="bg-[#F8F9FA] hover:bg-gray-100/80 active:scale-95 transition-all p-4 rounded-2xl border border-gray-100 text-left space-y-2 cursor-pointer shadow-2xs group"
                >
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-black text-gray-900 leading-tight">Need Help?</p>
                    <p className="text-[10px] text-gray-500 font-medium mt-1 leading-snug">
                      Contact the admin or committee lead.
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* 4. Reminder */}
            <div className="bg-white rounded-3xl p-5 border border-gray-100/90 shadow-xs flex items-center justify-between gap-3 hover:border-gray-200 transition-colors cursor-pointer group">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#EBF2FF] text-[#2563EB] flex items-center justify-center shrink-0 mt-0.5">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-xs font-black text-gray-900">Reminder</h4>
                  <p className="text-xs text-gray-500 font-medium mt-0.5 leading-relaxed">
                    Always communicate early if you're unable to take your assigned shift. It helps the team stay on track!
                  </p>
                </div>
              </div>
              <span className="text-gray-300 text-lg group-hover:text-gray-600 group-hover:translate-x-0.5 transition-all">›</span>
            </div>
          </div>
        </div>

        {/* Decline Modal */}
        {showDeclineModal && (
          <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-fade-in">
            <div className="bg-white rounded-lg p-5 max-w-md w-full border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-slate-900">Cancel Appointment</h3>
                <button
                  type="button"
                  onClick={() => setShowDeclineModal(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                >
                  <CloseIcon className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-xs text-slate-600">
                {cancelTarget ? (
                  <>
                    You are about to close the{' '}
                    <strong>
                      {String(cancelTarget.appoint_type || '').toUpperCase() === 'CLAIM'
                        ? 'CLAIM'
                        : 'VISIT'}{' '}
                      appointment
                    </strong>{' '}
                    booked for{' '}
                    <strong>
                      {cancelTarget.appoint_date
                        ? new Date(cancelTarget.appoint_date).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })
                        : 'this day'}
                    </strong>{' '}
                    (Customer #{cancelTarget.cust_id}). The customer will be notified.
                  </>
                ) : (
                  'Select a booking to cancel.'
                )}
              </p>
              <textarea
                placeholder="e.g. Shop closed for inventory on this date..."
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full p-2.5 rounded-md border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-brand-orange resize-none"
              />
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowDeclineModal(false)}
                  className="h-8 px-3 rounded-md text-xs font-bold text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
                >
                  Keep Appointment
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCancel}
                  disabled={!cancelReason.trim() || isCancelling}
                  className="h-8 px-3 rounded-md text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCancelling ? 'Cancelling…' : 'Cancel Appointment'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
