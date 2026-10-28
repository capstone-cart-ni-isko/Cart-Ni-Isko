import { apiGet, apiPost, apiPut, apiDelete } from './api.js'

const ACTIVE = ['TO PROCESS', 'TO CLAIM', 'TO RECEIVE', 'CLAIMED', 'UNCLAIMED', 'CANCELLED', 'RETURNED', 'REFUNDED']

/**
 * FLOW-ORD_LIST-03: the six server-side filter buckets `GET /cart/display`
 * understands. The label shown on each tab lives in routes/Orders.jsx; the
 * status lists below mirror CartAPI::applyOrderFilter() exactly so the tab
 * counts (derived from the full list) always agree with what the server
 * returns for the same bucket.
 */
export const ORDER_FILTER_BUCKETS = {
  processing: ['to pay', 'awaiting payment', 'processing', 'to cancel', 'to process', 'cancel requested', 'cancelling', 'return requested'],
  'to-claim': ['to claim', 'to deliver', 'ready to ship', 'to receive', 'delivering', 'in transit', 'transit'],
  claimed: ['claimed', 'received', 'delivered', 'completed'],
  unclaimed: ['unclaimed'],
  cancelled: ['cancelled', 'cancel', 'canceled', 'returned', 'refunded'],
}

/** Which FLOW-ORD_LIST-03 bucket an `ord_status` belongs to (null = unknown). */
export function orderFilterBucket(status) {
  const value = String(status ?? '').trim().toLowerCase()
  return (
    Object.keys(ORDER_FILTER_BUCKETS).find((key) =>
      ORDER_FILTER_BUCKETS[key].includes(value)
    ) || null
  )
}

/**
 * GET /cart/display - every order of the customer, `ord_created DESC`
 * (FLOW-ORD_LIST-02). `filter` asks the server for one FLOW-ORD_LIST-03
 * bucket; omit it (or send 'all') for the complete list.
 */
export async function fetchOrders(custId = null, filter = null) {
  const params = {}
  if (custId) params.cust_id = custId
  if (filter && filter !== 'all') params.filter = filter
  const data = await apiGet('/cart/display', params)
  return Array.isArray(data.data) ? data.data : []
}

/** GET /cart/display (staff token) - every customer's orders, carts excluded. */
export async function fetchAllOrders() {
  const rows = await fetchOrders()
  return rows.filter((row) => !String(row?.ord_tag || '').toUpperCase().startsWith('CART-'))
}

/** Order rows carry the dispatch type and the pickup / parcel record made at checkout. */
export function dispatchModeOf(row) {
  if (row?.dispatch_type === 'delivery' || row?.dispatch_type === 'pickup') return row.dispatch_type
  if (row?.parcel || row?.delivery) return 'delivery'
  if (row?.pickup) return 'pickup'
  return null
}

/** GET /cart/display?ord_id - one order with its items. */
export async function fetchOrder(ordId) {
  const data = await apiGet('/cart/display', { ord_id: ordId })
  return Array.isArray(data.data) ? (data.data[0] || null) : null
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

/** PUT /orders/update - status changes (customer cancel requests included). */
export function updateOrder(ordId, changes) {
  return apiPut('/orders/update', { ord_id: ordId, ...changes })
}

/** DELETE /orders/remove - remove one product from an order. */
export function removeProductFromOrder(ordId, prodId) {
  return apiDelete('/orders/remove', { ord_id: ordId, prod_id: prodId })
}

/** POST /orders/delivery-details - submit delivery details and initiate fee payment. */
export function submitDeliveryDetails(payload) {
  return apiPost('/orders/delivery-details', payload)
}

/** POST /orders/delivery-fee - confirm settled delivery fee payment. */
export function confirmDeliveryFeePayment(ordId) {
  return apiPost('/orders/delivery-fee', { ord_id: ordId })
}

/** POST /orders/switch-claiming - switch fulfillment between pickup and delivery while processing. */
export function switchClaimingMethod(payload) {
  return apiPost('/orders/switch-claiming', payload)
}

/**
 * POST /checkout/payment/resume - reopen PayMongo Hosted Checkout for an
 * existing order that is still awaiting payment. The order, its items and its
 * stock hold stay exactly as they are; only a fresh checkout session is made.
 */
export function resumePayment(ordId) {
  return apiPost('/checkout/payment/resume', { ord_id: ordId })
}

/**
 * FLOW-ORD_LIST-04/06: a customer may only request a cancellation, and only
 * while the order is still `processing` (the backend answers 403 otherwise);
 * the request parks the order on `to cancel` for staff to approve.
 */
export function requestCancel(ordId) {
  return updateOrder(ordId, { ord_status: 'to cancel' })
}

export { ACTIVE as ORDER_STATUSES }

/** REQ-OT-01: "to claim" and "to receive" status changes should NOT
 *  generate regular notifications - they are handled by QR code scanning. */
export function shouldGenerateNotification(status) {
  const exempt = ['TO CLAIM', 'TO RECEIVE']
  return !exempt.includes(status)
}
