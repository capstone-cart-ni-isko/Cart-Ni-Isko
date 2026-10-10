import { apiGet, cacheRead, cacheWrite } from './api.js'

/* The catalog is public and only changes when an admin edits it, so the last
   answer per filter set is mirrored for 60s: the storefront paints instantly
   and the request that follows only refreshes what is on screen. */
const CACHE_KEY = (params) => `cartniisko:catalog:${JSON.stringify(params)}`

export function readCatalogCache(params) {
  return cacheRead(CACHE_KEY(params))
}

export function writeCatalogCache(params, rows) {
  cacheWrite(CACHE_KEY(params), rows)
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

/** Parse a prodvar_options cell (JSON string or object) into a map. */
function optionsMap(raw) {
  if (!raw) return {}
  if (typeof raw === 'object') return raw
  try {
    const parsed = JSON.parse(String(raw))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * Normalize the canonical `variations` array (prodvar rows:
 * prodvar_id, prodvar_name, prodvar_pic, prodvar_stock,
 * prodvar_main, prodvar_markup, prodvar_options, prodvar_preorder).
 * Legacy JSON columns (prod_sizes / prod_images / ...) are honoured
 * as a fallback so either backend generation renders.
 */
export function normalizeVariations(row) {
  if (Array.isArray(row?.variations)) {
    return row.variations
      .filter((variant) => variant && variant.prodvar_id !== undefined)
      .map((variant) => ({
        prodvar_id: variant.prodvar_id,
        prodvar_name: String(variant.prodvar_name || 'Standard'),
        prodvar_pic: variant.prodvar_pic || '',
        prodvar_stock: Number(variant.prodvar_stock ?? 0),
        prodvar_main: Boolean(variant.prodvar_main),
        prodvar_markup: Number(variant.prodvar_markup ?? 0),
        prodvar_options: optionsMap(variant.prodvar_options),
        prodvar_preorder: Boolean(variant.prodvar_preorder),
      }))
  }
  return []
}

/** Sum of every variation's stock (replaces prod_qty). */
export function variationStock(variations) {
  return variations.reduce((total, variant) => total + (Number(variant.prodvar_stock) || 0), 0)
}

/**
 * The axes a product varies along, in first-seen order: ["Color","Size"], or
 * ["Color","Material"] for a shirt that comes in colour and material. Derived
 * from the variation rows themselves, so the shape a product has is whatever
 * its rows say - it is never fixed in the schema.
 */
export function variationAxes(variations) {
  const axes = []
  ;(Array.isArray(variations) ? variations : []).forEach((variant) => {
    Object.keys(variant.prodvar_options || {}).forEach((axis) => {
      if (!axes.includes(axis)) axes.push(axis)
    })
  })
  return axes
}

/** The main image: the prodvar flagged main, else the first with a pic. */
export function mainVariationImage(variations) {
  const main = variations.find((variant) => variant.prodvar_main && variant.prodvar_pic)
    || variations.find((variant) => variant.prodvar_pic)
  return main ? main.prodvar_pic : ''
}

/**
 * The values of the SECOND axis a product varies along, in first-seen order.
 *
 * A shirt that variates by colour and size answers ["S","M","L"]; one that
 * variates by colour and material answers ["Regular","Metallic"]. A product
 * with no second axis falls back to its variation labels, which for a
 * single-axis product are exactly the values of that one axis.
 */
export function variationSizes(variations, secondAxis = null) {
  const sizes = []
  variations.forEach((variant) => {
    const options = variant.prodvar_options || {}
    const axisKey = secondAxis
      && Object.keys(options).find((key) => key.toLowerCase() === String(secondAxis).toLowerCase())
    const candidate = (axisKey && options[axisKey]) || options.size || options.sizes || variant.prodvar_name
    if (candidate && !sizes.includes(candidate)) sizes.push(candidate)
  })
  return sizes
}

/**
 * Color swatches derived from prodvar_options. Each entry keeps the
 * catalog shape { name, value, image, gallery } the color picker
 * renders; the image is the variation's own pic when it has one.
 */
export function variationColors(variations, fallbackImage) {
  const colors = []
  variations.forEach((variant) => {
    const options = variant.prodvar_options || {}
    const name = options.color || options.colour || variant.prodvar_name
    if (!name || colors.some((entry) => entry.name === name)) return
    const image = variant.prodvar_pic || fallbackImage
    colors.push({ name, value: image, image, gallery: image ? [image] : [] })
  })
  return colors
}

/**
 * Stock matrix in the legacy shape stockMatrix[colorName][size] = stock,
 * rebuilt from the variation rows. The second axis supplies the column key, so
 * a product that variates by colour and material still resolves
 * [colour][material] rather than [colour]["Black / Metallic"].
 */
export function variationStockMatrix(variations, secondAxis = null) {
  const matrix = {}
  variations.forEach((variant) => {
    const options = variant.prodvar_options || {}
    const color = options.color || options.colour || 'Standard'
    const axisKey = secondAxis
      && Object.keys(options).find((key) => key.toLowerCase() === String(secondAxis).toLowerCase())
    const size = (axisKey && options[axisKey]) || options.size || variant.prodvar_name
    if (!matrix[color]) matrix[color] = {}
    matrix[color][size] = (matrix[color][size] || 0) + (Number(variant.prodvar_stock) || 0)
  })
  return matrix
}

function defaultPresentation(row, category) {
  const image = CATEGORY_IMAGES[category] || CATEGORY_IMAGES.Accessories
  const isApparel = category === 'Hoodie' || category === 'Shirts' || category === 'Varsity Jacket'
  const variations = normalizeVariations(row)
  const qty = Number(row.prod_qty ?? variationStock(variations) ?? 0)

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
  const variations = normalizeVariations(row)
  const fallback = defaultPresentation(row, category)

  // The variation rows are the source of truth; the legacy JSON
  // columns (prod_sizes / prod_colors / prod_images / prod_details /
  // prod_stock_matrix / prod_preorder / prod_qty) are only read
  // when the backend did not send `variations`.
  const hasVariations = variations.length > 0
  const qty = Number(
    hasVariations ? variationStock(variations) : (row.prod_qty ?? 0)
  )
  // A product may variate along several axes at the same time - colour and
  // size, or colour and material - so the picker headings come from the axes
  // the product's own rows carry rather than from a fixed pair.
  const axes = Array.isArray(row.option_axes) && row.option_axes.length > 0
    ? row.option_axes
    : variationAxes(variations)
  const colorAxis = axes.find((axis) => /colou?r/i.test(axis)) || axes[0] || null
  const secondAxis = axes.find((axis) => axis !== colorAxis) || null
  const preOrder = hasVariations
    ? variations.some((variant) => variant.prodvar_preorder)
    : row.prod_preorder === true || (qty <= 0 && row.prod_preorder !== false)
  const mainImage = hasVariations ? mainVariationImage(variations) : ''
  const sizes = hasVariations && variationSizes(variations, secondAxis).length > 0
    ? variationSizes(variations, secondAxis)
    : (row.prod_sizes || fallback.sizes)
  const colors = hasVariations && variationColors(variations, mainImage || fallback.images[0]).length > 0
    ? variationColors(variations, mainImage || fallback.images[0])
    : (row.prod_colors || fallback.colors)
  const images = hasVariations && mainImage
    ? [mainImage]
    : (Array.isArray(row.prod_images) && row.prod_images.length > 0
      ? row.prod_images
      : fallback.images)
  const stockMatrix = hasVariations
    ? variationStockMatrix(variations, secondAxis)
    : (row.prod_stock_matrix || fallback.stockMatrix)
  const rating = Number(row.prod_rating ?? 0)
  // prod_reviews is an int count now; a legacy backend may still
  // answer with the JSON array, in which case the count column is
  // the number to show.
  const rawReviewCount = Array.isArray(row.prod_reviews)
    ? row.prod_review_count
    : (row.prod_reviews ?? row.prod_review_count)
  const reviewCount = Number(rawReviewCount ?? 0)

  return {
    ...fallback,
    sizes,
    colors,
    images,
    preOrder,
    details: row.prod_details || fallback.details,
    rating,
    reviewCount,
    ratingBreakdown: row.prod_rating_breakdown || fallback.ratingBreakdown,
    // The embedded review array is gone; reviews are fetched through
    // /reviews/display (see reviews.js).
    reviews: Array.isArray(row.prod_reviews) ? row.prod_reviews : [],
    stockMatrix,
    // Canonical variation rows, exposed for the detail/Cart screens.
    variations: hasVariations ? variations : [],
    axes,
    colorAxis,
    secondAxis,
    id: tag,
    prodId: row.prod_id,
    name: row.prod_name || tag,
    price: Number(row.prod_price ?? 0),
    category,
    description: row.prod_desc || '',
    qty,
    total_var: Number(row.prod_total_var ?? variations.length),
    status: preOrder ? 'For Pre-order' : qty > 0 ? 'In Stock' : 'Out of Stock',
    tag: row.prod_tag || undefined,
    prod_desc: row.prod_desc || undefined,
    prod_categ: row.prod_categ || undefined,
  }
}

export async function fetchCatalog(params = {}) {
  const data = await apiGet('/products/filter', { status: 'active', ...params })
  const rows = (data.data || []).map(mapProduct)
  writeCatalogCache(params, rows)
  return rows
}

export async function fetchProduct(id) {
  const isNumeric = /^\d+$/.test(String(id))
  const data = await apiGet('/products/view', isNumeric ? { prod_id: id } : { prod_tag: id })
  return mapProduct(data.data)
}
