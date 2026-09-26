import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import LoadingSpinner from '../../components/ui/LoadingSpinner.jsx'
import QRScanner from '../../components/ui/QRScanner.jsx'
import { useAdmin } from '../../hooks/useAdmin.js'
import {
  fetchAppointments,
  fetchSlots,
  createAppointment,
  SLOT_RULES,
} from '../../services/appointments.js'
import { fetchAccounts } from '../../services/accounts.js'
import { getTrack, scanQr } from '../../services/tracking.js'
import {
  mapOrderRows,
  parseDate,
  normalizeSlots,
  normalizeAccounts,
} from '../../services/dashboard.js'

// ─── Pickup Workflow (live data) ───────────────────────────────────────────
// Unscheduled = orders in "TO CLAIM" without an open CLAIM appointment.
// Scheduled   = open CLAIM appointments grouped by date.
// Completed   = orders in "CLAIMED" that own a pickup track.
// No-show     = orders in "UNCLAIMED" (missed window).

const pad = (n) => String(n).padStart(2, '0')
const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const TODAY_LABEL = new Date().toLocaleDateString('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
})

/** '2026-05-22 09:12:00' -> '9:12 AM' */
function timeOfDay(value) {
  const date = parseDate(value)
  if (!date) return '—'
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

/** Backend slot times are 'YYYY-MM-DD HH:mm'. */
function clockLabel(hhmm) {
  const [h, m] = String(hhmm).split(' ')[1].split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 || 12
  return `${hour12}:${pad(m)} ${suffix}`
}

/** '08:00' + '08:30' -> '8:00 – 8:30 AM' (meridiem dropped when it matches). */
function slotRangeLabel(slot) {
  const start = clockLabel(slot.start)
  const end = clockLabel(slot.end)
  const startSuffix = start.slice(-2)
  const endSuffix = end.slice(-2)
  return startSuffix === endSuffix
    ? `${start.slice(0, -3)} – ${end}`
    : `${start} – ${end}`
}

function initialsOf(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return '#'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

function itemsInfo(order) {
  const items = order?.items || []
  const label = items.map((i) => i.name).join(' · ')
  return {
    count: `${items.length} ${items.length === 1 ? 'item' : 'items'}`,
    label: label || 'No items',
  }
}

const isStaffShortage = (slot) => Boolean(slot.reason && slot.reason.includes('employees'))

// ─── Slot Picker Modal (live /appoint/slots + /appoint/create) ────────────
function SchedulePickupModal({ order, slots, onClose, onConfirm, busy }) {
  const [selectedSlot, setSelectedSlot] = useState(null)
  const capacity = slots[0]?.capacity || SLOT_RULES.CLAIM.capacity

  return (
    <div className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-md flex items-center justify-center px-4 animate-fade-in">
      <div className="bg-white rounded-xl border border-slate-200 w-full max-w-md shadow-xl animate-scale-in overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Schedule Pickup Appointment</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {order ? `${order.customer} · ${order.id}` : 'Select a time slot'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Date selector */}
        <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-slate-400 shrink-0">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span className="text-xs font-semibold text-slate-700">{TODAY_LABEL}</span>
          <span className="ml-auto text-[10px] text-slate-400">Showing available slots</span>
        </div>

        {/* Slot grid */}
        <div className="px-5 py-4 max-h-72 overflow-y-auto space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
            Select a time slot — max {capacity} appointments per slot
          </p>
          {slots.map((slot) => {
            const isFull = slot.booked >= slot.capacity
            const disabled = isFull || !slot.available || busy
            const isSelected = selectedSlot?.start === slot.start
            const issue = isStaffShortage(slot)
            return (
              <button
                key={`${slot.start}-${slot.type}`}
                type="button"
                disabled={disabled}
                onClick={() => !disabled && setSelectedSlot(slot)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-xs font-medium transition-all cursor-pointer
                  ${disabled
                    ? 'bg-slate-50 border-slate-200 text-slate-300 cursor-not-allowed'
                    : isSelected
                      ? 'bg-orange-50 border-brand-orange text-brand-orange font-bold'
                      : issue
                        ? 'bg-amber-50/60 border-amber-200 text-slate-700 hover:border-amber-400'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                  }`}
              >
                <span>{slotRangeLabel(slot)}</span>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-semibold ${isFull ? 'text-rose-500' : issue ? 'text-amber-600' : 'text-slate-400'}`}>
                    {isFull ? 'Full' : `${slot.booked}/${slot.capacity}`}
                  </span>
                  {isSelected && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5 text-brand-orange">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
              </button>
            )
          })}
          {slots.length === 0 && (
            <p className="text-xs text-slate-400 py-4 text-center">No bookable slots for today.</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-3 bg-slate-50/40">
          <p className="text-[10px] text-slate-400">
            Availability based on store hours &amp; staff coverage
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 rounded-md border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!selectedSlot || busy}
              onClick={() => selectedSlot && onConfirm(selectedSlot)}
              className={`h-8 px-4 rounded-md text-xs font-bold transition-colors cursor-pointer
                ${selectedSlot && !busy ? 'bg-brand-orange hover:bg-orange-600 text-white' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
            >
              {busy ? 'Scheduling...' : 'Confirm Slot'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Slot status badge helper ──────────────────────────────────────────────
function SlotStatusBadge({ status }) {
  if (status === 'covered') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/60 text-[10px] font-semibold">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Covered
    </span>
  )
  if (status === 'issue') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200/60 text-[10px] font-semibold">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />Coverage Issue
    </span>
  )
  if (status === 'closed') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200 text-[10px] font-semibold">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />Closed
    </span>
  )
  return null
}

// ─── Avatar helper ─────────────────────────────────────────────────────────
function Avatar({ initials, size = 'sm' }) {
  const palette = [
    'bg-blue-100 text-blue-700', 'bg-pink-100 text-pink-700',
    'bg-indigo-100 text-indigo-700', 'bg-emerald-100 text-emerald-700',
    'bg-amber-100 text-amber-700', 'bg-purple-100 text-purple-700',
    'bg-sky-100 text-sky-700', 'bg-rose-100 text-rose-700',
    'bg-teal-100 text-teal-700', 'bg-violet-100 text-violet-700',
  ]
  let hash = 0
  for (const ch of String(initials || '#')) hash = (hash + ch.charCodeAt(0)) % palette.length
  const c = palette[hash]
  const sz = size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-8 h-8 text-xs'
  return (
    <div className={`${sz} ${c} rounded-full flex items-center justify-center font-bold shrink-0`}>
      {initials}
    </div>
  )
}

// ─── Right Sidebar Panel (shared by Scheduled & Overview) ─────────────────
function PickupScheduleSidebar({ slots, onSchedule, onViewUnscheduled }) {
  return (
    <div className="w-80 shrink-0 space-y-3">
      {/* Schedule Panel */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-slate-500 shrink-0">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <div>
            <p className="text-xs font-bold text-slate-900">Pickup Schedule</p>
            <p className="text-[10px] text-slate-400">Today • {TODAY_LABEL}</p>
          </div>
        </div>
        <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
          {slots.map((slot) => {
            const isFull = slot.booked >= slot.capacity
            const status = !slot.available && isStaffShortage(slot) ? 'issue' : 'covered'
            return (
              <div key={slot.start} className="flex items-center justify-between gap-2 px-4 py-2">
                <span className="text-[11px] font-medium text-slate-700 w-28 shrink-0 whitespace-nowrap">{slotRangeLabel(slot)}</span>
                <span className={`text-[11px] font-semibold shrink-0 whitespace-nowrap ${isFull ? 'text-rose-500' : 'text-slate-500'}`}>
                  {slot.booked}/{slot.capacity}
                </span>
                <span className="shrink-0 whitespace-nowrap">
                  <SlotStatusBadge status={status} />
                </span>
              </div>
            )
          })}
          {slots.length === 0 && (
            <div className="flex items-center gap-2 px-4 py-3">
              <LoadingSpinner size={16} />
              <p className="text-[11px] text-slate-400">Loading today&apos;s slots…</p>
            </div>
          )}
        </div>
        <div className="px-4 py-2.5 border-t border-slate-100">
          <Link
            to="/admin/schedule"
            className="text-xs font-semibold text-brand-orange hover:underline cursor-pointer"
          >
            View Full Schedule
          </Link>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-slate-500 shrink-0">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="text-xs font-bold text-slate-900">Quick Actions</p>
        </div>
        <div className="p-3 space-y-2">
          <button
            type="button"
            onClick={onSchedule}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md bg-brand-orange text-white text-xs font-bold hover:bg-orange-600 transition-colors cursor-pointer"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 shrink-0">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <line x1="12" y1="14" x2="12" y2="18" /><line x1="10" y1="16" x2="14" y2="16" />
            </svg>
            Schedule Pickup
          </button>
          <button
            type="button"
            onClick={onViewUnscheduled}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 shrink-0 text-slate-400">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <line x1="9" y1="14" x2="15" y2="14" />
            </svg>
            View Unscheduled
          </button>
          <Link
            to="/admin/schedule"
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 shrink-0 text-slate-400">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
            Manage Time Slots
          </Link>
        </div>
      </div>
    </div>
  )
}

// ─── Tab Components ────────────────────────────────────────────────────────

function OverviewTab({ kpis, scheduleRows, slots, onSchedule, onViewUnscheduled }) {
  return (
    <div className="flex gap-4 min-h-0">
      {/* Main content */}
      <div className="flex-1 space-y-4 min-w-0">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
          {[
            { label: 'Ready for Pickup', value: kpis.ready, sub: 'orders',          color: 'emerald', icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>) },
            { label: 'Unscheduled',      value: kpis.unscheduled, sub: 'orders',      color: 'amber',   icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="9" y1="14" x2="15" y2="14"/></svg>) },
            { label: "Today's Scheduled",value: kpis.scheduledToday, sub: 'appointments', color: 'blue', icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="9 16 11 18 15 14"/></svg>) },
            { label: "Today's Completed",value: kpis.completedToday, sub: 'pickups',   color: 'indigo',  icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="20 6 9 17 4 12"/></svg>) },
            { label: 'No-show',          value: kpis.noshow, sub: 'appointment',       color: 'rose',    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>) },
          ].map(({ label, value, sub, color, icon }) => (
            <div key={label} className="bg-white rounded-lg p-3 border border-slate-200 flex items-center gap-3">
              <div className={`w-8 h-8 rounded-md bg-${color}-50 border border-${color}-100 flex items-center justify-center text-${color}-600 shrink-0`}>
                {icon}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold tracking-wider uppercase text-slate-400 leading-tight truncate">{label}</p>
                <h3 className="text-xl font-bold text-slate-900">{value}</h3>
                <p className="text-[10px] text-slate-400">{sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Today's Pickup Schedule Table */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-slate-500">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <p className="text-sm font-bold text-slate-900">Today's Pickup Schedule</p>
            </div>
            <span className="text-xs text-slate-500 font-medium">{TODAY_LABEL}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/60 border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-2.5 w-40">Time</th>
                  <th className="px-4 py-2.5 w-32">Appointments</th>
                  <th className="px-4 py-2.5 w-28">Staff Available</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {scheduleRows.map((row) => (
                  <tr key={row.time} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-slate-700 whitespace-nowrap">{row.time}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className={`font-bold ${row.appts >= row.capacity ? 'text-rose-600' : 'text-slate-900'}`}>{row.appts}</span>
                      <span className="text-slate-400 font-normal"> / {row.capacity}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      {row.staffOk === true  && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 text-emerald-500"><polyline points="20 6 9 17 4 12"/></svg>}
                      {row.staffOk === false && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 text-amber-500"><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/><circle cx="12" cy="12" r="10"/></svg>}
                      {row.staffOk === null  && <span className="text-[10px] text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-2.5"><SlotStatusBadge status={row.status} /></td>
                  </tr>
                ))}
                {scheduleRows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-400">No slots available today.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Right sidebar */}
      <PickupScheduleSidebar slots={slots} onSchedule={onSchedule} onViewUnscheduled={onViewUnscheduled} />
    </div>
  )
}

function UnscheduledTab({ orders, onSchedule, onHandover, onOpenOrder, busyId }) {
  return (
    <div className="space-y-3">
      {/* Info banner */}
      <div className="flex items-start justify-between gap-3 bg-blue-50 border border-blue-200/60 rounded-lg px-4 py-3">
        <div className="flex items-start gap-2.5">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-blue-600 shrink-0 mt-0.5">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="8" /><line x1="12" y1="12" x2="12" y2="16" />
          </svg>
          <p className="text-xs font-medium text-blue-800">
            These orders are ready for pickup but don't have a pickup time yet.
            Schedule a pickup time for these customers to confirm their orders.
          </p>
        </div>
        <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 text-[11px] font-bold border border-blue-200/60">
          {orders.length} orders
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/60 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Order #</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3">Ready Since</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((order) => {
                const items = itemsInfo(order)
                return (
                  <tr key={order.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar initials={initialsOf(order.customer)} />
                        <div>
                          <p className="font-bold text-slate-900 text-xs">{order.customer}</p>
                          <p className="text-[10px] text-slate-400">{order.custPhone || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-extrabold text-slate-800">{order.id}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-700">{items.count}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{items.label}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-slate-600 font-medium">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 text-slate-400">
                          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                        </svg>
                        {timeOfDay(order.createdAt)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => onSchedule(order)}
                          className="h-8 px-3 bg-brand-orange hover:bg-orange-600 text-white text-xs font-bold rounded-md transition-colors cursor-pointer"
                        >
                          Schedule Pickup
                        </button>
                        <button
                          type="button"
                          disabled={busyId === order.id}
                          onClick={() => onHandover(order)}
                          className="h-8 px-3 border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 rounded-md cursor-pointer disabled:opacity-60 disabled:cursor-wait"
                        >
                          {busyId === order.id ? 'Handing over…' : 'Hand over'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenOrder(order)}
                          className="h-8 px-3 border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 rounded-md cursor-pointer"
                        >
                          View Order
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    No unscheduled pickups — every ready order has a slot.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function ScheduledTab({ groups, slots, onSchedule, onViewUnscheduled, onHandover, onOpenOrder, busyId }) {
  return (
    <div className="flex gap-4 min-h-0">
      {/* Main area */}
      <div className="flex-1 space-y-3 min-w-0">
        {/* Date header */}
        <div className="bg-white rounded-lg border border-slate-200 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-slate-500 shrink-0">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <div>
              <p className="text-sm font-bold text-slate-900">Scheduled Pickups</p>
              <p className="text-[10px] text-slate-400">Orders with confirmed pickup appointments.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="h-8 px-3 rounded-md border border-slate-200 bg-white text-xs font-semibold text-slate-700 flex items-center gap-1.5 hover:bg-slate-50 cursor-pointer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-slate-400">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              {TODAY_LABEL}
            </button>
            <button type="button" className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-400 hover:text-slate-700 hover:bg-slate-50 cursor-pointer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>
        </div>

        {/* Date-grouped appointments */}
        <div className="space-y-3">
          {groups.map((group) => (
            <div key={group.key} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              {/* Group header */}
              <div className="px-4 py-2.5 bg-slate-50/60 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-slate-400">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <span className="text-xs font-bold text-slate-800">{group.label}</span>
                </div>
                <span className="text-[10px] font-semibold text-slate-400">
                  {group.count} {group.count === 1 ? 'appointment' : 'appointments'}
                </span>
              </div>

              {/* Appointment cards */}
              <div className="divide-y divide-slate-100">
                {group.appointments.map((appt) => (
                  <div key={appt.apptId} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/40 transition-colors">
                    <Avatar initials={initialsOf(appt.customer)} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs font-bold text-slate-900">{appt.customer}</p>
                        <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{appt.time}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-[10px] text-slate-400 font-medium">{appt.apptId}</span>
                        <span className="w-1 h-1 rounded-full bg-slate-300" />
                        <span className="text-[10px] font-semibold text-slate-600">{appt.orderId}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-semibold text-slate-700">{appt.items}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5 max-w-[180px] truncate">{appt.itemLabel}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {appt.order && (
                        <button
                          type="button"
                          disabled={busyId === appt.order.id}
                          onClick={() => onHandover(appt.order)}
                          className="h-7 px-2.5 border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 rounded-md cursor-pointer disabled:opacity-60"
                        >
                          Hand over
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onOpenOrder(appt.order)}
                        className="h-7 px-2.5 border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 rounded-md cursor-pointer"
                      >
                        View Order
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {groups.length === 0 && (
            <div className="bg-white rounded-lg border border-slate-200 px-4 py-8 text-center text-slate-400 text-xs">
              No scheduled pickups yet.
            </div>
          )}
        </div>
      </div>

      {/* Right sidebar */}
      <PickupScheduleSidebar onSchedule={() => onSchedule(null)} onViewUnscheduled={onViewUnscheduled} slots={slots} />
    </div>
  )
}

function CompletedTab({ orders, total }) {
  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="bg-white rounded-lg border border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5 text-emerald-600">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">Completed Pickups</p>
            <p className="text-[10px] text-slate-400">Successfully claimed and handed over to customers.</p>
          </div>
        </div>
        <button type="button" className="h-8 px-3 rounded-md border border-slate-200 bg-white text-xs font-semibold text-slate-700 flex items-center gap-1.5 hover:bg-slate-50 cursor-pointer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-slate-400">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          {TODAY_LABEL}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 text-slate-400"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/60 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <th className="px-4 py-3">Date &amp; Time</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Order #</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3">Claimed By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((order) => {
                const items = itemsInfo(order)
                const when = parseDate(order.completedAt) || parseDate(order.createdAt)
                return (
                  <tr key={order.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-slate-600 font-medium whitespace-nowrap">
                      {when
                        ? `${when.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · ${when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar initials={initialsOf(order.customer)} />
                        <div>
                          <p className="font-bold text-slate-900">{order.customer}</p>
                          <p className="text-[10px] text-slate-400">{order.custPhone || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-extrabold text-slate-800">{order.id}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-700">{items.count}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{items.label}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-100 text-[11px] font-semibold">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        In-store claim
                      </span>
                    </td>
                  </tr>
                )
              })}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    No completed pickups yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 border-t border-slate-100 text-[11px] text-slate-400 font-medium">
          Showing {orders.length} of {total} completed pickups
        </div>
      </div>
    </div>
  )
}

function NoshowTab({ orders, onReschedule, onOpenOrder, busyId }) {
  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="bg-white rounded-lg border border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-rose-100 border border-rose-200 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5 text-rose-600">
              <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">No-show Pickups</p>
            <p className="text-[10px] text-slate-400">These appointments were not claimed within the pickup window.</p>
          </div>
        </div>
        <button type="button" className="h-8 px-3 rounded-md border border-slate-200 bg-white text-xs font-semibold text-slate-700 flex items-center gap-1.5 hover:bg-slate-50 cursor-pointer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-slate-400">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          {TODAY_LABEL}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 text-slate-400"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/60 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <th className="px-4 py-3">Date &amp; Time</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Order #</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((order) => {
                const items = itemsInfo(order)
                const when = parseDate(order.createdAt)
                return (
                  <tr key={order.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-slate-600 font-medium whitespace-nowrap">
                      {when
                        ? `${when.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · ${when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar initials={initialsOf(order.customer)} />
                        <div>
                          <p className="font-bold text-slate-900">{order.customer}</p>
                          <p className="text-[10px] text-slate-400">{order.custPhone || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-extrabold text-slate-800">{order.id}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-700">{items.count}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{items.label}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          disabled={busyId === order.id}
                          onClick={() => onReschedule(order)}
                          className="h-8 px-3 bg-brand-orange hover:bg-orange-600 disabled:opacity-70 text-white text-xs font-bold rounded-md transition-colors cursor-pointer"
                        >
                          {busyId === order.id ? 'Rescheduling…' : 'Reschedule'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenOrder(order)}
                          className="h-8 px-3 border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 rounded-md cursor-pointer"
                        >
                          Contact
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    No no-show pickups.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────
const TABS = ['Overview', 'Unscheduled', 'Scheduled', 'Completed', 'No-show']
const REFRESH_MS = 30000 // REQ-SD-02: keep the queues fresh

export default function AdminPickup() {
  const { orders: rawOrders = [], refreshOrders, updateOrderStatus } = useAdmin()
  const [activeTab, setActiveTab] = useState('Overview')
  const [scheduleModal, setScheduleModal] = useState({ open: false, order: null })
  const [scheduling, setScheduling] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [toast, setToast] = useState('')

  // Live auxiliary data: appointments, today's slots, customer directory.
  const [appointments, setAppointments] = useState([])
  const [slots, setSlots] = useState([])
  const [customerDir, setCustomerDir] = useState({})

  // QR scanning (REQ-APC-02) - the server message is echoed inline.
  const [scanCode, setScanCode] = useState('')
  const [scanMsg, setScanMsg] = useState(null) // { type: 'ok' | 'error', text }
  const scanInputRef = useRef(null)
  const [scanModalOpen, setScanModalOpen] = useState(false)

  // ordIds known to own a pickup track (null until the first probe resolves).
  const [pickupTrackIds, setPickupTrackIds] = useState(null)

  const orders = useMemo(() => mapOrderRows(rawOrders), [rawOrders])
  const claimSlots = useMemo(() => slots.filter((s) => s.type === 'CLAIM'), [slots])

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  // Auxiliary data loader. setState only runs inside the promise callbacks,
  // never synchronously in the effect body (react-hooks/set-state-in-effect).
  const loadAux = useCallback(() => {
    Promise.all([
      fetchAppointments({ scope: 'master' }).catch(() => []),
      fetchSlots(todayISO()).catch(() => null),
      fetchAccounts().catch(() => ({ customers: [], employees: [] })),
    ])
      .then(([apptPayload, slotPayload, accountsPayload]) => {
        setAppointments(Array.isArray(apptPayload) ? apptPayload : [])
        setSlots(normalizeSlots(slotPayload))
        const normalized = normalizeAccounts(accountsPayload)
        const dir = {}
        for (const cust of normalized.customers || []) {
          dir[cust.cust_id] = {
            name: cust.cust_nickname || cust.cust_email || `Customer #${cust.cust_id}`,
            phone: cust.cust_phone || '',
          }
        }
        setCustomerDir(dir)
      })
      .catch(() => {
        // Transient API failure: keep the last schedule on screen.
      })
  }, [])

  // Mount + 30s: refresh order queues and the schedule data (REQ-SD-02).
  useEffect(() => {
    refreshOrders()
    loadAux()
    const timer = setInterval(() => {
      refreshOrders()
      loadAux()
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [refreshOrders, loadAux])

  // Which CLAIMED orders are pickup orders (delivery claims own no pickup
  // track -> /tracking/create answers 404 and the row is excluded).
  const claimedKey = useMemo(
    () => orders.filter((o) => o.rawStatus === 'CLAIMED').map((o) => o.ordId).join(','),
    [orders]
  )
  useEffect(() => {
    const ids = claimedKey ? claimedKey.split(',').map(Number) : []
    // No CLAIMED rows to probe yet: keep the last known set (it only filters
    // CLAIMED rows, of which there are none right now). Resetting it here would
    // be a synchronous setState inside the effect.
    if (ids.length === 0) return undefined
    let cancelled = false
    Promise.all(
      ids.map((id) =>
        getTrack(id, 'pickup')
          .then(() => [id, true])
          .catch((e) => [id, e?.status !== 404])
      )
    ).then((pairs) => {
      if (cancelled) return
      setPickupTrackIds(new Set(pairs.filter(([, ok]) => ok).map(([id]) => id)))
    })
    return () => { cancelled = true }
  }, [claimedKey])

  // ── Derived queues ──
  const openClaimAppts = useMemo(
    () =>
      appointments.filter(
        (a) => !a.appoint_closed && String(a.appoint_type || '').toUpperCase() === 'CLAIM'
      ),
    [appointments]
  )

  const scheduledCustIds = useMemo(
    () => new Set(openClaimAppts.map((a) => a.cust_id)),
    [openClaimAppts]
  )

  const unscheduled = useMemo(
    () =>
      orders.filter(
        (o) => o.rawStatus === 'TO CLAIM' && !scheduledCustIds.has(o.custId)
      ),
    [orders, scheduledCustIds]
  )

  const scheduledGroups = useMemo(() => {
    const byKey = new Map()
    for (const appt of openClaimAppts) {
      const date = parseDate(appt.appoint_date)
      if (!date) continue
      const key = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
      const order =
        orders.find((o) => o.custId === appt.cust_id && o.rawStatus === 'TO CLAIM') || null
      const directory = customerDir[appt.cust_id]
      const customer = order?.customer || directory?.name || `Customer #${appt.cust_id}`
      const items = order ? itemsInfo(order) : { count: '—', label: 'No open order' }
      const group = byKey.get(key) || { key, label: date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), appointments: [] }
      group.appointments.push({
        apptId: appt.appoint_qr || `#AP-${appt.appoint_id}`,
        time: timeOfDay(appt.appoint_date),
        customer,
        orderId: order ? order.id : '—',
        order,
        items: items.count,
        itemLabel: items.label,
      })
      byKey.set(key, group)
    }
    return Array.from(byKey.values())
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((g) => ({ ...g, count: g.appointments.length }))
  }, [openClaimAppts, orders, customerDir])

  const claimedPickupOrders = useMemo(
    () =>
      orders.filter(
        (o) => o.rawStatus === 'CLAIMED' && (!pickupTrackIds || pickupTrackIds.has(o.ordId))
      ),
    [orders, pickupTrackIds]
  )

  const noshowOrders = useMemo(
    () => orders.filter((o) => o.rawStatus === 'UNCLAIMED'),
    [orders]
  )

  const kpis = useMemo(() => {
    const todayKey = todayISO()
    const isToday = (value) => {
      const d = parseDate(value)
      if (!d) return false
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` === todayKey
    }
    return {
      ready: orders.filter((o) => o.rawStatus === 'TO CLAIM').length,
      unscheduled: unscheduled.length,
      scheduledToday: openClaimAppts.filter((a) => isToday(a.appoint_date)).length,
      completedToday: claimedPickupOrders.filter(
        (o) => isToday(o.completedAt) || isToday(o.createdAt)
      ).length,
      noshow: noshowOrders.length,
    }
  }, [orders, unscheduled, openClaimAppts, claimedPickupOrders, noshowOrders])

  const scheduleRows = useMemo(
    () =>
      claimSlots.map((slot) => ({
        time: slotRangeLabel(slot),
        appts: slot.booked,
        capacity: slot.capacity,
        staffOk: isStaffShortage(slot) ? false : true,
        status: !slot.available && isStaffShortage(slot) ? 'issue' : 'covered',
      })),
    [claimSlots]
  )

  // ── Actions ──
  const openScheduleModal = (order = null) => setScheduleModal({ open: true, order })
  const closeScheduleModal = () => setScheduleModal({ open: false, order: null })
  const handleViewUnscheduled = () => setActiveTab('Unscheduled')

  const handleOpenOrder = (order) => {
    showToast(order ? `Opening order ${order.id}` : 'Select an order from the Unscheduled list')
  }

  /** Book the chosen slot (POST /appoint/create, validated server-side). */
  const handleConfirmSlot = async (slot) => {
    const order = scheduleModal.order
    if (!order) {
      closeScheduleModal()
      showToast('Pick an order from the Unscheduled list to schedule its pickup.')
      return
    }
    const custId = order.custId ?? order.raw?.cust_id
    if (!custId) {
      showToast('This order has no customer account to schedule for.')
      return
    }
    setScheduling(true)
    try {
      await createAppointment({
        cust_id: custId,
        appoint_date: slot.start,
        appoint_type: 'CLAIM',
        appoint_desc: order.id,
      })
      showToast(`Pickup scheduled for ${order.customer} (${order.id}) — ${slotRangeLabel(slot)}`)
      closeScheduleModal()
      await loadAux()
    } catch (e) {
      showToast(e?.message || 'Could not schedule that slot.')
    } finally {
      setScheduling(false)
    }
  }

  /**
   * Handover is QR-only (REQ-APC-02): the backend refuses /tracking/close
   * until a scan has verified the customer's code, so this routes the staff
   * member to the scanner instead of closing the track directly.
   */
  const handleHandover = (order) => {
    if (!order) return
    setScanCode('')
    setScanMsg({
      type: 'ok',
      text: `Scan the QR code shown by ${order.customer} for ${order.id} to hand it over.`,
    })
    scanInputRef.current?.focus()
  }

  /** No-show back into the queue: UNCLAIMED -> TO CLAIM. */
  const handleReschedule = async (order) => {
    setBusyId(order.id)
    try {
      const result = await updateOrderStatus(order.ordId, 'TO CLAIM')
      if (result && result.success === false) {
        showToast(result.error || 'Could not reschedule the order.')
      } else {
        showToast(`${order.id} moved back to the pickup queue.`)
        refreshOrders()
      }
    } finally {
      setBusyId(null)
    }
  }

  /** REQ-APC-02: staff scan an order/appointment/parcel QR (POST /tracking/scan). */
  const handleScan = async () => {
    const code = scanCode.trim()
    if (!code) {
      setScanMsg({ type: 'error', text: 'Enter a QR code to scan.' })
      return
    }
    try {
      const res = await scanQr(code, 'employee')
      setScanMsg({ type: 'ok', text: res?.message || 'Scan verified.' })
      setScanCode('')
      refreshOrders()
      loadAux()
    } catch (e) {
      setScanMsg({ type: 'error', text: e?.message || 'Scan failed.' })
    }
  }

  const TAB_ICONS = {
    Overview:    (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>),
    Unscheduled: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="9" y1="14" x2="15" y2="14"/></svg>),
    Scheduled:   (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="9 16 11 18 15 14"/></svg>),
    Completed:   (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><polyline points="20 6 9 17 4 12"/></svg>),
    'No-show':   (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>),
  }

  const TAB_COUNTS = {
    Overview: null,
    Unscheduled: unscheduled.length,
    Scheduled: openClaimAppts.length,
    Completed: claimedPickupOrders.length,
    'No-show': noshowOrders.length,
  }

  return (
    <AdminLayout>
      <div className="h-full flex flex-col space-y-0 animate-fade-in">
        {/* Toast */}
        {toast && (
          <div className="fixed top-16 right-6 z-50 bg-white text-slate-800 px-3.5 py-2 rounded-md border border-slate-200 flex items-center gap-2 text-xs font-semibold animate-slide-up shadow-md">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span>{toast}</span>
          </div>
        )}

        {/* Schedule Pickup Modal */}
        {scheduleModal.open && (
          <SchedulePickupModal
            order={scheduleModal.order}
            slots={claimSlots}
            busy={scheduling}
            onClose={closeScheduleModal}
            onConfirm={handleConfirmSlot}
          />
        )}

        {/* ── Page Header ── */}
        <div className="pb-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              {/* Breadcrumb — reflects the current section */}
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium mb-2">
                <Link to="/admin/dashboard" className="hover:text-slate-600 transition-colors">Fulfillment</Link>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                <span className="text-slate-600 font-semibold">Pickup</span>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-orange flex items-center justify-center text-white shrink-0">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900 tracking-tight leading-tight">Pickup</h1>
                  <p className="text-xs text-slate-500 font-normal">
                    Manage in-store pickups, schedule appointments, and track handovers.
                  </p>
                </div>
              </div>
            </div>

            {/* QR verification (REQ-APC-02) */}
            <div className="w-full sm:w-80">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <line x1="14" y1="14" x2="14" y2="14.01" /><line x1="21" y1="14" x2="21" y2="21" /><line x1="14" y1="21" x2="17" y2="21" />
                  </svg>
                  <input
                    type="text"
                    ref={scanInputRef}
                    value={scanCode}
                    onChange={(e) => { setScanCode(e.target.value); setScanMsg(null) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleScan() }}
                    placeholder="Scan or enter QR code"
                    className="w-full h-9 pl-8 pr-2.5 rounded-md bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:bg-white focus:ring-1 focus:ring-brand-orange"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleScan}
                  className="h-9 px-3.5 rounded-md bg-brand-orange hover:bg-orange-600 text-white text-xs font-bold transition-colors cursor-pointer shrink-0"
                >
                  Scan QR
                </button>
                <button
                  type="button"
                  onClick={() => setScanModalOpen(true)}
                  className="h-9 px-3 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer shrink-0"
                  title="Open camera scanner"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <line x1="14" y1="14" x2="14" y2="14.01" /><line x1="21" y1="14" x2="21" y2="21" /><line x1="14" y1="21" x2="17" y2="21" />
                  </svg>
                </button>
              </div>
              {scanMsg && (
                <p className={`mt-1 text-[11px] font-semibold ${scanMsg.type === 'ok' ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {scanMsg.text}
                </p>
              )}
            </div>

            {/* QR Camera Scanner Modal */}
            {scanModalOpen && (
              <div className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-md flex items-center justify-center px-4 animate-fade-in">
                <div className="bg-white rounded-xl border border-slate-200 w-full max-w-md shadow-xl animate-scale-in overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">QR Code Scanner</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Point camera at customer's QR code</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setScanModalOpen(false)}
                      className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                  <div className="p-4">
                    <QRScanner
                      onScan={(code) => {
                        setScanCode(code)
                        handleScan()
                        setScanModalOpen(false)
                      }}
                      onError={(error) => {
                        setScanMsg({ type: 'error', text: error })
                      }}
                      className="w-full aspect-video"
                    />
                  </div>
                  <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50/40">
                    <button
                      type="button"
                      onClick={() => setScanModalOpen(false)}
                      className="h-8 px-3 rounded-md border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex items-center gap-0 border-b border-slate-200 mb-4">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-1.5 px-4 pb-2.5 text-xs font-semibold transition-colors relative cursor-pointer whitespace-nowrap
                ${activeTab === tab
                  ? 'text-brand-orange border-b-2 border-brand-orange font-bold'
                  : 'text-slate-500 hover:text-slate-800'
                }`}
            >
              {TAB_ICONS[tab]}
              <span>{tab}</span>
              {TAB_COUNTS[tab] !== null && (
                <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold
                  ${activeTab === tab
                    ? 'bg-orange-100 text-brand-orange'
                    : 'bg-slate-100 text-slate-500'
                  }`}>
                  {TAB_COUNTS[tab]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Tab Content ── */}
        <div className="flex-1 overflow-y-auto pb-6 scrollbar-none">
          {activeTab === 'Overview' && (
            <OverviewTab
              kpis={kpis}
              scheduleRows={scheduleRows}
              slots={claimSlots}
              onSchedule={() => openScheduleModal(null)}
              onViewUnscheduled={handleViewUnscheduled}
            />
          )}
          {activeTab === 'Unscheduled' && (
            <UnscheduledTab
              orders={unscheduled}
              onSchedule={openScheduleModal}
              onHandover={handleHandover}
              onOpenOrder={handleOpenOrder}
              busyId={busyId}
            />
          )}
          {activeTab === 'Scheduled' && (
            <ScheduledTab
              groups={scheduledGroups}
              slots={claimSlots}
              onSchedule={openScheduleModal}
              onViewUnscheduled={handleViewUnscheduled}
              onHandover={handleHandover}
              onOpenOrder={handleOpenOrder}
              busyId={busyId}
            />
          )}
          {activeTab === 'Completed' && (
            <CompletedTab orders={claimedPickupOrders} total={claimedPickupOrders.length} />
          )}
          {activeTab === 'No-show' && (
            <NoshowTab
              orders={noshowOrders}
              onReschedule={handleReschedule}
              onOpenOrder={handleOpenOrder}
              busyId={busyId}
            />
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
