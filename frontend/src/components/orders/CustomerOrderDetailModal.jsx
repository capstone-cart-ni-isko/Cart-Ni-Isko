import { useState, useEffect, useCallback, useRef } from 'react'
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
import { fetchOrder, requestCancel, updateOrder, submitDeliveryDetails, confirmDeliveryFeePayment, switchClaimingMethod } from '../../services/orders.js'
import { getTrack, scanQr } from '../../services/tracking.js'
import { parseDate, paymentSummary } from '../../services/dashboard.js'
import { QrScanModal } from '../ui/QRScanner.jsx'
import DigitalReceipt from '../ui/DigitalReceipt.jsx'
import LoadingSpinner from '../ui/LoadingSpinner.jsx'
import AppointmentForm from '../appointment/AppointmentForm.jsx'
import { useToast } from '../../hooks/useToast.js'
import { useAuth } from '../../hooks/useAuth.js'
import { useApiChange } from '../../hooks/useApiChange.js'
import { STATUS_CONTEXT } from '../../routes/Orders.jsx'
import { canReviewOrder } from '../../services/reviews.js'

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
  onReview,
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
  const [isRescheduling, setIsRescheduling] = useState(false)
  const [isSwitchingToPickup, setIsSwitchingToPickup] = useState(false)
  const [switchingClaiming, setSwitchingClaiming] = useState(false)

  const orderId = initialOrder?.id ?? initialOrder?.ord_id

  /* The modal reads the order in the background: it must never blank the
     content that is already on screen, and two reads must never race.
     `initialOrderRef` keeps the parent's copy available to the reader
     without making the reader depend on the parent's object identity. */
  const initialOrderRef = useRef(initialOrder)
  const inFlightRef = useRef(false)
  const queuedRef = useRef(false)
  // Bumped when a read was asked for while another one was running: the read
  // effect watches it and serves that queued request.
  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    initialOrderRef.current = initialOrder
  }, [initialOrder])

  const loadDetails = useCallback(async () => {
    if (!orderId) return
    // One read at a time: a request that arrives while one is running waits
    // for it instead of stacking on top of it.
    if (inFlightRef.current) {
      queuedRef.current = true
      return
    }
    inFlightRef.current = true
    setLoading(true)
    try {
      const fallback = initialOrderRef.current
      let raw = null
      try {
        raw = await fetchOrder(orderId)
      } catch {
        raw = fallback?.raw || null
      }
      if (raw) {
        setFullOrderData(raw)
      }

      const method =
        fallback?.fulfillment?.method || (raw?.ord_claiming === 'deliver' ? 'Courier Delivery' : 'Store Pickup')
      const trackType = method === 'Courier Delivery' ? 'delivery' : 'pickup'
      try {
        const res = await getTrack(orderId, trackType)
        setTrackRes(res)
        setTimeline(parseTimeline(res))
      } catch (err) {
        console.warn('Tracking lookup failed in modal:', err?.message)
      }
    } finally {
      inFlightRef.current = false
      setLoading(false)
      if (queuedRef.current) {
        queuedRef.current = false
        setReloadTick((tick) => tick + 1)
      }
    }
  }, [orderId])

  // A different order in the same modal starts from scratch.
  useEffect(() => {
    setFullOrderData(null)
    setTimeline([])
    setTrackRes(null)
  }, [orderId])

  // The parent re-reads the order after every action, so the mapped copy the
  // modal shows has to follow it (the status badge, the totals).
  useEffect(() => {
    if (!isOpen) return
    setOrder(initialOrder)
    setFullOrderData((prev) => prev || initialOrder?.raw || null)
  }, [isOpen, initialOrder])

  // Read the full order when the modal opens, and again whenever a realtime
  // ping says the order moved. The reader keeps the content on screen, so a
  // ping no longer makes the modal flash.
  const version = useApiChange(['orders', 'checkout', 'tracking', 'delivery', 'appoint'])
  useEffect(() => {
    if (!isOpen || !orderId) return
    loadDetails()
  }, [isOpen, orderId, version, reloadTick, loadDetails])

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

  const [showDeliveryForm, setShowDeliveryForm] = useState(false)
  const [deliveryAddrInput, setDeliveryAddrInput] = useState('')
  const [deliveryRecipientInput, setDeliveryRecipientInput] = useState('')
  const [deliveryPhoneInput, setDeliveryPhoneInput] = useState('')
  const [deliveryNotesInput, setDeliveryNotesInput] = useState('')
  const [deliverySpeedInput, setDeliverySpeedInput] = useState('standard')

  useEffect(() => {
    if (effectiveRaw?.deliver_address) {
      setDeliveryAddrInput(effectiveRaw.deliver_address)
    } else if (currentUser?.address) {
      setDeliveryAddrInput(currentUser.address)
    }
    if (effectiveRaw?.deliver_recipient) {
      setDeliveryRecipientInput(effectiveRaw.deliver_recipient)
    } else if (currentUser?.fullName) {
      setDeliveryRecipientInput(currentUser.fullName)
    }
    if (effectiveRaw?.deliver_phone) {
      setDeliveryPhoneInput(effectiveRaw.deliver_phone)
    } else if (currentUser?.phone) {
      setDeliveryPhoneInput(currentUser.phone)
    }
  }, [effectiveRaw, currentUser])

  const handleSubmitDeliveryDetails = async (e) => {
    e?.preventDefault?.()
    if (!deliveryAddrInput.trim()) {
      showToast('Please enter your delivery address.', 'error')
      return
    }
    setBusy(true)
    try {
      const res = await submitDeliveryDetails({
        ord_id: orderId,
        deliver_address: deliveryAddrInput.trim(),
        deliver_recipient: deliveryRecipientInput.trim(),
        deliver_phone: deliveryPhoneInput.trim(),
        deliver_notes: deliveryNotesInput.trim(),
        speed: deliverySpeedInput,
      })

      if (res?.data?.checkout_url) {
        showToast('Redirecting to PayMongo to complete delivery fee payment…', 'success')
        window.location.href = res.data.checkout_url
        return
      }

      showToast(res?.message || 'Delivery details updated successfully.', 'success')
      setShowDeliveryForm(false)
      loadDetails()
      onOrderUpdated?.()
    } catch (err) {
      showToast(err?.message || 'Failed to submit delivery details.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleSwitchToDelivery = async () => {
    if (switchingClaiming || !orderId) return
    if (!window.confirm('Switch this order fulfillment from Store Pickup to Courier Delivery?')) return
    setSwitchingClaiming(true)
    try {
      const res = await switchClaimingMethod({
        ord_id: orderId,
        claiming: 'deliver',
      })
      showToast(res?.message || 'Fulfillment switched to Courier Delivery.', 'success')
      await loadDetails()
      onOrderUpdated?.()
    } catch (err) {
      showToast(err?.message || 'Failed to switch fulfillment method.', 'error')
    } finally {
      setSwitchingClaiming(false)
    }
  }

  const handlePickupSlotSelected = async (saved) => {
    if (!orderId) return
    setSwitchingClaiming(true)
    try {
      const res = await switchClaimingMethod({
        ord_id: orderId,
        claiming: 'pickup',
        appoint_start: saved?.appoint_start || saved?.start,
        appoint_id: saved?.appoint_id || saved?.id,
      })
      showToast(res?.message || 'Fulfillment switched to Store Pickup.', 'success')
      setIsSwitchingToPickup(false)
      await loadDetails()
      onOrderUpdated?.()
    } catch (err) {
      showToast(err?.message || 'Failed to switch fulfillment method.', 'error')
    } finally {
      setSwitchingClaiming(false)
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
  const appointId = effectiveRaw?.appoint_id || effectiveRaw?.appointment?.appoint_id || null
  const canReschedulePickup = !isDelivery && Boolean(appointId) && !['CLAIMED', 'RECEIVED', 'CANCELLED', 'RETURNED'].includes(status)
  const canSwitchClaiming = status === 'TO PROCESS' || String(effectiveRaw?.ord_status || '').toLowerCase() === 'processing'

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
        <div className="flex items-center justify-end w-full gap-2">
          <Button variant="secondary" onClick={onClose} className="w-full sm:w-auto px-6">
            Close
          </Button>
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
              {/* A background refresh never blanks the modal - it only says
                  that it is reading again. */}
              {loading && (
                <p className="mt-1 flex items-center justify-end gap-1 text-[10px] font-medium text-white/85">
                  <LoadingSpinner size={10} />
                  Refreshing…
                </p>
              )}
            </div>
          </div>
          {statusContext && (
            <div className="relative z-10 mt-3 p-2.5 bg-black/15 backdrop-blur-xs rounded-xl text-xs text-white/95 flex items-center gap-2 border border-white/10">
              <MessageSquareIcon className="w-4 h-4 text-white/80 shrink-0" />
              <span>{statusContext}</span>
            </div>
          )}
        </div>

        {/* Complete Delivery Details & Fee Banner (TO DELIVER) */}
        {isDelivery && status === 'TO DELIVER' && (
          <div className="p-4 sm:p-5 bg-gradient-to-br from-blue-500/10 via-brand-orange/10 to-transparent rounded-2xl border-2 border-brand-orange/40 space-y-3.5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-brand-orange text-white text-[10px] font-bold uppercase tracking-wider">
                  Action Required
                </span>
                <h3 className="text-base font-bold text-[var(--ink)]">
                  Complete Delivery Details &amp; Fee
                </h3>
                <p className="text-xs text-[var(--muted)] leading-relaxed">
                  Your ordered items are ready for dispatch! Please provide your delivery address and settle the courier fee so we can send out your parcel.
                </p>
              </div>
            </div>

            {!showDeliveryForm ? (
              <button
                type="button"
                onClick={() => setShowDeliveryForm(true)}
                className="w-full py-2.5 px-4 rounded-xl bg-brand-orange hover:bg-brand-orange-dark text-white text-xs font-bold transition-all shadow-2xs hover:shadow-xs active:scale-98 flex items-center justify-center gap-2 cursor-pointer"
              >
                <TruckIcon className="w-4 h-4" />
                <span>Enter Delivery Address &amp; Pay Courier Fee</span>
              </button>
            ) : (
              <form onSubmit={handleSubmitDeliveryDetails} className="space-y-3 pt-2 border-t border-[var(--line)]">
                <div className="space-y-1">
                  <label className="text-2xs font-bold uppercase tracking-wider text-[var(--muted)]">
                    Recipient Name
                  </label>
                  <input
                    type="text"
                    value={deliveryRecipientInput}
                    onChange={(e) => setDeliveryRecipientInput(e.target.value)}
                    placeholder="Recipient Full Name"
                    className="field-input w-full py-2 px-3 text-xs rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-2xs font-bold uppercase tracking-wider text-[var(--muted)]">
                    Contact Phone
                  </label>
                  <input
                    type="text"
                    value={deliveryPhoneInput}
                    onChange={(e) => setDeliveryPhoneInput(e.target.value)}
                    placeholder="e.g. 09123456789"
                    className="field-input w-full py-2 px-3 text-xs rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-2xs font-bold uppercase tracking-wider text-[var(--muted)]">
                    Complete Delivery Address *
                  </label>
                  <textarea
                    rows={2}
                    value={deliveryAddrInput}
                    onChange={(e) => setDeliveryAddrInput(e.target.value)}
                    placeholder="House/Unit no., Street, Barangay, City, Province"
                    required
                    className="field-input w-full py-2 px-3 text-xs rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-2xs font-bold uppercase tracking-wider text-[var(--muted)]">
                    Delivery Speed
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: 'priority', label: 'Priority', fee: '₱100', eta: 'Next day' },
                      { key: 'standard', label: 'Standard', fee: '₱50', eta: '2-3 days' },
                      { key: 'saver', label: 'Saver', fee: '₱30', eta: '4-5 days' },
                    ].map((tier) => (
                      <button
                        key={tier.key}
                        type="button"
                        onClick={() => setDeliverySpeedInput(tier.key)}
                        className={`py-2 px-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer text-center ${
                          deliverySpeedInput === tier.key
                            ? 'bg-brand-orange text-white border-brand-orange'
                            : 'bg-[var(--surface)] text-[var(--ink)] border-[var(--line)]'
                        }`}
                      >
                        <div>{tier.label}</div>
                        <div className="text-[10px] opacity-80">{tier.fee} · {tier.eta}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-2xs font-bold uppercase tracking-wider text-[var(--muted)]">
                    Delivery Notes (Optional)
                  </label>
                  <input
                    type="text"
                    value={deliveryNotesInput}
                    onChange={(e) => setDeliveryNotesInput(e.target.value)}
                    placeholder="e.g. Leave at guardhouse or gate"
                    className="field-input w-full py-2 px-3 text-xs rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={busy}
                    className="btn btn--primary flex-1 py-2 text-xs font-bold flex items-center justify-center gap-2"
                  >
                    {busy ? <><LoadingSpinner size={13} /> Processing…</> : 'Proceed to Pay Courier Fee →'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDeliveryForm(false)}
                    className="btn btn--secondary py-2 px-3 text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* QR & Tracking (visible only while TO CLAIM / TO RECEIVE) */}
        {(showQr || timeline.length > 0) && (
          <div className="p-4 bg-[var(--surface)] rounded-xl border border-[var(--line)] space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
              <h3 className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider">
                {isDelivery ? 'Delivery Tracking' : 'Pickup Claim Pass'}
              </h3>
              <StatusBadge status={status} className="self-start px-2.5 py-0.5 text-xs" />
            </div>

            {showQr && qrPayload && (
              <div className="flex flex-col items-center gap-3.5 p-4 bg-[var(--surface)] border border-[var(--line)] rounded-xl text-center">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="Order verification QR code"
                    className="w-44 h-44 rounded-xl bg-white p-2.5 border border-[var(--line)] shadow-sm"
                  />
                ) : (
                  <div className="w-44 h-44 rounded-xl bg-[var(--surface)] border border-[var(--line)] flex items-center justify-center text-xs text-[var(--muted)]">
                    Generating QR…
                  </div>
                )}
                <div className="text-xs text-[var(--ink-2)] space-y-2 max-w-md">
                  <p className="font-bold text-[var(--ink)] text-base">
                    {isDelivery ? 'Courier verification code' : 'Show this QR at the pickup counter'}
                  </p>
                  <p className="text-[var(--muted)] leading-relaxed text-xs">
                    {isDelivery
                      ? 'The courier scans this code when your order is handed over.'
                      : 'Present this code together with your student ID to claim your order at Tindahan ni Isko, BU Student Center Ground Floor.'}
                  </p>
                  <p className="font-mono text-xs text-[var(--ink-2)] break-all bg-[var(--surface)] px-2.5 py-1.5 rounded-lg border border-[var(--line)] inline-block">
                    {String(qrPayload)}
                  </p>
                  {isDelivery && status === 'TO RECEIVE' && (
                    <div className="flex flex-col sm:flex-row justify-center gap-2 pt-1.5 w-full">
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
                        className="px-3.5 py-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] text-xs font-semibold hover:bg-orange-500/5 transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {busy ? 'Confirming…' : 'I received this order (manual)'}
                      </button>
                    </div>
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

        {/* Vertically Stacked Fulfillment & Financial Sections (No 2-column horizontal grid, clean surfaces) */}
        <div className="space-y-3.5">
          {/* Fulfillment Section */}
          <div className="p-4 rounded-xl bg-[var(--surface)] border border-[var(--line)] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
              <span className="font-bold text-[var(--ink)] text-sm">Fulfillment Method</span>
              <span className="self-start inline-flex items-center px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs font-bold uppercase tracking-wider">
                Paid at checkout
              </span>
            </div>

            <div className="p-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] flex flex-col sm:flex-row items-start gap-3">
              <span className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/20 text-brand-orange shrink-0">
                {isDelivery ? <TruckIcon className="w-4.5 h-4.5" /> : <MapPinIcon className="w-4.5 h-4.5" />}
              </span>
              <div className="flex-1 min-w-0 space-y-0.5">
                <strong className="text-[var(--ink)] font-semibold block text-sm">
                  {order.fulfillment?.method || 'Store Pickup'}
                </strong>
                <p className="text-[var(--muted)] text-xs">
                  {order.fulfillment?.location || 'Tindahan ni Isko · BU Student Center Ground Floor'}
                </p>
              </div>
            </div>

            <div className="space-y-2 text-xs divide-y divide-[var(--line)]">
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
                  <div key={r.label} className="pt-2 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1">
                    <span className="text-[var(--muted)]">{r.label}</span>
                    <span className="font-semibold text-[var(--ink-2)]">{r.value}</span>
                  </div>
                ))}
            </div>

            {/* Customer can switch claiming method between pickup and delivery while status is Processing */}
            {canSwitchClaiming && (
              <div className="pt-2 border-t border-[var(--line)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <span className="text-xs text-[var(--muted)]">
                  {isDelivery ? 'Prefer to pick up at the store instead?' : 'Need this order delivered to your address instead?'}
                </span>
                <button
                  type="button"
                  disabled={switchingClaiming}
                  onClick={() => {
                    if (isDelivery) {
                      setIsSwitchingToPickup(true)
                    } else {
                      handleSwitchToDelivery()
                    }
                  }}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-orange/40 bg-brand-orange/10 text-brand-orange hover:bg-brand-orange/20 font-semibold text-xs transition-colors cursor-pointer w-full sm:w-auto disabled:opacity-50"
                >
                  {isDelivery ? <MapPinIcon className="w-3.5 h-3.5" /> : <TruckIcon className="w-3.5 h-3.5" />}
                  <span>
                    {switchingClaiming
                      ? 'Switching…'
                      : isDelivery
                      ? 'Switch to Store Pickup'
                      : 'Switch to Courier Delivery'}
                  </span>
                </button>
              </div>
            )}

            {/* FLOW-MANAGE_BOOKED-04: Allow customer to reschedule claiming of pickup orders */}
            {canReschedulePickup && (
              <div className="pt-2 border-t border-[var(--line)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <span className="text-xs text-[var(--muted)]">Need a different pickup time?</span>
                <button
                  type="button"
                  onClick={() => setIsRescheduling(true)}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-orange/40 bg-brand-orange/10 text-brand-orange hover:bg-brand-orange/20 font-semibold text-xs transition-colors cursor-pointer w-full sm:w-auto"
                >
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <span>Reschedule Pickup</span>
                </button>
              </div>
            )}

            {courier && (courierTrackUrl || courier.order_id || courier.status) && (
              <div className="p-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
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
                    className="inline-block text-center px-3 py-1.5 rounded-lg border border-brand-orange/30 bg-brand-orange/10 text-xs font-bold text-brand-orange hover:bg-brand-orange/20 transition-colors"
                  >
                    Track parcel
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Payment Summary Section (Stacked vertically) */}
          <div className="p-4 rounded-xl bg-[var(--surface)] border border-[var(--line)] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
              <span className="font-bold text-[var(--ink)] text-sm">Payment Information</span>
              <span className="self-start text-xs font-semibold text-[var(--ink)] px-2.5 py-0.5 rounded-md border border-[var(--line)] bg-[var(--surface)]">
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
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 pt-1.5 border-t border-[var(--line)]">
                <span className="text-[var(--muted)] shrink-0">Reference</span>
                <span className="font-mono text-xs text-[var(--ink-2)] break-all">
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
          <div className="divide-y divide-[var(--line)] rounded-xl border border-[var(--line)] overflow-hidden bg-[var(--surface)]">
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
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center p-3.5 hover:bg-orange-500/5 transition-colors group">
                  <div className="w-14 h-14 rounded-lg bg-[var(--surface)] flex items-center justify-center shrink-0 overflow-hidden border border-[var(--line)] p-1 group-hover:scale-105 transition-transform">
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
                  <div className="flex-1 min-w-0 space-y-1">
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
                    <div className="flex items-center gap-2 text-xs text-[var(--muted)] flex-wrap">
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
                    <p className="text-xs font-bold text-brand-orange">
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
        <div className="p-4 rounded-xl bg-[var(--surface)] border border-[var(--line)] space-y-1.5 text-xs">
          <h3 className="font-bold text-[var(--muted)] uppercase tracking-wider text-xs mb-1">
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
          <div className="p-4 bg-[var(--surface)] rounded-xl border border-[var(--line)] space-y-2.5">
            <h3 className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider">
              Need help with this order?
            </h3>
            <div>
              <button
                type="button"
                disabled={busy}
                onClick={handleCancel}
                className="w-full sm:w-auto px-4 py-2 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-semibold hover:bg-rose-500/20 transition-colors cursor-pointer disabled:opacity-60"
              >
                {busy ? <><LoadingSpinner size={13} /> Sending…</> : 'Cancel Order'}
              </button>
            </div>
            <p className="text-xs text-[var(--muted)]">
              Cancellation is a request: the store reviews it and you will get an update once approved.
            </p>
          </div>
        )}

        {/* Rate & review the items once the order is claimed / received */}
        {onReview && canReviewOrder(status) && (
          <div className="p-4 bg-[var(--surface)] rounded-xl border border-[var(--line)] space-y-2.5">
            <h3 className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider">
              How were your items?
            </h3>
            <div>
              <button
                type="button"
                onClick={() => onReview({ ...order, raw: effectiveRaw || order?.raw })}
                className="w-full sm:w-auto px-4 py-2 rounded-xl border border-amber-300 bg-amber-50 text-amber-800 text-xs font-semibold hover:bg-amber-100 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-amber-500" fill="currentColor" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                Rate &amp; Review items
              </button>
            </div>
            <p className="text-xs text-[var(--muted)]">
              Rate each product in this order and share how it turned out.
            </p>
          </div>
        )}

        {/* Refund / Return Request Action */}
        {CAN_REFUND.includes(status) && (
          <div className="p-4 bg-[var(--surface)] rounded-xl border border-[var(--line)] space-y-2.5">
            <h3 className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider">
              Returns & Refunds
            </h3>
            <div>
              <button
                type="button"
                disabled={busy}
                onClick={handleRequestRefund}
                className="w-full sm:w-auto px-4 py-2 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-semibold hover:bg-amber-500/20 transition-colors cursor-pointer disabled:opacity-60"
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

      {/* Reschedule Pickup Modal (FLOW-MANAGE_BOOKED-04) */}
      {isRescheduling && (
        <Modal
          isOpen={isRescheduling}
          onClose={() => setIsRescheduling(false)}
          title={`Reschedule Pickup · Order #${orderId}`}
          subtitle="Select a new available pickup slot for your order"
          size="wide"
        >
          <div className="p-1">
            <AppointmentForm
              type="PICKUP"
              custId={currentUser?.cust_id ?? currentUser?.id}
              reschedule={{
                id: appointId,
                type: 'PICKUP',
                dateISO: effectiveRaw?.appoint_start ? String(effectiveRaw.appoint_start).slice(0, 10) : '',
              }}
              title="Pick a new claim slot"
              onSuccess={() => {
                setIsRescheduling(false)
                showToast('Pickup appointment rescheduled successfully.', 'success')
                loadDetails()
                onOrderUpdated?.()
              }}
              onCancel={() => setIsRescheduling(false)}
            />
          </div>
        </Modal>
      )}

      {/* Switch to Pickup Slot Selection Modal */}
      {isSwitchingToPickup && (
        <Modal
          isOpen={isSwitchingToPickup}
          onClose={() => setIsSwitchingToPickup(false)}
          title={`Select Pickup Slot · Order #${orderId}`}
          subtitle="Choose an available slot to claim your order at the store"
          size="wide"
        >
          <div className="p-1">
            <AppointmentForm
              type="PICKUP"
              custId={currentUser?.cust_id ?? currentUser?.id}
              collectOnly={true}
              title="Pick a claim slot"
              onSuccess={handlePickupSlotSelected}
              onCancel={() => setIsSwitchingToPickup(false)}
            />
          </div>
        </Modal>
      )}
    </Modal>
  )
}
