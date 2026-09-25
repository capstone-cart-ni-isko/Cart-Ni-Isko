import { apiGet, apiPost, apiPut, apiDelete } from './api.js'

const CATEGORY_IMAGES = {
  Hoodie: '/src/assets/Images/unnamed (4).png',
  Shirts: '/src/assets/Images/unnamed (11).png',
  'Varsity Jacket': '/src/assets/Images/unnamed (12).png',
  Cap: '/src/assets/Branding/Copy of cap.png',
  Lanyard: '/src/assets/Branding/Copy of lanyard.png',
  Pins: '/src/assets/Branding/Copy of badge.png',
  Accessories: '/src/assets/Branding/Copy of store.png',
}

function normalizeCategory(raw) {
  const key = String(raw || '').trim()
  const upper = key.toUpperCase()
  if (upper === 'HOODIE' || upper === 'HOODIES') return 'Hoodie'
  if (upper === 'SHIRT' || upper === 'SHIRTS') return 'Shirts'
  if (upper === 'VARSITY JACKET') return 'Varsity Jacket'
  if (upper === 'CAP') return 'Cap'
  if (upper === 'LANYARD') return 'Lanyard'
  if (upper === 'PINS' || upper === 'PIN') return 'Pins'
  if (upper === 'ACCESSORIES' || upper === 'ACCESSORY') return 'Accessories'
  return key || 'Accessories'
}

function categoryImage(category) {
  return CATEGORY_IMAGES[category] || CATEGORY_IMAGES.Accessories
}

/**
 * Map a backend Product model row to the admin inventory display shape.
 */
export function mapAdminProduct(row) {
  if (!row) return null
  const category = normalizeCategory(row.prod_categ)
  const qty = Number(row.prod_qty ?? 0)
  const image = (Array.isArray(row.prod_images) && row.prod_images[0]) || categoryImage(category)
  // Normalize backend status vocabulary ('In Stock' / 'Out of Stock') into the
  // inventory UI's publication vocabulary ('Published' / 'Draft' / 'Out of Stock').
  const disabled = !!row.prod_disabled
  const rawStatus = String(row.prod_status || '').trim()
  const status = disabled
    ? 'Unlisted'
    : rawStatus === 'In Stock'
    ? 'Published'
    : rawStatus === 'Out of Stock'
    ? 'Out of Stock'
    : rawStatus || (qty > 0 ? 'Published' : 'Out of Stock')
  const preOrder = row.prod_preorder === true || row.prod_preorder === 1 || row.prod_preorder === '1'
  const availability = preOrder ? 'Pre-order' : qty > 0 ? 'Regular' : 'Out of Stock'
  const variants = (row.prod_sizes || []).map((size, i) => ({
    id: `var-${row.prod_id}-${i}`,
    name: `${category === 'Accessories' ? 'Standard' : size}`,
    sku: `${row.prod_tag}-${size}`,
    stock: qty,
    price: Number(row.prod_price) || 0,
    status: qty > 0 ? 'In Stock' : 'Out of Stock',
    lastUpdated: row.prod_created ? new Date(row.prod_created).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Just now',
  }))

  return {
    id: `prod-${row.prod_id}`,
    name: row.prod_name || 'Unnamed Product',
    sku: row.prod_tag || `PROD-${row.prod_id}`,
    category,
    categoryName: category,
    availability,
    totalStock: qty,
    price: Number(row.prod_price) || 0,
    orders: Number(row.prod_peaksold) || 0,
    status,
    image,
    variants,
    preOrder,
    disabled,
    description: row.prod_desc || '',
    published: !disabled && status !== 'Draft',
  }
}

/**
 * GET /products/filter - Fetch active AND unlisted products, so the admin
 * catalog keeps showing disabled rows and can sell (relist) them again.
 */
export async function fetchAdminProducts() {
  const [active, unlisted] = await Promise.all([
    apiGet('/products/filter', { status: 'active' }),
    apiGet('/products/filter', { status: 'disabled' }),
  ])
  const rows = [...(active.data || []), ...(unlisted.data || [])]
  return rows.map(mapAdminProduct).filter(Boolean)
}

/**
 * POST /products/add - Add a product to the backend.
 */
export function createAdminProduct(productData) {
  return apiPost('/products/add', {
    prod_name: productData.name,
    prod_tag: productData.sku,
    prod_categ: productData.category,
    prod_price: productData.price,
    prod_qty: productData.stock,
    prod_desc: productData.desc || '',
    prod_images: productData.photo ? [productData.photo] : null,
  })
}

/**
 * PUT /products/update - Update a product in the backend.
 */
export function updateAdminProduct(prodId, updateData) {
  return apiPut('/products/update', {
    prod_id: prodId,
    ...updateData,
  })
}

/**
 * DELETE /products/remove - Soft-delete a product from the backend.
 */
export function removeAdminProduct(prodId) {
  return apiDelete('/products/remove', { prod_id: prodId })
}

/**
 * PUT /products/unlist - Unlist a product.
 */
export function unlistAdminProduct(prodId) {
  return apiPost('/products/unlist', { prod_id: prodId })
}

/**
 * PUT /products/sell - Relist a product.
 */
export function sellAdminProduct(prodId) {
  return apiPost('/products/sell', { prod_id: prodId })
}
