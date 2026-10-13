import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import AppShell from '../components/layout/AppShell.jsx'
import ProductCard from '../components/ui/ProductCard.jsx'
import ServerErrorNotice from '../components/ui/ServerErrorNotice.jsx'
import Avatar from '../components/ui/Avatar.jsx'
import { useCatalog } from '../hooks/useCatalog.js'
import { PRODUCT_CATEGORIES } from '../data/productCategories.js'
import logo from '../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'
import searchIcon from '../assets/icons/common/search.svg'
import notificationIcon from '../assets/icons/common/notification.svg'
import carouselImg1 from '../assets/Images/unnamed (1).jpg'
import carouselImg2 from '../assets/Images/unnamed (51).png'
import carouselImg3 from '../assets/Images/unnamed (52).jpg'
import shirtCategoryImg from '../assets/Images/unnamed (11).png'
import hoodieCategoryImg from '../assets/Images/unnamed (5).png'
import jacketCategoryImg from '../assets/Images/unnamed (12).png'
import capCategoryImg from '../assets/Images/unnamed (6).png'
import lanyardCategoryImg from '../assets/Images/lanyard.png'
import pinCategoryImg from '../assets/Images/unnamed (9).png'
import stickerCategoryImg from '../assets/Images/unnamed (10).png'
import totebagCategoryImg from '../assets/Images/totebag.png'

import {
  UserIcon,
  HeartIcon,
  ShirtIcon,
  PackageIcon,
  SettingsIcon,
  LogOutIcon,
  LockIcon
} from '../components/ui/Icons.jsx'

const carouselSlides = [
  {
    id: 1,
    title: 'New BUnique Collection',
    pillText: 'Pre-order Now',
    subtitle: 'Until August 20',
    ctaText: 'Shop the Collection',
    ctaLink: '/shop?collection=BUnique Collection',
    isLimitedStock: false,
    image: carouselImg1,
  },
  {
    id: 2,
    title: 'Iskolar Pride Varsity',
    pillText: 'Limited Stock',
    subtitle: 'Official BU Varsity Edition',
    ctaText: 'Shop Jackets',
    ctaLink: '/shop?category=Jackets',
    isLimitedStock: true,
    image: carouselImg2,
  },
  {
    id: 3,
    title: 'BU Polo Classics',
    pillText: 'Best Sellers',
    subtitle: 'Back in stock',
    ctaText: 'Shop Classics',
    ctaLink: '/shop?category=Shirts',
    isLimitedStock: false,
    image: carouselImg3,
  },
]

const categoryImages = {
  Shirts: shirtCategoryImg,
  Hoodies: hoodieCategoryImg,
  Jackets: jacketCategoryImg,
  Caps: capCategoryImg,
  Lanyards: lanyardCategoryImg,
  Stickers: stickerCategoryImg,
  Pins: pinCategoryImg,
  Totebags: totebagCategoryImg,
}
const shopCategories = PRODUCT_CATEGORIES.map((name) => ({
  name,
  slug: name,
  image: categoryImages[name] || null,
}))

function ProfileMenu({ open, onClose, user, onLogout }) {
  const navigate = useNavigate()
  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50 animate-fade-in" onClick={onClose} />
      <aside className="fixed top-0 left-0 bottom-0 w-72 bg-white z-50 shadow-2xl flex flex-col justify-between rounded-r-2xl overflow-hidden transition-transform duration-300">
        <div>
          <div className="gradient-orange-header px-6 pt-12 pb-8 text-white relative">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full border-2 border-white bg-blue-100 overflow-hidden">
                <Avatar name={user?.fullName} size={56} className="w-full h-full" userId={user?.cust_id} />
              </div>
              <div>
                <p className="font-bold text-lg">{user ? user.fullName : 'Guest Isko'}</p>
                <p className="text-white/85 text-xs truncate max-w-[170px]">{user ? user.email : 'Explore campus merch'}</p>
              </div>
            </div>
          </div>
          <nav className="p-4 space-y-1">
            <Link to="/home" onClick={onClose} className="flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-gray-450">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              <span>Home</span>
            </Link>
            <Link to="/about" onClick={onClose} className="flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-gray-450">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span>About Us</span>
            </Link>
            <Link to="/shop" onClick={onClose} className="flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all">
              <ShirtIcon className="w-5 h-5 text-gray-450" />
              <span>Shop Merch</span>
            </Link>
            {user ? (
              <>
                <Link to="/orders" onClick={onClose} className="flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all">
                  <PackageIcon className="w-5 h-5 text-gray-450" />
                  <span>My Orders</span>
                </Link>
                <Link to="/wishlist" onClick={onClose} className="flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all">
                  <HeartIcon className="w-5 h-5 text-gray-450" />
                  <span>Wishlist</span>
                </Link>
                <Link to="/profile" onClick={onClose} className="flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all">
                  <UserIcon className="w-5 h-5 text-gray-450" />
                  <span>My Profile</span>
                </Link>
                <Link to="/settings" onClick={onClose} className="flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all">
                  <SettingsIcon className="w-5 h-5 text-gray-450" />
                  <span>Settings</span>
                </Link>
                <button
                  onClick={() => {
                    onLogout()
                    onClose()
                    navigate('/signin')
                  }}
                  className="w-full text-left flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold text-red-600 hover:bg-red-50 transition-all"
                >
                  <LogOutIcon className="w-5 h-5 text-red-500" />
                  <span>Log Out</span>
                </button>
              </>
            ) : (
              <Link to="/signin" onClick={onClose} className="flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold text-brand-orange hover:bg-brand-orange/5 transition-all">
                <LockIcon className="w-5 h-5 text-brand-orange" />
                <span>Log In</span>
              </Link>
            )}
          </nav>
        </div>
        <div className="p-6 border-t border-gray-100 text-center">
          <p className="text-xs text-gray-400 font-medium">Tindahan ni Isko v1.0.0</p>
        </div>
      </aside>
    </>
  )
}

function Home() {
  const navigate = useNavigate()
  const { currentUser, logout } = useAuth()

  const [menuOpen, setMenuOpen] = useState(false)
  const [searchVal, setSearchVal] = useState('')
  const [slideIndex, setSlideIndex] = useState(0)
  const featuredMobileRef = useRef(null)
  const featuredDesktopRef = useRef(null)

  // Auto rotate banner carousel
  useEffect(() => {
    const timer = setInterval(() => {
      setSlideIndex((prev) => (prev + 1) % carouselSlides.length)
    }, 4500)
    return () => clearInterval(timer)
  }, [])

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    if (searchVal.trim()) {
      navigate(`/shop?search=${encodeURIComponent(searchVal.trim())}`)
    }
  }

  const { products: productsData, error: catalogError, reload: reloadCatalog } = useCatalog()
  const featuredProductsMobile = productsData.slice(0, 4)
  const featuredProductsDesktop = productsData.slice(0, 8)
  const scrollFeatured = (rail, direction) => {
    if (rail.current) {
      rail.current.scrollLeft += rail.current.clientWidth * direction
    }
  }

  return (
    <AppShell showSideNav={false}>
      {/* ────────────────── MOBILE HOME PAGE LAYOUT ────────────────── */}
      <div className="md:hidden pb-28">
        {/* Sidebar menu drawer */}
        <ProfileMenu open={menuOpen} onClose={() => setMenuOpen(false)} user={currentUser} onLogout={logout} />

        {/* Top ribbon bar */}
        <header className="bg-white border-b border-gray-50 px-5 py-4 flex items-center justify-between sticky top-0 z-30">
          {/* Hamburger left */}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center active:scale-95 transition-transform"
          >
            <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-gray-800" stroke="currentColor" strokeWidth="2.5">
              <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
            </svg>
          </button>

          {/* Logo centered */}
          <img src={logo} alt="Tindahan ni Isko" className="h-7 object-contain" />

          {/* Bell right */}
          <Link
            to="/notifications"
            className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center relative active:scale-95 transition-transform"
          >
            <img src={notificationIcon} alt="Notifications" className="w-5 h-5" />
          </Link>
        </header>

        {/* Floating search container inside main stream */}
        <div className="p-4 bg-gray-50">
          <form onSubmit={handleSearchSubmit} className="relative">
            <img src={searchIcon} alt="" className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 opacity-40" />
            <input
              type="search"
              placeholder="What are you looking for?"
              value={searchVal}
              onChange={(e) => setSearchVal(e.target.value)}
              className="w-full h-8 pl-9 pr-3 rounded-md bg-white border border-slate-200 text-xs placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-brand-orange focus:border-brand-orange"
            />
          </form>
        </div>

        {/* 1. Hero banner carousel - taller, heavy border-radius (24px) */}
        <div className="relative left-1/2 w-screen -translate-x-1/2 py-2">
          <div className="h-[250px] w-full bg-slate-900 overflow-hidden relative">
            {/* Slides container */}
            {carouselSlides.map((slide, idx) => (
              <div
                key={slide.id}
                className={`absolute inset-0 transition-opacity duration-700 ${
                  idx === slideIndex ? 'opacity-100 z-10' : 'opacity-0 z-0'
                }`}
              >
                {/* Slide background image */}
                <img src={slide.image} alt="" className="absolute inset-0 z-30 h-full w-full object-cover object-center" />
                <div className="absolute inset-0 z-40 bg-gradient-to-r from-black/70 via-black/20 to-transparent opacity-35" />

                <div className="relative z-50 p-5 sm:p-8 flex flex-col justify-end h-full">
                  <div className="max-w-xl">
                    <div className="flex items-center gap-2 mb-1.5">
                      {slide.isLimitedStock ? (
                        <span className="inline-block bg-red-600 text-white text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md animate-pulse">
                          Limited Stock
                        </span>
                      ) : (
                        <span className="inline-block bg-brand-orange text-white text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border border-white/20">
                          {slide.pillText}
                        </span>
                      )}
                      <span className="text-white/80 text-[11px] font-medium">{slide.subtitle}</span>
                    </div>
                    <h2 className="text-white text-2xl sm:text-3xl font-bold max-w-xl leading-tight mb-3">
                      {slide.title}
                    </h2>
                    <Link
                      to={slide.ctaLink}
                      className="inline-flex items-center gap-1 h-9 px-4 bg-brand-orange text-white text-xs font-bold rounded-md"
                    >
                      <span>{slide.ctaText}</span>
                    </Link>
                  </div>
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
                    {/* Slide Indicators */}
                    <div className="flex gap-1.5">
                      {carouselSlides.map((_, dotIdx) => (
                        <button
                          key={dotIdx}
                          onClick={() => setSlideIndex(dotIdx)}
                          className={`h-1.5 rounded-full transition-all duration-300 ${
                            dotIdx === slideIndex ? 'w-4.5 bg-brand-orange' : 'w-1.5 bg-white/40'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 2. Shop by Category (Mobile) */}
        <div className="px-4 pt-6 space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-base font-extrabold text-gray-900 tracking-tight">Shop by Category</h2>
            <Link to="/shop" className="text-xs font-black text-brand-orange hover:underline">
              See all
            </Link>
          </div>

          <div className="flex gap-5 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-none">
            {shopCategories.map((cat) => (
              <Link
                key={cat.name}
                to={`/shop?category=${encodeURIComponent(cat.slug)}`}
                className="w-24 shrink-0 snap-start text-center select-none group"
              >
                <span className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white">
                  {cat.image ? (
                    <img src={cat.image} alt="" className="h-full w-full object-contain group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <PackageIcon className="h-10 w-10 text-gray-300" aria-hidden="true" />
                  )}
                </span>
                <h3 className="mt-2 text-xs font-bold text-gray-800 leading-tight group-hover:text-brand-orange transition-colors">
                  {cat.name}
                </h3>
              </Link>
            ))}
          </div>
        </div>

        {/* 3. Featured Products (Mobile) */}
        <div className="px-4 pt-6 space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-base font-extrabold text-gray-900 tracking-wide">Featured Products</h2>
            <Link to="/shop" className="text-xs font-black text-brand-orange hover:underline">
              See all
            </Link>
          </div>

          {catalogError ? (
            <ServerErrorNotice message={catalogError} onRetry={reloadCatalog} className="py-8" />
          ) : (
            <div ref={featuredMobileRef} className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory">
              {featuredProductsMobile.map((prod) => (
                <div key={prod.id} className="w-[calc((100%-1rem)/2)] shrink-0 snap-start">
                  <ProductCard product={prod} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 4. How It Works Section (Mobile) - rounder corners */}
        <div className="px-4 pt-8">
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-xs space-y-4">
            <div className="text-center space-y-1">
              <span className="text-[10px] font-black uppercase text-brand-orange tracking-wider">Simple Process</span>
              <h2 className="text-lg font-black text-gray-900">How It Works</h2>
            </div>

            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-50/80">
                <span className="text-lg font-black text-brand-orange shrink-0">01</span>
                <div>
                  <h3 className="text-xs font-black text-gray-900">Shop</h3>
                  <p className="text-[11px] text-gray-600">Browse official BU merchandise and choose what you want.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-50/80">
                <span className="text-lg font-black text-brand-orange shrink-0">02</span>
                <div>
                  <h3 className="text-xs font-black text-gray-900">Place Your Order</h3>
                  <p className="text-[11px] text-gray-600">Select your preferred way to receive your order.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-50/80">
                <span className="text-lg font-black text-brand-orange shrink-0">03</span>
                <div>
                  <h3 className="text-xs font-black text-gray-900">Track Your Order</h3>
                  <p className="text-[11px] text-gray-600">Stay updated as your order is prepared and becomes ready for pickup or delivery.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 5. Noticeable but Compact About Us Section (Mobile) - rounder corners */}
        <div className="px-4 pt-6">
          <div className="rounded-xl bg-white border border-slate-200 text-slate-900 p-5 space-y-2.5">
            <span className="inline-block text-[10px] font-bold uppercase text-brand-orange tracking-wider">About Us</span>
            <h2 className="text-base font-extrabold leading-snug">
              More than merchandise. <br />
              <span className="text-brand-orange">It's BU pride you can wear.</span>
            </h2>
            <p className="text-slate-600 text-xs leading-relaxed">
              Tindahan ni Isko is the official merchandise line of the Bicol University–University Student Council, created to celebrate BU identity and serve the university community.
            </p>
            <div className="pt-1">
              <Link
                to="/about"
                className="inline-flex items-center justify-center h-8 px-3 bg-brand-orange hover:bg-brand-orange-dark text-white text-xs font-bold rounded-md transition-colors"
              >
                Learn More About Us
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ────────────────── DESKTOP HOME PAGE LAYOUT ────────────────── */}
      <div className="hidden md:block pb-16">
        {/* 1. Wide Hero Banner - taller, heavy border-radius (24px) */}
        <div className="relative left-1/2 mb-12 w-screen -translate-x-1/2">
          <div className="h-[360px] w-full bg-slate-900 overflow-hidden relative text-white lg:h-[440px]">
            {/* Slides container */}
            {carouselSlides.map((slide, idx) => (
              <div
                key={slide.id}
                className={`absolute inset-0 transition-opacity duration-700 ${
                  idx === slideIndex ? 'opacity-100 z-10' : 'opacity-0 z-0'
                }`}
              >
                {/* Slide background image */}
                <img src={slide.image} alt="" className="absolute inset-0 z-30 h-full w-full object-cover object-center" />
                {/* Gradient overlay */}
                <div className="absolute inset-0 z-40 bg-gradient-to-r from-black/70 via-black/20 to-transparent opacity-35" />

                <div className="relative z-50 h-full flex flex-col justify-end pb-14 px-6 sm:px-10 lg:px-16">
                  <div className="space-y-3 max-w-xl">
                    <div className="flex items-center gap-2.5">
                      {slide.isLimitedStock ? (
                        <span className="inline-block bg-red-600 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md animate-pulse">
                          Limited Stock
                        </span>
                      ) : (
                        <span className="inline-block bg-brand-orange text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md">
                          {slide.pillText}
                        </span>
                      )}
                      <span className="inline-block bg-white/90 backdrop-blur-xs text-slate-900 text-[10px] font-bold px-2.5 py-1 rounded-md">
                        {slide.subtitle}
                      </span>
                    </div>
                    <h1 className="text-3xl lg:text-4xl font-extrabold leading-tight tracking-wide">
                      {slide.title}
                    </h1>
                    <div>
                      <Link
                        to={slide.ctaLink}
                        className="inline-flex items-center justify-center h-8 px-4 bg-brand-orange hover:bg-brand-orange-dark text-white font-bold text-xs rounded-md transition-colors"
                      >
                        <span>{slide.ctaText}</span>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Slide indicators bottom center */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-20">
              {carouselSlides.map((_, dotIdx) => (
                <button
                  key={dotIdx}
                  onClick={() => setSlideIndex(dotIdx)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    dotIdx === slideIndex ? 'w-5 bg-brand-orange' : 'w-1.5 bg-white/40 hover:bg-white'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* 2. Shop by Category (Desktop) */}
        <section className="space-y-6 mb-16">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Shop by Category</h2>
            </div>
            <Link to="/shop" className="text-xs font-bold text-brand-orange hover:underline flex items-center gap-1">
              Browse all
            </Link>
          </div>

          <div className="flex gap-8 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-none">
            {shopCategories.map((cat) => (
              <Link
                key={cat.name}
                to={`/shop?category=${encodeURIComponent(cat.slug)}`}
                className="w-36 shrink-0 snap-start text-center select-none group"
              >
                <span className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white">
                  {cat.image ? (
                    <img src={cat.image} alt="" className="h-full w-full object-contain group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <PackageIcon className="h-12 w-12 text-gray-300" aria-hidden="true" />
                  )}
                </span>
                <h3 className="mt-3 text-sm font-medium text-gray-800 leading-tight group-hover:text-brand-orange transition-colors">
                  {cat.name}
                </h3>
              </Link>
            ))}
          </div>
        </section>

        {/* 3. Featured Products (Desktop) */}
        <section className="space-y-6 mb-16">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Featured Products</h2>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <button type="button" aria-label="Previous featured products" onClick={() => scrollFeatured(featuredDesktopRef, -1)} className="h-8 w-8 rounded-full border border-slate-200 text-slate-600 hover:border-brand-orange hover:text-brand-orange transition-colors">‹</button>
                <button type="button" aria-label="Next featured products" onClick={() => scrollFeatured(featuredDesktopRef, 1)} className="h-8 w-8 rounded-full border border-slate-200 text-slate-600 hover:border-brand-orange hover:text-brand-orange transition-colors">›</button>
              </div>
              <Link to="/shop" className="text-xs font-bold text-brand-orange hover:underline flex items-center gap-1">
                See all
              </Link>
            </div>
          </div>

          {catalogError ? (
            <ServerErrorNotice message={catalogError} onRetry={reloadCatalog} />
          ) : (
            <div ref={featuredDesktopRef} className="flex gap-6 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-none">
              {featuredProductsDesktop.map((prod) => (
                <div key={prod.id} className="w-[calc((100%-4.5rem)/4)] shrink-0 snap-start">
                  <ProductCard product={prod} />
                </div>
              ))}
            </div>
          )}
        </section>

{/* 4. How It Works Section (Desktop) */}
<section className="mb-12 bg-white rounded-xl p-6 lg:p-10 border border-slate-200">
  <div className="text-center max-w-xl mx-auto mb-10 space-y-2">
    <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">How To Order</h2>
    <p className="text-sm text-slate-500">
      Getting your BU merchandise takes three simple steps.
    </p>
  </div>

  <div className="grid grid-cols-3 gap-8">
    {[
      {
        num: '01',
        title: 'Shop',
        desc: 'Browse official BU merchandise and add what you want to your cart.',
      },
      {
        num: '02',
        title: 'Place Your Order',
        desc: 'Choose pickup or delivery, then complete your checkout.',
      },
      {
        num: '03',
        title: 'Track Your Order',
        desc: 'Stay updated as your order is prepared and becomes ready for pickup or delivery.',
      },
    ].map((step, i, arr) => (
      <div key={step.num}>
        {/* Number badge + connecting line */}
        <div className="flex items-center mb-4">
          <span className="flex items-center justify-center w-10 h-10 shrink-0 rounded-full border border-orange-200 bg-orange-50 text-sm font-extrabold text-brand-orange">
            {step.num}
          </span>
          {i < arr.length - 1 && <div className="flex-1 h-px bg-slate-200 ml-4" />}
        </div>

        <h3 className="text-base font-bold text-slate-900 mb-1.5">{step.title}</h3>
        <p className="text-sm text-slate-600 leading-relaxed pr-4">{step.desc}</p>
      </div>
    ))}
  </div>

  {/* Single CTA */}
  <div className="mt-10 pt-6 border-t border-slate-100 text-center">
    <a
      href="/shop"
      className="inline-block px-6 py-2.5 rounded-md bg-brand-orange text-white text-sm font-bold hover:opacity-90"
    >
      Start Shopping
    </a>
  </div>
</section>

        {/* 5. Noticeable but Compact About Us Section (Desktop) - rounder corners */}
        <section className="mb-8 rounded-xl bg-white border border-slate-200 text-slate-900 p-6 lg:p-8 relative overflow-hidden">
          <div className="relative z-10 max-w-2xl space-y-3">
            <span className="inline-block text-xs font-bold uppercase text-brand-orange tracking-wider">About Us</span>
            <h2 className="text-2xl lg:text-3xl font-extrabold leading-tight tracking-tight">
              More than merchandise. <br />
              <span className="text-brand-orange">It's BU pride you can wear.</span>
            </h2>
            <p className="text-slate-600 text-xs lg:text-sm leading-relaxed">
              Tindahan ni Isko is the official merchandise line of the Bicol University–University Student Council, created to celebrate BU identity and serve the university community.
            </p>
            <div className="pt-1">
              <Link
                to="/about"
                className="inline-flex items-center justify-center h-8 px-4 bg-brand-orange hover:bg-brand-orange-dark text-white text-xs font-bold rounded-md transition-colors"
              >
                <span>Learn More About Us</span>
              </Link>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  )
}

export default Home