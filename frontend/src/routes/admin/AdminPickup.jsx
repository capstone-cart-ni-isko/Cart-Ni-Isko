import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import LoadingSpinner from '../../components/ui/LoadingSpinner.jsx'
import QRScanner from '../../components/ui/QRScanner.jsx'
import StatusPill from '../../components/admin/StatusPill.jsx'
import Panel from '../../components/admin/kit/Panel.jsx'
import KpiCard from '../../components/admin/kit/KpiCard.jsx'
import AdminPageHeader from '../../components/admin/kit/AdminPageHeader.jsx'
import Segmented from '../../components/admin/kit/Segmented.jsx'
import { BTN_PRIMARY_SM, BTN_SECONDARY_SM, ICON_BTN, INPUT, SCROLL_FADE, PAGE_ROOT } from '../../components/admin/kit/ui.js'
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
                      ? 'bg-isko-blue/10 border-isko-blue text-isko-blue-dark font-semibold'
                      : issue
                        ? 'bg-isko-orange/5 border-isko-orange/30 text-slate-700 hover:border-isko-orange/60'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                  }`}
              >
                <span>{slotRangeLabel(slot)}</span>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-semibold ${isFull ? 'text-isko-orange-dark' : issue ? 'text-isko-orange' : 'text-slate-400'}`}>
                    {isFull ? 'Full' : `${slot.booked}/${slot.capacity}`}
                  </span>
                  {isSelected && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5 text-isko-blue">
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
                ${selectedSlot && !busy ? 'bg-isko-orange hover:bg-isko-orange-dark text-white' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
            >
              {busy ? 'Scheduling...' : 'Confirm Slot'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Slot status badge helper (kit palette) ───────────────────────────────
function SlotStatusBadge({ status }) {
  if (status === 'covered') return <StatusPill status="Covered" variant="blue" />
  if (status === 'issue') return <StatusPill status="Coverage issue" variant="amber" />
  if (status === 'closed') return <StatusPill status="Closed" />
  return null
}

// ─── Avatar helper (brand tints) ──────────────────────────────────────────
const AVATAR_TINTS = ['bg-isko-blue/15 text-isko-blue-dark', 'bg-isko-orange/15 text-isko-orange-dark', 'bg-slate-200 text-slate-700']

function Avatar({ initials, size = 'sm' }) {
  let hash = 0
  for (const ch of String(initials || '#')) hash = (hash + ch.charCodeAt(0)) % AVATAR_TINTS.length
  const sz = size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-8 h-8 text-xs'
  return (
    <div className={`${sz} ${AVATAR_TINTS[hash]} rounded-full flex items-center justify-center font-semibold shrink-0`}>
      {initials}
    </div>
  )
}

// Shared table chrome: sticky header row inside a panel that scrolls
const TH = 'px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 bg-slate-50 border-b border-slate-200'
const TD = 'px-3 py-2.5'

function ScrollTable({ head, children }) {
  return (
    <div className={`h-full ${SCROLL_FADE} rounded-md border border-slate-100`}>
      <table className="w-full text-xs text-left border-collapse min-w-[560px]">
        <thead className="sticky top-0 z-10">
          <tr>{head}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  )
}

function EmptyRow({ colSpan, children }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-slate-400">
        {children}
      </td>
    </tr>
  )
}

const whenLabel = (date) =>
  date
    ? `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
    : '—'

function CustomerCell({ order }) {
  return (
    <div className="flex items-center gap-2.5">
      <Avatar initials={initialsOf(order.customer)} />
      <div className="min-w-0">
        <p className="font-semibold text-slate-900 truncate">{order.customer}</p>
        <p className="text-[11px] text-slate-400">{order.custPhone || '—'}</p>
      </div>
    </div>
  )
}

function ItemsCell({ order }) {
  const items = itemsInfo(order)
  return (
    <>
      <p className="font-medium text-slate-700">{items.count}</p>
      <p className="text-[11px] text-slate-400 mt-0.5 max-w-[16rem] truncate">{items.label}</p>
    </>
  )
}

// ─── Right column (shared by Overview & Scheduled) ────────────────────────
function PickupScheduleSidebar({ slots, onSchedule, onViewUnscheduled }) {
  return (
    <div className="flex flex-col gap-3 lg:min-h-0 lg:h-full">
      <Panel
        title="Pickup schedule"
        meta="Today"
        actionLabel="Full schedule"
        actionTo="/admin/schedule"
        className="lg:flex-1 min-h-[14rem] lg:min-h-0"
      >
        <div className={`h-full ${SCROLL_FADE} divide-y divide-slate-100`}>
          {slots.map((slot) => {
            const isFull = slot.booked >= slot.capacity
            const status = !slot.available && isStaffShortage(slot) ? 'issue' : 'covered'
            return (
              <div key={slot.start} className="flex items-center justify-between gap-2 py-2">
                <span className="text-xs font-medium text-slate-700 whitespace-nowrap">{slotRangeLabel(slot)}</span>
                <span className={`text-xs font-semibold tabular-nums whitespace-nowrap ${isFull ? 'text-isko-orange-dark' : 'text-slate-500'}`}>
                  {slot.booked}/{slot.capacity}
                </span>
                <SlotStatusBadge status={status} />
              </div>
            )
          })}
          {slots.length === 0 && (
            <div className="flex items-center gap-2 py-3">
              <LoadingSpinner size={16} />
              <p className="text-[11px] text-slate-400">Loading today&apos;s slots…</p>
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Quick actions" className="shrink-0">
        <div className="grid grid-cols-1 gap-2">
          <button type="button" onClick={onSchedule} className={`${BTN_PRIMARY_SM} w-full justify-start`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <line x1="12" y1="14" x2="12" y2="18" /><line x1="10" y1="16" x2="14" y2="16" />
            </svg>
            Schedule pickup
          </button>
          <button type="button" onClick={onViewUnscheduled} className={`${BTN_SECONDARY_SM} w-full justify-start`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 shrink-0 text-isko-blue" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <line x1="9" y1="14" x2="15" y2="14" />
            </svg>
            View unscheduled
          </button>
          <Link to="/admin/schedule" className={`${BTN_SECONDARY_SM} w-full justify-start`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 shrink-0 text-isko-blue" aria-hidden="true">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
            Manage time slots
          </Link>
        </div>
      </Panel>
    </div>
  )
}

// ─── Tab Components ────────────────────────────────────────────────────────
// Every tab fills the space under the tabs; panels scroll inside (no page scroll).

const KPI_ICON = {
  ready: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>),
  unscheduled: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="9" y1="14" x2="15" y2="14"/></svg>),
  scheduled: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="9 16 11 18 15 14"/></svg>),
  completed: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>),
  noshow: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>),
}

function OverviewTab({ kpis, scheduleRows, slots, onSchedule, onViewUnscheduled, onOpenTab }) {
  const cards = [
    { key: 'ready', label: 'Ready for pickup', value: kpis.ready, sub: 'orders', accent: 'orange', tab: 'Unscheduled' },
    { key: 'unscheduled', label: 'Unscheduled', value: kpis.unscheduled, sub: kpis.unscheduled ? 'need a pickup time' : 'all scheduled', accent: 'orange', tab: 'Unscheduled' },
    { key: 'scheduled', label: "Today's scheduled", value: kpis.scheduledToday, sub: 'appointments', accent: 'blue', tab: 'Scheduled' },
    { key: 'completed', label: "Today's completed", value: kpis.completedToday, sub: 'pickups', accent: 'blue', tab: 'Completed' },
    { key: 'noshow', label: 'No-show', value: kpis.noshow, sub: 'missed windows', accent: 'orange', tab: 'No-show' },
  ]

  return (
    <div className="flex flex-col gap-3 lg:h-full lg:min-h-0">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 shrink-0">
        {cards.map((card) => (
          <KpiCard
            key={card.key}
            label={card.label}
            value={card.value}
            subtext={card.sub}
            accent={card.accent}
            icon={KPI_ICON[card.key]}
            onClick={() => onOpenTab(card.tab)}
            hint={`Open ${card.tab}`}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:flex-1 lg:min-h-0">
        <Panel title="Today's pickup schedule" meta={TODAY_LABEL} className="lg:col-span-8 min-h-[20rem] lg:min-h-0">
          <ScrollTable
            head={
              <>
                <th className={`${TH} w-40`}>Time</th>
                <th className={`${TH} w-32`}>Appointments</th>
                <th className={`${TH} w-28`}>Staff available</th>
                <th className={TH}>Status</th>
              </>
            }
          >
            {scheduleRows.map((row) => (
              <tr key={row.time} className="hover:bg-isko-blue/5 transition-colors">
                <td className={`${TD} font-medium text-slate-700 whitespace-nowrap`}>{row.time}</td>
                <td className={`${TD} whitespace-nowrap tabular-nums`}>
                  <span className={`font-semibold ${row.appts >= row.capacity ? 'text-isko-orange-dark' : 'text-slate-900'}`}>{row.appts}</span>
                  <span className="text-slate-400"> / {row.capacity}</span>
                </td>
                <td className={TD}>
                  {row.staffOk === true && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 text-isko-blue" aria-label="Enough staff"><polyline points="20 6 9 17 4 12" /></svg>
                  )}
                  {row.staffOk === false && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 text-isko-orange" aria-label="Not enough staff"><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /><circle cx="12" cy="12" r="10" /></svg>
                  )}
                  {row.staffOk === null && <span className="text-[11px] text-slate-400">—</span>}
                </td>
                <td className={TD}>
                  <SlotStatusBadge status={row.status} />
                </td>
              </tr>
            ))}
            {scheduleRows.length === 0 && <EmptyRow colSpan={4}>No slots available today.</EmptyRow>}
          </ScrollTable>
        </Panel>

        <div className="lg:col-span-4 lg:min-h-0">
          <PickupScheduleSidebar slots={slots} onSchedule={onSchedule} onViewUnscheduled={onViewUnscheduled} />
        </div>
      </div>
    </div>
  )
}

function UnscheduledTab({ orders, onSchedule, onHandover, onOpenOrder, busyId }) {
  return (
    <Panel
      title="Ready without a pickup time"
      meta={`${orders.length} ${orders.length === 1 ? 'order' : 'orders'} · schedule a slot to confirm them with the customer`}
      className="lg:h-full min-h-[24rem] lg:min-h-0"
    >
      <ScrollTable
        head={
          <>
            <th className={TH}>Customer</th>
            <th className={TH}>Order #</th>
            <th className={TH}>Items</th>
            <th className={TH}>Ready since</th>
            <th className={`${TH} text-right`}>Actions</th>
          </>
        }
      >
        {orders.map((order) => (
          <tr key={order.id} className="hover:bg-isko-blue/5 transition-colors">
            <td className={TD}><CustomerCell order={order} /></td>
            <td className={`${TD} font-semibold text-slate-900 whitespace-nowrap`}>{order.id}</td>
            <td className={TD}><ItemsCell order={order} /></td>
            <td className={`${TD} text-slate-600 whitespace-nowrap`}>{timeOfDay(order.createdAt)}</td>
            <td className={TD}>
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={() => onSchedule(order)} className={BTN_PRIMARY_SM}>
                  Schedule pickup
                </button>
                <button type="button" disabled={busyId === order.id} onClick={() => onHandover(order)} className={BTN_SECONDARY_SM}>
                  {busyId === order.id ? 'Handing over…' : 'Hand over'}
                </button>
                <button type="button" onClick={() => onOpenOrder(order)} className={BTN_SECONDARY_SM}>
                  View order
                </button>
              </div>
            </td>
          </tr>
        ))}
        {orders.length === 0 && <EmptyRow colSpan={5}>No unscheduled pickups — every ready order has a slot.</EmptyRow>}
      </ScrollTable>
    </Panel>
  )
}

function ScheduledTab({ groups, slots, onSchedule, onViewUnscheduled, onHandover, onOpenOrder, busyId }) {
  const total = groups.reduce((sum, group) => sum + group.count, 0)
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:h-full lg:min-h-0">
      <Panel
        title="Scheduled pickups"
        meta={`${total} ${total === 1 ? 'appointment' : 'appointments'} with a confirmed time`}
        className="lg:col-span-8 min-h-[24rem] lg:min-h-0"
      >
        <div className={`h-full ${SCROLL_FADE} space-y-3`}>
          {groups.map((group) => (
            <div key={group.key} className="rounded-md border border-slate-200 overflow-hidden">
              <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800">{group.label}</span>
                <span className="text-[11px] font-medium text-slate-500">
                  {group.count} {group.count === 1 ? 'appointment' : 'appointments'}
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {group.appointments.map((appt) => (
                  <div key={appt.apptId} className="flex items-center gap-3 px-3 py-2.5 hover:bg-isko-blue/5 transition-colors">
                    <Avatar initials={initialsOf(appt.customer)} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs font-semibold text-slate-900">{appt.customer}</p>
                        <span className="text-[11px] font-semibold text-isko-blue-dark bg-isko-blue/10 px-1.5 py-0.5 rounded">{appt.time}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {appt.apptId} · <span className="font-medium text-slate-700">{appt.orderId}</span>
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-medium text-slate-700">{appt.items}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5 max-w-[180px] truncate">{appt.itemLabel}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {appt.order && (
                        <button type="button" disabled={busyId === appt.order.id} onClick={() => onHandover(appt.order)} className={BTN_SECONDARY_SM}>
                          Hand over
                        </button>
                      )}
                      <button type="button" onClick={() => onOpenOrder(appt.order)} className={BTN_SECONDARY_SM}>
                        View order
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {groups.length === 0 && <p className="py-8 text-center text-slate-400 text-xs">No scheduled pickups yet.</p>}
        </div>
      </Panel>

      <div className="lg:col-span-4 lg:min-h-0">
        <PickupScheduleSidebar onSchedule={() => onSchedule(null)} onViewUnscheduled={onViewUnscheduled} slots={slots} />
      </div>
    </div>
  )
}

function CompletedTab({ orders, total }) {
  return (
    <Panel
      title="Completed pickups"
      meta={`Showing ${orders.length} of ${total} · claimed and handed over to customers`}
      className="lg:h-full min-h-[24rem] lg:min-h-0"
    >
      <ScrollTable
        head={
          <>
            <th className={TH}>Date &amp; time</th>
            <th className={TH}>Customer</th>
            <th className={TH}>Order #</th>
            <th className={TH}>Items</th>
            <th className={TH}>Claimed by</th>
          </>
        }
      >
        {orders.map((order) => (
          <tr key={order.id} className="hover:bg-isko-blue/5 transition-colors">
            <td className={`${TD} text-slate-600 whitespace-nowrap`}>{whenLabel(parseDate(order.completedAt) || parseDate(order.createdAt))}</td>
            <td className={TD}><CustomerCell order={order} /></td>
            <td className={`${TD} font-semibold text-slate-900 whitespace-nowrap`}>{order.id}</td>
            <td className={TD}><ItemsCell order={order} /></td>
            <td className={TD}><StatusPill status="In-store claim" variant="green" /></td>
          </tr>
        ))}
        {orders.length === 0 && <EmptyRow colSpan={5}>No completed pickups yet.</EmptyRow>}
      </ScrollTable>
    </Panel>
  )
}

function NoshowTab({ orders, onReschedule, onOpenOrder, busyId }) {
  return (
    <Panel
      title="No-show pickups"
      meta={`${orders.length} not claimed within the pickup window`}
      className="lg:h-full min-h-[24rem] lg:min-h-0"
    >
      <ScrollTable
        head={
          <>
            <th className={TH}>Date &amp; time</th>
            <th className={TH}>Customer</th>
            <th className={TH}>Order #</th>
            <th className={TH}>Items</th>
            <th className={`${TH} text-right`}>Actions</th>
          </>
        }
      >
        {orders.map((order) => (
          <tr key={order.id} className="hover:bg-isko-blue/5 transition-colors">
            <td className={`${TD} text-slate-600 whitespace-nowrap`}>{whenLabel(parseDate(order.createdAt))}</td>
            <td className={TD}><CustomerCell order={order} /></td>
            <td className={`${TD} font-semibold text-slate-900 whitespace-nowrap`}>{order.id}</td>
            <td className={TD}><ItemsCell order={order} /></td>
            <td className={TD}>
              <div className="flex items-center justify-end gap-2">
                <button type="button" disabled={busyId === order.id} onClick={() => onReschedule(order)} className={BTN_PRIMARY_SM}>
                  {busyId === order.id ? 'Rescheduling…' : 'Reschedule'}
                </button>
                <button type="button" onClick={() => onOpenOrder(order)} className={BTN_SECONDARY_SM}>
                  Contact
                </button>
              </div>
            </td>
          </tr>
        ))}
        {orders.length === 0 && <EmptyRow colSpan={5}>No no-show pickups.</EmptyRow>}
      </ScrollTable>
    </Panel>
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

  /**
   * REQ-APC-02: staff scan an order/appointment/parcel QR (POST /tracking/scan).
   * The camera scanner passes its decoded code straight in, since the scanCode
   * state it also sets is not readable until the next render.
   */
  const handleScan = async (scanned) => {
    const code = (typeof scanned === 'string' ? scanned : scanCode).trim()
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
      <div className={PAGE_ROOT}>
        {/* Toast */}
        {toast && (
          <div className="fixed top-16 right-6 z-50 bg-white text-slate-800 px-3.5 py-2 rounded-md border border-slate-200 flex items-center gap-2 text-xs font-semibold animate-slide-up shadow-md">
            <span className="w-1.5 h-1.5 rounded-full bg-isko-blue shrink-0" />
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

        {/* ── Header with QR verification (REQ-APC-02) ── */}
        <AdminPageHeader title="Pickup" subtitle="Manage in-store pickups, schedule appointments, and track handovers.">
          <div className="relative w-56">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true">
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
              aria-label="QR code"
              className={`${INPUT} h-8 pl-8 text-xs`}
            />
          </div>
          <button type="button" onClick={handleScan} className={BTN_PRIMARY_SM}>
            Scan QR
          </button>
          <button type="button" onClick={() => setScanModalOpen(true)} className={ICON_BTN} title="Open camera scanner" aria-label="Open camera scanner">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </button>
        </AdminPageHeader>

        {scanMsg && (
          <p
            role="status"
            className={`shrink-0 -mt-1 text-xs font-medium px-3 py-2 rounded-md border ${
              scanMsg.type === 'ok'
                ? 'bg-isko-blue/10 text-isko-blue-dark border-isko-blue/25'
                : 'bg-rose-50 text-rose-700 border-rose-200'
            }`}
          >
            {scanMsg.text}
          </p>
        )}

        {/* QR Camera Scanner Modal */}
        {scanModalOpen && (
          <div className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-md flex items-center justify-center px-4 animate-fade-in">
            <div className="bg-white rounded-lg border border-slate-200 w-full max-w-md shadow-xl animate-scale-in overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">QR code scanner</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Point the camera at the customer&apos;s QR code</p>
                </div>
                <button
                  type="button"
                  onClick={() => setScanModalOpen(false)}
                  aria-label="Close scanner"
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
                    handleScan(code)
                    setScanModalOpen(false)
                  }}
                  onError={(error) => {
                    setScanMsg({ type: 'error', text: error })
                  }}
                  className="w-full aspect-video"
                />
              </div>
              <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50">
                <button type="button" onClick={() => setScanModalOpen(false)} className={BTN_SECONDARY_SM}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Tabs ── */}
        <Segmented
          label="Pickup sections"
          className="self-start shrink-0"
          value={activeTab}
          onChange={setActiveTab}
          options={TABS.map((tab) => ({
            value: tab,
            label: tab,
            icon: TAB_ICONS[tab],
            count: TAB_COUNTS[tab] !== null ? TAB_COUNTS[tab] : undefined,
          }))}
        />

        {/* ── Tab content fills the rest; panels scroll inside ── */}
        <div className="lg:flex-1 lg:min-h-0">
          {activeTab === 'Overview' && (
            <OverviewTab
              kpis={kpis}
              scheduleRows={scheduleRows}
              slots={claimSlots}
              onSchedule={() => openScheduleModal(null)}
              onViewUnscheduled={handleViewUnscheduled}
              onOpenTab={setActiveTab}
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
