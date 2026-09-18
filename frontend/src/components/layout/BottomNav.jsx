import { NavLink } from 'react-router-dom'
import homeIcon from '../../assets/icons/navigation-bar/home.svg'
import ordersIcon from '../../assets/icons/navigation-bar/orders.svg'
import wishlistIcon from '../../assets/icons/navigation-bar/wishlist.svg'
import cartIcon from '../../assets/icons/navigation-bar/cart.svg'
import profileIcon from '../../assets/icons/navigation-bar/profile.svg'

const navItems = [
  { to: '/home', label: 'Home', icon: homeIcon },
  { to: '/orders', label: 'Orders', icon: ordersIcon },
  { to: '/wishlist', label: 'Wishlist', icon: wishlistIcon },
  { to: '/cart', label: 'Cart', icon: cartIcon },
  { to: '/profile', label: 'Me', icon: profileIcon },
]

function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 safe-bottom md:bottom-4 lg:hidden">
      <div className="mx-auto max-w-lg md:max-w-xl px-4">
        <div className="flex items-center justify-around bg-white rounded-full shadow-lg px-2 py-2 border border-gray-100">
          {navItems.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-full transition-colors min-w-[3.5rem] relative ${
                  isActive ? 'text-brand-orange font-bold' : 'text-text-muted'
                }`
              }
            >
              {({ isActive }) => (
                <>
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
                  <span className="text-[10px] font-medium leading-tight whitespace-nowrap">{label}</span>
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

