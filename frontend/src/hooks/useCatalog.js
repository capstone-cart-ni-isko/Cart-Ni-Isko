import { useEffect, useState } from 'react'
import { fetchCatalog, readCatalogCache } from '../services/products.js'

/** Active catalog, mapped through mapProduct so the UI sees name/price/images/id/category. */
export function useCatalog(params = {}) {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const query = JSON.stringify(params)

  useEffect(() => {
    let cancelled = false
    const wanted = JSON.parse(query)

    // Paint the 60-second mirror first, then let the request below refresh it.
    const cached = readCatalogCache(wanted)
    if (cached) {
      setProducts(cached)
      setLoading(false)
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
        setError(err.message || 'Unable to load catalog')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [query])

  return { products, loading, error }
}
