import { useState, useMemo, useEffect, useCallback } from 'react'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import { useAdmin } from '../../hooks/useAdmin.js'
import { getTrack, updateTrack } from '../../services/tracking.js'
import { mapOrderRows, parseDate } from '../../services/dashboard.js'

// ─── Delivery Workflow (live data) ────────────────────────────────────────
// Queue      = "TO RECEIVE" orders whose delivery track is not confirmed TRANSIT.
// In Transit = "TO RECEIVE" orders whose delivery track is TRANSIT.
// Completed  = "CLAIMED" orders that own a delivery/parcel track.
// Issues     = "RETURNED" / "CANCELLED" orders that own a delivery track.
// Dispatch   = PUT /tracking/update {track_id: deliver_id, status: TRANSIT}.
// Close      = PUT /tracking/close {track_id: parcel_id} (marks DELIVERED).

const REFRESH_MS = 30000 // REQ-SD-02: keep the delivery queues fresh
const HISTORY_STATUSES = new Set(['CLAIMED', 'RETURNED', 'CANCELLED'])
const TODAY_LABEL = new Date().toLocaleDateString('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
})

const ISSUE_REASONS = {
  CANCELLED: 'Delivery booking was cancelled.',
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

/**
 * Fee Status pill copy from the parcel payment (pay_due already includes the
 * dispatch fee: total_due = subtotal + dispatch fee, CheckoutAPI).
 */
function feeLabel(payment) {
  if (!payment) return '—'
  const due = Number(payment.pay_due) || 0
  const given = Number(payment.pay_given) || 0
  if (due <= 0) return '—'
  return given >= due ? `₱${due} Paid` : `₱${due} Due`
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

const trackStatusOf = (track) =>
  String(track?.delivery?.deliver_status || '').trim().toUpperCase()

/** Merge a mapped order row with its probed delivery/parcel track. */
function enrichDelivery(order, track) {
  const delivery = track?.delivery || null
  const parcel = track?.parcel || null
  const payment = parcel?.payment || null
  const trackStatus = trackStatusOf(track)
  const items = itemsInfo(order)
  const fee = feeLabel(payment)
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
    ref: delivery?.delvier_ref || '—',
    eta: delivery?.deliver_date || null,
    trackStatus,
    statusLabel: trackStatus === 'TRANSIT' ? 'On the way' : 'Ready',
    fee,
    deliveryPayment: fee.endsWith('Paid') ? fee : null,
  }
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

// ─── Dispatch Confirmation Modal ───────────────────────────────────────────
function DispatchConfirmModal({ order, onClose, onConfirm }) {
  return (
    <div className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-md flex items-center justify-center px-4 animate-fade-in">
      <div className="bg-white rounded-xl border border-slate-200 w-full max-w-sm animate-scale-in overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Dispatch this order?</h3>
            <p className="text-xs text-slate-500 mt-0.5">{order?.customer} · {order?.id}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            The delivery track moves to In Transit so the order leaves the dispatch queue.
            The courier booking reference stays attached to the tracking record.
          </p>
          <p className="text-[11px] text-slate-400 mt-2 truncate">Deliver to: {order?.address}</p>
        </div>
        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50/40">
          <button type="button" onClick={onClose} className="h-8 px-3 rounded-md border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer">Cancel</button>
          <button type="button" onClick={onConfirm} className="h-8 px-4 rounded-md text-xs font-bold bg-brand-orange hover:bg-orange-600 text-white transition-colors cursor-pointer">
            Confirm dispatch
          </button>
        </div>
      </div>
    </div>
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
              <p className="text-[10px] font-bold tracking-wider uppercase text-slate-400 leading-tight">{label}</p>
              <h3 className="text-xl font-bold text-slate-900">{value}</h3>
              <p className="text-[10px] text-slate-400">{sub}</p>
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
                  <p className="text-[10px] text-slate-400 truncate">{o.address}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[11px] font-semibold text-slate-700">{o.items}</p>
                  <p className="text-[10px] text-slate-400">Ready {o.readyAt}</p>
                </div>
              </div>
            ))}
            {queuePreview.length === 0 && (
              <p className="px-4 py-3 text-[11px] text-slate-400">No orders waiting for dispatch.</p>
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
                  <p className="text-[10px] text-slate-400 truncate">{o.address}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${o.statusLabel === 'Nearby' ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60' : 'bg-blue-50 text-blue-700 border-blue-200/60'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${o.statusLabel === 'Nearby' ? 'bg-emerald-500' : 'bg-blue-500'}`} />
                    {o.statusLabel}
                  </span>
                  <p className="text-[10px] text-slate-400 mt-0.5">ETA {etaLabel(o.eta)}</p>
                </div>
              </div>
            ))}
            {transitPreview.length === 0 && (
              <p className="px-4 py-3 text-[11px] text-slate-400">No active deliveries right now.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Queue (Ready for Dispatch) ──────────────────────────────────────
function QueueTab({ queue, onDispatch, dispatching, onOpenOrder }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 bg-amber-50 border border-amber-200/60 rounded-lg px-4 py-3">
        <div className="flex items-start gap-2.5">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-amber-600 shrink-0 mt-0.5">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
          </svg>
          <p className="text-xs font-medium text-amber-800">
            These orders are packed and ready for courier dispatch. Dispatch to begin third-party courier delivery.
          </p>
        </div>
        <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 text-[11px] font-bold border border-amber-200/60">
          {queue.length} orders
        </span>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/60 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Order #</th>
                <th className="px-4 py-3">Delivery Address</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3">Fee Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {queue.map((order) => (
                <tr
                  key={order.id}
                  onClick={() => onOpenOrder(order)}
                  className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar initials={order.avatar} />
                      <div>
                        <p className="font-bold text-slate-900">{order.customer}</p>
                        <p className="text-[10px] text-slate-400">{order.phone}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onOpenOrder(order) }}
                      className="font-extrabold text-slate-800 hover:underline cursor-pointer"
                    >
                      {order.id}
                    </button>
                    <p className="text-[10px] text-slate-400 font-normal mt-0.5">Ready at {order.readyAt}</p>
                  </td>
                  <td className="px-4 py-3 max-w-[180px]">
                    <p className="text-slate-700 font-medium truncate">{order.address}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-700">{order.items}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5 max-w-[140px] truncate">{order.itemLabel}</p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
                      {order.fee}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end">
                      <button
                        type="button"
                        disabled={dispatching === order.id}
                        onClick={(e) => { e.stopPropagation(); onDispatch(order) }}
                        className="h-8 px-3 bg-brand-orange hover:bg-orange-600 disabled:opacity-70 disabled:cursor-wait text-white text-xs font-bold rounded-md transition-colors cursor-pointer"
                      >
                        {dispatching === order.id ? 'Dispatching' : 'Dispatch'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {queue.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    No orders waiting for dispatch.
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
          <span className="text-[11px] font-semibold text-slate-500">{orders.length} active deliveries</span>
        </div>
        <div className="divide-y divide-slate-100">
          {orders.map((order) => (
            <div key={order.id} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50/40 transition-colors">
              <Avatar initials={order.avatar} size="md" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs font-bold text-slate-900">{order.customer}</p>
                  <span className="text-[10px] font-semibold text-slate-500">{order.id}</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5 truncate">{order.address}</p>
              </div>
              <div className="shrink-0 text-right space-y-0.5">
                <p className="text-[11px] font-semibold text-slate-700">{order.items} · {order.itemLabel}</p>
                <div className="flex items-center justify-end gap-2">
                  <span className="text-[10px] text-slate-400">Courier ref: <span className="font-semibold text-slate-600">{order.ref}</span></span>
                  <span className="text-[10px] text-slate-300">·</span>
                  <span className="text-[10px] text-slate-400">ETA <span className="font-semibold text-slate-600">{etaLabel(order.eta)}</span></span>
                </div>
              </div>
              <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold border ${order.statusLabel === 'Nearby' ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60' : 'bg-blue-50 text-blue-700 border-blue-200/60'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${order.statusLabel === 'Nearby' ? 'bg-emerald-500' : 'bg-blue-500'}`} />
                {order.statusLabel}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onOpenOrder(order)}
                  className="h-7 px-2.5 border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 rounded-md cursor-pointer"
                >
                  View Order
                </button>
                <button type="button" className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-400 hover:text-slate-700 hover:bg-slate-50 cursor-pointer text-sm font-bold">⋯</button>
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
            <p className="text-[10px] text-slate-400">Successfully delivered orders.</p>
          </div>
        </div>
        <button type="button" className="h-8 px-3 rounded-md border border-slate-200 bg-white text-xs font-semibold text-slate-700 flex items-center gap-1.5 hover:bg-slate-50 cursor-pointer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
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
                        <p className="text-[10px] text-slate-400">{row.phone}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-extrabold text-slate-800">{row.id}</td>
                  <td className="px-4 py-3 max-w-[160px]">
                    <p className="text-slate-600 font-medium truncate">{row.address}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-700">{row.items}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{row.itemLabel}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-100 text-[11px] font-semibold">
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
        <div className="px-4 py-2.5 border-t border-slate-100 text-[11px] text-slate-400 font-medium">
          Showing {orders.length} of {total} delivered orders
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Issues ───────────────────────────────────────────────────────────
function IssuesTab({ issueOrders, onRetryBooking, onContact }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 bg-rose-50 border border-rose-200/60 rounded-lg px-4 py-3">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-rose-600 shrink-0 mt-0.5">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p className="text-xs font-medium text-rose-800">
          These deliveries encountered issues. Resolve them through the freight forwarder or contact the customer.
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
          <p className="text-[11px] text-amber-800 mt-0.5">
            Once delivery payment is received, fulfillment remains locked to Delivery. Staff must resolve forwarder issues without silently changing the customer's chosen modality.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/60 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-400">
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
                        <p className="text-[10px] text-slate-400">{row.phone}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-extrabold text-slate-800">{row.id}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                      row.issue === 'Booking Failed'
                        ? 'bg-rose-100 text-rose-800 border-rose-300'
                        : row.issue === 'Returned'
                        ? 'bg-amber-50 text-amber-700 border-amber-200/60'
                        : 'bg-rose-50 text-rose-700 border-rose-200/60'
                    }`}>
                      {row.issue === 'Booking Failed' ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      ) : row.issue === 'Returned' ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                      )}
                      {row.issue}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 max-w-[220px]">
                    <p className="font-bold text-slate-900 leading-tight">{row.reason}</p>
                    {row.deliveryPayment ? (
                      <p className="text-[11px] text-emerald-600 font-bold mt-0.5">
                        Delivery payment: {row.deliveryPayment}
                      </p>
                    ) : (
                      <p className="text-[10px] text-slate-400 mt-0.5">Courier ref: {row.ref}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {row.issue === 'Booking Failed' ? (
                        <button
                          type="button"
                          onClick={() => onRetryBooking(row)}
                          className="h-8 px-3 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-md transition-colors cursor-pointer shadow-2xs flex items-center gap-1.5"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                            <path d="M23 4v6h-6" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                          </svg>
                          Retry Booking
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onRetryBooking(row)}
                          className="h-8 px-3 bg-brand-orange hover:bg-orange-600 text-white text-xs font-bold rounded-md transition-colors cursor-pointer"
                        >
                          Retry Delivery
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onContact(row)}
                        className="h-8 px-3 border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 rounded-md cursor-pointer"
                      >
                        Contact
                      </button>
                      <button type="button" className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-400 hover:text-slate-700 hover:bg-slate-50 cursor-pointer text-sm font-bold">⋯</button>
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
        <div className="px-4 py-2.5 border-t border-slate-100 text-[11px] text-slate-400 font-medium">
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
  const [activeTab, setActiveTab] = useState('Overview')
  const [confirmOrder, setConfirmOrder] = useState(null)
  const [dispatchingId, setDispatchingId] = useState(null)
  const [toast, setToast] = useState('')

  // ordId -> { delivery, parcel } | null (null = no delivery track on file).
  // An absent key means the track has not been probed yet.
  const [tracks, setTracks] = useState({})

  const orders = useMemo(() => mapOrderRows(rawOrders), [rawOrders])
  const activeOrders = useMemo(
    () => orders.filter((o) => o.rawStatus === 'TO RECEIVE'),
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

  // Keep the order list fresh on mount and every 30s (REQ-SD-02).
  useEffect(() => {
    refreshOrders()
    const timer = setInterval(refreshOrders, REFRESH_MS)
    return () => clearInterval(timer)
  }, [refreshOrders])

  // Active tracks are re-probed whenever the order list refreshes (30s).
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
          const track = tracks[o.ordId]
          return Boolean(track) && trackStatusOf(track) === 'TRANSIT'
        })
        .map((o) => enrichDelivery(o, tracks[o.ordId])),
    [activeOrders, tracks]
  )

  const completed = useMemo(
    () =>
      orders
        .filter((o) => o.rawStatus === 'CLAIMED' && Boolean(tracks[o.ordId]))
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
          issue: o.rawStatus === 'CANCELLED' ? 'Booking Failed' : 'Returned',
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
      ready: queue.length,
      transit: transit.length,
      deliveredToday: completed.filter(
        (r) => isToday(r.completedAt) || isToday(r.createdAt)
      ).length,
      issues: issues.length,
    }
  }, [queue, transit, completed, issues])

  // ── Actions ──
  // Order # / row click opens the order detail (toast placeholder until a detail drawer exists)
  const handleOpenOrder = (order) => showToast(order ? `Opening order ${order.id}` : 'Select an order first')

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
      showToast(`${order.id} dispatched — courier ref ${delivery.delvier_ref || '—'}`)
      probe([order.ordId])
      refreshOrders()
    } catch (e) {
      showToast(e?.message || `Could not dispatch ${order.id}.`)
    } finally {
      setDispatchingId(null)
    }
  }

  // No third-party courier API exists yet: retry acknowledges and keeps the
  // order on its Delivery fulfillment (lock principle above).
  const handleRetryBooking = (row) => {
    showToast(`${row.id}: no third-party courier API is connected — retry is unavailable. Fulfillment remains Delivery.`)
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

        {/* ── Page Header ── */}
        <div className="pb-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium mb-2">
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
                <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold
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
              queuePreview={queue.slice(0, 3)}
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
            />
          )}
          {activeTab === 'In Transit' && <InTransitTab orders={transit} onOpenOrder={handleOpenOrder} />}
          {activeTab === 'Completed'  && <CompletedTab orders={completed} total={completed.length} />}
          {activeTab === 'Issues'     && <IssuesTab     issueOrders={issues} onRetryBooking={handleRetryBooking} onContact={handleContact} />}
        </div>
      </div>
    </AdminLayout>
  )
}
