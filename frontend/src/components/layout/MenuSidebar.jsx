/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.js'
import { useTheme } from '../../context/ThemeContext.jsx'
import Avatar from '../ui/Avatar.jsx'
import {
  CloseIcon,
  HeartIcon,
  LogOutIcon,
  MoonIcon,
  PackageIcon,
  SunIcon,
  UserIcon,
} from '../ui/Icons.jsx'

/* The panel sits above the overlay, which sits above the page, and slides with
   a plain translateX transform so it is off-screen whenever it is closed. */
const PANEL =
  'fixed inset-y-0 right-0 z-[130000] w-72 max-w-[85vw] bg-white dark:bg-slate-900 border-l border-slate-200 p-4 flex flex-col gap-2 overflow-y-auto transition-transform duration-300 ease-out'
const OVERLAY = 'fixed inset-0 z-[120000] bg-black/40 transition-opacity duration-300'

const MenuContext = createContext(null)

/**
 * Owns `isMenuOpen` for the whole layout, one level above the ribbon, so the
 * ribbon only ever raises a flag and never unmounts or re-renders to show the
 * drawer. Pages that render their own <BottomNav/> (checkout, account) stay
 * wired up through `useMenu()` without passing anything by hand.
 */
export function MenuProvider({ children }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const open = useCallback(() => setIsMenuOpen(true), [])
  const close = useCallback(() => setIsMenuOpen(false), [])
  const value = useMemo(() => ({ isMenuOpen, open, close }), [isMenuOpen, open, close])

  return <MenuContext.Provider value={value}>{children}</MenuContext.Provider>
}

export function useMenu() {
  return useContext(MenuContext) || { isMenuOpen: false, open: () => {}, close: () => {} }
}

/**
 * Right-hand menu drawer, always mounted and moved out of view with
 * `translateX` so opening and closing both animate.
 *
 * Exactly five vertical entries: Profile (avatar), theme toggle, Wishlist,
 * Orders, Logout.
 */
function MenuSidebar() {
  const navigate = useNavigate()
  const { currentUser, logout } = useAuth()
  const { dark, toggle: toggleTheme } = useTheme()
  const { isMenuOpen, close } = useMenu()

  // Escape closes the drawer.
  useEffect(() => {
    if (!isMenuOpen) return undefined
    const onKey = (e) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isMenuOpen, close])

  // Guests are sent to sign-in; the ribbon's own guard stays the source of truth.
  const go = (to) => {
    close()
    if (!currentUser) navigate('/signin')
    else navigate(to)
  }

  const handleLogout = async () => {
    close()
    await logout()
    // `replace` so Back on the login screen can never re-enter an
    // authenticated page; its own Back button goes to the homepage.
    navigate('/signin', { replace: true })
  }

  const items = [
    {
      key: 'profile',
      label: 'Profile',
      icon: currentUser ? (
        <Avatar
          name={currentUser.fullName}
          src={currentUser.cust_photo || currentUser.avatarImage}
          size={24}
          userId={currentUser.cust_id}
          className="w-6 h-6 rounded-full"
        />
      ) : (
        <UserIcon />
      ),
      onClick: () => go('/profile'),
    },
    {
      key: 'theme',
      // Light theme -> offer Dark Mode; dark theme -> offer Light Mode.
      label: dark ? 'Light Mode' : 'Dark Mode',
      icon: dark ? <SunIcon /> : <MoonIcon />,
      onClick: () => {
        toggleTheme()
        close()
      },
    },
    { key: 'wishlist', label: 'Wishlist', icon: <HeartIcon />, onClick: () => go('/wishlist') },
    { key: 'orders', label: 'Orders', icon: <PackageIcon />, onClick: () => go('/orders') },
    { key: 'logout', label: 'Logout', icon: <LogOutIcon className="w-5 h-5 text-red-500" />, onClick: handleLogout },
  ]

  return (
    <>
      <button
        type="button"
        aria-label="Close menu"
        tabIndex={isMenuOpen ? 0 : -1}
        onClick={close}
        className={`${OVERLAY} cursor-pointer ${isMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        aria-hidden={!isMenuOpen}
        className={`${PANEL} ${isMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">Menu</span>
          <button
            type="button"
            onClick={close}
            aria-label="Close menu"
            className="w-8 h-8 rounded-lg bg-gray-50 dark:bg-slate-800 text-gray-500 flex items-center justify-center cursor-pointer"
          >
            <CloseIcon />
          </button>
        </div>

        {items.map(({ key, label, icon, onClick }) => (
          <button
            key={key}
            type="button"
            onClick={onClick}
            className="flex items-center gap-3 w-full px-3 py-3 rounded-lg bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 text-sm font-bold text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors text-left cursor-pointer"
          >
            <span className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center shrink-0">
              {icon}
            </span>
            <span className="truncate flex-1">{label}</span>
          </button>
        ))}
      </aside>
    </>
  )
}

export default MenuSidebar
