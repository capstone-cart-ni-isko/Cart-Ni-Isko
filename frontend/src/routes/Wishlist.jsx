import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useWishlist } from '../hooks/useWishlist.js'
import FocusedLayout from '../components/layout/FocusedLayout.jsx'
import ProductCard from '../components/ui/ProductCard.jsx'
import LoginPromptModal from '../components/ui/LoginPromptModal.jsx'
import Modal from '../components/ui/Modal.jsx'
import { LockIcon, HeartIcon, CartIcon } from '../components/ui/Icons.jsx'
import { getImageUrl } from '../utils/imageUtils.js'

function optionForAxis(variation, axis) {
  const key = Object.keys(variation?.prodvar_options || {})
    .find((candidate) => candidate.toLowerCase() === String(axis || '').toLowerCase())
  return key ? String(variation.prodvar_options[key] || '') : ''
}

function variationColor(product, variation) {
  if (!product.colorAxis) return ''
  return optionForAxis(variation, product.colorAxis) || 'Standard'
}

function variationSize(product, variation) {
  return (product.secondAxis && optionForAxis(variation, product.secondAxis))
    || optionForAxis(variation, 'size')
    || optionForAxis(variation, 'sizes')
    || variation.prodvar_name
    || 'Standard'
}

function availableColors(product) {
  const colors = []
  product.variations.forEach((variation) => {
    const name = variationColor(product, variation)
    if (!name || colors.some((color) => color.name === name)) return
    const fallbackColor = product.colors?.find((color) => color.name === name)
    colors.push({
      name,
      image: variation.prodvar_pic || fallbackColor?.image || product.images?.[0] || '',
      available: product.variations.some(
        (candidate) => variationColor(product, candidate) === name && variantAvailable(product, candidate)
      ),
    })
  })
  return colors
}

function selectedVariation(product, color, size) {
  return product?.variations.find((variation) => (
    (!product.colorAxis || variationColor(product, variation) === color)
    && (!product.secondAxis || variationSize(product, variation) === size)
    && (!product.colorAxis && !product.secondAxis
      ? variationSize(product, variation) === size
      : true)
  )) || null
}

function variantAvailable(product, variation) {
  return Number(variation?.prodvar_stock) > 0
    || Boolean(variation?.prodvar_preorder)
    || Boolean(product?.productPreOrder)
}

function Wishlist() {
  const { currentUser } = useAuth()
  const { wishlistItems, canAddToCart, addToBag } = useWishlist()
  const [showLogin, setShowLogin] = useState(false)
  const [addingId, setAddingId] = useState(null)
  const [variantProduct, setVariantProduct] = useState(null)
  const [selectedColor, setSelectedColor] = useState('')
  const [selectedSize, setSelectedSize] = useState('')

  const handleAddToBag = async (product, variation = null) => {
    if (addingId) return
    setAddingId(product.id)
    try {
      const added = await addToBag(product, 1, variation)
      if (added && variation) {
        setVariantProduct(null)
        setSelectedColor('')
        setSelectedSize('')
      }
    } finally {
      setAddingId(null)
    }
  }

  const openVariantPicker = (product) => {
    const firstAvailable = product.variations.find((variation) => variantAvailable(product, variation))
    setVariantProduct(product)
    setSelectedColor(firstAvailable ? variationColor(product, firstAvailable) : '')
    setSelectedSize(firstAvailable ? variationSize(product, firstAvailable) : '')
  }

  const confirmVariant = () => {
    const variation = selectedVariation(variantProduct, selectedColor, selectedSize)
    if (variantProduct && variation && variantAvailable(variantProduct, variation)) {
      handleAddToBag(variantProduct, variation)
    }
  }

  const colorOptions = variantProduct ? availableColors(variantProduct) : []
  const sizeOptions = variantProduct
    ? [...new Set(variantProduct.variations
      .filter((variation) => !variantProduct.colorAxis || variationColor(variantProduct, variation) === selectedColor)
      .map((variation) => variationSize(variantProduct, variation)))]
    : []
  const hasSizeAxis = Boolean(variantProduct?.secondAxis)
    || (!variantProduct?.colorAxis && variantProduct?.variations?.length > 1)
  const currentVariation = selectedVariation(variantProduct, selectedColor, selectedSize)
  const closeVariantPicker = () => {
    setVariantProduct(null)
    setSelectedColor('')
    setSelectedSize('')
  }

  const rightAction = currentUser && (
    <div className="flex items-center gap-2">
      <span className="inline-flex px-2.5 py-0.5 rounded-full bg-orange-100 text-brand-orange text-xs font-semibold">
        {wishlistItems.length} {wishlistItems.length === 1 ? 'item' : 'items'}
      </span>
      <Link
        to="/shop"
        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-orange hover:underline px-2.5 py-1 rounded-lg hover:bg-orange-50 transition-colors"
      >
        <span>Shop</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3">
          <path d="M5 12h14M12 5l7 7-7-7" />
        </svg>
      </Link>
    </div>
  )

  return (
    <FocusedLayout
      title="Wishlist"
      subtitle="Your saved campus merchandise"
      backTo="/home"
      containerClassName="max-w-6xl"
      rightAction={rightAction}
    >
      <div className="pb-16 animate-fade-in w-full">
        {!currentUser ? (
          <div className="text-center py-16 flex flex-col items-center justify-center bg-white rounded-2xl border border-gray-100 shadow-xs p-8 max-w-md mx-auto">
            <div className="w-16 h-16 bg-orange-50 rounded-2xl flex items-center justify-center border border-orange-100 mb-3 text-brand-orange">
              <LockIcon className="w-7 h-7 text-brand-orange" />
            </div>
            <h3 className="font-semibold text-gray-900 text-lg">Sign in to view your wishlist</h3>
            <p className="text-xs text-gray-500 mt-1 max-w-[280px] mx-auto leading-relaxed">
              Save your favorite BU campus merch, apparel, and varsity jackets to view them anytime.
            </p>
            <button
              type="button"
              onClick={() => setShowLogin(true)}
              className="mt-5 bg-brand-orange hover:bg-orange-600 text-white font-semibold text-xs px-6 py-3 rounded-xl shadow-md active:scale-98 transition-all cursor-pointer"
            >
              Sign In
            </button>
          </div>
        ) : wishlistItems.length === 0 ? (
          <div className="text-center py-16 flex flex-col items-center justify-center bg-white rounded-2xl border border-gray-100 shadow-xs p-8 max-w-md mx-auto">
            <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center border border-gray-200 mb-3">
              <HeartIcon className="w-7 h-7 text-gray-400" />
            </div>
            <h3 className="font-semibold text-gray-900 text-lg">Your wishlist is empty</h3>
            <p className="text-xs text-gray-500 mt-1 max-w-[260px] mx-auto leading-relaxed">
              Browse the university merchandise catalog and click the heart icon to save products here.
            </p>
            <Link
              to="/shop"
              className="mt-5 inline-flex items-center gap-2 bg-brand-orange hover:bg-orange-600 text-white font-semibold text-xs px-5 py-2.5 rounded-xl shadow-md active:scale-98 transition-all"
            >
              <span>Browse Catalog</span>
              <span>→</span>
            </Link>
          </div>
        ) : (
          <div className="grid-catalog">
            {/* Server order (wish_created DESC) is rendered as-is; every row
                stays visible even when it can no longer be bought. */}
            {wishlistItems.map((product) => {
              const offered = canAddToCart(product)
              const hasVariants = product.variations?.length > 1
              const adding = addingId === product.id
              return (
                <div key={product.id} className="flex flex-col">
                  <div className="relative">
                    <ProductCard product={product} />
                    {!offered && (
                      <span className="absolute top-2.5 left-2.5 z-10 px-2 py-0.5 rounded-md bg-slate-900/80 text-white text-[10px] font-semibold uppercase tracking-wider">
                        Unavailable
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={!offered || Boolean(addingId)}
                    onClick={() => hasVariants ? openVariantPicker(product) : handleAddToBag(product, product.variations?.[0] || null)}
                    className={`mt-2 w-full h-9 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors ${
                      !offered
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        : adding
                        ? 'bg-orange-100 text-brand-orange cursor-wait'
                        : 'bg-brand-orange hover:bg-orange-600 text-white cursor-pointer'
                    }`}
                    title={offered ? `Add ${product.name} to your bag` : 'This item is unavailable'}
                  >
                    <CartIcon className="w-3.5 h-3.5" />
                    {!offered ? 'Unavailable' : adding ? 'Adding…' : 'Add to Bag'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <LoginPromptModal
        isOpen={showLogin}
        onClose={() => setShowLogin(false)}
        message="Sign in to access your wishlist."
      />
      <Modal
        isOpen={Boolean(variantProduct)}
        onClose={closeVariantPicker}
        title="Choose options"
        subtitle={variantProduct?.name}
        size="wide"
        bodyClassName="py-1"
        footer={(
          <>
            <button
              type="button"
              onClick={closeVariantPicker}
              className="btn btn--secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmVariant}
              disabled={!currentVariation || !variantAvailable(variantProduct, currentVariation) || Boolean(addingId)}
              className="btn btn--primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {addingId ? 'Adding…' : 'Add to Bag'}
            </button>
          </>
        )}
      >
        <div className="space-y-5">
          {colorOptions.length > 0 && (
            <section aria-label={`Select ${variantProduct.colorAxis}`}>
              <h3 className="mb-2.5 text-sm font-semibold text-slate-700">
                {variantProduct.colorAxis}: <span className="font-bold text-slate-900">{selectedColor}</span>
              </h3>
              <div className="flex flex-wrap gap-2.5">
                {colorOptions.map((color) => {
                  const selected = color.name === selectedColor
                  return (
                    <button
                      key={color.name}
                      type="button"
                      disabled={!color.available || Boolean(addingId)}
                      aria-pressed={selected}
                      aria-label={`${color.name}${color.available ? '' : ', out of stock'}`}
                      onClick={() => {
                        setSelectedColor(color.name)
                        const nextSize = variantProduct.variations.find((variation) =>
                          variationColor(variantProduct, variation) === color.name
                          && variantAvailable(variantProduct, variation)
                        )
                        if (nextSize) setSelectedSize(variationSize(variantProduct, nextSize))
                      }}
                      className={`relative h-20 w-20 overflow-hidden rounded-2xl border-2 bg-white p-1.5 transition-colors ${
                        !color.available
                          ? 'cursor-not-allowed border-slate-100 opacity-45'
                          : selected
                          ? 'border-brand-orange'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {color.image ? (
                        <img
                          src={getImageUrl(color.image)}
                          alt=""
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <span className="flex h-full items-center justify-center text-xs font-medium text-slate-500">
                          {color.name}
                        </span>
                      )}
                      {selected && (
                        <span className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-orange text-xs font-bold text-white">
                          ✓
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </section>
          )}

          {hasSizeAxis && (
            <section aria-label={`Select ${variantProduct.secondAxis || 'variant'}`}>
              <h3 className="mb-2.5 text-sm font-semibold text-slate-700">
                Select {variantProduct.secondAxis || 'Option'}
              </h3>
              <div className="flex flex-wrap gap-2">
                {sizeOptions.map((size) => {
                  const variation = variantProduct.variations.find((item) =>
                    (!variantProduct.colorAxis || variationColor(variantProduct, item) === selectedColor)
                    && variationSize(variantProduct, item) === size
                  )
                  const available = variation && variantAvailable(variantProduct, variation)
                  const selected = size === selectedSize
                  return (
                    <button
                      key={size}
                      type="button"
                      disabled={!available || Boolean(addingId)}
                      aria-pressed={selected}
                      onClick={() => setSelectedSize(size)}
                      className={`min-h-10 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                        !available
                          ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300 line-through'
                          : selected
                          ? 'border-brand-orange bg-brand-orange text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      {size}
                    </button>
                  )
                })}
              </div>
            </section>
          )}

          {currentVariation && (
            <p className="text-xs font-medium text-slate-500">
              {currentVariation.prodvar_preorder || variantProduct.productPreOrder
                ? 'Available for pre-order'
                : `${currentVariation.prodvar_stock} in stock`}
            </p>
          )}
          {variantProduct && !variantProduct.variations.some((variation) => variantAvailable(variantProduct, variation)) && (
            <p className="text-sm text-red-600" role="status">All variants are currently out of stock.</p>
          )}
        </div>
      </Modal>
    </FocusedLayout>
  )
}

export default Wishlist
