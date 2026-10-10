import { apiPost } from './api.js'

/**
 * DOMAIN 26 (ORDER CHECKOUT) - all three endpoints address the cart through
 * `bag_ids` (the checked rows); omit the key entirely for "everything in the
 * bag" (REQ-CHECKOUT-01). An empty array would mean "no rows" and is rejected
 * server-side, so callers must drop the key instead of sending [].
 *
 *   POST /checkout/dispatch        quote only (200, no writes, no OTP)
 *   POST /checkout/payment         REFUSED (409 ONLINE_PAYMENT_REQUIRED):
 *                                  a preorder settles online only (rule 55)
 *   POST /checkout/payment/intent  placement + PayMongo intent (201) whose
 *                                  data.checkout_url the browser redirects to
 *   POST /checkout/payment/status  idempotent paid check (auth) - called when
 *                                  the browser comes back from PayMongo
 *   POST /delivery/book            staff: book the courier (role:staff)
 *   POST /delivery/cancel          staff: cancel the courier booking
 */

/** POST /checkout/dispatch - fees, ETA and line quote for the current form. */
export function getDispatch(payload) {
  return apiPost('/checkout/dispatch', payload)
}

/**
 * POST /checkout/payment - the endpoint every storefront used to place an
 * order with cash / pay-at-store. It now REFUSES every request: preorders are
 * paid online (pickup AND delivery, delivery fee included), so it answers
 * 409 with `code: 'ONLINE_PAYMENT_REQUIRED'` and leaves the bag untouched.
 * Kept only because older callers still reference it - new flows must use
 * createPaymentIntent().
 */
export function payOrder(payload) {
  return apiPost('/checkout/payment', payload)
}

/** POST /checkout/payment/intent - place the order + PayMongo checkout_url. */
export function createPaymentIntent(payload) {
  return apiPost('/checkout/payment/intent', payload)
}

/**
 * POST /checkout/payment/status - is this order paid yet? Auth required and
 * idempotent: the webhook may still be in flight when the browser returns
 * from the hosted checkout, so this is the source of truth on the way back.
 * Body: { ord_id } -> data { ord_id, paid, pay_ref, ord_status, gateway, booked }.
 */
export function verifyPaymentStatus(payload) {
  return apiPost('/checkout/payment/status', payload)
}

/**
 * POST /delivery/book - staff books the courier for a paid delivery.
 * Body: { ord_id } (or { deliver_id }); 503 when LalaMove has no keys,
 * 409 when the order is unpaid or there is nothing left to book.
 */
export function bookDelivery(payload) {
  return apiPost('/delivery/book', payload)
}

/** POST /delivery/cancel - staff cancels the courier booking ({ ord_id }). */
export function cancelDelivery(payload) {
  return apiPost('/delivery/cancel', payload)
}

/* ------------------------------------------------------------------ *
 * FLOW-CHECKOUT-04/05/06 - the pickup slot collected on /book travels
 * back to /checkout through sessionStorage ONLY. No appointment row is
 * written client-side: the checkout transaction creates it together with
 * the order.
 * ------------------------------------------------------------------ */
export const CHECKOUT_SLOT_KEY = 'isko_checkout_slot'

/** Park the slot details until the customer is back on /checkout. */
export function saveCheckoutSlot(slot) {
  if (!slot?.appoint_start) return
  try {
    sessionStorage.setItem(
      CHECKOUT_SLOT_KEY,
      JSON.stringify({
        appoint_id: slot.appoint_id ?? slot.id ?? null,
        appoint_start: slot.appoint_start,
        appoint_end: slot.appoint_end ?? null,
        appoint_type: slot.appoint_type || 'PICKUP',
      })
    )
  } catch {
    // Storage blocked: the form simply asks for the slot again.
  }
}

/** Read the parked slot (null when the customer never picked one). */
export function readCheckoutSlot() {
  try {
    const raw = sessionStorage.getItem(CHECKOUT_SLOT_KEY)
    const slot = raw ? JSON.parse(raw) : null
    return slot && slot.appoint_start ? slot : null
  } catch {
    return null
  }
}

/** Drop the parked slot once the order was placed (or the flow abandoned). */
export function clearCheckoutSlot() {
  try {
    sessionStorage.removeItem(CHECKOUT_SLOT_KEY)
  } catch {
    /* nothing to clear */
  }
}
