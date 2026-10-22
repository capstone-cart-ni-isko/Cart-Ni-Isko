import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import QRCode from 'qrcode'
import { useToast } from '../hooks/useToast.js'
import { useAuth } from '../hooks/useAuth.js'
import { useApiChange } from '../hooks/useApiChange.js'
import FocusedLayout from '../components/layout/FocusedLayout.jsx'
import StatusBadge from '../components/ui/StatusBadge.jsx'
import { formatPrice } from '../components/ui/PriceTag.jsx'
import { getImageUrl } from '../utils/imageUtils.js'
import {
  PackageIcon,
  ShirtIcon,
  TruckIcon,
  MapPinIcon,
  MessageSquareIcon,
} from '../components/ui/Icons.jsx'
import { fetchOrder,
  fetchOrders,
  requestCancel,
  updateOrder,
} from '../services/orders.js'
import { getTrack, scanQr } from '../services/tracking.js'
import { parseDate, paymentSummary } from '../services/dashboard.js'
import { QrScanModal } from '../components/ui/QRScanner.jsx'
import { mapServerOrder, STATUS_CONTEXT } from './Orders.jsx'
import SkeletonBlock from '../components/ui/SkeletonBlock.jsx'
import DigitalReceipt from '../components/ui/DigitalReceipt.jsx'
import OrderReviewModal from '../components/orders/OrderReviewModal.jsx'
import { canReviewOrder } from '../services/reviews.js'

const RECEIVING = ['TO CLAIM', 'TO RECEIVE']
const CAN_CANCEL = ['TO PROCESS']
const CAN_REFUND = ['CLAIMED', 'RECEIVED', 'DELIVERED', 'COMPLETED']

/** LalaMove booking states the order carries, in the customer's own words. */
const COURIER_STATUS_LABELS = {
  ASSIGNING_DRIVER: 'Finding a driver',
  ON_GOING: 'Driver on the way',
  PICKED_UP: 'Picked up',
  COMPLETED: 'Arrived',
  CANCELED: 'Courier unavailable — the store is re-arranging',
  REJECTED: 'Courier unavailable — the store is re-arranging',
  EXPIRED: 'Courier unavailable — the store is re-arranging',
}

/** Human label for `courier.status` (unknown states fall back to the raw value). */
function courierLabel(status) {
  const key = String(status || '').trim().toUpperCase()
  if (COURIER_STATUS_LABELS[key]) return COURIER_STATUS_LABELS[key]
  return key ? key.replace(/_/g, ' ') : 'Courier assigned'
}

/** "Jan 5, 2026, 9:00 AM" for the live appointment / delivery stamps. */
function formatStamp(value) {
  if (!value) return null
  const d = parseDate(value)
  if (!d) return String(value)
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Normalise the tracking payload into timeline steps (shape is unconfirmed). */
function parseTimeline(res) {
  const d = res?.data ?? res ?? null
  const list = Array.isArray(d)
    ? d
    : d?.history ?? d?.steps ?? d?.timeline ?? d?.track ?? []
  if (!Array.isArray(list)) return []
  return list.map((e, i) => ({
    key: e?.track_id ?? e?.id ?? i,
    label: e?.track_status ?? e?.status ?? e?.stage ?? e?.track_type ?? 'Update',
    time: e?.track_time ?? e?.updated_at ?? e?.created_at ?? e?.time ?? '',
    note: e?.track_note ?? e?.note ?? '',
  }))
}

/** POST /tracking/create answers with the canonical code for the modality. */
function trackQrOf(res) {
  const d = res?.data ?? res ?? null
  return d?.qr_code ?? d?.deliver_qr ?? d?.qr ?? null
}

function OrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { currentUser } = useAuth()
  const custId = currentUser?.cust_id ?? currentUser?.id ?? null

  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [timeline, setTimeline] = useState([])
  const [trackRes, setTrackRes] = useState(null)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [busy, setBusy] = useState(false)
  // null | 'delivery' (FLOW-ORD_CLAIM-07) | 'pickup' (FLOW-ORD_CLAIM-01)
  const [scanMode, setScanMode] = useState(null)
  const [reviewOpen, setReviewOpen] = useState(false)

  /* The screen must never blank itself while it refreshes.
     `orderRef` holds the order that is on screen, `loadedIdRef` the one that
     was last read, and the two flags below keep a second read from running
     on top of the first one. */
  const orderRef = useRef(null)
  const loadedIdRef = useRef(null)
  const inFlightRef = useRef(false)
  const queuedRef = useRef(false)
  // Bumped when a read was asked for while another one was running: the read
  // effect watches it and serves that queued request.
  const [reloadTick, setReloadTick] = useState(0)

  const load = useCallback(async () => {
    // One read at a time. A request that arrives while one is running is
    // remembered and served the moment the running one settles, so a burst of
    // realtime pings can never stack reads on top of each other.
    if (inFlightRef.current) {
      queuedRef.current = true
      return
    }
    inFlightRef.current = true
    // The skeleton belongs to the FIRST read only. A background refresh keeps
    // the order on screen instead of dropping back to a skeleton - that is
    // what used to look like the screen reloading forever.
    if (!orderRef.current) setLoading(true)
    try {
      let row = null
      try {
        row = await fetchOrder(id)
      } catch {
        row = null
      }
      if (!row && custId) {
        try {
          const rows = await fetchOrders(custId)
          row = (rows || []).find((r) => String(r.ord_id ?? r.id) === String(id)) || null
        } catch {
          row = null
        }
      }

      if (!row) {
        // A refresh that could not read the order must not throw away the one
        // that is already on screen; only a first read with no row means the
        // order really is gone.
        if (!orderRef.current) setOrder(null)
        return
      }

      const mapped = mapServerOrder(row)
      const switchedOrder = loadedIdRef.current !== mapped.id
      loadedIdRef.current = mapped.id
      orderRef.current = mapped
      setOrder(mapped)
      // The tracking panel is only reset when a DIFFERENT order is shown, so
      // a refresh keeps the timeline the customer is reading.
      if (switchedOrder) {
        setTimeline([])
        setTrackRes(null)
      }

      // Fulfillment track: pickup QR/queue state, or the delivery track + QR.
      const trackType =
        mapped.fulfillment.method === 'Courier Delivery' ? 'delivery' : 'pickup'
      try {
        const res = await getTrack(mapped.id, trackType)
        setTrackRes(res)
        setTimeline(parseTimeline(res))
      } catch (err) {
        console.warn('Tracking lookup failed:', err?.message)
      }
    } finally {
      inFlightRef.current = false
      setLoading(false)
      if (queuedRef.current) {
        queuedRef.current = false
        setReloadTick((tick) => tick + 1)
      }
    }
  }, [id, custId])

  // Opening another order is a fresh screen: the previous order must not stay
  // on screen while the new one is read, so the skeleton comes back for it.
  useEffect(() => {
    orderRef.current = null
    loadedIdRef.current = null
    setOrder(null)
    setTimeline([])
    setTrackRes(null)
  }, [id])

  // Realtime (REQ-ORD_LIST-02/03, REQ-ORD_CLAIM-*): this screen has no poll of
  // its own, so a status change, a claim scan or a cancellation on another
  // device used to need a manual reload. A ping now re-reads the order (and its
  // fulfillment track) the moment staff act on it.
  const version = useApiChange(['orders', 'checkout', 'tracking', 'delivery', 'appoint'])

  useEffect(() => {
    load()
  }, [load, version, reloadTick])

  /* QR payload: the signed code from POST /tracking/create (staff scanners
     verify it, REQ-APC-01), falling back to the live dispatch codes the order
     payload itself carries: `appoint_qr` for pickup, `deliver_qr` for the
     parcel. Only claimable/receivable orders show a QR. */
  const isDelivery = order?.fulfillment?.method === 'Courier Delivery'
  const showQr = Boolean(order && RECEIVING.includes(order.status))
  const qrPayload = !order
    ? null
    : trackQrOf(trackRes) ||
      order.raw?.appoint_qr ||
      order.raw?.deliver_qr ||
      null

  useEffect(() => {
    let alive = true
    if (!showQr || !qrPayload) {
      setQrDataUrl('')
      return () => {
        alive = false
      }
    }
    QRCode.toDataURL(String(qrPayload), {
      margin: 1,
      width: 240,
      color: { dark: '#111827', light: '#ffffff' },
    })
      .then((url) => {
        if (alive) setQrDataUrl(url)
      })
      .catch((err) => {
        console.warn('QR generation failed:', err?.message)
        if (alive) setQrDataUrl('')
      })
    return () => {
      alive = false
    }
  }, [showQr, qrPayload])

  const handleCopyOrderId = () => {
    navigator.clipboard?.writeText(String(order.id))
    showToast(`Copied Order ID: #${order.id}`)
  }

  const handleCancel = async () => {
    if (busy) return
    setBusy(true)
    try {
      await requestCancel(order.id)
      showToast('Cancellation requested. The store will review it shortly.', 'success')
      load()
    } catch {
      showToast('Unable to request cancellation.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleRequestRefund = async () => {
    if (busy) return
    if (!window.confirm('Are you sure you want to request a return and refund for this order? The store will review your request.')) {
      return
    }
    setBusy(true)
    try {
      await updateOrder(order.id, { ord_status: 'RETURN REQUESTED' })
      showToast('Return requested. The store will review it shortly.', 'success')
      load()
    } catch (err) {
      showToast(err?.message || 'Unable to request return and refund.', 'error')
    } finally {
      setBusy(false)
    }
  }

  /* REQ-APC-02 / FLOW-ORD_CLAIM-07: the owning customer verifies the parcel
     by posting its own code; that stamps `deliver_end` and moves the order to
     `received` (FLOW-ORD_CLAIM-08 - `load()` then re-reads both). */
  const handleConfirmReceipt = async () => {
    if (busy || !qrPayload) return
    setBusy(true)
    try {
      const res = await scanQr(qrPayload, 'customer')
      showToast(res?.message || 'Order marked as received.', 'success')
      load()
    } catch {
      showToast('Unable to confirm receipt.', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <FocusedLayout title="Order Details" backTo="/orders" containerClassName="max-w-3xl">
        <div className="space-y-4 pb-16 animate-fade-in" aria-busy={loading} aria-live="polite">
          <span className="sr-only">Loading order details</span>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs animate-pulse">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <SkeletonBlock className="h-5 w-36 rounded" />
                  <SkeletonBlock className="h-3 w-28 rounded" />
                </div>
                <SkeletonBlock className="h-6 w-24 rounded-full" />
              </div>
              <SkeletonBlock className="mt-4 h-10 w-full rounded-xl" />
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs animate-pulse">
              <SkeletonBlock className="mb-4 h-4 w-32 rounded" />
              <div className="flex flex-col items-center gap-4 rounded-xl bg-slate-50 p-4 sm:flex-row">
                <SkeletonBlock className="h-40 w-40 shrink-0 rounded-lg" />
                <div className="w-full space-y-3">
                  <SkeletonBlock className="h-4 w-2/3 rounded" />
                  <SkeletonBlock className="h-3 w-full rounded" />
                  <SkeletonBlock className="h-3 w-3/4 rounded" />
                  <SkeletonBlock className="h-9 w-32 rounded-lg" />
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs animate-pulse">
              <SkeletonBlock className="mb-4 h-4 w-28 rounded" />
              <SkeletonBlock className="h-4 w-full rounded" />
              <SkeletonBlock className="mt-2 h-4 w-3/4 rounded" />
          </div>
        </div>
      </FocusedLayout>
    )
  }

  if (!order) {
    return (
      <FocusedLayout title="Order Details" backTo="/orders" containerClassName="max-w-3xl">
        <div className="flex flex-col items-center justify-center py-24 text-center px-6 animate-fade-in">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center border border-gray-200 mb-2">
            <PackageIcon className="w-7 h-7 text-gray-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Order not found</h2>
          <p className="text-sm text-gray-450 mt-2">This order doesn't exist or may have been removed.</p>
          <button
            onClick={() => navigate('/orders')}
            className="mt-6 text-brand-orange font-semibold text-sm hover:underline cursor-pointer"
          >
            Back to Orders
          </button>
        </div>
      </FocusedLayout>
    )
  }

  const orderItems = order.raw?.items || []
  const subtotal = order.subtotal
  // Live delivery columns only: `deliver_fee_charged` is the courier fee the
  // store actually charged. Totals come from `ord_amount` (no ord_total).
  const deliveryFee = isDelivery
    ? Number(order.raw?.deliver_fee_charged ?? order.raw?.deliver_fee_actual ?? 0)
    : 0
  const total = Number(order.raw?.ord_amount ?? subtotal + deliveryFee)
  const statusContext = STATUS_CONTEXT[order.status] || order.statusContext
  // DOMAIN 26: what the payment produced - the method chosen at checkout, what
  // was due, what the customer tendered and the change returned.
  const pay = paymentSummary(order.raw || {})
  const appointment = {
    start: formatStamp(order.raw?.appoint_start),
    end: formatStamp(order.raw?.appoint_end),
    status: order.raw?.appoint_status || null,
    closed: formatStamp(order.raw?.appoint_closed),
  }
  const delivery = {
    expect: formatStamp(order.raw?.deliver_expect),
    received: formatStamp(order.raw?.deliver_end),
    address: order.raw?.deliver_address || null,
    phone: order.raw?.deliver_phone || null,
    recipient: order.raw?.deliver_recipient || null,
  }
  // Courier booking carried by a delivery order payload: `share_url` is the
  // customer's LalaMove tracking link, `status` the live booking state.
  const courier = isDelivery ? order.raw?.courier || null : null
  const courierTrackUrl = courier?.share_url || order.raw?.deliver_share_link || null

  return (
    <FocusedLayout title={`Order #${order.id}`} subtitle={`Placed on ${order.date}`} backTo="/orders" containerClassName="max-w-3xl">
      <div className="pb-16 animate-fade-in w-full">

        <div className="space-y-3.5">
          {/* Order Identity & Status Banner */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-3 shadow-2xs">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base sm:text-lg font-semibold text-gray-900">
                    Order #{order.id}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyOrderId}
                    className="p-1 rounded-md text-gray-400 hover:text-brand-orange hover:bg-orange-50 transition-colors cursor-pointer"
                    title="Copy Order ID"
                  >
                    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">Placed on {order.date}</p>
              </div>

              <div className="text-right">
                <StatusBadge status={order.status} />
              </div>
            </div>

            {statusContext && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-gray-700 flex items-center gap-2">
                <MessageSquareIcon className="w-4 h-4 text-slate-500 shrink-0" />
                <span>{statusContext}</span>
              </div>
            )}
          </div>

          {/* QR & Tracking (visible only while TO CLAIM / TO RECEIVE) */}
          {(showQr || timeline.length > 0) && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-4 shadow-2xs">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {isDelivery ? 'Delivery Tracking' : 'Pickup Claim Pass'}
                </h3>
                <StatusBadge status={order.status} className="px-2 py-0.5" />
              </div>

              {showQr && qrPayload && (
                <div className="flex flex-col sm:flex-row items-center gap-4 p-4 bg-slate-50 border border-slate-100 rounded-xl">
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt="Order verification QR code"
                      className="w-40 h-40 rounded-lg bg-white p-2 border border-slate-200 shrink-0"
                    />
                  ) : (
                    <div className="w-40 h-40 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-xs text-gray-400 shrink-0">
                      Generating QR…
                    </div>
                  )}
                  <div className="text-xs text-gray-600 space-y-1.5 text-center sm:text-left">
                    <p className="font-semibold text-gray-900 text-sm">
                      {isDelivery
                        ? 'Courier verification code'
                        : 'Show this QR at the pickup counter'}
                    </p>
                    <p className="text-gray-500 leading-relaxed">
                      {isDelivery
                        ? 'The courier scans this code when your order is handed over.'
                        : 'Present this code together with your student ID to claim your order at Tindahan ni Isko, BU Student Center Ground Floor.'}
                    </p>
                    <p className="font-mono text-[11px] text-gray-500 break-all">
                      {String(qrPayload)}
                    </p>
                    {isDelivery && order.status === 'TO RECEIVE' && (
                      <>
                        <button
                          type="button"
                          onClick={() => setScanMode('delivery')}
                          className="mt-1 px-4 py-2 rounded-lg bg-brand-orange text-white text-xs font-semibold hover:bg-orange-600 transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          Scan Parcel QR Code
                        </button>
                        <button
                          type="button"
                          onClick={handleConfirmReceipt}
                          disabled={busy}
                          className="mt-2 px-4 py-2 rounded-lg bg-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-300 transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          {busy ? 'Confirming…' : 'I received this order (manual)'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Camera scanner for the delivery receipt (FLOW-ORD_CLAIM-07),
                  posted to POST /tracking/scan as { scanned_by: 'customer' }.
                  Pickup codes are never self-scanned: staff scan them. */}
              <QrScanModal
                open={scanMode === 'delivery'}
                title="Scan Parcel QR Code"
                subtitle="Point the camera at the QR code on your parcel."
                fallbackCode={isDelivery ? qrPayload : null}
                fallbackLabel="Use this order's code"
                onClose={() => setScanMode(null)}
                onSuccess={() => load()}
              />

              {timeline.length > 0 && (
                <ol className="space-y-0">
                  {timeline.map((step, idx) => (
                    <li key={step.key} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span
                          className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${
                            idx === timeline.length - 1
                              ? 'bg-brand-orange'
                              : 'bg-emerald-500'
                          }`}
                        />
                        {idx < timeline.length - 1 && (
                          <span className="w-px flex-1 bg-slate-200" />
                        )}
                      </div>
                      <div className="pb-4 text-xs min-w-0">
                        <p className="font-semibold text-gray-900">
                          {String(step.label).replace(/_/g, ' ')}
                        </p>
                        {step.time && (
                          <p className="text-gray-500 text-[11px]">
                            {parseDate(step.time)?.toLocaleString() ?? String(step.time)}
                          </p>
                        )}
                        {step.note && <p className="text-gray-500">{step.note}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          {/* Fulfillment Method Info */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-3.5 shadow-2xs">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Fulfillment Method
              </h3>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold uppercase tracking-wider">
                Paid at checkout
              </span>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/60 flex items-start gap-3">
              <span className="p-2 rounded-xl bg-white border border-slate-200 text-brand-orange shrink-0 mt-0.5 shadow-2xs">
                {isDelivery ? <TruckIcon className="w-5 h-5" /> : <MapPinIcon className="w-5 h-5" />}
              </span>
              <div className="flex-1 min-w-0 text-xs space-y-1">
                <strong className="text-gray-900 text-sm font-semibold block">
                  {order.fulfillment?.method || 'Store Pickup'}
                </strong>
                <p className="text-gray-600">
                  {order.fulfillment?.location || 'Tindahan ni Isko · BU Student Center Ground Floor'}
                </p>
              </div>
            </div>

            {/* Live dispatch stamps: appoint_start/appoint_end for pickup,
                deliver_expect (ETA) / deliver_end (claim time) for delivery. */}
            {[
              isDelivery
                ? { label: 'Expected delivery', value: delivery.expect }
                : { label: 'Claim window', value: appointment.start ? `${appointment.start} – ${appointment.end || '—'}` : null },
              isDelivery && delivery.received
                ? { label: 'Received at', value: delivery.received }
                : null,
              !isDelivery && appointment.closed
                ? { label: 'Claimed at', value: appointment.closed }
                : null,
              !isDelivery && appointment.status
                ? { label: 'Appointment status', value: appointment.status }
                : null,
              isDelivery && delivery.recipient
                ? { label: 'Recipient', value: delivery.recipient }
                : null,
              isDelivery && delivery.phone
                ? { label: 'Contact', value: delivery.phone }
                : null,
            ]
              .filter((row) => row && row.value)
              .map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-3 text-xs">
                  <span className="text-gray-500">{row.label}</span>
                  <span className="font-semibold text-gray-800 text-right">{row.value}</span>
                </div>
              ))}

            {/* Live courier booking: status in plain words + the LalaMove
                tracking link the customer can follow. */}
            {courier && (courierTrackUrl || courier.order_id || courier.status) && (
              <div className="p-3 rounded-xl border border-slate-100 bg-white flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Courier
                  </p>
                  <p className="text-xs font-semibold text-gray-800">
                    {courierLabel(courier.status)}
                  </p>
                  {courier.order_id && (
                    <p className="text-[11px] text-gray-500 font-mono truncate">
                      {courier.order_id}
                    </p>
                  )}
                </div>
                {courierTrackUrl && (
                  <a
                    href={courierTrackUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-brand-orange hover:bg-orange-50 transition-colors"
                  >
                    Track parcel
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Items Ordered Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Items Ordered
            </h3>
            <div className="space-y-3.5">
              {(orderItems.length ? orderItems : [null]).map((entry, idx) => {
                const product = entry?.product || {}
                const prodvar = entry?.prodvar || null
                const productImage =
                  prodvar?.prodvar_pic ||
                  entry?.prodvar_pic ||
                  entry?.pic ||
                  product.main_image ||
                  (Array.isArray(product.prod_images) ? product.prod_images[0] : product.prod_images) ||
                  order.image ||
                  null
                const name = product.prod_name || product.name || entry?.prod_name || order.name
                // `amount` is the unit price, `line_total` the line; the
                // legacy `item_amount` alias is a LINE total, never a unit.
                const price = Number(entry?.amount ?? order.price ?? 0)
                const qty = Number(entry?.qty ?? entry?.item_qty ?? order.qty ?? 1)
                const size = prodvar?.prodvar_name ?? entry?.size ?? order.size ?? null
                const color =
                  prodvar?.prodvar_pic
                    ? { name: prodvar.prodvar_name || 'Variation', value: '#FF6A00' }
                    : entry?.color ?? order.color ?? null
                const itemKey = entry?.item_id ?? `${entry?.bag_id ?? 'line'}-${idx}`
                const targetProdId = entry?.prod_id || product?.prod_tag || product?.prod_id || order.productId

                const rowContent = (
                  <div className="flex gap-3.5 items-center p-2 -m-2 rounded-xl hover:bg-slate-50 transition-colors group">
                    <div className="w-16 h-16 rounded-xl bg-slate-50 flex items-center justify-center shrink-0 overflow-hidden border border-slate-200 p-1 group-hover:border-brand-orange/40 transition-colors">
                      {productImage ? (
                        <img
                          src={getImageUrl(productImage)}
                          alt={name}
                          className="w-full h-full object-contain"
                          onError={(e) => {
                            // If variation picture fails, fallback gracefully
                            if (order.image && e.currentTarget.src !== getImageUrl(order.image)) {
                              e.currentTarget.src = getImageUrl(order.image)
                            }
                          }}
                        />
                      ) : (
                        <ShirtIcon className="w-6 h-6 text-brand-orange opacity-40" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="font-semibold text-gray-900 text-sm truncate group-hover:text-brand-orange transition-colors">
                          {name}
                        </h4>
                        {targetProdId != null && (
                          <span className="text-[11px] font-medium text-brand-orange shrink-0 flex items-center gap-0.5 opacity-80 group-hover:opacity-100">
                            <span>View</span>
                            <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 flex-wrap">
                        {size && (
                          <>
                            <span>
                              Size: <strong className="text-gray-800">{size}</strong>
                            </span>
                            <span>·</span>
                          </>
                        )}
                        {color && (
                          <span className="flex items-center gap-1.5">
                            Color:{' '}
                            <span
                              className="w-2.5 h-2.5 rounded-sm border border-gray-300 inline-block shrink-0"
                              style={{ backgroundColor: color.value || color.name }}
                            />
                            <strong className="text-gray-800">{color.name}</strong>
                          </span>
                        )}
                        <span>
                          Qty: <strong className="text-gray-800">{qty}</strong>
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-brand-orange mt-1">
                        {formatPrice(price)} each
                      </p>
                    </div>
                  </div>
                )

                const varId = prodvar?.prodvar_id || entry?.prodvar_id || null

                return targetProdId != null ? (
                  <Link
                    key={itemKey}
                    to={`/product/${targetProdId}`}
                    state={{
                      from: `/orders/${order.id}`,
                      ordId: order.id,
                      variationId: varId,
                    }}
                    className="block focus:outline-none"
                    title={`View ${name}`}
                  >
                    {rowContent}
                  </Link>
                ) : (
                  <div key={itemKey}>
                    {rowContent}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Pricing Breakdown */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-2.5 shadow-2xs">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Order Financial Summary
            </h3>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Subtotal</span>
              <span className="font-semibold text-gray-800">{formatPrice(subtotal)}</span>
            </div>
            <div className="flex justify-between text-xs items-center">
              <span className="text-gray-500">
                Delivery Fee ({isDelivery ? 'Courier' : 'Store Pickup'})
              </span>
              <span className="font-semibold text-gray-800">
                {!isDelivery
                  ? 'FREE (Store Pickup)'
                  : deliveryFee > 0
                  ? `${formatPrice(deliveryFee)} (Paid)`
                  : 'Included'}
              </span>
            </div>
            {isDelivery && deliveryFee > 0 && (
              <p className="text-[10px] text-gray-400 text-right -mt-1">
                The fee charged for the courier was paid online with this order.
              </p>
            )}
            <div className="h-px bg-slate-200 my-1" />
            <div className="flex justify-between items-baseline">
              <span className="font-semibold text-gray-900 text-xs">Order Total</span>
              <span className="font-semibold text-brand-orange text-base">
                {formatPrice(total)}
              </span>
            </div>
          </div>

          {/* DOMAIN 26: the payment that settled this order - the method the
              customer picked, what was due, what was tendered and the change,
              exactly as the backend recorded it. */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Payment
            </h3>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="text-gray-500">Payment method</span>
                <span className="font-semibold text-gray-800">{pay.method}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="text-gray-500">Amount due</span>
                <span className="font-semibold text-gray-800">{formatPrice(pay.due)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="text-gray-500">Amount received</span>
                <span className="font-semibold text-gray-800">
                  {pay.given != null ? formatPrice(pay.given) : 'Not paid yet'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="text-gray-500">Change</span>
                <span className="font-semibold text-gray-800">
                  {pay.change != null ? formatPrice(pay.change) : '—'}
                </span>
              </div>
              <div className="h-px bg-slate-200 my-1" />
              <div className="flex items-start justify-between gap-3 text-xs">
                <span className="text-gray-500 shrink-0">Payment reference</span>
                <span className="font-mono text-[11px] text-gray-600 break-all text-right">
                  {pay.ref || '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Student Recipient Info */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-1 text-xs shadow-2xs">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              Claimant / Student Information
            </h3>
            <p className="text-xs font-semibold text-gray-900">
              {currentUser?.fullName || '—'}
            </p>
            <p className="text-gray-500">Contact: {currentUser?.phone || currentUser?.email || '—'}</p>
            <p className="text-gray-500">
              {[currentUser?.campus, currentUser?.college].filter(Boolean).join(' · ') || '—'}
            </p>
            <p className="text-gray-500">{currentUser?.course || ''}</p>
          </div>

          {/* Cancel (customer-requested, staff-approved - FLOW-ORD_LIST-04) */}
          {CAN_CANCEL.includes(order.status) && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-2 shadow-2xs">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Need help with this order?
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleCancel}
                  className="px-4 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-semibold hover:bg-rose-100 transition-colors cursor-pointer disabled:opacity-60"
                >
                  {busy ? 'Sending…' : 'Cancel Order'}
                </button>
              </div>
              <p className="text-[11px] text-gray-500">
                Cancellation is a request: the store reviews it and you'll get a notification
                once it's approved (the order then shows “Cancel requested”).
              </p>
            </div>
          )}

          {/* Rate & review each item once the order is claimed / received */}
          {canReviewOrder(order.status) && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-2 shadow-2xs">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Rate &amp; Review
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setReviewOpen(true)}
                  className="px-4 py-2 rounded-xl border border-amber-300 bg-amber-50 text-amber-800 text-xs font-semibold hover:bg-amber-100 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-amber-500" fill="currentColor" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                  Rate &amp; Review items
                </button>
              </div>
              <p className="text-[11px] text-gray-500">
                Rate each product in this order and share how it turned out.
              </p>
            </div>
          )}

          {/* Refund / Return Request (FLOW-ORD_LIST-04 / C11: customer requests return & refund after claiming) */}
          {CAN_REFUND.includes(order.status) && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-2 shadow-2xs">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Returns & Refunds
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleRequestRefund}
                  className="px-4 py-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-xs font-semibold hover:bg-amber-100 transition-colors cursor-pointer disabled:opacity-60"
                >
                  {busy ? 'Sending…' : 'Request for Refund'}
                </button>
              </div>
              <p className="text-[11px] text-gray-500">
                If there is an issue with your received items, you can request a return and refund. The store will review your request.
              </p>
            </div>
          )}

          {/* Return / Refund Requested Notice */}
          {['RETURN REQUESTED', 'TO CANCEL', 'CANCEL REQUESTED'].includes(order.status) && (
            <div className="bg-amber-50/70 rounded-2xl border border-amber-200/80 p-4 sm:p-5 space-y-1 shadow-2xs text-xs">
              <h3 className="font-semibold text-amber-900">
                {order.status === 'RETURN REQUESTED' ? 'Return & Refund Requested' : 'Cancellation Requested'}
              </h3>
              <p className="text-amber-800 text-[11px]">
                Your request is currently under review by our store administrators. We will update you once processed.
              </p>
            </div>
          )}

          {/* Digital receipt - issued once the order is claimed / received */}
          <DigitalReceipt
            order={order.raw}
            customer={currentUser?.cust_nickname || currentUser?.nickname || currentUser?.name || ''}
          />

          {/* Navigation Actions */}
          <div className="flex items-center gap-2 pt-2">
            <Link
              to="/orders"
              className="flex-1 h-9 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold text-xs flex items-center justify-center hover:bg-slate-50 transition-colors shadow-2xs"
            >
              Back to Orders
            </Link>
            {order.productId != null && (
              <Link
                to={`/product/${order.productId}`}
                className="flex-1 h-9 rounded-xl bg-brand-orange text-white font-semibold text-xs flex items-center justify-center hover:bg-brand-orange-dark transition-colors shadow-xs"
              >
                View Product Page
              </Link>
            )}
          </div>
        </div>
      </div>
      <OrderReviewModal
        isOpen={reviewOpen}
        order={order}
        onClose={() => setReviewOpen(false)}
      />
    </FocusedLayout>
  )
}

export default OrderDetail
