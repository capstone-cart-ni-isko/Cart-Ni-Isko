import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCart } from '../hooks/useCart.js'
import { useToast } from '../hooks/useToast.js'
import AppShell from '../components/layout/AppShell.jsx'
import Button from '../components/ui/Button.jsx'
import logo from '../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'
import { SparklesIcon } from '../components/ui/Icons.jsx'

function CheckoutPlaceholder() {
  const navigate = useNavigate()
  const { clearSelectedItems, clearCart } = useCart()
  const { showToast } = useToast()
  const [countdown, setCountdown] = useState(3)

  useEffect(() => {
    if (clearSelectedItems) {
      clearSelectedItems()
    } else {
      clearCart()
    }
    showToast('Order confirmed! Redirecting to your orders...', 'success')
  }, [clearSelectedItems, clearCart, showToast])

  useEffect(() => {
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
  }, [navigate])

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
        <p className="text-sm text-gray-600 font-medium max-w-[340px] leading-relaxed mb-4">
          Your order has been confirmed. We'll notify you via SMS/Email when it's ready for pick-up or out for courier delivery.
        </p>

        {/* Dynamic countdown indicator */}
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-50 border border-orange-200 text-brand-orange text-xs font-bold rounded-full mb-8 animate-pulse">
          <span>Redirecting to your orders in {countdown}s...</span>
        </div>

        <div className="w-full max-w-xs space-y-3">
          <Button onClick={() => navigate('/orders')} className="w-full h-12 rounded-full font-bold shadow-md cursor-pointer">
            View My Orders Now
          </Button>
          <button
            type="button"
            onClick={() => navigate('/home')}
            className="w-full text-sm font-bold text-gray-500 hover:text-brand-orange transition-colors py-2 cursor-pointer"
          >
            Continue Shopping
          </button>
        </div>
      </div>
    </AppShell>
  )
}

export default CheckoutPlaceholder
