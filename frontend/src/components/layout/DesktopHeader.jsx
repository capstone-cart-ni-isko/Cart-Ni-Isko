import { useState, useEffect, useCallback, useRef } from 'react'
import React from 'react'
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useCart } from '../../hooks/useCart.js'
import { useAuth } from '../../hooks/useAuth.js'
import { fetchNotifications, unreadCount } from '../../services/notifications.js'
import { fetchSearchHistory, recordSearchQuery, clearSearchHistory } from '../../services/products.js'
import LoginPromptModal from '../ui/LoginPromptModal.jsx'
import { useMenu } from './MenuSidebar.jsx'
import { MenuIcon } from '../ui/Icons.jsx'
import BackButton from '../ui/BackButton.jsx'
import logo from '../../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'
import searchIcon from '../../assets/icons/common/search.svg'
import notificationIcon from '../../assets/icons/common/notification.svg'
import cartIcon from '../../assets/icons/navigation-bar/cart.svg'
import homeIcon from '../../assets/icons/navigation-bar/home.svg'

/** Same geometry as the mobile ribbon's calendar glyph. */
const CalendarIcon = ({ active }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`w-5 h-5 ${active ? 'text-brand-orange' : 'text-[#757575]'}`}
  >
    <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
    <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
  </svg>
)

/** Recolor flat SVG assets to match the line icons' active and idle states. */
const Painted = ({ src, alt, active }) => (
  <img
    src={src}
    alt={alt}
    className="w-5 h-5 pointer-events-none select-none"
    style={{
      filter: active
        ? 'invert(55%) sepia(91%) saturate(1938%) hue-rotate(347deg) brightness(101%) contrast(96%)'
        : 'none',
    }}
  />
)

function DesktopHeader() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { cartItems } = useCart()
  const { currentUser } = useAuth()
  const { isMenuOpen, open: openMenu } = useMenu()
  const [searchVal, setSearchVal] = useState('')
  const [unreadNotifCount, setUnreadNotifCount] = useState(0)
  const [showLogin, setShowLogin] = useState(false)

  // The header renders on every page, so it must gate the protected links
  // itself: a guest gets the prompt instead of a redirect away from the page.
  const guardGuest = (e) => {
    if (!currentUser) {
      e.preventDefault()
      setShowLogin(true)
    }
  }

  // Re-evaluating on every route change keeps a stale prompt from lingering.
  useEffect(() => {
    setShowLogin(false)
  }, [location.pathname])

  const cartCount = cartItems.reduce((acc, item) => acc + item.qty, 0)
  const custId = currentUser?.cust_id ?? currentUser?.id ?? null

  const refreshUnread = useCallback(async () => {
    if (!custId) {
      setUnreadNotifCount(0)
      return
    }
    try {
      const rows = await fetchNotifications('customer', custId)
      setUnreadNotifCount(unreadCount(rows))
    } catch {
      // Keep the last known count when the API is unreachable.
    }
  }, [custId])

  useEffect(() => {
    refreshUnread()
    if (!custId) return undefined
    const timer = setInterval(refreshUnread, 60000)
    return () => clearInterval(timer)
  }, [custId, refreshUnread])

  // Home · Wishlist · Bag · Appointments · Notifications · Profile · Menu.
  // `active` lists the routes that light the icon up, so the ribbon, the left
  // sidebar and the mobile bottom ribbon always agree on the current page.
  const ribbon = [
    // Wishlist and Profile live in the Menu drawer only, so the ribbon stays
    // exactly: Home · Bag · Appointments · Notifications · Menu.
    { to: '/home', label: 'Home', icon: Painted, src: homeIcon, active: ['/', '/home'] },
    { to: '/bag', label: 'Bag', icon: Painted, src: cartIcon, active: ['/bag', '/cart', '/checkout'], badge: cartCount },
    { to: '/appointments', label: 'Appointments', icon: CalendarIcon },
    { to: '/notifications', label: 'Notifications', icon: Painted, src: notificationIcon, badge: unreadNotifCount },
  ]
  const path = location.pathname
  const isOn = (item) =>
    (item.active || [item.to]).some((p) => {
      if (p === '/' || p === '/home') {
        return path === '/' || path === '/home'
      }
      return path === p || path.startsWith(`${p}/`)
    })

  const q = searchParams.get('q') ?? searchParams.get('search') ?? ''
  const [prevQ, setPrevQ] = useState(q)
  if (prevQ !== q) {
    setPrevQ(q)
    setSearchVal(q)
  }

  const [searchFocused, setSearchFocused] = useState(false)
  const [searchHovered, setSearchHovered] = useState(false)
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const searchContainerRef = useRef(null)

  // Load history when search is focused or hovered
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

  // Handle outside clicks to exit expanded search mode
  useEffect(() => {
    if (!searchFocused) return undefined
    const handleClickOutside = (e) => {
      if (searchContainerRef.current && searchContainerRef.current.contains(e.target)) {
        return
      }
      setSearchFocused(false)
    }
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setSearchFocused(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [searchFocused])

  const handleMouseEnterSearch = () => {
    setSearchHovered(true)
    loadSearchHistory()
  }

  const handleMouseLeaveSearch = () => {
    setSearchHovered(false)
  }

  const handleFocusSearch = () => {
    setSearchFocused(true)
    loadSearchHistory()
  }

  const handleSelectHistoryItem = (queryText) => {
    setSearchVal(queryText)
    setSearchFocused(false)
    setSearchHovered(false)
    recordSearchQuery(queryText.trim()).catch(() => {})
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
    setSearchHovered(false)
    if (q) {
      recordSearchQuery(q).catch(() => {})
      navigate(`/search?q=${encodeURIComponent(q)}`)
    } else {
      navigate('/search')
    }
  }

  const isSearchPage = location.pathname === '/search'
  const hasSentSearch = isSearchPage && Boolean(q.trim())
  const isSearchOpen = searchFocused || searchHovered
  const isSearchActiveOrSent = isSearchOpen || hasSentSearch

  const handleBack = () => {
    if (isSearchOpen && !hasSentSearch) {
      setSearchFocused(false)
      setSearchHovered(false)
      return
    }
    if (window.history.length > 1) {
      navigate(-1)
    } else {
      navigate('/home')
    }
  }

  return (
    <header className="hidden md:block w-full bg-white dark:bg-[var(--surface)] border-b border-gray-100 dark:border-[var(--line)] sticky top-0 z-50 select-none relative" ref={searchContainerRef}>
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4 relative z-40">
        {/* Back button: appears when search is hovered, clicked, or search is sent */}
        <div
          className={`shrink-0 overflow-hidden transition-all duration-200 ease-out flex items-center ${
            isSearchActiveOrSent ? 'max-w-[48px] opacity-100 scale-100' : 'max-w-0 opacity-0 scale-90 pointer-events-none'
          }`}
        >
          <BackButton onClick={handleBack} label="Back" />
        </div>

        {/* Logo Left - hidden when search is active, hovered, or sent */}
        <div
          className={`shrink-0 overflow-hidden transition-all duration-200 ease-out flex items-center ${
            !isSearchActiveOrSent ? 'max-w-[200px] opacity-100' : 'max-w-0 opacity-0 pointer-events-none'
          }`}
        >
          <Link to="/home" className="flex items-center shrink-0">
            <img src={logo} alt="Tindahan ni Isko" className="h-9 md:h-10 object-contain" />
          </Link>
        </div>

        {/* Search Bar Center */}
        <form onSubmit={handleSearchSubmit} className="flex-1 max-w-lg relative">
          <img src={searchIcon} alt="" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-40" />
          <input
            type="text"
            placeholder="Search products, apparel, essentials..."
            value={searchVal}
            onFocus={handleFocusSearch}
            onChange={(e) => setSearchVal(e.target.value)}
            className={`w-full ${isSearchActiveOrSent ? 'h-10 text-sm pl-10 pr-10' : 'h-9 text-xs pl-9 pr-8'} rounded-xl bg-slate-50 dark:bg-[var(--surface-2)] border border-slate-200 dark:border-[var(--line)] text-slate-900 dark:text-[var(--ink)] placeholder-gray-400 dark:placeholder-[var(--muted-2)] focus:outline-none focus:border-brand-orange focus:bg-white dark:focus:bg-[var(--surface)] transition-all duration-200 ease-out shadow-2xs`}
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

        {/* Ribbon: when search is active, hovered, or sent, ribbon icons/login button disappear */}
        <div
          className={`shrink-0 overflow-hidden transition-all duration-200 ease-out flex items-center ml-auto ${
            !isSearchActiveOrSent ? 'max-w-[280px] opacity-100 scale-100' : 'max-w-0 opacity-0 scale-95 pointer-events-none'
          }`}
        >
          {currentUser ? (
            <div className="flex items-center gap-1.5 lg:gap-2 text-gray-700 shrink-0">
              {ribbon.map(({ to, label, icon: Glyph, src, badge, active }) => {
                const on = isOn({ to, active })
                return (
                  <div key={to} className="relative flex items-center justify-center">
                    <Link
                      to={to}
                      onClick={to === '/home' ? undefined : guardGuest}
                      aria-label={label}
                      className={`p-2 rounded-lg relative flex items-center justify-center transition-colors ${on ? 'bg-orange-50 dark:bg-[var(--tint-brand-bg)] text-brand-orange' : 'text-[#757575] dark:text-[var(--muted)]'}`}
                    >
                      <Glyph active={on} src={src} alt={label} />
                      {badge > 0 && (
                        <span className="absolute top-0.5 right-0.5 bg-brand-orange text-white text-[10px] font-semibold w-4 h-4 rounded-full flex items-center justify-center border-2 border-white shadow-xs animate-scale-in">
                          {badge}
                        </span>
                      )}
                    </Link>
                  </div>
                )
              })}

            {/* Menu: opens the right-side drawer the mobile ribbon also opens */}
            <div className="relative flex items-center justify-center">
              <button
                type="button"
                onClick={openMenu}
                aria-label="Menu"
                aria-expanded={isMenuOpen}
                className={`p-2 rounded-lg flex items-center justify-center cursor-pointer transition-colors ${isMenuOpen ? 'bg-orange-50 dark:bg-[var(--tint-brand-bg)] text-brand-orange' : 'text-[#757575] dark:text-[var(--muted)]'}`}
              >
                <MenuIcon />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center text-gray-700 shrink-0 w-[184px] lg:w-[196px]">
            <Link
              to="/signin"
              id="customer-ribbon-login-btn"
              className="w-full h-9 rounded-lg bg-brand-orange hover:bg-brand-orange/90 active:scale-[0.98] text-white text-xs font-semibold flex items-center justify-center tracking-tight transition-all shadow-2xs hover:shadow-xs cursor-pointer select-none"
            >
              Log in
            </Link>
          </div>
        )}
      </div>

      <LoginPromptModal
        isOpen={showLogin}
        onClose={() => setShowLogin(false)}
        message="Sign in to view your wishlist, bag, notifications, and account."
      />
    </header>
  )
}

export default React.memo(DesktopHeader)
