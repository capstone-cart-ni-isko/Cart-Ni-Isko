import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useCart } from '../hooks/useCart.js'
import { useWishlist } from '../hooks/useWishlist.js'
import { useToast } from '../hooks/useToast.js'
import AppShell from '../components/layout/AppShell.jsx'
import QuantityStepper from '../components/ui/QuantityStepper.jsx'
import PriceTag from '../components/ui/PriceTag.jsx'
import StatusBadge from '../components/ui/StatusBadge.jsx'
import LoginPromptModal from '../components/ui/LoginPromptModal.jsx'
import productsData from '../data/products.json'
import backIcon from '../assets/icons/common/back.svg'
import { ShirtIcon } from '../components/ui/Icons.jsx'
import { getImageUrl } from '../utils/imageUtils.js'

function ProductDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { currentUser } = useAuth()
  const { addToCart } = useCart()
  const { toggleWishlist, isInWishlist } = useWishlist()
  const { showToast } = useToast()

  const product = productsData.find((p) => p.id === id)

  const [selectedSize, setSelectedSize] = useState(product?.sizes?.[0] || '')
  const [selectedColor, setSelectedColor] = useState(product?.colors?.[0] || null)
  const [qty, setQty] = useState(1)
  const [showLoginModal, setShowLoginModal] = useState(false)

  if (!product) {
    return (
      <AppShell showNav={true}>
        <div className="flex flex-col items-center justify-center min-h-[50vh] p-6 text-center animate-fade-in">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-100">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7 text-gray-400">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <h2 className="text-xl font-black text-gray-900">Product not found</h2>
          <p className="text-sm text-gray-500 mt-2">This item may have been removed or doesn't exist.</p>
          <button onClick={() => navigate('/shop')} className="mt-6 text-brand-orange font-bold text-sm hover:underline">
            Browse Shop
          </button>
        </div>
      </AppShell>
    )
  }

  const isSaved = isInWishlist(product.id)

  const handleAddToCart = () => {
    if (!currentUser) {
      setShowLoginModal(true)
      return
    }
    addToCart(product, qty, selectedSize, selectedColor)
    showToast('Added to cart!')
  }

  const handleWishlistToggle = () => {
    if (!currentUser) {
      setShowLoginModal(true)
      return
    }
    toggleWishlist(product)
    showToast(isSaved ? 'Removed from wishlist' : 'Saved to wishlist!')
  }

  return (
    <AppShell showNav={true}>
      <div className="pb-28 md:pb-12 animate-fade-in">
        {/* Desktop Breadcrumbs */}
        <div className="hidden md:flex items-center gap-2 text-xs font-semibold text-gray-400 mb-6">
          <Link to="/home" className="hover:text-brand-orange">Home</Link>
          <span>/</span>
          <Link to="/shop" className="hover:text-brand-orange">Shop</Link>
          <span>/</span>
          <span className="text-gray-700 font-bold">{product.name}</span>
        </div>

        {/* Product Layout Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-start">
          {/* Image Area */}
          <div className="relative aspect-square w-full bg-gradient-to-br from-orange-50 via-blue-50 to-orange-100 rounded-3xl overflow-hidden flex items-center justify-center">
            {/* Back button (Mobile only) */}
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="md:hidden absolute top-4 left-4 z-10 w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-md active:scale-95 transition-transform"
            >
              <img src={backIcon} alt="Back" className="w-5 h-5" />
            </button>

            {/* Wishlist heart */}
            <button
              type="button"
              onClick={handleWishlistToggle}
              className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-md active:scale-95 transition-transform cursor-pointer"
            >
              <svg viewBox="0 0 24 24" className={`w-5 h-5 ${isSaved ? 'text-red-500 fill-red-500' : 'text-gray-500'}`} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
              </svg>
            </button>

            {product.preOrder && (
              <div className="absolute top-4 left-4 md:left-6 z-10">
                <StatusBadge status="For Pre-order" />
              </div>
            )}

            {product.images && product.images[0] ? (
              <img
                src={getImageUrl(product.images[0])}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <ShirtIcon className="w-28 h-28 md:w-36 md:h-36 text-brand-orange opacity-40 filter drop-shadow-md" />
            )}
          </div>

          {/* Details */}
          <div className="px-1 md:px-0 space-y-6">
            <div>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{product.category}</span>
              <h1 className="text-2xl md:text-3xl font-black text-gray-900 mt-1 leading-tight">{product.name}</h1>
              <PriceTag amount={product.price} className="text-2xl mt-3 block font-black text-brand-orange" />
            </div>

            <p className="text-sm md:text-base text-gray-500 leading-relaxed">{product.description}</p>

            {/* Size Selector */}
            {product.sizes.length > 0 && product.sizes[0] !== 'One Size' && product.sizes[0] !== 'Pack of 5' && product.sizes[0] !== 'Pack of 3' && (
              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Select Size</h3>
                <div className="flex gap-2.5 flex-wrap">
                  {product.sizes.map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => setSelectedSize(sz)}
                      className={`px-5 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        selectedSize === sz
                          ? 'bg-brand-orange text-white border-brand-orange shadow-sm'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Color Selector */}
            {product.colors.length > 1 && (
              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                  Color: <span className="text-gray-700 font-bold">{selectedColor?.name}</span>
                </h3>
                <div className="flex gap-3">
                  {product.colors.map((c) => (
                    <button
                      key={c.name}
                      type="button"
                      onClick={() => setSelectedColor(c)}
                      className={`w-10 h-10 rounded-full border-2 transition-all cursor-pointer ${
                        selectedColor?.name === c.name ? 'ring-2 ring-brand-orange ring-offset-2 border-brand-orange' : 'border-gray-200'
                      }`}
                      style={{ backgroundColor: c.value }}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Quantity */}
            <div>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Quantity</h3>
              <QuantityStepper value={qty} onChange={setQty} />
            </div>

            {/* Desktop Add to Cart Button */}
            <div className="hidden md:block pt-4">
              <button
                type="button"
                onClick={handleAddToCart}
                className="w-full h-13 bg-brand-orange hover:bg-brand-orange-dark text-white font-bold rounded-2xl shadow-md hover:shadow-lg active:scale-98 transition-all text-base cursor-pointer"
              >
                {product.preOrder ? 'Pre-order Now' : 'Add to Cart'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Bottom Bar (Mobile only) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-100 p-4 safe-bottom shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
        <div className="mx-auto max-w-lg flex items-center gap-3">
          <div className="flex-1">
            <p className="text-[10px] text-gray-400 font-bold uppercase">Total</p>
            <PriceTag amount={product.price * qty} className="text-lg" />
          </div>
          <button
            type="button"
            onClick={handleAddToCart}
            className="flex-1 h-12 bg-brand-orange hover:bg-brand-orange-dark text-white font-bold rounded-full shadow-md hover:shadow-lg active:scale-98 transition-all text-sm"
          >
            {product.preOrder ? 'Pre-order Now' : 'Add to Cart'}
          </button>
        </div>
      </div>

      <LoginPromptModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        message="Sign in to add items to your cart and checkout your BU campus merch."
      />
    </AppShell>
  )
}

export default ProductDetail
