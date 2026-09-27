import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import React from 'react'
import { useAuth } from '../../hooks/useAuth.js'
import { useMenu } from './MenuSidebar.jsx'
import { fetchNotifications, unreadCount } from '../../services/notifications.js'
import homeIcon from '../../assets/icons/navigation-bar/home.svg'
import cartIcon from '../../assets/icons/navigation-bar/cart.svg'
import bellIcon from '../../assets/icons/common/notification.svg'
import { MenuIcon } from '../ui/Icons.jsx'

/** Tints the flat SVG nav glyphs with the brand orange when active. */
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

const TAB_CLASS =
  'flex flex-col items-center gap-0.5 px-1 py-1 rounded-lg transition-colors ' +
  'flex-1 min-w-0 max-w-[4.5rem] relative'

/* The four ribbon destinations that are real routes; Menu is a drawer toggle. */
const ROUTE_TABS = [
  { to: '/home', label: 'Home', icon: homeIcon, end: true },
  { to: '/cart', label: 'Bag', icon: cartIcon },
  { to: '/appointments', label: 'Appointments', glyph: 'calendar' },
  { to: '/notifications', label: 'Notifications', icon: bellIcon, badge: true },
]

/**
 * Customer ribbon: Home · Bag · Appointments · Notifications · Menu.
 *
 * The four route tabs keep their existing routing and active-state styling; the
 * Menu button only raises the layout's own `isMenuOpen` flag, so the drawer
 * lives in AppShell and the ribbon never unmounts to show it.
 */
function BottomNav() {
  const navigate = useNavigate()
  const { currentUser } = useAuth()
  const { isMenuOpen, open: openMenu } = useMenu()
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
        .then((rows) => {
          if (alive) setUnread(unreadCount(rows))
        })
        .catch(() => {})
    load()
    const timer = setInterval(load, 5000)
    window.addEventListener('notifications-changed', load)
    return () => {
      alive = false
      clearInterval(timer)
      window.removeEventListener('notifications-changed', load)
    }
  }, [currentUser?.cust_id])

  // Guests tapping a protected destination go to sign-in (pushed, so back works).
  const guard = (e, to) => {
    if (!currentUser && to !== '/home') {
      e.preventDefault()
      navigate('/signin')
    }
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[110000] safe-bottom md:bottom-4 lg:hidden">
      <div className="mx-auto max-w-lg md:max-w-xl px-4">
        <div className="flex items-center justify-around bg-white rounded-lg px-2 py-1.5 border border-slate-200">
          {ROUTE_TABS.map(({ to, label, icon, end, badge, glyph }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={(e) => guard(e, to)}
              className={({ isActive }) =>
                `${TAB_CLASS} ${isActive ? 'text-brand-orange font-bold bg-orange-50/50' : 'text-text-muted'}`
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
            onClick={openMenu}
            aria-label="Open menu"
            aria-expanded={isMenuOpen}
            className={`${TAB_CLASS} text-text-muted cursor-pointer`}
          >
            <MenuIcon />
            <span className="text-[11px] font-medium leading-tight whitespace-nowrap">Menu</span>
          </button>
        </div>
      </div>
    </nav>
  )
}

export default React.memo(BottomNav)
