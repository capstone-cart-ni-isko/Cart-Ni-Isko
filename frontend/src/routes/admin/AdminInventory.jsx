import React, { useState, useMemo, useRef } from 'react'
import { useAdmin } from '../../hooks/useAdmin.js'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import ConfirmModal from '../../components/ui/ConfirmModal.jsx'
import { getImageUrl } from '../../utils/imageUtils.js'
import { uploadImage } from '../../services/upload.js'

// FLOW-MANAGE_INV-06 / REQ-MANAGE_INV-04 — the low-stock alert threshold.
const LOW_STOCK_THRESHOLD = 10

export default function AdminInventory() {
  const { addProduct, updateProduct, deleteProduct, unlistProduct, sellProduct, adjustStock, products: backendProducts } = useAdmin()

  // Product data state - synced directly from backend (refetched on every change)
  const productsList = backendProducts
  const [expandedRows, setExpandedRows] = useState({ 'prod-01': true }) // Row 1 expanded by default (Photo 3)
  const [selectedVariantIds, setSelectedVariantIds] = useState(['var-1', 'var-2']) // Two selected by default (Photo 3)
  const [selectedProductIds, setSelectedProductIds] = useState([])

  // Filters state
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCollection, setFilterCollection] = useState('All')
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
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false)
  const [newProdName, setNewProdName] = useState('')
  const [newProdDesc, setNewProdDesc] = useState('')
  const [newProdPhoto, setNewProdPhoto] = useState('')
  const [newProdCategory, setNewProdCategory] = useState('Shirts')
  const [newProdPrice, setNewProdPrice] = useState('450')
  const [newProdStock, setNewProdStock] = useState('20')
  const [newCatName, setNewCatName] = useState('')

  // Edit / Delete product state (backend-driven)
  const [showEditProductModal, setShowEditProductModal] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editCategory, setEditCategory] = useState('Shirts')
  const [editPrice, setEditPrice] = useState('')
  const [editStock, setEditStock] = useState('')
  const [editPhoto, setEditPhoto] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)

  // File inputs for real photo uploads (add + edit modals)
  const addPhotoRef = useRef(null)
  const editPhotoRef = useRef(null)
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)

  // Product photo upload → backend storage, then keep the returned URL
  const handleAddPhotoChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'].includes(file.type)) {
      window.alert('Please choose a PNG, JPEG, GIF, or WebP image.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      window.alert('Image size exceeds the 10MB limit.')
      return
    }
    setIsUploadingPhoto(true)
    try {
      const url = await uploadImage(file, 'product')
      setNewProdPhoto(url)
    } catch (err) {
      window.alert(err.message || 'Unable to upload the image.')
    } finally {
      setIsUploadingPhoto(false)
    }
  }

  const handleEditPhotoChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'].includes(file.type)) {
      window.alert('Please choose a PNG, JPEG, GIF, or WebP image.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      window.alert('Image size exceeds the 10MB limit.')
      return
    }
    setIsUploadingPhoto(true)
    try {
      const url = await uploadImage(file, 'product')
      setEditPhoto(url)
    } catch (err) {
      window.alert(err.message || 'Unable to upload the image.')
    } finally {
      setIsUploadingPhoto(false)
    }
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
    if (filterCollection !== 'All') tags.push({ key: 'collection', label: `Collection: ${filterCollection}` })
    if (filterCategory !== 'All') tags.push({ key: 'category', label: `Category: ${filterCategory}` })
    if (filterAvailability !== 'All') tags.push({ key: 'availability', label: `Availability: ${filterAvailability}` })
    if (filterStockStatus !== 'All') tags.push({ key: 'stock', label: `Stock: ${filterStockStatus}` })
    if (filterPublication !== 'All') tags.push({ key: 'publication', label: `Publication: ${filterPublication}` })
    return tags
  }, [filterCollection, filterCategory, filterAvailability, filterStockStatus, filterPublication])

  const removeTag = (key) => {
    if (key === 'collection') setFilterCollection('All')
    if (key === 'category') setFilterCategory('All')
    if (key === 'availability') setFilterAvailability('All')
    if (key === 'stock') setFilterStockStatus('All')
    if (key === 'publication') setFilterPublication('All')
    setPage(1)
  }
  const clearAllTags = () => {
    setFilterCollection('All')
    setFilterCategory('All')
    setFilterAvailability('All')
    setFilterStockStatus('All')
    setFilterPublication('All')
    setPage(1)
  }

  // Add Product Form submit (calls backend; keeps input on failure per REQ-IM-01)
  const handleCreateProduct = async (e) => {
    e.preventDefault()
    if (!newProdName) return
    const result = await addProduct({
      name: newProdName,
      desc: newProdDesc,
      photo: newProdPhoto,
      category: newProdCategory,
      price: parseFloat(newProdPrice) || 300,
      stock: parseInt(newProdStock, 10) || 10,
    })
    if (!result.success) return
    setShowAddProductModal(false)
    setNewProdName('')
    setNewProdDesc('')
    setNewProdPhoto('')
  }

  // Open Edit Product modal pre-filled with current values
  const openEditModal = (prod) => {
    setEditTarget(prod)
    setEditName(prod.name)
    setEditDesc(prod.description || '')
    setEditCategory(prod.categoryName || 'Shirts')
    setEditPrice(String(prod.price ?? ''))
    setEditStock(String(prod.totalStock ?? ''))
    setEditPhoto(
      prod.image && (prod.image.startsWith('http') || prod.image.startsWith('/storage/'))
        ? prod.image
        : ''
    )
    setShowEditProductModal(true)
  }

  // Edit Product Form submit (calls backend; keeps input on failure per REQ-IM-01)
  const handleUpdateProduct = async (e) => {
    e.preventDefault()
    if (!editTarget) return
    const result = await updateProduct(editTarget.id, {
      prod_name: editName,
      prod_desc: editDesc,
      prod_categ: editCategory,
      prod_price: parseFloat(editPrice) || 0,
      prod_qty: parseInt(editStock, 10) || 0,
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
      if (filterCollection !== 'All' && p.collectionName !== filterCollection) return false
      if (filterCategory !== 'All' && p.categoryName !== wantedCategory) return false
      if (filterAvailability !== 'All' && p.availability !== filterAvailability) return false
      if (filterStockStatus !== 'All') {
        const stock = Number(p.totalStock) || 0
        if (filterStockStatus === 'Out of Stock' && stock !== 0) return false
        if (filterStockStatus === 'In Stock' && stock <= 0) return false
        if (filterStockStatus === 'Low Stock' && !(stock > 0 && stock <= LOW_STOCK_THRESHOLD)) return false
      }
      if (filterPublication !== 'All' && !!p.published !== (filterPublication === 'Published')) return false
      return true
    })

    // 'featured' keeps the order the backend returned.
    if (sortBy === 'price-asc') rows.sort((a, b) => a.price - b.price)
    else if (sortBy === 'price-desc') rows.sort((a, b) => b.price - a.price)
    else if (sortBy === 'orders-desc') rows.sort((a, b) => (b.orders || 0) - (a.orders || 0))
    else if (sortBy === 'name-asc') rows.sort((a, b) => a.name.localeCompare(b.name))
    else if (sortBy === 'stock-asc') rows.sort((a, b) => (a.totalStock || 0) - (b.totalStock || 0))

    return rows
  }, [
    productsList,
    searchQuery,
    filterCollection,
    filterCategory,
    filterAvailability,
    filterStockStatus,
    filterPublication,
    sortBy,
  ])

  // FLOW-MANAGE_INV-06 — the three counters below were hardcoded ("12", "3",
  // "45") no matter what the catalog held.
  const inventoryStats = useMemo(() => {
    const stats = { low: 0, out: 0, preorder: 0 }
    productsList.forEach((p) => {
      const stock = Number(p.totalStock) || 0
      if (stock === 0) stats.out += 1
      else if (stock <= LOW_STOCK_THRESHOLD) stats.low += 1
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
            <button
              type="button"
              onClick={() => setShowAddCategoryModal(true)}
              className="h-8 px-3 rounded-md border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer bg-white"
            >
              <span>+ Add Category</span>
            </button>
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
                  [filterCollection, filterCategory, filterAvailability, filterStockStatus, filterPublication].some(
                    (v) => v !== 'All'
                  )
                    ? 'bg-brand-orange text-white border-brand-orange'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                Filters
                {(() => {
                  const n = [filterCollection, filterCategory, filterAvailability, filterStockStatus, filterPublication].filter(
                    (v) => v !== 'All'
                  ).length
                  return n > 0 ? ` · ${n}` : ''
                })()}
              </button>

              {showMoreFilters && (
              <>
              <select
                value={filterCollection}
                onChange={(e) => setFilterCollection(e.target.value)}
                className="h-8 px-2.5 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-0 focus:border-slate-300 cursor-pointer"
              >
                <option value="All">Collection ▾</option>
                <option value="2026 Collection">2026 Collection</option>
                <option value="Core Classics">Core Classics</option>
              </select>

              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="h-8 px-2.5 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-0 focus:border-slate-300 cursor-pointer"
              >
                <option value="All">Category ▾</option>
                <option value="Shirts">Shirts</option>
                <option value="Hoodies">Hoodies</option>
                <option value="Lanyards">Lanyards</option>
                <option value="Caps">Caps</option>
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
                          <p className="font-bold text-gray-900 text-xs">{prod.categoryName}</p>
                          <p className="text-[10px] text-gray-400">{prod.collectionName}</p>
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
                          ) : prod.totalStock < 10 ? (
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
                                              <span className="font-bold text-gray-800 text-xs">{variant.name}</span>
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
                                                  : variant.stock < 5
                                                  ? 'text-amber-600 bg-amber-50 border border-amber-100'
                                                  : 'text-emerald-600 bg-emerald-50 border border-emerald-100'
                                              }`}
                                            >
                                              <span
                                                className={`w-1.5 h-1.5 rounded-full ${
                                                  variant.stock === 0
                                                    ? 'bg-rose-500'
                                                    : variant.stock < 5
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
                                            <button
                                              type="button"
                                              className="p-1 rounded-md border border-gray-200 bg-white text-gray-400 hover:text-gray-700 cursor-pointer"
                                            >
                                              ···
                                            </button>
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
          <div className="bg-white rounded-lg p-4 max-w-md w-full border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Add New Product</h3>
              <button
                type="button"
                onClick={() => setShowAddProductModal(false)}
                className="w-7 h-7 rounded-md bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 cursor-pointer"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleCreateProduct} className="space-y-2.5 text-xs">
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
                  accept="image/png,image/jpeg,image/gif,image/webp"
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
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Category</label>
                <select
                  value={newProdCategory}
                  onChange={(e) => setNewProdCategory(e.target.value)}
                  className="w-full h-8 px-2 rounded-md border border-slate-200 text-xs bg-white focus:ring-1 focus:ring-brand-orange"
                >
                  <option value="Shirts">Shirts</option>
                  <option value="Hoodies">Hoodies</option>
                  <option value="Lanyards">Lanyards</option>
                  <option value="Caps">Caps</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Price (₱)</label>
                  <input
                    type="number"
                    required
                    value={newProdPrice}
                    onChange={(e) => setNewProdPrice(e.target.value)}
                    className="w-full h-8 px-2.5 rounded-md border border-slate-200 text-xs focus:ring-1 focus:ring-brand-orange"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Stock</label>
                  <input
                    type="number"
                    required
                    value={newProdStock}
                    onChange={(e) => setNewProdStock(e.target.value)}
                    className="w-full h-8 px-2.5 rounded-md border border-slate-200 text-xs focus:ring-1 focus:ring-brand-orange"
                  />
                </div>
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddProductModal(false)}
                  className="h-8 px-3 rounded-md border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-8 px-3 rounded-md bg-brand-orange hover:bg-brand-orange-dark text-white font-semibold cursor-pointer"
                >
                  Create Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Category Modal */}
      {showAddCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-lg p-4 max-w-sm w-full border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Add New Category</h3>
              <button
                type="button"
                onClick={() => setShowAddCategoryModal(false)}
                className="w-7 h-7 rounded-md bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 cursor-pointer"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="space-y-2.5 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Category Name</label>
                <input
                  type="text"
                  placeholder="e.g. Accessories"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="w-full h-8 px-2.5 rounded-md border border-slate-200 text-xs focus:ring-1 focus:ring-brand-orange"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddCategoryModal(false)}
                  className="h-8 px-3 rounded-md border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddCategoryModal(false)
                    setNewCatName('')
                  }}
                  className="h-8 px-3 rounded-md bg-brand-orange hover:bg-brand-orange-dark text-white font-semibold cursor-pointer"
                >
                  Add Category
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    {/* Edit Product Modal */}
      {showEditProductModal && editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-lg p-4 max-w-md w-full border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Edit Product</h3>
              <button
                type="button"
                onClick={() => { setShowEditProductModal(false); setEditTarget(null) }}
                className="w-7 h-7 rounded-md bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 cursor-pointer"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleUpdateProduct} className="space-y-2.5 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Product Name</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full h-8 px-2.5 rounded-md border border-slate-200 text-xs focus:ring-1 focus:ring-brand-orange"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Description</label>
                <textarea
                  rows={3}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-md border border-slate-200 text-xs focus:ring-1 focus:ring-brand-orange resize-none"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Product Photo</label>
                <button
                  type="button"
                  onClick={() => editPhotoRef.current?.click()}
                  className="w-full h-10 flex items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 text-xs font-semibold text-slate-600 hover:border-brand-orange hover:text-brand-orange bg-slate-50 cursor-pointer"
                >
                  {isUploadingPhoto ? 'Uploading…' : editPhoto ? 'Replace Photo' : 'Upload Photo'}
                </button>
                <input
                  ref={editPhotoRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  className="hidden"
                  onChange={handleEditPhotoChange}
                />
                {editPhoto && (
                  <img
                    src={getImageUrl(editPhoto)}
                    alt="Product preview"
                    className="mt-2 h-20 w-20 rounded-md border border-slate-200 object-contain"
                  />
                )}
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Category</label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className="w-full h-8 px-2 rounded-md border border-slate-200 text-xs bg-white focus:ring-1 focus:ring-brand-orange"
                >
                  <option value="Shirts">Shirts</option>
                  <option value="Hoodies">Hoodies</option>
                  <option value="Varsity Jacket">Varsity Jacket</option>
                  <option value="Lanyards">Lanyards</option>
                  <option value="Caps">Caps</option>
                  <option value="Pins">Pins</option>
                  <option value="Accessories">Accessories</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Price (₱)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    className="w-full h-8 px-2.5 rounded-md border border-slate-200 text-xs focus:ring-1 focus:ring-brand-orange"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Stock</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={editStock}
                    onChange={(e) => setEditStock(e.target.value)}
                    className="w-full h-8 px-2.5 rounded-md border border-slate-200 text-xs focus:ring-1 focus:ring-brand-orange"
                  />
                </div>
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setShowEditProductModal(false); setEditTarget(null) }}
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

      {/* Delete Product Confirmation */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteProduct}
        title="Remove product?"
        message={
          deleteTarget
            ? `"${deleteTarget.name}" will be removed from the catalog (soft delete). You can still re-list it later.`
            : 'This product will be removed from the catalog.'
        }
        confirmText="Delete Product"
        cancelText="Cancel"
        isDestructive
      />
    </AdminLayout>
  )
}