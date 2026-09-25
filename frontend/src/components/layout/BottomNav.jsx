import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import React from 'react'
import { useAuth } from '../../hooks/useAuth.js'
import { useTheme } from '../../context/ThemeContext.jsx'
import { fetchNotifications, unreadCount } from '../../services/notifications.js'
import Avatar from '../ui/Avatar.jsx'
import homeIcon from '../../assets/icons/navigation-bar/home.svg'
import cartIcon from '../../assets/icons/navigation-bar/cart.svg'
import bellIcon from '../../assets/icons/common/notification.svg'
import logoutIcon from '../../assets/icons/profile/log-out.svg'

/** Tints the flat PNG/SVG nav glyphs with the brand orange when active. */
const ORANGE = 'invert(48%) sepia(79%) saturate(2476%) hue-rotate(346deg) brightness(100%) contrast(96%)'

function Glyph({ src, active }) {
  return <img src={src} alt="" className="w-5 h-5" style={{ filter: active ? ORANGE : 'none' }} />
}

function CalendarGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
    </svg>
  )
}

function MenuGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-5 h-5">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  )
}

function WishlistGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  )
}

function OrdersGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  )
}

const TABS = [
  { to: '/home', label: 'Home', icon: homeIcon, end: true },
  { to: '/cart', label: 'Bag', icon: cartIcon },
  { to: '/appointments', label: 'Appointment', glyph: 'calendar' },
  { to: '/notifications', label: 'Notifications', icon: bellIcon, badge: true },
]

/**
 * Customer ribbon: Home · Bag · Appointment · Notifications · Menu.
 * The Menu button opens the left drawer with the profile, theme, wishlist,
 * orders and logout shortcuts.
 */
function BottomNav() {
  const navigate = useNavigate()
  const { currentUser, logout } = useAuth()
  const { dark, toggle } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const [unread, setUnread] = useState(0)

  // CUSTNOTIF unread badge: rows with no custnotif_read stamp are unread.
  useEffect(() => {
    if (!currentUser?.cust_id) {
      setUnread(0)
      return undefined
    }
    let alive = true
    const load = () =>
      fetchNotifications('customer', currentUser.cust_id)
        .then((rows) => { if (alive) setUnread(unreadCount(rows)) })
        .catch(() => {})
    const refresh = () => { if (alive) load() }
    load()
    const timer = setInterval(refresh, 5000)
    window.addEventListener('notifications-changed', refresh)
    return () => {
      alive = false
      clearInterval(timer)
      window.removeEventListener('notifications-changed', refresh)
    }
  }, [currentUser?.cust_id])

  // Guests tapping a protected tab go to sign-in (pushed, so back works).
  const go = (to) => {
    if (!currentUser && to !== '/home') navigate('/signin')
    else navigate(to)
  }

  const guard = (e, to) => {
    if (!currentUser && to !== '/home') {
      e.preventDefault()
      navigate('/signin')
    }
  }

  const openTab = (to) => {
    setMenuOpen(false)
    go(to)
  }

  const handleLogout = async () => {
    setMenuOpen(false)
    await logout()
    navigate('/home')
  }

  const menuItems = [
    {
      key: 'profile',
      label: 'Profile',
      icon: currentUser
        ? (
          <Avatar
            name={currentUser.fullName}
            src={currentUser.cust_photo || currentUser.photo}
            size={20}
            userId={currentUser.cust_id}
            className="w-5 h-5"
          />
        )
        : <Glyph src={homeIcon} active={false} />,
      onClick: () => openTab('/profile'),
    },
    {
      key: 'theme',
      label: dark ? 'Light Mode' : 'Dark Mode',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
          {dark
            ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>
            : <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />}
        </svg>
      ),
      onClick: toggle,
    },
    { key: 'wishlist', label: 'Wishlist', icon: <WishlistGlyph />, onClick: () => openTab('/wishlist') },
    { key: 'orders', label: 'Orders', icon: <OrdersGlyph />, onClick: () => openTab('/orders') },
    {
      key: 'logout',
      label: currentUser ? 'Logout' : 'Sign in',
      icon: <Glyph src={currentUser ? logoutIcon : homeIcon} active={false} />,
      onClick: () => (currentUser ? handleLogout() : openTab('/signin')),
    },
  ]

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-[110000] safe-bottom md:bottom-4 lg:hidden">
        <div className="mx-auto max-w-lg md:max-w-xl px-4">
          <div className="flex items-center justify-around bg-white rounded-lg px-2 py-1.5 border border-slate-200">
            {TABS.map(({ to, label, icon, glyph, end, badge }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={(e) => guard(e, to)}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 px-1 py-1 rounded-md transition-colors flex-1 min-w-0 max-w-[4.5rem] relative ${
                    isActive ? 'text-brand-orange font-bold bg-orange-50/50' : 'text-text-muted'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="relative">
                      {glyph === 'calendar' ? <CalendarGlyph /> : <Glyph src={icon} active={isActive} />}
                      {badge && unread > 0 && (
                        <span className="absolute -top-1.5 -right-2 min-w-4 h-4 px-1 rounded-full bg-[#FF6A00] text-white text-[9px] font-black flex items-center justify-center">
                          {unread > 99 ? '99+' : unread}
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] font-medium leading-tight whitespace-nowrap">{label}</span>
                  </>
                )}
              </NavLink>
            ))}

            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              className="flex flex-col items-center gap-0.5 px-1 py-1 rounded-md transition-colors flex-1 min-w-0 max-w-[4.5rem] text-text-muted cursor-pointer"
            >
              <MenuGlyph />
              <span className="text-[11px] font-medium leading-tight whitespace-nowrap">Menu</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Left drawer opened by the Menu button */}
      {menuOpen && (
        <div className="fixed inset-0 z-[130000]">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 bg-black/40 cursor-pointer"
          />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white border-r border-slate-200 p-4 flex flex-col gap-2 animate-fade-in overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-black text-gray-900 uppercase tracking-wider">Menu</span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="w-8 h-8 rounded-md bg-gray-50 text-gray-500 flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            {menuItems.map(({ key, label, icon, onClick, badge }) => (
              <button
                key={key}
                type="button"
                onClick={onClick}
                className="flex items-center gap-3 w-full px-3 py-3 rounded-lg bg-gray-50 border border-gray-100 text-sm font-bold text-gray-700 hover:bg-gray-100 transition-colors text-left cursor-pointer relative"
              >
                <span className="w-5 h-5 flex items-center justify-center shrink-0">{icon}</span>
                <span className="truncate flex-1">{label}</span>
                {badge && badge > 0 && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 min-w-5 h-5 px-1.5 rounded-full bg-[#FF6A00] text-white text-[10px] font-black flex items-center justify-center">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </button>
            ))}
          </aside>
        </div>
      )}
    </>
  )
}

export default React.memo(BottomNav)