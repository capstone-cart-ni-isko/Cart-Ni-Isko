import { useEffect, useState } from 'react'
import { apiGet } from '../services/api.js'

export function useCatalog(params = {}) {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const query = JSON.stringify(params)

  useEffect(() => {
    let cancelled = false
    apiGet('/products/filter', { status: 'active', ...JSON.parse(query) }).then(
      (data) => {
        if (!cancelled) {
          setProducts(data.data || [])
          setError(null)
        }
      }
    ).catch((err) => {
      if (!cancelled) {
        setProducts([])
        setError(err.message || 'Unable to load catalog')
      }
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [query])

  return { products, loading, error }
}