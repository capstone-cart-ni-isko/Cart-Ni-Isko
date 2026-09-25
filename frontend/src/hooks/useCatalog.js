import { useCallback, useEffect, useState } from 'react'
import { fetchCatalog } from '../services/products.js'

/**
 * Live catalog from the API. There is no offline sample data: on failure
 * `error` is set and the page offers `reload()` (a Retry button).
 */
export function useCatalog(params = {}) {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const query = JSON.stringify(params)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    fetchCatalog(JSON.parse(query))
      .then((rows) => {
        if (!cancelled) {
          setProducts(rows || [])
          setError(null)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setProducts([])
          setError(err?.message || "Can't reach the store server. Please try again.")
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [query, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  return { products, loading, error, reload }
}
