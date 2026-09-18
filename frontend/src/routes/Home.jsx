import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import AppShell from '../components/layout/AppShell.jsx'
import ProductCard from '../components/ui/ProductCard.jsx'
import productsData from '../data/products.json'
import logo from '../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'
import searchIcon from '../assets/icons/common/search.svg'
import notificationIcon from '../assets/icons/common/notification.svg'
import avatarImg from '../assets/avatar.png'
import carouselImg1 from '../assets/Images/unnamed (1).png'
import carouselImg2 from '../assets/Images/unnamed (2).png'
import carouselImg3 from '../assets/Images/unnamed (3).png'
import shirtCategoryImg from '../assets/Images/unnamed (11).png'
import hoodieCategoryImg from '../assets/Images/unnamed (5).png'
import varsityCategoryImg from '../assets/Images/unnamed (12).png'
import accessoriesCategoryImg from '../assets/Images/unnamed (6).png'
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
    gradient: 'from-orange-600/90 to-blue-900/90',
    image: carouselImg1,
  },
  {
    id: 2,
    title: 'Iskolar Pride Varsity',
    pillText: 'Limited Stock',
    subtitle: 'Official BU Varsity Edition',
    ctaText: 'Shop Varsity Jackets',
    ctaLink: '/shop?category=Varsity Jacket',
    isLimitedStock: true,
    gradient: 'from-blue-600/90 to-orange-500/90',
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
    gradient: 'from-teal-600/90 to-blue-700/90',
    image: carouselImg3,
  },
]

const shopCategories = [
  {
    name: 'Shirts',
    slug: 'Shirts',
    image: shirtCategoryImg,
    description: 'Official tees & polos',
  },
  {
    name: 'Hoodies',
    slug: 'Hoodie',
    image: hoodieCategoryImg,
    description: 'Fleece & pullovers',
  },
  {
    name: 'Varsity Jackets',
    slug: 'Varsity Jacket',
    image: varsityCategoryImg,
    description: 'Classic letterman',
  },
  {
    name: 'Accessories',
    slug: 'Accessories',
    image: accessoriesCategoryImg,
    description: 'Caps, lanyards & gear',
  },
]

function ProfileMenu({ open, onClose, user, onLogout }) {
  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50 animate-fade-in" onClick={onClose} />
      <aside className="fixed top-0 left-0 bottom-0 w-72 bg-white z-50 shadow-2xl flex flex-col justify-between rounded-r-2xl overflow-hidden transition-transform duration-300">
        <div>
          <div className="gradient-orange-header px-6 pt-12 pb-8 text-white relative">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full border-2 border-white bg-blue-100 overflow-hidden">
                <img src={avatarImg} alt="User Avatar" className="w-full h-full object-cover" />
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

  // Get Featured products: 4 on mobile, 8 on desktop
  const featuredProductsMobile = productsData.slice(0, 4)
  const featuredProductsDesktop = productsData.slice(0, 8)

  return (
    <AppShell>
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
              className="w-full h-12 pl-11 pr-4 rounded-full bg-white border border-gray-200 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-orange/45 focus:border-brand-orange transition-all shadow-sm"
            />
          </form>
        </div>

        {/* 1. Hero banner carousel */}
        <div className="px-4 py-2">
          <div className="h-[220px] w-full bg-slate-900 rounded-3xl overflow-hidden relative shadow-md">
            {/* Background elements */}
            <div className="absolute inset-0 opacity-[0.1] select-none pointer-events-none z-10 flex items-center justify-center overflow-hidden">
              <span className="text-8xl font-black text-white tracking-wider rotate-12">BU</span>
            </div>

            {/* Slides container */}
            {carouselSlides.map((slide, idx) => (
              <div
                key={slide.id}
                className={`absolute inset-0 transition-opacity duration-700 ${
                  idx === slideIndex ? 'opacity-100 z-10' : 'opacity-0 z-0'
                }`}
              >
                {/* Slide background image */}
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: `url(${slide.image})` }}
                />
                {/* Gradient overlay */}
                <div className={`absolute inset-0 bg-gradient-to-br ${slide.gradient}`} />

                <div className="relative z-10 p-5 flex flex-col justify-between h-full">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      {slide.isLimitedStock ? (
                        <span className="inline-block bg-red-600 text-white text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full shadow-sm animate-pulse">
                          Limited Stock
                        </span>
                      ) : (
                        <span className="inline-block bg-brand-orange text-white text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border border-white/20 shadow-sm">
                          {slide.pillText}
                        </span>
                      )}
                      <span className="text-white/80 text-[11px] font-semibold">{slide.subtitle}</span>
                    </div>
                    <h2 className="text-white text-xl font-black max-w-[220px] leading-tight filter drop-shadow-sm mb-3">
                      {slide.title}
                    </h2>
                    <Link
                      to={slide.ctaLink}
                      className="inline-flex items-center gap-1 px-4 py-2 bg-brand-orange text-white text-xs font-black rounded-xl shadow-md active:scale-95 transition-transform"
                    >
                      <span>{slide.ctaText}</span>
                      <span>➔</span>
                    </Link>
                  </div>
                  <div className="flex justify-end">
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

          <div className="grid grid-cols-2 gap-3">
            {shopCategories.map((cat) => (
              <Link
                key={cat.name}
                to={`/shop?category=${encodeURIComponent(cat.slug)}`}
                className="block bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow select-none relative group"
              >
                <div className="aspect-square w-full bg-white relative overflow-hidden flex items-center justify-center border-b border-gray-200 p-4">
                  <img
                    src={cat.image}
                    alt={cat.name}
                    className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <div className="p-3">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                    Category
                  </span>
                  <h3 className="text-sm font-extrabold text-gray-900 mt-0.5 truncate leading-tight group-hover:text-brand-orange transition-colors">
                    {cat.name}
                  </h3>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-xs text-gray-500 font-medium truncate">
                      {cat.description}
                    </span>
                  </div>
                </div>
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

          <div className="grid grid-cols-2 gap-3">
            {featuredProductsMobile.map((prod) => (
              <ProductCard key={prod.id} product={prod} />
            ))}
          </div>
        </div>

        {/* 4. How It Works Section (Mobile) */}
        <div className="px-4 pt-8">
          <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-4">
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

        {/* 5. Noticeable but Compact About Us Section (Mobile) */}
        <div className="px-4 pt-6">
          <div className="rounded-3xl bg-slate-900 text-white p-6 shadow-md space-y-3">
            <span className="inline-block text-[10px] font-black uppercase text-brand-orange tracking-widest">About Us</span>
            <h2 className="text-lg font-black leading-snug">
              More than merchandise. <br />
              <span className="text-brand-orange">It's BU pride you can wear.</span>
            </h2>
            <p className="text-gray-300 text-xs leading-relaxed">
              Tindahan ni Isko is the official merchandise line of the Bicol University–University Student Council, created to celebrate BU identity and serve the university community.
            </p>
            <div className="pt-1">
              <Link
                to="/about"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-brand-orange text-white text-xs font-black rounded-xl shadow-md active:scale-95 transition-transform"
              >
                Learn More About Us →
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ────────────────── DESKTOP HOME PAGE LAYOUT ────────────────── */}
      <div className="hidden md:block pb-16">
        {/* 1. Wide Hero Banner with Refined CTA */}
        <div className="mb-12">
          <div className="h-[430px] w-full bg-slate-900 rounded-3xl overflow-hidden relative shadow-lg text-white">
            {/* Background elements */}
            <div className="absolute inset-0 opacity-[0.06] select-none pointer-events-none z-0 flex items-center justify-center overflow-hidden">
              <span className="text-[15rem] font-black text-white tracking-widest rotate-12">BU</span>
            </div>

            {/* Slides container */}
            {carouselSlides.map((slide, idx) => (
              <div
                key={slide.id}
                className={`absolute inset-0 transition-opacity duration-700 ${
                  idx === slideIndex ? 'opacity-100 z-10' : 'opacity-0 z-0'
                }`}
              >
                {/* Slide background image */}
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: `url(${slide.image})` }}
                />
                {/* Gradient overlay */}
                <div className={`absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent`} />

                <div className="relative z-10 h-full flex flex-col justify-end pb-14 px-12 lg:px-16">
                  <div className="space-y-4 max-w-xl">
                    <div className="flex items-center gap-3">
                      {slide.isLimitedStock ? (
                        <span className="inline-block bg-red-600 text-white text-[11px] font-black uppercase tracking-wider px-3.5 py-1.5 rounded-full shadow-sm animate-pulse">
                          Limited Stock
                        </span>
                      ) : (
                        <span className="inline-block bg-brand-orange text-white text-[11px] font-black uppercase tracking-wider px-3.5 py-1.5 rounded-full shadow-sm">
                          {slide.pillText}
                        </span>
                      )}
                      <span className="inline-block bg-white/90 backdrop-blur-xs text-gray-900 text-[11px] font-bold px-3.5 py-1.5 rounded-full shadow-sm">
                        {slide.subtitle}
                      </span>
                    </div>
                    <h1 className="text-4xl lg:text-5xl font-black leading-tight tracking-wide drop-shadow-md">
                      {slide.title}
                    </h1>
                    <div>
                      <Link
                        to={slide.ctaLink}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-brand-orange hover:bg-brand-orange-light text-white font-black text-sm rounded-xl shadow-lg hover:shadow-xl transition-all active:scale-98"
                      >
                        <span>{slide.ctaText}</span>
                        <span className="text-xs">➔</span>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Slide indicators bottom center */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 z-20">
              {carouselSlides.map((_, dotIdx) => (
                <button
                  key={dotIdx}
                  onClick={() => setSlideIndex(dotIdx)}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    dotIdx === slideIndex ? 'w-6 bg-brand-orange' : 'w-2 bg-white/40 hover:bg-white'
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
              <h2 className="text-2xl font-black text-gray-900 tracking-tight">Shop by Category</h2>
              <p className="text-sm text-gray-500 font-medium mt-0.5">Explore official merchandise crafted for BUeños</p>
            </div>
            <Link to="/shop" className="text-sm font-black text-brand-orange hover:underline flex items-center gap-1">
              Browse all <span className="text-xs">➔</span>
            </Link>
          </div>

          <div className="grid grid-cols-4 gap-6">
            {shopCategories.map((cat) => (
              <Link
                key={cat.name}
                to={`/shop?category=${encodeURIComponent(cat.slug)}`}
                className="block bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow select-none relative group"
              >
                {/* Category image container matching ProductCard */}
                <div className="aspect-square w-full bg-white relative overflow-hidden flex items-center justify-center border-b border-gray-200 p-6">
                  <img
                    src={cat.image}
                    alt={cat.name}
                    className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                  />
                </div>

                {/* Category details matching ProductCard */}
                <div className="p-3.5">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Category
                  </span>
                  <h3 className="text-sm md:text-base font-extrabold text-gray-900 mt-0.5 truncate leading-tight group-hover:text-brand-orange transition-colors">
                    {cat.name}
                  </h3>
                  <div className="mt-1.5">
                    <p className="text-xs md:text-sm text-gray-500 font-medium truncate">
                      {cat.description}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* 3. Featured Products (Desktop) */}
        <section className="space-y-6 mb-16">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-black text-gray-900 tracking-tight">Featured Products</h2>
              <p className="text-sm text-gray-500 font-medium mt-0.5">Top picks and popular campus designs</p>
            </div>
            <Link to="/shop" className="text-sm font-black text-brand-orange hover:underline flex items-center gap-1">
              See all <span className="text-xs">➔</span>
            </Link>
          </div>

          <div className="grid grid-cols-4 gap-6">
            {featuredProductsDesktop.map((prod) => (
              <ProductCard key={prod.id} product={prod} />
            ))}
          </div>
        </section>

        {/* 4. How It Works Section (Desktop) */}
        <section className="mb-16 bg-white rounded-3xl p-10 lg:p-12 border border-gray-100 shadow-xs">
          <div className="text-center max-w-xl mx-auto mb-10 space-y-2">
            <span className="text-xs font-black uppercase text-brand-orange tracking-widest">Simple Ordering</span>
            <h2 className="text-3xl font-black text-gray-900 tracking-tight">How It Works</h2>
            <p className="text-sm text-gray-500 font-medium">Getting official BU merchandise is straightforward and transparent</p>
          </div>

          <div className="grid grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="flex flex-col items-start p-6 rounded-2xl bg-gray-50/80 border border-gray-100 hover:border-brand-orange/30 transition-colors">
              <div className="flex items-center justify-between w-full mb-4">
                <span className="text-2xl font-black text-brand-orange">01</span>
                <div className="w-10 h-10 rounded-xl bg-orange-100/70 text-brand-orange flex items-center justify-center">
                  <ShirtIcon className="w-5 h-5" />
                </div>
              </div>
              <h3 className="text-lg font-black text-gray-900 mb-2">Shop</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                Browse official BU merchandise and choose what you want.
              </p>
            </div>

            {/* Step 2 */}
            <div className="flex flex-col items-start p-6 rounded-2xl bg-gray-50/80 border border-gray-100 hover:border-brand-orange/30 transition-colors">
              <div className="flex items-center justify-between w-full mb-4">
                <span className="text-2xl font-black text-brand-orange">02</span>
                <div className="w-10 h-10 rounded-xl bg-orange-100/70 text-brand-orange flex items-center justify-center">
                  <PackageIcon className="w-5 h-5" />
                </div>
              </div>
              <h3 className="text-lg font-black text-gray-900 mb-2">Place Your Order</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                Select your preferred way to receive your order.
              </p>
            </div>

            {/* Step 3 */}
            <div className="flex flex-col items-start p-6 rounded-2xl bg-gray-50/80 border border-gray-100 hover:border-brand-orange/30 transition-colors">
              <div className="flex items-center justify-between w-full mb-4">
                <span className="text-2xl font-black text-brand-orange">03</span>
                <div className="w-10 h-10 rounded-xl bg-orange-100/70 text-brand-orange flex items-center justify-center">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                    <rect x="1" y="3" width="15" height="13" />
                    <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                    <circle cx="5.5" cy="18.5" r="2.5" />
                    <circle cx="18.5" cy="18.5" r="2.5" />
                  </svg>
                </div>
              </div>
              <h3 className="text-lg font-black text-gray-900 mb-2">Track Your Order</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                Stay updated as your order is prepared and becomes ready for pickup or delivery.
              </p>
            </div>
          </div>
        </section>

        {/* 5. Noticeable but Compact About Us Section (Desktop) */}
        <section className="mb-8 rounded-3xl bg-slate-900 text-white p-10 lg:p-14 relative overflow-hidden shadow-xl">
          <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-10 select-none pointer-events-none flex items-center justify-end pr-12">
            <span className="text-[14rem] font-black tracking-widest text-white rotate-12">BU</span>
          </div>
          <div className="relative z-10 max-w-2xl space-y-4">
            <span className="inline-block text-xs font-black uppercase text-brand-orange tracking-widest">About Us</span>
            <h2 className="text-3xl lg:text-4xl font-black leading-tight tracking-tight">
              More than merchandise. <br />
              <span className="text-brand-orange">It's BU pride you can wear.</span>
            </h2>
            <p className="text-gray-300 text-sm lg:text-base leading-relaxed">
              Tindahan ni Isko is the official merchandise line of the Bicol University–University Student Council, created to celebrate BU identity and serve the university community.
            </p>
            <div className="pt-2">
              <Link
                to="/about"
                className="inline-flex items-center gap-2 px-6 py-3 bg-brand-orange hover:bg-brand-orange-light text-white text-sm font-black rounded-xl shadow-md transition-all active:scale-98"
              >
                <span>Learn More About Us</span>
                <span className="text-xs">➔</span>
              </Link>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  )
}

export default Home
