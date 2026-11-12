import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import { useAdmin } from '../../hooks/useAdmin.js'
import { useToast } from '../../hooks/useToast.js'
import { useApiChange } from '../../hooks/useApiChange.js'
import {
  fetchAppointments,
  fetchSlots,
  closeAppointment,
  bulkReschedule,
  SLOT_RULES,
} from '../../services/appointments.js'
import { fetchAccounts } from '../../services/accounts.js'
import Modal from '../../components/ui/Modal.jsx'
import Button from '../../components/ui/Button.jsx'
import { logAction } from '../../services/access.js'
import { TimelineSkeleton } from '../../components/admin/kit/AdminSkeleton.jsx'

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
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
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
  const [showPurpose, setShowPurpose] = useState(false)

  // Cancel-appointment flow (required reason — REQ-SC-04)
  const [showDeclineModal, setShowDeclineModal] = useState(false)
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelReason, setCancelReason] = useState('')
  const [isCancelling, setIsCancelling] = useState(false)
  const [viewingBooking, setViewingBooking] = useState(null)
  // Sudden suspension: move the whole day's bookings at once
  const [showSuspend, setShowSuspend] = useState(false)
  const [suspendReason, setSuspendReason] = useState('')
  const [suspendTarget, setSuspendTarget] = useState('')
  const [isSuspending, setIsSuspending] = useState(false)
  const [suspendResult, setSuspendResult] = useState(null)

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

  // Realtime (REQ-MANAGE_APP-02, REQ-EMP_SCHED-02): a booking or a schedule
  // change made anywhere re-reads the master list and the slot availability for
  // the selected day at once, so the calendar does not drift from the counter.
  const version = useApiChange(['appoint', 'shifts', 'orders', 'checkout'])

  useEffect(() => {
    loadSchedule(selectedDate)
  }, [selectedDate, reloadKey, loadSchedule, version])

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
          subtitle: `${s.occupied} booked · unavailable slots include the cancellation reason`,
          icon: 'clock',
          occupied: s.occupied,
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
          occupied: s.occupied,
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

  const handleViewBooking = (appt) => setViewingBooking(appt)

  const isAdminRole = ['ADMIN', 'SUPER_ADMIN'].includes(currentAdminUser?.roleKey)
  const viewingType =
    String(viewingBooking?.appoint_type || '').toUpperCase() === 'CLAIM' ? 'Claim' : 'Visit'
  const viewingStart = parseDateish(viewingBooking?.appoint_date)
  const viewingDuration = SLOT_RULES[viewingType.toUpperCase()].minutes
  const viewingEnd = viewingStart
    ? new Date(viewingStart.getTime() + viewingDuration * 60000)
    : null
  const viewingCustomerName = [
    viewingBooking?.cust_givname,
    viewingBooking?.cust_surname,
  ].filter(Boolean).join(' ') || viewingBooking?.customer_name || viewingBooking?.cust_name
  const viewingStatus = viewingBooking?.appoint_closed
    ? 'Closed'
    : viewingBooking?.appoint_status || 'Upcoming'

  const openSuspend = () => {
    setSuspendReason('')
    setSuspendTarget('')
    setSuspendResult(null)
    setShowSuspend(true)
  }

  const suspendError =
    suspendReason.length > 200
      ? 'Keep the reason under 200 characters.'
      : suspendTarget && suspendTarget <= dayKey(selectedDate)
        ? 'The new date must be after the suspended day.'
        : ''

  const handleConfirmSuspend = async () => {
    const reason = suspendReason.trim()
    if (!reason || suspendError) return
    setIsSuspending(true)
    try {
      const res = await bulkReschedule({
        date: dayKey(selectedDate),
        targetDate: suspendTarget,
        reason,
      })
      const data = res?.data || {}
      setSuspendResult({ moved: data.moved || [], unplaced: data.unplaced || [] })
      showToast(res?.message || 'Appointments rescheduled.', 'success')
      setReloadKey((k) => k + 1)
    } catch (err) {
      showToast(err?.message || 'Could not reschedule this day.', 'error')
    } finally {
      setIsSuspending(false)
    }
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
    } catch {
      showToast('Failed to cancel the appointment.', 'error')
    } finally {
      setIsCancelling(false)
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-4 animate-fade-in">
        {/* Compacted Top Greeting Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-3">
            {searchParams.get('from') === 'notifications' && (
              <button
                type="button"
                onClick={() => navigate('/admin/notifications')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5 text-slate-500">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                <span>Back to Notifications</span>
              </button>
            )}
            <div>
              <h1 className="page-title text-slate-900 dark:text-[var(--ink)] flex items-center gap-2">
                <span>{new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening'}, {staffName}!</span>
              </h1>
              <p className="text-xs text-slate-500 font-normal mt-0.5">
                Here's your today's schedule at a glance.
              </p>
            </div>
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
            {/* 1. Selected-day summary */}
            <div className="bg-gradient-to-br from-[#FFF9F5] to-[#FFF1E5] border border-[#FFE7D6] rounded-lg p-4 relative overflow-hidden">
              <div className="relative">

                <div className="grid grid-cols-3 divide-x divide-orange-200/80 mt-4 rounded-lg border border-orange-100 bg-white/70">
                  {[
                    {
                      label: 'Bookings',
                      value: dayTotals.claims + dayTotals.visits,
                      detail: `${dayTotals.claims} claim · ${dayTotals.visits} visit`,
                      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
                    },
                    {
                      label: 'Available slots',
                      value: slotsUnavailable ? '—' : availableSlotCount,
                      detail: slotsUnavailable ? 'Availability unavailable' : 'Open for booking',
                      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
                    },
                    {
                      label: 'Closed appointments',
                      value: dayTotals.cancelled,
                      detail: 'Cancelled or closed',
                      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="9" y1="14" x2="15" y2="14" /></svg>,
                    },
                  ].map((stat) => (
                    <div key={stat.label} className="min-w-0 px-2.5 py-2 flex items-center gap-2">
                      <span className="w-7 h-7 rounded-lg bg-orange-50 text-[#FF6A00] flex items-center justify-center shrink-0">
                        {stat.icon}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-slate-900 leading-tight">{stat.value}</span>
                        <span className="block text-[10px] font-semibold text-slate-700 truncate">{stat.label}</span>
                        <span className="block text-[9px] text-slate-500 truncate">{stat.detail}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 2. Today's Timeline */}
            <div className="bg-white rounded-lg p-4 border border-slate-200 space-y-4">
              {/* Timeline Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div>
                    <h2 className="text-lg font-black text-gray-900">Appointments Timeline</h2>
                    <p className="text-xs text-gray-400 mt-0.5">{fmtBadgeDate(selectedDate)}</p>
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
              <div className="relative">
                {isLoading && <TimelineSkeleton rows={6} className="border-0 rounded-none shadow-none" />}
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
                {!isLoading && timelineItems.length > 0 && (
                  <div className="space-y-3">
                    {Array.from(new Set(timelineItems.map((item) => {
                      const start = item.time.split('–')[0].trim()
                      const m = start.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
                      if (!m) return 'Other'
                      let hh = parseInt(m[1], 10)
                      const ampm = (m[3] || '').toUpperCase()
                      if (ampm === 'PM' && hh !== 12) hh += 12
                      if (ampm === 'AM' && hh === 12) hh = 0
                      return `${String(hh).padStart(2, '0')}:00`
                    }))).sort((a, b) => a.localeCompare(b)).map((hourKey) => {
                      const hourItems = timelineItems.filter((item) => {
                        const start = item.time.split('–')[0].trim()
                        const m = start.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
                        if (!m) return hourKey === 'Other'
                        let hh = parseInt(m[1], 10)
                        const ampm = (m[3] || '').toUpperCase()
                        if (ampm === 'PM' && hh !== 12) hh += 12
                        if (ampm === 'AM' && hh === 12) hh = 0
                        return `${String(hh).padStart(2, '0')}:00` === hourKey
                      })
                      const displayHour = hourKey === 'Other' ? 'Other' : (() => {
                        const h = parseInt(hourKey.split(':')[0], 10)
                        const h12 = h % 12 === 0 ? 12 : h % 12
                        const ampm = h < 12 ? 'AM' : 'PM'
                        return `${h12}:00 ${ampm}`
                      })()
                      const directBookings = hourItems.filter((i) => i.type === 'shift').length
                      const slotOccupied = hourItems.filter((i) => i.type !== 'shift').reduce((sum, i) => sum + (Number(i.occupied) || 0), 0)
                      const bookingCount = Math.max(directBookings, slotOccupied)
                      const hasBookings = bookingCount > 0
                      const openSlots = hourItems.filter((i) => i.type === 'free').length
                      const unavailableSlots = hourItems.filter((i) => i.type === 'class').length
                      const stateLabel = openSlots > 0
                        ? hasBookings ? 'Partially booked' : 'Available'
                        : hasBookings ? 'Booked' : 'Closed'
                      const stateStyle = openSlots > 0
                        ? hasBookings
                          ? 'bg-orange-100 text-orange-800'
                          : 'bg-emerald-100 text-emerald-700'
                        : hasBookings
                          ? 'bg-orange-100 text-orange-800'
                          : 'bg-slate-100 text-slate-600'
                      return (
                        <details
                          key={hourKey}
                          className="group rounded-xl overflow-hidden border border-[#E5EAF5] bg-white transition-colors hover:border-[#D7DFEF]"
                        >
                          <summary
                            className="flex items-center justify-between gap-3 px-3 py-2.5 bg-gradient-to-r from-slate-50/80 to-[#F8FAFF] hover:from-slate-50 hover:to-[#F1F5FF] cursor-pointer select-none transition-colors"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="relative w-5 self-stretch flex justify-center shrink-0">
                                <span className={`absolute top-0.5 bottom-0.5 left-1/2 -translate-x-1/2 w-px ${hasBookings ? 'bg-orange-200' : 'bg-slate-200'}`} />
                                <span className={`relative mt-1 w-2.5 h-2.5 rounded-full ring-2 ring-white ${hasBookings ? 'bg-[#FF8A00]' : openSlots > 0 ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <span className="block text-sm font-bold text-slate-900">{displayHour}</span>
                                <span className="block text-[11px] text-slate-500">
                                  {hasBookings
                                    ? `${bookingCount} appointment${bookingCount === 1 ? '' : 's'}`
                                    : openSlots > 0 ? `${openSlots} available slot${openSlots === 1 ? '' : 's'}` : 'Unavailable for bookings'}
                                  {openSlots > 0 && hasBookings ? ` · ${openSlots} open` : ''}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold ${stateStyle}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${stateLabel === 'Available' ? 'bg-emerald-500' : stateLabel === 'Closed' ? 'bg-slate-400' : 'bg-orange-500'}`} />
                                {stateLabel}
                              </span>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-gray-400 transition-transform duration-200 group-open:rotate-180">
                                <polyline points="6 9 12 15 18 9" />
                              </svg>
                            </div>
                          </summary>
                          <div className="p-3 space-y-2 border-t border-slate-100 bg-white">
                            {hourItems.map((item) => {
                              const isShift = item.type === 'shift'
                              const isFree = item.type === 'free'
                              const cardClass = `flex-1 rounded-lg p-3 flex items-center justify-between gap-3 transition-colors ${
                                isShift
                                  ? 'bg-[#FFF5ED] border border-[#FFE2D1] hover:bg-orange-100/70 hover:border-orange-300'
                                  : isFree
                                  ? 'bg-[#F0FDF4] border border-[#DCFCE7]'
                                  : 'bg-slate-50 border border-slate-200'
                              }`
                              const cardContents = (
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
                                    {item.subtitle && <p className="text-xs text-gray-500 mt-0.5">{item.subtitle}</p>}
                                  </div>
                                </div>
                              )
                              return (
                                <div key={item.key} className="flex items-start gap-4">
                                  <div className="w-20 text-left shrink-0 pt-1">
                                    <p className={`text-xs font-bold leading-tight ${isShift ? 'text-[#FF6A00]' : 'text-gray-700'}`}>
                                      {item.time.split('–')[0]}
                                    </p>
                                    <p className="text-2xs text-gray-400">
                                      {item.time.split('–')[1] ? `– ${item.time.split('–')[1]}` : ''}
                                    </p>
                                    <span
                                      className={`inline-block text-2xs font-bold px-2 py-0.5 rounded-full mt-1 whitespace-nowrap ${
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
                                  <div
                                    className={`w-2.5 h-2.5 rounded-full border-2 border-white shrink-0 ${
                                      isShift
                                        ? 'bg-[#FF6A00] ring-2 ring-orange-100'
                                        : isFree
                                        ? 'bg-[#10B981] ring-2 ring-emerald-100'
                                        : 'bg-slate-300'
                                    }`}
                                  />
                                  <div
                                    className={cardClass}
                                  >
                                    {isShift ? (
                                      <button
                                        type="button"
                                        onClick={() => handleViewBooking(item.raw)}
                                        aria-label={`View details for ${item.title}`}
                                        className="flex-1 flex items-center justify-between gap-3 min-w-0 text-left rounded-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
                                      >
                                        {cardContents}
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 text-slate-400 shrink-0">
                                          <polyline points="9 18 15 12 9 6" />
                                        </svg>
                                      </button>
                                    ) : (
                                      cardContents
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                            {unavailableSlots > 0 && (
                              <p className="text-[10px] text-slate-400 text-right">
                                {unavailableSlots} unavailable slot{unavailableSlots === 1 ? '' : 's'}
                              </p>
                            )}
                          </div>
                        </details>
                      )
                    })}
                  </div>
                )}
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
                    Open a booking for its details and cancellation options. For a sudden suspension,
                    “Suspend day” moves every booking of this date at once.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
              {isAdminRole && (
                <button
                  type="button"
                  onClick={openSuspend}
                  className="border border-slate-800 text-white bg-slate-800 hover:bg-slate-900 font-bold text-xs h-8 px-3 rounded-md whitespace-nowrap cursor-pointer transition-colors"
                >
                  Suspend day
                </button>
              )}
              </div>
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
                  <h3 className="text-base font-black text-gray-900 leading-tight">Bookings Overview</h3>
                  <p className="text-xs text-gray-500 font-medium mt-0.5">
                    {weekBookingCount} scheduled this week
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
                      <span className="text-2xs font-bold text-gray-600">{d.label}</span>
                      <span
                        className={`w-2 h-2 rounded-full my-2 ${
                          d.bookings > 0
                            ? 'bg-[#FF6A00]'
                            : d.day.getDay() === 0
                            ? 'bg-gray-300'
                            : 'bg-[#10B981]'
                        }`}
                      />
                      <span className="text-xs font-extrabold text-gray-800">{d.bookings}</span>
                    </button>
                  )
                })}
              </div>

              {/* Legend */}
              <div className="flex items-center justify-between text-2xs font-semibold text-gray-500 pt-2 border-t border-gray-100">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#10B981]" />
                  <span>No bookings</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#FF6A00]" />
                  <span>With bookings</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-gray-300" />
                  <span>Closed/Sunday</span>
                </div>
              </div>
            </div>

            {/* 2. Want more hours? — removed as requested */}

            {/* 3. Quick Actions */}
            <div className="bg-white rounded-lg p-5 border border-slate-200 space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Quick Actions</h3>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* View Full Schedule */}
                <button
                  type="button"
                  onClick={() => navigate('/admin/schedules')}
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
                    <p className="text-2xs text-gray-500 font-medium mt-1 leading-snug">
                      See all committee schedules and availability.
                    </p>
                  </div>
                </button>

                {/* Need Help? */}
                <button
                  type="button"
                  // Spec: support contact uses the shared support inbox (same as DesktopFooter)
                  onClick={() => {
                    window.location.href = 'mailto:support@tindahanniisko.com'
                  }}
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
                    <p className="text-2xs text-gray-500 font-medium mt-1 leading-snug">
                      Contact the admin or committee lead.
                    </p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>

        <Modal
          isOpen={showPurpose}
          onClose={() => setShowPurpose(false)}
          title="About the Appointments Page"
          subtitle="Daily bookings and store-slot availability"
          footer={
            <Button variant="primary" onClick={() => setShowPurpose(false)} className="px-4">
              Got it
            </Button>
          }
        >
          <div className="space-y-3 text-sm text-slate-600">
            <p>
              Use this page to review customer store visits and order-pickup appointments,
              together with the slots available for the selected date.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Change the date to review another day, or select a day in the weekly overview.</li>
              <li>Expand a timeline hour to see its bookings and individual slot availability.</li>
              <li>Admins can cancel a booking with a customer-facing reason or suspend a day to reschedule its bookings.</li>
            </ul>
            <p className="text-xs text-slate-500">
              The summary counts show active claim and visit bookings, open slots, and closed appointments for the selected day.
            </p>
          </div>
        </Modal>

        {/* Suspend day - batch reschedule (POST /appoint/bulk-reschedule) */}
        {showSuspend && (
          <Modal
            isOpen={showSuspend}
            onClose={() => setShowSuspend(false)}
            title={`Suspend ${fmtBadgeDate(selectedDate)}`}
            size="wide"
            footer={
              suspendResult ? (
                <Button variant="primary" onClick={() => setShowSuspend(false)} className="px-3.5">
                  Done
                </Button>
              ) : (
                <>
                  <Button variant="secondary" onClick={() => setShowSuspend(false)} className="px-3.5">
                    Keep schedule
                  </Button>
                  <Button
                    variant="danger"
                    onClick={handleConfirmSuspend}
                    disabled={!suspendReason.trim() || Boolean(suspendError) || isSuspending}
                    className="px-3.5"
                  >
                    {isSuspending ? 'Rescheduling…' : `Reschedule ${dayBookings.length} booking(s)`}
                  </Button>
                </>
              )
            }
          >
            {suspendResult ? (
              <div className="space-y-2 text-sm text-gray-700">
                <p>
                  <strong>{suspendResult.moved.length}</strong> booking(s) moved. The day is now closed for new bookings and
                  every customer was notified.
                </p>
                {suspendResult.unplaced.length > 0 && (
                  <p className="text-rose-700">
                    {suspendResult.unplaced.length} booking(s) could not be placed automatically
                    (#{suspendResult.unplaced.map((u) => u.appoint_id).join(', #')}). Their customers were told the store
                    will contact them.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  Every open booking on this date is moved, keeping its time of day when possible. The day is
                  also closed so no new bookings land on it, and each customer gets a notification with the reason.
                </p>
                <div>
                  <label className="field-label" htmlFor="suspend-reason">Reason</label>
                  <textarea
                    id="suspend-reason"
                    rows={2}
                    maxLength={200}
                    value={suspendReason}
                    onChange={(e) => setSuspendReason(e.target.value)}
                    placeholder="e.g. Class suspension due to typhoon"
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="suspend-target">Move to (optional)</label>
                  <input
                    id="suspend-target"
                    type="date"
                    min={dayKey(addDays(selectedDate, 1))}
                    value={suspendTarget}
                    onChange={(e) => setSuspendTarget(e.target.value)}
                    className="input"
                  />
                  <p className="text-xs text-gray-500 mt-1">Leave blank to use the next open day.</p>
                </div>
                {suspendError && <p className="text-xs font-semibold text-rose-600" role="alert">{suspendError}</p>}
              </div>
            )}
          </Modal>
        )}

        {viewingBooking && (
          <Modal
            isOpen
            onClose={() => setViewingBooking(null)}
            title={`${viewingType} Booking`}
            subtitle={`Booking #${viewingBooking.appoint_id}`}
            size="wide"
            footer={
              <>
                <Button variant="secondary" onClick={() => setViewingBooking(null)}>
                  Close
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    handleOpenCancel(viewingBooking)
                    setViewingBooking(null)
                  }}
                  className="px-3.5"
                >
                  Cancel Appointment
                </Button>
              </>
            }
          >
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-2xs font-semibold uppercase tracking-wide text-slate-500">Date and time</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">
                    {viewingStart
                      ? `${viewingStart.toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                        })} · ${fmtTime(viewingStart)}${viewingEnd ? ` – ${fmtTime(viewingEnd)}` : ''}`
                      : 'Not available'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{viewingDuration}-minute {viewingType.toLowerCase()} slot</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-2xs font-semibold uppercase tracking-wide text-slate-500">Customer</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">
                    {viewingCustomerName || `Customer #${viewingBooking.cust_id}`}
                  </p>
                  {viewingCustomerName && (
                    <p className="mt-1 text-xs text-slate-500">Customer #{viewingBooking.cust_id}</p>
                  )}
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-2xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
                  <p className="mt-1 text-sm font-bold capitalize text-slate-900">{viewingStatus}</p>
                </div>
                {viewingBooking.appoint_qr && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-2xs font-semibold uppercase tracking-wide text-slate-500">Booking reference</p>
                    <p className="mt-1 break-all text-sm font-semibold text-slate-900">
                      {viewingBooking.appoint_qr}
                    </p>
                  </div>
                )}
              </div>
              {viewingBooking.appoint_desc && (
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-2xs font-semibold uppercase tracking-wide text-slate-500">Booking details</p>
                  <p className="mt-1 text-sm text-slate-700">{viewingBooking.appoint_desc}</p>
                </div>
              )}
              <p className="text-xs text-slate-500">
                Cancelling requires a reason. The customer will be notified after the cancellation is confirmed.
              </p>
            </div>
          </Modal>
        )}

        {/* Cancel Appointment - shared popup shell (index.css primitives) */}
        {showDeclineModal && (
          <Modal
            isOpen={showDeclineModal}
            onClose={() => setShowDeclineModal(false)}
            title="Cancel Appointment"
            size="wide"
            footer={
              <>
                <Button variant="secondary" onClick={() => setShowDeclineModal(false)} className="px-3.5">
                  Keep Appointment
                </Button>
                <Button
                  variant="danger"
                  onClick={handleConfirmCancel}
                  disabled={!cancelReason.trim() || isCancelling}
                  className="px-3.5"
                >
                  {isCancelling ? 'Cancelling…' : 'Cancel Appointment'}
                </Button>
              </>
            }
          >
            <p className="text-sm text-gray-600">
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
            <label className="field-label" htmlFor="appoint-cancel-reason">
              Reason
            </label>
            <textarea
              id="appoint-cancel-reason"
              placeholder="e.g. Shop closed for inventory on this date..."
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="field-input resize-none"
            />
          </Modal>
        )}
      </div>
    </AdminLayout>
  )
}
