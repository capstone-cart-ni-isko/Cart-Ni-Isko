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
import ConfirmModal from '../components/ui/ConfirmModal.jsx'
import LoginPromptModal from '../components/ui/LoginPromptModal.jsx'
import { CartIcon, ShirtIcon, AlertTriangleIcon, TruckIcon } from '../components/ui/Icons.jsx'
import { getImageUrl } from '../utils/imageUtils.js'
import { variationParts } from '../utils/variation.js'

/**
 * The bag line's variation as [{ axis, value }], each value under its real
 * axis name. "One Size" carries no information, so it is left out.
 */
function cartVariation(item) {
  const fromAxes = variationParts({ prodvar_options: item?.options, prodvar_name: item?.prodvarName })
  const parts = fromAxes.length > 0
    ? fromAxes
    : [
        ...(item?.color?.name ? [{ axis: 'Color', value: String(item.color.name) }] : []),
        ...(item?.size ? [{ axis: 'Size', value: String(item.size) }] : []),
      ]
  return parts.filter((part) => part.value.toLowerCase() !== 'one size')
}

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
    clearCart,
    subtotal,
  } = useCart()
  const { canCheckoutItem } = useCart()
  const { showToast } = useToast()

  const [showLogin, setShowLogin] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  // Mixed order classification (Requirement 8 & 9)
  // The flag is per LINE, not per product: a product can have one pre-order
  // combination and ordinary ones.
  const regularSelected = selectedItems.filter((i) => !(i.preOrder ?? i.product?.preOrder))
  const preorderSelected = selectedItems.filter((i) => i.preOrder ?? i.product?.preOrder)
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
      showToast(`Removed "${item.product.name}" from bag`, 'info', {
        label: 'Undo',
        onClick: () => {
          restoreItem(removed)
          showToast(`Restored "${item.product.name}" to bag`)
        },
      })
    }
  }

  // FLOW-BAG-07: one visible action empties the whole bag, after confirming.
  const handleClearBag = () => {
    if (cartItems.length === 0) return
    setShowClearConfirm(true)
  }

  const confirmClearBag = () => {
    clearCart()
    showToast('Your bag has been cleared.', 'info')
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
    // Real checkout (overview, modality, payment) lives on /checkout.
    // REQ-CW-02: Verify all selected items are available
    const unavailableItems = selectedItems.filter((i) => !canCheckoutItem(i))
    if (unavailableItems.length > 0) {
      const tooMany = unavailableItems.every(
        (i) => Number.isFinite(i.stock) && i.stock > 0 && i.qty > i.stock
      )
      showToast(
        tooMany
          ? 'Some items are in your bag in a larger quantity than is in stock. Please lower the quantity.'
          : 'Some items are out of stock and cannot be checked out. Please remove them.',
        'error'
      )
      return
    }
    navigate('/checkout')
  }

  // Helper to determine max stock per variant (Requirement 12)
  const getItemMaxStock = (item) => {
    const isPreorder = item.preOrder ?? item.product?.preOrder
    if (isPreorder) {
      return item.product?.preOrderInfo?.maxPreOrderQty || 10
    }
    // The bag line carries its own variation's real stock: trust it first.
    if (Number.isFinite(item.stock)) return Math.max(0, item.stock)
    if (item.product?.stockMatrix && item.color?.name) {
      const colorStock = item.product.stockMatrix[item.color.name]
      if (colorStock && item.size && colorStock[item.size] !== undefined) {
        return colorStock[item.size]
      }
    }
    return 15
  }

  return (
    <AppShell>

      <PageHeader
        title={`Shopping Bag`}
        subtitle="Review your items before checkout."
        backTo="/home"
        rightAction={
          <button
            type="button"
            onClick={() => navigate('/shop')}
            className="text-xs font-semibold text-brand-orange hover:underline cursor-pointer lg:inline-flex lg:items-center lg:gap-2 lg:rounded-lg lg:bg-orange-50 lg:px-4 lg:py-2.5 lg:text-sm lg:no-underline lg:transition-colors lg:hover:bg-orange-100"
          >
            <span className="lg:hidden">Shop</span>
            <span className="hidden lg:inline">Continue Shopping</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="hidden lg:block w-3.5 h-3.5">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        }
      />

      <div className="shopping-bag px-4 py-4 pb-44 md:px-0 md:py-2 lg:pb-16 animate-fade-in max-w-6xl mx-auto">
        {cartItems.length === 0 ? (
          /* Empty Bag State */
          <div className="text-center py-12 flex flex-col items-center justify-center bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-6">
            <div className="w-12 h-12 bg-slate-50 rounded-md flex items-center justify-center mb-2">
              <CartIcon className="w-5 h-5 text-slate-400" />
            </div>
            <h3 className="font-semibold text-gray-800 mt-2 text-base">Your bag is empty</h3>
            <p className="text-xs text-gray-500 mt-1 max-w-[280px] mx-auto leading-relaxed">
              Explore our official BU hoodies, caps, varsity jackets, and campus essentials!
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-2 mt-4">
              <Button
                onClick={() => navigate('/shop')}
                className="px-4 h-8 rounded-md font-semibold text-xs"
              >
                Browse Shop
              </Button>
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="px-4 h-8 rounded-md border border-slate-200 text-gray-700 font-semibold text-xs hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Go Back
              </button>
            </div>
          </div>
        ) : (
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-6 lg:items-start">
            {/* Left Column: Selection Bar + Bag Items List */}
            <div className="min-w-0 space-y-4">
              {/* Mixed Items Guard Banner (Requirement 8 & 9) */}
              {hasMixedSelection && (
                <div className="bg-amber-50 rounded-2xl border border-amber-200/70 p-4 text-sm text-amber-900 animate-slide-up">
                  <div className="flex items-start gap-2">
                    <AlertTriangleIcon className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <div className="space-y-1 flex-1">
                      <h4 className="font-semibold text-amber-950">
                        Separate Orders Required for In-Stock & Pre-Order Items
                      </h4>
                      <p className="text-amber-900/90 leading-relaxed text-[11px]">
                        Regular products are available for immediate pickup or dispatch, while pre-orders require a dedicated 7–14 day custom production run. Please checkout each type separately.
                      </p>
                      <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                        <button
                          type="button"
                          onClick={() => selectOnlyType('regular')}
                          className="px-2.5 py-1 rounded-md bg-amber-200/70 hover:bg-amber-200 text-amber-950 font-semibold text-[11px] transition-colors cursor-pointer"
                        >
                          Select Regular Items Only ({regularSelected.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => selectOnlyType('preorder')}
                          className="px-2.5 py-1 rounded-md bg-blue-100 hover:bg-blue-200 text-blue-950 font-semibold text-[11px] transition-colors cursor-pointer"
                        >
                          Select Pre-Orders Only ({preorderSelected.length})
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Selection Bar (Requirement 2 & 3: Select All + Selected Count) */}
              <div className="rounded-2xl border border-slate-200/80 bg-white shadow-2xs px-5 py-4 flex items-center justify-between gap-3 flex-wrap select-none">
                <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={handleToggleSelectAll}
                    className="check-plain cart-checkbox cursor-pointer"
                    title="Select or deselect all items in bag"
                    aria-label="Select all bag items"
                  />
                  <span>Select All ({cartItems.length} {cartItems.length === 1 ? 'item' : 'items'})</span>
                </label>

                <div className="flex items-center gap-3">
                  {/* FLOW-BAG-07: clear the entire bag in one action */}
                  <button
                    type="button"
                    onClick={handleClearBag}
                    className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-100 cursor-pointer"
                    title="Remove every item from your bag"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
                      <path d="M3 6h18" />
                      <path d="M8 6V4h8v2" />
                      <path d="m19 6-1 14H6L5 6" />
                      <path d="M10 11v5M14 11v5" />
                    </svg>
                    Clear bag
                  </button>
                </div>
              </div>

              {/* Bag Items List */}
              <section className="rounded-2xl border border-slate-200/80 bg-white shadow-2xs px-5 md:px-6">
                <h2 className="text-base font-semibold text-gray-900 py-4 border-b border-slate-100">
                  Bag Items ({cartItems.length})
                </h2>
                <div className="divide-y divide-slate-100">
                {cartItems.map((item) => {
                  const isChecked = selectedItemIds.includes(item.cartItemId)
                  const maxStock = getItemMaxStock(item)
                  const stockKnown = !item.product.preOrder && Number.isFinite(item.stock)
                  const isOutOfStock = stockKnown && item.stock <= 0
                  const isOverStock = stockKnown && item.stock > 0 && item.qty > item.stock
                  const isMaxStockReached =
                    !isOutOfStock && !isOverStock && item.qty >= maxStock && !item.product.preOrder

                  // Resolve actual variant image (Requirement 11)
                  const resolvedVariantImg =
                    item.color?.image ||
                    item.product.images?.[0] ||
                    ''

                  return (
                    <article
                      key={item.cartItemId}
                      className={`py-5 flex gap-3 sm:gap-4 select-none transition-opacity ${isChecked ? '' : 'opacity-80'}`}
                    >
                      {/* Item Checkbox (Requirement 1 & 18) */}
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectItem(item.cartItemId)}
                          className="check-plain cart-checkbox cursor-pointer"
                          title={isChecked ? 'Uncheck item' : 'Check item to include in checkout'}
                          aria-label={`Select ${item.product.name}`}
                        />
                      </div>

                      {/* Actual Product / Variant Image (Requirement 11) */}
                      <Link
                        to={`/product/${item.product.id}`}
                        className="w-20 h-20 sm:w-28 sm:h-28 rounded-xl border border-slate-200/80 bg-white flex items-center justify-center shrink-0 overflow-hidden relative group"
                        title={`View ${item.product.name}`}
                      >
                        {resolvedVariantImg ? (
                          <img
                            src={getImageUrl(resolvedVariantImg)}
                            alt={`${item.product.name} - ${item.color?.name || ''}`}
                            className="w-full h-full object-contain p-1.5 group-hover:scale-105 transition-transform"
                          />
                        ) : (
                          <ShirtIcon className="w-10 h-10 text-brand-orange opacity-40" />
                        )}
                      </Link>

                      {/* Details & Controls */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <div>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Link
                                  to={`/product/${item.product.id}`}
                                  className="text-base sm:text-lg font-semibold text-gray-900 hover:text-brand-orange transition-colors line-clamp-2 break-words"
                                >
                                  {item.product.name}
                                </Link>

                                {item.product.preOrder && (
                                  <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200/60">
                                    Pre-order
                                  </span>
                                )}
                              </div>

                              {/* Explicit Color + Size formatting (Requirement 10) */}
                              <p className="mt-1.5 text-sm text-gray-500 leading-relaxed">
                                {cartVariation(item).map((part, i) => (
                                  <span key={part.axis}>
                                    {i > 0 && <span className="text-gray-300 mx-1.5">·</span>}
                                    {part.axis}: <strong className="text-gray-600 font-normal">{part.value}</strong>
                                  </span>
                                ))}
                              </p>
                            </div>

                            {/* Remove Item Button with Undo (Requirement 13 & 18) */}
                            <button
                              type="button"
                              onClick={() => handleRemoveWithUndo(item)}
                              className="text-slate-400 hover:text-red-500 transition-colors shrink-0 p-1.5 rounded-lg hover:bg-rose-50 cursor-pointer"
                              title="Remove item from bag"
                              aria-label="Remove item"
                            >
                              <svg
                                viewBox="0 0 24 24"
                                className="w-5 h-5"
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
                        <div className="flex items-center justify-between mt-4 flex-wrap gap-2">
                          <div className="flex items-center gap-2.5">
                            <QuantityStepper
                              value={item.qty}
                              onChange={(v) => updateQuantity(item.cartItemId, v)}
                              min={1}
                              max={Math.max(1, maxStock)}
                            />
                            {isOutOfStock && (
                              <span className="text-xs font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded">
                                Currently unavailable - remove from bag
                              </span>
                            )}
                            {isOverStock && (
                              <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                                Only {item.stock} in stock - lower the quantity
                              </span>
                            )}
                            {isMaxStockReached && (
                              <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                                Max stock ({maxStock})
                              </span>
                            )}
                          </div>

                          <div className="text-right">
                            <span className="text-lg sm:text-xl font-semibold text-brand-orange">
                              {formatPrice(item.product.price * item.qty)}
                            </span>
                            {item.qty > 1 && (
                              <span className="block text-xs text-gray-400">
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
              </section>
            </div>

            {/* Right Column: Order Summary (Requirement 5, 6, 7, 15) */}
            <div className="mt-6 lg:mt-0 lg:sticky lg:top-6 min-w-0">
              <div className="rounded-2xl border border-slate-200/80 bg-white shadow-2xs p-5 md:p-6 space-y-5">
                <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                  <div className="w-11 h-11 rounded-full bg-orange-50 text-brand-orange flex items-center justify-center shrink-0">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="8" y1="13" x2="16" y2="13" />
                      <line x1="8" y1="17" x2="13" y2="17" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 flex-1 whitespace-nowrap">Order Summary</h3>
                  <span className="text-xs font-semibold text-slate-500">
                    {selectedItems.length} of {cartItems.length} selected
                  </span>
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-semibold text-gray-800">
                    {selectedItems.length} {selectedItems.length === 1 ? 'item' : 'items'} selected
                  </p>
                  {selectedItems.length > 0 && (
                    <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 scrollbar-none">
                      {selectedItems.map((item) => {
                        const parts = cartVariation(item)
                        const thumb = item.color?.image || item.product.images?.[0] || ''
                        return (
                          <div key={item.cartItemId} className="py-2.5 flex items-start gap-3">
                            <div className="w-12 h-12 rounded-lg border border-slate-200/80 bg-white flex items-center justify-center shrink-0 overflow-hidden">
                              {thumb ? (
                                <img src={getImageUrl(thumb)} alt="" className="w-full h-full object-contain p-1" />
                              ) : (
                                <ShirtIcon className="w-5 h-5 text-brand-orange opacity-40" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-900 truncate">{item.product.name}</p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {parts.map((part) => `${part.axis}: ${part.value}`).join(' · ')}
                                {parts.length > 0 ? ' • ' : ''}Qty: {item.qty}
                              </p>
                            </div>
                            <p className="text-sm font-semibold text-gray-900 shrink-0">
                              {formatPrice(item.product.price * item.qty)}
                            </p>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="space-y-2.5 text-sm pt-4 border-t border-slate-100">
                  {/* Dynamic Subtotal (Requirement 5) */}
                  <div className="flex justify-between items-center gap-3">
                    <span className="text-gray-700">Items Subtotal</span>
                    <span className="font-semibold text-gray-900">{formatPrice(subtotal)}</span>
                  </div>

                  {/* Shipping = Calculated at checkout (Requirement 7) */}
                  <div className="flex justify-between items-center gap-x-3 gap-y-1.5 flex-wrap">
                    <span className="flex items-center gap-2 text-gray-700 whitespace-nowrap">
                      Shipping Estimate
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 text-slate-400" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 11v5M12 8h.01" />
                      </svg>
                    </span>
                    <span className="font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-full text-xs whitespace-nowrap">
                      Calculated at checkout
                    </span>
                  </div>
                </div>

                {/* Total */}
                <div className="rounded-xl bg-orange-50/80 px-4 py-4 flex items-center justify-between gap-3">
                  <div>
                    <span className="text-lg font-semibold text-gray-900 block">Total</span>
                    <span className="text-xs text-gray-500 sm:whitespace-nowrap">(Excluding final delivery fee)</span>
                  </div>
                  <span className="font-bold text-brand-orange text-2xl shrink-0">
                    {formatPrice(subtotal)}
                  </span>
                </div>

                {/* Desktop Checkout CTA Button */}
                <div className="hidden lg:block space-y-1">
                  <Button
                    disabled={isNoneSelected || hasMixedSelection}
                    onClick={handleCheckout}
                    className={`w-full !h-12 !rounded-xl !text-base font-semibold transition-all ${
                      hasMixedSelection
                        ? 'opacity-60 cursor-not-allowed bg-amber-600'
                        : isNoneSelected
                        ? 'opacity-50 cursor-not-allowed'
                        : ''
                    }`}
                  >
                    {hasMixedSelection
                      ? 'Separate Mixed Items to Checkout'
                      : isNoneSelected
                      ? 'Select Items to Checkout'
                      : `Proceed to Checkout (${selectedItems.length})`}
                  </Button>
                  <button
                    type="button"
                    onClick={() => navigate('/shop')}
                    className="w-full py-2 text-sm font-semibold text-slate-500 hover:text-gray-800 transition-colors cursor-pointer"
                  >
                    Continue Shopping
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Sticky Bottom Bar (Requirement 16: Better mobile selection behavior) */}
      {cartItems.length > 0 && (
        <div className="shopping-bag lg:hidden fixed left-0 right-0 z-40 bg-white border-t border-slate-100 px-4 py-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] md:bottom-24">
          <div className="mx-auto max-w-lg flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={handleToggleSelectAll}
                className="check-plain cart-checkbox cursor-pointer"
                title="Select All"
                aria-label="Select all bag items"
              />
              <div>
                <p className="text-xs text-gray-500 font-semibold uppercase">
                  {selectedItems.length} selected
                </p>
                <span className="text-base font-semibold text-brand-orange block leading-tight">
                  {formatPrice(subtotal)}
                </span>
              </div>
            </div>

            <button
              type="button"
              disabled={isNoneSelected || hasMixedSelection}
              onClick={handleCheckout}
              className={`flex-1 h-11 rounded-lg font-semibold text-sm transition-all px-4 cursor-pointer ${
                hasMixedSelection
                  ? 'bg-amber-500 text-white cursor-not-allowed'
                  : isNoneSelected
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
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

      {/* FLOW-BAG-07: clearing the whole bag is destructive, so it is
          confirmed through the shared dialog instead of window.confirm. */}
      <ConfirmModal
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={confirmClearBag}
        title="Clear entire bag?"
        message="Clear your entire bag? Every item will be removed and this cannot be undone."
        confirmText="Clear bag"
        cancelText="Keep items"
        isDestructive
      />

    </AppShell>
  )
}

export default Cart
