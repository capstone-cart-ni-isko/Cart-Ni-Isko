import { useEffect, useState } from 'react'
import { fetchCatalog } from '../services/products.js'

export function useCatalog(params = {}) {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
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
          setError(err?.message || 'Unable to load catalog')
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
  }, [query])

  return { products, loading, error }
}