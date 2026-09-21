import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCart } from '../hooks/useCart.js'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from '../hooks/useToast.js'
import AppShell from '../components/layout/AppShell.jsx'
import BottomNav from '../components/layout/BottomNav.jsx'
import Button from '../components/ui/Button.jsx'
import logo from '../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'
import { CheckIcon, TruckIcon } from '../components/ui/Icons.jsx'
import { getImageUrl } from '../utils/imageUtils.js'

function CheckoutPlaceholder() {
  const navigate = useNavigate()
  const { cartItems, selectedItems, clearSelectedItems, clearCart } = useCart()
  const { currentUser } = useAuth()
  const { showToast } = useToast()

  // State: 'review' | 'confirmed'
  const [step, setStep] = useState('review')
  const [fulfillmentType, setFulfillmentType] = useState('Store Pickup')
  const [countdown, setCountdown] = useState(3)

  const itemsToCheckout = selectedItems.length > 0 ? selectedItems : cartItems
  const orderSubtotal = itemsToCheckout.reduce(
    (sum, item) => sum + (item.product?.price || item.price || 0) * (item.qty || 1),
    0
  )
  const shippingFee = fulfillmentType === 'Courier Delivery' ? 50 : 0
  const grandTotal = orderSubtotal + shippingFee

  // Final order placement handler
  const handleFinalPlaceOrder = () => {
    if (clearSelectedItems) {
      clearSelectedItems()
    } else {
      clearCart()
    }
    showToast('Order confirmed! Redirecting to your orders...', 'success')
    setStep('confirmed')
  }

  // Countdown timer when step === 'confirmed'
  useEffect(() => {
    if (step !== 'confirmed') return

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          navigate('/orders')
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [step, navigate])

  return (
    <AppShell showNav={false}>
      {step === 'review' ? (
        /* ── STEP 1: ORDER CONFIRMATION / REVIEW VIEW ── */
        <div className="min-h-dvh flex flex-col items-center justify-center p-4 pb-28 md:p-8 animate-fade-in bg-slate-50/60">
          <div className="w-full max-w-xl bg-white rounded-xl p-6 md:p-8 border border-slate-100 space-y-6">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <img src={logo} alt="Tindahan ni Isko" className="h-8 object-contain" />
                <div>
                  <h1 className="text-xl font-bold text-gray-900 leading-tight">Review &amp; Confirm Order</h1>
                  <p className="text-sm text-gray-500">Please review your order details before placing</p>
                </div>
              </div>
              <span className="text-xs font-semibold px-3 py-1 bg-orange-50 text-brand-orange rounded-full">
                Step 2 of 2
              </span>
            </div>

            {/* Customer & Fulfillment Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="p-3.5 bg-slate-50 rounded-lg space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Customer Details</p>
                <p className="font-bold text-gray-900">{currentUser?.fullName || 'Juan Dela Cruz'}</p>
                <p className="text-gray-500">{currentUser?.email || 'jdcruz@student.u.edu.ph'}</p>
                <p className="text-gray-500 font-mono">ID: {currentUser?.studentId || '2020-1234-5678'}</p>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-lg space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Fulfillment Method</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFulfillmentType('Store Pickup')}
                    className={`flex-1 py-1.5 px-2 rounded-md font-semibold text-xs border transition-colors cursor-pointer ${
                      fulfillmentType === 'Store Pickup'
                        ? 'bg-brand-orange text-white border-brand-orange'
                        : 'bg-white text-gray-600 border-slate-200'
                    }`}
                  >
                    Store Pickup
                  </button>
                  <button
                    type="button"
                    onClick={() => setFulfillmentType('Courier Delivery')}
                    className={`flex-1 py-1.5 px-2 rounded-md font-semibold text-xs border transition-colors cursor-pointer ${
                      fulfillmentType === 'Courier Delivery'
                        ? 'bg-brand-orange text-white border-brand-orange'
                        : 'bg-white text-gray-600 border-slate-200'
                    }`}
                  >
                    Courier Delivery
                  </button>
                </div>
                <p className="text-xs text-gray-500 pt-0.5">
                  {fulfillmentType === 'Store Pickup'
                    ? 'Pickup at BU Main Campus Student Center'
                    : 'Courier delivery to registered address (+₱50)'}
                </p>
              </div>
            </div>

            {/* Itemized Order Review List */}
            <div className="space-y-2">
              <p className="text-sm font-bold text-gray-900 flex items-center justify-between">
                <span>Order Items ({itemsToCheckout.length})</span>
                <button
                  type="button"
                  onClick={() => navigate('/cart')}
                  className="text-brand-orange text-xs font-semibold hover:underline cursor-pointer"
                >
                  Edit Items
                </button>
              </p>
              <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 rounded-lg px-3 py-1 bg-slate-50 scrollbar-none">
                {itemsToCheckout.map((item, idx) => {
                  const product = item.product || item
                  const itemPrice = Number(product.price || item.price || 0)
                  const itemQty = Number(item.qty || 1)
                  return (
                    <div key={idx} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={getImageUrl(item.color?.image || product.images?.[0] || product.image)}
                          alt={product.name}
                          className="w-10 h-10 rounded-md object-contain bg-white p-1 shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="font-bold text-gray-900 truncate">{product.name}</p>
                          <p className="text-xs text-gray-500">Qty: {itemQty} • ₱{itemPrice.toFixed(2)} each</p>
                        </div>
                      </div>
                      <p className="font-bold text-gray-900 shrink-0">₱{(itemPrice * itemQty).toFixed(2)}</p>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Price Breakdown */}
            <div className="p-4 bg-orange-50/60 rounded-lg space-y-1.5 text-sm">
              <div className="flex justify-between text-gray-600 font-medium">
                <span>Items Subtotal</span>
                <span>₱{orderSubtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-600 font-medium">
                <span>Fulfillment Fee</span>
                <span>{shippingFee > 0 ? `₱${shippingFee.toFixed(2)}` : 'FREE (Pickup)'}</span>
              </div>
              <div className="flex justify-between items-baseline text-sm font-bold text-gray-900 pt-2 border-t border-orange-200/60">
                <span>Grand Total</span>
                <span className="text-lg font-bold text-brand-orange">₱{grandTotal.toFixed(2)}</span>
              </div>
            </div>

            {/* Confirmation Decision Buttons */}
            <div className="space-y-2 pt-2">
              <Button
                onClick={handleFinalPlaceOrder}
                className="w-full py-3.5 rounded-lg font-bold text-sm bg-brand-orange hover:bg-brand-orange-dark text-white active:scale-98 transition-all cursor-pointer"
              >
                Confirm &amp; Place Order • ₱{grandTotal.toFixed(2)}
              </Button>
              <button
                type="button"
                onClick={() => navigate('/cart')}
                className="w-full py-2.5 text-sm font-semibold text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"
              >
                Back to Bag / Cancel
              </button>
            </div>

          </div>
        </div>
      ) : (
        /* ── STEP 2: ORDER PLACED SUCCESS VIEW ── */
        <div className="min-h-dvh flex flex-col items-center justify-center p-6 pb-28 text-center animate-fade-in">
          <div className="w-20 h-20 bg-orange-50 rounded-xl flex items-center justify-center p-2.5 mb-4 relative">
            <img src={logo} alt="Tindahan ni Isko" className="w-14 h-14 object-contain" />
            <div className="absolute -top-1.5 -right-1.5 bg-brand-orange text-white p-1 rounded-full">
              <CheckIcon className="w-4 h-4 text-white" />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-1">Order Placed!</h1>
          <p className="text-sm text-gray-600 font-normal max-w-[360px] leading-relaxed mb-3">
            Your order has been confirmed. We'll notify you via SMS/Email when it's ready for pick-up or out for courier delivery.
          </p>

          {/* Dynamic countdown indicator */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-orange-50 text-brand-orange text-sm font-semibold rounded-lg mb-6">
            <span>Redirecting to your orders in {countdown}s...</span>
          </div>

          <div className="w-full max-w-xs space-y-2">
            <Button onClick={() => navigate('/orders')} className="w-full h-11 rounded-lg font-bold text-sm cursor-pointer">
              View My Orders Now
            </Button>
            <button
              type="button"
              onClick={() => navigate('/home')}
              className="w-full text-sm font-semibold text-gray-500 hover:text-brand-orange transition-colors py-1 cursor-pointer"
            >
              Continue Shopping
            </button>
          </div>
        </div>
      )}

      {/* Keep the mobile bottom navigation visible on the confirmation view */}
      <BottomNav />
    </AppShell>
  )
}

export default CheckoutPlaceholder