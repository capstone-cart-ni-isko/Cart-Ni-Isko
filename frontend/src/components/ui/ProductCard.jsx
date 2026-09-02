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
        className="block bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow select-none relative group"
      >
        {/* Product image container */}
        <div className="aspect-square w-full bg-white relative overflow-hidden flex items-center justify-center border-b border-gray-200">
          {hasValidImage ? (
            <img
              src={resolvedImage}
              alt={product.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="relative flex flex-col items-center justify-center p-4 text-center">
              <ShirtIcon className="w-12 h-12 text-brand-orange opacity-40 mb-1" />
              {product.preOrder && (
                <span className="absolute top-2 left-2 bg-[#DBEAFE] text-[#1D4ED8] text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Pre-order
                </span>
              )}
            </div>
          )}

          {/* Heart toggle top-right */}
          <button
            type="button"
            onClick={handleWishlistClick}
            className="absolute top-3.5 right-3.5 w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm border border-gray-200 hover:bg-gray-50 active:scale-90 transition-transform z-10"
          >
            <svg
              viewBox="0 0 24 24"
              className={`w-4 h-4 ${isSaved ? 'text-red-500 fill-red-500' : 'text-gray-300 fill-none'}`}
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
        <div className="p-3.5">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            {product.category}
          </span>
          <h3 className="text-sm font-extrabold text-gray-900 mt-0.5 truncate leading-tight group-hover:text-brand-orange transition-colors">
            {product.name}
          </h3>
          <div className="mt-1.5 flex items-center justify-between">
            <PriceTag amount={product.price} className="text-sm" />
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
