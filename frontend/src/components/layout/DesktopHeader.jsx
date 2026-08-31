import { useState, useEffect } from 'react'
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

  useEffect(() => {
    const q = searchParams.get('search')
    if (q) {
      setSearchVal(q)
    } else {
      setSearchVal('')
    }
  }, [searchParams])

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
      <div className="w-full max-w-[1600px] mx-auto px-8 lg:px-12 h-20 flex items-center justify-between gap-12">
        {/* Logo Left */}
        <Link to="/home" className="flex items-center shrink-0">
          <img src={logo} alt="Tindahan ni Isko" className="h-10 object-contain hover:opacity-90 transition-opacity" />
        </Link>

        {/* Search Bar Center */}
        <form onSubmit={handleSearchSubmit} className="flex-1 max-w-xl relative">
          <img src={searchIcon} alt="" className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 opacity-40" />
          <input
            type="search"
            placeholder="Search products..."
            value={searchVal}
            onChange={(e) => setSearchVal(e.target.value)}
            className="w-full h-11 pl-12 pr-4 rounded-full bg-[#F8F9FA] border-none text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 transition-all"
          />
        </form>

        {/* Navigation Icons Right */}
        <div className="flex items-center gap-6 text-gray-700 shrink-0">
          {/* Home Icon Button (Persistent on top bar) */}
          <Link
            to="/home"
            className="p-2.5 rounded-full hover:bg-gray-100 transition-all relative"
            title="Home"
          >
            <img
              src={homeIcon}
              alt="Home"
              className="w-5.5 h-5.5 transition-all"
              style={{ filter: isHomePage ? 'brightness(0)' : 'none' }}
            />
          </Link>

          {/* Wishlist */}
          <Link
            to="/wishlist"
            className="p-2.5 rounded-full hover:bg-gray-100 transition-all relative"
            title="Wishlist"
          >
            <img
              src={wishlistIcon}
              alt="Wishlist"
              className="w-5.5 h-5.5 transition-all"
              style={{ filter: isWishlistPage ? 'brightness(0)' : 'none' }}
            />
          </Link>

          {/* Cart */}
          <Link
            to="/cart"
            className="p-2.5 rounded-full hover:bg-gray-100 transition-all relative"
            title="Cart"
          >
            <img
              src={cartIcon}
              alt="Cart"
              className="w-5.5 h-5.5 transition-all"
              style={{ filter: isCartPage ? 'brightness(0)' : 'none' }}
            />
            {cartCount > 0 && (
              <span className="absolute top-1 right-1 bg-brand-orange text-white text-[10px] font-black w-4.5 h-4.5 rounded-full flex items-center justify-center border-2 border-white animate-scale-in">
                {cartCount}
              </span>
            )}
          </Link>

          {/* Notifications */}
          <Link
            to="/notifications"
            className="p-2.5 rounded-full hover:bg-gray-100 transition-all relative"
            title="Notifications"
          >
            <img
              src={notificationIcon}
              alt="Notifications"
              className="w-5.5 h-5.5 transition-all"
              style={{ filter: isNotificationsPage ? 'brightness(0)' : 'none' }}
            />
          </Link>

          {/* Profile */}
          <Link
            to="/profile"
            className="p-2.5 rounded-full hover:bg-gray-100 transition-all relative"
            title="Profile"
          >
            <img
              src={profileIcon}
              alt="Profile"
              className="w-5.5 h-5.5 transition-all"
              style={{ filter: isProfilePage ? 'brightness(0)' : 'none' }}
            />
          </Link>
        </div>
      </div>
    </header>
  )
}

export default DesktopHeader
