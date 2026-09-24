import { apiPost } from './api.js'

/** POST /checkout/dispatch - modality (pickup/delivery) fees and details. */
export function getDispatch(ordId, dispatchType, options = {}) {
  return apiPost('/checkout/dispatch', { ord_id: ordId, dispatch_type: dispatchType, ...options })
}

/** POST /checkout/payment - settle payment, activate the order, leave the cart. */
export function payOrder(ordId, dispatchType, payGiven, options = {}) {
  return apiPost('/checkout/payment', {
    ord_id: ordId,
    dispatch_type: dispatchType,
    pay_given: payGiven,
    ...options,
  })
}
