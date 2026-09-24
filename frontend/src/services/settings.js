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
