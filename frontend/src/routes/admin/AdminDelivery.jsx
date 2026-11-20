import { useState, useMemo, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import DefaultAvatar from '../../components/ui/Avatar.jsx'
import { useAdmin } from '../../hooks/useAdmin.js'
import { getTrack, updateTrack } from '../../services/tracking.js'
import { bookDelivery, cancelDelivery } from '../../services/checkout.js'
import { mapOrderRows, parseDate } from '../../services/dashboard.js'
import LiveDate from '../../components/ui/LiveDate.jsx'
import Modal from '../../components/ui/Modal.jsx'
import Button from '../../components/ui/Button.jsx'

// ─── Delivery Workflow (live data) ────────────────────────────────────────
// Queue      = "READY TO SHIP" orders (courier booked, rider not there yet),
//              plus legacy "TO RECEIVE" orders whose track is not TRANSIT.
// In Transit = "IN TRANSIT" orders (LalaMove reported the pickup), plus legacy
//              "TO RECEIVE" orders whose delivery track is TRANSIT.
// Completed  = "CLAIMED" / "RECEIVED" orders that own a delivery/parcel track.
// Issues     = "RETURNED" / "CANCELLED" orders that own a delivery track.
// Booking    = POST /delivery/book | /delivery/cancel (LalaMove). A paid order
//              is booked by itself when it is marked Ready to Ship; staff only
//              re-book here when that booking failed or was cancelled.
// Dispatch   = PUT /tracking/update {status: TRANSIT} - manual hand-off, only
//              offered when no LalaMove booking is live.

const HISTORY_STATUSES = new Set(['CLAIMED', 'RECEIVED', 'RETURNED', 'CANCELLED'])
const ACTIVE_STATUSES = new Set(['READY TO SHIP', 'IN TRANSIT', 'TO RECEIVE'])

const ISSUE_REASONS = {
  CANCELLED: 'The order was cancelled.',
  RETURNED: 'Parcel was returned to the store by the courier.',
}

/** Backend timestamp -> '9:12 AM'. */
function timeOfDay(value) {
  const date = parseDate(value)
  if (!date) return '—'
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

/** 'May 21, 2026' (or 'Today' when it is the current day). */
function dateLabel(value) {
  const date = parseDate(value)
  if (!date) return '—'
  if (date.toDateString() === new Date().toDateString()) return 'Today'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** 'May 22, 2026 · 9:48 AM'. */
function dateTimeLabel(value) {
  const date = parseDate(value)
  if (!date) return '—'
  return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
}

/** ETA from deliver_date: time today, date + time otherwise. */
function etaLabel(value) {
  const date = parseDate(value)
  if (!date) return '—'
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  if (date.toDateString() === new Date().toDateString()) return time
  return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${time}`
}

/** LalaMove booking states, in the store's own words. */
const COURIER_STATE_LABELS = {
  ASSIGNING_DRIVER: 'Finding a rider',
  ON_GOING: 'Rider on the way',
  PICKED_UP: 'Picked up',
  COMPLETED: 'Delivered',
}

const FAILED_COURIER_STATES = new Set(['CANCELED', 'REJECTED', 'EXPIRED'])

/**
 * Where a queued delivery stands with the courier, and so what staff can do:
 *   fee      - the customer still owes the delivery fee (nothing to do yet)
 *   booked   - a LalaMove rider is booked (track or cancel)
 *   failed   - LalaMove cancelled/rejected the booking (book again)
 *   unbooked - Ready to Ship but the booking never went through (book)
 *   manual   - LalaMove has no keys: hand the parcel over and mark it
 */
function courierStateOf(row) {
  if (row.feePending) return { key: 'fee', label: 'Awaiting delivery fee', tone: 'amber' }
  const status = String(row.courier?.status || '').toUpperCase()
  if (row.courier?.booked) {
    return { key: 'booked', label: COURIER_STATE_LABELS[status] || 'Courier booked', tone: 'blue' }
  }
  if (row.lalamoveConfigured === false) return { key: 'manual', label: 'Manual hand-off', tone: 'slate' }
  if (FAILED_COURIER_STATES.has(status)) return { key: 'failed', label: 'Booking failed', tone: 'rose' }
  return { key: 'unbooked', label: 'Not booked yet', tone: 'rose' }
}

const TONE_CLASSES = {
  amber: 'bg-amber-50 text-amber-700 border-amber-200/60',
  blue: 'bg-blue-50 text-blue-700 border-blue-200/60',
  rose: 'bg-rose-50 text-rose-700 border-rose-200/60',
  slate: 'bg-slate-50 text-slate-600 border-slate-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
}

const peso = (value) => `₱${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

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

const trackStatusOf = (track) =>
  String(track?.delivery?.deliver_status || '').trim().toUpperCase()

/** Merge a mapped order row with its probed delivery/parcel track. */
function enrichDelivery(order, track) {
  const delivery = track?.delivery || null
  // The order payload carries the same delivery columns, so a row is right
  // even before its track probe has answered.
  const raw = order.raw || {}
  const hasDelivery = Boolean(delivery) || raw.deliver_id != null
  const feeCharged = delivery?.deliver_fee_charged ?? raw.deliver_fee_charged ?? null
  const courier = delivery?.courier || raw.courier || null
  const trackStatus = trackStatusOf(track)
  const items = itemsInfo(order)
  return {
    ordId: order.ordId,
    id: order.id,
    customer: order.customer,
    phone: order.custPhone || '—',
    address: delivery?.deliver_address || '—',
    items: items.count,
    itemLabel: items.label,
    avatar: initialsOf(order.customer),
    readyAt: timeOfDay(order.createdAt),
    createdAt: order.createdAt,
    completedAt: order.completedAt,
    // The LalaMove order number - never the customer's receipt QR code.
    ref: courier?.order_id || '—',
    eta: delivery?.deliver_date || raw.deliver_expect || null,
    trackStatus,
    statusLabel: order.rawStatus === 'IN TRANSIT' || trackStatus === 'TRANSIT' ? 'In transit' : 'Ready to ship',
    // Courier booking (POST /delivery/book|cancel): the LalaMove envelope,
    // the delivery fee the customer paid (null = still owed) and whether
    // LalaMove has keys yet (false = hand the parcel over by hand).
    courier,
    feeCharged,
    feePending: hasDelivery && feeCharged == null,
    lalamoveConfigured: delivery?.lalamove_configured,
    deliverId: delivery?.deliver_id ?? order.raw?.deliver_id ?? null,
  }
}

// ─── Avatar helper: the shared lava / ice default avatars ──────────────────
function Avatar({ initials, size = 'sm' }) {
  return <DefaultAvatar name={String(initials || '')} userId={initials} size={size === 'sm' ? 28 : 32} />
}

// ─── Dispatch Confirmation Modal ───────────────────────────────────────────
function DispatchConfirmModal({ order, onClose, onConfirm }) {
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Mark as handed to a rider?"
      subtitle={`${order?.customer} · ${order?.id}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} className="px-3.5">
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm} className="px-3.5">
            Mark In Transit
          </Button>
        </>
      }
    >
      <p className="text-sm text-gray-600 leading-relaxed">
        Use this only when the parcel was given to a rider without a LalaMove booking.
        The order moves to In Transit and the customer is told it is on the way.
      </p>
      <p className="field-hint truncate">Deliver to: {order?.address}</p>
    </Modal>
  )
}

// ─── Cancel Booking Confirmation Modal ─────────────────────────────────────
function CancelBookingConfirmModal({ order, onClose, onConfirm, busy }) {
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Cancel this courier booking?"
      subtitle={`${order?.customer} · ${order?.id}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} className="px-3.5">
            Keep booking
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy} className="px-3.5">
            Cancel booking
          </Button>
        </>
      }
    >
      <p className="text-sm text-gray-600 leading-relaxed">
        The LalaMove rider is released for this order. Fulfillment stays on Delivery — book
        the courier again once a new rider is needed.
      </p>
      <p className="field-hint truncate">Courier order: {order?.courier?.order_id || '—'}</p>
    </Modal>
  )
}

// ─── Tab: Overview ─────────────────────────────────────────────────────────
function OverviewTab({ kpis, queuePreview, transitPreview, onGoToQueue, onGoToTransit }) {
  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Ready for Dispatch', value: kpis.ready,  sub: 'orders waiting',   color: 'amber',   icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>) },
          { label: 'In Transit',         value: kpis.transit, sub: 'out for delivery',  color: 'blue',    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>) },
          { label: 'Delivered Today',    value: kpis.deliveredToday, sub: 'successful drops', color: 'emerald', icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="20 6 9 17 4 12"/></svg>) },
          { label: 'Failed / Returned',  value: kpis.issues, sub: 'need resolution',   color: 'rose',    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>) },
        ].map(({ label, value, sub, color, icon }) => (
          <div key={label} className="bg-white rounded-lg p-3 border border-slate-200 flex items-center gap-3">
            <div className={`w-8 h-8 rounded-md bg-${color}-50 border border-${color}-100 flex items-center justify-center text-${color}-600 shrink-0`}>
              {icon}
            </div>
            <div className="min-w-0">
              <p className="text-2xs font-bold tracking-wider uppercase text-slate-400 leading-tight">{label}</p>
              <h3 className="text-xl font-bold text-slate-900">{value}</h3>
              <p className="text-2xs text-slate-400">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Active Deliveries Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Dispatch Queue preview */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-sm font-bold text-slate-900">Ready for Dispatch</p>
            <button type="button" onClick={onGoToQueue} className="text-xs font-semibold text-brand-orange hover:underline cursor-pointer">View all →</button>
          </div>
          <div className="divide-y divide-slate-100">
            {queuePreview.map((o) => (
              <div key={o.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50/40 transition-colors">
                <Avatar initials={o.avatar} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-900">{o.customer}</p>
                  <p className="text-2xs text-slate-400 truncate">{o.address}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-2xs font-semibold text-slate-700">{o.items}</p>
                  <p className="text-2xs text-slate-400">{courierStateOf(o).label}</p>
                </div>
              </div>
            ))}
            {queuePreview.length === 0 && (
              <p className="px-4 py-3 text-2xs text-slate-400">No orders waiting for dispatch.</p>
            )}
          </div>
        </div>

        {/* In Transit preview */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-sm font-bold text-slate-900">In Transit</p>
            <button type="button" onClick={onGoToTransit} className="text-xs font-semibold text-brand-orange hover:underline cursor-pointer">View all →</button>
          </div>
          <div className="divide-y divide-slate-100">
            {transitPreview.map((o) => (
              <div key={o.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50/40 transition-colors">
                <Avatar initials={o.avatar} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-900">{o.customer}</p>
                  <p className="text-2xs text-slate-400 truncate">{o.address}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-2xs font-semibold border ${o.statusLabel === 'Nearby' ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60' : 'bg-blue-50 text-blue-700 border-blue-200/60'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${o.statusLabel === 'Nearby' ? 'bg-emerald-500' : 'bg-blue-500'}`} />
                    {o.statusLabel}
                  </span>
                  <p className="text-2xs text-slate-400 mt-0.5">ETA {etaLabel(o.eta)}</p>
                </div>
              </div>
            ))}
            {transitPreview.length === 0 && (
              <p className="px-4 py-3 text-2xs text-slate-400">No active deliveries right now.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Queue (Ready for Dispatch) ──────────────────────────────────────
function QueueTable({ rows, empty, actions, onOpenOrder }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/60 border-b border-slate-200 text-2xs font-bold uppercase tracking-wider text-slate-400">
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Order #</th>
              <th className="px-4 py-3">Delivery Address</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3">Delivery Fee</th>
              <th className="px-4 py-3">Courier</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((order) => {
              const state = courierStateOf(order)
              return (
                <tr key={order.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar initials={order.avatar} />
                      <div>
                        <p className="font-bold text-slate-900">{order.customer}</p>
                        <p className="text-2xs text-slate-400">{order.phone}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => onOpenOrder(order)}
                      className="font-extrabold text-slate-800 hover:underline cursor-pointer"
                    >
                      {order.id}
                    </button>
                    <p className="text-2xs text-slate-400 font-normal mt-0.5">Placed {order.readyAt}</p>
                  </td>
                  <td className="px-4 py-3 max-w-[180px]">
                    <p className="text-slate-700 font-medium truncate">{order.address}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-700">{order.items}</p>
                    <p className="text-2xs text-slate-400 mt-0.5 max-w-[140px] truncate">{order.itemLabel}</p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-2xs font-bold ${
                      order.feePending ? TONE_CLASSES.amber : TONE_CLASSES.emerald
                    }`}>
                      {order.feePending ? 'Not paid yet' : `${peso(order.feeCharged)} paid`}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-2xs font-semibold ${TONE_CLASSES[state.tone]}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                      {state.label}
                    </span>
                    {order.courier?.order_id && state.key === 'booked' && (
                      <p className="text-2xs text-slate-400 font-mono mt-0.5">{order.courier.order_id}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">{actions(order, state)}</div>
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">{empty}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const actionBtn =
  'h-7 px-2.5 inline-flex items-center rounded-md text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed'

function QueueTab({ queue, onDispatch, dispatching, onOpenOrder, onBook, onCancelBooking, bookingBusyId, notice }) {
  const ready = queue.filter((o) => !o.feePending)
  const waiting = queue.filter((o) => o.feePending)
  const busy = bookingBusyId != null

  const actions = (order, state) => {
    if (state.key === 'fee') {
      return <span className="text-2xs text-slate-400">Waiting on customer</span>
    }
    return (
      <>
        {state.key === 'booked' && order.courier?.share_url && (
          <a
            href={order.courier.share_url}
            target="_blank"
            rel="noreferrer"
            className={`${actionBtn} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}
          >
            Track
          </a>
        )}
        {state.key === 'booked' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onCancelBooking(order)}
            className={`${actionBtn} border border-slate-200 bg-white text-rose-600 hover:bg-rose-50`}
          >
            {bookingBusyId === order.id ? 'Cancelling…' : 'Cancel booking'}
          </button>
        )}
        {(state.key === 'failed' || state.key === 'unbooked') && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onBook(order)}
            className={`${actionBtn} bg-brand-orange text-white hover:bg-orange-600`}
          >
            {bookingBusyId === order.id ? 'Booking…' : state.key === 'failed' ? 'Book again' : 'Book courier'}
          </button>
        )}
        {state.key !== 'booked' && (
          <button
            type="button"
            disabled={dispatching === order.id}
            onClick={() => onDispatch(order)}
            className={`${actionBtn} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}
          >
            {dispatching === order.id ? 'Saving…' : 'Mark handed over'}
          </button>
        )}
      </>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 bg-amber-50 border border-amber-200/60 rounded-lg px-4 py-3">
        <p className="text-xs font-medium text-amber-800">
          A paid order gets a LalaMove rider by itself once it is marked Ready to Ship, and moves to
          In Transit when the rider picks it up. Book again here if a booking failed; use
          “Mark handed over” only for a hand-off without LalaMove.
        </p>
        <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 text-2xs font-bold border border-amber-200/60">
          {ready.length} ready
        </span>
      </div>

      {notice && (
        <div className="flex items-start gap-2.5 bg-sky-50 border border-sky-200 rounded-lg px-4 py-2.5 text-xs text-sky-900">
          <p className="font-medium min-w-0">{notice.text}</p>
          {notice.href && (
            <a href={notice.href} target="_blank" rel="noreferrer" className="shrink-0 font-bold text-brand-orange hover:underline">
              Open tracking link →
            </a>
          )}
        </div>
      )}

      <QueueTable rows={ready} empty="No orders waiting for dispatch." actions={actions} onOpenOrder={onOpenOrder} />

      {waiting.length > 0 && (
        <div className="space-y-2 pt-1">
          <div>
            <p className="text-sm font-bold text-slate-900">Waiting on the customer</p>
            <p className="text-2xs text-slate-400">
              Packed, but the customer has not paid the delivery fee yet. The courier is booked as soon as they do.
            </p>
          </div>
          <QueueTable rows={waiting} empty="" actions={actions} onOpenOrder={onOpenOrder} />
        </div>
      )}
    </div>
  )
}

// ─── Tab: In Transit ───────────────────────────────────────────────────────
function InTransitTab({ orders, onOpenOrder }) {
  return (
    <div className="space-y-3">
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-blue-500 shrink-0">
              <rect x="1" y="3" width="15" height="13"/>
              <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
              <circle cx="5.5" cy="18.5" r="2.5"/>
              <circle cx="18.5" cy="18.5" r="2.5"/>
            </svg>
            <p className="text-sm font-bold text-slate-900">In Transit</p>
          </div>
          <span className="text-2xs font-semibold text-slate-500">{orders.length} active deliveries</span>
        </div>
        <div className="divide-y divide-slate-100">
          {orders.map((order) => (
            <div key={order.id} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50/40 transition-colors">
              <Avatar initials={order.avatar} size="md" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs font-bold text-slate-900">{order.customer}</p>
                  <span className="text-2xs font-semibold text-slate-500">{order.id}</span>
                </div>
                <p className="text-2xs text-slate-400 mt-0.5 truncate">{order.address}</p>
              </div>
              {/* Allowed to shrink: a shrink-0 right rail overflowed the
                  overflow-hidden card and clipped long item lists. */}
              <div className="text-right space-y-0.5 max-w-[45%] min-w-0">
                <p className="text-2xs font-semibold text-slate-700 truncate">{order.items} · {order.itemLabel}</p>
                <div className="flex items-center justify-end gap-2">
                  <span className="text-2xs text-slate-400">Courier order: <span className="font-semibold text-slate-600">{order.ref}</span></span>
                  <span className="text-2xs text-slate-300">·</span>
                  <span className="text-2xs text-slate-400">ETA <span className="font-semibold text-slate-600">{etaLabel(order.eta)}</span></span>
                </div>
              </div>
              <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md text-2xs font-semibold border ${order.statusLabel === 'Nearby' ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60' : 'bg-blue-50 text-blue-700 border-blue-200/60'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${order.statusLabel === 'Nearby' ? 'bg-emerald-500' : 'bg-blue-500'}`} />
                {order.statusLabel}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                {order.courier?.share_url && (
                  <a
                    href={order.courier.share_url}
                    target="_blank"
                    rel="noreferrer"
                    className="h-7 px-2.5 inline-flex items-center border border-slate-200 bg-white hover:bg-slate-50 text-2xs font-semibold text-slate-700 rounded-md cursor-pointer"
                  >
                    Track
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => onOpenOrder(order)}
                  className="h-7 px-2.5 border border-slate-200 bg-white hover:bg-slate-50 text-2xs font-semibold text-slate-700 rounded-md cursor-pointer"
                >
                  View Order
                </button>
              </div>
            </div>
          ))}
          {orders.length === 0 && (
            <p className="px-4 py-6 text-center text-xs text-slate-400">
              No active deliveries right now.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Completed ────────────────────────────────────────────────────────
function CompletedTab({ orders, total }) {
  return (
    <div className="space-y-3">
      <div className="bg-white rounded-lg border border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5 text-emerald-600"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">Delivered</p>
            <p className="text-2xs text-slate-400">Successfully delivered orders.</p>
          </div>
        </div>
        <button type="button" className="h-8 px-3 rounded-md border border-slate-200 bg-white text-xs font-semibold text-slate-700 flex items-center gap-1.5 hover:bg-slate-50 cursor-pointer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <LiveDate />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 text-slate-400"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/60 border-b border-slate-200 text-2xs font-bold uppercase tracking-wider text-slate-400">
                <th className="px-4 py-3">Date &amp; Time</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Order #</th>
                <th className="px-4 py-3">Delivery Address</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3">Courier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3 text-slate-600 font-medium whitespace-nowrap">{dateTimeLabel(row.completedAt || row.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar initials={row.avatar} />
                      <div>
                        <p className="font-bold text-slate-900">{row.customer}</p>
                        <p className="text-2xs text-slate-400">{row.phone}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-extrabold text-slate-800">{row.id}</td>
                  <td className="px-4 py-3 max-w-[160px]">
                    <p className="text-slate-600 font-medium truncate">{row.address}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-700">{row.items}</p>
                    <p className="text-2xs text-slate-400 mt-0.5">{row.itemLabel}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-100 text-2xs font-semibold">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3"><polyline points="20 6 9 17 4 12"/></svg>
                      {row.ref}
                    </span>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    No delivered orders yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 border-t border-slate-100 text-2xs text-slate-400 font-medium">
          Showing {orders.length} of {total} delivered orders
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Issues ───────────────────────────────────────────────────────────
function IssuesTab({ issueOrders, onCancelBooking, onContact, bookingBusyId, notice }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 bg-rose-50 border border-rose-200/60 rounded-lg px-4 py-3">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-rose-600 shrink-0 mt-0.5">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p className="text-xs font-medium text-rose-800">
          Cancelled or returned deliveries. Refunds and returns are settled from Orders; a courier
          booking still live here should be cancelled.
        </p>
      </div>

      {/* Fulfillment Locking Notice */}
      <div className="flex items-start gap-2.5 bg-amber-50/90 border border-amber-200 rounded-lg px-4 py-2.5 text-xs text-amber-900">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-amber-700 shrink-0 mt-0.5">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <div>
          <span className="font-bold text-amber-950 block">Fulfillment Method Lock Principle</span>
          <p className="text-2xs text-amber-800 mt-0.5">
            Once delivery payment is received, fulfillment remains locked to Delivery. Staff must resolve forwarder issues without silently changing the customer's chosen modality.
          </p>
        </div>
      </div>

      {/* Booking outcome (POST /delivery/book | /delivery/cancel). A missing
          courier account is an instruction, never an error. */}
      {notice && (
        <div className="flex items-start gap-2.5 bg-sky-50 border border-sky-200 rounded-lg px-4 py-2.5 text-xs text-sky-900">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-sky-600 shrink-0 mt-0.5">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <div className="min-w-0">
            <p className="font-medium">{notice.text}</p>
            {notice.href && (
              <a
                href={notice.href}
                target="_blank"
                rel="noreferrer"
                className="inline-block mt-0.5 font-bold text-brand-orange hover:underline"
              >
                Open tracking link →
              </a>
            )}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/60 border-b border-slate-200 text-2xs font-bold uppercase tracking-wider text-slate-400">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Order #</th>
                <th className="px-4 py-3">Issue</th>
                <th className="px-4 py-3">Reason / Payment</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {issueOrders.map((row, i) => (
                <tr key={`${row.id}-${i}`} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3 text-slate-600 font-medium whitespace-nowrap">{row.date}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar initials={row.avatar} />
                      <div>
                        <p className="font-bold text-slate-900">{row.customer}</p>
                        <p className="text-2xs text-slate-400">{row.phone}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-extrabold text-slate-800">{row.id}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-2xs font-bold border ${
                      row.issue === 'Returned'
                        ? 'bg-amber-50 text-amber-700 border-amber-200/60'
                        : 'bg-rose-50 text-rose-700 border-rose-200/60'
                    }`}>
                      {row.issue === 'Returned' ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                      )}
                      {row.issue}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 max-w-[220px]">
                    <p className="font-bold text-slate-900 leading-tight">{row.reason}</p>
                    {Number(row.feeCharged) > 0 && (
                      <p className="text-2xs text-slate-500 font-semibold mt-0.5">
                        Delivery fee paid: {peso(row.feeCharged)}
                      </p>
                    )}
                    {row.courier?.order_id && (
                      <p className="text-2xs text-slate-400 font-mono truncate mt-0.5">
                        Courier order: {row.courier.order_id}
                      </p>
                    )}
                    {row.courier?.share_url && (
                      <a
                        href={row.courier.share_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block text-2xs font-bold text-brand-orange hover:underline mt-0.5"
                      >
                        Track courier →
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-end gap-1.5">
                      <div className="flex items-center justify-end gap-2">
                        {row.courier?.booked && (
                          <button
                            type="button"
                            disabled={bookingBusyId != null}
                            onClick={() => onCancelBooking(row)}
                            className="h-8 px-3 border border-rose-200 bg-white hover:bg-rose-50 text-rose-600 text-xs font-bold rounded-md transition-colors cursor-pointer disabled:opacity-60"
                          >
                            {bookingBusyId === row.id ? 'Cancelling…' : 'Cancel booking'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onContact(row)}
                          className="h-8 px-3 border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 rounded-md cursor-pointer"
                        >
                          Contact
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
              {issueOrders.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    No delivery issues — all deliveries are on track.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 border-t border-slate-100 text-2xs text-slate-400 font-medium">
          Showing {issueOrders.length} of {issueOrders.length} issue orders
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────
const TABS = ['Overview', 'Queue', 'In Transit', 'Completed', 'Issues']

export default function AdminDelivery() {
  const { orders: rawOrders = [], refreshOrders } = useAdmin()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('Overview')
  const [confirmOrder, setConfirmOrder] = useState(null)
  const [dispatchingId, setDispatchingId] = useState(null)
  // Courier booking (POST /delivery/book | /delivery/cancel).
  const [bookingBusyId, setBookingBusyId] = useState(null) // row id in flight
  const [cancelTarget, setCancelTarget] = useState(null) // row awaiting confirm
  const [bookingNotice, setBookingNotice] = useState(null) // { text, href }
  const [toast, setToast] = useState('')

  // ordId -> { delivery, parcel } | null (null = no delivery track on file).
  // An absent key means the track has not been probed yet.
  const [tracks, setTracks] = useState({})

  const orders = useMemo(() => mapOrderRows(rawOrders), [rawOrders])
  const activeOrders = useMemo(
    () => orders.filter((o) => ACTIVE_STATUSES.has(o.rawStatus)),
    [orders]
  )
  const activeIds = useMemo(() => activeOrders.map((o) => o.ordId), [activeOrders])
  const historyKey = useMemo(
    () =>
      orders
        .filter((o) => HISTORY_STATUSES.has(o.rawStatus))
        .map((o) => o.ordId)
        .join(','),
    [orders]
  )

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  // Probe delivery tracks (GET via POST /tracking/create). setState only runs
  // inside the promise callback, never synchronously in an effect body.
  const probe = useCallback((ids) => {
    if (!Array.isArray(ids) || ids.length === 0) return
    Promise.all(
      ids.map((id) =>
        getTrack(id, 'delivery')
          .then((res) => [id, { delivery: res?.data?.delivery || null, parcel: res?.data?.parcel || null }])
          // 404 (no parcel) or a transient failure: record "no confirmed track".
          .catch(() => [id, null])
      )
    ).then((pairs) => {
      setTracks((prev) => {
        const next = { ...prev }
        for (const [id, entry] of pairs) next[id] = entry
        return next
      })
    })
  }, [])

  // Mount refresh; AdminContext owns the single 30s orders poll.
  useEffect(() => {
    refreshOrders()
  }, [refreshOrders])

  // Active tracks are re-probed whenever the shared order list refreshes.
  useEffect(() => {
    probe(activeIds)
  }, [probe, activeIds])

  // Completed/Issues history is re-probed when its membership changes.
  useEffect(() => {
    probe(historyKey ? historyKey.split(',').map(Number) : [])
  }, [probe, historyKey])

  // ── Derived queues ──
  const queue = useMemo(
    () =>
      activeOrders
        .filter((o) => {
          if (o.rawStatus === 'READY TO SHIP') return true
          if (o.rawStatus === 'IN TRANSIT') return false
          const track = tracks[o.ordId]
          if (track === undefined) return false // probe still pending
          if (track === null) return true // no delivery track -> not confirmed TRANSIT
          return trackStatusOf(track) !== 'TRANSIT'
        })
        .map((o) => enrichDelivery(o, tracks[o.ordId])),
    [activeOrders, tracks]
  )

  const transit = useMemo(
    () =>
      activeOrders
        .filter((o) => {
          if (o.rawStatus === 'IN TRANSIT') return true
          if (o.rawStatus === 'READY TO SHIP') return false
          const track = tracks[o.ordId]
          return Boolean(track) && trackStatusOf(track) === 'TRANSIT'
        })
        .map((o) => enrichDelivery(o, tracks[o.ordId])),
    [activeOrders, tracks]
  )

  const completed = useMemo(
    () =>
      orders
        .filter((o) => (o.rawStatus === 'CLAIMED' || o.rawStatus === 'RECEIVED') && Boolean(tracks[o.ordId]))
        .map((o) => enrichDelivery(o, tracks[o.ordId])),
    [orders, tracks]
  )

  const issues = useMemo(
    () =>
      orders
        .filter(
          (o) =>
            (o.rawStatus === 'RETURNED' || o.rawStatus === 'CANCELLED') &&
            Boolean(tracks[o.ordId])
        )
        .map((o) => ({
          ...enrichDelivery(o, tracks[o.ordId]),
          date: dateLabel(o.completedAt || o.createdAt),
          issue: o.rawStatus === 'CANCELLED' ? 'Cancelled' : 'Returned',
          reason: ISSUE_REASONS[o.rawStatus] || 'Delivery needs resolution.',
        })),
    [orders, tracks]
  )

  const kpis = useMemo(() => {
    const now = new Date()
    const isToday = (value) => {
      const d = parseDate(value)
      return Boolean(d) && d.toDateString() === now.toDateString()
    }
    return {
      ready: queue.filter((r) => !r.feePending).length,
      transit: transit.length,
      deliveredToday: completed.filter(
        (r) => isToday(r.completedAt) || isToday(r.createdAt)
      ).length,
      issues: issues.length,
    }
  }, [queue, transit, completed, issues])

  // ── Actions ──
  // Order # / View Order open the order detail on the Orders page.
  const handleOpenOrder = (order) => {
    if (order?.ordId != null) navigate(`/admin/orders?orderId=${order.ordId}`)
  }

  // Dispatch click asks for confirmation first, then advances the delivery
  // track to TRANSIT (PUT /tracking/update, track_id = deliver_id).
  const handleDispatchClick = (order) => setConfirmOrder(order)

  const handleConfirmDispatch = async () => {
    const order = confirmOrder
    if (!order) return
    setConfirmOrder(null)
    setDispatchingId(order.id)
    try {
      const res = await getTrack(order.ordId, 'delivery')
      const delivery = res?.data?.delivery
      if (!delivery?.deliver_id) {
        throw new Error(res?.message || 'No delivery/parcel record found for this order')
      }
      await updateTrack(delivery.deliver_id, 'delivery', 'TRANSIT')
      showToast(`${order.id} marked In Transit.`)
      probe([order.ordId])
      refreshOrders()
    } catch (e) {
      showToast(e?.message || `Could not dispatch ${order.id}.`)
    } finally {
      setDispatchingId(null)
    }
  }

  // Courier booking: `ord_id` is canonical, a bare `deliver_id` only travels
  // when the row has no order reference at all.
  const bookingPayloadOf = (row) =>
    row.ordId != null
      ? { ord_id: row.ordId }
      : row.deliverId != null
      ? { deliver_id: row.deliverId }
      : null

  /**
   * POST /delivery/book {ord_id} - (re)book the courier for a paid delivery.
   * A 503 only means LalaMove has no keys yet: the parcel still goes out, so
   * that answer is shown as a calm instruction (not a raw error) and the
   * button stays disabled while `lalamove_configured` is false.
   */
  const handleRetryBooking = async (row) => {
    if (bookingBusyId) return
    const payload = bookingPayloadOf(row)
    if (!payload) {
      showToast(`${row.id}: no order reference found for this delivery.`)
      return
    }
    if (row.lalamoveConfigured === false) {
      setBookingNotice({
        text: 'LalaMove is not configured yet — book the courier by hand and pass the parcel straight to the rider. The order stays on Delivery.',
        href: null,
      })
      return
    }

    setBookingBusyId(row.id)
    setBookingNotice(null)
    try {
      const res = await bookDelivery(payload)
      const data = res?.data || null
      const courier = data?.delivery?.courier || null
      if (data?.booked === true) {
        showToast(`${row.id} booked with the courier.`)
        setBookingNotice({
          text: `${row.id} booked — courier order ${data.order_id || courier?.order_id || '—'}.`,
          href: courier?.share_url || row.courier?.share_url || null,
        })
      } else {
        setBookingNotice({
          text: res?.message || `${row.id}: there is nothing to book right now.`,
          href: null,
        })
      }
      if (row.ordId != null) probe([row.ordId])
      refreshOrders()
    } catch (err) {
      if (err?.status === 503) {
        setBookingNotice({
          text: 'LalaMove is not configured yet — book the courier by hand and pass the parcel straight to the rider. You can retry the booking once the courier account is added.',
          href: null,
        })
      } else {
        showToast(err?.message || `Could not book the courier for ${row.id}.`)
      }
    } finally {
      setBookingBusyId(null)
    }
  }

  /** POST /delivery/cancel {ord_id} - releases the LalaMove rider booked. */
  const handleCancelBooking = async () => {
    const row = cancelTarget
    setCancelTarget(null)
    if (!row || bookingBusyId) return
    const payload = bookingPayloadOf(row)
    if (!payload) {
      showToast(`${row.id}: no order reference found for this delivery.`)
      return
    }

    setBookingBusyId(row.id)
    try {
      const res = await cancelDelivery(payload)
      showToast(res?.message || `Courier booking for ${row.id} cancelled.`)
      if (row.ordId != null) probe([row.ordId])
      refreshOrders()
    } catch (err) {
      if (err?.status === 503) {
        setBookingNotice({
          text: 'LalaMove is not configured yet — there is no courier booking to release.',
          href: null,
        })
      } else {
        showToast(err?.message || `Could not cancel the courier booking for ${row.id}.`)
      }
    } finally {
      setBookingBusyId(null)
    }
  }

  const handleContact = (row) => {
    showToast(`Contact ${row.customer}${row.phone && row.phone !== '—' ? ` · ${row.phone}` : ''}`)
  }

  const TAB_ICONS = {
    'Overview':    (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>),
    'Queue':       (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>),
    'In Transit':  (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>),
    'Completed':   (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><polyline points="20 6 9 17 4 12"/></svg>),
    'Issues':      (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>),
  }

  const TAB_COUNTS = { 'Overview': null, 'Queue': queue.length, 'In Transit': transit.length, 'Completed': completed.length, 'Issues': issues.length }

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

        {/* Dispatch Confirmation */}
        {confirmOrder && (
          <DispatchConfirmModal
            order={confirmOrder}
            onClose={() => setConfirmOrder(null)}
            onConfirm={handleConfirmDispatch}
          />
        )}

        {/* Cancel courier booking confirmation */}
        {cancelTarget && (
          <CancelBookingConfirmModal
            order={cancelTarget}
            busy={bookingBusyId != null}
            onClose={() => setCancelTarget(null)}
            onConfirm={handleCancelBooking}
          />
        )}

        {/* ── Page Header ── */}
        <div className="pb-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-2xs text-slate-400 font-medium mb-2">
            <span>Fulfillment</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <button type="button" onClick={() => setActiveTab('Overview')} className="hover:text-slate-600 transition-colors cursor-pointer">Delivery</button>
            {activeTab !== 'Overview' && (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                <span className="text-slate-600 font-semibold">{activeTab}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-orange flex items-center justify-center text-white shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <rect x="1" y="3" width="15" height="13"/>
                <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
                <circle cx="5.5" cy="18.5" r="2.5"/>
                <circle cx="18.5" cy="18.5" r="2.5"/>
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight leading-tight">Delivery</h1>
              <p className="text-xs text-slate-500 font-normal">
                Manage courier dispatches, track active deliveries, and resolve issues.
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
                <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-2xs font-bold
                  ${activeTab === tab ? 'bg-orange-100 text-brand-orange' : 'bg-slate-100 text-slate-500'}`}>
                  {TAB_COUNTS[tab]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Tab Content ── */}
        <div className="flex-1 overflow-y-auto pb-6 scrollbar-none">
          {activeTab === 'Overview'   && (
            <OverviewTab
              kpis={kpis}
              queuePreview={queue.filter((r) => !r.feePending).slice(0, 3)}
              transitPreview={transit.slice(0, 3)}
              onGoToQueue={() => setActiveTab('Queue')}
              onGoToTransit={() => setActiveTab('In Transit')}
            />
          )}
          {activeTab === 'Queue'      && (
            <QueueTab
              queue={queue}
              onDispatch={handleDispatchClick}
              dispatching={dispatchingId}
              onOpenOrder={handleOpenOrder}
              onBook={handleRetryBooking}
              onCancelBooking={(row) => setCancelTarget(row)}
              bookingBusyId={bookingBusyId}
              notice={bookingNotice}
            />
          )}
          {activeTab === 'In Transit' && <InTransitTab orders={transit} onOpenOrder={handleOpenOrder} />}
          {activeTab === 'Completed'  && <CompletedTab orders={completed} total={completed.length} />}
          {activeTab === 'Issues'     && (
            <IssuesTab
              issueOrders={issues}
              onCancelBooking={(row) => setCancelTarget(row)}
              onContact={handleContact}
              bookingBusyId={bookingBusyId}
              notice={bookingNotice}
            />
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
