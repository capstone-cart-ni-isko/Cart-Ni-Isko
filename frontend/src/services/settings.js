import { apiGet, apiPut } from './api.js'

/** GET /settings/display - persisted store/system settings. */
export async function fetchSettings() {
  const data = await apiGet('/settings/display')
  return data.data || {}
}

/** PUT /settings/update - merge and persist settings. */
export function updateSettings(settings) {
  return apiPut('/settings/update', { settings })
}

/**
 * GET /settings/display - the signed-in account's own preference columns
 * (DOMAIN 29). The response mixes system-wide keys with the caller's
 * `cust_*` / `emp_*` preference values.
 */
export async function fetchMyPreferences() {
  const data = await apiGet('/settings/display')
  return data.data || {}
}

/**
 * PUT /settings/update - save only personal preference keys. Personal keys
 * are written to the caller's own row; the endpoint still refuses anything
 * system-wide for a non-super-admin, so this helper only ever sends prefs.
 */
export async function updateMyPreferences(patch) {
  const data = await apiPut('/settings/update', { settings: patch })
  return data.data || {}
}
