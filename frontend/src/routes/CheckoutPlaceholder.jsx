import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { useCart } from '../hooks/useCart.js'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from '../hooks/useToast.js'
import AppShell from '../components/layout/AppShell.jsx'
import BottomNav from '../components/layout/BottomNav.jsx'
import Button from '../components/ui/Button.jsx'
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx'
import { ApiErrorText } from '../components/ui/ApiErrorBoundary.jsx'
import OtpVerifyModal from '../components/ui/OtpVerifyModal.jsx'
import BackButton from '../components/ui/BackButton.jsx'
import logo from '../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'
import { getImageUrl } from '../utils/imageUtils.js'
import {
  clearCheckoutSlot,
  createPaymentIntent,
  getDispatch,
  readCheckoutSlot,
  verifyPaymentStatus,
} from '../services/checkout.js'

/* Delivery tiers previewed through POST /checkout/dispatch (SRS shipping fees). */
const DELIVERY_TIERS = [
  { key: 'priority', label: 'Priority', fee: 100, eta: 'Same-day' },
  { key: 'standard', label: 'Standard', fee: 50, eta: '1–2 days' },
  { key: 'saver', label: 'Saver', fee: 30, eta: '3–5 days' },
]

/** FLOW-CHECKOUT-09: the pre-placement confirmation lives five seconds. */
const CONFIRM_SECONDS = 5

/** Marker left behind while the browser is off paying at the gateway. */
const PENDING_KEY = 'isko_checkout_pending'

function addressText(addr) {
  if (!addr) return ''
  if (typeof addr === 'string') return addr
  return [addr.addressLine, addr.barangay, addr.city, addr.province, addr.postalCode]
    .filter(Boolean)
    .join(', ')
}

function todayISO() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/**
 * Arrival copy under the delivery date. When the server quoted a live courier
 * the local tier row is not the store's to promise on its own, so the server's
 * own estimate (dispatch_details / dispatch) is quoted instead - never the
 * local table's day range.
 */
function etaNote(feeSource, serverEta) {
  if (feeSource === 'lalamove') {
    return serverEta
      ? `Live courier quote — estimated arrival ${String(serverEta).replace('T', ' ')}.`
      : 'Live courier quote — the courier confirms the arrival window after booking.'
  }
  return 'Earliest possible arrival for the selected speed.'
}

/** The exact body every checkout endpoint receives for this form. */
function buildCheckoutPayload(form) {
  const { dispatchType, tier, deliveryAddress, deliverExpect, slot, bagIds } = form
  const payload = { dispatch_type: dispatchType }
  // No bag_ids key = "every live row"; a checked selection is sent explicitly.
  if (bagIds.length > 0) payload.bag_ids = bagIds

  if (dispatchType === 'delivery') {
    payload.speed = tier
    payload.deliver_address = deliveryAddress
    if (deliverExpect) payload.deliver_expect = deliverExpect
  } else if (slot?.appoint_start) {
    payload.appoint_start = slot.appoint_start
    if (slot.appoint_id) payload.appoint_id = slot.appoint_id
  }
  return payload
}

/**
 * DOMAIN 26 (ORDER CHECKOUT).
 *
 * The bag rows to cut are addressed by `bag_ids` (the checked lines - the
 * selection made on /bag); an omitted key means "every live row"
 * (REQ-CHECKOUT-01). Nothing is written until the final placement call:
 *
 *   POST /checkout/dispatch        quote (fees, ETA, total due)
 *   POST /checkout/payment         refused - 409 ONLINE_PAYMENT_REQUIRED
 *   POST /checkout/payment/intent  place it - PayMongo, then redirect to
 *                                  data.checkout_url (REQ-CHECKOUT-03)
 *
 * Flow: claim details (FLOW-CHECKOUT-03) -> phone OTP (FLOW-CHECKOUT-08) ->
 * 5-second "Looks good / Go back" dialog (FLOW-CHECKOUT-09) -> placement ->
 * redirect to data.checkout_url -> back through ?status=/&order= which is
 * confirmed with POST /checkout/payment/status (the webhook may still be in
 * flight) -> navigate('/bag') (FLOW-CHECKOUT-10). Pickup slots are collected on
 * /book?return=/checkout and only ever sent to the server as
 * `appoint_start`: the appointment row is created inside the checkout
 * transaction (FLOW-CHECKOUT-06).
 *
 * Rule 55: every preorder - pickup OR delivery, delivery fee included - is
 * paid online here, so the gateway is fixed to `paymongo` and the customer is
 * never offered a pay-at-store tender. The POS register keeps its cash.
 */
function CheckoutPlaceholder() {
  const navigate = useNavigate()
  const location = useLocation()
  const {
    cartItems,
    selectedItems,
    clearSelectedItems,
    refreshCart,
  } = useCart()
  const { currentUser, addresses } = useAuth()
  const { showToast } = useToast()

  const [dispatchType, setDispatchType] = useState('pickup')

  // Pickup: the slot is COLLECTED on /book (FLOW-CHECKOUT-04) and parked in
  // sessionStorage; no appointment row exists client-side (FLOW-CHECKOUT-06).
  const [slot, setSlot] = useState(() => readCheckoutSlot())

  // Delivery (address + date + priority tier) - FLOW-CHECKOUT-07.
  const [addressIdx, setAddressIdx] = useState(0)
  const [customAddress, setCustomAddress] = useState('')
  const [useCustomAddress, setUseCustomAddress] = useState(false)
  const [tier, setTier] = useState('standard')
  const [deliverExpect, setDeliverExpect] = useState('')

  // Server quote state
  const [serverPreview, setServerPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // FLOW-CHECKOUT-09 confirmation dialog + FLOW-CHECKOUT-08 OTP gate
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmSeconds, setConfirmSeconds] = useState(CONFIRM_SECONDS)
  const [otpOpen, setOtpOpen] = useState(false)
  const [otpFlow, setOtpFlow] = useState(null) // 'confirm' | 'retry'
  const [otpVerified, setOtpVerified] = useState(false)
  const [touched, setTouched] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const busyRef = useRef(false)

  const custId = currentUser?.cust_id ?? currentUser?.id ?? null
  // REQ-CHECKOUT-01: only the checked rows travel - everything when nothing
  // was explicitly deselected on /bag.
  const itemsToCheckout = selectedItems.length > 0 ? selectedItems : cartItems
  const bagIds = itemsToCheckout
    .map((i) => i.bagId)
    .filter((id) => id != null && Number(id) > 0)
    .map(Number)

  // item_amount on a bag row is the UNIT price; line total = unit * qty.
  const orderSubtotal = itemsToCheckout.reduce(
    (sum, item) => sum + Number(item.amount ?? item.product?.price ?? 0) * (Number(item.qty) || 1),
    0
  )

  const sortedAddresses = [...(addresses || [])].sort(
    (a, b) => Number(b.isDefault) - Number(a.isDefault)
  )
  const chosenAddress = useCustomAddress ? null : sortedAddresses[addressIdx]
  const deliveryAddress = useCustomAddress
    ? customAddress.trim()
    : addressText(chosenAddress)

  const tierInfo = DELIVERY_TIERS.find((t) => t.key === tier) || DELIVERY_TIERS[1]
  const clientFee = dispatchType === 'delivery' ? tierInfo.fee : 0
  const serverDue =
    serverPreview?.total_due ?? serverPreview?.total ?? null
  const totalDue = serverDue != null ? Number(serverDue) : orderSubtotal + clientFee

  /* The server's quote outranks the local tier table: a live courier quote
     (dispatch_fee_source 'lalamove') can differ from the store's rows and it
     carries the courier's own arrival estimate, so the tier ETA is not
     promised when the fee came from the courier. */
  const dispatchInfo = serverPreview?.dispatch_details ?? serverPreview?.dispatch ?? null
  const feeSource =
    serverPreview?.dispatch_fee_source ??
    serverPreview?.dispatch_quote?.source ??
    dispatchInfo?.fee_source ??
    dispatchInfo?.dispatch_fee_source ??
    null
  const serverEta =
    dispatchInfo?.estimated_delivery ?? dispatchInfo?.deliver_expect ?? null
  const feeRowLabel =
    dispatchType === 'pickup'
      ? 'Fulfillment Fee'
      : feeSource === 'lalamove'
      ? 'Delivery Fee (live courier quote)'
      : `Delivery Fee (${tierInfo.label})`

  const touch = (key) => setTouched((prev) => (prev[key] ? prev : { ...prev, [key]: true }))

  /* REQ-CHECKOUT-04: every field validates as the customer types. */
  const errors = {}
  if (dispatchType === 'pickup') {
    if (!slot?.appoint_start) errors.slot = 'Book a pickup slot to continue.'
  } else {
    if (!deliveryAddress.trim()) errors.address = 'Delivery address is required.'
    else if (deliveryAddress.trim().length < 8)
      errors.address = 'Please enter a complete delivery address.'
    if (!deliverExpect) errors.date = 'Delivery date is required.'
    else if (deliverExpect < todayISO()) errors.date = 'Delivery date must be today or later.'
  }

  const showError = (key) => (submitted || touched[key] ? errors[key] : undefined)

  /* Re-quote fees/total for the current form (best effort - the server is the
     authority; on any rejection the client fee table is displayed instead).
     The selected rows travel as a primitive key so the quote only re-runs
     when the form actually changes, never on a fresh array identity. */
  const bagIdsKey = bagIds.join(',')
  useEffect(() => {
    if (itemsToCheckout.length === 0) {
      setServerPreview(null)
      return undefined
    }
    const bagIdsFromKey = bagIdsKey ? bagIdsKey.split(',').map(Number) : []
    let cancelled = false
    ;(async () => {
      try {
        const res = await getDispatch(
          buildCheckoutPayload({
            dispatchType,
            tier,
            deliveryAddress,
            deliverExpect,
            slot,
            bagIds: bagIdsFromKey,
          })
        )
        if (!cancelled) setServerPreview(res?.data || null)
      } catch {
        if (!cancelled) setServerPreview(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [bagIdsKey, dispatchType, tier, deliveryAddress, deliverExpect, slot, itemsToCheckout.length])

  /* Returning from the PayMongo hosted checkout. The order already exists
     (the intent call created it), so nothing here places anything: the
     redirect carries ?status=&order=, and POST /checkout/payment/status is
     asked because the webhook may still be in flight. The params are stripped
     first so a refresh never replays the handler. */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const status = params.get('status') || params.get('payment_status')
    const orderId = params.get('order')
    const intentId = params.get('payment_intent_id')
    if (!status && !orderId && !intentId) return undefined
    // The gateway return URL always names the order; the pending marker only
    // guards the legacy intent redirect that arrives without one.
    if (!orderId && !sessionStorage.getItem(PENDING_KEY)) return undefined

    window.history.replaceState({}, document.title, window.location.pathname)
    try {
      sessionStorage.removeItem(PENDING_KEY)
    } catch {
      /* nothing to clear */
    }

    let cancelled = false
    ;(async () => {
      if (orderId) {
        let res = null
        let failure = null
        try {
          res = await verifyPaymentStatus({ ord_id: Number(orderId) })
        } catch (err) {
          failure = err
        }
        if (cancelled) return

        if (failure) {
          // 503 PAYMENT_GATEWAY_UNAVAILABLE: say what the server said, plainly,
          // and leave the bag exactly as it was (REQ-CHECKOUT-02).
          if (failure.status === 503) {
            showToast(
              failure.message ||
                'Online payment is not configured yet. Your bag is unchanged.',
              'error'
            )
          } else if (status === 'cancelled') {
            showToast(
              'Payment was cancelled. Your order was not completed and your bag is unchanged.',
              'info'
            )
          } else {
            showToast(
              failure.message || 'We could not confirm your payment yet. Please check your orders.',
              'error'
            )
          }
          return
        }

        if (status === 'cancelled') {
          showToast(
            'Payment was cancelled. Your order was not completed and your bag is unchanged.',
            'info'
          )
          return
        }

        if (res?.data?.paid === true) {
          clearCheckoutSlot()
          clearSelectedItems()
          await refreshCart()
          if (cancelled) return
          showToast('Payment received. Your order is now being processed!', 'success')
          navigate('/bag', { replace: true })
          return
        }

        // The redirect says paid but the server has not settled it yet: never
        // claim success while the confirmation is still outstanding.
        showToast(
          'Your payment is still being confirmed. We will update this order as soon as it lands.',
          'info'
        )
        return
      }

      await refreshCart()
      if (cancelled) return
      if (status === 'paid' || status === 'succeeded') {
        showToast('Payment received. Your order is now being processed!', 'success')
      } else {
        showToast('Payment was not completed. Please try again.', 'error')
      }
      navigate('/bag', { replace: true })
    })()

    return () => {
      cancelled = true
    }
  }, [refreshCart, navigate, showToast, clearSelectedItems])

  // Coming back from /book with a freshly collected slot.
  useEffect(() => {
    setSlot(readCheckoutSlot())
  }, [location.key])

  // Never leave the checkout empty-handed.
  useEffect(() => {
    if (cartItems.length === 0 && selectedItems.length === 0 && !sessionStorage.getItem(PENDING_KEY)) {
      navigate('/bag', { replace: true })
    }
  }, [cartItems.length, selectedItems.length, navigate])

  // FLOW-CHECKOUT-09: the dialog counts five seconds down, then gives up
  // without ever calling the placement endpoint.
  useEffect(() => {
    if (!confirmOpen) return undefined
    if (confirmSeconds <= 0) {
      setConfirmOpen(false)
      setConfirmSeconds(CONFIRM_SECONDS)
      showToast('Confirmation timed out — your order was not placed.', 'info')
      return undefined
    }
    const timer = setTimeout(() => setConfirmSeconds((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [confirmOpen, confirmSeconds, showToast])

  const runPlacement = async () => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError('')

    const payload = buildCheckoutPayload({
      dispatchType,
      tier,
      deliveryAddress,
      deliverExpect,
      slot,
      bagIds: bagIdsKey ? bagIdsKey.split(',').map(Number) : [],
    })
    try {
      // Rule 55: the gateway is fixed - there is no offline tender left for a
      // preorder, so the intent endpoint is the only placement call.
      // REQ-CHECKOUT-03: it places the order first so its metadata can carry
      // `order:<ord_id>`, then hands back the hosted-checkout URL.
      const res = await createPaymentIntent({ ...payload, gateway: 'paymongo' })
      const checkoutUrl = res?.data?.checkout_url
      if (!checkoutUrl) throw new Error('Failed to create a payment session. Please try again.')
      try {
        sessionStorage.setItem(
          PENDING_KEY,
          JSON.stringify({ ord_id: res?.data?.ord_id ?? null, at: Date.now() })
        )
      } catch {
        /* storage blocked: the return handler simply stays quiet */
      }
      window.location.href = checkoutUrl
      return
    } catch (err) {
      if (err?.status === 428) {
        // FLOW-CHECKOUT-08: the server asked for a phone code - verify, retry.
        setOtpFlow('retry')
        setOtpOpen(true)
        return
      }
      // REQ-CHECKOUT-02: nothing local was cleared, the bag stays as it was.
      // 503 PAYMENT_GATEWAY_UNAVAILABLE carries the server's own sentence.
      setError(err?.message || 'Payment failed. Your bag was not changed. Please try again.')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const handlePlaceOrder = () => {
    if (busy) return
    setError('')

    // FLOW-CHECKOUT-03: payment AND claiming details first.
    if (itemsToCheckout.length === 0) {
      setError('Please select at least one item to checkout.')
      return
    }
    if (bagIds.length !== itemsToCheckout.length) {
      setError('Some items are not synced to your bag yet. Refresh your bag and try again.')
      return
    }
    if (Object.keys(errors).length > 0) {
      setSubmitted(true)
      setError('Please complete your payment and claiming details before placing the order.')
      return
    }

    // FLOW-CHECKOUT-08: a verified phone code comes before the final call.
    if (!otpVerified) {
      setOtpFlow('confirm')
      setOtpOpen(true)
      return
    }
    setConfirmSeconds(CONFIRM_SECONDS)
    setConfirmOpen(true)
  }

  const handleOtpVerified = async () => {
    setOtpOpen(false)
    setOtpVerified(true)
    const flow = otpFlow
    setOtpFlow(null)
    if (flow === 'retry') {
      await runPlacement()
      return
    }
    // Verified: show the pre-placement confirmation (FLOW-CHECKOUT-09).
    setConfirmSeconds(CONFIRM_SECONDS)
    setConfirmOpen(true)
  }

  /* Picking "In-Store Pickup" sends the customer to /book (FLOW-CHECKOUT-04);
     the collected slot comes back through sessionStorage (FLOW-CHECKOUT-05). */
  const bookPickupSlot = () => navigate('/book?return=/checkout')

  const chooseModality = (type) => {
    setDispatchType(type)
    setSubmitted(false)
  }

  return (
    <AppShell showNav={false}>
      <div className="min-h-dvh flex flex-col items-center justify-center p-4 pb-28 md:p-8 animate-fade-in bg-slate-50/60">
        <div className="w-full max-w-xl bg-white rounded-xl p-6 md:p-8 border border-slate-100 space-y-6">
          {/* Back to the previous view of this step-by-step process */}
          <BackButton to="/bag" label="Back to Bag" />

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
                Claiming Details
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => chooseModality('pickup')}
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
                  onClick={() => chooseModality('delivery')}
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
                  ? 'Pickup at BU Main Campus Student Center — choose a claim slot below'
                  : 'Courier delivery to your chosen address'}
              </p>
            </div>
          </div>

          {/* FLOW-CHECKOUT-04/05: pickup slot comes from /book and is only
              held here until the order (and appointment) are created. */}
          {dispatchType === 'pickup' && (
            <div className="space-y-2">
              {slot ? (
                <div className="p-3.5 rounded-lg border border-orange-200 bg-orange-50/70 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900">Pickup slot selected</p>
                    <p className="text-xs text-slate-600 truncate">
                      {String(slot.appoint_start).replace('T', ' ')} · claimed with your order
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={bookPickupSlot}
                    className="shrink-0 h-8 px-3 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Change slot
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    touch('slot')
                    bookPickupSlot()
                  }}
                  className="w-full h-11 rounded-lg border-2 border-dashed border-brand-orange text-brand-orange text-sm font-bold hover:bg-orange-50 transition-colors cursor-pointer"
                >
                  Book your in-store pickup slot
                </button>
              )}
              {showError('slot') && (
                <p className="text-xs font-semibold text-red-500">{errors.slot}</p>
              )}
            </div>
          )}

          {/* FLOW-CHECKOUT-07: delivery expands with address AND date. */}
          {dispatchType === 'delivery' && (
            <div className="space-y-3 text-sm">
              <p className="font-bold text-gray-900">Delivery Address</p>
              {sortedAddresses.length > 0 && (
                <div className="space-y-1.5">
                  {sortedAddresses.map((addr, idx) => (
                    <button
                      key={addr.id ?? idx}
                      type="button"
                      onClick={() => {
                        setAddressIdx(idx)
                        setUseCustomAddress(false)
                        touch('address')
                      }}
                      className={`w-full text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                        !useCustomAddress && addressIdx === idx
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

              <label className="flex items-start gap-2 text-xs text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useCustomAddress}
                  onChange={(e) => {
                    setUseCustomAddress(e.target.checked)
                    touch('address')
                  }}
                  className="mt-0.5 accent-[var(--color-brand-orange,#f97316)]"
                />
                Ship to a different address
              </label>
              {useCustomAddress && (
                <textarea
                  value={customAddress}
                  onChange={(e) => {
                    setCustomAddress(e.target.value)
                    touch('address')
                  }}
                  rows={2}
                  placeholder="House/Unit no., street, barangay, city"
                  className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 focus:border-brand-orange focus:ring-brand-orange/30"
                />
              )}
              {showError('address') && (
                <p className="text-xs font-semibold text-red-500 -mt-1">{errors.address}</p>
              )}

              <div>
                <p className="font-bold text-gray-900 mb-1.5">Delivery Date</p>
                <input
                  type="date"
                  value={deliverExpect}
                  min={todayISO()}
                  onChange={(e) => {
                    setDeliverExpect(e.target.value)
                    touch('date')
                  }}
                  className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2.5 text-gray-700 focus:border-brand-orange focus:ring-brand-orange/30"
                />
                {showError('date') ? (
                  <p className="text-xs font-semibold text-red-500 mt-1">{errors.date}</p>
                ) : (
                  <p className="text-[11px] text-gray-400 mt-1">{etaNote(feeSource, serverEta)}</p>
                )}
              </div>

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
                onClick={() => navigate('/bag')}
                className="text-brand-orange text-xs font-semibold hover:underline cursor-pointer"
              >
                Edit Items
              </button>
            </p>
            <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 rounded-lg px-3 py-1 bg-slate-50 scrollbar-none">
              {itemsToCheckout.map((item) => {
                const product = item.product || {}
                const itemPrice = Number(item.amount ?? product.price ?? 0)
                const itemQty = Number(item.qty || 1)
                const variantText = [item.size, item.color?.name].filter(Boolean).join(' • ')
                return (
                  <div
                    key={item.cartItemId}
                    className="py-2.5 flex items-center justify-between gap-3 text-sm"
                  >
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
              <span>₱{(serverPreview?.subtotal ?? orderSubtotal).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-600 font-medium">
              <span>{feeRowLabel}</span>
              <span>
                {serverPreview?.dispatch_fee != null
                  ? `₱${Number(serverPreview.dispatch_fee).toFixed(2)}`
                  : clientFee > 0
                  ? `₱${clientFee.toFixed(2)}`
                  : 'FREE (Pickup)'}
              </span>
            </div>
            {feeSource === 'lalamove' && (
              <p className="text-[11px] text-gray-400">
                Live courier quote — this is the delivery fee charged with your order, not the
                store's tier price.
              </p>
            )}
            <div className="flex justify-between items-baseline text-sm font-bold text-gray-900 pt-2 border-t border-orange-200/60">
              <span>Total Due</span>
              <span className="text-lg font-bold text-brand-orange">
                ₱{totalDue.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Payment: preorders settle online (rule 55) - pickup AND delivery,
              delivery fee included. There is no pay-at-store tender left, so
              the gateway is not a choice. */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Payment Details
            </p>
            <div className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50/60">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-brand-orange shrink-0 mt-0.5">
                <path d="M21 12V7H5V7M21 17V7M3 17H21M5 17V12M19 17V12" />
              </svg>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800">PayMongo (Online)</p>
                <p className="text-xs text-gray-500">
                  You will be redirected to PayMongo to complete payment securely. Pickup and
                  courier delivery are both paid online with the order.
                </p>
              </div>
            </div>
            <p className="text-[11px] text-gray-400">
              Amount due: <span className="font-bold text-gray-600">₱{totalDue.toFixed(2)}</span> —
              a one-time phone code is required before the order is saved.
            </p>
          </div>

          {error && <ApiErrorText error={{ message: error }} />}

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
              {busy ? (
                <>
                  <LoadingSpinner size={18} /> Processing…
                </>
              ) : (
                `Proceed to PayMongo • ₱${totalDue.toFixed(2)}`
              )}
            </Button>
            <button
              type="button"
              onClick={() => navigate('/bag')}
              className="w-full py-2.5 text-sm font-semibold text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"
            >
              Back to Bag / Cancel
            </button>
          </div>
        </div>
      </div>

      {/* FLOW-CHECKOUT-09: five-second confirmation before the order is written. */}
      {confirmOpen &&
        createPortal(
          <div className="fixed inset-0 z-[130000] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setConfirmOpen(false)}
              aria-hidden="true"
            />
            <div
              role="dialog"
              aria-modal="true"
              className="relative w-full max-w-sm bg-white rounded-2xl p-6 border border-gray-200 shadow-xl animate-scale-in"
            >
              <h3 className="text-base font-bold text-gray-900">Confirm your order</h3>
              <p className="text-sm text-gray-500 mt-2 leading-relaxed">
                <span className="font-bold text-gray-800">₱{totalDue.toFixed(2)}</span> due ·{' '}
                {itemsToCheckout.length} {itemsToCheckout.length === 1 ? 'item' : 'items'} ·{' '}
                {dispatchType === 'pickup' ? 'Store pickup' : 'Courier delivery'}.
              </p>
              <p className="text-xs text-gray-400 mt-2">
                This confirmation closes in{' '}
                <span className="font-bold text-brand-orange">{Math.max(0, confirmSeconds)}s</span>.
              </p>
              <div className="grid grid-cols-2 gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => {
                    setConfirmOpen(false)
                    setConfirmSeconds(CONFIRM_SECONDS)
                    runPlacement()
                  }}
                  className="h-11 rounded-lg bg-brand-orange hover:bg-brand-orange-dark text-white text-sm font-bold transition-colors cursor-pointer"
                >
                  Looks good
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmOpen(false)
                    setConfirmSeconds(CONFIRM_SECONDS)
                  }}
                  className="h-11 rounded-lg bg-white border border-slate-200 text-gray-700 text-sm font-bold hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Go back
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* FLOW-CHECKOUT-08: the phone code that gates the placement call. */}
      <OtpVerifyModal
        isOpen={otpOpen}
        purpose="checkout"
        title="Verify it's you"
        onClose={() => {
          setOtpOpen(false)
          setOtpFlow(null)
        }}
        onVerified={handleOtpVerified}
      />

      <BottomNav />
    </AppShell>
  )
}

export default CheckoutPlaceholder
