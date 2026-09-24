import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import QRCode from 'qrcode'
import { useToast } from '../hooks/useToast.js'
import { useAuth } from '../hooks/useAuth.js'
import AccountLayout from '../components/layout/AccountLayout.jsx'
import PageTitle from '../components/ui/PageTitle.jsx'
import PageHeader from '../components/ui/PageHeader.jsx'
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
  requestReturn,
} from '../services/orders.js'
import { getTrack, scanQr } from '../services/tracking.js'
import { mapServerOrder, STATUS_CONTEXT } from './Orders.jsx'
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx'

const RECEIVING = ['TO CLAIM', 'TO RECEIVE']
const CAN_CANCEL = ['TO PROCESS']
const CAN_RETURN = ['CLAIMED', 'UNCLAIMED']

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

  const load = useCallback(async () => {
    setLoading(true)
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
        setOrder(null)
        return
      }

      const mapped = mapServerOrder(row)
      setOrder(mapped)
      setTimeline([])
      setTrackRes(null)

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
      setLoading(false)
    }
  }, [id, custId])

  useEffect(() => {
    load()
  }, [load])

  /* QR payload: the signed code from POST /tracking/create, which is what
     staff scanners verify (REQ-APC-01). Only claimable/receivable orders
     show a QR (SRS QR-code verification). */
  const isDelivery = order?.fulfillment?.method === 'Courier Delivery'
  const showQr = Boolean(order && RECEIVING.includes(order.status))
  const qrPayload = !order ? null : trackQrOf(trackRes) || order.raw?.ord_tag || `ORD-${order.id}`

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
    } catch (err) {
      showToast(err?.message || 'Unable to request cancellation.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleReturn = async () => {
    if (busy) return
    setBusy(true)
    try {
      await requestReturn(order.id)
      showToast('Return requested. The store will review it shortly.', 'success')
      load()
    } catch (err) {
      showToast(err?.message || 'Unable to request a return.', 'error')
    } finally {
      setBusy(false)
    }
  }

  /* REQ-APC-02: the owning customer verifies a delivery by scanning the
     parcel code shown here; that moves TO RECEIVE -> CLAIMED. */
  const handleConfirmReceipt = async () => {
    if (busy || !qrPayload) return
    setBusy(true)
    try {
      const res = await scanQr(qrPayload, 'customer')
      showToast(res?.message || 'Order marked as received.', 'success')
      load()
    } catch (err) {
      showToast(err?.message || 'Unable to confirm receipt.', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <AccountLayout>
        <div className="px-4 py-4 pb-28 lg:px-0 lg:py-0 lg:pb-16 animate-fade-in">
          <div className="hidden md:block mb-5">
            <PageTitle title="Order Details" />
          </div>
          <div className="lg:hidden -mx-4 -mt-4 mb-4">
            <PageHeader title="Order Details" backTo="/orders" />
          </div>
          <div className="flex items-center justify-center py-24 text-center gap-3">
            <LoadingSpinner size={26} />
            <p className="text-sm text-gray-450 font-semibold">Loading order…</p>
          </div>
        </div>
      </AccountLayout>
    )
  }

  if (!order) {
    return (
      <AccountLayout>
        <div className="px-4 py-4 pb-28 lg:px-0 lg:py-0 lg:pb-16 animate-fade-in">
          <div className="hidden md:block mb-5">
            <PageTitle title="Order Details" />
          </div>
          <div className="lg:hidden -mx-4 -mt-4 mb-4">
            <PageHeader title="Order Details" backTo="/orders" />
          </div>
          <div className="flex flex-col items-center justify-center py-24 text-center px-6 animate-fade-in">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center border border-gray-200 mb-2">
              <PackageIcon className="w-7 h-7 text-gray-400" />
            </div>
            <h2 className="text-lg font-black text-gray-900">Order not found</h2>
            <p className="text-sm text-gray-450 mt-2">This order doesn't exist or may have been removed.</p>
            <button
              onClick={() => navigate('/orders')}
              className="mt-6 text-brand-orange font-bold text-sm hover:underline cursor-pointer"
            >
              Back to Orders
            </button>
          </div>
        </div>
      </AccountLayout>
    )
  }

  const orderItems = order.raw?.items || []
  const subtotal = order.subtotal
  const deliveryFee = isDelivery ? Number(order.raw?.ord_fee ?? order.raw?.dispatch_fee ?? 0) : 0
  const total = Number(order.raw?.ord_total ?? subtotal + deliveryFee)
  const statusContext = STATUS_CONTEXT[order.status] || order.statusContext

  return (
    <AccountLayout>
      <div className="px-4 py-4 pb-8 md:px-0 md:py-0 animate-fade-in">
        {/* Desktop Header */}
        <div className="hidden md:block mb-5">
          <PageTitle title="Order Details" />
        </div>

        {/* Mobile Title */}
        <div className="lg:hidden -mx-4 -mt-4 mb-4">
          <PageHeader title="Order Details" backTo="/orders" />
        </div>

        <div className="space-y-3.5">
          {/* Order Identity & Status Banner */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-3 shadow-2xs">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base sm:text-lg font-black text-gray-900">
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
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  {isDelivery ? 'Delivery Tracking' : 'Pickup Claim Pass'}
                </h3>
                <StatusBadge status={order.status} className="px-2 py-0.5" />
              </div>

              {showQr && (
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
                    <p className="font-black text-gray-900 text-sm">
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
                      <button
                        type="button"
                        onClick={handleConfirmReceipt}
                        disabled={busy}
                        className="mt-1 px-4 py-2 rounded-lg bg-brand-orange text-white text-xs font-bold hover:bg-orange-600 transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {busy ? 'Confirming…' : 'I received this order'}
                      </button>
                    )}
                  </div>
                </div>
              )}

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
                        <p className="font-bold text-gray-900">
                          {String(step.label).replace(/_/g, ' ')}
                        </p>
                        {step.time && (
                          <p className="text-gray-500 text-[11px]">
                            {new Date(step.time).toLocaleString()}
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
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Fulfillment Method
              </h3>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold uppercase tracking-wider">
                Paid at checkout
              </span>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/60 flex items-start gap-3">
              <span className="p-2 rounded-xl bg-white border border-slate-200 text-brand-orange shrink-0 mt-0.5 shadow-2xs">
                {isDelivery ? <TruckIcon className="w-5 h-5" /> : <MapPinIcon className="w-5 h-5" />}
              </span>
              <div className="flex-1 min-w-0 text-xs space-y-1">
                <strong className="text-gray-900 text-sm font-bold block">
                  {order.fulfillment?.method || 'Store Pickup'}
                </strong>
                <p className="text-gray-600">
                  {order.fulfillment?.location || 'Tindahan ni Isko · BU Student Center Ground Floor'}
                </p>
              </div>
            </div>
          </div>

          {/* Items Ordered Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
              Items Ordered
            </h3>
            <div className="space-y-3.5">
              {(orderItems.length ? orderItems : [null]).map((entry, idx) => {
                const product = entry?.product || {}
                const productImage =
                  entry?.color?.image ||
                  order.image ||
                  product.image ||
                  product.images?.[0] ||
                  null
                const name = product.name || product.prod_name || order.name
                const price = Number(entry?.item_amount ?? order.price ?? 0)
                const qty = Number(entry?.item_qty ?? order.qty ?? 1)
                const size = entry?.size ?? order.size ?? product.size ?? null
                const color = entry?.color ?? order.color ?? null
                const itemKey = entry?.prod_id ?? idx

                return (
                  <div key={itemKey} className="flex gap-3.5 items-center">
                    <div className="w-16 h-16 rounded-xl bg-slate-50 flex items-center justify-center shrink-0 overflow-hidden border border-slate-200 p-1">
                      {productImage ? (
                        <img
                          src={getImageUrl(productImage)}
                          alt={name}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <ShirtIcon className="w-6 h-6 text-brand-orange opacity-40" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-gray-900 text-sm truncate">{name}</h4>
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
                      <p className="text-xs font-bold text-brand-orange mt-1">
                        {formatPrice(price)} each
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Pricing Breakdown */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-2.5 shadow-2xs">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
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
            <div className="h-px bg-slate-200 my-1" />
            <div className="flex justify-between items-baseline">
              <span className="font-bold text-gray-900 text-xs">Order Total</span>
              <span className="font-black text-brand-orange text-base">
                {formatPrice(total)}
              </span>
            </div>
          </div>

          {/* Student Recipient Info */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-1 text-xs shadow-2xs">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
              Claimant / Student Information
            </h3>
            <p className="text-xs font-bold text-gray-900">
              {currentUser?.fullName || '—'}
            </p>
            <p className="text-gray-500">Contact: {currentUser?.phone || currentUser?.email || '—'}</p>
            <p className="text-gray-500">
              {[currentUser?.campus, currentUser?.college].filter(Boolean).join(' · ') || '—'}
            </p>
            <p className="text-gray-500">{currentUser?.course || ''}</p>
          </div>

          {/* Cancel / Return (customer-requested, staff-approved) */}
          {(CAN_CANCEL.includes(order.status) || CAN_RETURN.includes(order.status)) && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-2 shadow-2xs">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Need help with this order?
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                {CAN_CANCEL.includes(order.status) && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleCancel}
                    className="px-4 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-bold hover:bg-rose-100 transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {busy ? 'Sending…' : 'Cancel Order'}
                  </button>
                )}
                {CAN_RETURN.includes(order.status) && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleReturn}
                    className="px-4 py-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-xs font-bold hover:bg-amber-100 transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {busy ? 'Sending…' : 'Request Return / Refund'}
                  </button>
                )}
              </div>
              <p className="text-[11px] text-gray-500">
                Requests are reviewed by the store team. You'll get a notification once it's
                approved.
              </p>
            </div>
          )}

          {/* Navigation Actions */}
          <div className="flex items-center gap-2 pt-2">
            <Link
              to="/orders"
              className="flex-1 h-9 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold text-xs flex items-center justify-center hover:bg-slate-50 transition-colors shadow-2xs"
            >
              Back to Orders
            </Link>
            {order.productId != null && (
              <Link
                to={`/product/${order.productId}`}
                className="flex-1 h-9 rounded-xl bg-brand-orange text-white font-bold text-xs flex items-center justify-center hover:bg-brand-orange-dark transition-colors shadow-xs"
              >
                View Product Page
              </Link>
            )}
          </div>
        </div>
      </div>
    </AccountLayout>
  )
}

export default OrderDetail
