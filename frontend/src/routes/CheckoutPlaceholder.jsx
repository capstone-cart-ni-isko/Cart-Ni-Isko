import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import { useCart } from '../hooks/useCart.js'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from '../hooks/useToast.js'
import AppShell from '../components/layout/AppShell.jsx'
import BottomNav from '../components/layout/BottomNav.jsx'
import Button from '../components/ui/Button.jsx'
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx'
import logo from '../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'
import { CheckIcon } from '../components/ui/Icons.jsx'
import { getImageUrl } from '../utils/imageUtils.js'
import { getDispatch, payOrder } from '../services/checkout.js'
import { addToCart as addCartOrder, removeFromCart as removeCartOrder } from '../services/cart.js'
import { removeProductFromOrder } from '../services/orders.js'
import { createAppointment, closeAppointment } from '../services/appointments.js'
import SlotPicker from '../components/ui/SlotPicker.jsx'

/* Delivery tiers previewed through POST /checkout/dispatch (SRS shipping fees).
   ETAs match the server's estimate: +24 hours / +2 days / +5 days. */
const DELIVERY_TIERS = [
  { key: 'priority', label: 'Priority', fee: 100, eta: '24 hours' },
  { key: 'standard', label: 'Standard', fee: 50, eta: '2 days' },
  { key: 'saver', label: 'Saver', fee: 30, eta: '5 days' },
]

function prodIdOf(item) {
  return item?.prodId ?? item?.product?.prodId ?? null
}

/** /cart/add nests the new row under data.order, other endpoints inline it. */
function pickOrdId(res) {
  const d = res?.data
  if (d && typeof d === 'object' && !Array.isArray(d)) {
    return d.ord_id ?? d.id ?? d.order?.ord_id ?? d.order?.id ?? null
  }
  if (Array.isArray(d) && d.length) return d[0].ord_id ?? d[0].id ?? null
  return res?.ord_id ?? null
}

/** "2026-09-26 10:30" -> "Sat, Sep 26 at 10:30 AM". */
function slotWhen(start) {
  const at = new Date(String(start || '').replace(' ', 'T'))
  if (Number.isNaN(at.getTime())) return String(start || '')
  const day = at.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const time = at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${day} at ${time}`
}

/** Local YYYY-MM-DD (toISOString would give the UTC date). */
function todayLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addressText(addr) {
  if (!addr) return ''
  if (typeof addr === 'string') return addr
  return [addr.addressLine, addr.barangay, addr.city, addr.province, addr.postalCode]
    .filter(Boolean)
    .join(', ')
}

/** Receipt summary from the POST /checkout/payment response. */
function receiptFrom(data, ordId, dispatchType, slot) {
  const payment = data?.payment || {}
  const dispatch = data?.dispatch || {}
  const order = data?.order || {}
  const isDelivery = dispatchType === 'delivery'
  return {
    ordId: order.ord_id ?? ordId,
    tag: order.ord_tag || `#${ordId}`,
    isDelivery,
    paid: Number(payment.pay_given ?? 0),
    due: Number(payment.pay_due ?? 0),
    change: Number(payment.pay_change ?? 0),
    deliverRef: dispatch.deliver_ref || '',
    deliverAddress: dispatch.deliver_address || '',
    deliverDate: dispatch.deliver_date || null,
    pickupWhen: !isDelivery && slot ? slotWhen(slot) : '',
    // Delivery: the parcel code the customer scans on arrival. Pickup: the
    // ORD- tag staff scan at the counter (both accepted by /tracking/scan).
    qrCode: isDelivery ? dispatch.deliver_qr || '' : order.ord_tag || '',
  }
}

function formatWhen(value) {
  if (!value) return ''
  const d = new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString()
}

function CheckoutPlaceholder() {
  const navigate = useNavigate()
  const {
    cartItems,
    selectedItemIds,
    selectedItems,
    clearSelectedItems,
    refreshCart,
  } = useCart()
  const { currentUser, addresses } = useAuth()
  const { showToast } = useToast()

  // State: 'review' | 'confirmed'
  const [step, setStep] = useState('review')
  const [dispatchType, setDispatchType] = useState('pickup')
  const [countdown, setCountdown] = useState(5)

  // Pickup scheduling (REQ-OC-01: pickup claim slot is part of checkout)
  const [pickupDate, setPickupDate] = useState('')
  // Full slot start from GET /appoint/slots ("YYYY-MM-DD HH:MM")
  const [slot, setSlot] = useState('')

  // Delivery (address + priority tier)
  const [addressIdx, setAddressIdx] = useState(0)
  const [tier, setTier] = useState('standard')

  // Server checkout state
  const [serverPreview, setServerPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [paidRef, setPaidRef] = useState('')
  const [receipt, setReceipt] = useState(null)
  const [receiptQr, setReceiptQr] = useState('')

  const custId = currentUser?.cust_id ?? currentUser?.id ?? null
  const itemsToCheckout = selectedItems.length > 0 ? selectedItems : cartItems
  // item_amount is a line total on the server (prod_price * qty), so the
  // displayed subtotal is rebuilt from the unit price the catalog reports.
  const orderSubtotal = itemsToCheckout.reduce(
    (sum, item) => sum + (item.product?.price ?? item.price ?? 0) * (Number(item.qty) || 1),
    0
  )

  const sortedAddresses = [...(addresses || [])].sort(
    (a, b) => Number(b.isDefault) - Number(a.isDefault)
  )
  const chosenAddress = sortedAddresses[addressIdx] || null
  const deliveryAddress = addressText(chosenAddress)

  // The selection can be checked out directly only when it covers whole cart
  // rows; anything else becomes a temporary order that is rolled back on failure.
  const sourceOrdIds = [...new Set(itemsToCheckout.map((i) => i.ordId).filter(Boolean))]
  const coversWholeRows =
    sourceOrdIds.length > 0 &&
    sourceOrdIds.every((id) =>
      cartItems.filter((i) => i.ordId === id).every((i) => selectedItemIds.includes(i.cartItemId))
    ) &&
    itemsToCheckout.every((i) => i.ordId)
  const directOrdId =
    sourceOrdIds.length === 1 && coversWholeRows && selectedItems.length > 0
      ? sourceOrdIds[0]
      : null

  const tierInfo = DELIVERY_TIERS.find((t) => t.key === tier) || DELIVERY_TIERS[1]
  const clientFee = dispatchType === 'delivery' ? tierInfo.fee : 0
  const serverDue =
    serverPreview?.total_due ?? serverPreview?.total ?? serverPreview?.ord_total ?? null
  const totalDue = serverDue != null ? Number(serverDue) : orderSubtotal + clientFee

  // The server derives every fee itself; it only needs the modality inputs.
  const dispatchOptions = (appointId = null) =>
    dispatchType === 'delivery'
      ? { speed: tier, deliver_address: deliveryAddress }
      : appointId
      ? { appoint_id: appointId }
      : {}

  /* Preview fees/total from the backend for the current modality (REQ-OC-01).
     Pickup is skipped here: it quotes only once its appointment exists, which
     happens at pay time - see handlePlaceOrder. */
  useEffect(() => {
    if (!directOrdId || dispatchType !== 'delivery') {
      setServerPreview(null)
      return undefined
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await getDispatch(directOrdId, dispatchType, dispatchOptions())
        if (!cancelled) setServerPreview(res?.data || null)
      } catch {
        if (!cancelled) setServerPreview(null)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directOrdId, dispatchType, tier, addressIdx])


  // Never leave the checkout empty-handed.
  useEffect(() => {
    if (step === 'review' && cartItems.length === 0 && selectedItems.length === 0) {
      navigate('/cart', { replace: true })
    }
  }, [step, cartItems.length, selectedItems.length, navigate])

  /* Success: drop the checked-out lines from their source rows, then resync. */
  const removeSourceLines = async () => {
    await Promise.allSettled(
      selectedItems
        .filter((i) => i.ordId && prodIdOf(i))
        .map((i) => removeProductFromOrder(i.ordId, prodIdOf(i)))
    )
  }

  const handlePlaceOrder = async () => {
    if (busy) return
    setError(null)

    if (!custId) {
      navigate('/signin')
      return
    }
    if (itemsToCheckout.length === 0) {
      setError('Please select at least one item to checkout.')
      return
    }
    // REQ-CW-02: Block checkout if any non-pre-order item is out of stock
    const outOfStockItems = itemsToCheckout.filter(
      (i) => !i.product.preOrder && (Number(i.product.qty) || 0) <= 0
    )
    if (outOfStockItems.length > 0) {
      setError('Some items are currently out of stock and cannot be checked out. Please remove them from your selection.')
      return
    }
    if (dispatchType === 'pickup' && (!pickupDate || !slot)) {
      setError('Please choose a pickup date and time to continue.')
      return
    }
    if (dispatchType === 'delivery' && !deliveryAddress) {
      setError('Please add a delivery address in My Address to continue.')
      return
    }

    setBusy(true)
    let tempOrdId = null
    let appointId = null

    try {
      // 1. Resolve the order being paid: existing cart row, or a temp order.
      let ordId = directOrdId
      if (!ordId) {
        const missing = itemsToCheckout.find((i) => !prodIdOf(i))
        if (missing) {
          throw new Error(
            `"${missing.product?.name || 'An item'}" is not synced to your account yet. Refresh your bag and try again.`
          )
        }
        const res = await addCartOrder(
          custId,
          itemsToCheckout.map((i) => ({
            prod_id: prodIdOf(i),
            item_qty: Number(i.qty || 1),
            item_amount:
              (i.product?.price ?? 0) * (Number(i.qty) || 1),
          }))
        )
        ordId = pickOrdId(res)
        if (!ordId) {
          throw new Error('Unable to prepare your order. Please try again.')
        }
        tempOrdId = ordId
      }

      // 2. Reserve the pickup slot before quoting or charging. Pickup checkout
      //    requires a previously booked order-claiming appointment, and the
      //    slot grid expects the date and start time as one datetime.
      if (dispatchType === 'pickup') {
        const res = await createAppointment({
          cust_id: custId,
          appoint_date: slot,
          appoint_type: 'CLAIM',
          appoint_desc: `Pickup of order ${ordId}`,
        })
        appointId = res?.data?.appoint_id ?? res?.data?.id ?? null
        if (!appointId) {
          throw new Error('Unable to reserve your pickup slot. Please try again.')
        }
      }

      // 3. Ask the backend for the authoritative amount due (REQ-OC-01).
      let due = totalDue
      try {
        const res = await getDispatch(ordId, dispatchType, dispatchOptions(appointId))
        const serverTotal = res?.data?.total_due
        if (serverTotal != null) due = Number(serverTotal)
      } catch {
        // Preview unavailable: pay the amount computed from the fee table.
      }

      // 4. Settle the payment; the server mints the gateway reference
      //    (REQ-OC-02) and returns it on the payment record.
      const payRes = await payOrder(ordId, dispatchType, due, dispatchOptions(appointId))
      const payRef = payRes?.data?.payment?.pay_ref ?? ''
      setReceipt(receiptFrom(payRes?.data, ordId, dispatchType, slot))

      // 5. Success: clean up the source rows and resync the cart.
      if (tempOrdId) await removeSourceLines()
      clearSelectedItems()
      refreshCart()
      setPaidRef(payRef)
      showToast('Payment received. Your order is now being processed!', 'success')
      setStep('confirmed')
      setCountdown(5)
    } catch (err) {
      // REQ-OC-02: failed payment must roll back every temp artifact.
      if (appointId) {
        closeAppointment(appointId, 'Checkout payment failed').catch(() => {})
      }
      if (tempOrdId) {
        removeCartOrder(tempOrdId).catch(() => {})
      }
      setError(err?.message || 'Payment failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  // Scannable copy of the order's claim / delivery code for the receipt.
  useEffect(() => {
    let alive = true
    if (!receipt?.qrCode) {
      setReceiptQr('')
      return () => {
        alive = false
      }
    }
    QRCode.toDataURL(String(receipt.qrCode), {
      margin: 1,
      width: 200,
      color: { dark: '#111827', light: '#ffffff' },
    })
      .then((url) => {
        if (alive) setReceiptQr(url)
      })
      .catch(() => {
        if (alive) setReceiptQr('')
      })
    return () => {
      alive = false
    }
  }, [receipt])

  // Countdown back to the cart when the order is confirmed. Paused while a
  // receipt is on screen so the customer can save the claim code.
  useEffect(() => {
    if (step !== 'confirmed' || receipt) return undefined

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          navigate('/cart')
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [step, receipt, navigate])

  if (step === 'confirmed') {
    return (
      <AppShell showNav={false}>
        <div className="min-h-dvh flex flex-col items-center justify-center p-6 pb-28 text-center animate-fade-in">
          <div className="w-20 h-20 bg-orange-50 rounded-xl flex items-center justify-center p-2.5 mb-4 relative">
            <img src={logo} alt="Tindahan ni Isko" className="w-14 h-14 object-contain" />
            <div className="absolute -top-1.5 -right-1.5 bg-brand-orange text-white p-1 rounded-full">
              <CheckIcon className="w-4 h-4 text-white" />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-1">Payment Confirmed!</h1>
          <p className="text-sm text-gray-600 font-normal max-w-[360px] leading-relaxed mb-3">
            Your payment has been received and your order is now being processed. We'll notify
            you via SMS/Email when it's ready for pick-up or out for courier delivery.
          </p>
          {paidRef && (
            <p className="text-xs font-mono text-gray-500 bg-slate-50 rounded-md px-3 py-1.5 mb-3">
              Gateway reference: {paidRef}
            </p>
          )}

          {receipt ? (
            <div className="w-full max-w-sm bg-white border border-slate-100 rounded-xl p-4 mb-6 text-left text-sm space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Receipt</p>
                <span className="font-mono text-xs font-bold text-gray-900">{receipt.tag}</span>
              </div>

              {receipt.qrCode && (
                <div className="flex flex-col items-center gap-1.5 py-1">
                  {receiptQr ? (
                    <img
                      src={receiptQr}
                      alt={receipt.isDelivery ? 'Delivery verification QR code' : 'Pickup claim QR code'}
                      className="w-36 h-36 rounded-lg border border-slate-200 p-1.5 bg-white"
                    />
                  ) : (
                    <div className="w-36 h-36 rounded-lg border border-slate-200 flex items-center justify-center text-xs text-gray-400">
                      Generating QR…
                    </div>
                  )}
                  <p className="text-xs text-gray-500 text-center">
                    {receipt.isDelivery
                      ? 'Scan this code from your order page when the courier hands over your parcel.'
                      : 'Show this code at the pickup counter to claim your order.'}
                  </p>
                </div>
              )}

              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-gray-600">
                  <span>Fulfillment</span>
                  <span className="font-semibold text-gray-900">
                    {receipt.isDelivery ? 'Courier Delivery' : 'Store Pickup'}
                  </span>
                </div>
                {receipt.pickupWhen && (
                  <div className="flex justify-between text-gray-600">
                    <span>Claim slot</span>
                    <span className="font-semibold text-gray-900">{receipt.pickupWhen}</span>
                  </div>
                )}
                {receipt.isDelivery && receipt.deliverRef && (
                  <div className="flex justify-between text-gray-600">
                    <span>Delivery ref</span>
                    <span className="font-mono font-semibold text-gray-900">{receipt.deliverRef}</span>
                  </div>
                )}
                {receipt.isDelivery && receipt.deliverDate && (
                  <div className="flex justify-between text-gray-600">
                    <span>Estimated arrival</span>
                    <span className="font-semibold text-gray-900">{formatWhen(receipt.deliverDate)}</span>
                  </div>
                )}
                {receipt.isDelivery && receipt.deliverAddress && (
                  <p className="text-gray-500 truncate" title={receipt.deliverAddress}>
                    Ship to: {receipt.deliverAddress}
                  </p>
                )}
                <div className="h-px bg-slate-100 my-1.5" />
                <div className="flex justify-between text-gray-600">
                  <span>Total due</span>
                  <span className="font-semibold text-gray-900">₱{receipt.due.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Paid</span>
                  <span className="font-semibold text-gray-900">₱{receipt.paid.toFixed(2)}</span>
                </div>
                {receipt.change > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>Change</span>
                    <span className="font-semibold text-gray-900">₱{receipt.change.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Dynamic countdown indicator */
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-orange-50 text-brand-orange text-sm font-semibold rounded-lg mb-6">
              <span>Redirecting back to your cart in {countdown}s...</span>
            </div>
          )}

          <div className="w-full max-w-xs space-y-2">
            {receipt?.ordId ? (
              <Link
                to={`/orders/${receipt.ordId}`}
                className="w-full h-11 rounded-lg font-bold text-sm bg-brand-orange hover:bg-brand-orange-dark text-white flex items-center justify-center transition-colors"
              >
                View This Order
              </Link>
            ) : (
              <Button
                onClick={() => navigate('/orders')}
                className="w-full h-11 rounded-lg font-bold text-sm cursor-pointer"
              >
                View My Orders Now
              </Button>
            )}
            <button
              type="button"
              onClick={() => navigate('/cart')}
              className="w-full text-sm font-semibold text-gray-500 hover:text-brand-orange transition-colors py-1 cursor-pointer"
            >
              Back to Cart
            </button>
          </div>
        </div>
        <BottomNav />
      </AppShell>
    )
  }

  return (
    <AppShell showNav={false}>
      <div className="min-h-dvh flex flex-col items-center justify-center p-4 pb-28 md:p-8 animate-fade-in bg-slate-50/60">
        <div className="w-full max-w-xl bg-white rounded-xl p-6 md:p-8 border border-slate-100 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <img src={logo} alt="Tindahan ni Isko" className="h-8 object-contain" />
              <div>
                <h1 className="text-xl font-bold text-gray-900 leading-tight">
                  Review &amp; Confirm Order
                </h1>
                <p className="text-sm text-gray-500">
                  Please review your order details before paying
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold px-3 py-1 bg-orange-50 text-brand-orange rounded-full">
              Step 2 of 2
            </span>
          </div>

          {/* Customer & Fulfillment Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="p-3.5 bg-slate-50 rounded-lg space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Customer Details
              </p>
              <p className="font-bold text-gray-900">{currentUser?.fullName || 'Customer'}</p>
              <p className="text-gray-500 truncate">{currentUser?.email || currentUser?.phone}</p>
              <p className="text-gray-500 font-mono">
                ID: {currentUser?.studentId || custId || '—'}
              </p>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-lg space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Fulfillment Method
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDispatchType('pickup')}
                  className={`flex-1 py-1.5 px-2 rounded-md font-semibold text-xs border transition-colors cursor-pointer ${
                    dispatchType === 'pickup'
                      ? 'bg-brand-orange text-white border-brand-orange'
                      : 'bg-white text-gray-600 border-slate-200'
                  }`}
                >
                  Store Pickup
                </button>
                <button
                  type="button"
                  onClick={() => setDispatchType('delivery')}
                  className={`flex-1 py-1.5 px-2 rounded-md font-semibold text-xs border transition-colors cursor-pointer ${
                    dispatchType === 'delivery'
                      ? 'bg-brand-orange text-white border-brand-orange'
                      : 'bg-white text-gray-600 border-slate-200'
                  }`}
                >
                  Courier Delivery
                </button>
              </div>
              <p className="text-xs text-gray-500 pt-0.5">
                {dispatchType === 'pickup'
                  ? 'Pickup at BU Main Campus Student Center — choose a date and time below'
                  : 'Courier delivery to your chosen address'}
              </p>
            </div>
          </div>

          {/* Pickup scheduling: date + slot grid */}
          {dispatchType === 'pickup' && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-bold text-gray-900">Pickup Schedule</p>
                <label className="flex items-center gap-2 text-xs text-gray-500">
                  <span>Date</span>
                  <input
                    type="date"
                    value={pickupDate}
                    min={todayLocal()}
                    onChange={(e) => setPickupDate(e.target.value)}
                    className="px-2 py-1.5 rounded-md border border-slate-200 text-xs text-gray-700 focus:border-brand-orange focus:ring-brand-orange/30"
                  />
                </label>
              </div>

              <SlotPicker date={pickupDate} type="CLAIM" value={slot} onChange={setSlot} />

              {slot && (
                <p className="text-xs font-semibold text-brand-orange bg-orange-50 rounded-lg p-2.5">
                  Pickup time: {slotWhen(slot)}
                </p>
              )}
            </div>
          )}

          {/* Delivery: address + priority tier */}
          {dispatchType === 'delivery' && (
            <div className="space-y-3 text-sm">
              <p className="font-bold text-gray-900">Delivery Address</p>
              {sortedAddresses.length > 0 && (
                <div className="space-y-1.5">
                  {sortedAddresses.map((addr, idx) => (
                    <button
                      key={addr.id ?? idx}
                      type="button"
                      onClick={() => setAddressIdx(idx)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                        addressIdx === idx
                          ? 'border-brand-orange bg-orange-50/60'
                          : 'border-slate-100 bg-white hover:bg-gray-50'
                      }`}
                    >
                      <span className="font-bold text-gray-800">
                        {addr.recipient || `Address ${idx + 1}`}
                      </span>
                      {addr.isDefault && (
                        <span className="ml-1.5 text-[10px] font-semibold text-brand-orange bg-orange-50 px-1.5 py-0.5 rounded uppercase">
                          Default
                        </span>
                      )}
                      <p className="text-gray-500 text-xs truncate mt-0.5">
                        {addressText(addr)}
                      </p>
                    </button>
                  ))}
                </div>
              )}

              {sortedAddresses.length === 0 ? (
                <div className="text-xs text-gray-600 bg-amber-50 border border-amber-100 rounded-lg p-3">
                  Add a delivery address first.{' '}
                  <Link to="/settings/address" className="font-bold text-brand-orange hover:underline">
                    Add address
                  </Link>
                </div>
              ) : (
                <Link to="/settings/address" className="inline-block text-xs font-semibold text-brand-orange hover:underline">
                  Manage addresses
                </Link>
              )}

              <p className="font-bold text-gray-900">Delivery Speed</p>
              <div className="grid grid-cols-3 gap-2">
                {DELIVERY_TIERS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTier(t.key)}
                    className={`py-2 rounded-md text-xs font-semibold border transition-colors cursor-pointer ${
                      tier === t.key
                        ? 'bg-brand-orange text-white border-brand-orange'
                        : 'bg-white text-gray-700 border-slate-200 hover:border-brand-orange'
                    }`}
                  >
                    {t.label}
                    <span className="block text-[10px] font-normal opacity-80">
                      ₱{t.fee} · {t.eta}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Itemized Order Review List */}
          <div className="space-y-2">
            <p className="text-sm font-bold text-gray-900 flex items-center justify-between">
              <span>Order Items ({itemsToCheckout.length})</span>
              <button
                type="button"
                onClick={() => navigate('/cart')}
                className="text-brand-orange text-xs font-semibold hover:underline cursor-pointer"
              >
                Edit Items
              </button>
            </p>
            <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 rounded-lg px-3 py-1 bg-slate-50 scrollbar-none">
              {itemsToCheckout.map((item, idx) => {
                const product = item.product || item
                const itemPrice = Number(product.price ?? item.price ?? 0)
                const itemQty = Number(item.qty || 1)
                const variantText = [item.size, item.color?.name].filter(Boolean).join(' • ')
                return (
                  <div key={idx} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={getImageUrl(item.color?.image || product.images?.[0] || product.image)}
                        alt={product.name}
                        className="w-10 h-10 rounded-md object-contain bg-white p-1 shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="font-bold text-gray-900 truncate">{product.name}</p>
                        <p className="text-xs text-gray-500">
                          Qty: {itemQty}
                          {variantText ? ` • ${variantText}` : ''} • ₱{itemPrice.toFixed(2)} each
                        </p>
                      </div>
                    </div>
                    <p className="font-bold text-gray-900 shrink-0">
                      ₱{(itemPrice * itemQty).toFixed(2)}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Price Breakdown */}
          <div className="p-4 bg-orange-50/60 rounded-lg space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-600 font-medium">
              <span>Items Subtotal</span>
              <span>₱{orderSubtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-600 font-medium">
              <span>
                {dispatchType === 'pickup'
                  ? 'Fulfillment Fee'
                  : `Delivery Fee (${tierInfo.label})`}
              </span>
              <span>
                {serverDue != null
                  ? serverPreview?.dispatch_fee != null
                    ? `₱${Number(serverPreview.dispatch_fee).toFixed(2)}`
                    : 'From server'
                  : clientFee > 0
                  ? `₱${clientFee.toFixed(2)}`
                  : 'FREE (Pickup)'}
              </span>
            </div>
            <div className="flex justify-between items-baseline text-sm font-bold text-gray-900 pt-2 border-t border-orange-200/60">
              <span>Total Due</span>
              <span className="text-lg font-bold text-brand-orange">
                ₱{totalDue.toFixed(2)}
              </span>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Confirmation Decision Buttons */}
          <div className="space-y-2 pt-2">
            <Button
              onClick={handlePlaceOrder}
              disabled={busy}
              className={`w-full py-3.5 rounded-lg font-bold text-sm transition-all cursor-pointer ${
                busy
                  ? 'bg-slate-200 text-slate-500 cursor-wait'
                  : 'bg-brand-orange hover:bg-brand-orange-dark text-white active:scale-98'
              }`}
            >
              {busy
                  ? <><LoadingSpinner size={18} /> Processing…</>
                  : `Pay Now • ₱${totalDue.toFixed(2)}`}
            </Button>
            <button
              type="button"
              onClick={() => navigate('/cart')}
              className="w-full py-2.5 text-sm font-semibold text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"
            >
              Back to Bag / Cancel
            </button>
          </div>
        </div>
      </div>

      <BottomNav />
    </AppShell>
  )
}

export default CheckoutPlaceholder
