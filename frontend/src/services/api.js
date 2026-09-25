import { clearSession } from './session.js'

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL

if (!configuredBaseUrl) {
  throw new Error('VITE_API_BASE_URL is required')
}

export const API_BASE_URL = configuredBaseUrl.replace(/\/$/, '')

// Hard 1-second budget for every frontend <-> backend hop (project rule).
export const REQUEST_TIMEOUT_MS = 1000

let authToken = null
let preconnected = false
const cache = new Map()
const CACHE_TTL = 5 * 60 * 1000

/* ── Centralized loading state: one counter drives every spinner/skeleton ── */
const loadingListeners = new Set()
let inFlight = 0

export function setApiToken(token) {
  const nextToken = token || null
  if (nextToken !== authToken) cache.clear()
  authToken = nextToken
}

export function getApiToken() {
  return authToken
}

/** Subscribe to "is any API request running right now". Returns an unsubscribe. */
export function onLoadingChange(listener) {
  loadingListeners.add(listener)
  listener(inFlight > 0)
  return () => loadingListeners.delete(listener)
}

function setLoading(delta) {
  inFlight = Math.max(0, inFlight + delta)
  const busy = inFlight > 0
  loadingListeners.forEach((listener) => listener(busy))
}

export class ApiError extends Error {
  constructor(message, status = 0, payload = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
  }
}

export async function apiRequest(path, { method = 'GET', body, headers, silent = false } = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  if (!silent) setLoading(1)

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
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
    // Non-JSON failures stay available to the status-based error below.
    const data = await response.json().catch(() => null)

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
  } catch (error) {
    if (error instanceof ApiError) throw error
    const timedOut = error.name === 'AbortError'
    throw new ApiError(
      timedOut
        ? 'The server did not respond within one second.'
        : 'Cannot reach the server. Please check your connection.',
      timedOut ? 408 : 0
    )
  } finally {
    clearTimeout(timeout)
    if (!silent) setLoading(-1)
  }
}

function withQuery(path, params) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value))
  })
  const suffix = query.toString()
  return suffix ? `${path}?${suffix}` : path
}

export async function apiGet(path, params = {}, options = {}) {
  const url = withQuery(path, params)
  if (authToken) return apiRequest(url, options)

  const cached = cache.get(url)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.data

  const data = await apiRequest(url, options)
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

/**
 * Opens DNS + TCP + TLS to the API host ahead of the first real request.
 *
 * The credentials POST has a hard 1-second budget, and on a cold connection a
 * large part of it goes to name resolution and the TLS handshake rather than to
 * the login itself. Called the moment a login field takes focus so that cost is
 * already paid by the time the customer submits.
 */
export function preconnectApi() {
  if (preconnected) return
  preconnected = true

  let origin = API_BASE_URL
  let host = API_BASE_URL.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  try {
    const url = new URL(API_BASE_URL, window.location.href)
    origin = url.origin
    host = url.port ? `${url.hostname}:${url.port}` : url.hostname
  } catch {
    /* keep the stripped values; the links below are still valid hints */
  }

  const preconnect = document.createElement('link')
  preconnect.rel = 'preconnect'
  preconnect.href = origin
  // fetch() is a CORS request, so the socket it reuses is the CORS one;
  // without this the browser opens a second, useless connection.
  preconnect.crossOrigin = 'anonymous'
  document.head.appendChild(preconnect)

  const dns = document.createElement('link')
  dns.rel = 'dns-prefetch'
  dns.href = `//${host}`
  document.head.appendChild(dns)
}

/**
 * Fills the read cache with public, non-sensitive data the app needs right
 * after sign-in (the catalog), so the login request itself only ever carries
 * credentials and every post-login screen renders from cache. Runs silently:
 * a background warm-up must never raise the global progress bar.
 */
export function prefetch(path, params = {}) {
  return apiGet(path, params, { silent: true }).catch(() => null)
}
