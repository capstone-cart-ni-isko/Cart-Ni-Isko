import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import AppShell from '../components/layout/AppShell.jsx'
import ProductCard from '../components/ui/ProductCard.jsx'
import SkeletonCard from '../components/ui/SkeletonCard.jsx'
import ServerErrorNotice from '../components/ui/ServerErrorNotice.jsx'
import ConfirmModal from '../components/ui/ConfirmModal.jsx'
import Avatar from '../components/ui/Avatar.jsx'
import { useCatalog } from '../hooks/useCatalog.js'
import { PRODUCT_CATEGORIES } from '../data/productCategories.js'
import { fetchSearchHistory, recordSearchQuery, clearSearchHistory } from '../services/products.js'
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
  const [showLogoutModal, setShowLogoutModal] = useState(false)
  if (!open) return null

  // FLOW-CUST_LOGOUT-01/02: logging out from the drawer is confirmed first,
  // exactly like the Settings screen, so it never signs out on a stray tap.
  const confirmLogout = () => {
    onLogout()
    onClose()
    navigate('/signin')
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50 animate-fade-in" onClick={onClose} />
      <aside className="fixed top-0 left-0 bottom-0 w-72 bg-white dark:bg-[var(--surface)] z-50 shadow-2xl flex flex-col justify-between rounded-r-2xl overflow-hidden transition-transform duration-300 border-r border-transparent dark:border-[var(--line)]">
        <div>
          <div className="gradient-orange-header px-6 pt-12 pb-8 text-white relative">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full border-2 border-white bg-blue-100 overflow-hidden">
                <Avatar name={user?.fullName} size={56} className="w-full h-full" userId={user?.cust_id} />
              </div>
              <div>
                <p className="font-semibold text-lg">{user ? user.fullName : 'Guest Isko'}</p>
                <p className="text-white/85 text-xs truncate max-w-[170px]">{user ? user.email : 'Explore campus merch'}</p>
              </div>
            </div>
          </div>
          <nav className="p-4 space-y-1">
            <Link to="/home" onClick={onClose} className="flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold text-gray-700 dark:text-[var(--ink-2)] hover:bg-gray-50 dark:hover:bg-[var(--surface-3)] transition-all">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-gray-450 dark:text-[var(--muted)]">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              <span>Home</span>
            </Link>
            <Link to="/about" onClick={onClose} className="flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold text-gray-700 dark:text-[var(--ink-2)] hover:bg-gray-50 dark:hover:bg-[var(--surface-3)] transition-all">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-gray-450 dark:text-[var(--muted)]">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span>About Us</span>
            </Link>
            <Link to="/shop" onClick={onClose} className="flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold text-gray-700 dark:text-[var(--ink-2)] hover:bg-gray-50 dark:hover:bg-[var(--surface-3)] transition-all">
              <ShirtIcon className="w-5 h-5 text-gray-450 dark:text-[var(--muted)]" />
              <span>Shop Merch</span>
            </Link>
            {user ? (
              <>
                <Link to="/orders" onClick={onClose} className="flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold text-gray-700 dark:text-[var(--ink-2)] hover:bg-gray-50 dark:hover:bg-[var(--surface-3)] transition-all">
                  <PackageIcon className="w-5 h-5 text-gray-450 dark:text-[var(--muted)]" />
                  <span>My Orders</span>
                </Link>
                <Link to="/wishlist" onClick={onClose} className="flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold text-gray-700 dark:text-[var(--ink-2)] hover:bg-gray-50 dark:hover:bg-[var(--surface-3)] transition-all">
                  <HeartIcon className="w-5 h-5 text-gray-450 dark:text-[var(--muted)]" />
                  <span>Wishlist</span>
                </Link>
                <Link to="/profile" onClick={onClose} className="flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold text-gray-700 dark:text-[var(--ink-2)] hover:bg-gray-50 dark:hover:bg-[var(--surface-3)] transition-all">
                  <UserIcon className="w-5 h-5 text-gray-450 dark:text-[var(--muted)]" />
                  <span>My Profile</span>
                </Link>
                <Link to="/settings" onClick={onClose} className="flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold text-gray-700 dark:text-[var(--ink-2)] hover:bg-gray-50 dark:hover:bg-[var(--surface-3)] transition-all">
                  <SettingsIcon className="w-5 h-5 text-gray-450 dark:text-[var(--muted)]" />
                  <span>Settings</span>
                </Link>
                <button
                  onClick={() => setShowLogoutModal(true)}
                  className="w-full text-left flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all cursor-pointer"
                >
                  <LogOutIcon className="w-5 h-5 text-red-500" />
                  <span>Log Out</span>
                </button>
              </>
            ) : (
              <Link to="/signin" onClick={onClose} className="flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold text-brand-orange hover:bg-brand-orange/5 dark:hover:bg-[var(--tint-brand-bg)] transition-all">
                <LockIcon className="w-5 h-5 text-brand-orange" />
                <span>Log In</span>
              </Link>
            )}
          </nav>
        </div>
        <div className="p-6 border-t border-gray-100 dark:border-[var(--line)] text-center">
          <p className="text-xs text-gray-400 dark:text-[var(--muted-2)] font-medium">Tindahan ni Isko v1.0.0</p>
        </div>
      </aside>

      {/* FLOW-CUST_LOGOUT-01/02: shared logout confirmation, matching Settings. */}
      <ConfirmModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={confirmLogout}
        title="Log Out?"
        message="Are you sure you want to sign out of your Tindahan ni Isko account?"
        confirmText="Log Out"
        isDestructive={true}
      />
    </>
  )
}

function MissionVisionSection({ className = '' }) {
  return (
    <section className={`home-purpose-section ${className}`} aria-labelledby="home-purpose-title">
      <div className="px-5 py-6 sm:px-7 sm:py-8">
        <div className="mb-5">
          <span className="text-[11px] font-semibold uppercase text-brand-orange">Our purpose</span>
          <h2 id="home-purpose-title" className="mt-1 text-xl font-semibold text-slate-900 dark:text-[var(--ink)] sm:text-2xl">
            Mission &amp; Vision
          </h2>
        </div>

        <div className="grid gap-5 md:grid-cols-2 md:gap-8">
          <div>
            <h3 className="mb-1 text-sm font-semibold text-slate-900 dark:text-[var(--ink)]">Mission</h3>
            <p className="text-sm leading-relaxed text-slate-600 dark:text-[var(--muted)]">
              To provide accessible, high-quality official merchandise that strengthens university pride while supporting sustainable student initiatives.
            </p>
          </div>
          <div>
            <h3 className="mb-1 text-sm font-semibold text-slate-900 dark:text-[var(--ink)]">Vision</h3>
            <p className="text-sm leading-relaxed text-slate-600 dark:text-[var(--muted)]">
              To be the recognized student-led merchandise brand that represents the identity, values, and unity of every Iskolar ng Bayan.
            </p>
          </div>
        </div>

        <div className="mt-5 border-t border-slate-200/80 dark:border-[var(--line)] pt-4">
          <p className="text-sm font-semibold text-slate-900 dark:text-[var(--ink)]">By the Students, For the Students</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-[var(--muted)] sm:text-sm">
            Tindahan ni Isko operates under the official authority of the Bicol University – University Student Council and the Office of the BU USC Business Manager.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-[var(--muted)] sm:text-sm">
            We are committed to the highest standards of financial accountability and transparency. Our operations strictly follow university policies on student enterprises, ensuring that our growth as a brand always translates into better service for the student body.
          </p>
        </div>
      </div>
    </section>
  )
}

function Home() {
  const navigate = useNavigate()
  const { currentUser, logout } = useAuth()

  const [searchParams] = useSearchParams()
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchVal, setSearchVal] = useState(searchParams.get('search') || '')
  const [slideIndex, setSlideIndex] = useState(0)
  const categoryMobileRef = useRef(null)
  const categoryDesktopRef = useRef(null)

  useEffect(() => {
    const q = searchParams.get('search')
    if (q !== null && q !== undefined) {
      setSearchVal(q)
    }
  }, [searchParams])

  // Auto rotate banner carousel
  useEffect(() => {
    const timer = setInterval(() => {
      setSlideIndex((prev) => (prev + 1) % carouselSlides.length)
    }, 4500)
    return () => clearInterval(timer)
  }, [])

  const [searchFocused, setSearchFocused] = useState(false)
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const mobileSearchContainerRef = useRef(null)

  const loadSearchHistory = async () => {
    setLoadingHistory(true)
    try {
      const rows = await fetchSearchHistory()
      setHistory(rows)
    } catch {
      // fallback
    } finally {
      setLoadingHistory(false)
    }
  }

  useEffect(() => {
    if (!searchFocused) return undefined
    const handleClickOutside = (e) => {
      if (mobileSearchContainerRef.current && !mobileSearchContainerRef.current.contains(e.target)) {
        setSearchFocused(false)
      }
    }
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setSearchFocused(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [searchFocused])

  const handleFocusSearch = () => {
    setSearchFocused(true)
    loadSearchHistory()
  }

  const handleSelectHistoryItem = (queryText) => {
    setSearchVal(queryText)
    setSearchFocused(false)
    navigate(`/search?q=${encodeURIComponent(queryText.trim())}`)
  }

  const handleDeleteHistoryItem = async (e, id) => {
    e.preventDefault()
    e.stopPropagation()
    await clearSearchHistory(id)
    setHistory((prev) => prev.filter((item) => item.id !== id))
  }

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    const q = searchVal.trim()
    setSearchFocused(false)
    if (q) {
      recordSearchQuery(q).catch(() => {})
      navigate(`/search?q=${encodeURIComponent(q)}`)
    } else {
      navigate('/search')
    }
  }

  const { products: productsData, loading: catalogLoading, error: catalogError, reload: reloadCatalog } = useCatalog()
  const featuredProducts = productsData.slice(0, 8)
  const featuredProductsMobile = featuredProducts.slice(0, 4)
  const scrollRail = (rail, direction) => {
    if (rail.current) {
      rail.current.scrollBy({
        left: rail.current.clientWidth * direction,
        behavior: 'smooth',
      })
    }
  }

  return (
    <AppShell showSideNav={false} className="home-page-canvas">
      {/* ────────────────── MOBILE HOME PAGE LAYOUT ────────────────── */}
      <div className="md:hidden pb-28">
        {/* Sidebar menu drawer */}
        <ProfileMenu open={menuOpen} onClose={() => setMenuOpen(false)} user={currentUser} onLogout={logout} />

        {/* Top ribbon bar & expandable search container */}
        <div ref={mobileSearchContainerRef} className="sticky top-0 z-30 select-none">
          <header className="bg-white/95 dark:bg-[var(--surface)]/95 backdrop-blur-sm border-b border-gray-100 dark:border-[var(--line)] px-4 py-3 flex items-center justify-between gap-3 relative z-40 transition-all">
            {/* Hamburger left — hidden when search is focused */}
            {!searchFocused && (
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                aria-label="Open navigation menu"
                className="w-10 h-10 rounded-full bg-gray-50 dark:bg-[var(--surface-3)] flex items-center justify-center active:scale-95 transition-transform shrink-0"
              >
                <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-gray-800 dark:text-[var(--ink)]" stroke="currentColor" strokeWidth="2.5">
                  <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
                </svg>
              </button>
            )}

            {/* Logo centered or hidden when search focused */}
            {!searchFocused && (
              <img src={logo} alt="Tindahan ni Isko" className="h-7 object-contain mx-auto" />
            )}

            {/* When focused, the search bar fills the ribbon */}
            {searchFocused && (
              <form onSubmit={handleSearchSubmit} className="flex-1 relative min-w-0">
                <img src={searchIcon} alt="" className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 opacity-40 dark:opacity-60 pointer-events-none" />
                <input
                  type="text"
                  autoFocus
                  placeholder="What are you looking for?"
                  value={searchVal}
                  onChange={(e) => setSearchVal(e.target.value)}
                  className="w-full h-10 pl-10 pr-9 rounded-xl bg-slate-50 dark:bg-[var(--surface-2)] border border-slate-200 dark:border-[var(--line)] text-xs text-slate-900 dark:text-[var(--ink)] placeholder-slate-400 dark:placeholder-[var(--muted-2)] focus:outline-none focus:border-brand-orange transition-all shadow-2xs"
                />
                {searchVal && (
                  <button
                    type="button"
                    onClick={() => setSearchVal('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    aria-label="Clear search"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </form>
            )}

            {/* Bell right — hidden when search is focused */}
            {!searchFocused && (
              <Link
                to="/notifications"
                aria-label="Notifications"
                className="w-10 h-10 rounded-full bg-gray-50 dark:bg-[var(--surface-3)] flex items-center justify-center relative active:scale-95 transition-transform shrink-0"
              >
                <img src={notificationIcon} alt="" className="w-5 h-5 dark:brightness-125" />
              </Link>
            )}
          </header>

          {/* Regular stream search input (when not focused) */}
          {!searchFocused && (
            <div className="p-4 bg-white/35 dark:bg-[var(--surface-2)]/50">
              <div
                onClick={handleFocusSearch}
                className="relative cursor-pointer"
              >
                <img src={searchIcon} alt="" className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 opacity-40 dark:opacity-60 pointer-events-none" />
                <input
                  type="text"
                  readOnly
                  placeholder="What are you looking for?"
                  value={searchVal}
                  className="w-full h-8 pl-9 pr-3 rounded-md bg-white dark:bg-[var(--surface)] border border-slate-200 dark:border-[var(--line)] text-xs text-slate-900 dark:text-[var(--ink)] placeholder-slate-400 dark:placeholder-[var(--muted-2)] cursor-pointer"
                />
              </div>
            </div>
          )}

          {/* ── FULL SCREEN BELOW RIBBON: List of previous searches (latest to oldest) ──
              Requirement: White background, rows not placed in any card or element */}
          {searchFocused && (
            <div className="fixed inset-x-0 bottom-0 top-14 z-30 bg-white dark:bg-[var(--surface)] overflow-y-auto animate-fade-in select-none">
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[var(--line)]">
                  <div className="flex items-center gap-2">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-brand-orange">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[var(--muted)]">
                      Previous Searches
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSearchFocused(false)}
                    className="text-xs font-semibold text-slate-400 hover:text-brand-orange transition-colors cursor-pointer"
                  >
                    Close (Esc)
                  </button>
                </div>

                {loadingHistory ? (
                  <div className="space-y-3 py-4">
                    <div className="h-10 rounded-lg bg-slate-50 dark:bg-[var(--surface-2)] animate-pulse" />
                    <div className="h-10 rounded-lg bg-slate-50 dark:bg-[var(--surface-2)] animate-pulse" />
                  </div>
                ) : history.length === 0 ? (
                  <div className="py-16 text-center space-y-2">
                    <div className="w-12 h-12 rounded-full bg-slate-50 dark:bg-[var(--surface-2)] flex items-center justify-center mx-auto text-slate-400">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-[var(--ink)]">No previous searches</p>
                    <p className="text-xs text-slate-400 dark:text-[var(--muted)]">Type your search query above.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-[var(--line)]">
                    {history.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => handleSelectHistoryItem(item.query)}
                        className="flex items-center justify-between py-3.5 px-2 hover:bg-slate-50/80 dark:hover:bg-[var(--surface-2)] rounded-lg transition-colors cursor-pointer group"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-slate-400 dark:text-[var(--muted)] group-hover:text-brand-orange shrink-0 transition-colors">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                          </svg>
                          <span className="text-sm font-medium text-slate-800 dark:text-[var(--ink)] truncate group-hover:text-brand-orange transition-colors">
                            {item.query}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => handleDeleteHistoryItem(e, item.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                            title="Delete past search"
                            aria-label="Delete past search"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
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
                        <span className="inline-block bg-red-600 text-white text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md animate-pulse">
                          Limited Stock
                        </span>
                      ) : (
                        <span className="inline-block bg-brand-orange text-white text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md border border-white/20">
                          {slide.pillText}
                        </span>
                      )}
                      <span className="text-white/80 text-[11px] font-medium">{slide.subtitle}</span>
                    </div>
                    <h2 className="text-white text-2xl sm:text-3xl font-semibold max-w-xl leading-tight mb-3">
                      {slide.title}
                    </h2>
                    <Link
                      to={slide.ctaLink}
                      className="inline-flex items-center gap-1 h-9 px-4 bg-brand-orange text-white text-xs font-semibold rounded-md"
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
            <h2 className="text-base font-semibold text-gray-900 dark:text-[var(--ink)] tracking-tight">Shop by Category</h2>
            <div className="flex items-center gap-2">
              <button type="button" aria-label="Previous categories" onClick={() => scrollRail(categoryMobileRef, -1)} className="h-8 w-8 rounded-full border border-slate-200 dark:border-[var(--line)] text-slate-600 dark:text-[var(--muted)] hover:border-brand-orange hover:text-brand-orange transition-colors">‹</button>
              <button type="button" aria-label="Next categories" onClick={() => scrollRail(categoryMobileRef, 1)} className="h-8 w-8 rounded-full border border-slate-200 dark:border-[var(--line)] text-slate-600 dark:text-[var(--muted)] hover:border-brand-orange hover:text-brand-orange transition-colors">›</button>
              <Link to="/shop" className="text-xs font-semibold text-brand-orange hover:underline">
                See all
              </Link>
            </div>
          </div>

          <div ref={categoryMobileRef} className="flex gap-5 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-none">
            {shopCategories.map((cat) => (
              <Link
                key={cat.name}
                to={`/shop?category=${encodeURIComponent(cat.slug)}`}
                className="w-24 shrink-0 snap-start text-center select-none group"
              >
                <span className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border border-slate-200 dark:border-[var(--line)] bg-white dark:bg-[var(--surface-2)]">
                  {cat.image ? (
                    <img src={cat.image} alt="" className="h-full w-full object-contain group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <PackageIcon className="h-10 w-10 text-gray-300 dark:text-[var(--muted-2)]" aria-hidden="true" />
                  )}
                </span>
                <h3 className="mt-2 text-xs font-semibold text-gray-800 dark:text-[var(--ink-2)] leading-tight group-hover:text-brand-orange transition-colors">
                  {cat.name}
                </h3>
              </Link>
            ))}
          </div>
        </div>

        {/* 3. Featured Products (Mobile) */}
        <div className="px-4 pt-6 space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-base font-semibold text-gray-900 dark:text-[var(--ink)] tracking-wide">Featured Products</h2>
            <Link to="/shop" className="text-xs font-semibold text-brand-orange hover:underline">
              See all
            </Link>
          </div>

          {catalogError ? (
            <ServerErrorNotice message={catalogError} onRetry={reloadCatalog} className="py-8" />
          ) : catalogLoading ? (
            <div className="grid grid-cols-2 gap-4" aria-busy={catalogLoading} aria-live="polite">
              <span className="sr-only">Loading featured products</span>
              {Array.from({ length: 4 }, (_, index) => (
                <SkeletonCard key={index} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {featuredProductsMobile.map((prod) => <ProductCard key={prod.id} product={prod} />)}
            </div>
          )}
        </div>

        {/* 4. How It Works Section (Mobile) - rounder corners */}
        <div className="px-4 pt-8">
          <div className="bg-white dark:bg-[var(--surface)] rounded-2xl p-5 border border-gray-100 dark:border-[var(--line)] shadow-xs space-y-4">
            <div className="text-center space-y-1">
              <span className="text-[10px] font-semibold uppercase text-brand-orange tracking-wider">Simple Process</span>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-[var(--ink)]">How It Works</h2>
            </div>

            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-50/80 dark:bg-[var(--surface-3)]">
                <span className="text-lg font-semibold text-brand-orange shrink-0">01</span>
                <div>
                  <h3 className="text-xs font-semibold text-gray-900 dark:text-[var(--ink)]">Shop</h3>
                  <p className="text-[11px] text-gray-600 dark:text-[var(--muted)]">Browse official BU merchandise and choose what you want.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-50/80 dark:bg-[var(--surface-3)]">
                <span className="text-lg font-semibold text-brand-orange shrink-0">02</span>
                <div>
                  <h3 className="text-xs font-semibold text-gray-900 dark:text-[var(--ink)]">Place Your Order</h3>
                  <p className="text-[11px] text-gray-600 dark:text-[var(--muted)]">Select your preferred way to receive your order.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-50/80 dark:bg-[var(--surface-3)]">
                <span className="text-lg font-semibold text-brand-orange shrink-0">03</span>
                <div>
                  <h3 className="text-xs font-semibold text-gray-900 dark:text-[var(--ink)]">Track Your Order</h3>
                  <p className="text-[11px] text-gray-600 dark:text-[var(--muted)]">Stay updated as your order is prepared and becomes ready for pickup or delivery.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <MissionVisionSection className="mx-4 mt-6" />

        {/* 5. Noticeable but Compact About Us Section (Mobile) - rounder corners */}
        <div className="px-4 pt-6">
          <div className="rounded-xl bg-white dark:bg-[var(--surface)] border border-slate-200 dark:border-[var(--line)] text-slate-900 dark:text-[var(--ink)] p-5 space-y-2.5">
            <span className="inline-block text-[10px] font-semibold uppercase text-brand-orange tracking-wider">About Us</span>
            <h2 className="text-base font-semibold leading-snug">
              More than merchandise. <br />
              <span className="text-brand-orange">It's BU pride you can wear.</span>
            </h2>
            <p className="text-slate-600 dark:text-[var(--muted)] text-xs leading-relaxed">
              Tindahan ni Isko is the official merchandise line of the Bicol University–University Student Council, created to celebrate BU identity and serve the university community.
            </p>
            <div className="pt-1">
              <Link
                to="/about"
                className="inline-flex items-center justify-center h-8 px-3 bg-brand-orange hover:bg-brand-orange-dark text-white text-xs font-semibold rounded-md transition-colors"
              >
                Learn More About Us
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ────────────────── DESKTOP HOME PAGE LAYOUT ────────────────── */}
      <div className="hidden md:block pb-16">
        {/* 1. Wide Hero Banner - docked flush against ribbon with no gap */}
        <div className="relative left-1/2 mb-12 w-screen -translate-x-1/2 -mt-6">
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
                        <span className="inline-block bg-red-600 text-white text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md animate-pulse">
                          Limited Stock
                        </span>
                      ) : (
                        <span className="inline-block bg-brand-orange text-white text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md">
                          {slide.pillText}
                        </span>
                      )}
                      <span className="inline-block bg-white/90 backdrop-blur-xs text-slate-900 text-[10px] font-semibold px-2.5 py-1 rounded-md">
                        {slide.subtitle}
                      </span>
                    </div>
                    <h1 className="text-3xl lg:text-4xl font-semibold leading-tight tracking-wide">
                      {slide.title}
                    </h1>
                    <div>
                      <Link
                        to={slide.ctaLink}
                        className="inline-flex items-center justify-center h-8 px-4 bg-brand-orange hover:bg-brand-orange-dark text-white font-semibold text-xs rounded-md transition-colors"
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
              <h2 className="text-xl font-semibold text-slate-900 dark:text-[var(--ink)] tracking-tight">Shop by Category</h2>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <button type="button" aria-label="Previous categories" onClick={() => scrollRail(categoryDesktopRef, -1)} className="h-8 w-8 rounded-full border border-slate-200 dark:border-[var(--line)] text-slate-600 dark:text-[var(--muted)] hover:border-brand-orange hover:text-brand-orange transition-colors">‹</button>
                <button type="button" aria-label="Next categories" onClick={() => scrollRail(categoryDesktopRef, 1)} className="h-8 w-8 rounded-full border border-slate-200 dark:border-[var(--line)] text-slate-600 dark:text-[var(--muted)] hover:border-brand-orange hover:text-brand-orange transition-colors">›</button>
              </div>
              <Link to="/shop" className="text-xs font-semibold text-brand-orange hover:underline flex items-center gap-1">
                Browse all
              </Link>
            </div>
          </div>

          <div ref={categoryDesktopRef} className="flex gap-8 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-none">
            {shopCategories.map((cat) => (
              <Link
                key={cat.name}
                to={`/shop?category=${encodeURIComponent(cat.slug)}`}
                className="w-36 shrink-0 snap-start text-center select-none group"
              >
                <span className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border border-slate-200 dark:border-[var(--line)] bg-white dark:bg-[var(--surface-2)]">
                  {cat.image ? (
                    <img src={cat.image} alt="" className="h-full w-full object-contain group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <PackageIcon className="h-12 w-12 text-gray-300 dark:text-[var(--muted-2)]" aria-hidden="true" />
                  )}
                </span>
                <h3 className="mt-3 text-sm font-medium text-gray-800 dark:text-[var(--ink-2)] leading-tight group-hover:text-brand-orange transition-colors">
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
              <h2 className="text-xl font-semibold text-slate-900 dark:text-[var(--ink)] tracking-tight">Featured Products</h2>
            </div>
            <Link to="/shop" className="text-xs font-semibold text-brand-orange hover:underline flex items-center gap-1">
              See all
            </Link>
          </div>

          {catalogError ? (
            <ServerErrorNotice message={catalogError} onRetry={reloadCatalog} />
          ) : catalogLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6" aria-busy={catalogLoading} aria-live="polite">
              <span className="sr-only">Loading featured products</span>
              {Array.from({ length: 8 }, (_, index) => (
                <SkeletonCard key={index} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
              {featuredProducts.map((prod) => <ProductCard key={prod.id} product={prod} />)}
            </div>
          )}
        </section>

{/* 4. How It Works Section (Desktop) */}
<section className="mb-12 bg-white dark:bg-[var(--surface)] rounded-xl p-6 lg:p-10 border border-slate-200 dark:border-[var(--line)]">
  <div className="text-center max-w-xl mx-auto mb-10 space-y-2">
    <h2 className="text-2xl font-semibold text-slate-900 dark:text-[var(--ink)] tracking-tight">How To Order</h2>
    <p className="text-sm text-slate-500 dark:text-[var(--muted)]">
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
          <span className="flex items-center justify-center w-10 h-10 shrink-0 rounded-full border border-orange-200 dark:border-orange-900/60 bg-orange-50 dark:bg-[var(--tint-brand-bg)] text-sm font-semibold text-brand-orange">
            {step.num}
          </span>
          {i < arr.length - 1 && <div className="flex-1 h-px bg-slate-200 dark:bg-[var(--line)] ml-4" />}
        </div>

        <h3 className="text-base font-semibold text-slate-900 dark:text-[var(--ink)] mb-1.5">{step.title}</h3>
        <p className="text-sm text-slate-600 dark:text-[var(--muted)] leading-relaxed pr-4">{step.desc}</p>
      </div>
    ))}
  </div>

  {/* Single CTA */}
  <div className="mt-10 pt-6 border-t border-slate-100 dark:border-[var(--line)] text-center">
    <Link
      to="/shop"
      className="inline-block px-6 py-2.5 rounded-md bg-brand-orange text-white text-sm font-semibold hover:opacity-90"
    >
      Start Shopping
    </Link>
  </div>
</section>

  <MissionVisionSection className="mb-8" />

        {/* 5. Noticeable but Compact About Us Section (Desktop) - rounder corners */}
        <section className="mb-8 rounded-xl bg-white dark:bg-[var(--surface)] border border-slate-200 dark:border-[var(--line)] text-slate-900 dark:text-[var(--ink)] p-6 lg:p-8 relative overflow-hidden">
          <div className="relative z-10 max-w-2xl space-y-3">
            <span className="inline-block text-xs font-semibold uppercase text-brand-orange tracking-wider">About Us</span>
            <h2 className="text-2xl lg:text-3xl font-semibold leading-tight tracking-tight">
              More than merchandise. <br />
              <span className="text-brand-orange">It's BU pride you can wear.</span>
            </h2>
            <p className="text-slate-600 dark:text-[var(--muted)] text-xs lg:text-sm leading-relaxed">
              Tindahan ni Isko is the official merchandise line of the Bicol University–University Student Council, created to celebrate BU identity and serve the university community.
            </p>
            <div className="pt-1">
              <Link
                to="/about"
                className="inline-flex items-center justify-center h-8 px-4 bg-brand-orange hover:bg-brand-orange-dark text-white text-xs font-semibold rounded-md transition-colors"
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