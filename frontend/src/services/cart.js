import { apiGet, apiPost, apiDelete } from './api.js'

/**
 * Cart rows are ORDERS tagged `CART-...` until checkout renames them to
 * `ORD-...` (SRS: a cart item leaves the cart once checked out).
 */
export const CART_PREFIX = 'CART-'

/** POST /cart/add - one order (with items) into the customer's cart. */
export function addToCart(custId, items, tag = null) {
  const body = { cust_id: custId, items }
  if (tag) body.ord_tag = tag
  return apiPost('/cart/add', body)
}

/** GET /cart/display - orders tagged as cart entries. */
export async function fetchCart(custId) {
  const data = await apiGet('/cart/display', { cust_id: custId, tag_prefix: CART_PREFIX })
  return data.data || []
}

/** DELETE /cart/remove - drop an order from the cart. */
export function removeFromCart(ordId) {
  return apiDelete('/cart/remove', { ord_id: ordId })
}
