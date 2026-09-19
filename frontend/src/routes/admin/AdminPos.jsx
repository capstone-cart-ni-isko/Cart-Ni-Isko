import React, { useState, useMemo } from 'react'
import { useAdmin } from '../../hooks/useAdmin.js'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import { getImageUrl } from '../../utils/imageUtils.js'

const CATEGORIES = [
  'All Items',
  'Shirts',
  'Hoodies',
  'Jackets',
  'Caps',
  'Stickers',
  'Pins',
]

export default function AdminPos() {
  const {
    adminState,
    posCart,
    posAddToCart,
    posUpdateQty,
    posRemoveItem,
    posClearCart,
    posCheckout,
  } = useAdmin()

  // Mobile state: 'products' | 'cart'
  const [mobileView, setMobileView] = useState('products')
  // Mobile product view: 'list' | 'grid'
  const [productViewMode, setProductViewMode] = useState('list')

  const [selectedCategory, setSelectedCategory] = useState('All Items')
  const [searchQuery, setSearchQuery] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('Cash') // 'Cash' | 'Digital Wallet'
  const [customerName, setCustomerName] = useState('')
  const [studentId, setStudentId] = useState('')
  const [amountTendered, setAmountTendered] = useState('')
  const [showCustomerInput, setShowCustomerInput] = useState(false)
  const [lastPlacedOrder, setLastPlacedOrder] = useState(null)
  const [showReceiptModal, setShowReceiptModal] = useState(false)

  /* ── Modals state ── */
  const [variantModalProduct, setVariantModalProduct] = useState(null) // product selected for variant picking
  const [selectedSize, setSelectedSize] = useState('Medium')
  const [selectedColor, setSelectedColor] = useState('Default')
  const [variantQty, setVariantQty] = useState(1)

  const [showConfirmSaleModal, setShowConfirmSaleModal] = useState(false) // confirmation view before placing order

  const products = adminState.products || []

  // Filter products by category and search
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCat =
        selectedCategory === 'All Items' ||
        p.category.toLowerCase() === selectedCategory.toLowerCase()
      const matchSearch =
        !searchQuery ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.category.toLowerCase().includes(searchQuery.toLowerCase())
      return matchCat && matchSearch
    })
  }, [products, selectedCategory, searchQuery])

  // Cart total calculations
  const subtotal = posCart.reduce((sum, item) => sum + item.price * item.qty, 0)
  const total = subtotal
  const tenderedNum = parseFloat(amountTendered) || 0
  const changeDue = Math.max(0, tenderedNum - total)
  const cartCount = posCart.reduce((s, i) => s + i.qty, 0)

  // Check if product has variations
  const hasVariants = (product) => {
    const cat = (product?.category || '').toLowerCase()
    return (
      cat.includes('shirt') ||
      cat.includes('hoodie') ||
      cat.includes('jacket') ||
      cat.includes('cap') ||
      Boolean(product?.variants?.length)
    )
  }

  // 1. Trigger product click -> open Variant Picker Modal if variations exist, else add directly
  const handleProductClick = (product) => {
    if (hasVariants(product)) {
      handleSelectProduct(product)
    } else {
      posAddToCart(product, 'Standard')
    }
  }

  const handleSelectProduct = (product) => {
    setVariantModalProduct(product)
    setSelectedSize('Medium')
    setSelectedColor('Default')
    setVariantQty(1)
  }

  // Confirm variant selection -> Add to cart
  const handleConfirmVariantAdd = () => {
    if (!variantModalProduct) return
    const variantLabel = `${selectedSize}${selectedColor !== 'Default' ? `, ${selectedColor}` : ''}`
    for (let i = 0; i < variantQty; i++) {
      posAddToCart(variantModalProduct, variantLabel)
    }
    setVariantModalProduct(null)
  }

  // 2. Trigger Place Order -> open Order Confirmation View
  const handleInitiateCheckout = (e) => {
    if (e) e.preventDefault()
    if (posCart.length === 0) return
    setShowConfirmSaleModal(true)
  }

  // Finalize POS Sale after staff confirmation
  const handleFinalConfirmCheckout = () => {
    const order = posCheckout({
      paymentMethod,
      customerName: customerName.trim() || 'Walk-in Student',
      studentId: studentId.trim() || '2026-N/A',
      amountTendered: tenderedNum || total,
    })

    setLastPlacedOrder(order)
    setShowConfirmSaleModal(false)
    setShowReceiptModal(true)
    setCustomerName('')
    setStudentId('')
    setAmountTendered('')
    setShowCustomerInput(false)
    setMobileView('products')
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <AdminLayout>
      <div className="h-full flex flex-col min-h-0">

        {/* ===================================================================
            1. DESKTOP / WEB POS VIEW (hidden on mobile, flex on md and up)
            Reverted strictly to original desktop design & layout
        =================================================================== */}
        <div className="hidden md:flex gap-4 h-full min-h-0">

          {/* ── LEFT: PRODUCT CATALOG & FILTERS ── */}
          <div className="flex-1 flex flex-col min-h-0 gap-3">

            {/* Toolbar */}
            <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-2xl border border-gray-100/90 shadow-xs shrink-0">
              {/* Search */}
              <div className="relative w-64 shrink-0">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="search"
                  placeholder="Search products…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-8 pl-8 pr-3 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange transition-all"
                />
              </div>

              <div className="h-5 w-px bg-gray-200 shrink-0" />

              {/* Category Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none min-w-0">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`h-7 px-3 rounded-full text-[11px] font-bold whitespace-nowrap transition-all shrink-0 cursor-pointer ${
                      selectedCategory === cat
                        ? 'bg-brand-orange text-white shadow-xs'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Product Grid */}
            <div className="flex-1 overflow-y-auto min-h-0 pr-1">
              {filteredProducts.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-gray-400 font-medium text-xs bg-white rounded-2xl border border-gray-100">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-10 h-10 mb-2 opacity-40">
                    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                    <line x1="3" y1="6" x2="21" y2="6" />
                  </svg>
                  <p>No products found matching filters.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredProducts.map((product) => {
                    const resolvedImg = getImageUrl(product.image)
                    return (
                      <div
                        key={product.id}
                        onClick={() => handleProductClick(product)}
                        className="bg-white rounded-2xl p-3 border border-gray-100/90 shadow-2xs hover:shadow-md hover:border-brand-orange/40 transition-all cursor-pointer group flex flex-col justify-between"
                      >
                        <div className="aspect-square w-full rounded-xl bg-gray-50 flex items-center justify-center overflow-hidden mb-2.5 relative">
                          <img
                            src={resolvedImg}
                            alt={product.name}
                            className="h-full w-full object-contain p-2 group-hover:scale-105 transition-transform duration-300"
                          />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              posAddToCart(product, 'Standard')
                            }}
                            className="absolute bottom-2 right-2 w-7 h-7 rounded-full bg-brand-orange text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm cursor-pointer"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-3.5 h-3.5">
                              <line x1="12" y1="5" x2="12" y2="19" />
                              <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                          </button>
                        </div>
                        <div>
                          <p className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400">
                            {product.category}
                          </p>
                          <h3 className="text-xs font-black text-gray-900 line-clamp-2 mt-0.5 group-hover:text-brand-orange transition-colors">
                            {product.name}
                          </h3>
                          <p className="text-xs font-black text-brand-orange mt-1.5">
                            ₱{(Number(product?.price) || 0).toFixed(2)}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT: DESKTOP CHECKOUT PANEL ── */}
          <div className="w-80 xl:w-96 shrink-0 bg-white rounded-2xl border border-gray-100/90 shadow-xs flex flex-col h-full min-h-0 overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black text-gray-900">Current Sale</h2>
                <span className="text-xs font-bold bg-orange-50 text-brand-orange px-2 py-0.5 rounded-full">
                  {cartCount} items
                </span>
              </div>
              {posCart.length > 0 && (
                <button
                  type="button"
                  onClick={posClearCart}
                  title="Clear Cart"
                  className="text-gray-400 hover:text-rose-600 p-1 rounded-lg transition-colors cursor-pointer"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              )}
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3 space-y-3 divide-y divide-gray-100">
              {posCart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 py-10">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-10 h-10 opacity-30 mb-2">
                    <circle cx="9" cy="21" r="1" />
                    <circle cx="20" cy="21" r="1" />
                    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                  </svg>
                  <p className="text-xs font-bold text-gray-600">Register is empty</p>
                  <p className="text-[11px] text-gray-400 mt-1">Tap items on the left to add to sale</p>
                </div>
              ) : (
                posCart.map((item, idx) => (
                  <div key={`${item.id}-${item.variant}-${idx}`} className="pt-3 first:pt-0 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={getImageUrl(item.image)}
                        alt={item.name}
                        className="w-9 h-9 rounded-lg object-contain bg-gray-50 p-1 shrink-0"
                      />
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-gray-900 truncate">{item.name}</h4>
                        <p className="text-[10px] text-gray-400 truncate">{item.variant}</p>
                        <p className="text-xs font-black text-brand-orange mt-0.5">
                          ₱{((Number(item?.price) || 0) * (Number(item?.qty) || 1)).toFixed(2)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg p-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => posUpdateQty(idx, item.qty - 1)}
                        className="w-6 h-6 rounded flex items-center justify-center text-gray-600 hover:bg-white font-bold text-xs cursor-pointer"
                      >-</button>
                      <span className="w-5 text-center text-xs font-bold text-gray-900">{item.qty}</span>
                      <button
                        type="button"
                        onClick={() => posUpdateQty(idx, item.qty + 1)}
                        className="w-6 h-6 rounded flex items-center justify-center text-gray-600 hover:bg-white font-bold text-xs cursor-pointer"
                      >+</button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Desktop Checkout Footer */}
            <div className="shrink-0 px-4 pt-3 pb-4 border-t border-gray-100 bg-gray-50/70 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Customer (Optional)"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full text-xs p-2 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-orange"
                />
                <input
                  type="text"
                  placeholder="Student ID (Optional)"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  className="w-full text-xs p-2 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-orange"
                />
              </div>

              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-gray-500 font-medium">
                  <span>Subtotal</span>
                  <span>₱{(Number(subtotal) || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-500 font-medium">
                  <span>Discount</span>
                  <span>₱0.00</span>
                </div>
                <div className="flex justify-between text-sm font-black text-gray-900 pt-1 border-t border-gray-200/80">
                  <span>Total</span>
                  <span className="text-base font-black">₱{(Number(total) || 0).toFixed(2)}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400">Payment Method</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('Cash')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      paymentMethod === 'Cash'
                        ? 'bg-brand-orange text-white border-brand-orange shadow-xs'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                      <rect x="2" y="6" width="20" height="12" rx="2" />
                      <circle cx="12" cy="12" r="2" />
                    </svg>
                    Cash
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('Digital Wallet')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      paymentMethod === 'Digital Wallet'
                        ? 'bg-brand-orange text-white border-brand-orange shadow-xs'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                    </svg>
                    Digital Wallet
                  </button>
                </div>
              </div>

              {paymentMethod === 'Cash' && posCart.length > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="font-bold text-gray-600">Amount Tendered</span>
                    {tenderedNum >= total && (
                      <span className="font-bold text-emerald-600">
                        Change: ₱{(Number(changeDue) || 0).toFixed(2)}
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    placeholder={`₱${(Number(total) || 0).toFixed(2)}`}
                    value={amountTendered}
                    onChange={(e) => setAmountTendered(e.target.value)}
                    className="w-full text-xs p-2 bg-white border border-gray-200 rounded-xl font-bold focus:outline-none focus:ring-1 focus:ring-brand-orange"
                  />
                </div>
              )}

              <button
                type="button"
                disabled={posCart.length === 0}
                onClick={handleInitiateCheckout}
                className="w-full py-3 bg-brand-orange hover:bg-brand-orange-dark disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 shadow-xs transition-all active:scale-[0.98] cursor-pointer"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <line x1="2" y1="10" x2="22" y2="10" />
                </svg>
                Place Order • ₱{(Number(total) || 0).toFixed(2)}
              </button>
            </div>
          </div>
        </div>

        {/* ===================================================================
            2. MOBILE POS VIEW (flex on mobile < md, hidden on md+)
            Designed strictly based on uploaded user screenshot mockup
        =================================================================== */}
        <div className="flex md:hidden flex-col h-full min-h-0 relative">

          {/* ── MOBILE SCREEN 1: PRODUCTS / CATALOG VIEW ── */}
          {mobileView === 'products' && (
            <div className="flex-1 flex flex-col min-h-0 gap-3 pb-16">

              {/* Mobile Top Header */}
              <div className="flex items-center gap-2 shrink-0 pt-1">
                <button type="button" className="p-1.5 rounded-lg text-gray-700 hover:bg-gray-100 cursor-pointer">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                    <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
                  </svg>
                </button>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-brand-orange flex items-center justify-center text-white shrink-0">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                      <rect x="6" y="2" width="12" height="4" rx="1" />
                      <path d="M4 14l1.8-5h12.4l1.8 5" />
                      <rect x="3" y="14" width="18" height="7" rx="1.5" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-900 leading-tight">POS Register</p>
                    <p className="text-[10px] text-gray-400">In-store POS</p>
                  </div>
                </div>
                <button type="button" className="relative p-1.5 rounded-lg text-gray-700 hover:bg-gray-100 cursor-pointer">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                  <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 bg-brand-orange text-white text-[8px] font-black rounded-full flex items-center justify-center">3</span>
                </button>
                <button type="button" className="p-1.5 rounded-lg text-gray-700 hover:bg-gray-100 cursor-pointer">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                    <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                  </svg>
                </button>
                <button type="button" className="p-1.5 rounded-lg text-gray-700 hover:bg-gray-100 cursor-pointer">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                    <circle cx="12" cy="5" r="1.5" fill="currentColor" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /><circle cx="12" cy="19" r="1.5" fill="currentColor" />
                  </svg>
                </button>
              </div>

              {/* Search Bar with Barcode Scanner Icon */}
              <div className="relative shrink-0">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="search"
                  placeholder="Search product, SKU, or scan barcode..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-10 pl-9 pr-10 rounded-xl bg-white border border-gray-200 text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-brand-orange"
                />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 cursor-pointer">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    <rect x="3" y="4" width="3" height="16" /><rect x="8" y="4" width="2" height="16" />
                    <rect x="12" y="4" width="4" height="16" /><rect x="18" y="4" width="3" height="16" />
                  </svg>
                </button>
              </div>

              {/* Category Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none shrink-0 py-0.5">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`h-8 px-3.5 rounded-full text-xs font-bold whitespace-nowrap transition-all shrink-0 cursor-pointer ${
                      selectedCategory === cat
                        ? 'bg-brand-orange text-white shadow-xs'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* List View / Grid View Switcher */}
              <div className="flex items-center bg-gray-100 rounded-xl p-1 shrink-0 self-start">
                <button
                  type="button"
                  onClick={() => setProductViewMode('list')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    productViewMode === 'list'
                      ? 'bg-white text-gray-900 shadow-xs'
                      : 'text-gray-500'
                  }`}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
                    <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
                  </svg>
                  List View
                </button>
                <button
                  type="button"
                  onClick={() => setProductViewMode('grid')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    productViewMode === 'grid'
                      ? 'bg-white text-gray-900 shadow-xs'
                      : 'text-gray-500'
                  }`}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" />
                  </svg>
                  Grid View
                </button>
              </div>

              {/* Mobile Products List/Grid */}
              <div className="flex-1 overflow-y-auto min-h-0 scrollbar-none space-y-2">
                {filteredProducts.length === 0 ? (
                  <div className="h-32 flex items-center justify-center text-xs text-gray-400 font-medium">
                    No products found.
                  </div>
                ) : productViewMode === 'list' ? (
                  filteredProducts.map((product) => {
                    const resolvedImg = getImageUrl(product.image)
                    const skuCode = product.sku || `SH-${String(product.id).padStart(4, '0')}`
                    return (
                      <div
                        key={product.id}
                        onClick={() => handleProductClick(product)}
                        className="bg-white rounded-xl border border-gray-100 p-2.5 flex items-center gap-3 cursor-pointer hover:border-brand-orange/40 transition-all active:bg-gray-50"
                      >
                        <div className="w-14 h-14 rounded-lg bg-gray-50 flex items-center justify-center shrink-0 overflow-hidden">
                          <img src={resolvedImg} alt={product.name} className="w-full h-full object-contain p-1" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-bold text-gray-900 truncate leading-tight">{product.name}</h4>
                          <p className="text-[10px] text-gray-400 mt-0.5">{product.category} • Regular</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            SKU: {skuCode} <span className="text-emerald-500 font-bold ml-1">• In stock</span>
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <p className="text-xs font-black text-gray-900">₱{(Number(product.price) || 0).toFixed(2)}</p>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              posAddToCart(product, 'Standard')
                            }}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-brand-orange text-brand-orange text-[11px] font-bold hover:bg-orange-50 cursor-pointer"
                          >
                            + Add
                          </button>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {filteredProducts.map((product) => (
                      <div
                        key={product.id}
                        onClick={() => handleProductClick(product)}
                        className="bg-white rounded-xl border border-gray-100 p-2.5 flex flex-col justify-between cursor-pointer hover:border-brand-orange/40 transition-all"
                      >
                        <div className="aspect-square w-full rounded-lg bg-gray-50 flex items-center justify-center overflow-hidden mb-2">
                          <img src={getImageUrl(product.image)} alt={product.name} className="w-full h-full object-contain p-1" />
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400 font-bold uppercase">{product.category}</p>
                          <h4 className="text-xs font-bold text-gray-900 truncate">{product.name}</h4>
                          <p className="text-xs font-black text-brand-orange mt-1">₱{(Number(product.price) || 0).toFixed(2)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Floating Bottom Cart Bar */}
              {posCart.length > 0 && (
                <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between shadow-lg">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6 text-brand-orange">
                        <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
                        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                      </svg>
                      <span className="absolute -top-1.5 -right-2 w-4 h-4 bg-brand-orange text-white text-[9px] font-black rounded-full flex items-center justify-center">
                        {cartCount}
                      </span>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 font-bold">{cartCount} items</p>
                      <p className="text-sm font-black text-gray-900">₱{(Number(total) || 0).toFixed(2)}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMobileView('cart')}
                    className="flex items-center gap-1.5 px-4 py-2 bg-brand-orange text-white text-xs font-bold rounded-xl hover:bg-orange-600 transition-colors cursor-pointer"
                  >
                    View Cart →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── MOBILE SCREEN 2: CURRENT SALE (CART & CHECKOUT) ── */}
          {mobileView === 'cart' && (
            <div className="flex-1 flex flex-col min-h-0 bg-white overflow-y-auto scrollbar-none pb-6">

              {/* Mobile Cart Header */}
              <div className="flex items-center justify-between px-3 py-3 border-b border-gray-100 sticky top-0 bg-white z-10">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMobileView('products')}
                    className="p-1 rounded-lg text-gray-700 hover:bg-gray-100 cursor-pointer"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-5 h-5">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </button>
                  <div>
                    <h2 className="text-sm font-bold text-gray-900 leading-tight">Current Sale</h2>
                    <p className="text-[10px] text-gray-400">{cartCount} items</p>
                  </div>
                </div>
                {posCart.length > 0 && (
                  <button
                    type="button"
                    onClick={posClearCart}
                    className="text-rose-600 font-bold text-xs hover:underline cursor-pointer"
                  >
                    Clear Cart
                  </button>
                )}
              </div>

              {/* Cart Items List */}
              <div className="px-4 py-2 divide-y divide-gray-100">
                {posCart.length === 0 ? (
                  <div className="py-12 text-center text-gray-400 text-xs font-medium">
                    Cart is empty.
                  </div>
                ) : (
                  posCart.map((item, idx) => (
                    <div key={`${item.id}-${idx}`} className="py-3.5 space-y-2">
                      <div className="flex items-start gap-3">
                        <img
                          src={getImageUrl(item.image)}
                          alt={item.name}
                          className="w-12 h-12 rounded-xl object-contain bg-gray-50 p-1 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h4 className="text-xs font-bold text-gray-900 leading-tight">{item.name}</h4>
                              <p className="text-[10px] text-gray-400 mt-0.5">{item.variant || 'One Size, Black'}</p>
                              <p className="text-[10px] text-gray-400">SKU: CP-0003</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-gray-900">₱{(Number(item.price) || 0).toFixed(2)}</span>
                              <button
                                type="button"
                                onClick={() => posRemoveItem ? posRemoveItem(idx) : posUpdateQty(idx, 0)}
                                className="text-gray-400 hover:text-rose-600 font-bold text-sm cursor-pointer ml-1"
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                      {/* Qty Stepper & Line Total */}
                      <div className="flex items-center justify-between pl-15">
                        <div className="flex items-center border border-gray-200 rounded-lg px-2 py-1 gap-3 bg-white">
                          <button
                            type="button"
                            onClick={() => posUpdateQty(idx, item.qty - 1)}
                            className="text-gray-500 font-bold text-xs w-4 flex items-center justify-center cursor-pointer"
                          >
                            −
                          </button>
                          <span className="text-xs font-bold text-gray-900">{item.qty}</span>
                          <button
                            type="button"
                            onClick={() => posUpdateQty(idx, item.qty + 1)}
                            className="text-gray-500 font-bold text-xs w-4 flex items-center justify-center cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                        <p className="text-xs font-bold text-gray-900">
                          ₱{((Number(item.price) || 0) * item.qty).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Add Customer (Optional) Button */}
              <div className="px-4 py-3 border-t border-b border-gray-100">
                {!showCustomerInput ? (
                  <button
                    type="button"
                    onClick={() => setShowCustomerInput(true)}
                    className="w-full py-2.5 px-3 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 flex items-center justify-center gap-2 hover:bg-gray-50 cursor-pointer"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-gray-400">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                    </svg>
                    Add Customer <span className="text-gray-400 font-normal">(Optional)</span>
                  </button>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="Customer name"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full text-xs p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-orange"
                    />
                    <input
                      type="text"
                      placeholder="Student ID (Optional)"
                      value={studentId}
                      onChange={(e) => setStudentId(e.target.value)}
                      className="w-full text-xs p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-orange"
                    />
                  </div>
                )}
              </div>

              {/* Subtotal, Discount, Total */}
              <div className="px-4 py-3 space-y-2 border-b border-gray-100">
                <div className="flex justify-between text-xs text-gray-600 font-medium">
                  <span>Subtotal</span>
                  <span className="font-bold text-gray-900">₱{(Number(subtotal) || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-600 font-medium">
                  <span>Discount</span>
                  <button type="button" className="text-rose-500 font-bold flex items-center gap-0.5 cursor-pointer">
                    −₱0.00
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                  <span className="text-sm font-black text-gray-900 tracking-wider">TOTAL</span>
                  <span className="text-lg font-black text-brand-orange">
                    ₱{(Number(total) || 0).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Payment Method Selector */}
              <div className="px-4 py-3 space-y-2.5 border-b border-gray-100">
                <p className="text-xs font-bold text-gray-900">Payment Method</p>
                <div className="grid grid-cols-2 gap-3">
                  {/* Cash */}
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('Cash')}
                    className={`relative p-3 rounded-xl border-2 flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      paymentMethod === 'Cash'
                        ? 'border-brand-orange bg-orange-50/50 text-brand-orange'
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {paymentMethod === 'Cash' && (
                      <div className="absolute top-1.5 right-1.5 w-4 h-4 bg-brand-orange rounded-full flex items-center justify-center">
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" className="w-2.5 h-2.5"><polyline points="20 6 9 17 4 12"/></svg>
                      </div>
                    )}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                      <rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2" />
                    </svg>
                    <span className="text-xs font-bold">Cash</span>
                  </button>

                  {/* Digital Wallet */}
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('Digital Wallet')}
                    className={`relative p-3 rounded-xl border-2 flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      paymentMethod === 'Digital Wallet'
                        ? 'border-brand-orange bg-orange-50/50 text-brand-orange'
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {paymentMethod === 'Digital Wallet' && (
                      <div className="absolute top-1.5 right-1.5 w-4 h-4 bg-brand-orange rounded-full flex items-center justify-center">
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" className="w-2.5 h-2.5"><polyline points="20 6 9 17 4 12"/></svg>
                      </div>
                    )}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                      <rect x="2" y="4" width="20" height="16" rx="2" /><line x1="2" y1="10" x2="22" y2="10" />
                    </svg>
                    <span className="text-xs font-bold">Digital Wallet</span>
                  </button>
                </div>
              </div>

              {/* Cash Received + Change */}
              {paymentMethod === 'Cash' && (
                <div className="px-4 py-3 space-y-2 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-700">Cash Received</p>
                  <input
                    type="number"
                    placeholder="₱1,500.00"
                    value={amountTendered}
                    onChange={(e) => setAmountTendered(e.target.value)}
                    className="w-full text-sm font-bold text-gray-900 p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-orange"
                  />
                  {tenderedNum > 0 && (
                    <div className="bg-emerald-50/80 border border-emerald-100 rounded-xl p-3">
                      <p className="text-xs text-emerald-700 font-semibold">Change</p>
                      <p className="text-xl font-black text-emerald-600">
                        ₱{(Number(changeDue) || 0).toFixed(2)}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* More Actions 4-Grid */}
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-xs font-bold text-gray-900 mb-2">More Actions</p>
                <div className="grid grid-cols-4 gap-2">
                  <button type="button" className="flex flex-col items-center justify-center p-2 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-gray-500 mb-1"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    <span className="text-[9px] font-bold text-gray-600 text-center leading-tight">Hold Transaction</span>
                  </button>
                  <button type="button" className="flex flex-col items-center justify-center p-2 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-gray-500 mb-1"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                    <span className="text-[9px] font-bold text-gray-600 text-center leading-tight">Apply Discount</span>
                  </button>
                  <button type="button" className="flex flex-col items-center justify-center p-2 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-gray-500 mb-1"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    <span className="text-[9px] font-bold text-gray-600 text-center leading-tight">Recent Sales</span>
                  </button>
                  <button type="button" onClick={posClearCart} className="flex flex-col items-center justify-center p-2 rounded-xl border border-rose-100 hover:bg-rose-50 transition-colors cursor-pointer">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-rose-500 mb-1"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    <span className="text-[9px] font-bold text-rose-600 text-center leading-tight">Clear Transaction</span>
                  </button>
                </div>
              </div>

              {/* Place Order Button */}
              <div className="px-4 pt-4">
                <button
                  type="button"
                  disabled={posCart.length === 0}
                  onClick={handleInitiateCheckout}
                  className="w-full py-3.5 bg-[#0284c7] hover:bg-[#0369a1] active:bg-[#075985] disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    <rect x="2" y="4" width="20" height="16" rx="2" /><line x1="2" y1="10" x2="22" y2="10" />
                  </svg>
                  Place Order
                </button>
              </div>

            </div>
          )}
        </div>

      {/* ===================================================================
          3. PRODUCT VARIANT PICKER MODAL (Requirement 3)
      =================================================================== */}
      {variantModalProduct && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-gray-100 space-y-4 animate-scale-in">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <img
                  src={getImageUrl(variantModalProduct.image)}
                  alt={variantModalProduct.name}
                  className="w-12 h-12 rounded-xl object-contain bg-gray-50 p-1 shrink-0"
                />
                <div>
                  <h3 className="text-sm font-bold text-gray-900 leading-tight">{variantModalProduct.name}</h3>
                  <p className="text-[10px] text-gray-400 mt-0.5">{variantModalProduct.category} • In stock</p>
                  <p className="text-xs font-black text-brand-orange mt-0.5">
                    ₱{(Number(variantModalProduct.price) || 0).toFixed(2)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setVariantModalProduct(null)}
                className="p-1 text-gray-400 hover:text-gray-700 rounded-lg cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* Variations options */}
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-gray-700 block mb-1.5">Select Size Variant</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {['Small', 'Medium', 'Large', 'XL', '2XL', 'One Size'].map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => setSelectedSize(sz)}
                      className={`px-3 py-1.5 rounded-xl border font-bold transition-all cursor-pointer ${
                        selectedSize === sz
                          ? 'bg-brand-orange text-white border-brand-orange shadow-2xs'
                          : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1.5">Select Color / Style</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {['Default', 'Black', 'Cream', 'Sand', 'Navy'].map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setSelectedColor(col)}
                      className={`px-3 py-1.5 rounded-xl border font-bold transition-all cursor-pointer ${
                        selectedColor === col
                          ? 'bg-brand-orange text-white border-brand-orange shadow-2xs'
                          : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {col}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <span className="font-bold text-gray-700">Quantity</span>
                <div className="flex items-center border border-gray-200 rounded-xl px-3 py-1 gap-3 bg-gray-50">
                  <button
                    type="button"
                    onClick={() => setVariantQty((q) => Math.max(1, q - 1))}
                    className="text-gray-600 font-bold text-sm w-4 flex items-center justify-center cursor-pointer"
                  >
                    −
                  </button>
                  <span className="text-xs font-bold text-gray-900">{variantQty}</span>
                  <button
                    type="button"
                    onClick={() => setVariantQty((q) => q + 1)}
                    className="text-gray-600 font-bold text-sm w-4 flex items-center justify-center cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setVariantModalProduct(null)}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmVariantAdd}
                className="flex-1 py-2.5 bg-brand-orange hover:bg-orange-600 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer"
              >
                Add to Sale • ₱{((Number(variantModalProduct.price) || 0) * variantQty).toFixed(2)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================
          4. STAFF ORDER CONFIRMATION VIEW MODAL (Requirement 2)
      =================================================================== */}
      {showConfirmSaleModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-gray-100 space-y-4 animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="text-base font-black text-gray-900">Review &amp; Confirm POS Sale</h3>
                <p className="text-xs text-gray-500">Confirm order details before completing transaction</p>
              </div>
              <button
                type="button"
                onClick={() => setShowConfirmSaleModal(false)}
                className="p-1 text-gray-400 hover:text-gray-700 rounded-lg cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50 p-3 rounded-2xl border border-gray-100">
              <div>
                <p className="text-[10px] text-gray-400 font-bold uppercase">Customer</p>
                <p className="font-bold text-gray-900">{customerName.trim() || 'Walk-in Student'}</p>
                <p className="text-[10px] text-gray-500">ID: {studentId.trim() || 'N/A'}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 font-bold uppercase">Payment Method</p>
                <p className="font-bold text-brand-orange">{paymentMethod}</p>
                {paymentMethod === 'Cash' && tenderedNum > 0 && (
                  <p className="text-[10px] text-emerald-600 font-bold">
                    Change: ₱{changeDue.toFixed(2)}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-bold text-gray-900">Items ({cartCount})</p>
              <div className="max-h-40 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-2xl px-3 py-1 bg-white scrollbar-none">
                {posCart.map((item, i) => (
                  <div key={i} className="py-2 flex items-center justify-between text-xs">
                    <div className="min-w-0 pr-2">
                      <p className="font-bold text-gray-900 truncate">{item.name}</p>
                      <p className="text-[10px] text-gray-400">{item.qty}x • {item.variant}</p>
                    </div>
                    <p className="font-bold text-gray-900 shrink-0">₱{((item.price || 0) * item.qty).toFixed(2)}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between items-center p-3 bg-orange-50/70 border border-orange-100 rounded-2xl">
              <span className="text-xs font-black text-gray-900">TOTAL SALE</span>
              <span className="text-lg font-black text-brand-orange">₱{total.toFixed(2)}</span>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowConfirmSaleModal(false)}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                Go Back &amp; Edit
              </button>
              <button
                type="button"
                onClick={handleFinalConfirmCheckout}
                className="flex-1 py-3 bg-brand-orange hover:bg-orange-600 text-white font-black text-xs rounded-xl shadow-xs cursor-pointer"
              >
                Confirm &amp; Place Sale
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================
          RECEIPT MODAL (Works on both desktop & mobile)
      =================================================================== */}
      {showReceiptModal && lastPlacedOrder && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-gray-100 space-y-5 print:shadow-none print:border-none">
            {/* Header */}
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center mb-2">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-6 h-6">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h3 className="text-base font-black text-gray-900">Sale Complete!</h3>
              <p className="text-xs text-gray-500">Tindahan ni Isko • Bicol University</p>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                {lastPlacedOrder.id} • {lastPlacedOrder.fulfillment}
              </p>
            </div>

            {/* Receipt Details */}
            <div className="border-t border-b border-dashed border-gray-200 py-3 space-y-2 text-xs">
              <div className="flex justify-between text-gray-500 text-[11px]">
                <span>Customer:</span>
                <span className="font-bold text-gray-900">{lastPlacedOrder.customer}</span>
              </div>
              <div className="flex justify-between text-gray-500 text-[11px]">
                <span>Payment:</span>
                <span className="font-bold text-gray-900">{lastPlacedOrder.paymentMethod}</span>
              </div>
              <div className="pt-2 space-y-1.5">
                {lastPlacedOrder.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-gray-800">
                    <span className="truncate max-w-[170px]">{item.qty}x {item.name}</span>
                    <span className="font-bold">₱{((Number(item?.price) || 0) * (Number(item?.qty) || 1)).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="pt-2 border-t border-gray-100 flex justify-between font-black text-sm text-gray-900">
                <span>TOTAL PAID</span>
                <span>₱{(Number(lastPlacedOrder.total) || 0).toFixed(2)}</span>
              </div>
              {lastPlacedOrder.change > 0 && (
                <div className="flex justify-between text-emerald-600 font-bold text-xs">
                  <span>Change Given</span>
                  <span>₱{(Number(lastPlacedOrder.change) || 0).toFixed(2)}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handlePrint}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                Print Receipt
              </button>
              <button
                type="button"
                onClick={() => setShowReceiptModal(false)}
                className="flex-1 py-2.5 bg-brand-orange hover:bg-brand-orange-dark text-white font-black text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </AdminLayout>
  )
}
