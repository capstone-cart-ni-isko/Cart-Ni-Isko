import { useCallback, useEffect, useState } from 'react'
import { fetchCatalog, readCatalogCache } from '../services/products.js'

/**
 * Active catalog, mapped through mapProduct so the UI sees name/price/images/id/category.
 * On a failure with nothing on screen, `error` is set and the page offers
 * `reload()` (a Retry button).
 */
export function useCatalog(params = {}) {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const query = JSON.stringify(params)

  useEffect(() => {
    let cancelled = false
    const wanted = JSON.parse(query)

    // Paint the 60-second mirror first, then let the request below refresh it.
    const cached = readCatalogCache(wanted)
    if (cached) {
      setProducts(cached)
      setLoading(false)
    } else {
      setLoading(true)
    }

    fetchCatalog(wanted)
      .then((rows) => {
        if (cancelled) return
        setProducts(rows)
        setError(null)
      })
      .catch((err) => {
        // A failed refresh must never blank a screen that already has data.
        if (cancelled || cached) return
        setProducts([])
        setError(err?.message || "Can't reach the store server. Please try again.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [query, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  return { products, loading, error, reload }
}
