import { useEffect, useState } from 'react'
import { fetchCatalog } from '../services/products.js'

export function useCatalog() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    fetchCatalog()
      .then((rows) => {
        if (!cancelled) {
          setProducts(rows)
          setError(null)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setProducts([])
          setError(err.message || 'Unable to load catalog')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { products, loading, error }
}
