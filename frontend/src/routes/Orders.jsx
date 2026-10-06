/* eslint-disable react-refresh/only-export-components */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import React from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useToast } from '../hooks/useToast.js'
import { useAuth } from '../hooks/useAuth.js'
import AccountLayout from '../components/layout/AccountLayout.jsx'
import PageTitle from '../components/ui/PageTitle.jsx'
import PageHeader from '../components/ui/PageHeader.jsx'
import StatusBadge from '../components/ui/StatusBadge.jsx'
import { formatPrice } from '../components/ui/PriceTag.jsx'
import { getImageUrl } from '../utils/imageUtils.js'
import { PackageIcon, ShirtIcon, TruckIcon, MapPinIcon, LockIcon } from '../components/ui/Icons.jsx'
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx'
import { QrScanModal } from '../components/ui/QRScanner.jsx'
import { fetchOrders, requestCancel, orderFilterBucket } from '../services/orders.js'

/**
 * FLOW-ORD_LIST-03: the six spec buckets, each backed by the server-side
 * `filter` param of `GET /cart/display`. The last tab is a client-side view
 * over the full list: a pre-order is derived from the products' own
 * `prod_preorder` / `prodvar_preorder` flags (the orders table carries no
 * tag), so it never needs its own request.
 */
const tabs = [
  { key: 'all', label: 'All' },
  { key: 'processing', label: 'Processing' },
  { key: 'to-claim', label: 'To claim-receive' },
  { key: 'claimed', label: 'Claimed-Received' },
  { key: 'unclaimed', label: 'Unclaimed' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'pre-order', label: 'Pre-orders' },
]

/** Tabs the backend filters for us (CartAPI::applyOrderFilter). */
const SERVER_TABS = ['processing', 'to-claim', 'claimed', 'unclaimed', 'cancelled']

/** Friendly line under the status pill (SRS status vocabulary). */
export const STATUS_CONTEXT = {
  'TO PROCESS': 'Your order is being prepared by the store.',
  'TO CLAIM': 'Ready for pickup — show your claim QR at the counter.',
  'TO RECEIVE': 'Out for courier delivery to your address.',
  CLAIMED: 'Picked up and claimed. Thank you!',
  RECEIVED: 'Delivered and received. Thank you!',
  UNCLAIMED: 'Not claimed within the pickup window. Contact the store.',
  CANCELLED: 'This order was cancelled.',
  RETURNED: 'This order was returned.',
  REFUNDED: 'Your payment has been refunded.',
  'CANCEL REQUESTED': 'Cancellation requested — waiting for staff approval.',
}

const RECEIVING = ['TO CLAIM', 'TO RECEIVE']

/**
 * The API now stores lowercase statuses (`processing`, `to claim`, …). Normalize
 * them back to the uppercase display vocabulary this page (StatusBadge, tabs,
 * STATUS_CONTEXT, action buttons) already understands. Values already in the
 * display vocabulary pass through untouched.
 */
const STATUS_DISPLAY_MAP = {
  processing: 'TO PROCESS',
  'to cancel': 'CANCEL REQUESTED',
  'to claim': 'TO CLAIM',
  delivering: 'TO RECEIVE',
  'to receive': 'TO RECEIVE',
  claimed: 'CLAIMED',
  received: 'RECEIVED',
  unclaimed: 'UNCLAIMED',
  cancelled: 'CANCELLED',
  returned: 'RETURNED',
  refunded: 'REFUNDED',
}

function toDisplayStatus(value) {
  const raw = value == null ? '' : String(value)
  return STATUS_DISPLAY_MAP[raw.trim().toLowerCase()] || raw.toUpperCase() || 'TO PROCESS'
}

function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function dispatchOf(row) {
  // Explicit flag first: an order with neither a pickup nor a delivery row is
  // a walk-in (POS) order, regardless of what ord_claiming defaults to.
  if (row.is_walk_in === true || row.is_preorder === false) return 'Walk-in'

  const raw = String(row.dispatch_type ?? row.ord_claiming ?? '').toLowerCase()
  if (raw.includes('deliver')) return 'Courier Delivery'
  if (raw.includes('pickup') || raw.includes('pick')) return 'Store Pickup'
  // Last resort: the live delivery columns of a dispatched order.
  if (row.deliver_qr || row.deliver_address || row.deliver_addr) return 'Courier Delivery'
  return 'Store Pickup'
}

/** A pre-order row: any bought variation flagged `prodvar_preorder`. */
export function isPreOrderRow(row) {
  return (row.items || []).some(
    (i) =>
      Boolean(i.prodvar?.prodvar_preorder) ||
      Boolean(i.product?.prod_preorder) ||
      Boolean(i.product?.preOrder)
  )
}

/** Convert a `GET /cart/display` order row into the shape this page renders. */
export function mapServerOrder(row) {
  const items = row.items || []
  const first = items[0] || null
  const product = first?.product || {}
  const prodvar = first?.prodvar || null

  // Line detail is always items -> bag -> prodvar -> product: quantities and
  // amounts live on the bag row and ship as qty / amount / line_total.
  const qty = items.reduce((sum, i) => sum + Number(i.qty ?? i.item_qty ?? 0), 0)
  const lineTotal = items.reduce((sum, i) => {
    if (i.line_total != null) return sum + Number(i.line_total)
    return sum + Number(i.amount ?? 0) * Number(i.qty ?? i.item_qty ?? 0)
  }, 0)

  const status = toDisplayStatus(row.ord_status ?? row.status ?? 'processing')
  const method = dispatchOf(row)
  // ord_amount is authoritative (there is no ord_total); the bag lines are
  // only the fallback when it is somehow missing.
  const amount = Number(row.ord_amount ?? row.amount ?? lineTotal)
  const image =
    prodvar?.prodvar_pic ||
    product.main_image ||
    (Array.isArray(product.prod_images) ? product.prod_images[0] : product.prod_images) ||
    null

  return {
    id: row.ord_id ?? row.id,
    date: formatDate(row.ord_created ?? row.created ?? null),
    status,
    statusContext: STATUS_CONTEXT[status] || '',
    rawStatus: String(row.ord_status ?? row.status ?? '').trim(),
    qty: qty || items.length,
    name:
      product.prod_name ||
      product.name ||
      (items.length > 1 ? `${items.length} products` : 'Merchandise'),
    image,
    productId: product.prod_tag ?? product.prod_id ?? null,
    // Unit price of the first line ("… each"); the order total is `total`.
    price: Number(first?.amount ?? 0),
    size: prodvar?.prodvar_name ?? first?.size ?? null,
    color:
      prodvar?.prodvar_pic
        ? {
            name: prodvar.prodvar_name || 'Variation',
            value: '#FF6A00',
            image: prodvar.prodvar_pic,
          }
        : first?.color ?? null,
    preOrder: isPreOrderRow(row),
    subtotal: lineTotal,
    total: amount,
    deliverQr: row.deliver_qr || null,
    pickupQr: row.appoint_qr || null,
    fulfillment: {
      method,
      location:
        method === 'Courier Delivery'
          ? row.deliver_address || row.deliver_addr || 'Delivery address on file'
          : 'Tindahan ni Isko · BU Student Center',
    },
    raw: row,
  }
}

function Orders() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { showToast } = useToast()
  const { currentUser } = useAuth()
  const custId = currentUser?.cust_id ?? currentUser?.id ?? null

  const statusToTab = {
    processing: 'processing',
    to_process: 'processing',
    for_pickup: 'to-claim',
    for_delivery: 'to-claim',
    to_claim: 'to-claim',
    claimed: 'claimed',
    received: 'claimed',
    completed: 'claimed',
    unclaimed: 'unclaimed',
    cancelled: 'cancelled',
  }
  const initialTab =
    statusToTab[String(searchParams.get('status') || '').toLowerCase()] ||
    searchParams.get('tab') ||
    'all'
  const [activeTab, setActiveTab] = useState(
    tabs.some((tab) => tab.key === initialTab) ? initialTab : 'all'
  )
  // `orders` is always the FULL list (used for the tab counts); `bucket` is
  // the server-filtered answer for one FLOW-ORD_LIST-03 bucket, remembered
  // with its key so a stale answer can never paint under another tab.
  const [orders, setOrders] = useState([])
  const [bucket, setBucket] = useState({ key: null, rows: null })
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [claimTarget, setClaimTarget] = useState(null)
  const firstLoad = useRef(true)

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!custId) {
        setOrders([])
        setBucket({ key: null, rows: null })
        setLoading(false)
        return
      }

      const showSpinner = !silent && firstLoad.current
      if (showSpinner) setLoading(true)

      try {
        const needsBucket = SERVER_TABS.includes(activeTab)
        const [baseRows, bucketRows] = await Promise.all([
          fetchOrders(custId),
          needsBucket
            ? fetchOrders(custId, activeTab).catch((err) => {
                console.warn('Order bucket load failed:', err?.message)
                return null
              })
            : Promise.resolve(null),
        ])
        setOrders((baseRows || []).map(mapServerOrder))
        setBucket({
          key: needsBucket ? activeTab : null,
          rows: bucketRows ? bucketRows.map(mapServerOrder) : null,
        })
      } catch (err) {
        console.warn('Failed to load orders:', err?.message)
        // Polls fail silently and keep the list already on screen.
        if (!silent) showToast('Unable to load your orders. Please try again.', 'error')
      } finally {
        firstLoad.current = false
        if (showSpinner) setLoading(false)
      }
    },
    [custId, activeTab, showToast]
  )

  /* REQ-ORD_LIST-02: refresh the list every ~10s while the tab is visible.
     The interval stops while the document is hidden and is re-armed (with an
     immediate refresh) when the customer comes back. */
  useEffect(() => {
    load()

    if (!custId) return undefined

    let timer = null
    const tick = () => {
      if (!document.hidden) load({ silent: true })
    }
    const start = () => {
      if (timer === null) timer = setInterval(tick, 10000)
    }
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer)
        timer = null
      }
    }
    const onVisibility = () => {
      if (document.hidden) stop()
      else {
        start()
        load({ silent: true })
      }
    }

    start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [custId, load])

  const counts = useMemo(() => {
    const totals = { all: orders.length, 'pre-order': 0 }
    SERVER_TABS.forEach((key) => {
      totals[key] = 0
    })
    orders.forEach((order) => {
      if (order.preOrder) totals['pre-order'] += 1
      const bucketKey = orderFilterBucket(order.rawStatus)
      if (bucketKey) totals[bucketKey] += 1
    })
    return totals
  }, [orders])

  const filteredOrders = useMemo(() => {
    if (activeTab === 'pre-order') return orders.filter((o) => o.preOrder)
    if (SERVER_TABS.includes(activeTab)) {
      if (bucket.key === activeTab && bucket.rows) return bucket.rows
      // While the scoped request is in flight (or if it failed) the bucket is
      // mirrored locally with the same status lists the server applies.
      return orders.filter((o) => orderFilterBucket(o.rawStatus) === activeTab)
    }
    return orders
  }, [orders, bucket, activeTab])

  const selectTab = (key) => {
    setActiveTab(key)
    setSearchParams(key === 'all' ? {} : { tab: key }, { replace: true })
  }

  const handleCopyOrderId = (e, orderId) => {
    e.preventDefault()
    e.stopPropagation()
    navigator.clipboard?.writeText(orderId)
    showToast(`Copied Order ID: #${orderId}`)
  }

  /** FLOW-ORD_LIST-04/06: cancel is a request the staff still has to approve. */
  const handleCancel = async (order) => {
    if (busyId) return
    setBusyId(order.id)
    try {
      await requestCancel(order.id)
      showToast('Cancellation requested. The store will review it shortly.', 'success')
      await load()
    } catch (err) {
      showToast(err?.message || 'Unable to request cancellation.', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const canCancel = useCallback((o) => o.status === 'TO PROCESS', [])

  return (
    <AccountLayout>
      <div className="hidden md:block">
        <PageTitle title="My Orders" subtitle="Track and manage your merchandise orders" />
      </div>
      <PageHeader title="My Orders" backTo="/profile" />

      {/* Tabs Filter Bar (Sticky) */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-20 shadow-2xs">
        <div className="max-w-3xl mx-auto flex gap-2 overflow-x-auto px-4 py-3 scrollbar-none select-none">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => selectTab(tab.key)}
              className={`px-4 py-2 rounded-full text-xs font-bold shrink-0 transition-all border cursor-pointer flex items-center gap-1.5 ${
                activeTab === tab.key
                  ? 'bg-brand-orange border-brand-orange text-white shadow-xs'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-900'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                  activeTab === tab.key ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {counts[tab.key] ?? 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Single Vertical Column Layout */}
      <div className="px-4 py-6 pb-32 animate-fade-in max-w-3xl mx-auto space-y-4">
        {loading ? (
          <div className="text-center py-20 bg-white rounded-3xl border border-gray-100 shadow-xs flex items-center justify-center gap-3">
            <LoadingSpinner size={26} />
            <p className="text-sm text-gray-450 font-semibold">Loading your orders…</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-20 flex flex-col items-center justify-center bg-white rounded-3xl border border-gray-100 p-8 shadow-xs">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center border border-gray-100 mb-2">
              <PackageIcon className="w-7 h-7 text-gray-400" />
            </div>
            <h3 className="font-bold text-gray-800 mt-3 text-lg">No orders in this category</h3>
            <p className="text-sm text-gray-450 mt-1 max-w-[260px] mx-auto">
              Your BU campus merchandise orders will show up here as their status updates.
            </p>
            <button
              type="button"
              onClick={() => selectTab('all')}
              className="mt-5 text-brand-orange font-bold text-xs hover:underline cursor-pointer"
            >
              View All Orders
            </button>
          </div>
        ) : (
          filteredOrders.map((order) => {
            const productImage = order.image || null
            const method = order.fulfillment?.method || 'Store Pickup'
            const isDelivery = method === 'Courier Delivery'
            const orderTotal = order.total
            const claimable =
              !isDelivery && order.status === 'TO CLAIM' && Boolean(order.pickupQr)
            // FLOW-ORD_CLAIM-07: a delivery order in "to receive" can be
            // confirmed from this list by scanning the parcel's deliver_qr.
            const deliverable =
              isDelivery && order.status === 'TO RECEIVE' && Boolean(order.deliverQr)

            return (
              <article
                key={order.id}
                className="bg-white rounded-2xl border border-slate-200 transition-colors overflow-hidden shadow-2xs hover:shadow-xs"
              >
                {/* ── Level 1 & 2: Order Identity + Status Row ── */}
                <div className="p-3.5 sm:p-4 border-b border-slate-200 bg-slate-50/50 flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-bold text-gray-900 tracking-tight">
                        Order #{order.id}
                      </span>
                      {/* Copy Order ID Button */}
                      <button
                        type="button"
                        onClick={(e) => handleCopyOrderId(e, order.id)}
                        className="p-1 rounded-md text-gray-400 hover:text-brand-orange hover:bg-orange-50 transition-colors cursor-pointer"
                        title="Copy Order ID to clipboard"
                        aria-label={`Copy Order ID ${order.id}`}
                      >
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      </button>

                      {/* Fulfillment chip */}
                      {isDelivery ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold">
                          <LockIcon className="w-2.5 h-2.5 text-slate-600" />
                          Courier Delivery
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                          Store Pickup
                        </span>
                      )}
                      {order.preOrder && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold">
                          Pre-order
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-gray-500 mt-0.5">
                      {order.date} · {order.qty} {order.qty === 1 ? 'item' : 'items'}
                    </p>
                  </div>

                  {/* Level 2: Prominent Status Pill & Context */}
                  <div className="text-right">
                    <StatusBadge status={order.status} />
                    {order.statusContext && (
                      <p className="text-[11px] text-gray-500 font-medium mt-1 max-w-[200px] sm:max-w-none">
                        {order.statusContext}
                      </p>
                    )}
                  </div>
                </div>

                {/* ── Level 3: Fulfillment Information ── */}
                <div className="px-3.5 sm:px-4 py-2.5 bg-blue-50/40 border-b border-blue-100/50 flex items-center justify-between gap-2 flex-wrap text-xs text-blue-950 font-medium">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="shrink-0">
                      {isDelivery ? (
                        <TruckIcon className="w-3.5 h-3.5 text-brand-orange" />
                      ) : (
                        <MapPinIcon className="w-3.5 h-3.5 text-blue-600" />
                      )}
                    </span>
                    <span className="font-bold">
                      {order.fulfillment?.method || 'Store Pickup'}:
                    </span>
                    <span className="text-blue-900 truncate">
                      {order.fulfillment?.location || 'Tindahan ni Isko · BU Student Center'}
                    </span>
                  </div>

                  {RECEIVING.includes(order.status) && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800">
                      {order.status === 'TO CLAIM' ? 'Claim QR ready' : 'Tracking active'}
                    </span>
                  )}
                </div>

                {/* ── Level 4: Product & Variant Information ── */}
                <div className="p-4 sm:p-5">
                  <div className="flex gap-4 items-center">
                    {/* Thumbnail */}
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0 overflow-hidden">
                      {productImage ? (
                        <img
                          src={getImageUrl(productImage)}
                          alt={order.name}
                          className="w-full h-full object-contain p-1"
                        />
                      ) : (
                        <ShirtIcon className="w-8 h-8 text-brand-orange opacity-40" />
                      )}
                    </div>

                    {/* Product Specs with Explicit Labels */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm sm:text-base font-extrabold text-gray-900 truncate">
                        {order.name}
                      </h3>

                      {/* Explicit Variant Details */}
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-600 flex-wrap">
                        {order.size && (
                          <span>
                            Size: <strong className="text-gray-900">{order.size}</strong>
                          </span>
                        )}
                        {order.size && order.color && <span className="text-gray-300">·</span>}
                        {order.color && (
                          <span className="flex items-center gap-1.5">
                            Color:{' '}
                            <span
                              className="w-2.5 h-2.5 rounded-full border border-gray-300 inline-block shrink-0"
                              style={{ backgroundColor: order.color.value || order.color.name }}
                              title={order.color.name}
                            />
                            <strong className="text-gray-900">{order.color.name}</strong>
                          </span>
                        )}
                        {order.size && <span className="text-gray-300">·</span>}
                        <span>
                          Qty: <strong className="text-gray-900">{order.qty}</strong>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Level 5 & 6: Financial Total & Actions ── */}
                <div className="px-4 sm:px-5 py-3.5 bg-gray-50/70 border-t border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
                      Order Total
                    </span>
                    <span className="text-base sm:text-lg font-black text-gray-900">
                      {formatPrice(orderTotal)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* FLOW-ORD_CLAIM-01: the customer scans the pickup QR here. */}
                    {claimable && (
                      <button
                        type="button"
                        onClick={() =>
                          setClaimTarget({
                            code: order.pickupQr,
                            title: `Scan to claim · Order #${order.id}`,
                          })
                        }
                        className="px-3.5 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100 transition-colors cursor-pointer"
                      >
                        Scan to claim
                      </button>
                    )}

                    {/* FLOW-ORD_CLAIM-07: scan the parcel's deliver_qr to confirm receipt. */}
                    {deliverable && (
                      <button
                        type="button"
                        onClick={() =>
                          setClaimTarget({
                            code: order.deliverQr,
                            title: `Scan to receive · Order #${order.id}`,
                            delivery: true,
                          })
                        }
                        className="px-3.5 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100 transition-colors cursor-pointer"
                      >
                        Scan to receive
                      </button>
                    )}

                    {RECEIVING.includes(order.status) && !isDelivery && !claimable && (
                      <button
                        type="button"
                        onClick={() => navigate(`/orders/${order.id}`)}
                        className="px-3.5 py-2 rounded-xl border border-blue-200 bg-blue-50 text-blue-800 text-xs font-bold hover:bg-blue-100 transition-colors cursor-pointer"
                      >
                        Claim Pass
                      </button>
                    )}

                    {canCancel(order) && (
                      <button
                        type="button"
                        disabled={busyId === order.id}
                        onClick={() => handleCancel(order)}
                        className="px-3.5 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-bold hover:bg-rose-100 transition-colors cursor-pointer disabled:opacity-60"
                      >
                        {busyId === order.id ? <><LoadingSpinner size={14} /> Sending…</> : 'Cancel Order'}
                      </button>
                    )}

                    {['CLAIMED', 'RECEIVED', 'COMPLETED'].includes(order.status) &&
                      order.productId != null && (
                        <Link
                          to={`/product/${order.productId}`}
                          className="px-3.5 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 text-xs font-bold hover:bg-gray-50 transition-colors cursor-pointer"
                        >
                          Buy Again
                        </Link>
                      )}

                    {/* Primary Action */}
                    <Link
                      to={`/orders/${order.id}`}
                      className="px-4 py-2 rounded-xl bg-brand-orange text-white text-xs font-black hover:bg-brand-orange-dark transition-all shadow-2xs hover:shadow-xs active:scale-98 flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>View Order Details</span>
                      <span>→</span>
                    </Link>
                  </div>
                </div>
              </article>
            )
          })
        )}
      </div>

      {/* FLOW-ORD_CLAIM-01/07: camera scan of appoint_qr (pickup) or deliver_qr (delivery). */}
      <QrScanModal
        open={Boolean(claimTarget)}
        title={claimTarget?.title || 'Scan to claim'}
        subtitle={
          claimTarget?.delivery
            ? 'Point the camera at the QR code printed on the delivery parcel.'
            : 'Point the camera at the claim QR code for this pickup order.'
        }
        fallbackCode={claimTarget?.code || null}
        fallbackLabel="Use this order's code"
        onClose={() => setClaimTarget(null)}
        onSuccess={() => load({ silent: true })}
      />
    </AccountLayout>
  )
}

export default React.memo(Orders)
