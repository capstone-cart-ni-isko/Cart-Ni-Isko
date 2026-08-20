import { NavLink } from 'react-router-dom'
import { useCart } from '../../hooks/useCart.js'
import homeIcon from '../../assets/icons/navigation-bar/home.svg'
import ordersIcon from '../../assets/icons/navigation-bar/orders.svg'
import wishlistIcon from '../../assets/icons/navigation-bar/wishlist.svg'
import cartIcon from '../../assets/icons/navigation-bar/cart.svg'
import profileIcon from '../../assets/icons/navigation-bar/profile.svg'

const navItems = [
  { to: '/home', label: 'Home', icon: homeIcon },
  { to: '/orders', label: 'Orders', icon: ordersIcon },
  { to: '/wishlist', label: 'Wishlist', icon: wishlistIcon },
  { to: '/cart', label: 'Cart', icon: cartIcon, isCart: true },
  { to: '/profile', label: 'Me', icon: profileIcon },
]

function BottomNav() {
  const { cartItems } = useCart()
  const cartCount = cartItems.reduce((acc, item) => acc + item.qty, 0)

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 safe-bottom md:bottom-4 lg:hidden">
      <div className="mx-auto max-w-lg md:max-w-xl px-4">
        <div className="flex items-center justify-around bg-white rounded-full shadow-lg px-2 py-2 border border-gray-100">
          {navItems.map(({ to, label, icon, isCart }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-full transition-colors min-w-[3.5rem] relative ${
                  isActive ? 'text-brand-orange' : 'text-text-muted'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div className="relative">
                    <img
                      src={icon}
                      alt=""
                      className="w-6 h-6"
                      style={{
                        filter: isActive
                          ? 'invert(48%) sepia(79%) saturate(2476%) hue-rotate(346deg) brightness(100%) contrast(96%)'
                          : 'none',
                      }}
                    />
                    {isCart && cartCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 bg-brand-orange text-white text-[9px] font-black w-4.5 h-4.5 rounded-full flex items-center justify-center border border-white animate-scale-in">
                        {cartCount}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-medium">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  )
}

export default BottomNav

