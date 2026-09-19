import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.js'
import { useWishlist } from '../../hooks/useWishlist.js'
import PriceTag from './PriceTag.jsx'
import LoginPromptModal from './LoginPromptModal.jsx'
import { ShirtIcon } from './Icons.jsx'
import { getImageUrl } from '../../utils/imageUtils.js'

function ProductCard({ product }) {
  const { currentUser } = useAuth()
  const { toggleWishlist, isInWishlist } = useWishlist()
  const [showLoginModal, setShowLoginModal] = useState(false)

  const isSaved = isInWishlist(product.id)

  const handleWishlistClick = (e) => {
    e.preventDefault()
    e.stopPropagation() // stops navigating to detail page

    if (!currentUser) {
      setShowLoginModal(true)
      return
    }

    toggleWishlist(product)
  }

  // Resolve image URL via Vite glob
  const resolvedImage = product.images && product.images[0] ? getImageUrl(product.images[0]) : null
  const hasValidImage = !!resolvedImage

  return (
    <>
      <Link
        to={`/product/${product.id}`}
        className="block bg-white rounded-lg border border-slate-200 overflow-hidden hover:border-slate-300 transition-colors select-none relative group"
      >
        {/* Product image container */}
        <div className="aspect-square w-full bg-white relative overflow-hidden flex items-center justify-center border-b border-slate-200">
          {hasValidImage ? (
            <img
              src={resolvedImage}
              alt={product.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="relative flex flex-col items-center justify-center p-3 text-center">
              <ShirtIcon className="w-10 h-10 text-brand-orange opacity-40 mb-1" />
              {product.preOrder && (
                <span className="absolute top-2 left-2 bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider">
                  Pre-order
                </span>
              )}
            </div>
          )}

          {/* Heart toggle top-right */}
          <button
            type="button"
            onClick={handleWishlistClick}
            className="absolute top-2.5 right-2.5 w-7 h-7 rounded-md bg-white flex items-center justify-center border border-slate-200 hover:bg-slate-50 active:scale-90 transition-transform z-10 cursor-pointer"
          >
            <svg
              viewBox="0 0 24 24"
              className={`w-3.5 h-3.5 ${isSaved ? 'text-red-500 fill-red-500' : 'text-gray-300 fill-none'}`}
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
            </svg>
          </button>
        </div>

        {/* Product details */}
        <div className="p-3">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            {product.category}
          </span>
          <h3 className="text-xs sm:text-sm font-bold text-gray-900 mt-0.5 truncate leading-tight group-hover:text-brand-orange transition-colors">
            {product.name}
          </h3>
          <div className="mt-1 flex items-center justify-between">
            <PriceTag amount={product.price} className="text-xs sm:text-sm" />
          </div>
        </div>
      </Link>

      <LoginPromptModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        message="Sign in to save items to your wishlist and keep track of your BU merch favorites."
      />
    </>
  )
}

export default ProductCard
