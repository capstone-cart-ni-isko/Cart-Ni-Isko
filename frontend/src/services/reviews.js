import { apiGet } from './api.js'

/**
 * Product reviews live on the `orders` table in Supabase (ord_rating /
 * ord_review) and are only reachable through the Laravel API.
 */

/** Reviews written for a product, shaped for the ProductReviews component. */
export async function fetchProductReviews(prodId) {
  try {
    const data = await apiGet('/reviews/display', { prod_id: prodId })
    const rows = Array.isArray(data.data) ? data.data : []
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
  } catch (e) {
    return { success: false, items: [], error: e?.message }
  }
}

/** Average rating + review count for a product. */
export async function fetchProductRating(prodId) {
  try {
    const data = await apiGet('/reviews/score', { prod_id: prodId })
    if (data?.data) {
      return {
        success: true,
        rating: Number(data.data.average_rating) || 0,
        count: Number(data.data.total_reviews) || 0,
      }
    }
    return { success: false, rating: 0, count: 0, error: data?.message || 'No rating data' }
  } catch (e) {
    return { success: false, rating: 0, count: 0, error: e?.message }
  }
}
