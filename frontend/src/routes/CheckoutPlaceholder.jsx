import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useCart } from '../hooks/useCart.js'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from '../hooks/useToast.js'
import AppShell from '../components/layout/AppShell.jsx'
import BottomNav from '../components/layout/BottomNav.jsx'
import Button from '../components/ui/Button.jsx'
import Modal from '../components/ui/Modal.jsx'
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx'
import { ApiErrorText } from '../components/ui/ApiErrorBoundary.jsx'
import OtpVerifyModal from '../components/ui/OtpVerifyModal.jsx'
import BackButton from '../components/ui/BackButton.jsx'
import logo from '../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'
import paymongoLogo from '../assets/icons/brand/paymongo-logo.png'
import { getImageUrl } from '../utils/imageUtils.js'
import OrderPlacedView from '../components/orders/OrderPlacedView.jsx'
import { fetchOrder } from '../services/orders.js'
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

/**
 * The receipt of a successful return, kept for this tab so a refresh (or a
 * second look before leaving) still shows the same "Order Placed" screen
 * instead of dumping the shopper on a now-empty bag.
 */
const PLACED_KEY = 'isko_checkout_placed'

/** sessionStorage is per-tab and survives the gateway round trip + refresh. */
function readStoredJson(key) {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeStoredJson(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage blocked: the in-memory receipt still renders */
  }
}

function clearStored(key) {
  try {
    sessionStorage.removeItem(key)
  } catch {
    /* nothing to clear */
  }
}

function addressText(addr) {
  if (!addr) return ''
  if (typeof addr === 'string') return addr
  return [addr.addressLine, addr.barangay, addr.city, addr.province, addr.postalCode]
    .filter(Boolean)
    .join(', ')
}

/**
 * Pre-order copy.
 *
 * A pre-order item is produced to order, so the store cannot promise a date
 * for it: the order still goes through, but the customer is told plainly that
 * no delivery estimate is available and that the store will confirm when the
 * item is ready.
 */
function preorderNotice() {
  return 'This order contains pre-order item(s). A delivery date cannot be estimated yet - the store will let you know once the pre-order items are ready.'
}

/** "Oct 22, 2026" from the server's estimate, else the speed's own window. */
function estimatedDeliveryLabel(serverEta, tierWindow) {
  const parsed = serverEta ? new Date(String(serverEta).replace(' ', 'T')) : null
  if (parsed && !Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
  }
  return tierWindow
}

/** The exact body every checkout endpoint receives for this form. */
function buildCheckoutPayload(form) {
  const { dispatchType, tier, deliveryAddress, slot, bagIds } = form
  const payload = { dispatch_type: dispatchType }
  // No bag_ids key = "every live row"; a checked selection is sent explicitly.
  if (bagIds.length > 0) payload.bag_ids = bagIds

  if (dispatchType === 'delivery') {
    payload.speed = tier
    payload.deliver_address = deliveryAddress
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
    updateVariation,
  } = useCart()

  // Issue 3: variation-change modal state
  // null = closed; { cartItemId, bagId, product, currentProdvarId } = open
  const [variationModal, setVariationModal] = useState(null)
  const [selectedProdvarId, setSelectedProdvarId] = useState(null)
  const [variationBusy, setVariationBusy] = useState(false)
  const { currentUser, addresses } = useAuth()
  const { showToast } = useToast()

  const [dispatchType, setDispatchType] = useState('pickup')

  // Pickup: the slot is COLLECTED on /book (FLOW-CHECKOUT-04) and parked in
  // sessionStorage; no appointment row exists client-side (FLOW-CHECKOUT-06).
  const [slot, setSlot] = useState(() => readCheckoutSlot())

  // Delivery (address + priority tier) - FLOW-CHECKOUT-07.
  //
  // The order is delivered to the customer's default address at the standard
  // speed; the courier fee is quoted for that address and charged with the
  // products. The courier itself is booked once staff mark the items ready.
  const tier = 'standard'

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
  const returningRef = useRef(false)
  const returnHandledRef = useRef(false)
  // Back from PayMongo: 'checking' while the payment is confirmed, then the
  // saved order once it is paid (the order-placed view replaces the form).
  const [confirmingReturn, setConfirmingReturn] = useState(false)
  // A receipt snapshot survives a refresh of the return screen. A cancelled
  // return, or a different order in the URL, wins over the old snapshot.
  const [placedOrder, setPlacedOrder] = useState(() => {
    const snapshot = readStoredJson(PLACED_KEY)
    if (!snapshot?.order?.ord_id) return null
    const params = new URLSearchParams(window.location.search)
    const status = (params.get('status') || params.get('payment_status') || '').toLowerCase()
    if (status === 'cancelled') return null
    const orderId = params.get('order')
    if (orderId && String(orderId) !== String(snapshot.order.ord_id)) return null
    return snapshot
  })
  const mountedRef = useRef(false)

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
  const chosenAddress = sortedAddresses[0]
  const deliveryAddress = addressText(chosenAddress)

  const tierInfo = DELIVERY_TIERS.find((t) => t.key === tier) || DELIVERY_TIERS[1]
  const serverDue =
    serverPreview?.total_due ?? serverPreview?.total ?? null
  const totalDue = serverDue != null ? Number(serverDue) : orderSubtotal

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
      ? 'Delivery Fee (LalaMove)'
      : 'Delivery Fee'
  // Charged with the products: the live courier quote, or the store's fee
  // table when the courier cannot be reached. null while the quote loads.
  const deliveryFee =
    dispatchType === 'delivery' && serverPreview?.dispatch_fee != null
      ? Number(serverPreview.dispatch_fee)
      : null

  /* Pre-order detection.
     A pre-order item is produced to order, so the store cannot promise a
     delivery date for it. The flag is read per LINE (a product can have one
     pre-order combination and ordinary ones) and the server's own answer wins
     once the quote has come back. */
  const preorderLines = itemsToCheckout.filter(
    (item) => item.preOrder ?? item.product?.preOrder
  )
  const hasPreorderItems = preorderLines.length > 0
  const serverSaysPreorder =
    serverPreview?.preorder === true || dispatchInfo?.preorder === true
  const orderHasPreorder = serverPreview ? serverSaysPreorder : hasPreorderItems
  // No estimate is offered for a pre-order order - not by the server, and not
  // by the local tier table either.
  const estimateAvailable = !orderHasPreorder && serverPreview?.estimate_available !== false

  const touch = (key) => setTouched((prev) => (prev[key] ? prev : { ...prev, [key]: true }))

  /* REQ-CHECKOUT-04: every field validates as the customer types. */
  const errors = {}
  if (dispatchType === 'pickup') {
    if (!slot?.appoint_start) errors.slot = 'Book a pickup slot to continue.'
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
  }, [bagIdsKey, dispatchType, tier, deliveryAddress, slot, itemsToCheckout.length])

  /* Returning from the PayMongo hosted checkout. The order already exists
     (the intent call created it), so nothing here places anything: the
     redirect carries ?status=&order=, and POST /checkout/payment/status is
     asked because the webhook may still be in flight. The params are stripped
     first so a refresh never replays the handler. */
  // Real unmounts only: StrictMode's dev re-mount sets this back to true.
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const status = (params.get('status') || params.get('payment_status') || '').toLowerCase()
    const urlOrderId = params.get('order')
    const intentId = params.get('payment_intent_id')
    // Only a URL that actually carries a gateway-return signal may start the
    // confirmation flow; a stale pending marker must not hijack a fresh
    // checkout. The marker then supplies the order id if the gateway dropped
    // that query parameter.
    if (!status && !urlOrderId && !intentId) return undefined
    const pending = readStoredJson(PENDING_KEY)
    const orderId = urlOrderId || pending?.ord_id || null
    if (!orderId) return undefined

    // Refs survive StrictMode's mount/unmount/mount, so this runs only once.
    if (returnHandledRef.current) return undefined
    returnHandledRef.current = true

    // The placed order already consumed the bag rows: hold the empty-checkout
    // redirect until the payment check below has finished.
    returningRef.current = true
    setConfirmingReturn(true)
    window.history.replaceState({}, document.title, window.location.pathname)
    clearStored(PENDING_KEY)
    // A cancelled payment must not resurrect an older success receipt later.
    if (status === 'cancelled') clearStored(PLACED_KEY)

    ;(async () => {
      let placed = null
      try {
        placed = await handleReturn()
      } catch {
        /* no receipt: the bag is the safe landing */
      }
      if (!mountedRef.current) return

      if (placed) {
        // Publish the receipt BEFORE the cart refresh empties the screen, so
        // the empty-cart guard below can never race the success view to /bag.
        setPlacedOrder(placed)
        setConfirmingReturn(false)
        await refreshCart()
        // Hold the "we are on a gateway return" flag until the cart state has
        // settled, so the stale-receipt guard cannot mistake this render for a
        // brand-new checkout.
        returningRef.current = false
        return
      }

      await refreshCart()
      if (!mountedRef.current) return
      returningRef.current = false
      setConfirmingReturn(false)
      // Every other outcome lands on the bag (FLOW-CHECKOUT-10).
      navigate('/bag', { replace: true })
    })()

    async function handleReturn() {
      if (orderId) {
        let res = null
        let failure = null
        // PayMongo can take a few seconds to settle after the redirect, so a
        // "paid" return is re-checked briefly before calling it pending.
        const attempts = status === 'cancelled' ? 1 : 5
        for (let attempt = 0; attempt < attempts; attempt += 1) {
          if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1500))
          if (!mountedRef.current) return
          try {
            res = await verifyPaymentStatus({ ord_id: Number(orderId), status })
            failure = null
          } catch (err) {
            failure = err
          }
          if (res?.data?.paid === true) break
        }
        if (!mountedRef.current) return null

        // The success_url is only reached after PayMongo charges the money, so
        // it is the durable signal that the order was paid. Server settlement
        // can still be a few seconds behind (webhook/lookup) - that must never
        // hide the receipt from the shopper.
        const redirectSaysPaid = status === 'paid' || status === 'succeeded'

        if (failure && !redirectSaysPaid) {
          // 503 PAYMENT_GATEWAY_UNAVAILABLE: say what the server said, plainly,
          // and leave the bag exactly as it was (REQ-CHECKOUT-02).
          if (failure.status === 503) {
            showToast(
              failure.message ||
                `Online payment is not configured yet, so order #${orderId} could not be confirmed. Please check your Orders.`,
              'error'
            )
          } else if (status === 'cancelled') {
            showToast(
              `Payment was cancelled, so order #${orderId} was not paid. It stays unpaid in your Orders and its items are no longer in your bag.`,
              'info'
            )
          } else {
            showToast(
              failure.message || 'We could not confirm your payment yet. Please check your orders.',
              'error'
            )
          }
          return null
        }

        if (status === 'cancelled') {
          showToast(
            `Payment was cancelled, so order #${orderId} was not paid. It stays unpaid in your Orders and its items are no longer in your bag.`,
            'info'
          )
          return null
        }

        if (res?.data?.paid === true || redirectSaysPaid) {
          clearCheckoutSlot()
          clearSelectedItems()
          let fullOrder = res?.data?.order
          if (!fullOrder || !fullOrder.items || fullOrder.items.length === 0) {
            try {
              const fetched = await fetchOrder(Number(orderId))
              if (fetched) fullOrder = fetched
            } catch {
              /* fall back to the receipt stub below */
            }
          }
          const confirmed = res?.data?.paid === true
          const fallbackOrder =
            pending?.order ||
            { ord_id: Number(orderId), ord_amount: pending?.amount ?? totalDue }
          const receipt = {
            order: fullOrder || fallbackOrder,
            payRef: res?.data?.pay_ref || pending?.pay_ref || null,
            confirmed,
            at: Date.now(),
          }
          // Persist before the caller swaps to the placed view: a refresh of
          // this tab must land on the same receipt, not on an empty bag.
          writeStoredJson(PLACED_KEY, receipt)
          if (!confirmed) {
            showToast('Payment received. We are finishing the confirmation of your order.', 'info')
          }
          return receipt
        }

        // The gateway did not say "paid" and the server has not settled it:
        // never invent a receipt, but keep the order visible in Orders.
        showToast(
          'Your payment is still being confirmed. We will update this order as soon as it lands.',
          'info'
        )
        return null
      }

      if (status === 'paid' || status === 'succeeded') {
        showToast('Payment received. Your order is now being processed!', 'success')
      } else {
        showToast('Payment was not completed. Please try again.', 'error')
      }
    }

    return undefined
  }, [refreshCart, navigate, showToast, clearSelectedItems, totalDue])

  /* The receipt is on screen, but the server may not have settled it yet.
     Keep checking quietly so the badge flips to "verified" on its own, while
     never taking the receipt away from the shopper. */
  useEffect(() => {
    if (!placedOrder || placedOrder.confirmed) return undefined
    const ordId = Number(placedOrder.order?.ord_id)
    if (!Number.isFinite(ordId) || ordId <= 0) return undefined

    let cancelled = false
    let attempts = 0
    let timer = null

    const poll = async () => {
      if (cancelled) return
      attempts += 1
      try {
        const res = await verifyPaymentStatus({ ord_id: ordId, status: 'paid' })
        if (cancelled) return
        if (res?.data?.paid === true) {
          const next = {
            ...placedOrder,
            order: res.data.order || placedOrder.order,
            payRef: res.data.pay_ref || placedOrder.payRef,
            confirmed: true,
            at: Date.now(),
          }
          writeStoredJson(PLACED_KEY, next)
          setPlacedOrder(next)
          return
        }
      } catch {
        /* the receipt stays; retry on the next tick */
      }
      if (!cancelled && attempts < 10) timer = setTimeout(poll, 3000)
    }

    timer = setTimeout(poll, 2500)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [placedOrder])

  /* A saved receipt must not hijack a brand-new checkout. Arriving on
     /checkout with items in the bag (and not as a gateway return) means the
     shopper is shopping again, so the old receipt is dropped and the form is
     shown instead. */
  useEffect(() => {
    if (!placedOrder || returningRef.current || confirmingReturn) return
    if (cartItems.length === 0 && selectedItems.length === 0) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('status') || params.get('order')) return
    clearStored(PLACED_KEY)
    setPlacedOrder(null)
  }, [placedOrder, confirmingReturn, cartItems.length, selectedItems.length])

  // Coming back from /book with a freshly collected slot.
  useEffect(() => {
    setSlot(readCheckoutSlot())
  }, [location.key])

  // Never leave the checkout empty-handed.
  useEffect(() => {
    if (
      cartItems.length === 0 &&
      selectedItems.length === 0 &&
      !returningRef.current &&
      !confirmingReturn &&
      !placedOrder &&
      !readStoredJson(PENDING_KEY)
    ) {
      navigate('/bag', { replace: true })
    }
  }, [cartItems.length, selectedItems.length, navigate, placedOrder, confirmingReturn])

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
    // A brand-new payment must never inherit the previous order's receipt.
    clearStored(PLACED_KEY)

    const payload = buildCheckoutPayload({
      dispatchType,
      tier,
      deliveryAddress,
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
          JSON.stringify({
            ord_id: res?.data?.ord_id ?? null,
            // A snapshot of the placement response lets the return screen show
            // the right receipt even if the settlement check cannot reach the
            // server; the paid check below still decides the final badge.
            amount: res?.data?.total_due ?? totalDue,
            order: res?.data?.order ?? null,
            pay_ref: res?.data?.checkout_session_id ?? null,
            at: Date.now(),
          })
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

  if (placedOrder || confirmingReturn) {
    return (
      <AppShell showNav={false}>
        <div className="min-h-dvh flex flex-col items-center justify-center p-4 pb-28 md:p-8 animate-fade-in bg-slate-50/60">
          {placedOrder ? (
            <OrderPlacedView
              order={placedOrder.order}
              payRef={placedOrder.payRef}
              customerName={currentUser?.fullName}
              confirmed={placedOrder.confirmed !== false}
              onDismiss={() => clearStored(PLACED_KEY)}
            />
          ) : (
            <div className="w-full max-w-xl bg-white rounded-xl p-8 border border-slate-100 flex flex-col items-center text-center gap-3">
              <LoadingSpinner size={28} />
              <p className="text-base font-semibold text-gray-900">Confirming your payment…</p>
              <p className="text-sm text-gray-500">
                Please keep this page open while we check with PayMongo.
              </p>
            </div>
          )}
        </div>
        <BottomNav />
      </AppShell>
    )
  }

  return (
    <AppShell showNav={false} className="md:max-w-2xl! lg:max-w-6xl! lg:overflow-visible! md:-mt-8">
      <div className="min-h-dvh md:min-h-0 flex flex-col items-center justify-center p-4 pb-28 md:p-6 md:pb-16 animate-fade-in bg-slate-50/60">
        <div className="w-full max-w-xl md:max-w-none bg-white rounded-xl p-6 md:p-8 border border-slate-100 space-y-6">
          {/* Back to the previous view of this step-by-step process */}
          <BackButton to="/bag" />

          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <img src={logo} alt="Tindahan ni Isko" className="h-8 object-contain" />
              <div>
                <h1 className="text-xl font-semibold text-gray-900 leading-tight">
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

          {/* Desktop: details on the left, a sticky order summary + payment on
              the right. Below lg it stacks in the original mobile order. */}
          <div className="space-y-6 lg:space-y-0 lg:grid lg:grid-cols-[minmax(0,1fr)_25rem] lg:gap-8 lg:items-start">
            <div className="space-y-6 min-w-0">
              {/* Customer & Fulfillment Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="p-3.5 bg-slate-50 rounded-lg space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Customer Details
                  </p>
                  <p className="font-semibold text-gray-900">{currentUser?.fullName || 'Customer'}</p>
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
                    <div className="p-3.5 rounded-xl border border-orange-200 bg-orange-50/70 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex items-start gap-2.5">
                        <div className="mt-0.5 shrink-0 w-8 h-8 rounded-lg bg-brand-orange/10 flex items-center justify-center text-brand-orange">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                            <line x1="16" y1="2" x2="16" y2="6" />
                            <line x1="8" y1="2" x2="8" y2="6" />
                            <line x1="3" y1="10" x2="21" y2="10" />
                          </svg>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 leading-tight">Pickup slot selected</p>
                          <p className="text-xs text-brand-orange font-medium mt-0.5">
                            {(() => {
                              const d = new Date(String(slot.appoint_start).replace(' ', 'T'))
                              if (Number.isNaN(d.getTime())) return String(slot.appoint_start).replace('T', ' ')
                              const weekday = d.toLocaleDateString('en-US', { weekday: 'short' })
                              const month   = d.toLocaleDateString('en-US', { month: 'short' })
                              const day     = d.getDate()
                              const time    = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                              return `${weekday}, ${month} ${day} · ${time}`
                            })()}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5">Claimed with your order at checkout</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={bookPickupSlot}
                        className="shrink-0 h-8 px-3 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
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
                      className="w-full h-11 rounded-lg border-2 border-dashed border-brand-orange text-brand-orange text-sm font-semibold hover:bg-orange-50 transition-colors cursor-pointer"
                    >
                      Book your in-store pickup slot
                    </button>
                  )}
                  {showError('slot') && (
                    <p className="text-xs font-semibold text-red-500">{errors.slot}</p>
                  )}
                </div>
              )}

              {/* FLOW-CHECKOUT-07: delivery details and fee are deferred until items are ready */}
              {dispatchType === 'delivery' && (
                <div className="space-y-3 text-sm p-4 rounded-xl border border-blue-200 bg-blue-50/60">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-blue-100 text-blue-700 shrink-0">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                        <rect x="1" y="3" width="15" height="13" />
                        <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                        <circle cx="5.5" cy="18.5" r="2.5" />
                        <circle cx="18.5" cy="18.5" r="2.5" />
                      </svg>
                    </div>
                    <div className="space-y-1">
                      <p className="font-bold text-blue-950 text-sm">
                        Courier Delivery
                      </p>
                      <p className="text-xs text-blue-900 leading-relaxed">
                        Delivering to <strong>{deliveryAddress || 'your default address'}</strong>.
                      </p>
                      <p className="text-xs text-blue-800 leading-relaxed pt-1">
                        The delivery fee is included in your total. A LalaMove rider is booked as soon as
                        your items are packed, and you can follow the parcel from your order page.
                      </p>
                    </div>
                  </div>

                  {/* Pre-order: an item that is produced to order has no date
                      to be estimated against, so no estimate is offered at
                      all - neither by the server nor by the local tier table. */}
                  {orderHasPreorder && (
                    <div className="flex items-start gap-2.5 p-3 rounded-lg border border-orange-200 bg-orange-50">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-brand-orange shrink-0 mt-0.5">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-orange-900 uppercase tracking-wider">
                          Pre-order — no delivery estimate
                        </p>
                        <p className="text-xs text-orange-800 leading-relaxed mt-1">
                          {preorderNotice()}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* The estimate, for an order that can have one. */}
                  {!orderHasPreorder && estimateAvailable && (
                    <p className="text-xs text-blue-900">
                      Estimated delivery:{' '}
                      <strong>{estimatedDeliveryLabel(serverEta, tierInfo.eta)}</strong>
                      {feeSource === 'lalamove' ? ' (live courier quote)' : ''}
                    </p>
                  )}
                </div>
              )}
            </div>

            <aside className="space-y-6 min-w-0 lg:sticky lg:top-6 lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-slate-50/60 lg:p-6">
              <h2 className="hidden lg:block text-base font-semibold text-gray-900 tracking-tight">
                Order Summary
              </h2>
              {/* Itemized Order Review List */}
              <div className="space-y-2">
                <p className="text-sm font-semibold text-gray-900 flex items-center justify-between">
                  <span>Order Items ({itemsToCheckout.length})</span>
                  <button
                    type="button"
                    onClick={() => navigate('/bag')}
                    className="text-brand-orange text-xs font-semibold hover:underline cursor-pointer"
                  >
                    Edit Items
                  </button>
                </p>
                <div className="max-h-48 lg:max-h-72 overflow-y-auto divide-y divide-slate-100 rounded-lg px-3 py-1 bg-slate-50 lg:bg-white lg:dark:bg-[var(--surface)] lg:border lg:border-slate-100 scrollbar-none">
                  {itemsToCheckout.map((item) => {
                    const product = item.product || {}
                    const itemPrice = Number(item.amount ?? product.price ?? 0)
                    const itemQty = Number(item.qty || 1)
                    const variantText = [item.size, item.color?.name].filter(Boolean).join(' • ')
                    const isPreorder = item.preOrder ?? product.preOrder
                    // Only show "Change" when the product has more than one active variation
                    const activeVariations = (product.variations || []).filter(
                      (v) => !v.prodvar_disabled && !v.prodvar_deleted
                    )
                    const hasMultipleVariations = activeVariations.length > 1
                    return (
                      <div
                        key={item.cartItemId}
                        className="py-2.5 flex items-start justify-between gap-3 text-sm"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <img
                            src={getImageUrl(item.color?.image || product.images?.[0] || product.image)}
                            alt={product.name}
                            className="w-10 h-10 rounded-md object-contain bg-white p-1 shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 truncate">{product.name}</p>
                            <p className="text-xs text-gray-500">
                              Qty: {itemQty}
                              {variantText ? ` • ${variantText}` : ''} • ₱{itemPrice.toFixed(2)} each
                            </p>
                            {/* Issue 3: Change variation without leaving checkout */}
                            {hasMultipleVariations && (
                              <button
                                type="button"
                                className="mt-1 text-xs font-semibold text-brand-orange hover:underline cursor-pointer"
                                onClick={() => {
                                  setVariationModal({
                                    cartItemId: item.cartItemId,
                                    bagId: item.bagId,
                                    product,
                                    currentProdvarId: item.prodvarId ?? null,
                                  })
                                  setSelectedProdvarId(item.prodvarId ?? null)
                                }}
                              >
                                Change variation
                              </button>
                            )}
                            {isPreorder && (
                              <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-2xs font-bold uppercase tracking-wider bg-orange-50 text-brand-orange border border-orange-200/60">
                                Pre-order
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="font-semibold text-gray-900 shrink-0 pt-0.5">
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
                    {dispatchType === 'delivery'
                      ? deliveryFee != null
                        ? `₱${deliveryFee.toFixed(2)}`
                        : 'Calculating…'
                      : 'FREE (Pickup)'}
                  </span>
                </div>
              </div>

              {/* Payment: preorders settle online (rule 55) - pickup AND delivery,
                  delivery fee included. There is no pay-at-store tender left, so
                  the gateway is not a choice. */}
              {/* Payment Details with PayMongo Branding & Clear Hierarchy */}
              <div className="space-y-3 pt-3 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Payment Method
                  </p>
                </div>

                <div className="rounded-xl border border-emerald-200/90 bg-emerald-50/40 p-3.5 space-y-3 shadow-2xs">
                  {/* Gateway Logo & Title */}
                  <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-emerald-100">
                    <div className="flex items-center gap-2">
                      <div className="bg-white px-2 py-1 rounded-md border border-slate-200/90 shadow-2xs flex items-center">
                        <img
                          src={paymongoLogo}
                          alt="PayMongo"
                          className="h-5 w-auto object-contain"
                        />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-900 leading-tight">PayMongo Gateway</p>
                      </div>
                    </div>
                  </div>

                  {/* Payment Explanation & Text Hierarchy */}
                  <div className="space-y-2 text-xs text-gray-700">
                    <p className="font-semibold text-gray-900 text-xs flex items-center gap-1.5">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-emerald-600 shrink-0">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                      How your payment works:
                    </p>
                    <ul className="space-y-1.5 pl-5 list-disc text-2xs text-gray-600 leading-relaxed">
                      <li>
                        <strong className="text-gray-800">Redirect to PayMongo:</strong> You will be temporarily redirected to PayMongo's secure payment page.
                      </li>
                      <li>
                        <strong className="text-gray-800">Multiple tender options:</strong> Pay conveniently using <strong>GCash, Maya, GrabPay, Visa, Mastercard,</strong> or online bank transfers.
                      </li>
                      <li>
                        <strong className="text-gray-800">Immediate confirmation:</strong> Once completed, you will be automatically returned to Tindahan ni Isko with your confirmed order receipt and QR code.
                      </li>
                    </ul>
                  </div>

                  {/* Upfront payment reminder badge */}
                  <div className="p-2 rounded-lg bg-white/90 border border-emerald-200 text-2xs text-emerald-800 flex items-start gap-2">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                    <span>
                      <strong>Upfront Payment Required:</strong> Both in-stock and pre-order merchandise are paid upfront to guarantee item allocation and production scheduling.
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-gray-500 pt-0.5 px-0.5">
                  <span>Amount to be charged:</span>
                  <span className="font-bold text-gray-900 text-sm">₱{totalDue.toFixed(2)}</span>
                </div>
                {dispatchType === 'delivery' && deliveryFee > 0 && (
                  <p className="text-[11px] text-gray-500 text-right px-0.5 -mt-1">
                    Includes ₱{deliveryFee.toFixed(2)} delivery fee
                    {feeSource === 'lalamove' ? ' (LalaMove)' : ''}
                  </p>
                )}
              </div>

              {error && <ApiErrorText error={{ message: error }} />}

              {/* Confirmation Decision Buttons */}
              <div className="space-y-2 pt-2">
                <Button
                  onClick={handlePlaceOrder}
                  disabled={busy}
                  className={`w-full py-3.5 rounded-lg font-semibold text-sm transition-all cursor-pointer ${
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
            </aside>
          </div>
        </div>
      </div>

      {/* Issue 3: Variation-change modal — lets the customer swap a variant without leaving checkout. */}
      {variationModal && (
        <Modal
          isOpen={Boolean(variationModal)}
          onClose={() => {
            setVariationModal(null)
            setSelectedProdvarId(null)
          }}
          title="Change variation"
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setVariationModal(null)
                  setSelectedProdvarId(null)
                }}
                className="flex-1 h-11"
                disabled={variationBusy}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={
                  variationBusy ||
                  !selectedProdvarId ||
                  selectedProdvarId === variationModal.currentProdvarId
                }
                className="flex-1 h-11"
                onClick={async () => {
                  if (!selectedProdvarId || selectedProdvarId === variationModal.currentProdvarId) return
                  setVariationBusy(true)
                  try {
                    await updateVariation(variationModal.cartItemId, selectedProdvarId)
                  } catch {
                    /* updateVariation swallows errors and logs to console */
                  } finally {
                    setVariationBusy(false)
                    setVariationModal(null)
                    setSelectedProdvarId(null)
                  }
                }}
              >
                {variationBusy ? <LoadingSpinner size={18} /> : 'Confirm'}
              </Button>
            </>
          }
        >
          <div className="space-y-4 py-1">
            <p className="text-sm text-gray-500">
              Select a new variation for{' '}
              <span className="font-semibold text-gray-800">
                {variationModal.product?.name}
              </span>
              .
            </p>
            <div className="flex flex-wrap gap-2">
              {(variationModal.product?.variations || [])
                .filter((v) => !v.prodvar_disabled && !v.prodvar_deleted)
                .map((v) => {
                  const opts = v.prodvar_options || v.options || {}
                  const parts = [
                    Object.entries(opts)
                      .map(([k, val]) => `${k}: ${val}`)
                      .join(', '),
                  ].filter(Boolean)
                  const label = parts.length > 0 ? parts.join(' | ') : v.prodvar_name
                  const isSelected = Number(v.prodvar_id) === Number(selectedProdvarId)
                  const isCurrent = Number(v.prodvar_id) === Number(variationModal.currentProdvarId)
                  return (
                    <button
                      key={v.prodvar_id}
                      type="button"
                      onClick={() => setSelectedProdvarId(Number(v.prodvar_id))}
                      className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                        isSelected
                          ? 'border-brand-orange bg-orange-50 text-brand-orange'
                          : 'border-slate-200 bg-white text-gray-700 hover:border-orange-300'
                      }`}
                    >
                      {label}
                      {isCurrent && !isSelected ? ' (current)' : ''}
                    </button>
                  )
                })}
            </div>
          </div>
        </Modal>
      )}

      {/* FLOW-CHECKOUT-09: five-second confirmation before the order is written. */}
      {confirmOpen && (
        <Modal
          isOpen={confirmOpen}
          onClose={() => {
            setConfirmOpen(false)
            setConfirmSeconds(CONFIRM_SECONDS)
          }}
          title="Confirm your order"
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setConfirmOpen(false)
                  setConfirmSeconds(CONFIRM_SECONDS)
                }}
                className="flex-1 h-11"
              >
                Go back
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setConfirmOpen(false)
                  setConfirmSeconds(CONFIRM_SECONDS)
                  runPlacement()
                }}
                className="flex-1 h-11"
              >
                Looks good
              </Button>
            </>
          }
        >
          <p className="text-sm text-gray-500 leading-relaxed">
            <span className="font-semibold text-gray-800">₱{totalDue.toFixed(2)}</span> due ·{' '}
            {itemsToCheckout.length} {itemsToCheckout.length === 1 ? 'item' : 'items'} ·{' '}
            {dispatchType === 'pickup' ? 'Store pickup' : 'Courier delivery'}.
          </p>
          <p className="field-hint">
            This confirmation closes in{' '}
            <span className="font-semibold text-brand-orange">{Math.max(0, confirmSeconds)}s</span>.
          </p>
        </Modal>
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
