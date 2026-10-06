import { apiGet, apiPost, apiDelete } from './api.js'

/**
 * The cart IS the `bag` table: one live row per customer + product variation
 * (bag_placed = false, bag_deleted IS NULL). Rows never merge, so different
 * variations of the same product stay separate lines (REQ-BAG-01).
 *
 * This tag prefix is kept exported only because the read-only services/orders.js
 * still filters on it; nothing writes CART-* rows any more.
 */
export const CART_PREFIX = 'CART-'

/**
 * Every cart endpoint answers the same envelope:
 *   { success, message, data: { items[], cart_count, subtotal } }
 *
 * `items` arrive bag_created DESC (FLOW-BAG-04), `cart_count` is the number of
 * live lines (REQ-BAG-03) and `subtotal` = sum(bag_amount * bag_qty) is the
 * total amount due (FLOW-BAG-06).
 */
export function cartEnvelope(payload) {
  const data =
    payload && typeof payload === 'object' && payload.data !== undefined ? payload.data : payload
  const items = Array.isArray(data?.items) ? data.items : []
  return {
    items,
    cart_count: Number(data?.cart_count ?? items.length),
    subtotal: Number(data?.subtotal ?? 0),
  }
}

/**
 * POST /cart/add - add (or increment) bag lines.
 * Each line: { prod_id, prodvar_id?, size?, color?, item_qty, item_amount }
 * where item_amount is the UNIT amount of the line.
 */
export async function addToCart(custId, items) {
  const data = await apiPost('/cart/add', { cust_id: custId, items })
  return cartEnvelope(data)
}

/** GET /cart/display?scope=bag - the live bag rows, newest first. */
export async function fetchCart(custId) {
  const data = await apiGet('/cart/display', { cust_id: custId, scope: 'bag' })
  return cartEnvelope(data)
}

/** POST /orders/add - quantity edit on one bag row (FLOW-BAG-05). */
export async function updateBagQuantity(bagId, itemQty) {
  const data = await apiPost('/orders/add', { bag_id: bagId, item_qty: itemQty })
  return cartEnvelope(data)
}

/** DELETE /cart/remove - soft-delete one bag row (FLOW-BAG-05). */
export async function removeFromCart(bagId) {
  const data = await apiDelete('/cart/remove', { bag_id: bagId })
  return cartEnvelope(data)
}

/** POST /cart/clear - soft-delete every live row (FLOW-BAG-07). */
export async function clearCart() {
  const data = await apiPost('/cart/clear', {})
  return cartEnvelope(data)
}
