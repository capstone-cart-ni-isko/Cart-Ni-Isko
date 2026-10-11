import React, { useState, useMemo, useRef, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { useAdmin } from '../../hooks/useAdmin.js'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import ConfirmModal from '../../components/ui/ConfirmModal.jsx'
import { getImageUrl } from '../../utils/imageUtils.js'
import { uploadImage } from '../../services/upload.js'

/**
 * REQ-ADD_PROD-04: the product categories are a predefined, system-wide set.
 * These are the same values the backend whitelist (ProductsAPI::validatedCategory)
 * accepts and that GET /products/categories serves, so the form can never offer
 * a category the API will reject.
 *
 * The list is merged with the backend's own whitelist rather than being a
 * second, shorter copy of it: the inventory edit form sets its select to the
 * category a stored row carries, and a value missing from this list left the
 * select showing nothing at all (and silently dropping the category on save).
 */
const BACKEND_CATEGORIES = [
  'Shirts',
  'Hoodies',
  'Jackets',
  'Varsity Jacket',
  'Caps',
  'Lanyards',
  'Pins',
  'Stickers',
  'Accessories',
  'Windbreaker',
  'Others',
]

const PRODUCT_CATEGORIES = [
  'Shirts',
  'Hoodie',
  'Varsity Jacket',
  'Cap',
  'Lanyard',
  'Pins',
  'Accessories',
  ...BACKEND_CATEGORIES.filter((cat) => ![
    'Shirts',
    'Hoodie',
    'Varsity Jacket',
    'Cap',
    'Lanyard',
    'Pins',
    'Accessories',
  ].includes(cat)),
]

/**
 * REQ-ADD_PROD-07 / FLOW-ADD_PROD-03: the backend accepts JPG and PNG for a
 * variation image (ProductsAPI::parseVariations -> imageAllowed) and at most
 * 2 MB per image. The file picker used to advertise GIF and WebP, so an upload
 * succeeded and the product was then rejected with 422 — the two checks now
 * agree on one list.
 */
const ACCEPTED_IMAGE_TYPES = 'image/png,image/jpeg'
const ACCEPTED_IMAGE_MIME = ['image/png', 'image/jpeg']
const MAX_IMAGE_BYTES = 2 * 1024 * 1024

/**
 * REQ-ADD_PROD-02/03 + "a product can variate by color and size, or color and
 * material, at the same time".
 *
 * A variation row is ONE combination, and `prodvar_options` carries the
 * {axis: value} pairs behind it: {"Color":"Cream","Size":"Medium"}. The admin
 * therefore either types the combinations out by hand (a plain product, or one
 * axis), or lists the axes and their values once and lets the matrix explode
 * them into the cartesian product - cream/medium, cream/large, black/medium...
 *
 * Nothing about the shape is fixed: the axes are derived from the rows, so a
 * third axis ("Material") is just more rows, never a schema change.
 */
const MAX_OPTION_AXES = 4

const BLANK_VARIATION = { name: '', stock: '', markup: '', pic: '' }

/** Stable key of a combination, so a row survives an edit of the axes. */
function optionKey(options) {
  return JSON.stringify(
    Object.keys(options)
      .sort()
      .map((axis) => [axis, options[axis]])
  )
}

/** "Cream / Medium" - the label of one combination. */
function combinationLabel(options) {
  const values = Object.values(options || {}).filter(Boolean)
  return values.length > 0 ? values.join(' / ') : ''
}

/** The cartesian product of the axes, as one {axis: value} map per row. */
function cartesian(axes) {
  const usable = (axes || [])
    .map((entry) => ({
      axis: String(entry?.axis || '').trim(),
      values: [...new Set((entry?.values || []).map((v) => String(v || '').trim()).filter(Boolean))],
    }))
    .filter((entry) => entry.axis && entry.values.length > 0)

  let rows = [{}]
  usable.forEach(({ axis, values }) => {
    const next = []
    rows.forEach((row) => values.forEach((value) => next.push({ ...row, [axis]: value })))
    rows = next
  })
  return rows
}

export default function AdminInventory() {
  const { addProduct, updateProduct, deleteProduct, unlistProduct, sellProduct, adjustStock, updateVariant, removeVariant, products: backendProducts } = useAdmin()

  const [searchParams] = useSearchParams()

  // Product data state - synced directly from backend (refetched on every change)
  const productsList = backendProducts
  const [expandedRows, setExpandedRows] = useState({})
  const [selectedVariantIds, setSelectedVariantIds] = useState([])
  const [selectedProductIds, setSelectedProductIds] = useState([])

  // Filters state
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState('All')
  const [filterAvailability, setFilterAvailability] = useState('All')
  const [filterStockStatus, setFilterStockStatus] = useState('All')
  // Five facet selects plus sort crowded the toolbar; only sort stays out by
  // default. The chips row below still lists whatever is folded away.
  const [showMoreFilters, setShowMoreFilters] = useState(false)
  const [filterPublication, setFilterPublication] = useState('All')
  const [sortBy, setSortBy] = useState('featured')

  // Pagination — real rows only. The footer used to print a fixed
  // "Showing 1–10 of 195 items" while none of its page buttons had a handler.
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 10

  // Batch stock adjustment state
  const [batchActionType, setBatchActionType] = useState('add')
  const [batchQtyInput, setBatchQtyInput] = useState('')

  // Modals state
  const [showAddProductModal, setShowAddProductModal] = useState(false)
  const [newProdName, setNewProdName] = useState('')
  const [newProdDesc, setNewProdDesc] = useState('')
  const [newProdPhoto, setNewProdPhoto] = useState('')
  const [newProdCategory, setNewProdCategory] = useState('Shirts')
  const [newProdPrice, setNewProdPrice] = useState('')
  // FLOW-ADD_PROD-02/03: a product always needs at least one variation, and
  // each variation carries its own stock, optional markup and optional image.
  // The total stock shown on the list is the sum of these rows.
  //
  // `options` is the {axis: value} map of the combination this row stands for
  // ({"Color":"Cream","Size":"Medium"}) and is present for every row the
  // combination matrix generates; a row the admin typed by hand has none and
  // the backend derives its label from the variation name, exactly as before.
  const [newProdVariations, setNewProdVariations] = useState([
    { ...BLANK_VARIATION, name: 'Standard' },
  ])
  // The two ways of describing the same variation set. 'list' is one row per
  // variation typed out by hand; 'matrix' is the axes and their values once,
  // exploded into every combination.
  const [variationMode, setVariationMode] = useState('list')
  const [axes, setAxes] = useState([{ axis: 'Color', values: [] }, { axis: 'Size', values: [] }])
  const [isCreatingProduct, setIsCreatingProduct] = useState(false)

  /**
   * Keeps the combination rows in step with the axis definitions: a value that
   * was typed in gains its rows, a value that was taken out loses them, and a
   * row the admin already filled in (stock, markup, photo) is kept by its
   * combination key so re-ordering the values never empties the form.
   */
  useEffect(() => {
    if (variationMode !== 'matrix') return
    const combos = cartesian(axes)
    const keys = combos.map(optionKey)
    setNewProdVariations((rows) => {
      const kept = rows.filter((row) => row.optionsKey && keys.includes(row.optionsKey))
      const have = new Set(kept.map((row) => row.optionsKey))
      const fresh = combos
        .filter((options) => !have.has(optionKey(options)))
        .map((options) => ({
          optionsKey: optionKey(options),
          options,
          name: '',
          // REQ-ADD_PROD-03 asks for a stock quantity, so each combination
          // opens at zero rather than at an empty field that reads as "not yet
          // filled in" and then fails validation on a blank input.
          stock: '0',
          markup: '0',
          pic: '',
        }))
      const next = combos.map(
        (options) =>
          kept.find((row) => row.optionsKey === optionKey(options)) ||
          fresh.find((row) => row.optionsKey === optionKey(options))
      )
      const unchanged =
        next.length === rows.length && next.every((row, i) => row === rows[i])
      return unchanged ? rows : next
    })
  }, [axes, variationMode])

  // Edit / Delete product state (backend-driven)
  const [showEditProductModal, setShowEditProductModal] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editCategory, setEditCategory] = useState('Shirts')
  const [editPrice, setEditPrice] = useState('')
  const [editPhoto, setEditPhoto] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)

  // One combination at a time (FLOW-MANAGE_INV-01). The row the drawer's Edit
  // button opens, plus the fields of it the admin is changing.
  const [variantEditor, setVariantEditor] = useState(null)
  const [variantDraft, setVariantDraft] = useState({ name: '', stock: '', markup: '', pic: '' })

  // File inputs for real photo uploads (add + edit modals)
  const addPhotoRef = useRef(null)
  const editPhotoRef = useRef(null)
  const addVariationPhotoRef = useRef(null)
  const [addVariationPhotoIndex, setAddVariationPhotoIndex] = useState(null)
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)

  // REQ-ADD_PROD-07: one shared guard for every upload the form makes.
  const assertImageAcceptable = (file) => {
    if (!ACCEPTED_IMAGE_MIME.includes(file.type)) {
      window.alert('Product images must be PNG or JPEG files.')
      return false
    }
    if (file.size > MAX_IMAGE_BYTES) {
      window.alert('Product images must be 2 MB or smaller.')
      return false
    }
    return true
  }

  const uploadProductImage = async (file) => {
    if (!assertImageAcceptable(file)) return null
    setIsUploadingPhoto(true)
    try {
      return await uploadImage(file, 'product')
    } catch (err) {
      window.alert(err.message || 'Unable to upload the image.')
      return null
    } finally {
      setIsUploadingPhoto(false)
    }
  }

  // Product photo upload → backend storage, then keep the returned URL
  const handleAddPhotoChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const url = await uploadProductImage(file)
    if (url) setNewProdPhoto(url)
  }

  const handleEditPhotoChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const url = await uploadProductImage(file)
    if (url) setEditPhoto(url)
  }

  // A per-variation image, uploaded through the same endpoint and guard. The
  // same file input serves the add-product form and the combination editor, so
  // it lands wherever the upload was started.
  const handleVariationPhotoChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const url = await uploadProductImage(file)
    if (!url) return

    if (variantEditor?.pickingPhoto) {
      setVariantDraft((draft) => ({ ...draft, pic: url }))
      setVariantEditor((editor) => ({ ...editor, pickingPhoto: false }))
      return
    }

    if (addVariationPhotoIndex === null) return
    setNewProdVariations((rows) =>
      rows.map((row, i) => (i === addVariationPhotoIndex ? { ...row, pic: url } : row))
    )
    setAddVariationPhotoIndex(null)
  }

  // Toggle expand row
  const toggleRow = (id) => {
    setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  // Toggle variant selection
  const toggleVariantSelect = (vId) => {
    setSelectedVariantIds((prev) =>
      prev.includes(vId) ? prev.filter((id) => id !== vId) : [...prev, vId]
    )
  }

  // Stock stepper increment / decrement (calls backend).
  //
  // The stepper sits on a per-variation row, so the new value targets THAT
  // variation (prodvar_id). Sending the product total instead made the
  // backend move the whole delta onto the main variation, leaving every other
  // row's number unchanged on screen.
  const handleVariantStockChange = (prodId, varId, delta) => {
    const product = productsList.find((p) => p.id === prodId)
    if (!product) return

    const variant = (product.variants || []).find((v) => v.id === varId)
    const numericVarId = /^var-\d+$/.test(String(varId)) ? Number(String(varId).replace('var-', '')) : null
    if (variant && numericVarId !== null) {
      const next = Math.max(0, (Number(variant.stock) || 0) + delta)
      adjustStock(prodId, next, numericVarId)
      return
    }

    // Fallback for rows the mapper built without a real prodvar_id.
    const newTotal = Math.max(0, product.totalStock + delta)
    adjustStock(prodId, newTotal)
  }

  // Batch Apply stock change (calls backend)
  const handleApplyBatchStock = () => {
    const qty = parseInt(batchQtyInput, 10)
    if (isNaN(qty) || qty < 0) return

    // Group requested adjustments per product to avoid stale-overwrite issues
    const adjustments = new Map()
    selectedVariantIds.forEach((varId) => {
      const product = productsList.find((p) =>
        (p.variants || []).some((v) => v.id === varId)
      )
      if (!product || adjustments.has(product.id)) return
      const base = Number(product.totalStock) || 0
      const nextTotal =
        batchActionType === 'set'
          ? qty
          : batchActionType === 'subtract'
          ? base - qty
          : base + qty
      adjustments.set(product.id, Math.max(0, nextTotal))
    })

    adjustments.forEach((newTotal, prodId) => adjustStock(prodId, newTotal))
    setBatchQtyInput('')
  }

  // Chips are derived from the facet state instead of a hardcoded demo list
  // ("2026 Collection", "Pre-order"), so × on a chip really clears the filter
  // it names instead of just hiding itself.
  const activeTags = useMemo(() => {
    const tags = []
    if (filterCategory !== 'All') tags.push({ key: 'category', label: `Category: ${filterCategory}` })
    if (filterAvailability !== 'All') tags.push({ key: 'availability', label: `Availability: ${filterAvailability}` })
    if (filterStockStatus !== 'All') tags.push({ key: 'stock', label: `Stock: ${filterStockStatus}` })
    if (filterPublication !== 'All') tags.push({ key: 'publication', label: `Publication: ${filterPublication}` })
    return tags
  }, [filterCategory, filterAvailability, filterStockStatus, filterPublication])

  // FLOW-ADD_PROD-01: the dashboard's "Add product" action deep-links here.
  // `?new=1` opens the create form straight away instead of dropping the admin
  // on the list with nothing to do. `?search=` is what the reviews moderation
  // queue sends when it links to the product behind a review, so the list lands
  // on that product instead of ignoring the term.
  useEffect(() => {
    if (searchParams.get('new') === '1') setShowAddProductModal(true)
    const search = searchParams.get('search')
    if (search) setSearchQuery(search)
  }, [searchParams])

  const removeTag = (key) => {
    if (key === 'category') setFilterCategory('All')
    if (key === 'availability') setFilterAvailability('All')
    if (key === 'stock') setFilterStockStatus('All')
    if (key === 'publication') setFilterPublication('All')
    setPage(1)
  }
  const clearAllTags = () => {
    setFilterCategory('All')
    setFilterAvailability('All')
    setFilterStockStatus('All')
    setFilterPublication('All')
    setPage(1)
  }

  // Add Product Form submit (calls backend; keeps input on failure per REQ-IM-01)
  const handleCreateProduct = async (e) => {
    e.preventDefault()
    if (isCreatingProduct) return
    // FLOW-ADD_PROD-05 / REQ-ADD_PROD-08: invalid input is refused inline
    // instead of being silently coerced into a placeholder product.
    const price = parseFloat(newProdPrice)
    if (!newProdName.trim()) {
      window.alert('Product name is required.')
      return
    }
    if (!(price > 0)) {
      window.alert('Product price must be greater than zero.')
      return
    }
    const variations = newProdVariations
      .map((row) => ({
        name: String(row.name || '').trim(),
        // A blank stock is zero, not "invalid": the combination matrix starts
        // every row empty and REQ-ADD_PROD-03 only asks for a quantity, so
        // parseInt('') === NaN used to refuse the whole product with a message
        // about a field the admin never had to fill in.
        stock: row.stock === '' || row.stock === null || row.stock === undefined
          ? 0
          : parseInt(row.stock, 10),
        markup: row.markup === '' || row.markup === null || row.markup === undefined
          ? 0
          : parseFloat(row.markup),
        pic: row.pic || '',
        // The combination this row stands for; only the matrix editor fills it.
        options: row.options,
      }))
      .filter((row) => row.name !== '' || row.options || Number.isFinite(row.stock))
    if (variations.length === 0) {
      window.alert('A product needs at least one variation.')
      return
    }
    for (const [i, row] of variations.entries()) {
      // A combination names itself ("Cream / Medium"); a hand-typed row has to.
      if (!row.name && !row.options) {
        window.alert(`Variation ${i + 1} needs a name.`)
        return
      }
      if (!Number.isFinite(row.stock) || row.stock < 0) {
        window.alert(`Variation ${i + 1} needs a stock quantity of zero or more.`)
        return
      }
      if (Number.isFinite(row.markup) && row.markup < 0) {
        window.alert(`Variation ${i + 1} markup cannot be negative.`)
        return
      }
      // REQ-IM-02: the message names the axis and value, not "the option set".
      for (const [axis, value] of Object.entries(row.options || {})) {
        if (!String(axis || '').trim() || !String(value || '').trim()) {
          window.alert(`Variation ${i + 1} needs both a name and a value for every way it varies.`)
          return
        }
      }
    }

    setIsCreatingProduct(true)
    try {
      const result = await addProduct({
        name: newProdName.trim(),
        desc: newProdDesc,
        photo: newProdPhoto,
        category: newProdCategory,
        price,
        // The list's stock is derived from the variations server-side; the
        // aggregate is still sent so a legacy reader sees the same number.
        stock: variations.reduce((sum, row) => sum + (Number.isFinite(row.stock) ? row.stock : 0), 0),
        variations: variations.map((row) => ({
          name: row.name,
          stock: Number.isFinite(row.stock) ? row.stock : 0,
          markup: Number.isFinite(row.markup) ? row.markup : 0,
          pic: row.pic,
          ...(row.options && Object.keys(row.options).length > 0 ? { options: row.options } : {}),
        })),
      })
      if (!result.success) return
      setShowAddProductModal(false)
      setNewProdName('')
      setNewProdDesc('')
      setNewProdPhoto('')
      setNewProdPrice('')
      setNewProdVariations([{ ...BLANK_VARIATION, name: 'Standard' }])
      setVariationMode('list')
      setAxes([{ axis: 'Color', values: [] }, { axis: 'Size', values: [] }])
    } finally {
      setIsCreatingProduct(false)
    }
  }

  // Open Edit Product modal pre-filled with current values
  const openEditModal = (prod) => {
    setEditTarget(prod)
    setEditName(prod.name)
    setEditDesc(prod.description || '')
    setEditCategory(prod.categoryName || 'Shirts')
    setEditPrice(String(prod.price ?? ''))
    setEditPhoto(
      prod.image && (prod.image.startsWith('http') || prod.image.startsWith('/storage/'))
        ? prod.image
        : ''
    )
    setShowEditProductModal(true)
  }

  // Edit Product Form submit (calls backend; keeps input on failure per REQ-IM-01)
  //
  // The product-level fields only. A variation is edited one row at a time on
  // the product detail page (through the `variant` payload of the same
  // endpoint), and the bulk `variations` path reconciles a whole set - a
  // reconciliation that replaced every row would orphan the bag rows of
  // customers already holding those variations and detach their sales history.
  const handleUpdateProduct = async (e) => {
    e.preventDefault()
    if (!editTarget) return
    // FLOW-ADD_PROD-05: refuse non-positive input inline instead of coercing.
    const price = parseFloat(editPrice)
    if (!editName.trim()) {
      window.alert('Product name is required.')
      return
    }
    if (!(price > 0)) {
      window.alert('Product price must be greater than zero.')
      return
    }
    const result = await updateProduct(editTarget.id, {
      prod_name: editName.trim(),
      prod_desc: editDesc,
      prod_categ: editCategory,
      prod_price: price,
      ...(editPhoto ? { prod_images: [editPhoto] } : {}),
    })
    if (!result.success) return
    setShowEditProductModal(false)
    setEditTarget(null)
  }

  // Delete Product (calls backend soft-delete)
  const handleDeleteProduct = () => {
    if (!deleteTarget) return
    deleteProduct(deleteTarget.id)
    setDeleteTarget(null)
  }

  /**
   * FLOW-MANAGE_INV-01: edit the details of ONE combination of a product. The
   * combination itself (its axis values) is editable too: renaming the label
   * here only overrides how it is shown, while the axe values stay the identity
   * the backend de-duplicates on - so "Cream / Medium" can never be minted
   * twice for the same shirt.
   */
  const openVariantEditor = (prod, variant) => {
    setVariantEditor({ prodId: prod.prodId, variant })
    setVariantDraft({
      name: variant.name || '',
      stock: String(variant.stock ?? ''),
      markup: String(variant.markup ?? ''),
      pic: variant.pic || '',
    })
  }

  const handleVariantEditorSave = async () => {
    if (!variantEditor) return
    const stock = Number.parseInt(variantDraft.stock, 10)
    const markup = Number.parseFloat(variantDraft.markup)
    if (!Number.isFinite(stock) || stock < 0) {
      window.alert('Stock must be zero or more.')
      return
    }
    if (Number.isFinite(markup) && markup < 0) {
      window.alert('Markup cannot be negative.')
      return
    }
    const result = await updateVariant(variantEditor.prodId, variantEditor.variant.prodvarId, {
      prodvar_name: variantDraft.name,
      prodvar_stock: stock,
      prodvar_markup: Number.isFinite(markup) ? markup : 0,
      ...(variantDraft.pic !== variantEditor.variant.pic ? { prodvar_pic: variantDraft.pic } : {}),
    })
    if (result.success) setVariantEditor(null)
  }

  // Filtered + sorted list. Every facet select used to be decorative — only
  // `searchQuery` was read, so choosing "Category: Hoodies" or any sort order
  // left the table untouched (FLOW-MANAGE_INV-03/04).
  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    // The select offers the plural display name, the mapper stores the
    // singular category ('Hoodie', 'Cap', 'Lanyard').
    const CATEGORY_ALIASES = { Hoodies: 'Hoodie', Lanyards: 'Lanyard', Caps: 'Cap' }
    const wantedCategory = CATEGORY_ALIASES[filterCategory] || filterCategory

    const rows = productsList.filter((p) => {
      if (
        query &&
        !(
          p.name.toLowerCase().includes(query) ||
          p.sku.toLowerCase().includes(query) ||
          p.categoryName.toLowerCase().includes(query)
        )
      )
        return false
      if (filterCategory !== 'All' && p.categoryName !== wantedCategory) return false
      if (filterAvailability !== 'All' && p.availability !== filterAvailability) return false
      if (filterStockStatus !== 'All') {
        const stock = Number(p.totalStock) || 0
        if (filterStockStatus === 'Out of Stock' && stock !== 0) return false
        if (filterStockStatus === 'In Stock' && stock <= 0) return false
        // FLOW-MANAGE_INV-06 / REQ-MANAGE_INV-04: the threshold is the
        // configurable system setting the server alerts on, never a number
        // hardcoded in the browser.
        if (filterStockStatus === 'Low Stock' && !(stock > 0 && stock <= p.lowStockThreshold)) return false
      }
      if (filterPublication !== 'All' && !!p.published !== (filterPublication === 'Published')) return false
      return true
    })

    // FLOW-MANAGE_INV-04: name, price, orders, stock and creation date.
    // 'featured' keeps the order the backend returned.
    if (sortBy === 'price-asc') rows.sort((a, b) => a.price - b.price)
    else if (sortBy === 'price-desc') rows.sort((a, b) => b.price - a.price)
    else if (sortBy === 'orders-desc') rows.sort((a, b) => (b.orders || 0) - (a.orders || 0))
    else if (sortBy === 'name-asc') rows.sort((a, b) => a.name.localeCompare(b.name))
    else if (sortBy === 'stock-asc') rows.sort((a, b) => (a.totalStock || 0) - (b.totalStock || 0))
    else if (sortBy === 'created-desc') rows.sort((a, b) => {
      const left = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const right = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return right - left
    })

    return rows
  }, [
    productsList,
    searchQuery,
    filterCategory,
    filterAvailability,
    filterStockStatus,
    filterPublication,
    sortBy,
  ])

  // FLOW-MANAGE_INV-06 — the three counters below were hardcoded ("12", "3",
  // "45") no matter what the catalog held. Each row's own threshold is used so
  // the badge agrees with the alert the backend raises for the same row.
  const inventoryStats = useMemo(() => {
    const stats = { low: 0, out: 0, preorder: 0 }
    productsList.forEach((p) => {
      const stock = Number(p.totalStock) || 0
      if (stock === 0) stats.out += 1
      else if (stock <= p.lowStockThreshold) stats.low += 1
      if (p.preorder) stats.preorder += 1
    })
    return stats
  }, [productsList])

  // Pagination over the filtered list, clamped so a shrinking result set can
  // never leave the table on an empty page.
  const pageCount = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pagedProducts = filteredProducts.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const pageNumbers = Array.from({ length: pageCount }, (_, i) => i + 1).slice(0, 5)
  // Select-all covers the rows on screen, not the unfiltered catalog.
  const visibleProductIds = pagedProducts.map((p) => p.id)

  return (
    <AdminLayout>
      <div className="space-y-4 animate-fade-in pb-10">
        {/* Compacted Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
              Products &amp; Inventory
            </h1>
            <p className="text-xs text-slate-500 font-normal mt-0.5">
              Manage products, variants, collections, availability, and stock.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* REQ-ADD_PROD-04: categories are a predefined, system-wide set, so
                there is nothing for an admin to add here. The button used to
                open a modal that closed without calling any endpoint. */}
            <button
              type="button"
              onClick={() => setShowAddProductModal(true)}
              className="h-8 px-3 rounded-md bg-brand-orange hover:bg-brand-orange-dark text-white font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>+ Add Product</span>
            </button>
          </div>
        </div>

        {/* 4 Metric Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Total Products */}
          <div className="bg-white rounded-lg p-3 border border-slate-200 flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-wider uppercase text-slate-400">TOTAL PRODUCTS</p>
              <h3 className="text-xl font-bold text-slate-900 mt-0.5">{filteredProducts.length}</h3>
            </div>
          </div>

          {/* Low Stock */}
          <div className="bg-white rounded-lg p-3 border border-slate-200 flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-500 shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-wider uppercase text-slate-400">LOW STOCK</p>
              <h3 className="text-xl font-bold text-slate-900 mt-0.5">{inventoryStats.low}</h3>
            </div>
          </div>

          {/* Out of Stock */}
          <div className="bg-white rounded-lg p-3 border border-slate-200 flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-500 shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-wider uppercase text-slate-400">OUT OF STOCK</p>
              <h3 className="text-xl font-bold text-slate-900 mt-0.5">{inventoryStats.out}</h3>
            </div>
          </div>

          {/* Pre-Orders */}
          <div className="bg-white rounded-lg p-3 border border-slate-200 flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-orange-50 border border-orange-100 flex items-center justify-center text-brand-orange shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-wider uppercase text-slate-400">PRE-ORDERS</p>
              <h3 className="text-xl font-bold text-slate-900 mt-0.5">{inventoryStats.preorder}</h3>
            </div>
          </div>
        </div>

        {/* Filter and Search Bar Toolbar */}
        <div className="bg-white rounded-lg p-3 border border-slate-200 space-y-2.5">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2.5">
            {/* Search Input */}
            <div className="relative flex-1">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="search"
                placeholder="Search products, SKU, or variants..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-8 pl-8 pr-3 rounded-md bg-white border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-0 focus:border-slate-300"
              />
            </div>

            {/* Dropdown Filters */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
              <button
                type="button"
                onClick={() => setShowMoreFilters((open) => !open)}
                aria-expanded={showMoreFilters}
                className={`h-8 px-2.5 rounded-md border text-xs font-semibold whitespace-nowrap cursor-pointer focus:outline-none ${
                  showMoreFilters ||
                  [filterCategory, filterAvailability, filterStockStatus, filterPublication].some(
                    (v) => v !== 'All'
                  )
                    ? 'bg-brand-orange text-white border-brand-orange'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                Filters
                {(() => {
                  const n = [filterCategory, filterAvailability, filterStockStatus, filterPublication].filter(
                    (v) => v !== 'All'
                  ).length
                  return n > 0 ? ` · ${n}` : ''
                })()}
              </button>

              {showMoreFilters && (
              <>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="h-8 px-2.5 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-0 focus:border-slate-300 cursor-pointer"
              >
                <option value="All">Category ▾</option>
                {PRODUCT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>

              <select
                value={filterAvailability}
                onChange={(e) => setFilterAvailability(e.target.value)}
                className="h-8 px-2.5 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-0 focus:border-slate-300 cursor-pointer"
              >
                <option value="All">Availability ▾</option>
                <option value="Regular">Regular</option>
                <option value="Pre-order">Pre-order</option>
              </select>

              <select
                value={filterStockStatus}
                onChange={(e) => setFilterStockStatus(e.target.value)}
                className="h-8 px-2.5 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-0 focus:border-slate-300 cursor-pointer"
              >
                <option value="All">Stock Status ▾</option>
                <option value="In Stock">In Stock</option>
                <option value="Low Stock">Low Stock</option>
                <option value="Out of Stock">Out of Stock</option>
              </select>

              <select
                value={filterPublication}
                onChange={(e) => setFilterPublication(e.target.value)}
                className="h-8 px-2.5 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-0 focus:border-slate-300 cursor-pointer"
              >
                <option value="All">Publication ▾</option>
                <option value="Published">Published</option>
                <option value="Draft">Draft</option>
              </select>
              </>
              )}

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="h-8 px-2.5 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-0 focus:border-slate-300 cursor-pointer"
              >
                <option value="featured">Sort by ▾</option>
                <option value="name-asc">Name: A to Z</option>
                <option value="created-desc">Date Created: Newest</option>
                <option value="stock-asc">Stock: Low to High</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
                <option value="orders-desc">Most Orders</option>
              </select>
            </div>
          </div>

          {/* Active Filter Chips Row */}
          {activeTags.length > 0 && (
            <div className="flex items-center gap-1.5 pt-2 border-t border-slate-100 flex-wrap">
              {activeTags.map((tag) => (
                <span
                  key={tag.key}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-medium border border-slate-200"
                >
                  <span>{tag.label}</span>
                  <button
                    type="button"
                    onClick={() => removeTag(tag.key)}
                    className="text-slate-400 hover:text-slate-700 cursor-pointer text-sm font-bold"
                  >
                    ×
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={clearAllTags}
                className="text-xs font-semibold text-brand-orange hover:underline cursor-pointer ml-1"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* Table Container */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-2.5 px-3 w-10">
                    <input
                      type="checkbox"
                      className="rounded text-brand-orange focus:ring-0"
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedProductIds((prev) => Array.from(new Set([...prev, ...visibleProductIds])))
                        } else {
                          setSelectedProductIds((prev) => prev.filter((id) => !visibleProductIds.includes(id)))
                        }
                      }}
                      checked={
                        visibleProductIds.length > 0 &&
                        visibleProductIds.every((id) => selectedProductIds.includes(id))
                      }
                    />
                  </th>
                  <th className="p-4">PRODUCT</th>
                  <th className="p-4">CATEGORY</th>
                  <th className="p-4">AVAILABILITY</th>
                  <th className="p-4">STOCK (TOTAL UNITS)</th>
                  <th className="p-4">PRICE</th>
                  <th className="p-4">ORDERS</th>
                  <th className="p-4">STATUS</th>
                  <th className="p-4 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pagedProducts.map((prod) => {
                  const isExpanded = !!expandedRows[prod.id]
                  const hasVariants = prod.variants && prod.variants.length > 0

                  return (
                    <React.Fragment key={prod.id}>
                      {/* Product Main Row */}
                      <tr className="hover:bg-gray-50/70 transition-colors group">
                        <td className="p-4">
                          <input
                            type="checkbox"
                            checked={selectedProductIds.includes(prod.id)}
                            onChange={() => {
                              setSelectedProductIds((prev) =>
                                prev.includes(prod.id)
                                  ? prev.filter((id) => id !== prod.id)
                                  : [...prev, prod.id]
                              )
                            }}
                            className="rounded text-brand-orange focus:ring-0"
                          />
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            {/* Product Thumbnail */}
                            <div className="w-11 h-11 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center p-1 shrink-0">
                              <img
                                src={getImageUrl(prod.image)}
                                alt={prod.name}
                                className="w-full h-full object-contain"
                              />
                            </div>

                            {/* Info */}
                            <div>
                              <h4 className="font-extrabold text-gray-900 text-xs leading-tight">
                                {prod.name}
                              </h4>
                              <p className="text-[10px] text-gray-400 font-semibold mt-0.5">
                                SKU: {prod.sku}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Category Column */}
                        <td className="p-4">
                          <p className="font-bold text-gray-900 text-xs">
                            {/* FLOW-MANAGE_INV-05: clicking a product opens its
                                detail page with every variation, price, stock
                                level and metric. */}
                            <Link
                              to={`/admin/inventory/${prod.prodId ?? prod.id}`}
                              className="hover:text-brand-orange hover:underline"
                            >
                              {prod.categoryName}
                            </Link>
                          </p>
                          <p className="text-[10px] text-gray-400">{prod.sku}</p>
                        </td>

                        {/* Availability Column - Rectangular Badge */}
                        <td className="p-4">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-semibold ${
                              prod.availability === 'Pre-order'
                                ? 'bg-orange-50 text-brand-orange border border-orange-200/60'
                                : 'bg-blue-50 text-blue-700 border border-blue-200/60'
                            }`}
                          >
                            {prod.availability}
                          </span>
                        </td>

                        {/* Stock (Total Units) */}
                        <td className="p-4">
                          {prod.availability === 'Pre-order' ? (
                            <div className="flex items-center gap-1.5 text-blue-600 font-bold text-xs">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                              </svg>
                              <div>
                                <span>{prod.totalStock} units total</span>
                                <span className="block text-[10px] text-gray-400 font-normal">{prod.preorderTarget}</span>
                              </div>
                            </div>
                          ) : prod.lowStock ? (
                            <div className="flex items-center gap-1.5 text-amber-600 font-bold text-xs">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                              </svg>
                              <span>{prod.totalStock} units total</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-emerald-600 font-bold text-xs">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              <span>{prod.totalStock} units total</span>
                            </div>
                          )}
                        </td>

                        {/* Price */}
                        <td className="p-4 font-extrabold text-gray-900 text-xs">
                          ₱{prod.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>

                        {/* Orders */}
                        <td className="p-4 font-semibold text-gray-600 text-xs">
                          {prod.orders}
                        </td>

                        {/* Status */}
                        <td className="p-4">
                          <span
                            className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                              prod.disabled ? 'text-amber-600' : 'text-emerald-600'
                            }`}
                          >
                            <span
                              className={`w-2 h-2 rounded-full ${
                                prod.disabled ? 'bg-amber-500' : 'bg-emerald-500'
                              }`}
                            />
                            <span>{prod.status}</span>
                          </span>
                        </td>

                        {/* Actions - Rectangular Buttons */}
                        <td className="p-4 text-right">
                          <div className="inline-flex items-center gap-2">
                            {hasVariants && (
                              <button
                                type="button"
                                onClick={() => toggleRow(prod.id)}
                                aria-expanded={isExpanded}
                                title={isExpanded ? 'Hide variants' : 'Show variants'}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                                  isExpanded
                                    ? 'bg-orange-100 text-orange-800'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                              >
                                <span>
                                  {prod.variants.length} {prod.variants.length === 1 ? 'Variant' : 'Variants'}
                                </span>
                                <svg
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                >
                                  <polyline points="6 9 12 15 18 9" />
                                </svg>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => (prod.disabled ? sellProduct(prod.id) : unlistProduct(prod.id))}
                              title={prod.disabled ? 'Sell (relist in catalog)' : 'Unlist from customer catalog'}
                              className="px-3 py-1 rounded-md border border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 transition-colors text-xs cursor-pointer bg-white"
                            >
                              {prod.disabled ? 'Sell' : 'Unlist'}
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditModal(prod)}
                              className="px-3 py-1 rounded-md border border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 transition-colors text-xs cursor-pointer bg-white"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(prod)}
                              title="Delete product"
                              className="p-1 rounded-md border border-gray-200 bg-white text-gray-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                            >
                              ···
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Nested Variants drawer */}
                      {isExpanded && hasVariants && (
                        <tr className="bg-gray-50/40">
                          <td colSpan={9} className="p-0 border-b border-gray-200">
                            <div className="my-3 ml-10 mr-4 pl-4 border-l-2 border-orange-400 space-y-3">
                              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                                <table className="w-full text-left text-xs">
                                  <thead>
                                    <tr className="border-b border-gray-200 bg-gray-50/80 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                      <th className="px-3 py-2 w-8" />
                                      <th className="px-3 py-2">VARIANT</th>
                                      <th className="px-3 py-2">SKU</th>
                                      <th className="px-3 py-2">STOCK</th>
                                      <th className="px-3 py-2">PRICE</th>
                                      <th className="px-3 py-2">STATUS</th>
                                      <th className="px-3 py-2">LAST UPDATED</th>
                                      <th className="px-3 py-2 text-right">ACTIONS</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {prod.variants.map((variant) => {
                                      const isVarSelected = selectedVariantIds.includes(variant.id)
                                      return (
                                        <tr
                                          key={variant.id}
                                          className={`hover:bg-orange-50/20 transition-colors ${
                                            isVarSelected ? 'bg-orange-50/30' : ''
                                          }`}
                                        >
                                          <td className="px-3 py-2">
                                            <input
                                              type="checkbox"
                                              checked={isVarSelected}
                                              onChange={() => toggleVariantSelect(variant.id)}
                                              className="rounded text-brand-orange focus:ring-0"
                                            />
                                          </td>
                                          <td className="px-3 py-2">
                                            <div className="flex items-center gap-2">
                                              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0" />
                                              <span className="font-bold text-gray-800 text-xs">
                                                {variant.label || variant.name}
                                              </span>
                                              {variant.options
                                                && Object.keys(variant.options).length > 0 && (
                                                <span className="hidden lg:inline text-[10px] font-semibold text-slate-400">
                                                  {Object.entries(variant.options)
                                                    .map(([axis, value]) => `${axis}: ${value}`)
                                                    .join(' · ')}
                                                </span>
                                              )}
                                            </div>
                                          </td>
                                          <td className="px-3 py-2 text-gray-500 font-medium text-xs">
                                            {variant.sku}
                                          </td>
                                          <td className="px-3 py-2">
                                            {/* Stepper [- count +] - Rectangular */}
                                            <div className="inline-flex items-center border border-gray-200 rounded-md bg-white overflow-hidden shadow-2xs">
                                              <button
                                                type="button"
                                                onClick={() => handleVariantStockChange(prod.id, variant.id, -1)}
                                                className="px-2.5 py-1 text-gray-500 hover:bg-gray-100 font-bold text-xs cursor-pointer"
                                              >
                                                −
                                              </button>
                                              <span className="px-3 py-1 font-bold text-gray-900 text-xs min-w-[28px] text-center">
                                                {variant.stock}
                                              </span>
                                              <button
                                                type="button"
                                                onClick={() => handleVariantStockChange(prod.id, variant.id, 1)}
                                                className="px-2.5 py-1 text-gray-500 hover:bg-gray-100 font-bold text-xs cursor-pointer"
                                              >
                                                +
                                              </button>
                                            </div>
                                          </td>
                                          <td className="px-3 py-2 font-extrabold text-gray-900 text-xs">
                                            ₱{variant.price.toFixed(2)}
                                          </td>
                                          {/* Status - Rectangular */}
                                          <td className="px-3 py-2">
                                            <span
                                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                                                variant.stock === 0
                                                  ? 'text-rose-600 bg-rose-50 border border-rose-100'
                                                  : variant.lowStock
                                                  ? 'text-amber-600 bg-amber-50 border border-amber-100'
                                                  : 'text-emerald-600 bg-emerald-50 border border-emerald-100'
                                              }`}
                                            >
                                              <span
                                                className={`w-1.5 h-1.5 rounded-full ${
                                                  variant.stock === 0
                                                    ? 'bg-rose-500'
                                                    : variant.lowStock
                                                    ? 'bg-amber-500'
                                                    : 'bg-emerald-500'
                                                }`}
                                              />
                                              <span>{variant.status}</span>
                                            </span>
                                          </td>
                                          <td className="px-3 py-2 text-[11px] text-gray-400 font-medium">
                                            {variant.lastUpdated}
                                          </td>
                                          <td className="px-3 py-2 text-right">
                                            <div className="inline-flex items-center gap-1">
                                              <button
                                                type="button"
                                                title={
                                                  variant.available
                                                    ? 'Disable this combination'
                                                    : 'Enable this combination'
                                                }
                                                onClick={() =>
                                                  updateVariant(prod.prodId, variant.prodvarId, {
                                                    prodvar_disabled: !variant.available,
                                                  })
                                                }
                                                className="px-2 py-1 rounded-md border border-gray-200 bg-white text-[11px] font-semibold text-gray-600 hover:bg-gray-50 cursor-pointer"
                                              >
                                                {variant.available ? 'Disable' : 'Enable'}
                                              </button>
                                              <button
                                                type="button"
                                                title="Edit this combination"
                                                onClick={() => openVariantEditor(prod, variant)}
                                                className="px-2 py-1 rounded-md border border-gray-200 bg-white text-[11px] font-semibold text-gray-600 hover:bg-gray-50 cursor-pointer"
                                              >
                                                Edit
                                              </button>
                                              <button
                                                type="button"
                                                title="Remove this combination"
                                                disabled={prod.variants.filter((v) => v.available).length <= 1}
                                                onClick={() => {
                                                  if (!window.confirm(
                                                    `Remove "${variant.label || variant.name}" from ${prod.name}?`
                                                  )) return
                                                  removeVariant(prod.prodId, variant.prodvarId)
                                                }}
                                                className="p-1 rounded-md border border-gray-200 bg-white text-gray-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                              >
                                                ×
                                              </button>
                                            </div>
                                          </td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>

                                {/* Batch Action Bar for variants (Photo 3) - Rectangular Elements */}
                                {selectedVariantIds.length > 0 && (
                                  <div className="p-3 bg-gray-50/90 border-t border-gray-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                                    <div className="flex items-center gap-3">
                                      <span className="font-bold text-gray-800">
                                        {selectedVariantIds.length} variants selected
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => setSelectedVariantIds([])}
                                        className="font-bold text-brand-orange hover:underline cursor-pointer"
                                      >
                                        Clear selection
                                      </button>
                                    </div>

                                    <div className="flex items-center gap-2.5">
                                      <span className="font-bold text-gray-700 flex items-center gap-1">
                                        <span>Batch Adjust Stock</span>
                                        <span className="text-gray-400 font-normal">ⓘ</span>
                                      </span>

                                      <select
                                        value={batchActionType}
                                        onChange={(e) => setBatchActionType(e.target.value)}
                                        className="h-9 px-2.5 rounded-md border border-gray-200 bg-white text-xs font-medium text-gray-700 focus:outline-none focus:ring-0 focus:border-gray-300"
                                      >
                                        <option value="add">Add Stock (+)</option>
                                        <option value="subtract">Reduce Stock (-)</option>
                                        <option value="set">Set Stock (=)</option>
                                      </select>

                                      <input
                                        type="number"
                                        placeholder="e.g. 10"
                                        value={batchQtyInput}
                                        onChange={(e) => setBatchQtyInput(e.target.value)}
                                        className="w-24 h-9 px-3 rounded-md border border-gray-200 bg-white text-xs placeholder-gray-400 focus:outline-none focus:ring-0 focus:border-gray-300"
                                      />

                                      <span className="text-gray-500 font-medium">Apply to:</span>
                                      <select
                                        className="h-9 px-2.5 rounded-md border border-gray-200 bg-white text-xs font-medium text-gray-700 focus:outline-none focus:ring-0 focus:border-gray-300"
                                      >
                                        <option>Selected ({selectedVariantIds.length})</option>
                                      </select>

                                      <button
                                        type="button"
                                        onClick={handleApplyBatchStock}
                                        className="h-9 px-4 bg-brand-orange hover:bg-brand-orange-dark text-white font-semibold rounded-md text-xs transition-colors shadow-2xs cursor-pointer"
                                      >
                                        Apply
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer — real rows and real handlers (the old footer
              printed a fixed "1–10 of 195" and none of its buttons did
              anything) */}
          <div className="p-4 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <span className="text-gray-500 font-medium">
              {filteredProducts.length === 0
                ? 'No products to show'
                : `Showing ${(safePage - 1) * PAGE_SIZE + 1}\u2013${Math.min(safePage * PAGE_SIZE, filteredProducts.length)} of ${filteredProducts.length} items`}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage(safePage - 1)}
                className="w-8 h-8 rounded-md border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer disabled:cursor-default"
              >
                ‹
              </button>
              {pageNumbers.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPage(n)}
                  className={`w-8 h-8 rounded-md flex items-center justify-center cursor-pointer ${
                    n === safePage
                      ? 'bg-brand-orange text-white font-bold shadow-2xs'
                      : 'border border-gray-200 text-gray-700 hover:bg-gray-100 font-semibold'
                  }`}
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                disabled={safePage >= pageCount}
                onClick={() => setPage(safePage + 1)}
                className="w-8 h-8 rounded-md border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer disabled:cursor-default"
              >
                ›
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Add Product Modal */}
      {showAddProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in">
          {/*
            The panel - not the page - is the scroll container: it is capped at
            92vh and scrolls its own content. Before, the form had no cap and no
            overflow, so on any screen shorter than the form the bottom was simply
            unreachable (no scrollbar anywhere) and the admin could not scroll back
            up to the fields already filled in.
          */}
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-product-title"
            className="w-full max-w-2xl bg-white rounded-xl border border-slate-200 shadow-2xl max-h-[92vh] flex flex-col overflow-hidden animate-scale-in"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 shrink-0">
              <div className="min-w-0">
                <h3 id="add-product-title" className="text-sm font-bold text-slate-900">Add New Product</h3>
                <p className="text-[11px] text-slate-400 font-normal mt-0.5">
                  Every variation needs a name and a stock count. Photos are optional.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close add product"
                onClick={() => setShowAddProductModal(false)}
                className="w-7 h-7 shrink-0 rounded-md bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 cursor-pointer"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form
              onSubmit={handleCreateProduct}
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain text-xs"
            >
              <div className="px-4 py-3.5 space-y-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Product Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. BU Varsity Jacket"
                  value={newProdName}
                  onChange={(e) => setNewProdName(e.target.value)}
                  className="w-full h-8 px-2.5 rounded-md border border-slate-200 text-xs focus:ring-1 focus:ring-brand-orange"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Description</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Material, fit, care instructions..."
                  value={newProdDesc}
                  onChange={(e) => setNewProdDesc(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-md border border-slate-200 text-xs focus:ring-1 focus:ring-brand-orange resize-none"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Product Photo</label>
                <button
                  type="button"
                  onClick={() => addPhotoRef.current?.click()}
                  className="w-full h-10 flex items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 text-xs font-semibold text-slate-600 hover:border-brand-orange hover:text-brand-orange bg-slate-50 cursor-pointer"
                >
                  {isUploadingPhoto ? 'Uploading…' : newProdPhoto ? 'Replace Photo' : 'Upload Photo'}
                </button>
                <input
                  ref={addPhotoRef}
                  type="file"
                  accept={ACCEPTED_IMAGE_TYPES}
                  className="hidden"
                  onChange={handleAddPhotoChange}
                />
                {newProdPhoto && (
                  <img
                    src={getImageUrl(newProdPhoto)}
                    alt="Product preview"
                    className="mt-2 h-20 w-20 rounded-md border border-slate-200 object-contain"
                  />
                )}
              </div>
              {/* Base price and category sit side by side: the panel is wide
                  enough now, and a single column of full-width selects made the
                  form look empty. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Category</label>
                  <select
                    value={newProdCategory}
                    onChange={(e) => setNewProdCategory(e.target.value)}
                    className="w-full h-8 px-2 rounded-md border border-slate-200 text-xs bg-white focus:ring-1 focus:ring-brand-orange"
                  >
                    {PRODUCT_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Base Price (₱)</label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    placeholder="e.g. 450"
                    value={newProdPrice}
                    onChange={(e) => setNewProdPrice(e.target.value)}
                    className="w-full h-8 px-2.5 rounded-md border border-slate-200 text-xs focus:ring-1 focus:ring-brand-orange"
                  />
                </div>
              </div>

              {/* FLOW-ADD_PROD-02/03: at least one variation, each with its own
                  name, stock quantity, optional markup and optional image. */}
              <div className="rounded-md border border-slate-200 bg-slate-50/60 p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="font-semibold text-slate-700">Variations</label>
                  <div className="flex items-center gap-1">
                    {variationMode === 'list' && (
                      <button
                        type="button"
                        onClick={() =>
                          setNewProdVariations((rows) => [...rows, { ...BLANK_VARIATION }])
                        }
                        className="h-6 px-2 rounded-md border border-slate-200 bg-white text-[11px] font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                      >
                        + Add variation
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (variationMode === 'matrix') {
                          setVariationMode('list')
                          return
                        }
                        const dirty = newProdVariations.some(
                          (row) => row.name || row.stock || row.markup || row.pic
                        )
                        if (dirty && !window.confirm(
                          'Switch to the combination matrix? The variations typed out by hand will be replaced by the combinations of the axes below.'
                        )) return
                        setVariationMode('matrix')
                      }}
                      className="h-6 px-2 rounded-md border border-slate-200 bg-white text-[11px] font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                    >
                      {variationMode === 'matrix' ? 'Type them out' : 'Use axes'}
                    </button>
                  </div>
                </div>

                {variationMode === 'matrix' && (
                  <div className="rounded-md border border-slate-200 bg-white p-2 space-y-2">
                    <p className="text-[11px] text-slate-500">
                      List the ways this product can vary and the values each one
                      takes. Every combination becomes its own variation with its
                      own stock — color&nbsp;×&nbsp;size, or color&nbsp;×&nbsp;material.
                    </p>
                    {axes.map((entry, index) => (
                      <div key={`axis-${index}`} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder={index === 0 ? 'Color' : index === 1 ? 'Size' : 'Axis name'}
                            value={entry.axis}
                            onChange={(e) =>
                              setAxes((rows) =>
                                rows.map((r, i) => (i === index ? { ...r, axis: e.target.value } : r))
                              )
                            }
                            className="w-28 h-7 px-2 rounded-md border border-slate-200 text-xs focus:ring-1 focus:ring-brand-orange"
                          />
                          <div className="flex-1">
                            <label className="text-[11px] text-slate-500 block mb-0.5">
                              Values (comma-separated)
                            </label>
                            <input
                              type="text"
                              placeholder="Cream, Black"
                              value={(entry.values || []).join(', ')}
                              onChange={(e) =>
                                setAxes((rows) =>
                                  rows.map((r, i) =>
                                    i === index
                                      ? {
                                          ...r,
                                          values: e.target.value
                                            .split(',')
                                            .map((v) => v.trim())
                                            .filter(Boolean),
                                        }
                                      : r
                                  )
                                )
                              }
                              className="w-full h-7 px-2 rounded-md border border-slate-200 text-xs focus:ring-1 focus:ring-brand-orange"
                            />
                          </div>
                          {axes.length > 1 && (
                            <button
                              type="button"
                              aria-label={`Remove axis ${index + 1}`}
                              onClick={() => setAxes((rows) => rows.filter((_, i) => i !== index))}
                              className="h-7 w-7 shrink-0 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 cursor-pointer"
                            >
                              ×
                            </button>
                          )}
                        </div>
                        {(entry.values || []).length > 0 && (
                          <div className="flex flex-wrap gap-1 pl-28">
                            {(entry.values || []).map((value) => (
                              <span
                                key={`${entry.axis}-${value}`}
                                className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-semibold text-slate-600"
                              >
                                {value}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {axes.length < MAX_OPTION_AXES && (
                      <button
                        type="button"
                        onClick={() => setAxes((rows) => [...rows, { axis: '', values: [] }])}
                        className="h-6 px-2 rounded-md border border-dashed border-slate-300 bg-white text-[11px] font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                      >
                        + Add another way to vary
                      </button>
                    )}
                  </div>
                )}

                {newProdVariations.map((row, index) => (
                  <div key={`variation-${row.optionsKey || index}`} className="rounded-md border border-slate-200 bg-white p-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder={
                          row.options
                            ? `${combinationLabel(row.options)} (leave blank to use this)`
                            : 'Variation name (e.g. Medium)'
                        }
                        value={row.name}
                        onChange={(e) =>
                          setNewProdVariations((rows) =>
                            rows.map((r, i) => (i === index ? { ...r, name: e.target.value } : r))
                          )
                        }
                        className="flex-1 h-7 px-2 rounded-md border border-slate-200 text-xs focus:ring-1 focus:ring-brand-orange"
                      />
                      {row.options && (
                        <span className="hidden sm:inline text-[10px] font-semibold text-slate-400 shrink-0">
                          {combinationLabel(row.options)}
                        </span>
                      )}
                      {variationMode === 'list' && newProdVariations.length > 1 && (
                        <button
                          type="button"
                          aria-label={`Remove variation ${index + 1}`}
                          onClick={() =>
                            setNewProdVariations((rows) => rows.filter((_, i) => i !== index))
                          }
                          className="h-7 w-7 shrink-0 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 cursor-pointer"
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[11px] text-slate-500 block mb-0.5">Stock</label>
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={row.stock}
                          onChange={(e) =>
                            setNewProdVariations((rows) =>
                              rows.map((r, i) => (i === index ? { ...r, stock: e.target.value } : r))
                            )
                          }
                          className="w-full h-7 px-2 rounded-md border border-slate-200 text-xs focus:ring-1 focus:ring-brand-orange"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-500 block mb-0.5">Markup (₱)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0"
                          value={row.markup}
                          onChange={(e) =>
                            setNewProdVariations((rows) =>
                              rows.map((r, i) => (i === index ? { ...r, markup: e.target.value } : r))
                            )
                          }
                          className="w-full h-7 px-2 rounded-md border border-slate-200 text-xs focus:ring-1 focus:ring-brand-orange"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-500 block mb-0.5">Image (optional)</label>
                        <button
                          type="button"
                          onClick={() => {
                            setAddVariationPhotoIndex(index)
                            addVariationPhotoRef.current?.click()
                          }}
                          className="w-full h-7 rounded-md border border-slate-200 bg-white text-[11px] font-semibold text-slate-600 hover:border-brand-orange hover:text-brand-orange cursor-pointer"
                        >
                          {row.pic ? 'Replace' : 'Upload'}
                        </button>
                      </div>
                    </div>
                    {row.pic && (
                      <div className="flex items-center gap-2">
                        <img
                          src={getImageUrl(row.pic)}
                          alt={`Variation ${index + 1} preview`}
                          className="h-10 w-10 rounded-md border border-slate-200 object-contain"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setNewProdVariations((rows) =>
                              rows.map((r, i) => (i === index ? { ...r, pic: '' } : r))
                            )
                          }
                          className="text-[11px] font-semibold text-slate-500 hover:text-rose-600 cursor-pointer"
                        >
                          Remove image
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                <input
                  ref={addVariationPhotoRef}
                  type="file"
                  accept={ACCEPTED_IMAGE_TYPES}
                  className="hidden"
                  onChange={handleVariationPhotoChange}
                />
              </div>

              </div>
              {/* Pinned to the bottom of the scroll area so "Create Product" is
                  always reachable, however long the variation list gets. */}
              <div className="sticky bottom-0 bg-white border-t border-slate-200 px-4 py-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddProductModal(false)}
                  className="h-8 px-3 rounded-md border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingProduct}
                  className="h-8 px-3 rounded-md bg-brand-orange hover:bg-brand-orange-dark text-white font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreatingProduct ? 'Creating…' : 'Create Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FLOW-MANAGE_INV-05 / REQ-IM-01: edit the details of a product that is
          already in the inventory. The variations themselves are edited on the
          product detail page, one combination at a time - the bulk replace path
          would retire every prodvar row and orphan the bags holding them. */}
      {showEditProductModal && editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-bold text-slate-900">Edit Product</h2>
              <button
                type="button"
                aria-label="Close edit product"
                onClick={() => {
                  setShowEditProductModal(false)
                  setEditTarget(null)
                }}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleUpdateProduct} className="space-y-2.5 text-xs px-4 py-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Product Name</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full h-8 px-2.5 rounded-md border border-slate-200 focus:ring-1 focus:ring-brand-orange"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Description</label>
                <textarea
                  rows={3}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 focus:ring-1 focus:ring-brand-orange"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Category</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full h-8 px-2 rounded-md border border-slate-200 bg-white focus:ring-1 focus:ring-brand-orange cursor-pointer"
                  >
                    {PRODUCT_CATEGORIES.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Base Price (₱)</label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    className="w-full h-8 px-2.5 rounded-md border border-slate-200 focus:ring-1 focus:ring-brand-orange"
                  />
                </div>
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Product Photo</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="/uploads/product/... or data URL"
                    value={editPhoto}
                    onChange={(e) => setEditPhoto(e.target.value)}
                    className="flex-1 h-8 px-2.5 rounded-md border border-slate-200 focus:ring-1 focus:ring-brand-orange"
                  />
                  <button
                    type="button"
                    onClick={() => editPhotoRef.current?.click()}
                    className="h-8 px-2.5 rounded-md border border-slate-200 bg-white text-[11px] font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Upload
                  </button>
                  <input
                    ref={editPhotoRef}
                    type="file"
                    accept={ACCEPTED_IMAGE_TYPES}
                    className="hidden"
                    onChange={handleEditPhotoChange}
                  />
                </div>
                {editPhoto && (
                  <img
                    src={getImageUrl(editPhoto)}
                    alt="Product preview"
                    className="mt-2 h-16 w-16 rounded-md border border-slate-200 object-contain"
                  />
                )}
              </div>
              {/* REQ-IM-01: the input that was refused is never emptied, so the
                  message keeps the context the admin needs to fix it. */}
              <div className="flex items-center justify-between gap-2 rounded-md bg-slate-50 border border-slate-200 px-2.5 py-2">
                <p className="text-[11px] text-slate-500">
                  Variations, stock levels and combination prices are edited one
                  combination at a time, so the bag rows of customers holding
                  them stay intact.
                </p>
                <Link
                  to={`/admin/inventory/${editTarget.prodId ?? editTarget.id}`}
                  onClick={() => setShowEditProductModal(false)}
                  className="shrink-0 h-7 px-2.5 rounded-md border border-slate-200 bg-white text-[11px] font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Manage variations
                </Link>
              </div>
              <div className="pt-1 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditProductModal(false)
                    setEditTarget(null)
                  }}
                  className="h-8 px-3 rounded-md border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-8 px-3 rounded-md bg-brand-orange hover:bg-brand-orange-dark text-white font-semibold cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteProduct}
        title="Remove product"
        message={
          deleteTarget
            ? `"${deleteTarget.name}" will be removed from the catalog (soft delete). You can still re-list it later.`
            : ''
        }
      />

      {/* FLOW-MANAGE_INV-01: one combination, edited on its own, so every other
          prodvar row - and every bag and sales row hanging off it - is left
          untouched. */}
      {variantEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-slate-900">Edit Combination</h2>
                <p className="text-[11px] text-slate-400 truncate">
                  {variantEditor.variant.label || variantEditor.variant.name}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close edit combination"
                onClick={() => setVariantEditor(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="space-y-2.5 px-4 py-3 text-xs">
              {Object.entries(variantEditor.variant.options || {}).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {Object.entries(variantEditor.variant.options).map(([axis, value]) => (
                    <span
                      key={`${axis}-${value}`}
                      className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-semibold text-slate-600"
                    >
                      {axis}: {value}
                    </span>
                  ))}
                </div>
              )}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Display name (optional)</label>
                <input
                  type="text"
                  placeholder={variantEditor.variant.label || 'Cream / Medium'}
                  value={variantDraft.name}
                  onChange={(e) => setVariantDraft((draft) => ({ ...draft, name: e.target.value }))}
                  className="w-full h-8 px-2.5 rounded-md border border-slate-200 focus:ring-1 focus:ring-brand-orange"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Stock</label>
                  <input
                    type="number"
                    min="0"
                    value={variantDraft.stock}
                    onChange={(e) => setVariantDraft((draft) => ({ ...draft, stock: e.target.value }))}
                    className="w-full h-8 px-2.5 rounded-md border border-slate-200 focus:ring-1 focus:ring-brand-orange"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Markup (₱)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={variantDraft.markup}
                    onChange={(e) => setVariantDraft((draft) => ({ ...draft, markup: e.target.value }))}
                    className="w-full h-8 px-2.5 rounded-md border border-slate-200 focus:ring-1 focus:ring-brand-orange"
                  />
                </div>
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Image (optional)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="/uploads/product/... or data URL"
                    value={variantDraft.pic}
                    onChange={(e) => setVariantDraft((draft) => ({ ...draft, pic: e.target.value }))}
                    className="flex-1 h-8 px-2.5 rounded-md border border-slate-200 focus:ring-1 focus:ring-brand-orange"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setVariantEditor({ ...variantEditor, pickingPhoto: true })
                      addVariationPhotoRef.current?.click()
                    }}
                    className="h-8 px-2.5 rounded-md border border-slate-200 bg-white text-[11px] font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Upload
                  </button>
                </div>
                {variantDraft.pic && (
                  <img
                    src={getImageUrl(variantDraft.pic)}
                    alt="Combination preview"
                    className="mt-2 h-14 w-14 rounded-md border border-slate-200 object-contain"
                  />
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
              <button
                type="button"
                onClick={() => setVariantEditor(null)}
                className="h-8 px-3 rounded-md border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleVariantEditorSave}
                className="h-8 px-3 rounded-md bg-brand-orange hover:bg-brand-orange-dark text-white font-semibold cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
