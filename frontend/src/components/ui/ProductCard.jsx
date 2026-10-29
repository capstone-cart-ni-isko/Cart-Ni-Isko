import { useState } from 'react'
import React from 'react'
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

  // Only show availability badge if item is for Pre-Order
  const availability = product.availability
    || (product.preOrder || product.prod_preorder ? 'Pre-order' : Number(product.qty) > 0 ? 'In Stock' : 'Out of Stock')
  const isPreOrder = availability === 'Pre-order' || product.preOrder || product.prod_preorder
  const availabilityBadge = 'badge--brand'

  return (
    <>
      <Link
        to={`/product/${product.id}`}
        className="block card overflow-hidden hover:border-slate-300 dark:hover:border-[var(--line-2)] transition-colors select-none relative group"
      >
        {/* Product image container */}
        <div className="aspect-square w-full bg-white dark:bg-[var(--surface)] relative overflow-hidden flex items-center justify-center border-b border-slate-200 dark:border-[var(--line)]">
          {hasValidImage ? (
            <img
              src={resolvedImage}
              alt={product.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="relative flex flex-col items-center justify-center p-3 text-center">
              <ShirtIcon className="w-10 h-10 text-brand-orange opacity-40 mb-1" />
            </div>
          )}

          {/* Availability badge - only for Pre-Order */}
          {isPreOrder && (
            <span
              className={`badge ${availabilityBadge} absolute top-2 left-2 uppercase tracking-wider z-10`}
            >
              Pre-order
            </span>
          )}

          {/* Heart toggle top-right — the visible chip stays small but the
              tap target is padded out to the 44px minimum via the ::before
              overlay, so the icon size is unchanged. */}
          <button
            type="button"
            onClick={handleWishlistClick}
            className="absolute top-2.5 right-2.5 w-7 h-7 rounded-md bg-white dark:bg-[var(--surface)] flex items-center justify-center border border-slate-200 dark:border-[var(--line)] hover:bg-slate-50 dark:hover:bg-[var(--surface-3)] active:scale-90 transition-transform z-10 cursor-pointer before:absolute before:-inset-2 before:content-['']"
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
          <span className="text-2xs font-normal text-gray-400 dark:text-[var(--muted-2)] uppercase tracking-wider">
            {product.category}
          </span>
          <h3 className="text-xs sm:text-sm font-normal text-gray-900 dark:text-[var(--ink)] mt-0.5 truncate leading-tight group-hover:text-brand-orange transition-colors">
            {product.name}
          </h3>
          <div className="mt-1 flex items-center justify-between">
            <PriceTag amount={product.price} tone="neutral" className="text-xs sm:text-sm" />
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

export default React.memo(ProductCard)
