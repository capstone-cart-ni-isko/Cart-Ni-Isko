import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import QRCode from 'qrcode'
import Modal from '../ui/Modal.jsx'
import Button from '../ui/Button.jsx'
import StatusBadge from '../ui/StatusBadge.jsx'
import { formatPrice } from '../ui/PriceTag.jsx'
import { getImageUrl } from '../../utils/imageUtils.js'
import {
  PackageIcon,
  ShirtIcon,
  TruckIcon,
  MapPinIcon,
  MessageSquareIcon,
} from '../ui/Icons.jsx'
import { fetchOrder, requestCancel, updateOrder } from '../../services/orders.js'
import { getTrack, scanQr } from '../../services/tracking.js'
import { parseDate, paymentSummary } from '../../services/dashboard.js'
import { QrScanModal } from '../ui/QRScanner.jsx'
import DigitalReceipt from '../ui/DigitalReceipt.jsx'
import LoadingSpinner from '../ui/LoadingSpinner.jsx'
import { useToast } from '../../hooks/useToast.js'
import { useAuth } from '../../hooks/useAuth.js'
import { useApiChange } from '../../hooks/useApiChange.js'
import { STATUS_CONTEXT } from '../../routes/Orders.jsx'

const RECEIVING = ['TO CLAIM', 'TO RECEIVE']
const CAN_CANCEL = ['TO PROCESS']
const CAN_REFUND = ['CLAIMED', 'RECEIVED', 'DELIVERED', 'COMPLETED']

const COURIER_STATUS_LABELS = {
  ASSIGNING_DRIVER: 'Finding a driver',
  ON_GOING: 'Driver on the way',
  PICKED_UP: 'Picked up',
  COMPLETED: 'Arrived',
  CANCELED: 'Courier unavailable — the store is re-arranging',
  REJECTED: 'Courier unavailable — the store is re-arranging',
  EXPIRED: 'Courier unavailable — the store is re-arranging',
}

function courierLabel(status) {
  const key = String(status || '').trim().toUpperCase()
  if (COURIER_STATUS_LABELS[key]) return COURIER_STATUS_LABELS[key]
  return key ? key.replace(/_/g, ' ') : 'Courier assigned'
}

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

function trackQrOf(res) {
  const d = res?.data ?? res ?? null
  return d?.qr_code ?? d?.deliver_qr ?? d?.qr ?? null
}

/**
 * Standardized Customer Order Details Popup Modal.
 * Combines the best of customer OrderDetail and admin DrawerPanel popup aesthetics,
 * adhering strictly to showing ONLY the existing customer order details.
 */
export default function CustomerOrderDetailModal({
  order: initialOrder,
  isOpen,
  onClose,
  onOrderUpdated,
}) {
  const { showToast } = useToast()
  const { currentUser } = useAuth()
  const [order, setOrder] = useState(initialOrder)
  const [fullOrderData, setFullOrderData] = useState(initialOrder?.raw || null)
  const [loading, setLoading] = useState(false)
  const [timeline, setTimeline] = useState([])
  const [trackRes, setTrackRes] = useState(null)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [scanMode, setScanMode] = useState(null)

  const orderId = initialOrder?.id ?? initialOrder?.ord_id

  const loadDetails = useCallback(async () => {
    if (!orderId) return
    setLoading(true)
    try {
      let raw = null
      try {
        raw = await fetchOrder(orderId)
      } catch {
        raw = initialOrder?.raw || null
      }
      if (raw) {
        setFullOrderData(raw)
      }

      const method = initialOrder?.fulfillment?.method || (raw?.ord_claiming === 'deliver' ? 'Courier Delivery' : 'Store Pickup')
      const trackType = method === 'Courier Delivery' ? 'delivery' : 'pickup'
      try {
        const res = await getTrack(orderId, trackType)
        setTrackRes(res)
        setTimeline(parseTimeline(res))
      } catch (err) {
        console.warn('Tracking lookup failed in modal:', err?.message)
      }
    } finally {
      setLoading(false)
    }
  }, [orderId, initialOrder])

  useEffect(() => {
    if (isOpen && orderId) {
      setOrder(initialOrder)
      setFullOrderData(initialOrder?.raw || null)
      loadDetails()
    }
  }, [isOpen, orderId, initialOrder, loadDetails])

  const version = useApiChange(['orders', 'checkout', 'tracking', 'delivery', 'appoint'])
  useEffect(() => {
    if (isOpen && orderId) {
      loadDetails()
    }
  }, [isOpen, orderId, version, loadDetails])

  const effectiveRaw = fullOrderData || order?.raw || {}
  const status = order?.status || 'TO PROCESS'
  const isDelivery = order?.fulfillment?.method === 'Courier Delivery'
  const showQr = Boolean(order && RECEIVING.includes(status))
  const qrPayload = trackQrOf(trackRes) || effectiveRaw?.appoint_qr || effectiveRaw?.deliver_qr || order?.pickupQr || order?.deliverQr || null

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
        console.warn('QR generation failed in modal:', err?.message)
        if (alive) setQrDataUrl('')
      })
    return () => {
      alive = false
    }
  }, [showQr, qrPayload])

  const handleCopyOrderId = () => {
    if (orderId) {
      navigator.clipboard?.writeText(String(orderId))
      showToast(`Copied Order ID: #${orderId}`)
    }
  }

  const handleCancel = async () => {
    if (busy || !orderId) return
    setBusy(true)
    try {
      await requestCancel(orderId)
      showToast('Cancellation requested. The store will review it shortly.', 'success')
      loadDetails()
      onOrderUpdated?.()
    } catch {
      showToast('Unable to request cancellation.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleRequestRefund = async () => {
    if (busy || !orderId) return
    if (!window.confirm('Are you sure you want to request a return and refund for this order? The store will review your request.')) {
      return
    }
    setBusy(true)
    try {
      await updateOrder(orderId, { ord_status: 'RETURN REQUESTED' })
      showToast('Return requested. The store will review it shortly.', 'success')
      loadDetails()
      onOrderUpdated?.()
    } catch (err) {
      showToast(err?.message || 'Unable to request return and refund.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleConfirmReceipt = async () => {
    if (busy || !qrPayload) return
    setBusy(true)
    try {
      const res = await scanQr(qrPayload, 'customer')
      showToast(res?.message || 'Order marked as received.', 'success')
      loadDetails()
      onOrderUpdated?.()
    } catch {
      showToast('Unable to confirm receipt.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const canClaimPickup = !isDelivery && status === 'TO CLAIM' && Boolean(effectiveRaw?.appoint_qr || order?.pickupQr)
  const orderItems = effectiveRaw?.items || []
  const subtotal = order?.subtotal ?? (orderItems.reduce((sum, i) => sum + (Number(i.amount || 0) * Number(i.qty || i.item_qty || 1)), 0))
  const deliveryFee = isDelivery
    ? Number(effectiveRaw?.deliver_fee_charged ?? effectiveRaw?.deliver_fee_actual ?? 0)
    : 0
  const total = Number(effectiveRaw?.ord_amount ?? order?.total ?? (subtotal + deliveryFee))
  const statusContext = STATUS_CONTEXT[status] || order?.statusContext || ''
  const pay = paymentSummary(effectiveRaw || {})

  const appointment = {
    start: formatStamp(effectiveRaw?.appoint_start),
    end: formatStamp(effectiveRaw?.appoint_end),
    status: effectiveRaw?.appoint_status || null,
    closed: formatStamp(effectiveRaw?.appoint_closed),
  }
  const delivery = {
    expect: formatStamp(effectiveRaw?.deliver_expect),
    received: formatStamp(effectiveRaw?.deliver_end),
    address: effectiveRaw?.deliver_address || order?.fulfillment?.location || null,
    phone: effectiveRaw?.deliver_phone || null,
    recipient: effectiveRaw?.deliver_recipient || null,
  }
  const courier = isDelivery ? effectiveRaw?.courier || null : null
  const courierTrackUrl = courier?.share_url || effectiveRaw?.deliver_share_link || null

  if (!isOpen || !order) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Order #${orderId}`}
      subtitle={`Placed on ${order.date || '—'}`}
      size="xl"
      sheet={true}
      footer={
        <div className="flex items-center justify-between w-full gap-2">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            Close
          </Button>
          {order.productId != null && (
            <Link
              to={`/product/${order.productId}`}
              onClick={onClose}
              className="flex-1 h-9 rounded-xl bg-brand-orange text-white font-semibold text-xs flex items-center justify-center hover:bg-brand-orange-dark transition-colors shadow-xs"
            >
              View Product Page
            </Link>
          )}
        </div>
      }
    >
      <div className="modal-scroll space-y-3.5 pr-0.5 pb-2">
        {/* Hero Header Banner */}
        <div className="relative overflow-hidden rounded-2xl p-4 sm:p-5 bg-gradient-to-br from-brand-orange to-amber-500 text-white shadow-sm">
          <div className="relative z-10 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xl sm:text-2xl font-black tracking-tight">
                  #{orderId}
                </span>
                <button
                  type="button"
                  onClick={handleCopyOrderId}
                  className="p-1 rounded-md text-white/80 hover:text-white hover:bg-white/20 transition-colors cursor-pointer"
                  title="Copy Order ID"
                >
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                </button>
              </div>
              <p className="text-white/80 text-xs mt-0.5 font-medium">
                Placed on {order.date || '—'}
              </p>
            </div>
            <div className="text-right">
              <StatusBadge status={status} />
            </div>
          </div>
          {statusContext && (
            <div className="relative z-10 mt-3 p-2.5 bg-black/15 backdrop-blur-xs rounded-xl text-xs text-white/95 flex items-center gap-2 border border-white/10">
              <MessageSquareIcon className="w-4 h-4 text-white/80 shrink-0" />
              <span>{statusContext}</span>
            </div>
          )}
        </div>

        {/* QR & Tracking (visible only while TO CLAIM / TO RECEIVE) */}
        {(showQr || timeline.length > 0) && (
          <div className="p-4.5 bg-[var(--surface-2)] rounded-2xl border border-[var(--line)] shadow-2xs space-y-3.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider">
                {isDelivery ? 'Delivery Tracking' : 'Pickup Claim Pass'}
              </h3>
              <StatusBadge status={status} className="px-2.5 py-0.5 text-xs" />
            </div>

            {showQr && qrPayload && (
              <div className="flex flex-col sm:flex-row items-center gap-4 p-4 bg-[var(--surface)] border border-[var(--line)] rounded-xl">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="Order verification QR code"
                    className="w-40 h-40 rounded-xl bg-white p-2.5 border border-[var(--line)] shrink-0 shadow-2xs"
                  />
                ) : (
                  <div className="w-40 h-40 rounded-xl bg-[var(--surface-2)] border border-[var(--line)] flex items-center justify-center text-xs text-[var(--muted)] shrink-0">
                    Generating QR…
                  </div>
                )}
                <div className="text-xs text-[var(--ink-2)] space-y-2 text-center sm:text-left flex-1 min-w-0">
                  <p className="font-bold text-[var(--ink)] text-base">
                    {isDelivery ? 'Courier verification code' : 'Show this QR at the pickup counter'}
                  </p>
                  <p className="text-[var(--muted)] leading-relaxed text-xs">
                    {isDelivery
                      ? 'The courier scans this code when your order is handed over.'
                      : 'Present this code together with your student ID to claim your order at Tindahan ni Isko, BU Student Center Ground Floor.'}
                  </p>
                  <p className="font-mono text-xs text-[var(--muted)] break-all bg-[var(--surface-2)] px-2.5 py-1.5 rounded-lg border border-[var(--line)]">
                    {String(qrPayload)}
                  </p>
                  {isDelivery && status === 'TO RECEIVE' && (
                    <div className="flex flex-wrap gap-2 pt-1.5">
                      <button
                        type="button"
                        onClick={() => setScanMode('delivery')}
                        className="px-3.5 py-2 rounded-lg bg-brand-orange text-white text-xs font-semibold hover:bg-orange-600 transition-colors cursor-pointer"
                      >
                        Scan Parcel QR Code
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmReceipt}
                        disabled={busy}
                        className="px-3.5 py-2 rounded-lg bg-[var(--surface-3)] text-[var(--ink)] text-xs font-semibold hover:bg-[var(--line)] transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {busy ? 'Confirming…' : 'I received this order (manual)'}
                      </button>
                    </div>
                  )}
                  {canClaimPickup && (
                    <button
                      type="button"
                      onClick={() => setScanMode('pickup')}
                      className="mt-1 px-3.5 py-2 rounded-lg bg-brand-orange text-white text-xs font-semibold hover:bg-orange-600 transition-colors cursor-pointer"
                    >
                      Scan to claim
                    </button>
                  )}
                </div>
              </div>
            )}

            <QrScanModal
              open={scanMode === 'delivery'}
              title="Scan Parcel QR Code"
              subtitle="Point the camera at the QR code on your parcel."
              fallbackCode={isDelivery ? qrPayload : null}
              fallbackLabel="Use this order's code"
              onClose={() => setScanMode(null)}
              onSuccess={() => {
                loadDetails()
                onOrderUpdated?.()
              }}
            />
            <QrScanModal
              open={scanMode === 'pickup'}
              title={`Scan to claim · Order #${orderId}`}
              subtitle="Point the camera at the claim QR code for this pickup order."
              fallbackCode={effectiveRaw?.appoint_qr || qrPayload}
              fallbackLabel="Use this order's code"
              onClose={() => setScanMode(null)}
              onSuccess={() => {
                loadDetails()
                onOrderUpdated?.()
              }}
            />

            {timeline.length > 0 && (
              <ol className="space-y-0 pt-2.5 border-t border-[var(--line)]">
                {timeline.map((step, idx) => (
                  <li key={step.key} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${
                          idx === timeline.length - 1 ? 'bg-brand-orange' : 'bg-emerald-500'
                        }`}
                      />
                      {idx < timeline.length - 1 && <span className="w-px flex-1 bg-[var(--line)]" />}
                    </div>
                    <div className="pb-3 text-xs min-w-0">
                      <p className="font-semibold text-[var(--ink)] text-xs">
                        {String(step.label).replace(/_/g, ' ')}
                      </p>
                      {step.time && (
                        <p className="text-[var(--muted)] text-xs">
                          {parseDate(step.time)?.toLocaleString() ?? String(step.time)}
                        </p>
                      )}
                      {step.note && <p className="text-[var(--muted)] text-xs">{step.note}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}

        {/* 2-Column Grid: Fulfillment + Payment Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Fulfillment Card */}
          <div className="p-4.5 rounded-2xl bg-[var(--surface-2)] border border-[var(--line)] shadow-2xs space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[var(--ink)] text-sm">Fulfillment Method</span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs font-bold uppercase tracking-wider">
                Paid at checkout
              </span>
            </div>

            <div className="p-3.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] flex items-start gap-3">
              <span className="p-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--line)] text-brand-orange shrink-0 mt-0.5">
                {isDelivery ? <TruckIcon className="w-4.5 h-4.5" /> : <MapPinIcon className="w-4.5 h-4.5" />}
              </span>
              <div className="flex-1 min-w-0 space-y-1">
                <strong className="text-[var(--ink)] font-semibold block text-sm">
                  {order.fulfillment?.method || 'Store Pickup'}
                </strong>
                <p className="text-[var(--muted)] text-xs">
                  {order.fulfillment?.location || 'Tindahan ni Isko · BU Student Center Ground Floor'}
                </p>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              {[
                isDelivery
                  ? { label: 'Expected delivery', value: delivery.expect }
                  : { label: 'Claim window', value: appointment.start ? `${appointment.start} – ${appointment.end || '—'}` : null },
                isDelivery && delivery.received ? { label: 'Received at', value: delivery.received } : null,
                !isDelivery && appointment.closed ? { label: 'Claimed at', value: appointment.closed } : null,
                !isDelivery && appointment.status ? { label: 'Appointment status', value: appointment.status } : null,
                isDelivery && delivery.recipient ? { label: 'Recipient', value: delivery.recipient } : null,
                isDelivery && delivery.phone ? { label: 'Contact', value: delivery.phone } : null,
              ]
                .filter((r) => r && r.value)
                .map((r) => (
                  <div key={r.label} className="flex items-start justify-between gap-2.5">
                    <span className="text-[var(--muted)]">{r.label}</span>
                    <span className="font-semibold text-[var(--ink-2)] text-right">{r.value}</span>
                  </div>
                ))}
            </div>

            {courier && (courierTrackUrl || courier.order_id || courier.status) && (
              <div className="p-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
                    Courier
                  </p>
                  <p className="text-xs font-semibold text-[var(--ink)]">
                    {courierLabel(courier.status)}
                  </p>
                  {courier.order_id && (
                    <p className="text-xs text-[var(--muted)] font-mono truncate">
                      {courier.order_id}
                    </p>
                  )}
                </div>
                {courierTrackUrl && (
                  <a
                    href={courierTrackUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 px-3 py-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] text-xs font-bold text-brand-orange hover:bg-orange-500/10 transition-colors"
                  >
                    Track parcel
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Payment & Financial Summary Card */}
          <div className="p-4.5 rounded-2xl bg-[var(--surface-2)] border border-[var(--line)] shadow-2xs space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[var(--ink)] text-sm">Payment Information</span>
              <span className="text-xs font-semibold text-[var(--ink)] px-2.5 py-0.5 rounded-md bg-[var(--surface-3)]">
                {pay.method}
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Subtotal</span>
                <span className="font-semibold text-[var(--ink)] text-sm">{formatPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Delivery Fee</span>
                <span className="font-semibold text-[var(--ink)] text-sm">
                  {!isDelivery
                    ? 'FREE (Pickup)'
                    : deliveryFee > 0
                    ? `${formatPrice(deliveryFee)} (Paid)`
                    : 'Included'}
                </span>
              </div>
              <div className="h-px bg-[var(--line)] my-1.5" />
              <div className="flex justify-between items-baseline">
                <span className="font-bold text-[var(--ink)] text-sm">Order Total</span>
                <span className="font-bold text-brand-orange text-base">{formatPrice(total)}</span>
              </div>
              <div className="h-px bg-[var(--line)] my-1.5" />
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Amount received</span>
                <span className="font-semibold text-[var(--ink)] text-sm">
                  {pay.given != null ? formatPrice(pay.given) : 'Not paid yet'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Change</span>
                <span className="font-semibold text-[var(--ink)] text-sm">
                  {pay.change != null ? formatPrice(pay.change) : '—'}
                </span>
              </div>
              <div className="flex items-start justify-between gap-2.5 pt-1.5 border-t border-[var(--line)]">
                <span className="text-[var(--muted)] shrink-0">Reference</span>
                <span className="font-mono text-xs text-[var(--ink-2)] break-all text-right">
                  {pay.ref || '—'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Ordered Items Section */}
        <div className="space-y-2.5">
          <h4 className="font-bold text-[var(--ink)] text-sm">
            Items Ordered ({orderItems.length || 1})
          </h4>
          <div className="divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)] overflow-hidden bg-[var(--surface)] shadow-2xs">
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
              const price = Number(entry?.amount ?? order.price ?? 0)
              const qty = Number(entry?.qty ?? entry?.item_qty ?? order.qty ?? 1)
              const size = prodvar?.prodvar_name ?? entry?.size ?? order.size ?? null
              const color = prodvar?.prodvar_pic
                ? { name: prodvar.prodvar_name || 'Variation', value: '#FF6A00' }
                : entry?.color ?? order.color ?? null
              const itemKey = entry?.item_id ?? `${entry?.bag_id ?? 'line'}-${idx}`
              const targetProdId = entry?.prod_id || product?.prod_tag || product?.prod_id || order.productId

              const rowContent = (
                <div className="flex gap-4 items-center p-3.5 hover:bg-[var(--surface-2)] transition-colors group">
                  <div className="w-14 h-14 rounded-xl bg-[var(--surface-2)] flex items-center justify-center shrink-0 overflow-hidden border border-[var(--line)] p-1 group-hover:scale-105 transition-transform">
                    {productImage ? (
                      <img
                        src={getImageUrl(productImage)}
                        alt={name}
                        className="w-full h-full object-contain"
                        onError={(e) => {
                          if (order.image && e.currentTarget.src !== getImageUrl(order.image)) {
                            e.currentTarget.src = getImageUrl(order.image)
                          }
                        }}
                      />
                    ) : (
                      <ShirtIcon className="w-7 h-7 text-brand-orange opacity-40" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h5 className="font-bold text-[var(--ink)] text-sm truncate group-hover:text-brand-orange transition-colors">
                        {name}
                      </h5>
                      {targetProdId != null && (
                        <span className="text-xs font-semibold text-brand-orange shrink-0 flex items-center gap-1 opacity-80 group-hover:opacity-100">
                          <span>View</span>
                          <span>→</span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-[var(--muted)] flex-wrap">
                      {size && (
                        <span>
                          Size: <strong className="text-[var(--ink-2)]">{size}</strong>
                        </span>
                      )}
                      {size && color && <span>·</span>}
                      {color && (
                        <span className="flex items-center gap-1.5">
                          Color:{' '}
                          <span
                            className="w-2.5 h-2.5 rounded-xs border border-[var(--line)] inline-block shrink-0"
                            style={{ backgroundColor: color.value || color.name }}
                          />
                          <strong className="text-[var(--ink-2)]">{color.name}</strong>
                        </span>
                      )}
                      <span>·</span>
                      <span>
                        Qty: <strong className="text-[var(--ink-2)]">{qty}</strong>
                      </span>
                    </div>
                    <p className="text-xs font-bold text-brand-orange mt-1">
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
                    from: `/orders`,
                    ordId: order.id,
                    variationId: varId,
                  }}
                  onClick={onClose}
                  className="block focus:outline-none"
                  title={`View ${name}`}
                >
                  {rowContent}
                </Link>
              ) : (
                <div key={itemKey}>{rowContent}</div>
              )
            })}
          </div>
        </div>

        {/* Claimant / Student Recipient Info */}
        <div className="p-4.5 rounded-2xl bg-[var(--surface-2)] border border-[var(--line)] shadow-2xs space-y-1.5 text-xs">
          <h3 className="font-bold text-[var(--muted)] uppercase tracking-wider text-xs mb-1.5">
            Claimant / Student Information
          </h3>
          <p className="text-sm font-bold text-[var(--ink)]">
            {currentUser?.fullName || '—'}
          </p>
          <p className="text-[var(--muted)]">Contact: {currentUser?.phone || currentUser?.email || '—'}</p>
          <p className="text-[var(--muted)]">
            {[currentUser?.campus, currentUser?.college].filter(Boolean).join(' · ') || '—'}
          </p>
          <p className="text-[var(--muted)]">{currentUser?.course || ''}</p>
        </div>

        {/* Cancel Action (TO PROCESS) */}
        {CAN_CANCEL.includes(status) && (
          <div className="p-4.5 bg-[var(--surface-2)] rounded-2xl border border-[var(--line)] shadow-2xs space-y-2.5">
            <h3 className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider">
              Need help with this order?
            </h3>
            <div>
              <button
                type="button"
                disabled={busy}
                onClick={handleCancel}
                className="px-4 py-2 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-semibold hover:bg-rose-500/20 transition-colors cursor-pointer disabled:opacity-60"
              >
                {busy ? <><LoadingSpinner size={13} /> Sending…</> : 'Cancel Order'}
              </button>
            </div>
            <p className="text-xs text-[var(--muted)]">
              Cancellation is a request: the store reviews it and you will get an update once approved.
            </p>
          </div>
        )}

        {/* Refund / Return Request Action */}
        {CAN_REFUND.includes(status) && (
          <div className="p-4.5 bg-[var(--surface-2)] rounded-2xl border border-[var(--line)] shadow-2xs space-y-2.5">
            <h3 className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider">
              Returns & Refunds
            </h3>
            <div>
              <button
                type="button"
                disabled={busy}
                onClick={handleRequestRefund}
                className="px-4 py-2 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-semibold hover:bg-amber-500/20 transition-colors cursor-pointer disabled:opacity-60"
              >
                {busy ? <><LoadingSpinner size={13} /> Sending…</> : 'Request for Refund'}
              </button>
            </div>
            <p className="text-xs text-[var(--muted)]">
              If there is an issue with your received items, you can request a return and refund. The store will review your request.
            </p>
          </div>
        )}

        {/* Return / Refund Requested Notice */}
        {['RETURN REQUESTED', 'TO CANCEL', 'CANCEL REQUESTED'].includes(status) && (
          <div className="p-4.5 bg-amber-500/10 rounded-2xl border border-amber-500/25 space-y-1.5 text-xs">
            <h3 className="font-bold text-amber-700 dark:text-amber-300 text-sm">
              {status === 'RETURN REQUESTED' ? 'Return & Refund Requested' : 'Cancellation Requested'}
            </h3>
            <p className="text-amber-600 dark:text-amber-400 leading-relaxed">
              Your request is currently under review by our store administrators. We will update you once processed.
            </p>
          </div>
        )}

        {/* Digital receipt view */}
        <div className="pt-1">
          <DigitalReceipt
            order={effectiveRaw}
            customer={currentUser?.cust_nickname || currentUser?.nickname || currentUser?.name || ''}
          />
        </div>
      </div>
    </Modal>
  )
}
