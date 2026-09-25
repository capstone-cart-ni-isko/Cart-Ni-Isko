import { apiGet } from './api.js'

// The single-threaded dev server can be slow under parallel requests; give it
// time instead of giving up early.
const REQUEST_TIMEOUT_MS = 15000

function withTimeout(promise) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Can't reach the store server. Please try again.")), REQUEST_TIMEOUT_MS)
    ),
  ])
}

/** Sizes/colours are options only; the legacy stock matrix's keys still name them. */
function colorsFromMatrix(matrix, fallback) {
  const names = matrix && typeof matrix === 'object' ? Object.keys(matrix) : []
  if (names.length === 0) return fallback
  const image = fallback[0]?.image
  return names.map((name) => ({ name, value: name, image, gallery: image ? [image] : [] }))
}

function sizesFromMatrix(matrix, fallback) {
  const first = matrix && typeof matrix === 'object' ? Object.values(matrix)[0] : null
  const sizes = first && typeof first === 'object' ? Object.keys(first) : []
  return sizes.length > 0 ? sizes : fallback
}

const CATEGORY_ALIASES = {
  HOODIE: 'Hoodie',
  HOODIES: 'Hoodie',
  SHIRT: 'Shirts',
  SHIRTS: 'Shirts',
  'VARSITY JACKET': 'Varsity Jacket',
  ACCESSORIES: 'Accessories',
  ACCESSORY: 'Accessories',
  CAP: 'Cap',
  LANYARD: 'Lanyard',
  PINS: 'Pins',
  PIN: 'Pins',
}

const CATEGORY_IMAGES = {
  Hoodie: '/src/assets/Images/unnamed (4).png',
  Shirts: '/src/assets/Images/unnamed (11).png',
  'Varsity Jacket': '/src/assets/Images/unnamed (12).png',
  Cap: '/src/assets/Branding/Copy of cap.png',
  Lanyard: '/src/assets/Branding/Copy of lanyard.png',
  Pins: '/src/assets/Branding/Copy of badge.png',
  Accessories: '/src/assets/Branding/Copy of store.png',
}

function normalizeCategory(raw, name = '') {
  const key = String(raw || '').trim()
  const mapped = CATEGORY_ALIASES[key.toUpperCase()] || key
  if (mapped === 'Accessories') {
    const lower = name.toLowerCase()
    if (lower.includes('lanyard')) return 'Lanyard'
    if (lower.includes('cap')) return 'Cap'
    if (lower.includes('pin')) return 'Pins'
  }
  return mapped || 'Accessories'
}

function defaultPresentation(row, category) {
  const image = CATEGORY_IMAGES[category] || CATEGORY_IMAGES.Accessories
  const isApparel = category === 'Hoodie' || category === 'Shirts' || category === 'Varsity Jacket'
  const qty = Number(row.prod_qty ?? 0)

  return {
    sizes: isApparel ? ['S', 'M', 'L', 'XL', '2XL'] : ['One Size'],
    colors: [
      {
        name: 'Standard',
        value: '#FF6A00',
        image,
        gallery: [image],
      },
    ],
    images: [image],
    preOrder: qty <= 0,
    details: {
      material: row.prod_desc || 'Official Tindahan ni Isko merchandise.',
      sizeFit: isApparel ? 'True to size collegiate fit.' : 'One size.',
      care: 'Follow the care label. Wash inside out with like colors.',
      shippingReturns: 'Store pickup at BU Student Center or courier delivery across Albay & nationwide. 7-day replacement for defects or sizing issues.',
    },
    rating: 0,
    reviewCount: 0,
    ratingBreakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
    reviews: [],
    stockMatrix: {},
  }
}

export function mapProduct(row) {
  if (!row) return null

  const tag = row.prod_tag || `prod-${row.prod_id}`
  const category = normalizeCategory(row.prod_categ, row.prod_name || '')
  const qty = Number(row.prod_qty ?? 0)
  const preOrder = row.prod_preorder === true || (qty <= 0 && row.prod_preorder !== false)
  const fallback = defaultPresentation(row, category)

  return {
    ...fallback,
    sizes: row.prod_sizes || sizesFromMatrix(row.prod_stock_matrix, fallback.sizes),
    colors: row.prod_colors || colorsFromMatrix(row.prod_stock_matrix, fallback.colors),
    images: row.prod_images || fallback.images,
    preOrder: row.prod_preorder ?? preOrder,
    details: row.prod_details || fallback.details,
    rating: row.prod_rating ?? 0,
    reviewCount: row.prod_review_count ?? 0,
    ratingBreakdown: row.prod_rating_breakdown || fallback.ratingBreakdown,
    reviews: row.prod_reviews || [],
    // Stock is one number per product (prod_qty): the admin edits it and
    // checkout deducts it. Per-size counts are intentionally not exposed.
    stockMatrix: {},
    id: tag,
    prodId: row.prod_id,
    name: row.prod_name || tag,
    price: Number(row.prod_price ?? 0),
    category,
    description: row.prod_desc || '',
    qty,
    status: preOrder ? 'For Pre-order' : qty > 0 ? 'In Stock' : 'Out of Stock',
    tag: row.prod_tag || undefined,
    prod_desc: row.prod_desc || undefined,
    prod_categ: row.prod_categ || undefined,
  }
}

/** GET /products/filter - live catalog. Throws when the server can't be reached. */
export async function fetchCatalog(params = {}) {
  const data = await withTimeout(apiGet('/products/filter', { status: 'active', ...params }))
  return (data.data || []).map(mapProduct).filter(Boolean)
}

/** GET /products/view - one product, or null when it doesn't exist. Throws on network failure. */
export async function fetchProduct(id) {
  const isNumeric = /^\d+$/.test(String(id))
  try {
    const data = await withTimeout(
      apiGet('/products/view', isNumeric ? { prod_id: id } : { prod_tag: id })
    )
    return data?.data ? mapProduct(data.data) : null
  } catch (err) {
    if (err?.status === 404) return null
    throw err
  }
}

export async function fetchProductReviews(prodId) {
  if (!prodId) return []
  const data = await apiGet('/reviews/display', { prod_id: prodId })
  return data.data || []
}
