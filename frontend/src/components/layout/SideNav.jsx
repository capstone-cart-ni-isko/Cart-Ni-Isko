import { NavLink } from 'react-router-dom'
import { useCart } from '../../hooks/useCart.js'
import homeIcon from '../../assets/icons/navigation-bar/home.svg'
import ordersIcon from '../../assets/icons/navigation-bar/orders.svg'
import wishlistIcon from '../../assets/icons/navigation-bar/wishlist.svg'
import cartIcon from '../../assets/icons/navigation-bar/cart.svg'
import profileIcon from '../../assets/icons/navigation-bar/profile.svg'
import brandLogo from '../../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'
import { SparklesIcon } from '../ui/Icons.jsx'
import { triggerPwaInstall } from '../ui/PwaInstallPrompt.jsx'

const navItems = [
  { to: '/home', label: 'Home', icon: homeIcon },
  { to: '/orders', label: 'Orders', icon: ordersIcon },
  { to: '/wishlist', label: 'Wishlist', icon: wishlistIcon },
  { to: '/cart', label: 'Cart', icon: cartIcon, isCart: true },
  { to: '/profile', label: 'Profile', icon: profileIcon },
]

function SideNav() {
  const { cartItems } = useCart()
  const cartCount = cartItems.reduce((acc, item) => acc + item.qty, 0)

  return (
    <nav className="h-full flex flex-col bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-3 px-2 pb-6 mb-4 border-b border-gray-100">
        <img src={brandLogo} alt="Tindahan ni Isko" className="w-10 h-10 object-contain shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900 truncate">Tindahan</p>
          <p className="text-sm font-bold text-brand-orange truncate">ni Isko</p>
        </div>
      </div>

      <ul className="flex-1 space-y-1">
        {navItems.map(({ to, label, icon, isCart }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive }) =>
                `flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  isActive
                    ? 'bg-brand-orange/10 text-brand-orange'
                    : 'text-gray-600 hover:bg-surface-gray'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div className="flex items-center gap-3">
                    <img
                      src={icon}
                      alt=""
                      className="w-5 h-5 shrink-0"
                      style={{
                        filter: isActive
                          ? 'invert(48%) sepia(79%) saturate(2476%) hue-rotate(346deg) brightness(100%) contrast(96%)'
                          : 'none',
                      }}
                    />
                    <span>{label}</span>
                  </div>
                  {isCart && cartCount > 0 && (
                    <span className="bg-brand-orange text-white text-[10px] font-black px-2 py-0.5 rounded-full border border-white animate-scale-in">
                      {cartCount}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="pt-4 mt-4 border-t border-gray-100">
        <p className="text-[10px] text-gray-400 font-medium text-center">Tindahan ni Isko v1.0.0</p>
      </div>
    </nav>
  )
}

export default SideNav


