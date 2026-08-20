import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCart } from '../hooks/useCart.js'
import AppShell from '../components/layout/AppShell.jsx'
import Button from '../components/ui/Button.jsx'
import logo from '../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'

import { SparklesIcon } from '../components/ui/Icons.jsx'

function CheckoutPlaceholder() {
  const navigate = useNavigate()
  const { clearCart } = useCart()

  useEffect(() => {
    clearCart()
  }, [])

  return (
    <AppShell showNav={false}>
      <div className="min-h-dvh flex flex-col items-center justify-center p-8 text-center animate-fade-in">
        <div className="w-28 h-28 bg-brand-orange/10 rounded-full flex items-center justify-center p-4 mb-6 shadow-inner relative">
          <img src={logo} alt="Tindahan ni Isko" className="w-20 h-20 object-contain animate-bounce" />
          <div className="absolute -top-1 -right-1 bg-white p-1.5 rounded-full shadow-md">
            <SparklesIcon className="w-5 h-5 text-brand-orange" />
          </div>
        </div>

        <h1 className="text-3xl font-black text-gray-900 mb-2">Order Placed!</h1>
        <p className="text-sm text-gray-500 font-medium max-w-[280px] leading-relaxed mb-8">
          Your order has been confirmed. We'll notify you when it's ready for pick-up at the BU campus store.
        </p>

        <div className="w-full max-w-xs space-y-3">
          <Button onClick={() => navigate('/orders')} className="w-full h-12 rounded-full font-bold shadow-md">
            View My Orders
          </Button>
          <button
            type="button"
            onClick={() => navigate('/home')}
            className="w-full text-sm font-bold text-gray-400 hover:text-brand-orange transition-colors py-2"
          >
            Continue Shopping
          </button>
        </div>
      </div>
    </AppShell>
  )
}

export default CheckoutPlaceholder
