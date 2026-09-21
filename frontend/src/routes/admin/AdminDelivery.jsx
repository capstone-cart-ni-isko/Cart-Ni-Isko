import React, { useState } from 'react'
import AdminLayout from '../../components/admin/AdminLayout.jsx'

// ─── Delivery Workflow ─────────────────────────────────────────────────────
// Order Preparing → Ready for Dispatch → Dispatched → In Transit → Delivered
//                                                              ↘ Failed / Returned

// ─── Sample Data ──────────────────────────────────────────────────────────

const DISPATCH_QUEUE = [
  {
    id: '#ORD-9101', customer: 'Bianca Reyes',    phone: '0917-211-3344',
    address: 'Blk 3 Lot 5, Maharlika St., Quezon City', items: '2 items',
    itemLabel: 'BU Varsity Jacket · BU Cap', readyAt: '8:45 AM', avatar: 'BR',
    courier: null,
  },
  {
    id: '#ORD-9104', customer: 'Carlo Mendoza',   phone: '0918-442-5510',
    address: '23 Mabini St., Makati City', items: '1 item',
    itemLabel: 'Tatak BUENO Hoodie', readyAt: '9:10 AM', avatar: 'CM',
    courier: null,
  },
  {
    id: '#ORD-9108', customer: 'Denise Aguilar',  phone: '0916-338-7721',
    address: '88 Rizal Ave., Manila', items: '3 items',
    itemLabel: 'BU Polo Shirt · BU Tote Bag · BU Lanyard Set', readyAt: '9:55 AM', avatar: 'DA',
    courier: null,
  },
  {
    id: '#ORD-9112', customer: 'Edwin Santos',    phone: '0920-554-9901',
    address: '14 Luna St., Pasig City', items: '1 item',
    itemLabel: 'BU Labels 2025 Hoodie', readyAt: '10:20 AM', avatar: 'ES',
    courier: null,
  },
  {
    id: '#ORD-9115', customer: 'Faye Villanueva', phone: '0915-667-0023',
    address: '7 Kalaw St., Ermita, Manila', items: '2 items',
    itemLabel: 'BU Polo Shirt · BU Cap', readyAt: '10:40 AM', avatar: 'FV',
    courier: null,
  },
]

const IN_TRANSIT_ORDERS = [
  {
    id: '#ORD-9088', customer: 'Grace Tan',     phone: '0917-100-2233',
    address: '45 Del Pilar St., Mandaluyong', items: '1 item', itemLabel: 'BU Hoodie',
    courier: 'Jun M.', dispatchedAt: '8:30 AM', eta: '10:00 AM', avatar: 'GT',
    statusLabel: 'On the way',
  },
  {
    id: '#ORD-9091', customer: 'Harold Lim',    phone: '0918-223-4456',
    address: '12 Shaw Blvd., Pasig City', items: '2 items', itemLabel: 'BU Varsity Jacket · BU Lanyard',
    courier: 'Ana P.', dispatchedAt: '8:50 AM', eta: '10:30 AM', avatar: 'HL',
    statusLabel: 'On the way',
  },
  {
    id: '#ORD-9095', customer: 'Iris Navarro',  phone: '0916-335-5578',
    address: '77 P. Burgos St., Makati', items: '1 item', itemLabel: 'Tatak BUENO Shirt',
    courier: 'Carlo D.', dispatchedAt: '9:15 AM', eta: '11:00 AM', avatar: 'IN',
    statusLabel: 'Nearby',
  },
  {
    id: '#ORD-9097', customer: 'Jake Flores',   phone: '0920-441-6690',
    address: '3 España Blvd., Sampaloc, Manila', items: '3 items', itemLabel: 'BU Polo · BU Cap · BU Tote Bag',
    courier: 'Bea S.', dispatchedAt: '9:30 AM', eta: '11:30 AM', avatar: 'JF',
    statusLabel: 'On the way',
  },
]

const DELIVERED_ORDERS = [
  { datetime: 'May 22, 2026 · 9:48 AM',  id: '#ORD-9060', customer: 'Karen Castillo', phone: '0917-110-2244', address: '34 Taft Ave., Manila',               items: '1 item',  itemLabel: 'BU Hoodie',                          courier: 'Jun M.', avatar: 'KC' },
  { datetime: 'May 22, 2026 · 10:05 AM', id: '#ORD-9063', customer: 'Leo Garcia',     phone: '0918-220-5567', address: '88 EDSA, Mandaluyong',                items: '2 items', itemLabel: 'BU Varsity Jacket · BU Lanyard Set', courier: 'Ana P.', avatar: 'LG' },
  { datetime: 'May 22, 2026 · 10:33 AM', id: '#ORD-9067', customer: 'Mia Ramos',      phone: '0916-330-6678', address: '12 Ayala Ave., Makati',               items: '1 item',  itemLabel: 'Tatak BUENO Shirt',                  courier: 'Carlo D.', avatar: 'MR' },
  { datetime: 'May 22, 2026 · 11:00 AM', id: '#ORD-9072', customer: 'Noel Cruz',      phone: '0920-442-7789', address: '5 Ortigas Ave., Pasig',               items: '2 items', itemLabel: 'BU Polo Shirt · BU Cap',             courier: 'Bea S.', avatar: 'NC' },
  { datetime: 'May 22, 2026 · 11:22 AM', id: '#ORD-9075', customer: 'Olive Dela Cruz',phone: '0915-554-8890', address: '21 Commonwealth Ave., Quezon City', items: '1 item',  itemLabel: 'BU Labels 2025 Hoodie',              courier: 'Jun M.', avatar: 'OD' },
]

const ISSUE_ORDERS = [
  {
    id: '#ORD-10294', customer: 'Patricia Gomez', phone: '0917-889-1029',
    address: '15 Rizal St., Daraga, Albay', items: '1 item', itemLabel: 'BU Varsity Jacket',
    issue: 'Booking Failed', reason: 'Lalamove was unable to create the delivery booking.',
    deliveryPayment: '₱280 Paid', courier: 'Unassigned', avatar: 'PR', date: 'Today',
  },
  {
    id: '#ORD-9044', customer: 'Paolo Ramos',    phone: '0917-001-1122',
    address: '7 Quirino Ave., Paco, Manila', items: '1 item', itemLabel: 'BU Hoodie',
    issue: 'Failed Delivery', reason: 'No one home at delivery address', courier: 'Jun M.', avatar: 'PR', date: 'May 21, 2026',
  },
  {
    id: '#ORD-9047', customer: 'Queenie Lopez',  phone: '0918-112-2233',
    address: '88 España Blvd., Sampaloc', items: '2 items', itemLabel: 'BU Varsity Jacket · BU Cap',
    issue: 'Returned', reason: 'Customer refused delivery', courier: 'Ana P.', avatar: 'QL', date: 'May 21, 2026',
  },
  {
    id: '#ORD-9051', customer: 'Rommel Tan',     phone: '0916-223-3344',
    address: '34 Legarda St., Manila', items: '1 item', itemLabel: 'BU Polo Shirt',
    issue: 'Failed Delivery', reason: 'Incorrect address provided', courier: 'Carlo D.', avatar: 'RT', date: 'May 20, 2026',
  },
]

// ─── Avatar helper ─────────────────────────────────────────────────────────
function Avatar({ initials, size = 'sm' }) {
  const colors = {
    BR: 'bg-pink-100 text-pink-700',     CM: 'bg-blue-100 text-blue-700',
    DA: 'bg-teal-100 text-teal-700',     ES: 'bg-indigo-100 text-indigo-700',
    FV: 'bg-violet-100 text-violet-700', GT: 'bg-emerald-100 text-emerald-700',
    HL: 'bg-sky-100 text-sky-700',       IN: 'bg-amber-100 text-amber-700',
    JF: 'bg-rose-100 text-rose-700',     KC: 'bg-purple-100 text-purple-700',
    LG: 'bg-green-100 text-green-700',   MR: 'bg-orange-100 text-orange-700',
    NC: 'bg-cyan-100 text-cyan-700',     OD: 'bg-lime-100 text-lime-700',
    PR: 'bg-red-100 text-red-700',       QL: 'bg-fuchsia-100 text-fuchsia-700',
    RT: 'bg-slate-100 text-slate-700',
  }
  const c = colors[initials] || 'bg-slate-100 text-slate-600'
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
            A delivery request will be sent to the third-party courier (Lalamove) for pickup at the store.
            This cannot be undone once the courier accepts the booking.
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
function OverviewTab({ onGoToQueue, onGoToTransit }) {
  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Ready for Dispatch', value: '5',  sub: 'orders waiting',   color: 'amber',   icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>) },
          { label: 'In Transit',         value: '4',  sub: 'out for delivery',  color: 'blue',    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>) },
          { label: 'Delivered Today',    value: '5',  sub: 'successful drops',  color: 'emerald', icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="20 6 9 17 4 12"/></svg>) },
          { label: 'Failed / Returned',  value: '3',  sub: 'need resolution',   color: 'rose',    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>) },
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
            {DISPATCH_QUEUE.slice(0, 3).map((o) => (
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
          </div>
        </div>

        {/* In Transit preview */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-sm font-bold text-slate-900">In Transit</p>
            <button type="button" onClick={onGoToTransit} className="text-xs font-semibold text-brand-orange hover:underline cursor-pointer">View all →</button>
          </div>
          <div className="divide-y divide-slate-100">
            {IN_TRANSIT_ORDERS.slice(0, 3).map((o) => (
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
                  <p className="text-[10px] text-slate-400 mt-0.5">ETA {o.eta}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Queue (Ready for Dispatch) ──────────────────────────────────────
function QueueTab({ onDispatch, dispatchingId, onOpenOrder, dispatchedIds = [] }) {
  const queue = DISPATCH_QUEUE.filter((o) => !dispatchedIds.includes(o.id))
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
                      ₱280 Paid
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end">
                      <button
                        type="button"
                        disabled={dispatchingId === order.id}
                        onClick={(e) => { e.stopPropagation(); onDispatch(order) }}
                        className="h-8 px-3 bg-brand-orange hover:bg-orange-600 disabled:opacity-70 disabled:cursor-wait text-white text-xs font-bold rounded-md transition-colors cursor-pointer"
                      >
                        {dispatchingId === order.id ? 'Dispatching...' : 'Dispatch'}
                      </button>
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

// ─── Tab: In Transit ───────────────────────────────────────────────────────
function InTransitTab() {
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
          <span className="text-[11px] font-semibold text-slate-500">{IN_TRANSIT_ORDERS.length} active deliveries</span>
        </div>
        <div className="divide-y divide-slate-100">
          {IN_TRANSIT_ORDERS.map((order) => (
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
                  <span className="text-[10px] text-slate-400">Courier: <span className="font-semibold text-slate-600">{order.courier}</span></span>
                  <span className="text-[10px] text-slate-300">·</span>
                  <span className="text-[10px] text-slate-400">ETA <span className="font-semibold text-slate-600">{order.eta}</span></span>
                </div>
              </div>
              <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold border ${order.statusLabel === 'Nearby' ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60' : 'bg-blue-50 text-blue-700 border-blue-200/60'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${order.statusLabel === 'Nearby' ? 'bg-emerald-500' : 'bg-blue-500'}`} />
                {order.statusLabel}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <button type="button" className="h-7 px-2.5 border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 rounded-md cursor-pointer">View Order</button>
                <button type="button" className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-400 hover:text-slate-700 hover:bg-slate-50 cursor-pointer text-sm font-bold">⋯</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Completed ────────────────────────────────────────────────────────
function CompletedTab() {
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
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-slate-400">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
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
                <th className="px-4 py-3">Delivery Address</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3">Courier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {DELIVERED_ORDERS.map((row, i) => (
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
                      {row.courier}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 border-t border-slate-100 text-[11px] text-slate-400 font-medium">
          Showing 5 of 5 delivered orders
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Issues ───────────────────────────────────────────────────────────
function IssuesTab({ issueOrders, onRetryBooking }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 bg-rose-50 border border-rose-200/60 rounded-lg px-4 py-3">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-rose-600 shrink-0 mt-0.5">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p className="text-xs font-medium text-rose-800">
          These deliveries encountered issues. Resolve them by retrying Lalamove booking, re-dispatching, or contacting the customer.
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
            Once delivery fee is received, fulfillment is permanently locked to Delivery. Even if Lalamove booking fails, the system does not revert to Pickup—staff resolves it via <strong>Retry Booking</strong> to preserve the customer's paid delivery preference.
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
                <tr key={i} className="hover:bg-slate-50/50 transition-colors">
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
                      <p className="text-[10px] text-slate-400 mt-0.5">Courier: {row.courier}</p>
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
                          className="h-8 px-3 bg-brand-orange hover:bg-orange-600 text-white text-xs font-bold rounded-md transition-colors cursor-pointer"
                        >
                          Retry Delivery
                        </button>
                      )}
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
          Showing {issueOrders.length} of {issueOrders.length} issue orders
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────
const TABS = ['Overview', 'Queue', 'In Transit', 'Completed', 'Issues']

export default function AdminDelivery() {
  const [activeTab, setActiveTab] = useState('Overview')
  const [confirmOrder, setConfirmOrder] = useState(null)
  const [dispatchingId, setDispatchingId] = useState(null)
  const [dispatchedIds, setDispatchedIds] = useState([])
  const [issueOrders, setIssueOrders] = useState(ISSUE_ORDERS)
  const [toast, setToast] = useState('')

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  // Order # / row click opens the order detail (toast placeholder until a detail drawer exists)
  const handleOpenOrder = (order) => showToast(`Opening order ${order.id}`)

  // Dispatch click asks for confirmation first, then calls the 3PL dispatch request
  const handleDispatchClick = (order) => setConfirmOrder(order)

  const handleConfirmDispatch = () => {
    const order = confirmOrder
    if (!order) return
    setConfirmOrder(null)
    setDispatchingId(order.id)
    setTimeout(() => {
      setDispatchingId(null)
      setDispatchedIds((prev) => [...prev, order.id])
      showToast(`${order.id} dispatched via Lalamove`)
    }, 1200)
  }

  const handleRetryBooking = (order) => {
    setIssueOrders((prev) => prev.filter((o) => o.id !== order.id))
    showToast(`Lalamove booking created (LLM-839201) for ${order.id}! Fulfillment remains Delivery.`)
  }

  const TAB_ICONS = {
    'Overview':    (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>),
    'Queue':       (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>),
    'In Transit':  (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>),
    'Completed':   (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><polyline points="20 6 9 17 4 12"/></svg>),
    'Issues':      (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>),
  }

  const TAB_COUNTS = { 'Overview': null, 'Queue': DISPATCH_QUEUE.length - dispatchedIds.length, 'In Transit': 4, 'Completed': 5, 'Issues': issueOrders.length }

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
                <polygon points="16 8 20 8 23 11 23 16 16 16 8"/>
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
          {activeTab === 'Overview'   && <OverviewTab   onGoToQueue={() => setActiveTab('Queue')} onGoToTransit={() => setActiveTab('In Transit')} />}
          {activeTab === 'Queue'      && <QueueTab      onDispatch={handleDispatchClick} dispatchingId={dispatchingId} onOpenOrder={handleOpenOrder} dispatchedIds={dispatchedIds} />}
          {activeTab === 'In Transit' && <InTransitTab />}
          {activeTab === 'Completed'  && <CompletedTab />}
          {activeTab === 'Issues'     && <IssuesTab     issueOrders={issueOrders} onRetryBooking={handleRetryBooking} />}
        </div>
      </div>
    </AdminLayout>
  )
}