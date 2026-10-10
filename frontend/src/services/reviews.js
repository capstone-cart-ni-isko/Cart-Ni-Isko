import { apiGet, apiPost, apiPut, apiDelete } from './api.js'

/**
 * DOMAIN 13 (PRODUCT REVIEWS).
 *
 * Reviews live in the `reviews` table (rev_id, cust_id, prod_id, rev_msg,
 * rev_created, rev_approved) and are only reachable through the Laravel API.
 * There is no rating column, so the rating travels inside `rev_msg` as a
 * leading "<rating>|" token - which is why every row below answers with both
 * the canonical fields (rating / message) and the legacy order-shaped aliases
 * (ord_rating / ord_review / ord_completed / ord_id) the screens still read.
 */

/**
 * Reviews written for a product, shaped for the ProductReviews component.
 * `status` ('pending' | 'approved') is the employee moderation queue filter
 * (the server only honours it for employee tokens).
 *
 * `prodId` is optional: with an employee token and no product the backend
 * answers with the WHOLE moderation queue (FLOW-MANAGE_REV-01), which is what
 * the admin page loads. Asking per product instead fired one request per
 * product - a load that grows with the catalog rather than with the reviews.
 */
export async function fetchProductReviews(prodId = null, status = null) {
  try {
    const params = {}
    if (prodId != null) params.prod_id = prodId
    if (status) params.status = status
    const data = await apiGet('/reviews/display', params)
    const rows = Array.isArray(data.data) ? data.data : []
    return {
      success: true,
      items: rows.map((row, index) => ({
        // FLOW-MANAGE_REV-05 / REQ-MANAGE_REV-04: rev_id is the canonical
        // handle, prod_id disambiguates a review when its order holds several
        // products. Both travel with every row so the moderation queue can
        // target the exact row instead of guessing an order.
        id: `rev-${row.rev_id ?? row.ord_id ?? index}`,
        revId: row.rev_id ?? null,
        prodId: row.prod_id ?? null,
        prodName: row.prod_name ?? null,
        ordId: row.ord_id,
        custId: row.cust_id,
        status: row.status || 'APPROVED',
        // FLOW-MANAGE_REV-02 / FLOW-MANAGE_REV-04: the employee queue shows
        // (and searches by) the customer's name, which ReviewsAPI returns as
        // cust_name. It is exposed additively so the customer-facing
        // ProductReviews list keeps its generic "Verified Student" label.
        author: 'Verified Student',
        custName: row.cust_name || null,
        rating: Number(row.ord_rating) || 0,
        date: row.ord_completed
          ? new Date(row.ord_completed).toLocaleDateString()
          : 'Recently',
        variant: 'Verified Purchase',
        // `message` is the review's real text. `ord_review` is the legacy alias
        // that carries the [REVIEW CENSORED] sentinel on a rejected row, so the
        // moderation queue prefers `message` and shows what was written.
        comment: row.message ?? row.ord_review ?? '',
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
