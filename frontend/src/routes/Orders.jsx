/* eslint-disable react-refresh/only-export-components */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import React from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useToast } from '../hooks/useToast.js'
import { useAuth } from '../hooks/useAuth.js'
import { useApiChange } from '../hooks/useApiChange.js'
import FocusedLayout from '../components/layout/FocusedLayout.jsx'
import StatusBadge from '../components/ui/StatusBadge.jsx'
import { formatPrice } from '../components/ui/PriceTag.jsx'
import { getImageUrl } from '../utils/imageUtils.js'
import { PackageIcon, ShirtIcon, StoreIcon, TruckIcon } from '../components/ui/Icons.jsx'
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx'
import SkeletonBlock from '../components/ui/SkeletonBlock.jsx'
import Modal from '../components/ui/Modal.jsx'
import Button from '../components/ui/Button.jsx'
import ConfirmModal from '../components/ui/ConfirmModal.jsx'
import QRCode from 'qrcode'
import { QrScanModal } from '../components/ui/QRScanner.jsx'
import CustomerOrderDetailModal from '../components/orders/CustomerOrderDetailModal.jsx'
import OrderReviewModal from '../components/orders/OrderReviewModal.jsx'
import { canReviewOrder } from '../services/reviews.js'
import { fetchOrders, requestCancel, confirmDeliveryFeePayment, resumePayment } from '../services/orders.js'
import { parseDate } from '../services/dashboard.js'

const FULFILLMENT_OPTIONS = [
  { key: 'pickup', label: 'Pickup' },
  { key: 'delivery', label: 'Delivery' },
]

const STATUS_TABS = {
  pickup: [
    { key: 'all', label: 'All' },
    { key: 'processing', label: 'Processing' },
    { key: 'ready', label: 'Ready for Pickup' },
    { key: 'claimed', label: 'Claimed' },
    { key: 'cancelled', label: 'Cancelled' },
  ],
  delivery: [
    { key: 'all', label: 'All' },
    { key: 'processing', label: 'Processing' },
    { key: 'shipped', label: 'Shipped' },
    { key: 'delivered', label: 'Delivered' },
    { key: 'cancelled', label: 'Cancelled' },
  ],
}

const PROCESSING_STATUSES = [
  'AWAITING PAYMENT',
  'TO PROCESS',
  'CANCEL REQUESTED',
  'TO CANCEL',
  'CANCELLING',
  'RETURN REQUESTED',
  'PREPARING',
  'CONFIRMED',
  'IN PRODUCTION',
  'FOR PRE-ORDER',
  'PRE-ORDER',
]
const CANCELLED_STATUSES = ['CANCELLED', 'CANCEL', 'CANCELED', 'RETURNED', 'REFUNDED', 'UNCLAIMED']

function orderStatusGroup(order, fulfillment) {
  const status = String(order.status || '').trim().toUpperCase().replace(/_/g, ' ')
  if (CANCELLED_STATUSES.includes(status)) return 'cancelled'
  if (PROCESSING_STATUSES.includes(status)) return 'processing'

  if (fulfillment === 'pickup') {
    if (
      ['TO CLAIM', 'READY FOR PICK UP', 'READY FOR PICKUP', 'READY FOR PICK-UP', 'PICK UP', 'PICK-UP'].includes(
        status
      )
    ) {
      return 'ready'
    }
    if (['CLAIMED', 'RECEIVED', 'COMPLETED'].includes(status)) return 'claimed'
  } else {
    if (
      ['TO DELIVER', 'READY TO SHIP', 'DELIVERING', 'IN TRANSIT', 'TRANSIT', 'TO RECEIVE'].includes(
        status
      )
    ) {
      return 'shipped'
    }
    if (['DELIVERED', 'RECEIVED', 'COMPLETED'].includes(status)) return 'delivered'
  }

  return 'processing'
}

function initialFulfillment(searchParams) {
  const requested = searchParams.get('fulfillment')
  if (requested === 'pickup' || requested === 'delivery') return requested

  const legacyStatus = String(searchParams.get('status') || '').toLowerCase()
  if (legacyStatus === 'for_delivery') return 'delivery'
  if (legacyStatus === 'for_pickup') return 'pickup'

  try {
    const saved = window.localStorage.getItem('orders-fulfillment')
    if (saved === 'pickup' || saved === 'delivery') return saved
  } catch (err) {
    console.warn('Unable to read saved order fulfillment preference:', err?.message)
  }
  return 'pickup'
}

function initialStatusTab(searchParams, fulfillment) {
  const requestedTab = searchParams.get('tab')
  if (STATUS_TABS[fulfillment].some((tab) => tab.key === requestedTab)) return requestedTab

  const status = String(searchParams.get('status') || requestedTab || '').toLowerCase()
  if (['processing', 'to_process', 'to pay'].includes(status)) return 'processing'
  if (['for_pickup', 'to_claim', 'to-claim', 'ready to ship'].includes(status)) {
    return fulfillment === 'pickup' ? 'ready' : 'shipped'
  }
  if (['for_delivery', 'to_deliver', 'delivering', 'in transit', 'to_receive'].includes(status)) {
    return fulfillment === 'delivery' ? 'shipped' : 'ready'
  }
  if (['claimed', 'received', 'completed'].includes(status)) {
    return fulfillment === 'pickup' ? 'claimed' : 'delivered'
  }
  if (['unclaimed', 'cancelled', 'canceled', 'returned', 'refunded'].includes(status)) {
    return 'cancelled'
  }
  return 'all'
}

/** Friendly line under the status pill (SRS status vocabulary). */
export const STATUS_CONTEXT = {
  'AWAITING PAYMENT': 'Waiting for your online payment to go through.',
  'TO PROCESS': 'Your order is being prepared by the store.',
  'TO CLAIM': 'Ready for pickup — show your claim QR at the counter.',
  'READY TO SHIP': 'Packed and handed to the courier — a rider is on the way to collect it.',
  'IN TRANSIT': 'Your parcel is on its way to you.',
  'TO RECEIVE': 'Out for courier delivery to your address.',
  CLAIMED: 'Picked up and claimed. Thank you!',
  RECEIVED: 'Delivered and received. Thank you!',
  UNCLAIMED: 'Not claimed within the pickup window. Contact the store.',
  CANCELLED: 'This order was cancelled.',
  RETURNED: 'This order was returned.',
  REFUNDED: 'Your payment has been refunded.',
  'CANCEL REQUESTED': 'Cancellation requested — waiting for staff approval.',
}

const RECEIVING = ['TO CLAIM', 'READY TO SHIP', 'IN TRANSIT', 'TO RECEIVE']

/**
 * The API now stores lowercase statuses (`processing`, `to claim`, …). Normalize
 * them back to the uppercase display vocabulary this page (StatusBadge, tabs,
 * STATUS_CONTEXT, action buttons) already understands. Values already in the
 * display vocabulary pass through untouched.
 */
const STATUS_DISPLAY_MAP = {
  'to pay': 'AWAITING PAYMENT',
  processing: 'TO PROCESS',
  'to cancel': 'CANCEL REQUESTED',
  'to claim': 'TO CLAIM',
  'to deliver': 'READY TO SHIP',
  delivering: 'IN TRANSIT',
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
  const d = parseDate(value)
  if (!d) return String(value)
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
    // Every product of the order already has a live review (server flag).
    reviewedAll: Boolean(row.reviewed_all),
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
  const [fulfillment, setFulfillment] = useState(() => initialFulfillment(searchParams))
  const [activeTab, setActiveTab] = useState(() => initialStatusTab(searchParams, fulfillment))
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [cancelTarget, setCancelTarget] = useState(null)
  const [claimTarget, setClaimTarget] = useState(null)
  const [pickupQrTarget, setPickupQrTarget] = useState(null)
  const [pickupQrDataUrl, setPickupQrDataUrl] = useState('')
  const [selectedOrder, setSelectedOrder] = useState(null)
  // Claimed / received orders can have each of their items rated and reviewed.
  const [reviewTarget, setReviewTarget] = useState(null)
  const statusSeenRef = useRef(null)
  const firstLoad = useRef(true)

  // Generate QR code Data URL whenever pickupQrTarget changes
  useEffect(() => {
    let alive = true
    const code = pickupQrTarget?.qr || pickupQrTarget?.pickupQr || null
    if (!pickupQrTarget || !code) {
      setPickupQrDataUrl('')
      return () => {
        alive = false
      }
    }

    QRCode.toDataURL(String(code), {
      margin: 1,
      width: 256,
      color: { dark: '#111827', light: '#ffffff' },
    })
      .then((url) => {
        if (alive) setPickupQrDataUrl(url)
      })
      .catch((err) => {
        console.warn('Pickup QR generation failed:', err?.message)
        if (alive) setPickupQrDataUrl('')
      })

    return () => {
      alive = false
    }
  }, [pickupQrTarget])

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!custId) {
        setOrders([])
        setLoading(false)
        return
      }

      const showSpinner = !silent && firstLoad.current
      if (showSpinner) setLoading(true)

      try {
        const baseRows = await fetchOrders(custId)
        const mapped = (baseRows || []).map(mapServerOrder)
        // Review prompt: when an order the customer was watching turns
        // Claimed / Received while this page is open (staff scan, or their
        // own parcel scan), open the review popup for it once.
        const prior = statusSeenRef.current
        if (prior) {
          const justFinished = mapped.find(
            (o) => canReviewOrder(o.status) && !o.reviewedAll
              && prior[o.id] && !canReviewOrder(prior[o.id])
          )
          if (justFinished) setReviewTarget((current) => current || justFinished)
        }
        statusSeenRef.current = Object.fromEntries(mapped.map((o) => [o.id, o.status]))
        setOrders(mapped)
      } catch (err) {
        console.warn('Failed to load orders:', err?.message)
        // Polls fail silently and keep the list already on screen.
        if (!silent) showToast('Unable to load your orders. Please try again.', 'error')
      } finally {
        firstLoad.current = false
        if (showSpinner) setLoading(false)
      }
    },
    [custId, showToast]
  )

  useEffect(() => {
    try {
      window.localStorage.setItem('orders-fulfillment', fulfillment)
    } catch (err) {
      console.warn('Unable to save order fulfillment preference:', err?.message)
    }
  }, [fulfillment])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const statusParam = params.get('status')
    const orderParam = params.get('order')

    if (statusParam === 'delivery_fee_paid' && orderParam) {
      window.history.replaceState({}, document.title, window.location.pathname)
      confirmDeliveryFeePayment(Number(orderParam))
        .then((res) => {
          showToast(res?.message || 'Delivery fee confirmed! Order is out for delivery.', 'success')
          load({ silent: true })
        })
        .catch(() => {
          showToast('Payment verified. Updating order status…', 'info')
          load({ silent: true })
        })
    } else if (statusParam === 'delivery_fee_cancelled') {
      window.history.replaceState({}, document.title, window.location.pathname)
      showToast('Delivery fee payment was cancelled.', 'info')
    }
  }, [showToast, load])

  /* REQ-ORD_LIST-02: refresh the list every ~10s while the tab is visible.
     The interval stops while the document is hidden and is re-armed (with an
     immediate refresh) when the customer comes back. A realtime ping (a status
     change made by staff on another device) re-runs this effect at once, so the
     list moves without waiting for the poll. */
  const version = useApiChange(['orders', 'checkout', 'appoint', 'tracking', 'delivery', 'cart'])

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
  }, [custId, load, version])

  const fulfillmentOrders = useMemo(
    () =>
      orders.filter((order) =>
        fulfillment === 'delivery'
          ? order.fulfillment?.method === 'Courier Delivery'
          : order.fulfillment?.method !== 'Courier Delivery'
      ),
    [orders, fulfillment]
  )

  const counts = useMemo(() => {
    const totals = { all: fulfillmentOrders.length }
    STATUS_TABS[fulfillment].forEach((tab) => {
      if (tab.key !== 'all') totals[tab.key] = 0
    })
    fulfillmentOrders.forEach((order) => {
      const group = orderStatusGroup(order, fulfillment)
      totals[group] = (totals[group] || 0) + 1
    })
    return totals
  }, [fulfillment, fulfillmentOrders])

  const filteredOrders = useMemo(
    () =>
      activeTab === 'all'
        ? fulfillmentOrders
        : fulfillmentOrders.filter((order) => orderStatusGroup(order, fulfillment) === activeTab),
    [activeTab, fulfillment, fulfillmentOrders]
  )

  const selectFulfillment = (key) => {
    setFulfillment(key)
    setActiveTab('all')
    setSearchParams((current) => {
      const params = new URLSearchParams(current)
      params.delete('status')
      params.delete('order')
      params.delete('tab')
      params.set('fulfillment', key)
      return params
    }, { replace: true })
  }

  const selectTab = (key) => {
    setActiveTab(key)
    setSearchParams((current) => {
      const params = new URLSearchParams(current)
      params.delete('status')
      params.set('fulfillment', fulfillment)
      if (key === 'all') params.delete('tab')
      else params.set('tab', key)
      return params
    }, { replace: true })
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
    } catch {
      showToast('Unable to request cancellation.', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const canCancel = useCallback((o) => o.status === 'TO PROCESS' || o.status === 'AWAITING PAYMENT', [])

  /**
   * Reopen PayMongo for an order that is still awaiting payment. The order and
   * its stock hold already exist, so this only replaces the expired checkout
   * session - the customer never has to place the order again (or sign in
   * again) just because the payment page timed out.
   */
  const handleContinuePayment = async (order) => {
    if (busyId) return
    setBusyId(order.id)
    try {
      const res = await resumePayment(order.id)
      const checkoutUrl = res?.data?.checkout_url
      if (checkoutUrl) {
        window.location.assign(checkoutUrl)
        return
      }
      showToast('We could not reopen the payment page. Please try again.', 'error')
    } catch (err) {
      showToast(err?.message || 'We could not reopen the payment page. Please try again.', 'error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <FocusedLayout
      title="My Orders"
      subtitle="Track and manage your merchandise orders"
      backTo="/profile"
      containerClassName="max-w-4xl"
    >
      <div className="pb-24 animate-fade-in w-full space-y-4">
        <div className="w-full overflow-x-auto rounded-2xl border border-slate-200 bg-white p-3 scrollbar-none dark:border-[var(--line)] dark:bg-[var(--surface)] sm:p-3.5">
          <div className="flex w-max min-w-full items-center gap-4">
          <section className="shrink-0 pr-4" aria-labelledby="fulfillment-filter-heading">
            <h2
              id="fulfillment-filter-heading"
              className="mb-2 text-xs font-bold text-slate-800 dark:text-[var(--ink)]"
            >
              Fulfillment Method
            </h2>
            <div className="flex flex-nowrap gap-1.5" role="group" aria-label="Filter orders by fulfillment">
              {FULFILLMENT_OPTIONS.map((option) => {
                const isActive = fulfillment === option.key
                const FulfillmentIcon = option.key === 'pickup' ? StoreIcon : TruckIcon
                return (
                  <button
                    key={option.key}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => selectFulfillment(option.key)}
                    className={`inline-flex min-h-8 items-center justify-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                      isActive
                        ? 'border-brand-orange bg-brand-orange text-white shadow-sm'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 dark:border-[var(--line-2)] dark:bg-[var(--surface)] dark:text-[var(--ink-2)]'
                    }`}
                  >
                    <FulfillmentIcon className="h-3.5 w-3.5" />
                    {option.label}
                  </button>
                )
              })}
            </div>
          </section>

          <div className="h-12 w-px shrink-0 bg-slate-300 dark:bg-[var(--line)]" aria-hidden="true" />

          <section
            className="shrink-0"
            aria-labelledby="order-status-filter-heading"
          >
            <h2
              id="order-status-filter-heading"
              className="mb-2 text-xs font-bold text-slate-800 dark:text-[var(--ink)]"
            >
              Order Status
            </h2>
            <div
              className="flex flex-nowrap items-center gap-1.5"
              role="group"
              aria-label={`${fulfillment === 'pickup' ? 'Pickup' : 'Delivery'} order status`}
            >
              {STATUS_TABS[fulfillment].map((tab) => {
                const isActive = activeTab === tab.key
                const count = counts[tab.key] ?? 0
                return (
                  <button
                    key={tab.key}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => selectTab(tab.key)}
                    className={`inline-flex min-h-8 items-center justify-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                      isActive
                        ? 'border-brand-orange bg-brand-orange text-white shadow-sm'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 dark:border-[var(--line-2)] dark:bg-[var(--surface)] dark:text-[var(--ink-2)]'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className={count === 0 ? 'opacity-50' : undefined}>({count})</span>
                  </button>
                )
              })}
            </div>
          </section>
          </div>
        </div>

      {/* Single Vertical Column Layout */}
      <div className="w-full px-0 py-6 pb-32 animate-fade-in space-y-4">
        {loading ? (
          <div className="space-y-4" aria-busy={loading} aria-live="polite">
            <span className="sr-only">Loading your orders</span>
            {Array.from({ length: 3 }, (_, index) => (
              <article key={index} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs animate-pulse" aria-hidden="true">
                <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50/50 p-4">
                  <div className="space-y-2">
                    <SkeletonBlock className="h-4 w-32 rounded" />
                    <SkeletonBlock className="h-3 w-24 rounded" />
                  </div>
                  <SkeletonBlock className="h-6 w-24 rounded-full" />
                </div>
                <SkeletonBlock className="h-10 w-full rounded-none" />
                <div className="flex items-center gap-4 p-4">
                  <SkeletonBlock className="h-16 w-16 shrink-0 rounded-xl sm:h-20 sm:w-20" />
                  <div className="flex-1 space-y-2">
                    <SkeletonBlock className="h-4 w-2/3 rounded" />
                    <SkeletonBlock className="h-3 w-1/2 rounded" />
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-4 py-3">
                  <div className="space-y-2">
                    <SkeletonBlock className="h-3 w-16 rounded" />
                    <SkeletonBlock className="h-5 w-24 rounded" />
                  </div>
                  <SkeletonBlock className="h-9 w-28 rounded-xl" />
                </div>
              </article>
            ))}
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-20 flex flex-col items-center justify-center bg-white rounded-3xl border border-gray-100 p-8 shadow-xs">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center border border-gray-100 mb-2">
              <PackageIcon className="w-7 h-7 text-gray-400" />
            </div>
            <h3 className="font-semibold text-gray-800 mt-3 text-lg">
              No {fulfillment} orders in this category
            </h3>
            <p className="text-sm text-gray-450 mt-1 max-w-[260px] mx-auto">
              Your BU campus merchandise orders will show up here as their status updates.
            </p>
            <button
              type="button"
              onClick={() => selectTab('all')}
              className="mt-5 text-brand-orange font-semibold text-xs hover:underline cursor-pointer"
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
            // The courier fee paid with the order, shown apart from the items.
            const deliveryFee = isDelivery ? Number(order.raw?.deliver_fee_charged || 0) : 0
            const pickupQrCode = order.pickupQr || order.raw?.appoint_qr || null
            const hasPickupQr = !isDelivery && Boolean(pickupQrCode)
            const claimable =
              !isDelivery && order.status === 'TO CLAIM' && Boolean(pickupQrCode)
            // FLOW-ORD_CLAIM-07: a delivery order in "to receive" can be
            // confirmed from this list by scanning the parcel's deliver_qr.
            const deliverable =
              isDelivery && ['IN TRANSIT', 'TO RECEIVE'].includes(order.status) && Boolean(order.deliverQr)

            return (
              <article
                key={order.id}
                className="bg-white rounded-2xl border border-slate-200 transition-colors overflow-hidden shadow-2xs hover:shadow-xs"
              >
                {/* ── Level 1 & 2: Order Identity + Status Row ── */}
                <div className="p-3.5 sm:p-4 border-b border-slate-200 bg-slate-50/50 flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-semibold text-gray-900 tracking-tight">
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

                    </div>

                    <p className="text-xs text-gray-500 mt-0.5">
                      {order.date} · {order.qty} {order.qty === 1 ? 'item' : 'items'}
                    </p>
                  </div>

                  {/* Level 2: Primary status badge */}
                  <div className="text-right">
                    <StatusBadge status={order.status} appearance="status-pill" />
                  </div>
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
                      <h3 className="text-sm sm:text-base font-semibold text-gray-900 truncate">
                        {order.name}
                      </h3>

                      {/* Explicit Variant Details */}
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-600 flex-wrap">
                        {order.size && (
                          <span>
                            Size: <strong className="text-gray-900">{order.size}</strong>
                          </span>
                        )}
                        {order.color && (
                          <span className="flex items-center gap-1.5">
                            Color:{' '}
                            <strong className="text-gray-900">{order.color.name}</strong>
                          </span>
                        )}
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
                    <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block">
                      Order Total
                    </span>
                    <span className="text-base sm:text-lg font-semibold text-gray-900">
                      {formatPrice(orderTotal)}
                    </span>
                    {deliveryFee > 0 && (
                      <span className="text-[11px] text-gray-500 block">
                        incl. {formatPrice(deliveryFee)} delivery fee
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {order.status === 'READY TO SHIP' && !(Number(order.raw?.deliver_fee_charged) > 0) && (
                      <button
                        type="button"
                        onClick={() => setSelectedOrder(order)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-orange text-white text-xs font-bold hover:bg-brand-orange-dark shadow-2xs transition-colors cursor-pointer"
                        title="Complete delivery details and pay delivery fee"
                      >
                        <TruckIcon className="w-3.5 h-3.5" />
                        <span>Pay Courier Fee</span>
                      </button>
                    )}

                    {/* Prominent Pickup QR code presentation button (easily accessible on order card) */}
                    {hasPickupQr && (
                      <button
                        type="button"
                        onClick={() =>
                          setPickupQrTarget({
                            orderId: order.id,
                            qr: pickupQrCode,
                            title: `Pickup Claim Pass · Order #${order.id}`,
                            status: order.status,
                            date: order.date,
                            fulfillment: order.fulfillment,
                          })
                        }
                        className="px-3.5 py-2 rounded-xl border border-emerald-600 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-xs font-bold transition-all shadow-2xs hover:shadow-xs active:scale-98 flex items-center gap-1.5 cursor-pointer"
                        title="Show scannable Claim QR code for pickup counter"
                      >
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-emerald-700" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="7" height="7" />
                          <rect x="14" y="3" width="7" height="7" />
                          <rect x="14" y="14" width="7" height="7" />
                          <rect x="3" y="14" width="7" height="7" />
                        </svg>
                        <span>Show Pickup QR</span>
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
                        className="px-3.5 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 transition-colors cursor-pointer"
                      >
                        Scan to receive
                      </button>
                    )}

                    {RECEIVING.includes(order.status) && !isDelivery && !claimable && (
                      <button
                        type="button"
                        onClick={() => navigate(`/orders/${order.id}`)}
                        className="px-3.5 py-2 rounded-xl border border-blue-200 bg-blue-50 text-blue-800 text-xs font-semibold hover:bg-blue-100 transition-colors cursor-pointer"
                      >
                        Claim Pass
                      </button>
                    )}

                    {order.status === 'AWAITING PAYMENT' && (
                      <button
                        type="button"
                        disabled={busyId === order.id}
                        onClick={() => handleContinuePayment(order)}
                        className="px-3.5 py-2 rounded-xl bg-brand-orange text-white text-xs font-bold hover:bg-brand-orange-dark transition-colors shadow-2xs cursor-pointer disabled:opacity-60 flex items-center gap-1.5"
                      >
                        {busyId === order.id ? <><LoadingSpinner size={14} /> Opening…</> : 'Continue Payment'}
                      </button>
                    )}

                    {canCancel(order) && (
                      <button
                        type="button"
                        disabled={busyId === order.id}
                        aria-busy={busyId === order.id}
                        onClick={() => setCancelTarget(order)}
                        className="min-w-[104px] px-3.5 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-semibold hover:bg-rose-100 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                      >
                        {busyId === order.id ? (
                          <>
                            <span
                              className="w-3.5 h-3.5 rounded-full border-2 border-rose-700/25 border-t-rose-700 animate-spin"
                              aria-hidden="true"
                            />
                            <span className="sr-only">Requesting cancellation…</span>
                          </>
                        ) : (
                          'Cancel Order'
                        )}
                      </button>
                    )}

                    {canReviewOrder(order.status) && (
                      <button
                        type="button"
                        onClick={() => setReviewTarget(order)}
                        className={order.reviewedAll
                          ? 'px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer flex items-center gap-1.5'
                          : 'px-3.5 py-2 rounded-xl border border-amber-300 bg-amber-50 text-amber-800 text-xs font-semibold hover:bg-amber-100 transition-colors cursor-pointer flex items-center gap-1.5'}
                      >
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-amber-500" fill="currentColor" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                        <span>{order.reviewedAll ? 'View Review' : 'Rate & Review'}</span>
                      </button>
                    )}

                    {['CLAIMED', 'RECEIVED', 'COMPLETED'].includes(order.status) &&
                      order.productId != null && (
                        <Link
                          to={`/product/${order.productId}`}
                          className="px-3.5 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 text-xs font-semibold hover:bg-gray-50 transition-colors cursor-pointer"
                        >
                          Buy Again
                        </Link>
                      )}

                    {/* Primary Action — Standardized Order Details Popup */}
                    <button
                      type="button"
                      disabled={busyId === order.id}
                      onClick={() => setSelectedOrder(order)}
                      className="px-4 py-2 rounded-xl bg-brand-orange text-white text-xs font-semibold hover:bg-brand-orange-dark transition-all shadow-2xs hover:shadow-xs active:scale-98 flex items-center gap-1.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100"
                    >
                      <span>View Order Details</span>
                    </button>
                  </div>
                </div>
              </article>
            )
          })
        )}
      </div>

      {/* Standardized Customer Order Details Popup Modal */}
      {selectedOrder && (
        <CustomerOrderDetailModal
          order={selectedOrder}
          isOpen={Boolean(selectedOrder)}
          onClose={() => setSelectedOrder(null)}
          onOrderUpdated={() => load({ silent: true })}
          onReview={(target) => {
            setSelectedOrder(null)
            setReviewTarget(target)
          }}
        />
      )}

      <ConfirmModal
        isOpen={cancelTarget != null}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => cancelTarget && handleCancel(cancelTarget)}
        title="Cancel this order?"
        message={`This sends a cancellation request for order #${cancelTarget?.id ?? ''}. The store reviews it, and a paid order is refunded once the request is approved.`}
        confirmText="Yes, cancel order"
        cancelText="Keep order"
      />

      {/* Rate & review each item of a claimed / received order */}
      {reviewTarget && (
        <OrderReviewModal
          isOpen={Boolean(reviewTarget)}
          order={reviewTarget}
          onClose={() => {
            setReviewTarget(null)
            load({ silent: true })
          }}
        />
      )}

      {/* Pickup Claim QR Code Display Modal (FLOW-ORD_CLAIM-01 / FLOW-MANAGE_BOOKED-03) */}
      <Modal
        isOpen={Boolean(pickupQrTarget)}
        onClose={() => setPickupQrTarget(null)}
        title={pickupQrTarget?.title || 'Pickup Claim Pass'}
        subtitle="Present this QR code together with your student ID at the pickup counter."
        size="sm"
        footer={
          <div className="flex items-center justify-end w-full gap-2">
            <Button variant="secondary" onClick={() => setPickupQrTarget(null)}>
              Close
            </Button>
          </div>
        }
      >
        <div className="flex flex-col items-center text-center space-y-4 py-2">
          {/* Large Scannable QR Code */}
          <div className="w-56 h-56 p-3 bg-white border-2 border-slate-200 rounded-2xl shadow-xs flex items-center justify-center">
            {pickupQrDataUrl ? (
              <img
                src={pickupQrDataUrl}
                alt={`Claim QR code for Order #${pickupQrTarget?.orderId}`}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 text-xs text-gray-400">
                <LoadingSpinner size={24} />
                <span>Generating scannable QR…</span>
              </div>
            )}
          </div>

          {/* Reference code and pickup location */}
          <div className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs space-y-1.5 text-left">
            <div className="flex items-center justify-between text-gray-600">
              <span className="text-gray-400 font-medium">Pickup Location:</span>
              <span className="font-semibold text-gray-900 text-right">
                {pickupQrTarget?.fulfillment?.location || 'Tindahan ni Isko · BU Student Center'}
              </span>
            </div>
            <div className="flex items-center justify-between text-gray-600">
              <span className="text-gray-400 font-medium">Order Reference:</span>
              <span className="font-mono font-bold text-gray-900">
                #{pickupQrTarget?.orderId}
              </span>
            </div>
          </div>

          <p className="text-[11px] text-gray-500 leading-relaxed px-1">
            Store counter staff will scan this code to verify and release your items. You can also take a screenshot or view full details in your order view.
          </p>
        </div>
      </Modal>

      {/* FLOW-ORD_CLAIM-07: camera scan of the parcel's deliver_qr. Pickup
          codes are only shown (Show Pickup QR) - staff scan them. */}
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
      </div>
    </FocusedLayout>
  )
}

export default React.memo(Orders)
