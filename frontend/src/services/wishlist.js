import { apiGet, apiPost } from './api.js'
import { mapProduct } from './products.js'

/**
 * Backend rows come back as wishlist entries with an embedded `product`
 * relation. Convert each one into the same product shape the catalog uses
 * so ProductCard / Wishlist can render them directly.
 */
function itemToProduct(item) {
  const row = item?.product
  if (!row) return null
  const mapped = mapProduct(row)
  if (!mapped) return null
  return {
    ...mapped,
    wishQty: item.item_qty ?? 1,
    wishAmount: item.item_amount != null ? Number(item.item_amount) : mapped.price,
  }
}

/** GET /wishlist/display - server source of truth for one customer. */
export async function fetchWishlist(custId) {
  const data = await apiGet('/wishlist/display', { cust_id: custId })
  const items = data?.data?.items || []
  return items.map(itemToProduct).filter(Boolean)
}

/** POST /wishlist/add - accepts numeric prod_id or prod_tag. */
export function addWishlistItem(custId, prodId, itemQty = 1, itemAmount = null) {
  const body = { cust_id: custId, prod_id: prodId, item_qty: itemQty }
  if (itemAmount !== null && itemAmount !== undefined) body.item_amount = itemAmount
  return apiPost('/wishlist/add', body)
}

/** POST /wishlist/remove - idempotent delete for one product. */
export function removeWishlistItem(custId, prodId) {
  return apiPost('/wishlist/remove', { cust_id: custId, prod_id: prodId })
}

/** Best-effort identifier for the API: numeric prod_id, else prod_tag. */
export function wishlistKey(product) {
  return product?.prodId ?? product?.id ?? null
}
