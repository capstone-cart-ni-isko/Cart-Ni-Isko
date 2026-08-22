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
import heroImg from '../assets/hero.png'
import carouselImg1 from '../assets/Images/unnamed (1).png'
import carouselImg2 from '../assets/Images/unnamed (2).png'
import carouselImg3 from '../assets/Images/unnamed (3).png'
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
    gradient: 'from-orange-600/90 to-blue-900/90',
    image: carouselImg1,
  },
  {
    id: 2,
    title: 'Iskolar Pride Varsity',
    pillText: 'Limited Stock',
    subtitle: 'Get yours today',
    gradient: 'from-blue-600/90 to-orange-500/90',
    image: carouselImg2,
  },
  {
    id: 3,
    title: 'BU Polo Classics',
    pillText: 'Best Sellers',
    subtitle: 'Back in stock',
    gradient: 'from-teal-600/90 to-blue-700/90',
    image: carouselImg3,
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
              className="w-full h-12 pl-11 pr-4 rounded-full bg-white border border-gray-150 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-orange/45 focus:border-brand-orange transition-all shadow-sm"
            />
          </form>
        </div>

        {/* Hero banner carousel */}
        <div className="px-4 py-2">
          <div className="h-[210px] w-full bg-slate-900 rounded-3xl overflow-hidden relative shadow-md">
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

                <div className="relative z-10 p-6 flex flex-col justify-between h-full">
                  <div>
                    <span className="inline-block bg-brand-orange text-white text-[9px] font-black uppercase tracking-wider px-3 py-1 rounded-full border border-white/20 shadow-sm mb-3">
                      {slide.pillText}
                    </span>
                    <h2 className="text-white text-2xl font-black max-w-[200px] leading-tight filter drop-shadow-sm">
                      {slide.title}
                    </h2>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/80 text-xs font-semibold">{slide.subtitle}</span>
                    {/* Slide Indicators dot indicators */}
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

        {/* Featured Products */}
        <div className="px-4 pt-6 space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-base font-extrabold text-gray-900 tracking-wide">Featured Products</h2>
            <Link to="/shop" className="text-xs font-black text-brand-orange hover:underline">
              See all
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {featuredProductsMobile.map((prod) => (
              <ProductCard key={prod.id} product={prod} />
            ))}
          </div>
        </div>
      </div>

      {/* ────────────────── DESKTOP HOME PAGE LAYOUT (Image 5) ────────────────── */}
      <div className="hidden md:block pb-16">
        {/* Categories navigation bar */}
        <nav className="border-b border-gray-150 py-3.5 bg-white -mt-8 mb-6">
          <div className="max-w-7xl mx-auto px-2 flex gap-8 text-sm font-bold text-gray-500">
            <Link to="/home" className="text-brand-orange border-b-2 border-brand-orange pb-3.5">
              Home
            </Link>
            <Link to="/shop?category=Hoodie" className="hover:text-brand-orange transition-colors pb-3.5">
              Hoodies
            </Link>
            <Link to="/shop?category=Shirts" className="hover:text-brand-orange transition-colors pb-3.5">
              Shirts
            </Link>
            <Link to="/shop?category=Varsity Jacket" className="hover:text-brand-orange transition-colors pb-3.5">
              Varsity Jackets
            </Link>
            <Link to="/shop?category=Cap" className="hover:text-brand-orange transition-colors pb-3.5">
              Accessories
            </Link>
          </div>
        </nav>

        {/* Wide Hero Banner */}
        <div className="mb-12">
          <div className="h-[420px] w-full bg-slate-900 rounded-3xl overflow-hidden relative shadow-md text-white">
            {/* Background elements */}
            <div className="absolute inset-0 opacity-[0.06] select-none pointer-events-none z-0 flex items-center justify-center overflow-hidden">
              <span className="text-[14rem] font-black text-white tracking-widest rotate-12">BU</span>
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
                <div className={`absolute inset-0 bg-gradient-to-r ${slide.gradient}`} />

                <div className="relative z-10 h-full flex items-center px-16">
                  <div className="space-y-5 max-w-xl">
                    <span className="inline-block bg-brand-orange text-white text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full border border-white/20 shadow-sm">
                      {slide.pillText}
                    </span>
                    <h1 className="text-5xl lg:text-6xl font-black leading-tight tracking-wide drop-shadow-md">
                      {slide.title}
                    </h1>
                    <p className="text-white/80 text-sm font-semibold tracking-wide">
                      {slide.subtitle}
                    </p>
                  </div>
                </div>
              </div>
            ))}

            {/* Slide indicators bottom right */}
            <div className="absolute bottom-8 right-16 flex gap-2 z-20">
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

        {/* Featured Products (8 items, 2 rows of 4) */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-black text-gray-900 tracking-wide">Featured Products</h2>
            <Link to="/shop" className="text-sm font-black text-brand-orange hover:underline flex items-center gap-1">
              See all <span className="text-xs">➔</span>
            </Link>
          </div>

          <div className="grid grid-cols-4 gap-6">
            {featuredProductsDesktop.map((prod) => (
              <ProductCard key={prod.id} product={prod} />
            ))}
          </div>
        </div>

        {/* Quote Block (Centered quote from Image 5) */}
        <div className="my-24 text-center max-w-4xl mx-auto space-y-4 px-6 animate-fade-in">
          <span className="text-brand-orange text-7xl font-black leading-none block select-none leading-[0] mb-6">”</span>
          <p className="text-gray-600 font-medium leading-relaxed text-base italic md:text-lg">
            Tindahan ni Isko is the official merchandise line of the Bicol University – University Student Council, a student-led enterprise dedicated to redefining the BUeño identity. More than just a merchandise line, we are a movement that bridges student innovation with university heritage. Every item you wear is a spark of wisdom and every purchase is a step toward a more sustainable and supported student community.
          </p>
        </div>

        {/* Lifestyle Gallery Blocks (3 side-by-side from Image 5) */}
        <div className="grid grid-cols-3 gap-6 my-16">
          <div className="h-[340px] rounded-3xl bg-gray-100 overflow-hidden relative group shadow-sm border border-gray-100 cursor-pointer">
            <div
              className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
              style={{ backgroundImage: `url(${heroImg})` }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />
            <div className="absolute bottom-6 left-6 text-white z-10">
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">BU Pride</p>
              <h3 className="text-xl font-black mt-1">Classics Apparel</h3>
            </div>
          </div>

          <div className="h-[340px] rounded-3xl bg-gray-100 overflow-hidden relative group shadow-sm border border-gray-100 cursor-pointer">
            <div
              className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
              style={{ backgroundImage: `url(${heroImg})` }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />
            <div className="absolute bottom-6 left-6 text-white z-10">
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">BUnique Collection</p>
              <h3 className="text-xl font-black mt-1">Streetwear Styling</h3>
            </div>
          </div>

          <div className="h-[340px] rounded-3xl bg-gray-100 overflow-hidden relative group shadow-sm border border-gray-100 cursor-pointer">
            <div
              className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
              style={{ backgroundImage: `url(${heroImg})` }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />
            <div className="absolute bottom-6 left-6 text-white z-10">
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">University Gear</p>
              <h3 className="text-xl font-black mt-1">Campus Accessories</h3>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}

export default Home
