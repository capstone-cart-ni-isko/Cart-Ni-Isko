import { apiDelete, apiGet, apiPost } from './api.js'

/** POST /access/log - record an account/management action (REQ-UM-04). */
export function logAction(payload) {
  return apiPost('/access/log', payload)
}

/** POST /access/flag - flag an irregularity for the store side. */
export function flagIrregularity(payload) {
  return apiPost('/access/flag', payload)
}

/**
 * GET /access/logs - the merged, immutable audit trail (DOMAIN 32).
 *
 * FLOW-ACCESS_LOG-07..09 / REQ-ACCESS_LOG-02/03: super admins only, newest
 * first, filterable into all / customers / employees and searchable by actor,
 * action type and date range. The endpoint is read-only by construction, so
 * this module deliberately exposes no edit helper (REQ-ACCESS_LOG-01).
 *
 * @param {object} params  scope | q | access | from | to | limit
 */
export function fetchAccessLogs(params = {}) {
  return apiGet('/access/logs', params)
}

/**
 * DELETE /access/logs - the retention override of REQ-ACCESS_LOG-01
 * (DOMAIN 32).
 *
 * The one action the owner's retention policy allows on the trail: every
 * custlog and emplog entry older than 24 months is permanently deleted in one
 * call, and every super admin is notified of the count. The system asks for
 * this once every two weeks; an unanswered question still expires those rows
 * at 60 months via the daily sweep. Nothing younger than 24 months is ever
 * touched, and no other delete exists.
 */
export function deleteOldAccessLogs() {
  return apiDelete('/access/logs')
}
