import { apiGet, apiPost, apiPut, apiDelete } from './api.js'

/** GET /accounts/display - customer + employee directory (User Management). */
export async function fetchAccounts(params = {}) {
  const data = await apiGet('/accounts/display', params)
  return data.data || []
}

export function searchAccounts(q, params = {}) {
  return apiGet('/accounts/search', { q, ...params })
}

export function sortAccounts(sortBy = 'date', order = 'desc', params = {}) {
  return apiGet('/accounts/sort', { sort_by: sortBy, order, ...params })
}

/** PUT /accounts/type - STAFF | ADMIN | SUPER ADMIN (super admin only). */
export function changeAccountType(accountType, userId, newType) {
  return apiPut('/accounts/type', { account_type: accountType, user_id: userId, new_type: newType })
}

/** PUT /accounts/update - edit profile details. */
export function updateAccount(accountType, userId, changes) {
  return apiPut('/accounts/update', { account_type: accountType, user_id: userId, ...changes })
}

/** POST /accounts/disable - ban with a required reason (REQ-UM-02/04). */
export function banAccount(accountType, userId, reason) {
  return apiPost('/accounts/disable', { account_type: accountType, user_id: userId, reason })
}

/** POST /accounts/recover - restore a banned account. */
export function recoverAccount(accountType, userId) {
  return apiPost('/accounts/recover', { account_type: accountType, user_id: userId })
}

/** DELETE /accounts/delete - REQ-UM-03: employee accounts are purged for good. */
export function deleteAccount(accountType, userId) {
  return apiDelete('/accounts/delete', {
    account_type: accountType,
    user_id: userId,
    hard_delete: accountType === 'employee',
  })
}
