import { apiGet, apiPost, apiPut, apiDelete } from './api.js'
import { CART_PREFIX } from './cart.js'

const ACTIVE = ['TO PROCESS', 'TO CLAIM', 'TO RECEIVE', 'CLAIMED', 'UNCLAIMED', 'CANCELLED', 'RETURNED', 'REFUNDED']

/** GET /cart/display - active orders (cart entries excluded). */
export async function fetchOrders(custId = null) {
  const params = { exclude_prefix: CART_PREFIX }
  if (custId) params.cust_id = custId
  const data = await apiGet('/cart/display', params)
  return data.data || []
}

/** GET /cart/display (staff token) - every customer's orders, carts excluded. */
export async function fetchAllOrders(params = {}) {
  const data = await apiGet('/cart/display', { exclude_prefix: CART_PREFIX, ...params })
  return data.data || []
}

/** Order rows embed the pickup / parcel record created at checkout. */
export function dispatchModeOf(row) {
  if (row?.parcel) return 'delivery'
  if (row?.pickup) return 'pickup'
  return null
}

/** GET /cart/display?ord_id - one order with its items. */
export async function fetchOrder(ordId) {
  const data = await apiGet('/cart/display', { ord_id: ordId, exclude_prefix: CART_PREFIX })
  return (data.data || [])[0] || null
}

export function searchOrders(q, custId = null) {
  const params = { q }
  if (custId) params.cust_id = custId
  return apiGet('/cart/search', params)
}

export function sortOrders(sortBy = 'date', order = 'desc', custId = null) {
  const params = { sort_by: sortBy, order }
  if (custId) params.cust_id = custId
  return apiGet('/cart/sort', params)
}

/** POST /orders/add - add a product to an order. */
export function addProductToOrder(ordId, prodId, itemQty = 1, itemAmount = null) {
  const body = { ord_id: ordId, prod_id: prodId, item_qty: itemQty }
  if (itemAmount !== null) body.item_amount = itemAmount
  return apiPost('/orders/add', body)
}

/** PUT /orders/update - tag, status, rating, review, completion. */
export function updateOrder(ordId, changes) {
  return apiPut('/orders/update', { ord_id: ordId, ...changes })
}

/** DELETE /orders/remove - remove one product from an order. */
export function removeProductFromOrder(ordId, prodId) {
  return apiDelete('/orders/remove', { ord_id: ordId, prod_id: prodId })
}

/** Customer-requested cancel/return: status change pending staff approval. */
export function requestCancel(ordId) {
  return updateOrder(ordId, { ord_status: 'CANCEL REQUESTED' })
}

export function requestReturn(ordId) {
  return updateOrder(ordId, { ord_status: 'RETURN REQUESTED' })
}

export const REQUEST_STATUSES = ['CANCEL REQUESTED', 'RETURN REQUESTED']

/** Admin decision on a customer request: approve moves it to CANCELLED / RETURNED. */
export function approveRequest(row) {
  const status = String(row?.ord_status || '').toUpperCase()
  return updateOrder(row.ord_id, {
    ord_status: status === 'RETURN REQUESTED' ? 'RETURNED' : 'CANCELLED',
  })
}

/** Declining puts the order back where it was before the request. */
export function rejectRequest(row) {
  const status = String(row?.ord_status || '').toUpperCase()
  let previous = 'CLAIMED'
  if (status === 'CANCEL REQUESTED') {
    const mode = dispatchModeOf(row)
    previous = mode === 'pickup' ? 'TO CLAIM' : mode === 'delivery' ? 'TO RECEIVE' : 'TO PROCESS'
  }
  return updateOrder(row.ord_id, { ord_status: previous })
}

export { ACTIVE as ORDER_STATUSES }

/** REQ-OT-01: "to claim" and "to receive" status changes should NOT
 *  generate regular notifications - they are handled by QR code scanning. */
export function shouldGenerateNotification(status) {
  const exempt = ['TO CLAIM', 'TO RECEIVE']
  return !exempt.includes(status)
}
