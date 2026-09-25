import { apiGet, apiPost, apiPut, apiDelete } from './api.js'

/**
 * Product reviews live on the `orders` table in Supabase (ord_rating /
 * ord_review) and are only reachable through the Laravel API.
 */

/**
 * Reviews written for a product, shaped for the ProductReviews component.
 * `status` ('pending' | 'approved') is the employee moderation queue filter
 * (the server only honours it for employee tokens).
 */
export async function fetchProductReviews(prodId, status = null) {
  try {
    const params = { prod_id: prodId }
    if (status) params.status = status
    const data = await apiGet('/reviews/display', params)
    const rows = Array.isArray(data.data) ? data.data : []
    return {
      success: true,
      items: rows.map((row, index) => ({
        id: `ord-${row.ord_id}-${index}`,
        ordId: row.ord_id,
        prodId: row.prod_id,
        custId: row.cust_id,
        status: row.status || 'APPROVED',
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

/** POST /reviews/create - rate/review a product the customer ordered. */
export function createReview(payload) {
  return apiPost('/reviews/create', payload)
}

/** PUT /reviews/update - edit while not yet approved. */
export function updateReview(payload) {
  return apiPut('/reviews/update', payload)
}

/** POST /reviews/moderate - employee approves/rejects a review. */
export function moderateReview(payload) {
  return apiPost('/reviews/moderate', payload)
}

/** DELETE /reviews/delete - remove a review. */
export function deleteReview(payload) {
  return apiDelete('/reviews/delete', payload)
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
