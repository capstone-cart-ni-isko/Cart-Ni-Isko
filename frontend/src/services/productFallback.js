/**
 * Presentation fallbacks for catalog rows.
 *
 * This module is deliberately pure - no env vars, no network, no asset
 * imports - so the matching logic can be exercised outside the browser.
 * The catalogue (frontend/src/data/products.json) is passed in by the caller.
 */

/**
 * Presentation-only properties used when a DB row has no matching entry in
 * products.json. Never borrow another product's photos/variants: the UI shows
 * a placeholder instead of wrong imagery.
 */
export const EMPTY_VARIANT = {
  images: [],
  colors: [],
  sizes: [],
  rating: 0,
  reviews: [],
  badge: null,
}

export function toTitleCase(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/(^|[\s-])[a-z]/g, (m) => m.toUpperCase())
}

/**
 * Distinct words of at least 4 chars, so "bu" never matches "bunique" while
 * "lanyard" does.
 */
export function nameTokens(value) {
  return new Set(
    String(value || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 4)
  )
}

/**
 * Find the products.json entry that carries the photos/variants for a DB row:
 *  1. exact prod_tag / id match
 *  2. otherwise the closest name (shared word overlap) - e.g. the seeded
 *     "ITEM_xxxxx / BU Lanyard 477" rows belong to the lanyard product
 *  3. otherwise null -> placeholder UI
 *
 * @param {object} dbProduct   row from the `product` table
 * @param {Array}  catalogue   parsed products.json
 * @returns {object|null}
 */
export function findFallback(dbProduct, catalogue) {
  if (!dbProduct || !Array.isArray(catalogue)) return null

  const tag = dbProduct.prod_tag || `prod-${dbProduct.prod_id}`
  const exact = catalogue.find(
    (p) => p.id === tag || String(p.prod_id) === String(dbProduct.prod_id) || p.tag === tag
  )
  if (exact) return exact

  const wanted = nameTokens(dbProduct.prod_name)
  if (wanted.size === 0) return null

  let best = null
  let bestScore = 0
  for (const candidate of catalogue) {
    let score = 0
    nameTokens(candidate.name).forEach((token) => {
      if (wanted.has(token)) score += 1
    })
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }
  return bestScore > 0 ? best : null
}
