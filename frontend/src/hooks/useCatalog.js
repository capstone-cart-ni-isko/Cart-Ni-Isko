import { useCallback, useEffect, useState } from 'react'
import { fetchCatalog, readCatalogCache } from '../services/products.js'
import { useApiChange } from './useApiChange.js'

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

  // Realtime (REQ-MANAGE_INV-02/03): a product added, disabled or re-priced
  // (or its stock moved by a sale) re-reads the catalog, so the storefront grid
  // reflects it immediately rather than at the next poll.
  const version = useApiChange(['products', 'uploads'])

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
  }, [query, reloadKey, version])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  return { products, loading, error, reload }
}
