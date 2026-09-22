import { apiGet } from './api.js'

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

  const extras = {
    sizes: row.prod_sizes || defaultPresentation(row, category).sizes,
    colors: row.prod_colors || defaultPresentation(row, category).colors,
    images: row.prod_images || defaultPresentation(row, category).images,
    preOrder: row.prod_preorder ?? (qty <= 0),
    details: row.prod_details || defaultPresentation(row, category).details,
    rating: row.prod_rating ?? 0,
    reviewCount: row.prod_review_count ?? 0,
    ratingBreakdown: row.prod_rating_breakdown || { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
    reviews: row.prod_reviews || [],
    stockMatrix: row.prod_stock_matrix || {},
  }

  return {
    ...extras,
    id: tag,
    prodId: row.prod_id,
    name: row.prod_name || tag,
    price: Number(row.prod_price ?? 0),
    category,
    description: row.prod_desc || '',
    qty,
    preOrder,
    status: preOrder ? 'For Pre-order' : qty > 0 ? 'In Stock' : 'Out of Stock',
    tag: row.prod_tag || undefined,
    prod_desc: row.prod_desc || undefined,
    prod_categ: row.prod_categ || undefined,
  }
}

export async function fetchCatalog(params = {}) {
  const data = await apiGet('/products/filter', { status: 'active', ...params })
  return (data.data || []).map(mapProduct)
}

export async function fetchProduct(id) {
  const isNumeric = /^\d+$/.test(String(id))
  const data = await apiGet('/products/view', isNumeric ? { prod_id: id } : { prod_tag: id })
  return mapProduct(data.data)
}

export async function fetchProductReviews(prodId) {
  if (!prodId) return []
  const data = await apiGet('/reviews/display', { prod_id: prodId })
  return data.data || []
}
