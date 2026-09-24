import { apiPost } from './api.js'

/** POST /access/log - record an account/management action (REQ-UM-04). */
export function logAction(payload) {
  return apiPost('/access/log', payload)
}

/** POST /access/flag - flag an irregularity for the store side. */
export function flagIrregularity(payload) {
  return apiPost('/access/flag', payload)
}
