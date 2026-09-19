import { useState } from 'react'
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useCart } from '../../hooks/useCart.js'
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
  const [searchVal, setSearchVal] = useState('')

  const cartCount = cartItems.reduce((acc, item) => acc + item.qty, 0)
  const unreadNotifCount = 2 // Current unread notifications count

  const isHomePage = location.pathname === '/home' || location.pathname === '/'
  const isWishlistPage = location.pathname.startsWith('/wishlist')
  const isCartPage = location.pathname.startsWith('/cart') || location.pathname.startsWith('/checkout')
  const isNotificationsPage = location.pathname.startsWith('/notifications')
  const isProfilePage =
    location.pathname.startsWith('/profile') ||
    location.pathname.startsWith('/orders') ||
    location.pathname.startsWith('/account') ||
    location.pathname.startsWith('/settings') ||
    location.pathname.startsWith('/security')

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
      <div className="w-full max-w-[1600px] mx-auto px-8 lg:px-12 h-20 flex items-center justify-between gap-8">
        {/* Logo Left */}
        <Link to="/home" className="flex items-center shrink-0">
          <img src={logo} alt="Tindahan ni Isko" className="h-11 md:h-12 object-contain hover:opacity-90 transition-opacity" />
        </Link>

        {/* Search Bar Center */}
        <form onSubmit={handleSearchSubmit} className="flex-1 max-w-xl relative">
          <img src={searchIcon} alt="" className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 opacity-45" />
          <input
            type="search"
            placeholder="Search products, apparel, essentials..."
            value={searchVal}
            onChange={(e) => setSearchVal(e.target.value)}
            className="w-full h-10.5 pl-11 pr-4 rounded-xl bg-slate-50 border border-slate-200 text-sm placeholder-gray-400 focus:outline-none focus:border-brand-orange focus:bg-white transition-all shadow-2xs"
          />
        </form>

        {/* Navigation Items Right: Logo -> Search -> Home -> Wishlist -> Cart -> Notifications -> Account */}
        <div className="flex items-center gap-2 lg:gap-3 text-gray-700 shrink-0">
          {/* Home */}
          <div className="relative group flex items-center justify-center">
            <Link
              to="/home"
              className={`p-2.5 rounded-xl hover:bg-slate-100 transition-all relative flex items-center justify-center ${
                isHomePage ? 'bg-slate-100' : ''
              }`}
              aria-label="Home"
            >
              <img
                src={homeIcon}
                alt="Home"
                className="w-6 h-6 transition-all"
                style={{ filter: isHomePage ? 'brightness(0)' : 'none' }}
              />
            </Link>
            {/* Tooltip */}
            <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-slate-100 text-slate-800 border border-slate-200 text-[11px] font-medium rounded-md opacity-0 group-hover:opacity-100 transition-all duration-150 whitespace-nowrap z-50">
              Home
            </span>
          </div>

          {/* Wishlist */}
          <div className="relative group flex items-center justify-center">
            <Link
              to="/wishlist"
              className={`p-2.5 rounded-xl hover:bg-slate-100 transition-all relative flex items-center justify-center ${
                isWishlistPage ? 'bg-slate-100' : ''
              }`}
              aria-label="Wishlist"
            >
              <img
                src={wishlistIcon}
                alt="Wishlist"
                className="w-6 h-6 transition-all"
                style={{ filter: isWishlistPage ? 'brightness(0)' : 'none' }}
              />
            </Link>
            {/* Tooltip */}
            <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-slate-100 text-slate-800 border border-slate-200 text-[11px] font-medium rounded-md opacity-0 group-hover:opacity-100 transition-all duration-150 whitespace-nowrap z-50">
              Wishlist
            </span>
          </div>

          {/* Cart */}
          <div className="relative group flex items-center justify-center">
            <Link
              to="/cart"
              className={`p-2.5 rounded-xl hover:bg-slate-100 transition-all relative flex items-center justify-center ${
                isCartPage ? 'bg-slate-100' : ''
              }`}
              aria-label="Cart"
            >
              <img
                src={cartIcon}
                alt="Cart"
                className="w-6 h-6 transition-all"
                style={{ filter: isCartPage ? 'brightness(0)' : 'none' }}
              />
              {cartCount > 0 && (
                <span className="absolute top-1 right-1 bg-brand-orange text-white text-[11px] font-black w-4.5 h-4.5 rounded-full flex items-center justify-center border-2 border-white shadow-xs animate-scale-in">
                  {cartCount}
                </span>
              )}
            </Link>
            {/* Tooltip */}
            <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-slate-100 text-slate-800 border border-slate-200 text-[11px] font-medium rounded-md opacity-0 group-hover:opacity-100 transition-all duration-150 whitespace-nowrap z-50">
              Cart
            </span>
          </div>

          {/* Notifications */}
          <div className="relative group flex items-center justify-center">
            <Link
              to="/notifications"
              className={`p-2.5 rounded-xl hover:bg-slate-100 transition-all relative flex items-center justify-center ${
                isNotificationsPage ? 'bg-slate-100' : ''
              }`}
              aria-label="Notifications"
            >
              <img
                src={notificationIcon}
                alt="Notifications"
                className="w-6 h-6 transition-all"
                style={{ filter: isNotificationsPage ? 'brightness(0)' : 'none' }}
              />
              {unreadNotifCount > 0 && (
                <span className="absolute top-1 right-1 bg-brand-orange text-white text-[11px] font-black w-4.5 h-4.5 rounded-full flex items-center justify-center border-2 border-white shadow-xs animate-scale-in">
                  {unreadNotifCount}
                </span>
              )}
            </Link>
            {/* Tooltip */}
            <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-slate-100 text-slate-800 border border-slate-200 text-[11px] font-medium rounded-md opacity-0 group-hover:opacity-100 transition-all duration-150 whitespace-nowrap z-50">
              Notifications
            </span>
          </div>

          {/* Profile / Account */}
          <div className="relative group flex items-center justify-center">
            <Link
              to="/profile"
              className={`p-2.5 rounded-xl hover:bg-slate-100 transition-all relative flex items-center justify-center ${
                isProfilePage ? 'bg-slate-100' : ''
              }`}
              aria-label="My Account"
            >
              <img
                src={profileIcon}
                alt="Profile"
                className="w-6 h-6 transition-all"
                style={{ filter: isProfilePage ? 'brightness(0)' : 'none' }}
              />
            </Link>
            {/* Tooltip */}
            <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-slate-100 text-slate-800 border border-slate-200 text-[11px] font-medium rounded-md opacity-0 group-hover:opacity-100 transition-all duration-150 whitespace-nowrap z-50">
              My Account
            </span>
          </div>
        </div>
      </div>
    </header>
  )
}

export default DesktopHeader
