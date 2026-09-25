import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.js'
import React from 'react'
import homeIcon from '../../assets/icons/navigation-bar/home.svg'
import ordersIcon from '../../assets/icons/navigation-bar/orders.svg'
import wishlistIcon from '../../assets/icons/navigation-bar/wishlist.svg'
import cartIcon from '../../assets/icons/navigation-bar/cart.svg'
import profileIcon from '../../assets/icons/navigation-bar/profile.svg'

const navItems = [
  { to: '/home', label: 'Home', icon: homeIcon, end: true },
  { to: '/orders', label: 'Orders', icon: ordersIcon },
  { to: '/wishlist', label: 'Wishlist', icon: wishlistIcon },
  { to: '/cart', label: 'Bag', icon: cartIcon },
  { to: '/profile', label: 'Me', icon: profileIcon },
]

function BottomNav() {
  const navigate = useNavigate()
  const { currentUser } = useAuth()

  // Guests tapping a protected tab go to sign-in (pushed, so back works).
  const handleGuest = (e, to) => {
    if (!currentUser && to !== '/home') {
      e.preventDefault()
      navigate('/signin')
    }
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[110000] safe-bottom md:bottom-4 lg:hidden">
      <div className="mx-auto max-w-lg md:max-w-xl px-4">
        <div className="flex items-center justify-around bg-white rounded-lg px-2 py-1.5 border border-slate-200">
          {navItems.map(({ to, label, icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={(e) => handleGuest(e, to)}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-1 py-1 rounded-md transition-colors flex-1 min-w-0 max-w-[4.5rem] relative ${
                  isActive ? 'text-brand-orange font-bold bg-orange-50/50' : 'text-text-muted'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <img
                    src={icon}
                    alt=""
                    className="w-5 h-5"
                    style={{
                      filter: isActive
                        ? 'invert(48%) sepia(79%) saturate(2476%) hue-rotate(346deg) brightness(100%) contrast(96%)'
                        : 'none',
                    }}
                  />
                  <span className="text-[11px] font-medium leading-tight whitespace-nowrap">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  )
}

export default React.memo(BottomNav)

