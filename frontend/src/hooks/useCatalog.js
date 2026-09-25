import { useEffect, useState } from 'react'
import { fetchCatalog } from '../services/products.js'

/** Active catalog, mapped through mapProduct so the UI sees name/price/images/id/category. */
export function useCatalog(params = {}) {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const query = JSON.stringify(params)

  useEffect(() => {
    let cancelled = false

    fetchCatalog(JSON.parse(query))
      .then((rows) => {
        if (cancelled) return
        setProducts(rows)
        setError(null)
      })
      .catch((err) => {
        if (cancelled) return
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
