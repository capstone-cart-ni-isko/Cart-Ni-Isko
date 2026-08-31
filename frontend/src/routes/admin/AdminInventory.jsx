import React, { useState, useMemo } from 'react'
import { useAdmin } from '../../hooks/useAdmin.js'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import StatusPill from '../../components/admin/StatusPill.jsx'
import ToggleSwitch from '../../components/admin/ToggleSwitch.jsx'
import DataTable from '../../components/admin/DataTable.jsx'
import { getImageUrl } from '../../utils/imageUtils.js'

export default function AdminInventory() {
  const {
    adminState,
    toggleProductPublished,
    addProduct,
    updateProduct,
    deleteProduct,
    adjustStock,
  } = useAdmin()

  const [activeTab, setActiveTab] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddProductModal, setShowAddProductModal] = useState(false)
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [stockAdjustModal, setStockAdjustModal] = useState(null)
  const [customCategories, setCustomCategories] = useState([])
  const [newCatName, setNewCatName] = useState('')

  // Form states for Add / Edit
  const [formName, setFormName] = useState('')
  const [formCategory, setFormCategory] = useState('Hoodies')
  const [formPrice, setFormPrice] = useState('')
  const [formStock, setFormStock] = useState('')
  const [newStockVal, setNewStockVal] = useState('')

  const products = adminState.products || []

  // Compute category counts
  const categoriesWithCounts = useMemo(() => {
    const baseCats = ['All', 'Shirts', 'Hoodies', 'Jackets', 'Lanyard', 'Caps', ...customCategories]
    return baseCats.map((cat) => {
      const count =
        cat === 'All'
          ? products.length
          : products.filter(
              (p) => p.category?.toLowerCase() === cat.toLowerCase()
            ).length
      return { name: cat, count }
    })
  }, [products, customCategories])

  // Filtered products list
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchTab =
        activeTab === 'All' ||
        p.category?.toLowerCase() === activeTab.toLowerCase()
      const matchSearch =
        !searchQuery ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.category?.toLowerCase().includes(searchQuery.toLowerCase())
      return matchTab && matchSearch
    })
  }, [products, activeTab, searchQuery])

  const handleOpenAdd = () => {
    setEditingProduct(null)
    setFormName('')
    setFormCategory('Hoodies')
    setFormPrice('')
    setFormStock('15')
    setShowAddProductModal(true)
  }

  const handleOpenEdit = (p) => {
    setEditingProduct(p)
    setFormName(p.name)
    setFormCategory(p.category)
    setFormPrice(p.price.toString())
    setFormStock(p.stock.toString())
    setShowAddProductModal(true)
  }

  const handleFormSubmit = (e) => {
    e.preventDefault()
    if (!formName || !formPrice) return

    if (editingProduct) {
      updateProduct(editingProduct.id, {
        name: formName,
        category: formCategory,
        price: parseFloat(formPrice) || 0,
        stock: parseInt(formStock, 10) || 0,
      })
    } else {
      addProduct({
        name: formName,
        category: formCategory,
        price: parseFloat(formPrice) || 0,
        stock: parseInt(formStock, 10) || 0,
      })
    }

    setShowAddProductModal(false)
  }

  const handleAddCategorySubmit = (e) => {
    e.preventDefault()
    if (newCatName.trim() && !customCategories.includes(newCatName.trim())) {
      setCustomCategories([...customCategories, newCatName.trim()])
      setNewCatName('')
      setShowAddCategoryModal(false)
    }
  }

  const handleStockAdjustSubmit = (e) => {
    e.preventDefault()
    if (stockAdjustModal) {
      adjustStock(stockAdjustModal.id, parseInt(newStockVal, 10) || 0)
      setStockAdjustModal(null)
    }
  }

  // Table Columns
  const columns = [
    {
      header: '#',
      key: 'index',
      className: 'w-10 text-gray-400 font-bold',
      render: (_, idx) => <span className="text-gray-400 text-xs font-bold">{idx + 1}</span>,
    },
    {
      header: 'Product',
      key: 'product',
      render: (row) => {
        const resolvedImg = getImageUrl(row.image)
        return (
          <div className="flex items-center gap-3">
            <img
              src={resolvedImg}
              alt={row.name}
              className="w-10 h-10 rounded-xl bg-gray-50 object-contain p-1 border border-gray-100 shrink-0"
            />
            <div className="min-w-0">
              <p className="font-bold text-gray-900 text-xs leading-tight hover:text-brand-orange cursor-pointer">
                {row.name}
              </p>
              <p className="text-[10px] text-gray-400 font-semibold mt-0.5">
                Category: {row.category}
              </p>
            </div>
          </div>
        )
      },
    },
    {
      header: 'Stock',
      key: 'stock',
      render: (row) => (
        <span
          className={`font-bold text-xs ${
            row.stock === 0
              ? 'text-rose-600'
              : row.stock < 10
              ? 'text-amber-600'
              : 'text-gray-900'
          }`}
        >
          {row.stock}
        </span>
      ),
    },
    {
      header: 'Price',
      key: 'price',
      render: (row) => (
        <span className="font-bold text-gray-900 text-xs">
          ₱{(Number(row?.price) || 0).toFixed(2)}
        </span>
      ),
    },
    {
      header: 'Orders',
      key: 'orders',
      render: (row) => (
        <span className="text-gray-600 font-semibold text-xs">{row.orders}</span>
      ),
    },
    {
      header: 'Published',
      key: 'published',
      render: (row) => (
        <ToggleSwitch
          size="sm"
          checked={row.published}
          onChange={() => toggleProductPublished(row.id)}
        />
      ),
    },
    {
      header: 'Status',
      key: 'status',
      render: (row) => <StatusPill status={row.status} />,
    },
    {
      header: 'Action',
      key: 'action',
      render: (row) => (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleOpenEdit(row)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-brand-orange hover:bg-orange-50 transition-colors"
            title="Edit Product"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => {
              setStockAdjustModal(row)
              setNewStockVal(row.stock.toString())
            }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            title="Adjust Stock"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Delete product "${row.name}"?`)) {
                deleteProduct(row.id)
              }
            }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
            title="Delete Product"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            </svg>
          </button>
        </div>
      ),
    },
  ]

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-black text-gray-900 tracking-tight">
              All Products
            </h1>
            <p className="text-xs text-gray-400 font-semibold mt-0.5">
              Products &gt; All Products ({products.length} items total)
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleOpenAdd}
              className="px-4 py-2 bg-brand-orange hover:bg-brand-orange-dark text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Add Product</span>
            </button>

            <button
              type="button"
              onClick={() => setShowAddCategoryModal(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Add Category</span>
            </button>
          </div>
        </div>

        {/* Search & Category Tabs */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100/90 shadow-xs space-y-4">
          {/* Search bar */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="search"
                placeholder="Search for products by name or category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-10 pl-10 pr-4 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-1 focus:ring-brand-orange"
              />
            </div>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-xs font-bold text-gray-500 hover:text-gray-900"
              >
                Clear
              </button>
            )}
          </div>

          {/* Category Tabs with Badges */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none border-t border-gray-100 pt-3">
            {categoriesWithCounts.map((cat) => (
              <button
                key={cat.name}
                type="button"
                onClick={() => setActiveTab(cat.name)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-2 transition-all ${
                  activeTab === cat.name
                    ? 'bg-brand-orange text-white shadow-xs'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
                }`}
              >
                <span>{cat.name}</span>
                <span
                  className={`text-[10px] font-black px-1.5 py-0.2 rounded-full ${
                    activeTab === cat.name
                      ? 'bg-white/25 text-white'
                      : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  {cat.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Products Data Table */}
        <DataTable
          columns={columns}
          data={filteredProducts}
          keyField="id"
          defaultPageSize={10}
        />
      </div>

      {/* Add / Edit Product Modal */}
      {showAddProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-gray-100 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-gray-900">
                {editingProduct ? 'Edit Product' : 'Add New Product'}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddProductModal(false)}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-4 text-xs font-medium">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Product Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. BU Labels 2025 Hoodie"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-orange"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Category</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-orange"
                  >
                    <option value="Hoodies">Hoodies</option>
                    <option value="Shirts">Shirts</option>
                    <option value="Jackets">Jackets</option>
                    <option value="Caps">Caps</option>
                    <option value="Lanyard">Lanyard</option>
                    <option value="Pins">Pins</option>
                    <option value="Stickers">Stickers</option>
                    {customCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Price (₱)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="750.00"
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-orange"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Stock Quantity</label>
                <input
                  type="number"
                  placeholder="20"
                  value={formStock}
                  onChange={(e) => setFormStock(e.target.value)}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-orange"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddProductModal(false)}
                  className="px-4 py-2 bg-gray-100 rounded-xl font-bold text-gray-600 hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-orange rounded-xl font-black text-white hover:bg-brand-orange-dark shadow-xs"
                >
                  {editingProduct ? 'Save Changes' : 'Create Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Category Modal */}
      {showAddCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-gray-100 space-y-4">
            <h3 className="text-base font-black text-gray-900">Add Merchandise Category</h3>
            <form onSubmit={handleAddCategorySubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Category Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tote Bags, Drinkware"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-brand-orange"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddCategoryModal(false)}
                  className="px-4 py-2 bg-gray-100 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 rounded-xl text-xs font-black text-white hover:bg-blue-700 shadow-xs"
                >
                  Add Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Adjust Modal */}
      {stockAdjustModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-gray-100 space-y-4">
            <h3 className="text-base font-black text-gray-900">
              Adjust Stock Level
            </h3>
            <p className="text-xs text-gray-500 font-semibold truncate">
              {stockAdjustModal.name}
            </p>
            <form onSubmit={handleStockAdjustSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">New Stock Count</label>
                <input
                  type="number"
                  required
                  value={newStockVal}
                  onChange={(e) => setNewStockVal(e.target.value)}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-brand-orange"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStockAdjustModal(null)}
                  className="px-4 py-2 bg-gray-100 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-orange rounded-xl text-xs font-black text-white hover:bg-brand-orange-dark shadow-xs"
                >
                  Update Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
