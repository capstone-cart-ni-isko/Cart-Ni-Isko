import React, { useState, useMemo } from 'react'
import { useAdmin } from '../../hooks/useAdmin.js'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import { getImageUrl } from '../../utils/imageUtils.js'

const CATEGORIES = [
  'All Items',
  'Shirts',
  'Hoodies',
  'Jackets',
  'Lanyard',
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

  const [selectedCategory, setSelectedCategory] = useState('All Items')
  const [searchQuery, setSearchQuery] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('Cash') // 'Cash' | 'Digital Wallet'
  const [customerName, setCustomerName] = useState('')
  const [studentId, setStudentId] = useState('')
  const [amountTendered, setAmountTendered] = useState('')
  const [lastPlacedOrder, setLastPlacedOrder] = useState(null)
  const [showReceiptModal, setShowReceiptModal] = useState(false)

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
  const tenderedNum = parseFloat(amountTendered) || total
  const changeDue = Math.max(0, tenderedNum - total)

  const handleCheckout = (e) => {
    e.preventDefault()
    if (posCart.length === 0) return

    const order = posCheckout({
      paymentMethod,
      customerName: customerName.trim() || 'Walk-in Student',
      studentId: studentId.trim() || '2026-N/A',
      amountTendered: tenderedNum,
    })

    setLastPlacedOrder(order)
    setShowReceiptModal(true)
    setCustomerName('')
    setStudentId('')
    setAmountTendered('')
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <AdminLayout>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-140px)] min-h-[700px]">
        {/* ── LEFT: PRODUCT CATALOG & FILTERS (8 Cols) ── */}
        <div className="lg:col-span-8 flex flex-col h-full space-y-4">
          {/* Top Search & Filter Bar */}
          <div className="bg-white p-4 rounded-2xl border border-gray-100/90 shadow-xs space-y-3">
            <div className="relative">
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
                placeholder="Search products by name or category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-11 pl-10 pr-4 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange transition-all"
              />
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
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

          {/* Product Grid Area */}
          <div className="flex-1 overflow-y-auto pr-1">
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
                      onClick={() => posAddToCart(product, 'Standard')}
                      className="bg-white rounded-2xl p-3 border border-gray-100/90 shadow-2xs hover:shadow-md hover:border-brand-orange/40 transition-all cursor-pointer group flex flex-col justify-between"
                    >
                      {/* Product Thumbnail */}
                      <div className="aspect-square w-full rounded-xl bg-gray-50 flex items-center justify-center overflow-hidden mb-2.5 relative">
                        <img
                          src={resolvedImg}
                          alt={product.name}
                          className="h-full w-full object-contain p-2 group-hover:scale-105 transition-transform duration-300"
                        />
                        <button
                          type="button"
                          className="absolute bottom-2 right-2 w-7 h-7 rounded-full bg-brand-orange text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-3.5 h-3.5">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                        </button>
                      </div>

                      {/* Info */}
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

        {/* ── RIGHT: CURRENT SALE CART PANEL (4 Cols) ── */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-gray-100/90 shadow-xs flex flex-col justify-between h-full overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-gray-900">Current Sale</h2>
              <span className="text-xs font-bold bg-orange-50 text-brand-orange px-2 py-0.5 rounded-full">
                {posCart.reduce((s, i) => s + i.qty, 0)} items
              </span>
            </div>
            {posCart.length > 0 && (
              <button
                type="button"
                onClick={posClearCart}
                title="Clear Cart"
                className="text-gray-400 hover:text-rose-600 p-1 rounded-lg transition-colors"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            )}
          </div>

          {/* Line Items Scroll */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 divide-y divide-gray-100">
            {posCart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 py-16">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-12 h-12 opacity-30 mb-2">
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
                      className="w-10 h-10 rounded-lg object-contain bg-gray-50 p-1 shrink-0"
                    />
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-gray-900 truncate">{item.name}</h4>
                      <p className="text-[10px] text-gray-400 truncate">{item.variant}</p>
                      <p className="text-xs font-black text-brand-orange mt-0.5">
                        ₱{((Number(item?.price) || 0) * (Number(item?.qty) || 1)).toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {/* Quantity Stepper */}
                  <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg p-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => posUpdateQty(idx, item.qty - 1)}
                      className="w-6 h-6 rounded flex items-center justify-center text-gray-600 hover:bg-white font-bold text-xs"
                    >
                      -
                    </button>
                    <span className="w-5 text-center text-xs font-bold text-gray-900">
                      {item.qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => posUpdateQty(idx, item.qty + 1)}
                      className="w-6 h-6 rounded flex items-center justify-center text-gray-600 hover:bg-white font-bold text-xs"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Checkout & Payment Section */}
          <div className="p-4 border-t border-gray-100 bg-gray-50/70 space-y-3.5">
            {/* Customer info fields */}
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

            {/* Totals Summary */}
            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-gray-500 font-medium">
                <span>Subtotal</span>
                <span>₱{(Number(subtotal) || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm font-black text-gray-900 pt-1 border-t border-gray-200/80">
                <span>Total</span>
                <span className="text-base text-gray-900 font-black">₱{(Number(total) || 0).toFixed(2)}</span>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400">
                Payment Method
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('Cash')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-2 transition-all ${
                    paymentMethod === 'Cash'
                      ? 'bg-brand-orange text-white border-brand-orange shadow-xs'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    <rect x="2" y="6" width="20" height="12" rx="2" />
                    <circle cx="12" cy="12" r="2" />
                    <path d="M6 12h.01M18 12h.01" />
                  </svg>
                  <span>Cash</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('Digital Wallet')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-2 transition-all ${
                    paymentMethod === 'Digital Wallet'
                      ? 'bg-brand-orange text-white border-brand-orange shadow-xs'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                    <line x1="12" y1="18" x2="12.01" y2="18" />
                  </svg>
                  <span>Digital Wallet</span>
                </button>
              </div>
            </div>

            {/* Cash Tendered Input (if cash) */}
            {paymentMethod === 'Cash' && posCart.length > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="font-bold text-gray-600">Amount Tendered:</span>
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

            {/* Primary Action Button */}
            <button
              type="button"
              disabled={posCart.length === 0}
              onClick={handleCheckout}
              className="w-full py-3 bg-brand-orange hover:bg-brand-orange-dark disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 shadow-xs transition-all active:scale-98"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
              <span>Place Order • ₱{(Number(total) || 0).toFixed(2)}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Instant Checkout Receipt Modal */}
      {showReceiptModal && lastPlacedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
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

            {/* Receipt Table */}
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
                    <span className="truncate max-w-[170px]">
                      {item.qty}x {item.name}
                    </span>
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
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                <span>Print Receipt</span>
              </button>
              <button
                type="button"
                onClick={() => setShowReceiptModal(false)}
                className="flex-1 py-2.5 bg-brand-orange hover:bg-brand-orange-dark text-white font-black text-xs rounded-xl shadow-xs transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
