import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useCart } from '../hooks/useCart.js'
import { useToast } from '../hooks/useToast.js'
import AppShell from '../components/layout/AppShell.jsx'
import PageHeader from '../components/ui/PageHeader.jsx'
import QuantityStepper from '../components/ui/QuantityStepper.jsx'
import { formatPrice } from '../components/ui/PriceTag.jsx'
import Button from '../components/ui/Button.jsx'
import LoginPromptModal from '../components/ui/LoginPromptModal.jsx'
import { CartIcon, ShirtIcon } from '../components/ui/Icons.jsx'
import { getImageUrl } from '../utils/imageUtils.js'

function Cart() {
  const navigate = useNavigate()
  const { currentUser } = useAuth()
  const {
    cartItems,
    selectedItemIds,
    selectedItems,
    toggleSelectItem,
    selectAllItems,
    selectOnlyType,
    updateQuantity,
    removeFromCart,
    restoreItem,
    subtotal,
  } = useCart()
  const { showToast } = useToast()

  const [showLogin, setShowLogin] = useState(false)

  // Mixed order classification (Requirement 8 & 9)
  const regularSelected = selectedItems.filter((i) => !i.product.preOrder)
  const preorderSelected = selectedItems.filter((i) => i.product.preOrder)
  const hasMixedSelection = regularSelected.length > 0 && preorderSelected.length > 0
  const isNoneSelected = selectedItems.length === 0

  const allSelected =
    cartItems.length > 0 && selectedItemIds.length === cartItems.length

  const handleToggleSelectAll = () => {
    selectAllItems(!allSelected)
  }

  const handleRemoveWithUndo = (item) => {
    const removed = removeFromCart(item.cartItemId)
    if (removed) {
      showToast(`Removed "${item.product.name}" from cart`, 'info', {
        label: 'Undo',
        onClick: () => {
          restoreItem(removed)
          showToast(`Restored "${item.product.name}" to cart`)
        },
      })
    }
  }

  const handleCheckout = () => {
    if (!currentUser) {
      setShowLogin(true)
      return
    }
    if (isNoneSelected) {
      showToast('Please select at least one item to checkout.', 'error')
      return
    }
    if (hasMixedSelection) {
      showToast(
        'Cannot checkout regular and pre-order items together. Please separate them.',
        'error'
      )
      return
    }
    navigate('/checkout')
  }

  // Helper to determine max stock per variant (Requirement 12)
  const getItemMaxStock = (item) => {
    if (item.product.stockMatrix && item.color?.name) {
      const colorStock = item.product.stockMatrix[item.color.name]
      if (colorStock && item.size && colorStock[item.size] !== undefined) {
        return colorStock[item.size]
      }
    }
    return item.product.preOrder ? 10 : 15
  }

  return (
    <AppShell>
      <PageHeader
        title={`Shopping Cart (${cartItems.length})`}
        backTo="/home"
        rightAction={
          <button
            type="button"
            onClick={() => navigate('/shop')}
            className="text-xs font-bold text-brand-orange hover:underline cursor-pointer"
          >
            Shop
          </button>
        }
      />

      <div className="px-4 py-4 pb-36 lg:px-0 lg:py-0 lg:pb-16 animate-fade-in max-w-6xl mx-auto">
        {/* Desktop Top Nav & Page Title (Requirement 17: Item count beside Shopping Cart) */}
        <div className="hidden lg:flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:text-brand-orange hover:border-brand-orange bg-white transition-all shadow-2xs cursor-pointer"
              title="Go back to previous page"
              aria-label="Go back"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span>Go Back</span>
            </button>
            <div className="flex items-center gap-2.5">
              <h1 className="text-3xl font-black text-gray-900">Shopping Cart</h1>
              <span className="px-2.5 py-0.5 rounded-full bg-orange-100 text-brand-orange text-xs font-black">
                {cartItems.length} {cartItems.length === 1 ? 'item' : 'items'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate('/shop')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-50 hover:bg-orange-100 text-brand-orange font-bold text-xs transition-colors cursor-pointer"
            title="Browse university merchandise catalog"
          >
            <span>Continue Shopping</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {cartItems.length === 0 ? (
          /* Empty Cart State */
          <div className="text-center py-20 flex flex-col items-center justify-center bg-white rounded-3xl border border-gray-100 p-8 shadow-xs">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center border border-gray-100 mb-2">
              <CartIcon className="w-7 h-7 text-gray-400" />
            </div>
            <h3 className="font-bold text-gray-800 mt-3 text-lg">Your cart is empty</h3>
            <p className="text-sm text-gray-400 mt-1 max-w-[280px] mx-auto leading-relaxed">
              Explore our official BU hoodies, caps, varsity jackets, and campus essentials!
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-3 mt-6">
              <Button
                onClick={() => navigate('/shop')}
                className="px-6 h-11 rounded-full font-bold text-xs shadow-md"
              >
                Browse Shop
              </Button>
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="px-6 h-11 rounded-full border border-gray-200 text-gray-700 font-bold text-xs hover:bg-gray-50 hover:border-gray-300 transition-all cursor-pointer"
              >
                Go Back
              </button>
            </div>
          </div>
        ) : (
          <div className="lg:grid lg:grid-cols-12 lg:gap-8 lg:items-start">
            {/* Left Column: Selection Bar + Cart Items List */}
            <div className="lg:col-span-7 space-y-4">
              {/* Mixed Items Guard Banner (Requirement 8 & 9) */}
              {hasMixedSelection && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900 shadow-2xs animate-slide-up">
                  <div className="flex items-start gap-2.5">
                    <span className="text-base shrink-0">⚠️</span>
                    <div className="space-y-1.5 flex-1">
                      <h4 className="font-black text-amber-950">
                        Separate Orders Required for In-Stock & Pre-Order Items
                      </h4>
                      <p className="text-amber-900/90 leading-relaxed">
                        Regular products are available for immediate pickup or dispatch, while pre-orders require a dedicated 7–14 day custom production run. Please checkout each type separately.
                      </p>
                      <div className="flex items-center gap-2 pt-1 flex-wrap">
                        <button
                          type="button"
                          onClick={() => selectOnlyType('regular')}
                          className="px-3 py-1 rounded-lg bg-amber-200/70 hover:bg-amber-200 text-amber-950 font-bold text-[11px] transition-colors cursor-pointer"
                        >
                          Select Regular Items Only ({regularSelected.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => selectOnlyType('preorder')}
                          className="px-3 py-1 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-950 font-bold text-[11px] transition-colors cursor-pointer"
                        >
                          Select Pre-Orders Only ({preorderSelected.length})
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Selection Bar (Requirement 2 & 3: Select All + Selected Count) */}
              <div className="bg-white rounded-2xl border border-gray-200/80 px-4 py-3 flex items-center justify-between shadow-2xs select-none">
                <label className="flex items-center gap-2.5 text-xs font-bold text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={handleToggleSelectAll}
                    className="w-4 h-4 rounded text-brand-orange accent-brand-orange cursor-pointer"
                    title="Select or deselect all items in cart"
                    aria-label="Select all cart items"
                  />
                  <span>Select All ({cartItems.length} items)</span>
                </label>

                <span className="text-xs font-bold text-brand-orange bg-orange-50 px-2.5 py-0.5 rounded-full">
                  {selectedItems.length} selected
                </span>
              </div>

              {/* Cart Items List */}
              <div className="space-y-3">
                {cartItems.map((item) => {
                  const isChecked = selectedItemIds.includes(item.cartItemId)
                  const maxStock = getItemMaxStock(item)
                  const isMaxStockReached = item.qty >= maxStock && !item.product.preOrder

                  // Resolve actual variant image (Requirement 11)
                  const resolvedVariantImg =
                    item.color?.image ||
                    item.product.images?.[0] ||
                    ''

                  return (
                    <article
                      key={item.cartItemId}
                      className={`rounded-2xl border p-4 transition-all duration-200 flex gap-3.5 shadow-2xs select-none ${
                        isChecked
                          ? 'border-brand-orange/40 bg-orange-50/20 ring-1 ring-brand-orange/20'
                          : 'border-gray-200/80 bg-white opacity-85 hover:opacity-100'
                      }`}
                    >
                      {/* Item Checkbox (Requirement 1 & 18) */}
                      <div className="flex items-center pt-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectItem(item.cartItemId)}
                          className="w-4 h-4 rounded text-brand-orange accent-brand-orange cursor-pointer"
                          title={isChecked ? 'Uncheck item' : 'Check item to include in checkout'}
                          aria-label={`Select ${item.product.name}`}
                        />
                      </div>

                      {/* Actual Product / Variant Image (Requirement 11) */}
                      <Link
                        to={`/product/${item.product.id}`}
                        className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-white border border-gray-100 flex items-center justify-center shrink-0 overflow-hidden relative group"
                        title={`View ${item.product.name}`}
                      >
                        {resolvedVariantImg ? (
                          <img
                            src={getImageUrl(resolvedVariantImg)}
                            alt={`${item.product.name} - ${item.color?.name || ''}`}
                            className="w-full h-full object-contain p-1 group-hover:scale-105 transition-transform"
                          />
                        ) : (
                          <ShirtIcon className="w-8 h-8 text-brand-orange opacity-40" />
                        )}
                      </Link>

                      {/* Details & Controls */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Link
                                  to={`/product/${item.product.id}`}
                                  className="text-sm font-extrabold text-gray-900 hover:text-brand-orange transition-colors truncate block"
                                >
                                  {item.product.name}
                                </Link>

                                {/* In Stock / Pre-Order Badge (Requirement 14) */}
                                {item.product.preOrder ? (
                                  <span className="text-[10px] font-black uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200/60">
                                    Pre-order
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
                                    In Stock
                                  </span>
                                )}
                              </div>

                              {/* Explicit Color + Size formatting (Requirement 10) */}
                              <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 flex-wrap">
                                {item.size && item.size !== 'One Size' && (
                                  <span>
                                    Size: <strong className="text-gray-800">{item.size}</strong>
                                  </span>
                                )}
                                {item.size && item.size !== 'One Size' && item.color && (
                                  <span className="text-gray-300">·</span>
                                )}
                                {item.color && (
                                  <span className="flex items-center gap-1.5">
                                    Color:{' '}
                                    <span
                                      className="w-3 h-3 rounded-full border border-gray-300 inline-block shrink-0"
                                      style={{ backgroundColor: item.color.value }}
                                      title={item.color.name}
                                    />
                                    <strong className="text-gray-800">{item.color.name}</strong>
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Remove Item Button with Undo (Requirement 13 & 18) */}
                            <button
                              type="button"
                              onClick={() => handleRemoveWithUndo(item)}
                              className="text-gray-400 hover:text-red-500 transition-colors shrink-0 p-1 rounded-lg hover:bg-gray-100 cursor-pointer"
                              title="Remove item from cart"
                              aria-label="Remove item"
                            >
                              <svg
                                viewBox="0 0 24 24"
                                className="w-4.5 h-4.5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        {/* Quantity Stepper & Price Line (Requirement 12) */}
                        <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100/60 flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <QuantityStepper
                              value={item.qty}
                              onChange={(v) => updateQuantity(item.cartItemId, v)}
                              min={1}
                              max={maxStock}
                            />
                            {isMaxStockReached && (
                              <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                                Max stock ({maxStock})
                              </span>
                            )}
                          </div>

                          <div className="text-right">
                            <span className="text-sm font-black text-brand-orange">
                              {formatPrice(item.product.price * item.qty)}
                            </span>
                            {item.qty > 1 && (
                              <span className="block text-[10px] text-gray-400">
                                ₱{item.product.price} each
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            </div>

            {/* Right Column: Order Summary (Requirement 5, 6, 7, 15) */}
            <div className="lg:col-span-5 mt-6 lg:mt-0 space-y-4">
              <div className="bg-gray-50 rounded-3xl p-6 space-y-4 border border-gray-200/80 shadow-2xs">
                <div className="flex items-center justify-between border-b border-gray-200/60 pb-3">
                  <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider">
                    Order Summary
                  </h3>
                  <span className="text-xs font-bold text-gray-500">
                    {selectedItems.length} of {cartItems.length} selected
                  </span>
                </div>

                <div className="space-y-3 text-sm">
                  {/* Dynamic Subtotal (Requirement 5) */}
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Selected Subtotal</span>
                    <span className="font-extrabold text-gray-900">{formatPrice(subtotal)}</span>
                  </div>

                  {/* Shipping = Calculated at checkout (Requirement 7) */}
                  <div className="flex justify-between items-center text-xs sm:text-sm">
                    <span className="text-gray-500">Shipping Estimate</span>
                    <span className="font-bold text-gray-700 bg-gray-200/70 px-2 py-0.5 rounded-md text-xs">
                      Calculated at checkout
                    </span>
                  </div>

                  {/* No tax displayed (Requirement 6) */}

                  <div className="h-px bg-gray-200 my-2" />

                  {/* Total */}
                  <div className="flex justify-between items-baseline">
                    <div>
                      <span className="text-base font-black text-gray-900 block">Total</span>
                      <span className="text-[11px] text-gray-400 font-medium">
                        (Excluding final delivery fee)
                      </span>
                    </div>
                    <span className="font-black text-brand-orange text-2xl">
                      {formatPrice(subtotal)}
                    </span>
                  </div>
                </div>

                {/* Fulfillment note (Requirement 15) */}
                <div className="bg-white border border-gray-200/70 rounded-2xl p-3 text-[11px] text-gray-500 space-y-1 leading-relaxed">
                  <p className="flex items-center gap-1.5 font-bold text-gray-800">
                    <span>🚚</span>
                    <span>Campus Pickup & Delivery</span>
                  </p>
                  <p>
                    Free store pickup at BU Student Center. Albay & nationwide courier rates are computed automatically based on your shipping address during checkout.
                  </p>
                </div>

                {/* Desktop Checkout CTA Button */}
                <div className="hidden lg:block pt-2">
                  <Button
                    disabled={isNoneSelected || hasMixedSelection}
                    onClick={handleCheckout}
                    className={`w-full h-13 rounded-2xl font-black text-sm shadow-md transition-all ${
                      hasMixedSelection
                        ? 'opacity-60 cursor-not-allowed bg-amber-600'
                        : isNoneSelected
                        ? 'opacity-50 cursor-not-allowed'
                        : 'shadow-lg hover:shadow-xl'
                    }`}
                  >
                    {hasMixedSelection
                      ? 'Separate Mixed Items to Checkout'
                      : isNoneSelected
                      ? 'Select Items to Checkout'
                      : `Proceed to Checkout (${selectedItems.length})`}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Sticky Bottom Bar (Requirement 16: Better mobile selection behavior) */}
      {cartItems.length > 0 && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 p-4 safe-bottom shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
          <div className="mx-auto max-w-lg flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={handleToggleSelectAll}
                className="w-4 h-4 rounded text-brand-orange accent-brand-orange cursor-pointer"
                title="Select All"
                aria-label="Select all cart items"
              />
              <div>
                <p className="text-[10px] text-gray-400 font-bold uppercase">
                  {selectedItems.length} selected
                </p>
                <span className="text-base font-black text-brand-orange block leading-tight">
                  {formatPrice(subtotal)}
                </span>
              </div>
            </div>

            <button
              type="button"
              disabled={isNoneSelected || hasMixedSelection}
              onClick={handleCheckout}
              className={`flex-1 h-12 rounded-full font-black text-xs sm:text-sm transition-all px-4 cursor-pointer shadow-md ${
                hasMixedSelection
                  ? 'bg-amber-500 text-white cursor-not-allowed'
                  : isNoneSelected
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-brand-orange hover:bg-brand-orange-dark text-white active:scale-98'
              }`}
            >
              {hasMixedSelection
                ? 'Separate Orders'
                : isNoneSelected
                ? 'Select Items'
                : `Checkout (${selectedItems.length})`}
            </button>
          </div>
        </div>
      )}

      {/* Login Prompt Modal */}
      <LoginPromptModal
        isOpen={showLogin}
        onClose={() => setShowLogin(false)}
        message="Sign in to proceed with checkout and reserve your BU merchandise."
      />
    </AppShell>
  )
}

export default Cart
