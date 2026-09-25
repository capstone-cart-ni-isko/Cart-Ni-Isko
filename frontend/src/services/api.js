import { clearSession } from './session.js'

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api'

export const API_BASE_URL = configuredBaseUrl.replace(/\/$/, '')

let authToken = null

export function setApiToken(token) {
  authToken = token || null
}

export function getApiToken() {
  return authToken
}

export class ApiError extends Error {
  constructor(message, status = 0, payload = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
  }
}

export async function apiRequest(path, { method = 'GET', body, headers } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  let data = null
  try {
    data = await response.json()
  } catch {
    // Keep non-JSON failures available to the status-based error below.
  }

  if (!response.ok || data?.success === false) {
    // A 401 on an authenticated call means the stored token is no longer
    // valid: drop it and tell both contexts so the UI shows the guest state.
    // /auth/* is skipped so a mistyped re-login never wipes a live session.
    if (response.status === 401 && authToken && !path.startsWith('/auth/')) {
      setApiToken(null)
      clearSession()
      window.dispatchEvent(new Event('auth-expired'))
    }
    throw new ApiError(data?.message || 'Request failed', response.status, data)
  }

  return data
}

function withQuery(path, params) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value))
  })
  const suffix = query.toString()
  return suffix ? `${path}?${suffix}` : path
}

// Reads always go to the server: the API's own read cache (CacheReads) is
// invalidated on every write, so a browser-side copy would only go stale.
export function apiGet(path, params = {}) {
  return apiRequest(withQuery(path, params))
}

export function apiPost(path, body) {
  return apiRequest(path, { method: 'POST', body })
}

export function apiPut(path, body) {
  return apiRequest(path, { method: 'PUT', body })
}

export function apiDelete(path, body) {
  return apiRequest(path, { method: 'DELETE', body })
}

/** Kept for callers that still invalidate after writes; nothing is cached client-side. */
export function invalidateCache() {}
