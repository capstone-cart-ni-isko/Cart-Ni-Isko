import React, { useState, useMemo } from 'react'
import AdminLayout from '../../components/admin/AdminLayout.jsx'

// ─── Pickup Workflow ───────────────────────────────────────────────────────
// Order Preparing → Ready for Pickup → Unscheduled → Scheduled → Claimed → Completed
//                                                            ↘ No-show (missed window)

// ─── Sample Data ──────────────────────────────────────────────────────────

const SCHEDULE_SLOTS = [
  { time: '8:00 – 8:30 AM',    count: 1, max: 5, status: 'covered' },
  { time: '8:30 – 9:00 AM',    count: 3, max: 5, status: 'covered' },
  { time: '9:00 – 9:30 AM',    count: 1, max: 5, status: 'covered' },
  { time: '9:30 – 10:00 AM',   count: 5, max: 5, status: 'covered' },
  { time: '10:00 – 10:30 AM',  count: 2, max: 5, status: 'covered' },
  { time: '10:30 – 11:00 AM',  count: 4, max: 5, status: 'issue'   },
  { time: '11:00 – 11:30 AM',  count: 0, max: 5, status: 'closed'  },
  { time: '11:30 AM – 12:00 PM', count: 1, max: 5, status: 'covered' },
]

const OVERVIEW_SCHEDULE_ROWS = [
  { time: '8:00 – 8:30 AM',   appts: 1, capacity: 5, staffOk: true,  status: 'Covered' },
  { time: '8:30 – 9:00 AM',   appts: 3, capacity: 5, staffOk: true,  status: 'Covered' },
  { time: '9:00 – 9:30 AM',   appts: 1, capacity: 5, staffOk: true,  status: 'Covered' },
  { time: '9:30 – 10:00 AM',  appts: 5, capacity: 5, staffOk: true,  status: 'Covered' },
  { time: '10:00 – 10:30 AM', appts: 2, capacity: 5, staffOk: true,  status: 'Covered' },
  { time: '10:30 – 11:00 AM', appts: 4, capacity: 5, staffOk: false, status: 'Coverage Issue' },
  { time: '11:00 – 11:30 AM', appts: 0, capacity: 5, staffOk: null,  status: 'Closed' },
  { time: '11:30 AM – 12:00 PM', appts: 1, capacity: 5, staffOk: true, status: 'Covered' },
]

const UNSCHEDULED_ORDERS = [
  {
    id: '#ORD-8921', customer: 'Juan Dela Cruz',  phone: '0917-123-4567',
    items: '1 item',  itemLabel: 'BU Labels 2025 Hoodie',   readySince: '9:12 AM',
    avatar: 'JD',
  },
  {
    id: '#ORD-8915', customer: 'Marie Santos',    phone: '0918-234-5678',
    items: '2 items', itemLabel: 'BU Varsity Jacket + BU Lanyard Set', readySince: '10:06 AM',
    avatar: 'MS',
  },
  {
    id: '#ORD-8897', customer: 'Pedro Reyes',     phone: '0915-341-3799',
    items: '1 item',  itemLabel: 'BU Polo Shirt',             readySince: '10:30 AM',
    avatar: 'PR',
  },
  {
    id: '#ORD-8872', customer: 'Ana Cruz',        phone: '0917-97-4542',
    items: '2 items', itemLabel: 'Tatak BUENO Shirt + Tote Bag', readySince: '11:05 AM',
    avatar: 'AC',
  },
  {
    id: '#ORD-8865', customer: 'Jose Martinez',   phone: '0922-459-7990',
    items: '1 item',  itemLabel: 'BU Tote Bag',               readySince: '11:22 AM',
    avatar: 'JM',
  },
]

const SCHEDULED_GROUPS = [
  {
    slot: '9:00 – 9:30 AM',
    count: 1,
    appointments: [
      { apptId: '#AP-2026-0142', orderId: '#ORD-8921', customer: 'Juan Dela Cruz',  avatar: 'JD', items: '1 item', itemLabel: 'BU Labels 2025 Hoodie' },
    ],
  },
  {
    slot: '10:30 – 11:00 AM',
    count: 2,
    appointments: [
      { apptId: '#AP-2026-0137', orderId: '#ORD-8915', customer: 'Maria Santos',    avatar: 'MS', items: '2 items', itemLabel: 'BU Varsity Jacket (1) · BU Lanyard Set (1)' },
      { apptId: '#AP-2026-0138', orderId: '#ORD-8897', customer: 'Pedro Reyes',     avatar: 'PR', items: '1 item',  itemLabel: 'BU Polo Shirt' },
    ],
  },
  {
    slot: '11:00 – 11:30 AM',
    count: 1,
    appointments: [
      { apptId: '#AP-2026-0139', orderId: '#ORD-8872', customer: 'Ana Cruz',        avatar: 'AC', items: '2 items', itemLabel: 'Tatak BUENO Shirt · 2 Items' },
    ],
  },
  {
    slot: '1:00 – 1:30 PM',
    count: 2,
    appointments: [
      { apptId: '#AP-2026-0140', orderId: '#ORD-8865', customer: 'Jose Martinez',   avatar: 'JM', items: '1 item',  itemLabel: 'BU Tote Bag' },
      { apptId: '#AP-2026-0141', orderId: '#ORD-8853', customer: 'Rafael Cruz',     avatar: 'RC', items: '1 item',  itemLabel: 'BU Hoodie' },
    ],
  },
]

const COMPLETED_PICKUPS = [
  { datetime: 'May 22, 2026 · 9:10 AM',  customer: 'Juan Dela Cruz', phone: '0917-123-4567', orderId: '#ORD-8921', items: '1 item',  itemLabel: 'BU Labels 2025 Hoodie',               claimedBy: 'Alex R.',  avatar: 'JD' },
  { datetime: 'May 22, 2026 · 10:42 AM', customer: 'Maria Santos',   phone: '0918-234-5678', orderId: '#ORD-8915', items: '2 items', itemLabel: 'BU Varsity Jacket · BU Lanyard Set',  claimedBy: 'Bea S.',   avatar: 'MS' },
  { datetime: 'May 22, 2026 · 11:15 AM', customer: 'Pedro Reyes',    phone: '0915-341-3799', orderId: '#ORD-8897', items: '1 item',  itemLabel: 'BU Polo Shirt',                       claimedBy: 'Carlo D.', avatar: 'PR' },
  { datetime: 'May 22, 2026 · 1:00 PM',  customer: 'Ana Cruz',       phone: '0917-97-4542',  orderId: '#ORD-8872', items: '2 items', itemLabel: 'Tatak BUENO Shirt · Tote Bag',        claimedBy: 'Dan F.',   avatar: 'AC' },
  { datetime: 'May 22, 2026 · 2:17 PM',  customer: 'Jose Martinez',  phone: '0922-459-7990', orderId: '#ORD-8865', items: '1 item',  itemLabel: 'BU Tote Bag',                         claimedBy: 'Erika L.', avatar: 'JM' },
]

const NOSHOW_PICKUPS = [
  { datetime: 'May 22, 2026 · 3:00 PM',  customer: 'Luis Reyes',     phone: '0918-501-5532', orderId: '#ORD-8820', items: '1 item',  itemLabel: 'BU Hoodie',       avatar: 'LR' },
  { datetime: 'May 22, 2026 · 3:30 PM',  customer: 'Camille Santos', phone: '0919-510-3419', orderId: '#ORD-8817', items: '2 items', itemLabel: 'BU Shirt · Cap',  avatar: 'CS' },
  { datetime: 'May 21, 2026 · 4:00 PM',  customer: 'Marco Mendoza',  phone: '0916-882-7744', orderId: '#ORD-8863', items: '1 item',  itemLabel: 'BU Tote Bag',     avatar: 'MM' },
  { datetime: 'May 21, 2026 · 4:30 PM',  customer: 'Shaira Lopez',   phone: '0917-222-3344', orderId: '#ORD-4769', items: '1 item',  itemLabel: 'BU Polo Shirt',   avatar: 'SL' },
]

// ─── Slot Picker Modal ─────────────────────────────────────────────────────
function SchedulePickupModal({ order, onClose, onConfirm }) {
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [selectedDate, setSelectedDate] = useState('May 22, 2026')

  const modalSlots = [
    { time: '8:00 – 8:30 AM',   count: 1, max: 5, closed: false },
    { time: '8:30 – 9:00 AM',   count: 3, max: 5, closed: false },
    { time: '9:00 – 9:30 AM',   count: 1, max: 5, closed: false },
    { time: '9:30 – 10:00 AM',  count: 5, max: 5, closed: false }, // full
    { time: '10:00 – 10:30 AM', count: 2, max: 5, closed: false },
    { time: '10:30 – 11:00 AM', count: 4, max: 5, closed: false, issue: true },
    { time: '11:00 – 11:30 AM', count: 0, max: 5, closed: true  },
    { time: '11:30 AM – 12:00 PM', count: 1, max: 5, closed: false },
    { time: '1:00 – 1:30 PM',   count: 2, max: 5, closed: false },
    { time: '1:30 – 2:00 PM',   count: 0, max: 5, closed: false },
    { time: '2:00 – 2:30 PM',   count: 3, max: 5, closed: false },
  ]

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
          <span className="text-xs font-semibold text-slate-700">{selectedDate}</span>
          <span className="ml-auto text-[10px] text-slate-400">Showing available slots</span>
        </div>

        {/* Slot grid */}
        <div className="px-5 py-4 max-h-72 overflow-y-auto space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
            Select a time slot — max 5 appointments per slot
          </p>
          {modalSlots.map((slot) => {
            const isFull   = slot.count >= slot.max
            const disabled = slot.closed || isFull
            const isSelected = selectedSlot === slot.time
            return (
              <button
                key={slot.time}
                type="button"
                disabled={disabled}
                onClick={() => !disabled && setSelectedSlot(slot.time)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-xs font-medium transition-all cursor-pointer
                  ${disabled
                    ? 'bg-slate-50 border-slate-200 text-slate-300 cursor-not-allowed'
                    : isSelected
                      ? 'bg-orange-50 border-brand-orange text-brand-orange font-bold'
                      : slot.issue
                        ? 'bg-amber-50/60 border-amber-200 text-slate-700 hover:border-amber-400'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                  }`}
              >
                <span>{slot.time}</span>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-semibold ${isFull ? 'text-rose-500' : slot.issue ? 'text-amber-600' : 'text-slate-400'}`}>
                    {slot.closed ? 'Closed' : isFull ? 'Full' : `${slot.count}/${slot.max}`}
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
              disabled={!selectedSlot}
              onClick={() => selectedSlot && onConfirm(selectedSlot)}
              className={`h-8 px-4 rounded-md text-xs font-bold transition-colors cursor-pointer
                ${selectedSlot ? 'bg-brand-orange hover:bg-orange-600 text-white' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
            >
              Confirm Slot
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
  const colors = {
    JD: 'bg-blue-100 text-blue-700', MS: 'bg-pink-100 text-pink-700',
    PR: 'bg-indigo-100 text-indigo-700', AC: 'bg-emerald-100 text-emerald-700',
    JM: 'bg-amber-100 text-amber-700',  RC: 'bg-purple-100 text-purple-700',
    LR: 'bg-sky-100 text-sky-700',      CS: 'bg-rose-100 text-rose-700',
    MM: 'bg-teal-100 text-teal-700',    SL: 'bg-violet-100 text-violet-700',
  }
  const c = colors[initials] || 'bg-slate-100 text-slate-600'
  const sz = size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-8 h-8 text-xs'
  return (
    <div className={`${sz} ${c} rounded-full flex items-center justify-center font-bold shrink-0`}>
      {initials}
    </div>
  )
}

// ─── Right Sidebar Panel (shared by Scheduled & Overview) ─────────────────
function PickupScheduleSidebar({ onSchedule, onViewUnscheduled }) {
  return (
    <div className="w-72 shrink-0 space-y-3">
      {/* Schedule Panel */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-slate-500 shrink-0">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <div>
            <p className="text-xs font-bold text-slate-900">Pickup Schedule</p>
            <p className="text-[10px] text-slate-400">Today • May 22, 2026</p>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {SCHEDULE_SLOTS.map((slot) => (
            <div key={slot.time} className="flex items-center justify-between px-4 py-2">
              <span className="text-[11px] font-medium text-slate-700 w-32 shrink-0">{slot.time}</span>
              <span className={`text-[11px] font-semibold ${slot.count >= slot.max ? 'text-rose-500' : 'text-slate-500'}`}>
                {slot.count}/{slot.max}
              </span>
              <SlotStatusBadge status={slot.status} />
            </div>
          ))}
        </div>
        <div className="px-4 py-2.5 border-t border-slate-100">
          <button
            type="button"
            className="text-xs font-semibold text-brand-orange hover:underline cursor-pointer"
          >
            View Full Schedule
          </button>
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
              <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
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
              <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              <line x1="9" y1="14" x2="15" y2="14" />
            </svg>
            View Unscheduled
          </button>
          <button
            type="button"
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 shrink-0 text-slate-400">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
            Manage Time Slots
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Tab Components ────────────────────────────────────────────────────────

function OverviewTab({ onSchedule, onViewUnscheduled }) {
  return (
    <div className="flex gap-4 min-h-0">
      {/* Main content */}
      <div className="flex-1 space-y-4 min-w-0">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: 'Ready for Pickup', value: '12', sub: 'orders',          color: 'emerald', icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>) },
            { label: 'Unscheduled',      value: '5',  sub: 'orders',          color: 'amber',   icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="9" y1="14" x2="15" y2="14"/></svg>) },
            { label: "Today's Scheduled",value: '8',  sub: 'appointments',    color: 'blue',    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="9 16 11 18 15 14"/></svg>) },
            { label: "Today's Completed",value: '1',  sub: 'pickups',         color: 'indigo',  icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="20 6 9 17 4 12"/></svg>) },
            { label: 'No-show',          value: '1',  sub: 'appointment',     color: 'rose',    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>) },
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
            <span className="text-xs text-slate-500 font-medium">May 22, 2026</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/60 border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-2.5">Time</th>
                  <th className="px-4 py-2.5">Appointments</th>
                  <th className="px-4 py-2.5">Capacity</th>
                  <th className="px-4 py-2.5">Staff Available</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {OVERVIEW_SCHEDULE_ROWS.map((row) => (
                  <tr key={row.time} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-slate-700">{row.time}</td>
                    <td className="px-4 py-2.5">
                      <span className={`font-bold ${row.appts >= row.capacity ? 'text-rose-600' : 'text-slate-900'}`}>{row.appts}</span>
                      <span className="text-slate-400 font-normal"> / {row.capacity}</span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{row.capacity}</td>
                    <td className="px-4 py-2.5">
                      {row.staffOk === true  && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 text-emerald-500"><polyline points="20 6 9 17 4 12"/></svg>}
                      {row.staffOk === false && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 text-amber-500"><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/><circle cx="12" cy="12" r="10"/></svg>}
                      {row.staffOk === null  && <span className="text-[10px] text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-2.5"><SlotStatusBadge status={row.status === 'Covered' ? 'covered' : row.status === 'Coverage Issue' ? 'issue' : 'closed'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Right sidebar */}
      <PickupScheduleSidebar onSchedule={onSchedule} onViewUnscheduled={onViewUnscheduled} />
    </div>
  )
}

function UnscheduledTab({ onSchedule }) {
  const [orders] = useState(UNSCHEDULED_ORDERS)
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
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar initials={order.avatar} />
                      <div>
                        <p className="font-bold text-slate-900 text-xs">{order.customer}</p>
                        <p className="text-[10px] text-slate-400">{order.phone}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-extrabold text-slate-800">{order.id}</span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-700">{order.items}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{order.itemLabel}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-slate-600 font-medium">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 text-slate-400">
                        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                      </svg>
                      {order.readySince}
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
                      <button type="button" className="h-8 px-3 border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 rounded-md cursor-pointer">
                        View Order
                      </button>
                      <button type="button" className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-400 hover:text-slate-700 hover:bg-slate-50 cursor-pointer text-sm font-bold">⋯</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function ScheduledTab({ onSchedule, onViewUnscheduled }) {
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
              May 22, 2026
            </button>
            <button type="button" className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-400 hover:bg-slate-50 cursor-pointer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>
        </div>

        {/* Time-grouped appointments */}
        <div className="space-y-3">
          {SCHEDULED_GROUPS.map((group) => (
            <div key={group.slot} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              {/* Slot header */}
              <div className="px-4 py-2.5 bg-slate-50/60 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-slate-400">
                    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                  </svg>
                  <span className="text-xs font-bold text-slate-800">{group.slot}</span>
                </div>
                <span className="text-[10px] font-semibold text-slate-400">
                  {group.count} {group.count === 1 ? 'appointment' : 'appointments'}
                </span>
              </div>

              {/* Appointment cards */}
              <div className="divide-y divide-slate-100">
                {group.appointments.map((appt) => (
                  <div key={appt.apptId} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/40 transition-colors">
                    <Avatar initials={appt.avatar} size="md" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-900">{appt.customer}</p>
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
                      <button type="button" className="h-7 px-2.5 border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 rounded-md cursor-pointer">
                        View Order
                      </button>
                      <button type="button" className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-400 hover:text-slate-700 hover:bg-slate-50 cursor-pointer text-sm font-bold">⋯</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right sidebar */}
      <PickupScheduleSidebar onSchedule={onSchedule} onViewUnscheduled={onViewUnscheduled} />
    </div>
  )
}

function CompletedTab() {
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
          May 22, 2026
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
              {COMPLETED_PICKUPS.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3 text-slate-600 font-medium whitespace-nowrap">{row.datetime}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar initials={row.avatar} />
                      <div>
                        <p className="font-bold text-slate-900">{row.customer}</p>
                        <p className="text-[10px] text-slate-400">{row.phone}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-extrabold text-slate-800">{row.orderId}</td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-700">{row.items}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{row.itemLabel}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-100 text-[11px] font-semibold">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      {row.claimedBy}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 border-t border-slate-100 text-[11px] text-slate-400 font-medium">
          Showing 5 of 5 completed pickups
        </div>
      </div>
    </div>
  )
}

function NoshowTab() {
  const [orders] = useState(NOSHOW_PICKUPS)
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
          May 22, 2026
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
              {orders.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3 text-slate-600 font-medium whitespace-nowrap">{row.datetime}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar initials={row.avatar} />
                      <div>
                        <p className="font-bold text-slate-900">{row.customer}</p>
                        <p className="text-[10px] text-slate-400">{row.phone}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-extrabold text-slate-800">{row.orderId}</td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-700">{row.items}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{row.itemLabel}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        className="h-8 px-3 bg-brand-orange hover:bg-orange-600 text-white text-xs font-bold rounded-md transition-colors cursor-pointer"
                      >
                        Reschedule
                      </button>
                      <button type="button" className="h-8 px-3 border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 rounded-md cursor-pointer">
                        Contact
                      </button>
                      <button type="button" className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-400 hover:text-slate-700 hover:bg-slate-50 cursor-pointer text-sm font-bold">⋯</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 border-t border-slate-100 text-[11px] text-slate-400 font-medium">
          Showing 4 of 4 no-show pickups
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────
const TABS = ['Overview', 'Unscheduled', 'Scheduled', 'Completed', 'No-show']

export default function AdminPickup() {
  const [activeTab, setActiveTab] = useState('Overview')
  const [scheduleModal, setScheduleModal] = useState({ open: false, order: null })
  const [toast, setToast] = useState('')

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  const openScheduleModal = (order = null) => setScheduleModal({ open: true, order })
  const closeScheduleModal = () => setScheduleModal({ open: false, order: null })

  const handleConfirmSlot = (slot) => {
    const name = scheduleModal.order?.customer || 'customer'
    const id   = scheduleModal.order?.id || ''
    showToast(`Pickup scheduled for ${name}${id ? ` (${id})` : ''} at ${slot}`)
    closeScheduleModal()
  }

  const handleViewUnscheduled = () => setActiveTab('Unscheduled')

  const TAB_ICONS = {
    Overview:    (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>),
    Unscheduled: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="9" y1="14" x2="15" y2="14"/></svg>),
    Scheduled:   (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="9 16 11 18 15 14"/></svg>),
    Completed:   (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><polyline points="20 6 9 17 4 12"/></svg>),
    'No-show':   (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>),
  }

  const TAB_COUNTS = { Overview: null, Unscheduled: 5, Scheduled: 8, Completed: 5, 'No-show': 4 }

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
            onClose={closeScheduleModal}
            onConfirm={handleConfirmSlot}
          />
        )}

        {/* ── Page Header ── */}
        <div className="pb-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium mb-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span>Fulfillment</span>
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
                  }`}
                >
                  {TAB_COUNTS[tab]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Tab Content ── */}
        <div className="flex-1 overflow-y-auto pb-6 scrollbar-none">
          {activeTab === 'Overview'    && <OverviewTab    onSchedule={openScheduleModal} onViewUnscheduled={handleViewUnscheduled} />}
          {activeTab === 'Unscheduled' && <UnscheduledTab onSchedule={openScheduleModal} />}
          {activeTab === 'Scheduled'   && <ScheduledTab   onSchedule={openScheduleModal} onViewUnscheduled={handleViewUnscheduled} />}
          {activeTab === 'Completed'   && <CompletedTab />}
          {activeTab === 'No-show'     && <NoshowTab />}
        </div>
      </div>
    </AdminLayout>
  )
}
