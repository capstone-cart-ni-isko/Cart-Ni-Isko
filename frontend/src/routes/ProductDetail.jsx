import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useCart } from '../hooks/useCart.js'
import { useWishlist } from '../hooks/useWishlist.js'
import SkeletonBlock from '../components/ui/SkeletonBlock.jsx'
import ServerErrorNotice from '../components/ui/ServerErrorNotice.jsx'
import { useToast } from '../hooks/useToast.js'
import FocusedLayout from '../components/layout/FocusedLayout.jsx'
import ViewAllLink from '../components/ui/ViewAllLink.jsx'
import PriceTag from '../components/ui/PriceTag.jsx'
import ProductCard from '../components/ui/ProductCard.jsx'
import LoginPromptModal from '../components/ui/LoginPromptModal.jsx'
import SizeGuideModal from '../components/ui/SizeGuideModal.jsx'
import ProductAccordion from '../components/ui/ProductAccordion.jsx'
import ProductReviews from '../components/ui/ProductReviews.jsx'
import { fetchCatalog, fetchProduct } from '../services/products.js'
import { ShirtIcon, CalendarIcon, StoreIcon, RefreshCwIcon } from '../components/ui/Icons.jsx'
import { getImageUrl } from '../utils/imageUtils.js'

function ProductDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const returnTo = location.state?.from || location.state?.returnTo || null
  const { currentUser } = useAuth()
  const { addToCart } = useCart()
  const { toggleWishlist, isInWishlist } = useWishlist()
  const { showToast } = useToast()

  const [product, setProduct] = useState(null)
  const [relatedProducts, setRelatedProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  const [selectedSize, setSelectedSize] = useState('')
  const [selectedColor, setSelectedColor] = useState(null)
  const [activeImage, setActiveImage] = useState('')
  const [qty, setQty] = useState(1)

  // Modals state
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [showSizeGuide, setShowSizeGuide] = useState(false)

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [id, reloadKey])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)

    // Related products are a nice-to-have: their failure never hides the product.
    Promise.all([fetchProduct(id), fetchCatalog().catch(() => [])])
      .then(([item, catalog]) => {
        if (cancelled) return
        setProduct(item)
        setRelatedProducts(
          catalog
            .filter((p) => p.id !== item?.id && p.prodId !== item?.prodId)
            .sort((a) => (a.category === item?.category ? -1 : 1))
            .slice(0, 4)
        )
        let newColor = item?.colors?.[0] || null
        let newSize = item?.sizes?.[0] || ''

        const targetVarId = location.state?.variationId ?? location.state?.prodvarId
        if (targetVarId && Array.isArray(item?.variations)) {
          const matchedVar = item.variations.find((v) => Number(v.prodvar_id) === Number(targetVarId))
          if (matchedVar) {
            const varColorName = matchedVar.prodvar_options?.Color || matchedVar.prodvar_options?.color
            if (varColorName && Array.isArray(item?.colors)) {
              const foundColor = item.colors.find((c) => c.name.toLowerCase() === varColorName.toLowerCase())
              if (foundColor) newColor = foundColor
            }
            const varSize = matchedVar.prodvar_options?.Size || matchedVar.prodvar_options?.size
            if (varSize) newSize = varSize
          }
        } else if (location.state?.color && Array.isArray(item?.colors)) {
          const foundColor = item.colors.find((c) => c.name.toLowerCase() === String(location.state.color).toLowerCase())
          if (foundColor) newColor = foundColor
        }

        setSelectedColor(newColor)
        setSelectedSize(newSize)
        setActiveImage(newColor?.image || item?.images?.[0] || '')
        setQty(1)
      })
      .catch((err) => {
        if (!cancelled) {
          setProduct(null)
          setRelatedProducts([])
          // A 404 is a missing product (the "not found" view below), not an outage.
          if (err?.status !== 404) {
            setLoadError(err?.message || "Can't reach the store server. Please try again.")
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [id])

  if (loading) {
    return (
      <FocusedLayout title="Product Details" backTo="/shop" containerClassName="max-w-7xl">
        <div className="pb-16" aria-busy={loading} aria-live="polite">
          <span className="sr-only">Loading product details</span>
          <div className="mb-4 hidden md:flex items-center gap-2">
            {Array.from({ length: 4 }, (_, index) => (
              <SkeletonBlock key={index} className="h-3 w-16 rounded" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-start">
            <SkeletonBlock className="aspect-square w-full rounded-3xl" />
            <div className="space-y-5">
              <div className="space-y-3">
                <SkeletonBlock className="h-7 w-3/4 rounded" />
                <SkeletonBlock className="h-4 w-1/3 rounded" />
                <SkeletonBlock className="h-6 w-1/4 rounded" />
              </div>
              <div className="space-y-2">
                <SkeletonBlock className="h-4 w-full rounded" />
                <SkeletonBlock className="h-4 w-full rounded" />
                <SkeletonBlock className="h-4 w-3/4 rounded" />
              </div>
              <SkeletonBlock className="h-12 w-full rounded-xl" />
            </div>
          </div>
        </div>
      </FocusedLayout>
    )
  }

  if (loadError) {
    return (
      <FocusedLayout title="Product Details" backTo="/shop" containerClassName="max-w-7xl">
        <ServerErrorNotice
          message={loadError}
          onRetry={() => setReloadKey((k) => k + 1)}
          className="min-h-[50vh]"
        />
      </FocusedLayout>
    )
  }

  if (!product) {
    return (
      <FocusedLayout title="Product Details" backTo="/shop" containerClassName="max-w-7xl">
        <div className="flex flex-col items-center justify-center min-h-[50vh] p-6 text-center animate-fade-in">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-100">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7 text-gray-400">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900">Product not found</h2>
          <p className="text-sm text-gray-500 mt-2">This item may have been removed or doesn't exist.</p>
          <button onClick={() => navigate('/shop')} className="mt-6 text-brand-orange font-semibold text-sm hover:underline cursor-pointer">
            Browse Shop
          </button>
        </div>
      </FocusedLayout>
    )
  }

  const isSaved = isInWishlist(product.id)

  // 1. Image Gallery logic
  const currentGallery = selectedColor?.gallery?.length
    ? selectedColor.gallery
    : product.images?.length
    ? product.images
    : []

  // Active image index for gallery navigation
  const activeIndex = currentGallery.indexOf(activeImage)
  const galleryLength = currentGallery.length

  const handlePrevImage = () => {
    if (galleryLength <= 1) return
    const prevIndex = activeIndex <= 0 ? galleryLength - 1 : activeIndex - 1
    setActiveImage(currentGallery[prevIndex])
  }

  const handleNextImage = () => {
    if (galleryLength <= 1) return
    const nextIndex = activeIndex >= galleryLength - 1 ? 0 : activeIndex + 1
    setActiveImage(currentGallery[nextIndex])
  }

  // 2. Stock / Inventory calculation per variant
  const calculateStock = (colorObj, sizeVal) => {
    if (product.stockMatrix && colorObj?.name) {
      const colorStock = product.stockMatrix[colorObj.name]
      if (colorStock) {
        if (sizeVal && colorStock[sizeVal] !== undefined) {
          return colorStock[sizeVal]
        }
        const values = Object.values(colorStock)
        if (values.length > 0) return values[0]
      }
    }
    return product.preOrder
      ? (product.preOrderInfo?.maxPreOrderQty || 10)
      : (product.qty ?? 15)
  }

  const availableStock = calculateStock(selectedColor, selectedSize)
  const isOutOfStock = !product.preOrder && availableStock === 0
  const isLowStock = !product.preOrder && availableStock > 0 && availableStock <= 3

  // Color selection handler
  const handleSelectColor = (color) => {
    setSelectedColor(color)
    const newImage = color.image || color.gallery?.[0] || product.images?.[0]
    if (newImage) {
      setActiveImage(newImage)
    }
    const newStock = calculateStock(color, selectedSize)
    if (!product.preOrder && qty > newStock) {
      setQty(Math.max(1, newStock))
    }
  }

  // Size selection handler
  const handleSelectSize = (sz) => {
    setSelectedSize(sz)
    const newStock = calculateStock(selectedColor, sz)
    if (!product.preOrder && qty > newStock) {
      setQty(Math.max(1, newStock))
    }
  }

  const handleAddToCart = () => {
    if (!currentUser) {
      setShowLoginModal(true)
      return
    }
    if (isOutOfStock) {
      showToast('Sorry, this variant is currently out of stock.', 'error')
      return
    }
    addToCart(product, qty, selectedSize, selectedColor)
    showToast(product.preOrder ? 'Pre-order added to bag!' : 'Added to bag!')
  }

  const handleWishlistToggle = () => {
    if (!currentUser) {
      setShowLoginModal(true)
      return
    }
    toggleWishlist(product)
    showToast(isSaved ? 'Removed from Wishlist' : 'Added to Wishlist')
  }

  const isApparel = ['Hoodies', 'Jackets', 'Shirts'].includes(product.category)

  const ctaLabel = isOutOfStock
    ? 'Out of Stock'
    : product.preOrder
    ? 'Pre-order Now'
    : 'Add to Bag'

  return (
    <FocusedLayout
      title={product.name}
      subtitle={product.category}
      backTo={returnTo || '/shop'}
      containerClassName="max-w-7xl"
      rightAction={
        <button
          type="button"
          onClick={handleWishlistToggle}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[var(--line)] bg-white dark:bg-[var(--surface-2)] text-xs font-semibold hover:bg-slate-50 dark:hover:bg-[var(--surface-3)] transition-colors shadow-2xs cursor-pointer"
          title={isSaved ? 'Remove from Wishlist' : 'Add to Wishlist'}
          aria-label={isSaved ? 'Remove from Wishlist' : 'Add to Wishlist'}
        >
          <svg
            viewBox="0 0 24 24"
            className={`w-4 h-4 transition-transform ${
              isSaved ? 'text-red-500 fill-red-500' : 'text-gray-400 fill-none'
            }`}
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
          </svg>
          <span className="hidden sm:inline">{isSaved ? 'Saved' : 'Wishlist'}</span>
        </button>
      }
    >
      <div className="pb-32 md:pb-16 animate-fade-in w-full">
        {/* Breadcrumb Context / Category Link */}
        <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-medium text-gray-400 flex-wrap">
            {returnTo && returnTo.startsWith('/orders') ? (
              <>
                <Link to="/orders" className="hover:text-brand-orange transition-colors">
                  Orders
                </Link>
                <span>/</span>
                <Link to={returnTo} className="hover:text-brand-orange transition-colors">
                  Order Details
                </Link>
                <span>/</span>
              </>
            ) : (
              <>
                <Link to="/home" className="hover:text-brand-orange transition-colors">
                  Home
                </Link>
                <span>/</span>
                <Link to="/shop" className="hover:text-brand-orange transition-colors">
                  Shop
                </Link>
                <span>/</span>
                <Link
                  to={`/shop?category=${encodeURIComponent(product.category)}`}
                  className="hover:text-brand-orange transition-colors"
                >
                  {product.category}
                </Link>
                <span>/</span>
              </>
            )}
            <span className="text-gray-800 font-semibold truncate max-w-[200px] sm:max-w-none">
              {product.name}
            </span>
          </nav>

          {returnTo && (
            <button
              type="button"
              onClick={() => navigate(returnTo)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-orange hover:text-brand-orange-dark hover:underline cursor-pointer transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              <span>Back to Order Details</span>
            </button>
          )}
        </div>

        {/* Main Product Layout Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-start">
          {/* ── Left Column: Product Image Gallery ── */}
          <div className="lg:sticky lg:top-6 flex flex-col gap-3">
            {/* Primary Image Viewport */}
            <div className="relative aspect-square w-full bg-gradient-to-br from-orange-50/70 via-gray-50 to-blue-50/50 rounded-3xl overflow-hidden border border-gray-100 flex items-center justify-center shadow-2xs group">
              {/* Status Badge Tag Over Main Image */}
              <div className="absolute top-4 left-4 z-10 flex flex-col gap-1.5">
                {product.preOrder ? (
                  <span className="inline-flex items-center gap-1.5 bg-blue-600 text-white text-[11px] font-semibold px-2.5 py-0.5 rounded-md uppercase tracking-wider">
                    <CalendarIcon className="w-3.5 h-3.5 shrink-0" />
                    <span>For Pre-order</span>
                  </span>
                ) : isOutOfStock ? (
                  <span className="inline-flex items-center gap-1 bg-red-600 text-white text-[11px] font-semibold px-2.5 py-0.5 rounded-md uppercase tracking-wider">
                    Out of Stock
                  </span>
                ) : isLowStock ? (
                  <span className="inline-flex items-center gap-1 bg-amber-500 text-white text-[11px] font-semibold px-2.5 py-0.5 rounded-md uppercase tracking-wider">
                    Only {availableStock} Left
                  </span>
                ) : null}
              </div>

              {/* Gallery Navigation Arrows */}
              {galleryLength > 1 && (
                <>
                  <button
                    type="button"
                    onClick={handlePrevImage}
                    className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white/90 backdrop-blur-sm border border-gray-200 flex items-center justify-center shadow-sm hover:bg-white active:scale-95 transition-all cursor-pointer opacity-0 group-hover:opacity-100"
                    aria-label="Previous image"
                  >
                    <svg viewBox="0 0 24 24" className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={handleNextImage}
                    className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white/90 backdrop-blur-sm border border-gray-200 flex items-center justify-center shadow-sm hover:bg-white active:scale-95 transition-all cursor-pointer opacity-0 group-hover:opacity-100"
                    aria-label="Next image"
                  >
                    <svg viewBox="0 0 24 24" className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                </>
              )}

              {/* Image Counter */}
              {galleryLength > 1 && (
                <span className="absolute bottom-4 right-4 z-10 text-[11px] font-semibold text-gray-500 bg-white/80 backdrop-blur-sm px-2.5 py-1 rounded-full border border-gray-200/60">
                  {(activeIndex >= 0 ? activeIndex : 0) + 1} / {galleryLength}
                </span>
              )}

              {/* Main Image */}
              {activeImage ? (
                <img
                  key={activeImage}
                  src={getImageUrl(activeImage)}
                  alt={`${product.name} - ${selectedColor?.name || ''}`}
                  className="w-full h-full object-contain p-4 md:p-8 transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <ShirtIcon className="w-28 h-28 md:w-36 md:h-36 text-brand-orange opacity-40 filter drop-shadow-md" />
              )}
            </div>

            {/* Thumbnail Strip Gallery */}
            {currentGallery.length > 1 && (
              <div className="flex items-center gap-3 overflow-x-auto pb-1 scrollbar-none">
                {currentGallery.map((imgSrc, idx) => {
                  const isActive = activeImage === imgSrc
                  const labels = ['Front View', 'Detail View', 'On-Model Shoot', 'Side Angle']
                  const label = labels[idx] || `View ${idx + 1}`

                  return (
                    <button
                      key={imgSrc + idx}
                      type="button"
                      onClick={() => setActiveImage(imgSrc)}
                      className={`relative w-20 h-20 rounded-2xl overflow-hidden border-2 bg-white flex-shrink-0 transition-all cursor-pointer p-1.5 ${
                        isActive
                          ? 'border-[#FF6A00] shadow-sm'
                          : 'border-gray-200 hover:border-gray-300 opacity-70 hover:opacity-100'
                      }`}
                      title={label}
                    >
                      <img
                        src={getImageUrl(imgSrc)}
                        alt={label}
                        className="w-full h-full object-contain"
                      />
                      <span className="sr-only">{label}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Right Column: Product Info, Accordion, Selectors, CTA ── */}
          <div className="flex flex-col gap-4">
            {/* Header: Category, Title, Rating, Price */}
            <div>
              <span className="text-xs font-semibold uppercase tracking-widest">
                {product.category}
              </span>
              <h1 className="text-xl md:text-2xl font-semibold text-gray-900 mt-1 leading-tight">
                {product.name}
              </h1>

              {/* Rating Star Badge */}
              <div className="flex items-center gap-2 mt-1.5">
                {product.reviewCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      const el = document.getElementById('product-reviews')
                      if (el) el.scrollIntoView({ behavior: 'smooth' })
                    }}
                    className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-brand-orange font-semibold cursor-pointer"
                  >
                    <span className="flex text-amber-400">★</span>
                    <span>{product.rating}</span>
                    <span className="text-gray-400 font-normal">
                      ({product.reviewCount} customer reviews)
                    </span>
                  </button>
                ) : (
                  <span className="text-xs text-gray-400">
                    No reviews yet
                  </span>
                )}
              </div>

              {/* Price Tag & Stock Status Context */}
              <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
                <PriceTag
                  amount={product.price}
                  className="text-xl md:text-2xl font-bold text-brand-black"
                />

                {/* Contextual Stock Badge */}
                {product.preOrder ? (
                  <span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1 rounded-full">
                    Pre-order
                  </span>
                ) : isOutOfStock ? (
                  <span className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-3 py-1 rounded-full">
                    Out of Stock
                  </span>
                ) : isLowStock ? (
                  <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full animate-pulse">
                    Only {availableStock} left in stock!
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                    In Stock ({availableStock})
                  </span>
                )}
              </div>
            </div>

            {/* Description */}
            <p className="text-xs md:text-sm text-gray-500 leading-relaxed">
              {product.description}
            </p>

            {/* Product Details Accordion — positioned before selectors per reference */}
            <div id="product-accordion">
              <ProductAccordion details={product.details} preOrder={product.preOrder} />
            </div>

            {/* Color Selector — each variation is shown using its own product
                image so shoppers can see the actual fabric colour; clicking a
                variation also swaps the large main image above. */}
            {product.colors && product.colors.length > 0
              // A size-only product has one 'Standard' swatch: nothing to pick.
              && !(product.colors.length === 1 && product.colors[0].name === 'Standard') && (
              <div>
                <h3 className="text-xs font-semibold text-gray-700 mb-2">
                  {product.colorAxis || 'Color'}:
                  {selectedColor?.name && (
                    <span className="text-gray-900"> {selectedColor.name}</span>
                  )}
                </h3>
                <div className="flex items-center gap-2.5 flex-wrap">
                  {product.colors.map((c) => {
                    const isSelected = selectedColor?.name === c.name
                    const swatchImage =
                      c.image || c.gallery?.[0] || product.images?.[0]

                    return (
                      <button
                        key={c.name}
                        type="button"
                        onClick={() => handleSelectColor(c)}
                        className={`relative w-16 h-16 rounded-xl overflow-hidden border-2 bg-white flex items-center justify-center transition-all cursor-pointer p-1 ${
                          isSelected
                            ? 'border-brand-orange shadow-sm'
                            : 'border-gray-200 hover:border-gray-300 opacity-70 hover:opacity-100'
                        }`}
                        title={`${c.name}${isSelected ? ' (Selected)' : ''}`}
                        aria-label={`Select ${c.name} color`}
                        aria-pressed={isSelected}
                      >
                        {swatchImage ? (
                          <img
                            src={getImageUrl(swatchImage)}
                            alt={c.name}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <span
                            className="block w-full h-full rounded-lg border border-gray-100"
                            style={{ backgroundColor: c.value }}
                          />
                        )}
                        {isSelected && (
                          <span className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-brand-orange text-white text-[9px] flex items-center justify-center shadow-sm">
                            ✓
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Size Selector with Size Guide Modal Trigger */}
            {product.sizes &&
              product.sizes.length > 0 &&
              product.sizes[0] !== 'One Size' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    {/* A product can variate along several axes at the same
                        time (colour and size, colour and material), so the
                        heading names the axis the product actually has instead
                        of always saying "Size". */}
                    <h3 className="text-xs font-semibold text-gray-700">
                      Select {product.secondAxis || 'Size'}
                    </h3>

                    {/* Size Guide Button */}
                    {isApparel && (
                      <button
                        type="button"
                        onClick={() => setShowSizeGuide(true)}
                        className="text-xs font-semibold text-brand-orange hover:text-brand-orange-dark flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                        </svg>
                        <span className="underline underline-offset-2">Size Guide</span>
                      </button>
                    )}
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    {product.sizes.map((sz) => {
                      const isSelected = selectedSize === sz
                      const sizeStock =
                        product.stockMatrix?.[selectedColor?.name]?.[sz] ?? 10
                      const isSizeOutOfStock = !product.preOrder && sizeStock === 0

                      return (
                        <button
                          key={sz}
                          type="button"
                          disabled={isSizeOutOfStock}
                          onClick={() => handleSelectSize(sz)}
                          className={`relative px-4 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-brand-orange text-white border-brand-orange shadow-sm'
                              : isSizeOutOfStock
                              ? 'bg-gray-100 text-gray-300 border-gray-200 cursor-not-allowed line-through'
                              : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          {sz}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

            {/* Desktop Add to Cart / Pre-Order CTA */}
            <div className="hidden md:block pt-1">
              <button
                type="button"
                disabled={isOutOfStock}
                onClick={handleAddToCart}
                className={`w-full h-9 font-semibold rounded-md transition-colors text-sm flex items-center justify-center gap-2 cursor-pointer ${
                  isOutOfStock
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                    : 'bg-brand-orange hover:bg-brand-orange-dark text-white'
                }`}
              >
                {!isOutOfStock && (
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <path d="M16 10a4 4 0 0 1-8 0" />
                  </svg>
                )}
                <span>{ctaLabel}</span>
                {!isOutOfStock && <span className="font-semibold">₱{(product.price * qty).toLocaleString()}</span>}
              </button>
            </div>

            {/* Shipping & Returns Trust Signals — Two Column Layout */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <div className="flex items-start gap-2.5 bg-slate-50 rounded-lg p-2.5 border border-slate-200">
                <StoreIcon className="w-4 h-4 text-brand-orange mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-slate-800">Store Pickup & Courier Available</p>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    Free claim at BU Student Center (M–F, 9AM–4PM) or courier delivery across Albay & Nationwide.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 bg-slate-50 rounded-lg p-2.5 border border-slate-200">
                <RefreshCwIcon className="w-4 h-4 text-brand-orange mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-slate-800">7-Day Return & Replacement Policy</p>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    Hassle-free exchange for sizing or verified production defects.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Customer Reviews Section ── */}
        <div className="mt-12 border-t border-gray-100 pt-8">
          <ProductReviews
            product={product}
            initialOpenWrite={Boolean(location.state?.writeReview)}
            ordId={location.state?.ordId || location.state?.orderId || null}
          />
        </div>

        {/* ── Related Products / "Complete the BU Look" ── */}
        {relatedProducts.length > 0 && (
          <div className="mt-12 border-t border-gray-100 pt-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Complete the BU Look</h2>
                <p className="text-xs text-gray-400">Official BU merchandise you might like</p>
              </div>
             <ViewAllLink to="/shop">View all</ViewAllLink>
            </div>

            <div className="flex gap-4 overflow-x-auto scrollbar-none snap-x snap-mandatory pb-2 md:grid md:grid-cols-4 md:overflow-visible md:snap-none md:pb-0">
              {relatedProducts.map((relProduct) => (
                <div key={relProduct.id} className="min-w-[160px] w-[44vw] flex-shrink-0 snap-start md:min-w-0 md:w-auto">
                  <ProductCard product={relProduct} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sticky Bottom Bar (Mobile only) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 p-3 safe-bottom">
        <div className="mx-auto max-w-lg flex items-center gap-3">
          <div className="flex-1">
            <p className="text-[10px] text-slate-500 font-semibold uppercase">
              {product.preOrder ? 'Pre-order Total' : 'Total'}
            </p>
            <PriceTag amount={product.price * qty} className="text-base font-semibold text-slate-900" />
          </div>

          <button
            type="button"
            disabled={isOutOfStock}
            onClick={handleAddToCart}
            className={`flex-1 h-9 font-semibold rounded-md transition-colors text-xs cursor-pointer ${
              isOutOfStock
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                : 'bg-brand-orange hover:bg-brand-orange-dark text-white'
            }`}
          >
            {ctaLabel}
          </button>
        </div>
      </div>

      {/* Sizing Guide Modal */}
      <SizeGuideModal
        isOpen={showSizeGuide}
        onClose={() => setShowSizeGuide(false)}
        category={product.category}
      />

      {/* Login Prompt Modal */}
      <LoginPromptModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        message="Sign in to add items to your cart, save favorites, and checkout your Isko Drips."
      />
    </FocusedLayout>
  )
}

export default ProductDetail
