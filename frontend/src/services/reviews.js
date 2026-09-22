import API_BASE_URL from './api.js'

/**
 * Product reviews live on the `orders` table in Supabase (ord_rating /
 * ord_review) and are only reachable through the Laravel API.
 */

async function readJson(res) {
  try {
    return await res.json()
  } catch {
    return null
  }
}

/** Reviews written for a product, shaped for the ProductReviews component. */
export async function fetchProductReviews(prodId) {
  try {
    const res = await fetch(`${API_BASE_URL}/reviews/display?prod_id=${prodId}`)
    const json = await readJson(res)
    if (res.ok && json?.success) {
      const rows = Array.isArray(json.data) ? json.data : []
      return {
        success: true,
        items: rows.map((row, index) => ({
          id: `ord-${row.ord_id}-${index}`,
          author: 'Verified Student',
          rating: Number(row.ord_rating) || 0,
          date: row.ord_completed
            ? new Date(row.ord_completed).toLocaleDateString()
            : 'Recently',
          variant: 'Verified Purchase',
          comment: row.ord_review || '',
          verified: true,
        })),
      }
    }
    return { success: false, items: [], error: json?.message || `HTTP ${res.status}` }
  } catch (e) {
    return { success: false, items: [], error: e?.message }
  }
}

/** Average rating + review count for a product. */
export async function fetchProductRating(prodId) {
  try {
    const res = await fetch(`${API_BASE_URL}/reviews/score?prod_id=${prodId}`)
    const json = await readJson(res)
    if (res.ok && json?.success && json.data) {
      return {
        success: true,
        rating: Number(json.data.average_rating) || 0,
        count: Number(json.data.total_reviews) || 0,
      }
    }
    return { success: false, rating: 0, count: 0, error: json?.message || `HTTP ${res.status}` }
  } catch (e) {
    return { success: false, rating: 0, count: 0, error: e?.message }
  }
}
