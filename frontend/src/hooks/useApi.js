import { useCallback, useEffect, useRef, useState } from 'react'
import { onLoadingChange, prefetch, preconnectApi } from '../services/api.js'

/**
 * True while any API request is in flight. Drives every spinner/skeleton so
 * loading feedback is consistent and a slow call never looks like a hang.
 */
export function useApiLoading() {
  const [isLoading, setIsLoading] = useState(false)
  useEffect(() => onLoadingChange(setIsLoading), [])
  return isLoading
}

/** Plain-text message for any thrown API failure - never silent. */
export function apiErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (!error) return ''
  return error.message || error.payload?.message || fallback
}

/**
 * Warms the API socket and the public boot data the moment a login field takes
 * focus: name resolution, TCP and TLS are done, and the catalog is already in
 * the read cache, so the credentials POST inside the 1-second budget only pays
 * for the login itself.
 */
export function useApiWarmup() {
  return useCallback(() => {
    preconnectApi()
    prefetch('/products/filter', { status: 'active' })
  }, [])
}

/**
 * Standardized read: { data, error, isLoading, setData, refresh }.
 * `fetcher` is any service function (services/*.js) - no existing hook is
 * bypassed, and `params` may be an inline literal.
 */
export function useApiData(fetcher, params = {}, options = {}) {
  const { enabled = true, onSuccess, onError } = options
  const [data, setData] = useState(options.initialData ?? null)
  const [error, setError] = useState(null)
  const [isLoading, setIsLoading] = useState(enabled)
  const alive = useRef(true)
  // Stable identity for the params object so callers can pass a literal.
  const paramKey = JSON.stringify(params)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const refresh = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await fetcher(params)
      if (!alive.current) return result
      setData(result)
      onSuccess?.(result)
      return result
    } catch (err) {
      if (alive.current) {
        setError(err)
        onError?.(err)
      }
      return null
    } finally {
      if (alive.current) setIsLoading(false)
    }
    // onSuccess/onError are read from the latest render on purpose; depending
    // on them would re-run the fetch whenever an inline callback changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher, paramKey, enabled])

  useEffect(() => {
    if (enabled) refresh()
  }, [refresh, enabled])

  return { data, error, isLoading, setData, refresh }
}

/**
 * Standardized write: { execute, isLoading, error }.
 * `mutate` is any service function. It resolves to null on failure so UIs stay
 * free of try/catch noise while still surfacing the error text.
 */
export function useApiMutation(mutate, options = {}) {
  const { onSuccess, onError } = options
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  const execute = useCallback(
    async (...args) => {
      setIsLoading(true)
      setError(null)
      try {
        const result = await mutate(...args)
        onSuccess?.(result)
        return result
      } catch (err) {
        setError(err)
        onError?.(err)
        return null
      } finally {
        setIsLoading(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mutate],
  )

  return { execute, isLoading, error }
}
