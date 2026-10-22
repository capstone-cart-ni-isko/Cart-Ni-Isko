import { apiGet, apiPost, apiPut, apiDelete } from './api.js'
import { normalizeProductCategory } from '../data/productCategories.js'

const CATEGORY_IMAGES = {
  Hoodies: '/src/assets/Images/unnamed (4).png',
  Shirts: '/src/assets/Images/unnamed (11).png',
  Jackets: '/src/assets/Images/unnamed (12).png',
  Caps: '/src/assets/Branding/Copy of cap.png',
  Lanyards: '/src/assets/Branding/Copy of lanyard.png',
  Stickers: '/src/assets/Images/unnamed (10).png',
  Pins: '/src/assets/Branding/Copy of badge.png',
  Totebags: '/src/assets/Images/totebag.png',
  Accessories: '/src/assets/Branding/Copy of store.png',
}

function categoryImage(category) {
  return CATEGORY_IMAGES[category] || CATEGORY_IMAGES.Accessories
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

/** "Cream / Medium" - the label of one combination, else its variation name. */
export function optionLabel(variant) {
  const values = Object.values(optionsMap(variant?.prodvar_options)).filter(Boolean)
  return values.length > 0 ? values.join(' / ') : String(variant?.prodvar_name || 'Standard')
}

/** The axes a product varies along, derived from its own variation rows. */
export function optionAxes(variations) {
  const axes = []
  ;(Array.isArray(variations) ? variations : []).forEach((variant) => {
    Object.keys(optionsMap(variant?.prodvar_options)).forEach((axis) => {
      if (!axes.includes(axis)) axes.push(axis)
    })
  })
  return axes
}

/** A slug safe for the SKU column (a combination label carries slashes). */
function skuSlug(value) {
  return String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase() || 'VAR'
}

/**
 * Map a backend Product model row to the admin inventory display shape.
 * Stock, variants and imagery come from the `variations` array (prodvar
 * rows); the legacy JSON columns are honoured as a fallback.
 */
export function mapAdminProduct(row) {
  if (!row) return null
  const category = normalizeProductCategory(row.prod_categ, row.prod_name)
  const variations = Array.isArray(row.variations)
    ? row.variations.filter((variant) => variant && variant.prodvar_id !== undefined)
    : []
  const hasVariations = variations.length > 0
  const qty = hasVariations
    ? variations.reduce((total, variant) => total + (Number(variant.prodvar_stock) || 0), 0)
    : Number(row.prod_qty ?? 0)
  const mainVariant = variations.find((variant) => variant.prodvar_main && variant.prodvar_pic)
    || variations.find((variant) => variant.prodvar_pic)
  const image = (hasVariations && mainVariant?.prodvar_pic)
    || (Array.isArray(row.prod_images) && row.prod_images[0])
    || categoryImage(category)
  // Normalize backend status vocabulary ('In Stock' / 'Out of Stock' /
  // 'Pre-order') into the inventory UI's publication vocabulary
  // ('Published' / 'Draft' / 'Out of Stock').
  const disabled = !!row.prod_disabled
  const rawStatus = String(row.prod_status || '').trim()
  const status = disabled
    ? 'Unlisted'
    : rawStatus === 'In Stock'
    ? 'Published'
    : rawStatus === 'Pre-order'
    ? 'Published'
    : rawStatus === 'Out of Stock'
    ? 'Out of Stock'
    : rawStatus || (qty > 0 ? 'Published' : 'Out of Stock')
  // Pre-order: the product-level flag is authoritative (an admin marks the
  // whole product, or switches it back to in stock), and a per-variation flag
  // lets a single combination be a pre-order while the rest stays in stock.
  //
  // A product with no stock and no pre-order flag is genuinely out of stock -
  // it is NOT a pre-order - so the availability below can be trusted by the
  // "Out of Stock" KPI.
  const productPreorder = row.prod_preorder === true
    || row.prod_preorder === 1
    || row.prod_preorder === '1'
  const variationPreorder = (hasVariations
    && variations.some((variant) => Boolean(variant.prodvar_preorder)))
    || row.prod_preorder_any === true
  const preorder = productPreorder || variationPreorder
  const availability = preorder ? 'Pre-order' : qty > 0 ? 'In Stock' : 'Out of Stock'
  // Low-stock alerting is driven by the configurable system setting the
  // backend ships on every product row (FLOW-MANAGE_INV-06 / REQ-MANAGE_INV-04
  // ask for a *configurable* threshold). The UI used to hardcode its own
  // number, which silently disagreed with the threshold the server alerts on.
  const lowStockThreshold = Number(row.low_stock_threshold) > 0
    ? Number(row.low_stock_threshold)
    : 5
  const variants = hasVariations
    ? variations.map((variant, i) => ({
        id: `var-${variant.prodvar_id ?? `${row.prod_id}-${i}`}`,
        // The register (walk-in POS) and the inventory stepper both need the
        // real prodvar_id, so a cart line can be rung up on the exact
        // variation instead of the product's main one.
        prodvarId: variant.prodvar_id != null ? Number(variant.prodvar_id) : null,
        name: String(variant.prodvar_name || 'Standard'),
        // A product variates along several axes at once, so the label of a
        // variation is its combination ("Cream / Medium") - the raw
        // prodvar_name is only what the admin chose to override it with.
        label: optionLabel(variant),
        options: optionsMap(variant.prodvar_options),
        sku: `${row.prod_tag}-${skuSlug(variant.prodvar_name || i)}`,
        stock: Number(variant.prodvar_stock ?? 0),
        markup: Number(variant.prodvar_markup ?? 0),
        price: Number(row.prod_price) + Number(variant.prodvar_markup ?? 0),
        pic: variant.prodvar_pic || '',
        preorder: productPreorder || !!variant.prodvar_preorder,
        // The variation's own flag, apart from the product-level one: an
        // editor has to see which combinations are flagged on their own.
        preorderFlag: !!variant.prodvar_preorder,
        main: !!variant.prodvar_main,
        available: variant.available !== false,
        status: (productPreorder || !!variant.prodvar_preorder)
          ? 'Pre-order'
          : (variant.prodvar_stock ?? 0) > 0 ? 'In Stock' : 'Out of Stock',
        lowStock: (Number(variant.prodvar_stock) || 0) > 0
          && (Number(variant.prodvar_stock) || 0) <= lowStockThreshold,
        lastUpdated: row.prod_created ? new Date(row.prod_created).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Just now',
      }))
    : (row.prod_sizes || []).map((size, i) => ({
        id: `var-${row.prod_id}-${i}`,
        prodvarId: null,
        name: `${['Pins', 'Stickers', 'Lanyards', 'Totebags', 'Keychains', 'Accessories'].includes(category) ? 'Standard' : size}`,
        label: `${['Pins', 'Stickers', 'Lanyards', 'Totebags', 'Keychains', 'Accessories'].includes(category) ? 'Standard' : size}`,
        options: {},
        sku: `${row.prod_tag}-${size}`,
        stock: qty,
        markup: 0,
        price: Number(row.prod_price) || 0,
        pic: '',
        preorder: productPreorder,
        preorderFlag: false,
        main: i === 0,
        available: true,
        status: productPreorder ? 'Pre-order' : qty > 0 ? 'In Stock' : 'Out of Stock',
        lowStock: qty > 0 && qty <= lowStockThreshold,
        lastUpdated: row.prod_created ? new Date(row.prod_created).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Just now',
      }))

  return {
    id: `prod-${row.prod_id}`,
    prodId: row.prod_id != null ? Number(row.prod_id) : null,
    name: row.prod_name || 'Unnamed Product',
    sku: row.prod_tag || `PROD-${row.prod_id}`,
    category,
    categoryName: category,
    availability,
    preorder,
    // The product-level flag on its own, apart from the per-variation flags:
    // this is what the "Mark Pre-order" / "Mark In Stock" switch writes.
    productPreOrder: productPreorder,
    totalStock: qty,
    price: Number(row.prod_price) || 0,
    // prod_peaksold is gone (aggregate from prodsales server-side);
    // the column no longer exists on the payload.
    orders: Number(row.prod_peaksold) || 0,
    status,
    image,
    variants,
    preOrder: preorder,
    disabled,
    description: row.prod_desc || '',
    published: !disabled && status !== 'Draft',
    variations: hasVariations ? variations : [],
    total_var: Number(row.prod_total_var ?? variations.length),
    rating: Number(row.prod_rating ?? 0),
    reviewCount: Number(row.prod_reviews ?? row.prod_review_count ?? 0),
    lowStock: qty > 0 && qty <= lowStockThreshold,
    lowStockThreshold,
    // FLOW-MANAGE_INV-04: the list can sort by creation date from the payload.
    createdAt: row.prod_created || null,
    // The axes this product varies along - ["Color","Size"] - so the inventory
    // screens render as many facets as the product really has instead of
    // assuming one. Derived from the variation rows when the payload does not
    // carry the summary (an older backend).
    axes: Array.isArray(row.option_axes) && row.option_axes.length > 0
      ? row.option_axes
      : optionAxes(variations),
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
  const rows = [...(Array.isArray(active.data) ? active.data : []), ...(Array.isArray(unlisted.data) ? unlisted.data : [])]
  return rows.map(mapAdminProduct).filter(Boolean)
}

/**
 * POST /products/add - Add a product to the backend.
 *
 * FLOW-ADD_PROD-02/03: a product always has at least one variation, and each
 * variation carries its own name, stock quantity, optional markup and optional
 * image. The backend synthesises a single "Standard" variation when none is
 * sent, which is why the form has to send them explicitly.
 *
 * A variation also carries `prodvar_options` - the {axis: value} pairs of the
 * combination it stands for ({"Color":"Cream","Size":"Medium"}). That is what
 * lets one product variate along several axes at the same time: the admin
 * defines the axes and their values once, and the form explodes them into one
 * row per combination.
 *
 * `prod_tag` is deliberately NOT sent: FLOW-ADD_PROD-07 makes the system
 * generate the unique internal tag from the product name (and rule 61 wants it
 * to belong to exactly one product), so a client-made tag would only collide.
 */
export function createAdminProduct(productData) {
  const preorder = !!productData.preorder
  return apiPost('/products/add', {
    prod_name: productData.name,
    prod_categ: productData.category,
    prod_price: productData.price,
    prod_qty: productData.stock,
    prod_desc: productData.desc || '',
    prod_images: productData.photo ? [productData.photo] : null,
    // A pre-order product needs no stock to be listed, so the switch is sent
    // as its own flag and the variations inherit it.
    prod_preorder: preorder,
    ...(Array.isArray(productData.variations) && productData.variations.length > 0
      ? {
          variations: productData.variations.map((row) => ({
            prodvar_name: row.name,
            prodvar_stock: row.stock,
            ...(row.markup ? { prodvar_markup: row.markup } : {}),
            ...(row.pic ? { prodvar_pic: row.pic } : {}),
            // A variation of a pre-order product is a pre-order too, unless
            // the row says otherwise.
            prodvar_preorder: row.preorder !== undefined ? !!row.preorder : preorder,
            // The combination this row stands for. Sent as a JSON string: the
            // backend stores the cell as varchar and decodes it back to a map.
            ...(row.options && Object.keys(row.options).length > 0
              ? { prodvar_options: JSON.stringify(row.options) }
              : {}),
          })),
        }
      : {}),
  })
}

/**
 * PUT /products/update - Move a whole product between "Pre-order" and
 * "In Stock".
 *
 * The switch is product-level: the backend applies it to the product row and
 * to every one of its variations, so a pre-order product can be switched back
 * to in stock (and vice versa) without touching each combination by hand.
 */
export function setAdminProductPreorder(prodId, preorder) {
  return apiPut('/products/update', {
    prod_id: prodId,
    prod_preorder: !!preorder,
  })
}

/** PUT /products/update - Update the product-level details of a product. */
export function updateAdminProduct(prodId, updateData) {
  return apiPut('/products/update', {
    prod_id: prodId,
    ...updateData,
  })
}

/**
 * PUT /products/update with a `variant` payload - add, edit or remove ONE
 * variation of a product.
 *
 * This is the path the inventory UI uses for anything short of re-defining the
 * whole product: `PUT /products/update` with a `variations` array reconciles the
 * set, and a reconciliation that replaced every row would orphan the bag rows
 * of customers already holding those variations and detach their prodsales
 * history. A single row never has that problem.
 *
 * @param {object} variant
 *   prodvar_id     - omit to ADD a new variation
 *   prodvar_name   - derived from the options when omitted
 *   prodvar_stock / prodvar_markup / prodvar_pic
 *   prodvar_options- {Color: 'Cream', Size: 'Medium'}
 *   prodvar_preorder / prodvar_main / prodvar_disabled - booleans
 *   remove         - true to retire the variation
 */
export function saveAdminVariant(prodId, variant) {
  const { options, remove, ...rest } = variant || {}
  return apiPut('/products/update', {
    prod_id: prodId,
    variant: {
      ...rest,
      ...(options !== undefined ? { prodvar_options: options } : {}),
      ...(remove !== undefined ? { remove: !!remove } : {}),
    },
  })
}

/** DELETE /products/remove - Soft-delete a product from the backend. */
export function removeAdminProduct(prodId) {
  return apiDelete('/products/remove', { prod_id: prodId })
}

/**
 * GET /products/sales - FLOW-MANAGE_INV-08 / REQ-MANAGE_INV-06: the per-product
 * sales history (daily quantity, revenue and trend) aggregated from prodsales,
 * queryable by date range (REQ-MANAGE_INV-07).
 */
export async function fetchProductSales(prodId, { dateFrom = null, dateTo = null } = {}) {
  const params = {}
  if (prodId != null) params.prod_id = prodId
  if (dateFrom) params.date_from = dateFrom
  if (dateTo) params.date_to = dateTo
  const data = await apiGet('/products/sales', params)
  return data?.data ?? data
}

/** GET /products/categories - the predefined, system-wide category set. */
export async function fetchProductCategories() {
  const data = await apiGet('/products/categories')
  return Array.isArray(data?.data) ? data.data : []
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
