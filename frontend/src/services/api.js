import { clearSession } from './session.js'

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL

if (!configuredBaseUrl) {
  throw new Error('VITE_API_BASE_URL is required')
}

export const API_BASE_URL = configuredBaseUrl.replace(/\/$/, '')

let authToken = null
const cache = new Map()
const CACHE_TTL = 5 * 60 * 1000

export function setApiToken(token) {
  const nextToken = token || null
  if (nextToken !== authToken) cache.clear()
  authToken = nextToken
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
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1000)
  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new ApiError('The server did not respond within one second.', 408)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }

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

  if (method !== 'GET') cache.clear()
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

export async function apiGet(path, params = {}) {
  const url = withQuery(path, params)
  if (authToken) return apiRequest(url)

  const cached = cache.get(url)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.data

  const data = await apiRequest(url)
  cache.set(url, { data, timestamp: Date.now() })
  return data
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

export function invalidateCache() {
  cache.clear()
}
