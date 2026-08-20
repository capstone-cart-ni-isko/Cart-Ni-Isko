import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { CartIcon, ShirtIcon } from '../components/ui/Icons.jsx'

function Cart() {
  const navigate = useNavigate()
  const { currentUser } = useAuth()
  const { cartItems, updateQuantity, removeFromCart, subtotal, shipping, tax, total } = useCart()
  const { showToast } = useToast()

  const [deleteTarget, setDeleteTarget] = useState(null)
  const [showLogin, setShowLogin] = useState(false)

  const handleCheckout = () => {
    if (!currentUser) {
      setShowLogin(true)
      return
    }
    navigate('/checkout')
  }

  return (
    <AppShell>
      <PageHeader title="Cart" backTo="/home" />
      <div className="px-4 py-4 pb-36 lg:px-0 lg:py-0 lg:pb-16 animate-fade-in">
        {/* Desktop Page Title */}
        <h1 className="hidden lg:block text-3xl font-black text-gray-900 mb-8">Shopping Cart</h1>
        {cartItems.length === 0 ? (
          <div className="text-center py-20 flex flex-col items-center justify-center">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center border border-gray-100 mb-2">
              <CartIcon className="w-7 h-7 text-gray-400" />
            </div>
            <h3 className="font-bold text-gray-700 mt-3">Your cart is empty</h3>
            <p className="text-sm text-gray-450 mt-1 max-w-[220px] mx-auto">
              Add some BU campus merch to get started!
            </p>
          </div>
        ) : (
          <div className="lg:grid lg:grid-cols-12 lg:gap-6 lg:items-start">
            <div className="lg:col-span-7 space-y-3">
              {cartItems.map((item) => (
                <article key={item.cartItemId} className="bg-white rounded-2xl border border-gray-100 p-4 flex gap-4 shadow-sm">
                  {/* Thumbnail */}
                  <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-orange-50 to-blue-50 flex items-center justify-center shrink-0">
                    <ShirtIcon className="w-8 h-8 text-brand-orange opacity-40" />
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-gray-900 truncate">{item.product.name}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] font-bold text-gray-400 uppercase">{item.size}</span>
                          {item.color && (
                            <>
                              <span className="text-gray-200">·</span>
                              <span
                                className="w-3.5 h-3.5 rounded-full border border-gray-200 inline-block"
                                style={{ backgroundColor: item.color.value }}
                                title={item.color.name}
                              />
                            </>
                          )}
                        </div>
                      </div>

                      {/* Delete button */}
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(item.cartItemId)}
                        className="text-gray-300 hover:text-red-500 transition-colors shrink-0 p-1"
                      >
                        <svg viewBox="0 0 24 24" className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>

                    <div className="flex items-center justify-between mt-3">
                      <QuantityStepper value={item.qty} onChange={(v) => updateQuantity(item.cartItemId, v)} />
                      <span className="text-sm font-black text-brand-orange">{formatPrice(item.product.price * item.qty)}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {/* Order Summary & checkout panel side */}
            <div className="lg:col-span-5 mt-6 lg:mt-0 space-y-4">
              <div className="bg-gray-50 rounded-2xl p-5 space-y-3 border border-gray-100">
                <h3 className="text-sm font-extrabold text-gray-900 uppercase tracking-wider">Order Summary</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span className="font-bold text-gray-800">{formatPrice(subtotal)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Shipping</span><span className="font-bold text-gray-800">{formatPrice(shipping)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Tax (8%)</span><span className="font-bold text-gray-800">{formatPrice(tax)}</span></div>
                  <div className="h-px bg-gray-200 my-1" />
                  <div className="flex justify-between text-base"><span className="font-extrabold text-gray-900">Total</span><span className="font-black text-brand-orange text-lg">{formatPrice(total)}</span></div>
                </div>
              </div>

              {/* Action Button */}
              <div className="fixed bottom-24 left-0 right-0 px-4 md:bottom-28 lg:static lg:px-0 z-30">
                <Button onClick={handleCheckout} className="w-full h-12 rounded-full font-bold shadow-lg text-sm">
                  Proceed to Checkout · {formatPrice(total)}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          removeFromCart(deleteTarget)
          showToast('Item removed from cart')
        }}
        title="Remove Item?"
        message="This item will be removed from your cart."
        confirmText="Remove"
      />

      <LoginPromptModal
        isOpen={showLogin}
        onClose={() => setShowLogin(false)}
        message="Sign in to proceed with checkout."
      />
    </AppShell>
  )
}

export default Cart
