import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from '../hooks/useToast.js'
import AccountLayout from '../components/layout/AccountLayout.jsx'
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx'
import Avatar from '../components/ui/Avatar.jsx'
import logo from '../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'
import { SettingsIcon, ShirtIcon } from '../components/ui/Icons.jsx'
import { getImageUrl } from '../utils/imageUtils.js'
import {
  fetchAppointments,
  fetchSlots,
  createAppointment,
  SLOT_RULES,
} from '../services/appointments.js'
import { fetchOrder } from '../services/orders.js'
import { fetchNotifications, unreadCount } from '../services/notifications.js'

/* ── Server-backed helpers ── */

function formatClock(value) {
  const s = String(value || '')
  const m = s.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return s
  let h = Number(m[1])
  const suffix = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${m[2]} ${suffix}`
}

function parseDateParts(value) {
  const s = String(value || '')
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    if (!Number.isNaN(d.getTime())) {
      return {
        date: d.toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        }),
        dayOfWeek: d.toLocaleDateString('en-US', { weekday: 'long' }),
      }
    }
  }
  return { date: s || 'To be scheduled', dayOfWeek: '' }
}

function slotTime(slot) {
  return slot.slot_start ?? slot.start_time ?? slot.start ?? slot.time ?? slot.slot_time ?? ''
}

function slotOpen(slot) {
  if (slot.available === false || slot.is_available === false) return false
  if (slot.open === false || slot.full === true) return false
  const booked = Number(slot.booked ?? slot.taken ?? slot.reserved ?? slot.used ?? 0)
  const capacity = Number(slot.capacity ?? slot.limit ?? 0)
  return !(capacity > 0 && booked >= capacity)
}

function slotReason(slot) {
  return slot.reason || slot.disabled_reason || 'Fully booked'
}

/** Items preview taken from the linked order (when one exists). */
function itemsOfOrder(ordRow) {
  if (!ordRow?.items?.length) return []
  return ordRow.items.map((e) => {
    const p = e.product || {}
    return {
      name: p.name || p.prod_name || 'Item',
      details: `Qty ${e.item_qty ?? 1}${p.size ? ` · Size ${p.size}` : ''}`,
      image: e.color?.image || p.image || p.images?.[0] || null,
    }
  })
}

function mapAppointment(row, ordRow) {
  const rawStatus = String(row.appoint_status ?? row.status ?? '').toUpperCase()
  let status = 'upcoming'
  if (rawStatus.includes('CANCEL')) status = 'cancelled'
  else if (['COMPLETED', 'CLAIMED', 'CLOSED', 'DONE', 'FULFILLED'].some((k) => rawStatus.includes(k)))
    status = 'completed'

  const start = row.appoint_start ?? row.slot_start ?? row.appoint_time ?? ''
  const end = row.appoint_end ?? ''
  const time = start
    ? `${formatClock(start)}${end ? ` – ${formatClock(end)}` : ''}`
    : 'To be confirmed'
  const { date, dayOfWeek } = parseDateParts(row.appoint_date ?? row.appoint_day ?? '')
  const items = itemsOfOrder(ordRow)

  return {
    id: row.appoint_id ?? row.id,
    orderId: row.ord_id ?? row.order_id ?? null,
    type: String(row.appoint_type || 'CLAIM').toUpperCase(),
    itemCount: items.length || Number(row.item_count ?? 1),
    status,
    date,
    dayOfWeek,
    time,
    location: 'Tindahan ni Isko – Main Campus',
    subLocation: 'Bicol University, Main Campus',
    items,
  }
}

/** Booking form: date → slots → POST /appoint/create (REQ-SC-02). */
function BookAppointmentCard({ custId, onBooked }) {
  const { showToast } = useToast()
  const [date, setDate] = useState('')
  const [type, setType] = useState('CLAIM')
  const [slots, setSlots] = useState([])
  const [slot, setSlot] = useState('')
  const [slotsError, setSlotsError] = useState('')
  const [booking, setBooking] = useState(false)

  useEffect(() => {
    if (!date) {
      setSlots([])
      return undefined
    }
    let cancelled = false
    ;(async () => {
      setSlot('')
      setSlotsError('')
      try {
        const rows = await fetchSlots(date)
        if (!cancelled) setSlots(Array.isArray(rows) ? rows : [])
      } catch (err) {
        if (!cancelled) {
          setSlots([])
          setSlotsError(err?.message || 'Unable to load time slots right now.')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [date])

  const handleBook = async () => {
    if (booking) return
    if (!custId) return
    if (!date || !slot) {
      showToast('Please pick a date and a time slot first.', 'error')
      return
    }
    setBooking(true)
    try {
      await createAppointment({
        cust_id: custId,
        appoint_type: type,
        appoint_date: date,
        appoint_desc: `${type === 'CLAIM' ? 'Order claim' : 'Store visit'} appointment on ${date} at ${slot}`,
        // Start time is sent under several keys until the API contract is fixed.
        slot_start: slot,
        appoint_start: slot,
        appoint_time: slot,
      })
      showToast('Appointment booked! See it in your list below.', 'success')
      setSlot('')
      onBooked?.()
    } catch (err) {
      showToast(err?.message || 'Unable to book that slot. Try another one.', 'error')
    } finally {
      setBooking(false)
    }
  }

  const rules = SLOT_RULES[type] || SLOT_RULES.CLAIM

  return (
    <div className="bg-white rounded-lg p-4 border border-slate-200 space-y-3">
      <div>
        <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
          Book an Appointment
        </h2>
        <p className="text-xs text-slate-500 leading-relaxed mt-0.5">
          Reserve a slot to claim your order or visit the store. Slots are{' '}
          {rules.minutes} minutes long (up to {rules.capacity}{' '}
          {rules.capacity === 1 ? 'person' : 'people'} per slot).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          {Object.entries(SLOT_RULES).map(([key]) => (
            <button
              key={key}
              type="button"
              onClick={() => setType(key)}
              className={`h-8 px-3 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                type === key
                  ? 'bg-brand-orange text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              {key === 'CLAIM' ? 'Claim Order' : 'Store Visit'}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-500 ml-auto">
          <span>Date</span>
          <input
            type="date"
            value={date}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDate(e.target.value)}
            className="px-2 py-1.5 rounded-md border border-slate-200 text-xs text-gray-700 focus:border-brand-orange"
          />
        </label>
      </div>

      {slotsError && <p className="text-xs text-red-500 bg-red-50 rounded-md p-2">{slotsError}</p>}
      {!date && (
        <p className="text-xs text-slate-500 bg-slate-50 rounded-md p-2.5">
          Pick a date to see the available time slots.
        </p>
      )}
      {date && !slotsError && slots.length === 0 && (
        <p className="text-xs text-slate-500 bg-slate-50 rounded-md p-2.5">
          No slots are open for this date yet. Try another date.
        </p>
      )}

      {slots.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {slots.map((s, idx) => {
            const time = slotTime(s)
            const open = slotOpen(s)
            const active = open && slot === time
            return (
              <button
                key={time || `slot-${idx}`}
                type="button"
                disabled={!open}
                title={open ? time : slotReason(s)}
                onClick={() => open && setSlot(time)}
                className={`py-2 rounded-md text-xs font-semibold border transition-colors ${
                  active
                    ? 'bg-brand-orange text-white border-brand-orange'
                    : open
                    ? 'bg-white text-gray-700 border-slate-200 hover:border-brand-orange cursor-pointer'
                    : 'bg-slate-100 text-slate-400 border-slate-100 cursor-not-allowed line-through'
                }`}
              >
                {time || `Slot ${idx + 1}`}
                {!open && (
                  <span className="block text-[10px] font-normal no-underline">
                    {slotReason(s)}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      <button
        type="button"
        disabled={booking || !slot}
        onClick={handleBook}
        className="w-full h-9 rounded-md bg-brand-orange hover:bg-brand-orange-dark text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {booking
          ? 'Booking…'
          : slot
          ? `Book ${type === 'CLAIM' ? 'claim' : 'visit'} slot • ${date} ${slot}`
          : 'Select a time slot to book'}
      </button>
    </div>
  )
}

function SmallCalendarIcon({ className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function ClockIcon({ className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

function PinIcon({ className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

function ScreenClaimIcon({ className = 'w-6 h-6' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <path d="M7 8h10" />
      <path d="M7 12h6" />
    </svg>
  )
}

function PencilIcon({ className = 'w-3.5 h-3.5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

function CheckmarkCircleIcon({ className = 'w-8 h-8' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" className="text-blue-500 fill-blue-50" />
      <polyline points="9 12 11 14 15 10" className="text-blue-600 stroke-[2.5]" />
    </svg>
  )
}

function Appointments() {
  const { currentUser } = useAuth()
  const { showToast } = useToast()
  const [activeFilter, setActiveFilter] = useState('all')
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  const [unread, setUnread] = useState(0)

  const baseUser = currentUser || {}
  const rawEmail = baseUser.email || ''
  const rawPhone = baseUser.phone || ''
  const isRawPhoneActuallyEmail = rawPhone && rawPhone.includes('@')
  const email = isRawPhoneActuallyEmail ? rawPhone : (rawEmail || '')
  const studentId = baseUser.studentId || ''
  const fullName = baseUser.fullName || 'User'
  const custId = baseUser.cust_id ?? baseUser.id ?? null

  /** Load own appointments from GET /appoint/display with their order items. */
  const loadAppointments = useCallback(async () => {
    if (!custId) {
      setAppointments([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const rows = await fetchAppointments({ cust_id: custId })
      const list = Array.isArray(rows) ? rows : []
      const orderIds = [
        ...new Set(list.map((r) => r.ord_id ?? r.order_id).filter(Boolean)),
      ].slice(0, 12)
      const orderRows = await Promise.all(
        orderIds.map((oid) => fetchOrder(oid).catch(() => null))
      )
      const cache = {}
      orderIds.forEach((oid, i) => {
        if (orderRows[i]) cache[String(oid)] = orderRows[i]
      })
      setAppointments(
        list.map((row) =>
          mapAppointment(row, cache[String(row.ord_id ?? row.order_id)] ?? null)
        )
      )
    } catch (err) {
      console.warn('Failed to load appointments:', err?.message)
      showToast('Unable to load your appointments. Please try again.', 'error')
    } finally {
      setLoading(false)
    }
  }, [custId, showToast])

  useEffect(() => {
    loadAppointments()
  }, [loadAppointments])

  // Real unread count for the header bell (replaces the hardcoded "3").
  useEffect(() => {
    if (!custId) {
      setUnread(0)
      return undefined
    }
    let alive = true
    fetchNotifications('customer', custId)
      .then((rows) => {
        if (alive) setUnread(unreadCount(rows))
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [custId])

  const filteredAppointments = appointments.filter((appt) => {
    if (activeFilter === 'all') return true
    return appt.status === activeFilter
  })

  const filterTabs = [
    { id: 'all', label: 'All Appointments' },
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'completed', label: 'Completed' },
    { id: 'cancelled', label: 'Cancelled' },
  ]

  return (
    <AccountLayout>
      {/* ── MOBILE VIEW (< md) matching Image 1 ── */}
      <div className="md:hidden pb-28 bg-[#F8F9FA] min-h-dvh">
        {/* Mobile Header: Logo Left, Search + Hamburger Right */}
        <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-30">
          <Link to="/home" className="flex items-center">
            <img src={logo} alt="Tindahan ni Isko" className="h-7 object-contain" />
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/notifications" className="relative p-1.5 text-gray-700 hover:text-brand-orange" aria-label="Notifications">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {unread > 0 && (
                <span className="absolute top-0 right-0 bg-[#FF6A00] text-white text-[10px] font-black w-4.5 h-4.5 rounded-full flex items-center justify-center border-2 border-white">
                  {unread}
                </span>
              )}
            </Link>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Orange Profile Banner */}
          <div className="rounded-3xl p-5 flex items-center justify-between text-white relative overflow-hidden shadow-xs bg-gradient-to-r from-[#FF7A1A] via-[#FF6600] to-[#FF8C33]">
            <div className="absolute inset-0 opacity-[0.05] select-none pointer-events-none flex items-center justify-center">
              <span className="text-5xl font-black tracking-widest rotate-[12deg] whitespace-nowrap text-white">
                TINDAHAN NI ISKO
              </span>
            </div>

            {/* Avatar + Info */}
            <div className="flex items-center gap-3.5 relative z-10 min-w-0">
              <div className="w-16 h-16 rounded-full border-2 border-white overflow-hidden bg-blue-100 shadow-md shrink-0">
                <Avatar name={fullName} size={64} className="w-full h-full" userId={currentUser?.cust_id} />
              </div>
              <div className="min-w-0 text-white">
                <h1 className="text-lg font-black tracking-tight leading-tight truncate">{fullName}</h1>
                <p className="text-white/90 text-xs font-normal mt-0.5 truncate">{email}</p>
                <p className="text-white/80 text-[11px] font-normal mt-0.5">Student ID: {studentId}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 relative z-10 shrink-0">
              <Link
                to="/account"
                className="flex items-center gap-1.5 bg-white text-gray-800 font-bold text-xs px-3 py-1.5 rounded-full shadow-xs hover:bg-gray-50 active:scale-95 transition-all"
              >
                <PencilIcon className="w-3 h-3 text-gray-500" />
                <span>Edit Profile</span>
              </Link>
              <Link
                to="/settings"
                className="w-8 h-8 rounded-full bg-white text-gray-700 flex items-center justify-center shadow-xs hover:bg-gray-50 active:scale-95 transition-all"
                title="Settings"
              >
                <SettingsIcon className="w-4 h-4 text-gray-600" />
              </Link>
            </div>
          </div>

          {/* Section Title & Subtitle */}
          <div className="bg-white rounded-lg p-4 border border-slate-200 space-y-3">
            <div className="flex items-start gap-3">
              <div>
                <h2 className="text-base font-extrabold text-slate-900 tracking-tight">My Appointments</h2>
                <p className="text-xs text-slate-500 leading-relaxed mt-0.5">
                  View your assigned pickup schedule for your orders. Please arrive at the store at your designated time to claim your items.
                </p>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-2 overflow-x-auto scrollbar-none pt-1">
              {filterTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveFilter(tab.id)}
                  className={`h-8 px-3 rounded-md text-xs font-bold shrink-0 transition-colors cursor-pointer ${
                    activeFilter === tab.id
                      ? 'bg-brand-orange text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <BookAppointmentCard custId={custId} onBooked={loadAppointments} />

          {/* Appointments Cards (Matching 2-Column inner card layout of Image 1) */}
          <div className="space-y-4">
            {loading ? (
              <div className="bg-white rounded-3xl p-8 text-center border border-gray-100 shadow-xs flex items-center justify-center gap-3">
                <LoadingSpinner size={24} />
                <p className="text-sm font-bold text-gray-500">Loading your appointments…</p>
              </div>
            ) : filteredAppointments.length === 0 ? (
              <div className="bg-white rounded-3xl p-8 text-center border border-gray-100 shadow-xs">
                <p className="text-sm font-bold text-gray-500">No appointments found in this category.</p>
              </div>
            ) : (
              filteredAppointments.map((appt) => {
                const isUpcoming = appt.status === 'upcoming'
                return (
                  <div
                    key={appt.id}
                    className="bg-white rounded-lg p-3.5 border border-slate-200 space-y-3"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                      {/* Left: Schedule details */}
                      <div className="space-y-2 border-b sm:border-b-0 sm:border-r border-slate-200 pb-3 sm:pb-0 sm:pr-3">
                        <span
                          className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-md uppercase tracking-wider ${
                            isUpcoming
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${isUpcoming ? 'bg-emerald-600' : 'bg-blue-600'}`} />
                          <span>{appt.status}</span>
                        </span>

                        <div className="space-y-1.5 text-xs text-slate-600 pt-1">
                          <div className="flex items-start gap-2">
                            <SmallCalendarIcon className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs font-bold text-slate-900 uppercase">{appt.date}</p>
                              <p className="text-[11px] text-slate-500">{appt.dayOfWeek}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <ClockIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <p className="text-xs font-medium text-slate-800">{appt.time}</p>
                          </div>

                          <div className="flex items-start gap-2">
                            <PinIcon className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs font-medium text-slate-800 leading-tight">{appt.location}</p>
                              <p className="text-[11px] text-slate-500">{appt.subLocation}</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Right: Items and Claiming Action */}
                      <div className="space-y-2.5">
                        <div>
                          <p className="text-xs font-bold text-slate-900">
                            Appointment #{appt.id}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            Order #{appt.orderId} · {appt.itemCount} {appt.itemCount === 1 ? 'item' : 'items'}
                          </p>
                        </div>

                        {/* Item list */}
                        <div className="space-y-2">
                          {appt.items.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-2.5">
                              <div className="w-9 h-9 rounded-md bg-slate-50 border border-slate-200 flex items-center justify-center p-1 shrink-0">
                                {item.image ? (
                                  <img
                                    src={getImageUrl(item.image)}
                                    alt={item.name}
                                    className="w-full h-full object-contain"
                                  />
                                ) : (
                                  <ShirtIcon className="w-5 h-5 text-brand-orange opacity-40" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-900 leading-tight truncate">
                                  {item.name}
                                </p>
                                <p className="text-[11px] text-slate-500">
                                  {item.details}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Claiming Container */}
                        {isUpcoming ? (
                          <div className="space-y-2 pt-1">
                            <div className="bg-orange-50/60 border border-orange-200 rounded-md p-2 flex items-center gap-2 text-brand-orange-dark">
                              <div className="w-5 h-5 rounded-md bg-orange-100 flex items-center justify-center shrink-0">
                                <ScreenClaimIcon className="w-3 h-3 text-brand-orange" />
                              </div>
                              <span className="text-[11px] font-medium leading-tight">
                                Show this screen upon claiming.
                              </span>
                            </div>
                            <Link
                              to={appt.orderId ? `/orders/${appt.orderId}` : '/orders'}
                              className="inline-flex items-center justify-center gap-1 w-full h-8 px-3 rounded-md bg-white border border-brand-orange text-brand-orange text-xs font-bold hover:bg-orange-50 transition-colors"
                            >
                              <span>View Order Details</span>
                              <span>→</span>
                            </Link>
                          </div>
                        ) : (
                          <div className="space-y-2 pt-1">
                            <div className="bg-slate-50 border border-slate-200 rounded-md p-2 flex flex-col items-center justify-center text-center">
                              <div className="flex items-center gap-1.5 text-blue-600 font-bold text-xs">
                                <span className="w-4 h-4 rounded-md bg-blue-100 flex items-center justify-center text-[10px]">✓</span>
                                <span>Order claimed</span>
                              </div>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                Thank you for supporting Tindahan ni Isko!
                              </p>
                            </div>
                            <Link
                              to={appt.orderId ? `/orders/${appt.orderId}` : '/orders'}
                              className="inline-flex items-center justify-center gap-1 w-full h-8 px-3 rounded-md bg-white border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors"
                            >
                              <span>View Order Details</span>
                              <span>→</span>
                            </Link>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Quick Reminders Card (Mobile) */}
          <div className="bg-white rounded-lg p-4 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-md bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center">
                  <ClockIcon className="w-3.5 h-3.5" />
                </div>
                <h3 className="text-sm font-extrabold text-slate-900">Quick Reminders</h3>
              </div>
              <span className="text-slate-400 text-xs font-bold">›</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-md bg-slate-100 text-slate-600 border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                  <ClockIcon className="w-3 h-3" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Arrive on time</h4>
                  <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
                    Please be at the store during your scheduled time slot.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-md bg-slate-100 text-slate-600 border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Bring a valid ID</h4>
                  <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
                    For verification purposes.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-md bg-slate-100 text-slate-600 border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Show your order details</h4>
                  <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
                    You may show this page or your order number.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Store Location Card (Mobile) */}
          <div className="bg-white rounded-lg p-4 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-md bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center">
                  <PinIcon className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">Store Location</h3>
                  <p className="text-xs text-slate-500">Bicol University, Main Campus</p>
                </div>
              </div>
              <span className="text-slate-400 text-xs font-bold">›</span>
            </div>

            {/* Map Graphic Preview */}
            <div className="w-full h-24 rounded-md overflow-hidden relative border border-slate-200 bg-[#E8EFF5]">
              <svg className="w-full h-full opacity-60" viewBox="0 0 300 150" fill="none" preserveAspectRatio="none">
                <rect width="300" height="150" fill="#EBF2F7" />
                <path d="M-20 40 L320 110" stroke="#FFFFFF" strokeWidth="10" strokeLinecap="round" />
                <path d="M60 -20 L180 170" stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round" />
                <path d="M120 70 L320 20" stroke="#FFFFFF" strokeWidth="6" strokeLinecap="round" />
                <rect x="70" y="20" width="30" height="25" rx="3" fill="#DFE7EE" />
                <rect x="190" y="70" width="40" height="30" rx="3" fill="#DFE7EE" />
              </svg>

              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative">
                  <div className="w-6 h-6 rounded-md bg-brand-orange text-white flex items-center justify-center animate-bounce">
                    <PinIcon className="w-3.5 h-3.5 text-white" />
                  </div>
                </div>
              </div>
            </div>

            <a
              href="https://maps.google.com/?q=Bicol+University+Main+Campus+Legazpi+City"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full h-8 rounded-md border border-slate-200 text-blue-600 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-blue-50 transition-colors"
            >
              <span>View on Maps</span>
              <span>→</span>
            </a>
          </div>
        </div>
      </div>

      {/* ── DESKTOP VIEW ── */}
      <div className="hidden md:block w-full space-y-4 py-1 animate-fade-in">
        {/* Top Profile Banner - Compact */}
        <div className="rounded-lg p-4 md:py-4 md:px-5 flex items-center justify-between text-white relative overflow-hidden bg-gradient-to-r from-[#FF7A1A] via-[#FF6600] to-[#FF8C33]">
          <div className="absolute inset-0 opacity-[0.04] select-none pointer-events-none flex items-center justify-center">
            <span className="text-5xl font-black tracking-widest rotate-[6deg] whitespace-nowrap text-white">
              TINDAHAN NI ISKO
            </span>
          </div>

          {/* User Info */}
          <div className="flex items-center gap-3.5 relative z-10">
            <div className="w-12 h-12 rounded-md overflow-hidden shrink-0 border border-white/20">
              <Avatar name={fullName} size={48} className="w-full h-full" userId={currentUser?.cust_id} />
            </div>
            <div className="text-white">
              <h1 className="text-base font-extrabold tracking-tight leading-tight">{fullName}</h1>
              <p className="text-white/90 text-xs mt-0.5">{email}</p>
              <p className="text-white/80 text-[11px] mt-0.5">Student ID: {studentId}</p>
            </div>
          </div>

          {/* Actions - Rectangular */}
          <div className="flex items-center gap-2 relative z-10">
            <Link
              to="/account"
              className="flex items-center gap-1.5 bg-white text-slate-800 font-bold text-xs h-8 px-3 rounded-md hover:bg-slate-50 transition-colors"
            >
              <PencilIcon className="w-3.5 h-3.5 text-slate-500" />
              <span>Edit Profile</span>
            </Link>
            <Link
              to="/settings"
              className="w-8 h-8 rounded-md bg-white/20 backdrop-blur-xs text-white hover:bg-white hover:text-slate-800 flex items-center justify-center transition-colors"
              title="Settings"
            >
              <SettingsIcon className="w-4 h-4" />
            </Link>
          </div>
        </div>

          {/* 2-Column Grid (8 cols Main + 4 cols Sidebar) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Center Main Column (8 Cols) */}
            <div className="lg:col-span-8 space-y-6">
              {/* Header Title + Subtitle */}
              <div className="bg-white rounded-lg p-5 border border-slate-200 space-y-3">
                <div className="flex items-start gap-3">
                  <div>
                    <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">My Appointments</h2>
                    <p className="text-xs text-slate-500 font-normal leading-relaxed mt-0.5">
                      View your assigned pickup schedule for your orders. Please arrive at the campus store at your designated time to claim your items.
                    </p>
                  </div>
                </div>

                {/* Filter Tabs */}
                <div className="flex items-center gap-2 pt-1">
                  {filterTabs.map((tab) => {
                    const isActive = activeFilter === tab.id
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveFilter(tab.id)}
                        className={`h-8 px-3 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-brand-orange text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                        }`}
                      >
                        {tab.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <BookAppointmentCard custId={custId} onBooked={loadAppointments} />

              {/* Appointments List */}
              <div className="space-y-4">
                {loading ? (
                  <div className="bg-white rounded-lg p-8 text-center border border-slate-200 flex items-center justify-center gap-3">
                    <LoadingSpinner size={24} />
                    <p className="text-sm font-bold text-slate-500">Loading your appointments…</p>
                  </div>
                ) : filteredAppointments.length === 0 ? (
                  <div className="bg-white rounded-lg p-8 text-center border border-slate-200">
                    <p className="text-sm font-bold text-slate-500">No appointments in this category.</p>
                  </div>
                ) : (
                  filteredAppointments.map((appt) => {
                    const isUpcoming = appt.status === 'upcoming'
                    return (
                      <div
                        key={appt.id}
                        className="bg-white rounded-lg p-5 border border-slate-200 space-y-3 transition-colors"
                      >
                        {/* Card Top Pill & Identifier */}
                        <div>
                          <span
                            className={`inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-md uppercase tracking-wider mb-2 ${
                              isUpcoming
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-blue-50 text-blue-700 border border-blue-200'
                            }`}
                          >
                            {appt.status}
                          </span>
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-md bg-slate-100 text-slate-600 border border-slate-200 flex items-center justify-center">
                              <SmallCalendarIcon className="w-3.5 h-3.5" />
                            </div>
                            <span className="text-sm font-extrabold text-slate-900">
                              Appointment #{appt.id}
                            </span>
                            <span className="text-xs text-slate-500">
                              Order #{appt.orderId} · {appt.itemCount} {appt.itemCount === 1 ? 'item' : 'items'}
                            </span>
                          </div>
                        </div>

                        {/* 3-Column Content Row: Item Details, Schedule Details, Claiming Box */}
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center pt-2 border-t border-slate-200">
                          {/* Item Preview (Col 1-4) */}
                          <div className="md:col-span-4 space-y-2.5">
                            {appt.items.map((item, idx) => (
                              <div key={idx} className="flex items-center gap-2.5">
                                <div className="w-11 h-11 rounded-md bg-slate-50 border border-slate-200 flex items-center justify-center p-1 shrink-0">
                                  {item.image ? (
                                    <img
                                      src={getImageUrl(item.image)}
                                      alt={item.name}
                                      className="w-full h-full object-contain"
                                    />
                                  ) : (
                                    <ShirtIcon className="w-6 h-6 text-brand-orange opacity-40" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-slate-900 leading-snug truncate">
                                    {item.name}
                                  </p>
                                  <p className="text-[11px] text-slate-500 mt-0.5">
                                    {item.details}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Date, Time, Location (Col 5-8) */}
                          <div className="md:col-span-4 space-y-2 text-xs text-slate-700 pl-2">
                            {/* Date */}
                            <div className="flex items-start gap-2">
                              <SmallCalendarIcon className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                              <div>
                                <p className="font-bold text-slate-900 leading-tight">{appt.date}</p>
                                <p className="text-[11px] text-slate-500">{appt.dayOfWeek}</p>
                              </div>
                            </div>

                            {/* Time */}
                            <div className="flex items-center gap-2">
                              <ClockIcon className="w-4 h-4 text-slate-400 shrink-0" />
                              <p className="font-medium text-slate-800">{appt.time}</p>
                            </div>

                            {/* Location */}
                            <div className="flex items-start gap-2">
                              <PinIcon className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                              <div>
                                <p className="font-medium text-slate-800 leading-tight">{appt.location}</p>
                                <p className="text-[11px] text-slate-500">{appt.subLocation}</p>
                              </div>
                            </div>
                          </div>

                          {/* Right Action Callout Box (Col 9-12) */}
                          <div className="md:col-span-4">
                            {isUpcoming ? (
                              <div className="bg-orange-50/60 border border-orange-200 rounded-md p-3 flex flex-col items-center justify-center text-center space-y-2">
                                <div className="flex items-center gap-1.5 text-brand-orange-dark">
                                  <div className="w-5 h-5 rounded-md bg-orange-100 flex items-center justify-center shrink-0">
                                    <ScreenClaimIcon className="w-3 h-3 text-brand-orange" />
                                  </div>
                                  <span className="text-[11px] font-medium leading-tight">
                                    Show this screen upon claiming.
                                  </span>
                                </div>
                                <Link
                                  to={appt.orderId ? `/orders/${appt.orderId}` : '/orders'}
                                  className="inline-flex items-center justify-center gap-1 w-full h-8 px-3 rounded-md bg-white border border-brand-orange text-brand-orange text-xs font-bold hover:bg-orange-50 transition-colors"
                                >
                                  <span>View Order Details</span>
                                  <span>→</span>
                                </Link>
                              </div>
                            ) : (
                              <div className="bg-slate-50 border border-slate-200 rounded-md p-3 flex flex-col items-center justify-center text-center space-y-1">
                                <div className="flex items-center gap-1.5">
                                  <CheckmarkCircleIcon className="w-4 h-4 text-blue-600" />
                                  <span className="text-xs font-bold text-slate-900">Order claimed</span>
                                </div>
                                <p className="text-[11px] text-slate-500">
                                  Thank you for supporting Tindahan ni Isko!
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* Right Sidebar Column (4 Cols) */}
            <div className="lg:col-span-4 space-y-6">
              {/* 1. Quick Reminders Card */}
              <div className="bg-white rounded-lg p-5 border border-slate-200 space-y-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-md bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center relative">
                    <SmallCalendarIcon className="w-4 h-4" />
                    <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-md bg-emerald-500 border border-white flex items-center justify-center text-white text-[8px] font-bold">
                      ✓
                    </span>
                  </div>
                  <h3 className="text-base font-extrabold text-slate-900">Quick Reminders</h3>
                </div>

                <div className="space-y-3">
                  {/* Reminder 1 */}
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-md bg-slate-100 text-slate-600 border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                      <ClockIcon className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">Arrive on time</h4>
                      <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
                        Please be at the store during your scheduled time slot.
                      </p>
                    </div>
                  </div>

                  {/* Reminder 2 */}
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-md bg-slate-100 text-slate-600 border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">Bring a valid ID</h4>
                      <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
                        For verification purposes.
                      </p>
                    </div>
                  </div>

                  {/* Reminder 3 */}
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-md bg-slate-100 text-slate-600 border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">Show your order details</h4>
                      <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
                        You may show this page or your order number.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. Store Location Card */}
              <div className="bg-white rounded-lg p-5 border border-slate-200 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-md bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center shrink-0">
                    <PinIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900">Store Location</h3>
                    <p className="text-xs font-bold text-slate-800 mt-0.5">Tindahan ni Isko – Main Campus</p>
                    <p className="text-[11px] text-slate-500">Bicol University, Main Campus</p>
                  </div>
                </div>

                {/* Stylized Map View */}
                <div className="w-full h-32 rounded-md overflow-hidden relative border border-slate-200 bg-[#E8EFF5]">
                  {/* Subtle map road grid graphics */}
                  <svg className="w-full h-full opacity-60" viewBox="0 0 300 150" fill="none" preserveAspectRatio="none">
                    <rect width="300" height="150" fill="#EBF2F7" />
                    <path d="M-20 40 L320 110" stroke="#FFFFFF" strokeWidth="10" strokeLinecap="round" />
                    <path d="M60 -20 L180 170" stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round" />
                    <path d="M120 70 L320 20" stroke="#FFFFFF" strokeWidth="6" strokeLinecap="round" />
                    <path d="M0 120 L240 60" stroke="#FFFFFF" strokeWidth="7" strokeLinecap="round" />
                    <rect x="70" y="20" width="30" height="25" rx="3" fill="#DFE7EE" />
                    <rect x="190" y="70" width="40" height="30" rx="3" fill="#DFE7EE" />
                    <rect x="130" y="110" width="50" height="20" rx="3" fill="#DFE7EE" />
                  </svg>

                  {/* Pin in center */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="relative">
                      <div className="w-6 h-6 rounded-md bg-brand-orange text-white flex items-center justify-center animate-bounce">
                        <PinIcon className="w-3.5 h-3.5 text-white" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* View on Maps Button */}
                <a
                  href="https://maps.google.com/?q=Bicol+University+Main+Campus+Legazpi+City"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full h-8 rounded-md border border-slate-200 text-blue-600 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-blue-50 transition-colors"
                >
                  <span>View on Maps</span>
                  <span>→</span>
                </a>
              </div>
            </div>
          </div>
      </div>
    </AccountLayout>
  )
}

export default Appointments
