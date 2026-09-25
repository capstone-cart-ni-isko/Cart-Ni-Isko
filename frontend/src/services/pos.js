import { apiPost, apiPut, apiDelete } from './api.js'

/** Walk-in basket: an order tagged `POS-...` for the "Walk-in" customer. */
export function addPosItem(payload) {
  return apiPost('/pos/add', payload)
}

export function updatePosItem(payload) {
  return apiPut('/pos/update', payload)
}

export function removePosItem(payload) {
  return apiDelete('/pos/remove', payload)
}

/** POST /pos/checkout - pay and claim walk-in order immediately. */
export function checkoutPos(payload) {
  return apiPost('/pos/checkout', payload)
}
