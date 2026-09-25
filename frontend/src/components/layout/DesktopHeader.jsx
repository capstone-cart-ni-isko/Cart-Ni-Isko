import { useState, useEffect, useCallback } from 'react'
import React from 'react'
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useCart } from '../../hooks/useCart.js'
import { useAuth } from '../../hooks/useAuth.js'
import { fetchNotifications, unreadCount } from '../../services/notifications.js'
import LoginPromptModal from '../ui/LoginPromptModal.jsx'
import logo from '../../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'
import searchIcon from '../../assets/icons/common/search.svg'
import notificationIcon from '../../assets/icons/common/notification.svg'
import wishlistIcon from '../../assets/icons/navigation-bar/wishlist.svg'
import cartIcon from '../../assets/icons/navigation-bar/cart.svg'
import profileIcon from '../../assets/icons/navigation-bar/profile.svg'
import homeIcon from '../../assets/icons/navigation-bar/home.svg'

function DesktopHeader() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { cartItems } = useCart()
  const { currentUser } = useAuth()
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

  const isHomePage = location.pathname === '/home' || location.pathname === '/'
  const isWishlistPage = location.pathname.startsWith('/wishlist')
  const isCartPage = location.pathname.startsWith('/cart') || location.pathname.startsWith('/checkout')
  const isNotificationsPage = location.pathname.startsWith('/notifications')
  const isProfilePage =
    location.pathname.startsWith('/profile') ||
    location.pathname.startsWith('/orders') ||
    location.pathname.startsWith('/account') ||
    location.pathname.startsWith('/settings')

  const q = searchParams.get('search') || ''
  const [prevQ, setPrevQ] = useState(q)
  if (prevQ !== q) {
    setPrevQ(q)
    setSearchVal(q)
  }

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    if (searchVal.trim()) {
      navigate(`/shop?search=${encodeURIComponent(searchVal.trim())}`)
    } else {
      navigate('/shop')
    }
  }

  return (
    <header className="hidden md:block w-full bg-white border-b border-gray-100 sticky top-0 z-40">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
        {/* Logo Left - shifted slightly left */}
        <Link to="/home" className="flex items-center shrink-0">
          <img src={logo} alt="Tindahan ni Isko" className="h-9 md:h-10 object-contain hover:opacity-90 transition-opacity" />
        </Link>

        {/* Search Bar Center */}
        <form onSubmit={handleSearchSubmit} className="flex-1 max-w-lg relative">
          <img src={searchIcon} alt="" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-40" />
          <input
            type="search"
            placeholder="Search products, apparel, essentials..."
            value={searchVal}
            onChange={(e) => setSearchVal(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-slate-50 border border-slate-200 text-xs placeholder-gray-400 focus:outline-none focus:border-brand-orange focus:bg-white transition-all shadow-2xs"
          />
        </form>

        {/* Navigation Items Right - shifted slightly right with sleeker sizing */}
        <div className="flex items-center gap-1.5 lg:gap-2 text-gray-700 shrink-0">
          {/* Home */}
          <div className="relative group flex items-center justify-center">
            <Link
              to="/home"
              className={`p-2 rounded-lg hover:bg-slate-100 transition-all relative flex items-center justify-center ${
                isHomePage ? 'bg-slate-100' : ''
              }`}
              aria-label="Home"
            >
              <img
                src={homeIcon}
                alt="Home"
                className="w-5 h-5 transition-all"
                style={{ filter: isHomePage ? 'brightness(0)' : 'none' }}
              />
            </Link>
            {/* Tooltip */}
            <span className="pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-slate-100 text-slate-800 border border-slate-200 text-[10px] font-medium rounded-md opacity-0 group-hover:opacity-100 transition-all duration-150 whitespace-nowrap z-50">
              Home
            </span>
          </div>

          {/* Wishlist */}
          <div className="relative group flex items-center justify-center">
            <Link
              to="/wishlist"
              onClick={guardGuest}
              className={`p-2 rounded-lg hover:bg-slate-100 transition-all relative flex items-center justify-center ${
                isWishlistPage ? 'bg-slate-100' : ''
              }`}
              aria-label="Wishlist"
            >
              <img
                src={wishlistIcon}
                alt="Wishlist"
                className="w-5 h-5 transition-all"
                style={{ filter: isWishlistPage ? 'brightness(0)' : 'none' }}
              />
            </Link>
            {/* Tooltip */}
            <span className="pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-slate-100 text-slate-800 border border-slate-200 text-[10px] font-medium rounded-md opacity-0 group-hover:opacity-100 transition-all duration-150 whitespace-nowrap z-50">
              Wishlist
            </span>
          </div>

          {/* Cart */}
          <div className="relative group flex items-center justify-center">
            <Link
              to="/cart"
              onClick={guardGuest}
              className={`p-2 rounded-lg hover:bg-slate-100 transition-all relative flex items-center justify-center ${
                isCartPage ? 'bg-slate-100' : ''
              }`}
              aria-label="Shopping bag"
            >
              <img
                src={cartIcon}
                alt="Cart"
                className="w-5 h-5 transition-all"
                style={{ filter: isCartPage ? 'brightness(0)' : 'none' }}
              />
              {cartCount > 0 && (
                <span className="absolute top-0.5 right-0.5 bg-brand-orange text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-white shadow-xs animate-scale-in">
                  {cartCount}
                </span>
              )}
            </Link>
            {/* Tooltip */}
            <span className="pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-slate-100 text-slate-800 border border-slate-200 text-[10px] font-medium rounded-md opacity-0 group-hover:opacity-100 transition-all duration-150 whitespace-nowrap z-50">
              Bag
            </span>
          </div>

          {/* Notifications */}
          <div className="relative group flex items-center justify-center">
            <Link
              to="/notifications"
              onClick={guardGuest}
              className={`p-2 rounded-lg hover:bg-slate-100 transition-all relative flex items-center justify-center ${
                isNotificationsPage ? 'bg-slate-100' : ''
              }`}
              aria-label="Notifications"
            >
              <img
                src={notificationIcon}
                alt="Notifications"
                className="w-5 h-5 transition-all"
                style={{ filter: isNotificationsPage ? 'brightness(0)' : 'none' }}
              />
              {unreadNotifCount > 0 && (
                <span className="absolute top-0.5 right-0.5 bg-brand-orange text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-white shadow-xs animate-scale-in">
                  {unreadNotifCount}
                </span>
              )}
            </Link>
            {/* Tooltip */}
            <span className="pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-slate-100 text-slate-800 border border-slate-200 text-[10px] font-medium rounded-md opacity-0 group-hover:opacity-100 transition-all duration-150 whitespace-nowrap z-50">
              Notifications
            </span>
          </div>

          {/* Profile / Account */}
          <div className="relative group flex items-center justify-center">
            <Link
              to="/profile"
              onClick={guardGuest}
              className={`p-2 rounded-lg hover:bg-slate-100 transition-all relative flex items-center justify-center ${
                isProfilePage ? 'bg-slate-100' : ''
              }`}
              aria-label="My Account"
            >
              <img
                src={profileIcon}
                alt="Profile"
                className="w-5 h-5 transition-all"
                style={{ filter: isProfilePage ? 'brightness(0)' : 'none' }}
              />
            </Link>
            {/* Tooltip */}
            <span className="pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-slate-100 text-slate-800 border border-slate-200 text-[10px] font-medium rounded-md opacity-0 group-hover:opacity-100 transition-all duration-150 whitespace-nowrap z-50">
              My Account
            </span>
          </div>
        </div>
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
