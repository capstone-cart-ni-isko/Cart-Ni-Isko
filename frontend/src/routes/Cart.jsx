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
import { CartIcon, ShirtIcon, AlertTriangleIcon, TruckIcon } from '../components/ui/Icons.jsx'
import { getImageUrl } from '../utils/imageUtils.js'
import { addCustomerOrder } from '../utils/orderStorage.js'

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
    clearSelectedItems,
    clearCart,
    subtotal,
  } = useCart()
  const { showToast } = useToast()

  const [showLogin, setShowLogin] = useState(false)
  const [showConfirmOrderModal, setShowConfirmOrderModal] = useState(false)
  const [fulfillmentType, setFulfillmentType] = useState('Store Pickup')

  // Mixed order classification (Requirement 8 & 9)
  const regularSelected = selectedItems.filter((i) => !i.product.preOrder)
  const preorderSelected = selectedItems.filter((i) => i.product.preOrder)
  const hasMixedSelection = regularSelected.length > 0 && preorderSelected.length > 0
  const isNoneSelected = selectedItems.length === 0

  const shippingFee = fulfillmentType === 'Courier Delivery' ? 50 : 0
  const grandTotal = subtotal + shippingFee

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
    setShowConfirmOrderModal(true)
  }

  const [orderSuccessId, setOrderSuccessId] = useState(null)
  const [selectedAddressIdx, setSelectedAddressIdx] = useState(0)

  const savedAddresses = [
    { id: 1, label: 'Home', line: '123 Mayon St., Legazpi City, Albay', default: true },
    { id: 2, label: 'Dorm', line: '45 BU Campus Drive, Legazpi City, Albay', default: false },
  ]

  const handleConfirmOrder = () => {
    setShowConfirmOrderModal(false)
    const firstItem = selectedItems[0]
    const deliveryAddress = fulfillmentType === 'Courier Delivery'
      ? savedAddresses[selectedAddressIdx]?.line || (currentUser?.address || 'Door-to-door delivery · Legazpi City, Albay')
      : null
    const newOrder = addCustomerOrder({
      productId: firstItem?.product?.id || 'prod-1',
      name: firstItem?.product?.name || 'BU Merchandise',
      price: firstItem?.product?.price || 500,
      qty: firstItem?.quantity || 1,
      size: firstItem?.size || 'Standard',
      color: firstItem?.color || { name: 'Default', value: '#1E3A8A' },
      image: firstItem?.product?.images?.[0] || null,
      type: firstItem?.product?.preOrder ? 'pre-order' : 'processing',
      status: firstItem?.product?.preOrder ? 'IN PRODUCTION' : 'PROCESSING',
      statusContext: fulfillmentType === 'Courier Delivery'
        ? 'Order placed. Review Lalamove quote and pay delivery fee to lock delivery.'
        : 'Order confirmed and scheduled for store pickup.',
      fulfillment: {
        method: fulfillmentType,
        location: fulfillmentType === 'Courier Delivery'
          ? (deliveryAddress || 'Door-to-door delivery · Legazpi City, Albay')
          : 'Tindahan ni Isko · BU Student Center Ground Floor',
        note: fulfillmentType === 'Courier Delivery'
          ? 'Lalamove quote generated. Delivery fee pending payment.'
          : 'Bring your student ID or order QR pass when claiming.',
      },
      recipient: currentUser?.name || 'Alyssa B.',
      phone: currentUser?.phone || '09123456789',
      campus: currentUser?.campus || 'Main Campus',
      college: currentUser?.college || 'College of Science',
      course: currentUser?.course || 'BS Computer Science',
    })
    if (clearSelectedItems) {
      clearSelectedItems()
    } else {
      clearCart()
    }
    showToast('Order placed successfully!', 'success')
    setOrderSuccessId(newOrder?.id || 'ORD-NEW')
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

  if (orderSuccessId) {
    return (
      <AppShell>
        <div className="min-h-[60vh] flex items-center justify-center px-4 py-12 animate-fade-in">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full border border-gray-100 shadow-lg text-center space-y-5">
            {/* Success checkmark */}
            <div className="w-16 h-16 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center mx-auto">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 text-emerald-500">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>

            <div className="space-y-1">
              <h2 className="text-xl font-black text-gray-900">Order Placed!</h2>
              <p className="text-sm text-gray-500">Your order has been successfully placed and is now being processed.</p>
              <p className="text-xs font-mono text-gray-400 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 inline-block mt-1">
                Order #{orderSuccessId}
              </p>
            </div>

            <div className="p-3 bg-orange-50 rounded-2xl border border-orange-100 text-xs text-left space-y-0.5">
              <p className="font-bold text-gray-800">Fulfillment</p>
              <p className="text-gray-600">{fulfillmentType}</p>
              {fulfillmentType === 'Store Pickup' && (
                <p className="text-gray-400">Tindahan ni Isko · BU Student Center Ground Floor</p>
              )}
              {fulfillmentType === 'Courier Delivery' && (
                <p className="text-gray-400">You will be notified once the Lalamove quote is ready.</p>
              )}
            </div>

            <div className="flex flex-col gap-2.5">
              <Link
                to="/orders"
                className="w-full py-3 rounded-2xl bg-brand-orange text-white font-black text-sm hover:bg-orange-600 transition-colors flex items-center justify-center gap-2"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                  <path d="m3.27 6.96 8.73 5.05 8.73-5.05" /><path d="M12 22.08V12" />
                </svg>
                View My Orders
              </Link>
              <Link
                to="/shop"
                className="w-full py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm hover:bg-gray-200 transition-colors"
              >
                Continue Shopping
              </Link>
            </div>
          </div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell showBottomNav={false}>

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

      <div className="px-4 py-4 pb-36 lg:px-4 lg:py-6 lg:pb-16 animate-fade-in max-w-7xl mx-auto">
        {/* Desktop Top Nav & Page Title (Requirement 17: Item count beside Shopping Cart) */}
        <div className="hidden lg:flex items-center justify-between mb-8 pb-2 border-b border-slate-200">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-bold text-gray-600 hover:text-brand-orange hover:border-brand-orange bg-white transition-all shadow-2xs cursor-pointer"
              title="Go back to previous page"
              aria-label="Go back"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span>Go Back</span>
            </button>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl lg:text-4xl font-black text-gray-900 tracking-tight">Shopping Cart</h1>
              <span className="px-3 py-1 rounded-full bg-orange-100 text-brand-orange text-xs font-black">
                {cartItems.length} {cartItems.length === 1 ? 'item' : 'items'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate('/shop')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-50 hover:bg-orange-100 text-brand-orange font-bold text-xs transition-colors cursor-pointer"
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
          <div className="text-center py-12 flex flex-col items-center justify-center bg-white rounded-lg border border-slate-200 p-6">
            <div className="w-12 h-12 bg-slate-50 rounded-md flex items-center justify-center border border-slate-200 mb-2">
              <CartIcon className="w-5 h-5 text-slate-400" />
            </div>
            <h3 className="font-bold text-gray-800 mt-2 text-base">Your cart is empty</h3>
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
          <div className="lg:grid lg:grid-cols-12 lg:gap-6 lg:items-start">
            {/* Left Column: Selection Bar + Cart Items List */}
            <div className="lg:col-span-7 space-y-3">
              {/* Mixed Items Guard Banner (Requirement 8 & 9) */}
              {hasMixedSelection && (
                <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-900 animate-slide-up">
                  <div className="flex items-start gap-2">
                    <AlertTriangleIcon className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <div className="space-y-1 flex-1">
                      <h4 className="font-bold text-amber-950">
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
              <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center justify-between select-none shadow-2xs">
                <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={handleToggleSelectAll}
                    className="w-5 h-5 rounded text-brand-orange accent-brand-orange cursor-pointer"
                    title="Select or deselect all items in cart"
                    aria-label="Select all cart items"
                  />
                  <span>Select All ({cartItems.length} {cartItems.length === 1 ? 'item' : 'items'})</span>
                </label>

                <span className="text-xs font-bold text-brand-orange bg-orange-50 border border-orange-200 px-3 py-1 rounded-md">
                  {selectedItems.length} selected
                </span>
              </div>

              {/* Cart Items List */}
              <div className="space-y-3.5">
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
                      className={`rounded-xl border p-4 sm:p-5 transition-colors flex gap-4 select-none ${
                        isChecked
                          ? 'border-brand-orange/50 bg-orange-50/15'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      {/* Item Checkbox (Requirement 1 & 18) */}
                      <div className="flex items-center pt-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectItem(item.cartItemId)}
                          className="w-5 h-5 rounded text-brand-orange accent-brand-orange cursor-pointer"
                          title={isChecked ? 'Uncheck item' : 'Check item to include in checkout'}
                          aria-label={`Select ${item.product.name}`}
                        />
                      </div>

                      {/* Actual Product / Variant Image (Requirement 11) */}
                      <Link
                        to={`/product/${item.product.id}`}
                        className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-white border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden relative group"
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
                                  className="text-base sm:text-lg font-bold text-gray-900 hover:text-brand-orange transition-colors truncate block"
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
                              <div className="flex items-center gap-2.5 mt-1.5 text-sm text-gray-500 flex-wrap">
                                {item.size && item.size !== 'One Size' && (
                                  <span>
                                    Size: <strong className="text-gray-800 font-semibold">{item.size}</strong>
                                  </span>
                                )}
                                {item.size && item.size !== 'One Size' && item.color && (
                                  <span className="text-gray-300">·</span>
                                )}
                                {item.color && (
                                  <span className="flex items-center gap-1.5">
                                    Color:{' '}
                                    <span
                                      className="w-3.5 h-3.5 rounded-full border border-gray-300 inline-block shrink-0"
                                      style={{ backgroundColor: item.color.value }}
                                      title={item.color.name}
                                    />
                                    <strong className="text-gray-800 font-semibold">{item.color.name}</strong>
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Remove Item Button with Undo (Requirement 13 & 18) */}
                            <button
                              type="button"
                              onClick={() => handleRemoveWithUndo(item)}
                              className="text-gray-400 hover:text-red-500 transition-colors shrink-0 p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer"
                              title="Remove item from cart"
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
                        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100 flex-wrap gap-2">
                          <div className="flex items-center gap-2.5">
                            <QuantityStepper
                              value={item.qty}
                              onChange={(v) => updateQuantity(item.cartItemId, v)}
                              min={1}
                              max={maxStock}
                            />
                            {isMaxStockReached && (
                              <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                                Max stock ({maxStock})
                              </span>
                            )}
                          </div>

                          <div className="text-right">
                            <span className="text-base sm:text-lg font-black text-brand-orange">
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
            </div>

            {/* Right Column: Order Summary (Requirement 5, 6, 7, 15) */}
            <div className="lg:col-span-5 mt-6 lg:mt-0 space-y-4">
              <div className="bg-white rounded-xl p-6 space-y-4 border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                    Order Summary
                  </h3>
                  <span className="text-xs font-semibold text-gray-500">
                    {selectedItems.length} of {cartItems.length} selected
                  </span>
                </div>

                <div className="space-y-3 text-sm">
                  {/* Dynamic Subtotal (Requirement 5) */}
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 font-medium">Selected Subtotal</span>
                    <span className="font-bold text-gray-900 text-base">{formatPrice(subtotal)}</span>
                  </div>

                  {/* Shipping = Calculated at checkout (Requirement 7) */}
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 font-medium">Shipping Estimate</span>
                    <span className="font-semibold text-gray-700 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-md text-xs">
                      Calculated at checkout
                    </span>
                  </div>

                  <div className="h-px bg-slate-200 my-2" />

                  {/* Total */}
                  <div className="flex justify-between items-baseline">
                    <div>
                      <span className="text-base font-bold text-gray-900 block">Total</span>
                      <span className="text-xs text-gray-400 font-normal">
                        (Excluding final delivery fee)
                      </span>
                    </div>
                    <span className="font-black text-brand-orange text-2xl">
                      {formatPrice(subtotal)}
                    </span>
                  </div>
                </div>

                {/* Fulfillment note (Requirement 15) */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 text-xs text-gray-600 space-y-1.5 leading-relaxed">
                  <p className="flex items-center gap-2 font-bold text-gray-800">
                    <TruckIcon className="w-4 h-4 text-brand-orange shrink-0" />
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
                    className={`w-full h-12 rounded-xl font-bold text-sm sm:text-base transition-all ${
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
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Sticky Bottom Bar (Requirement 16: Better mobile selection behavior) */}
      {cartItems.length > 0 && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 px-4 py-3 safe-bottom shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
          <div className="mx-auto max-w-lg flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={handleToggleSelectAll}
                className="w-5 h-5 rounded text-brand-orange accent-brand-orange cursor-pointer"
                title="Select All"
                aria-label="Select all cart items"
              />
              <div>
                <p className="text-[11px] text-gray-500 font-bold uppercase">
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
              className={`flex-1 h-11 rounded-xl font-bold text-xs sm:text-sm transition-all px-4 cursor-pointer ${
                hasMixedSelection
                  ? 'bg-amber-500 text-white cursor-not-allowed'
                  : isNoneSelected
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-brand-orange hover:bg-brand-orange-dark text-white active:scale-98 shadow-sm'
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

      {/* ── CUSTOMER ORDER CONFIRMATION MODAL ── */}
      {showConfirmOrderModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
          <div className="bg-white rounded-2xl md:rounded-3xl p-5 md:p-7 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-100 space-y-4 animate-scale-in">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="text-base font-black text-gray-900">Review &amp; Confirm Order</h3>
                <p className="text-xs text-gray-500">Please verify your items and fulfillment details</p>
              </div>
              <button
                type="button"
                onClick={() => setShowConfirmOrderModal(false)}
                className="p-1 text-gray-400 hover:text-gray-700 rounded-lg cursor-pointer"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Customer info & Fulfillment selector */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div className="p-3 bg-gray-50/80 rounded-2xl border border-gray-100 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Recipient</p>
                <p className="font-bold text-gray-900 truncate">{currentUser?.fullName || 'Juan Dela Cruz'}</p>
                <p className="text-gray-500 truncate">{currentUser?.email || 'jdcruz@student.u.edu.ph'}</p>
                <p className="text-gray-400 font-mono text-[11px]">ID: {currentUser?.studentId || '2020-1234-5678'}</p>
              </div>

              <div className="p-3 bg-gray-50/80 rounded-2xl border border-gray-100 space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Fulfillment Method</p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setFulfillmentType('Store Pickup')}
                    className={`flex-1 py-1 px-1.5 rounded-xl font-bold text-[11px] border transition-all cursor-pointer ${
                      fulfillmentType === 'Store Pickup'
                        ? 'bg-brand-orange text-white border-brand-orange shadow-2xs'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    Store Pickup
                  </button>
                  <button
                    type="button"
                    onClick={() => setFulfillmentType('Courier Delivery')}
                    className={`flex-1 py-1 px-1.5 rounded-xl font-bold text-[11px] border transition-all cursor-pointer ${
                      fulfillmentType === 'Courier Delivery'
                        ? 'bg-brand-orange text-white border-brand-orange shadow-2xs'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    Delivery
                  </button>
                </div>
                <p className="text-[10px] text-gray-500 truncate">
                  {fulfillmentType === 'Store Pickup' ? 'BU Main Campus Center' : 'Courier delivery (+\u20b150)'}
                </p>
              </div>
            </div>

            {/* Delivery Address Selector — shown only when Courier Delivery is selected */}
            {fulfillmentType === 'Courier Delivery' && (
              <div className="space-y-1.5 text-xs">
                <p className="font-bold text-gray-900">Delivery Address</p>
                <div className="space-y-1.5">
                  {savedAddresses.map((addr, idx) => (
                    <button
                      key={addr.id}
                      type="button"
                      onClick={() => setSelectedAddressIdx(idx)}
                      className={`w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer ${
                        selectedAddressIdx === idx
                          ? 'border-brand-orange bg-orange-50/60'
                          : 'border-gray-200 bg-white hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          selectedAddressIdx === idx ? 'border-brand-orange' : 'border-gray-300'
                        }`}>
                          {selectedAddressIdx === idx && (
                            <div className="w-1.5 h-1.5 rounded-full bg-brand-orange" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-gray-800">{addr.label}</span>
                          {addr.default && <span className="ml-1.5 text-[9px] font-bold text-brand-orange bg-orange-50 border border-orange-200 px-1 py-0.5 rounded uppercase">Default</span>}
                          <p className="text-gray-500 text-[11px] truncate mt-0.5">{addr.line}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Selected Items List */}
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-gray-900">Items to Order ({selectedItems.length})</p>
              <div className="max-h-44 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-2xl px-3 py-1 bg-white scrollbar-none">
                {selectedItems.map((item, idx) => {
                  const product = item.product || item
                  const itemPrice = Number(product.price || item.price || 0)
                  const itemQty = Number(item.qty || 1)
                  const variantText = [item.size, item.color?.name].filter(Boolean).join(' • ')
                  return (
                    <div key={idx} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={getImageUrl(product.image)}
                          alt={product.name}
                          className="w-9 h-9 rounded-lg object-contain bg-gray-50 p-1 shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="font-bold text-gray-900 truncate">{product.name}</p>
                          <p className="text-[10px] text-gray-400">
                            {itemQty}x {variantText ? `• ${variantText}` : ''} • ₱{itemPrice.toFixed(2)}
                          </p>
                        </div>
                      </div>
                      <p className="font-black text-gray-900 shrink-0">₱{(itemPrice * itemQty).toFixed(2)}</p>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Totals Breakdown */}
            <div className="p-3.5 bg-orange-50/60 rounded-2xl border border-orange-100 space-y-1 text-xs">
              <div className="flex justify-between text-gray-600 font-medium">
                <span>Items Subtotal</span>
                <span>₱{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-600 font-medium">
                <span>Fulfillment Fee</span>
                <span>{shippingFee > 0 ? `₱${shippingFee.toFixed(2)}` : 'FREE (Pickup)'}</span>
              </div>
              <div className="flex justify-between text-sm font-black text-gray-900 pt-1.5 border-t border-orange-200/60">
                <span>Grand Total</span>
                <span className="text-base font-black text-brand-orange">₱{grandTotal.toFixed(2)}</span>
              </div>
            </div>

            {/* Confirmation Decision Buttons */}
            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setShowConfirmOrderModal(false)}
                className="flex-1 py-3 text-xs font-bold text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors cursor-pointer"
              >
                Back to Cart
              </button>
              <Button
                onClick={handleConfirmOrder}
                className="flex-1 py-3 rounded-xl font-black text-xs bg-brand-orange hover:bg-orange-600 text-white shadow-md active:scale-98 transition-all cursor-pointer"
              >
                Confirm &amp; Place Order
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}

export default Cart
