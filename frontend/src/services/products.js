import { apiGet } from './api.js'
import localProducts from '../data/products.json'

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
    sizes: row.prod_sizes || fallback.sizes,
    colors: row.prod_colors || fallback.colors,
    images: row.prod_images || fallback.images,
    preOrder: row.prod_preorder ?? preOrder,
    details: row.prod_details || fallback.details,
    rating: row.prod_rating ?? 0,
    reviewCount: row.prod_review_count ?? 0,
    ratingBreakdown: row.prod_rating_breakdown || fallback.ratingBreakdown,
    reviews: row.prod_reviews || [],
    stockMatrix: row.prod_stock_matrix || {},
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

export async function fetchCatalog(params = {}) {
  try {
    const data = await Promise.race([
      apiGet('/products/filter', { status: 'active', ...params }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('API Timeout')), 4000))
    ])
    const rows = (data.data || []).map(mapProduct).filter(Boolean)
    if (rows.length > 0) return rows
  } catch (err) {
    console.warn('API catalog fetch failed or timed out, using fallback catalog:', err?.message || err)
  }
  return localProducts
}

export async function fetchProduct(id) {
  const isNumeric = /^\d+$/.test(String(id))
  try {
    const data = await Promise.race([
      apiGet('/products/view', isNumeric ? { prod_id: id } : { prod_tag: id }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('API Timeout')), 4000))
    ])
    if (data?.data) {
      return mapProduct(data.data)
    }
  } catch (err) {
    console.warn('API product fetch failed, checking local catalog:', err?.message || err)
  }
  return localProducts.find((p) => p.id === String(id) || String(p.prod_id) === String(id)) || null
}

export async function fetchProductReviews(prodId) {
  if (!prodId) return []
  const data = await apiGet('/reviews/display', { prod_id: prodId })
  return data.data || []
}
