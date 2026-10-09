import React, { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAdmin } from '../../hooks/useAdmin.js'
import { useTheme } from '../../context/ThemeContext.jsx'
import Avatar from '../../components/ui/Avatar.jsx'
import { fetchNotifications, unreadCount } from '../../services/notifications.js'
import { fetchMyPreferences, updateMyPreferences } from '../../services/settings.js'
import brandLogo from '../../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'
import { empHomePath } from './schema.js'

/* ── Breadcrumb map ── */
const BREADCRUMB_MAP = {
  '/admin/dashboard': ['Overview', 'Dashboard'],
  '/admin': ['Overview', 'Dashboard'],
  '/admin/walkin': ['Sales & Operations', 'Walk-in Orders'],
  '/admin/pos': ['Sales & Operations', 'Walk-in Orders'],
  '/admin/orders': ['Sales & Operations', 'Orders'],
  '/admin/schedules': ['Sales & Operations', 'Schedule'],
  '/admin/schedule': ['Sales & Operations', 'Schedule'],
  '/admin/appointments': ['Sales & Operations', 'Appointments'],
  '/admin/fulfillment': ['Fulfillment', 'Pickup & Delivery'],
  '/admin/pickup': ['Fulfillment', 'Pickup'],
  '/admin/delivery': ['Fulfillment', 'Delivery'],
  '/admin/inventory': ['Store & Catalog', 'Products'],
  '/admin/reviews': ['Store & Catalog', 'Reviews'],
  '/admin/customization': ['Store & Catalog', 'Storefront'],
  '/admin/analytics': ['Management', 'Sales'],
  '/admin/users': ['Management', 'Staff'],
  '/admin/staff': ['Management', 'Staff'],
  '/admin/enroll': ['Management', 'Enroll Staff'],
  '/admin/settings': ['Management', 'Settings'],
  '/admin/settings/logs': ['Management', 'Access Logs'],
  '/admin/setup': ['Management', 'Store Setup'],
  '/admin/account': ['Overview', 'Account Settings'],
  '/admin/profile': ['Overview', 'Account Settings'],
  '/admin/notifications': ['Overview', 'Notifications'],
  '/admin/qr': ['Overview', 'QR Scanner'],
}

/** The employee whose saved theme has already been applied this session.
    Module scope (not component state) so a route change cannot re-fetch it -
    but keyed by employee, so signing out and in as someone else hydrates
    THAT person's saved preference instead of inheriting the last one. */
let themeHydratedFor = null

// Same geometry as the customer ribbon: a 40px hit area, 20px glyph.
const ICON_BTN =
  'p-2 rounded-lg hover:bg-slate-100 transition-all relative flex items-center justify-center'

/** One ribbon entry: hit area, active tint, hover chip and optional badge. */
function RibbonIcon({ label, onClick, active, badge, children }) {
  return (
    <div className="relative group flex items-center justify-center">
      <button
        type="button"
        onClick={onClick}
        title={label}
        aria-label={label}
        className={`${ICON_BTN} ${active ? 'bg-slate-100 text-brand-orange' : ''}`}
      >
        {children}
        {badge > 0 && (
          <span className="absolute top-0.5 right-0.5 bg-brand-orange text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-white animate-scale-in">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </button>
      <span className="pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-slate-100 text-slate-800 border border-slate-200 text-[10px] font-medium rounded-md opacity-0 group-hover:opacity-100 transition-all duration-150 whitespace-nowrap z-50">
        {label}
      </span>
    </div>
  )
}

/**
 * DOMAIN 3 / DOMAIN 31 - the navigation ribbon:
 *   left  = "Tindahan ni Isko" logo (FLOW-EMP_HOME-02)
 *   center = search bar, centermost (FLOW-EMP_HOME-03)
 *   right = home · QR · notifications · dark mode · settings, in that order
 *           (FLOW-EMP_HOME-04, exactly five icons)
 *
 * The dark-mode icon flips to a light-mode icon while dark mode is on
 * (FLOW-EMP_HOME-09/10) and the choice is saved to `emp_darkmode`
 * (FLOW-EMP_SET-05 / REQ-EMP_SET-05).
 *
 * The ribbon itself, its spacing, its tooltip chips and its badge geometry
 * mirror the customer portal's DesktopHeader, so both portals share one set
 * of fonts and one visual language (REQ-CUST_HOME-01's admin twin).
 */
export default function AdminTopBar({ onToggleMobileMenu, activeTabLabel }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { currentAdminUser, logoutAdmin } = useAdmin()
  const { dark, set: setTheme } = useTheme()
  const [searchQuery, setSearchQuery] = useState('')
  const [confirmExit, setConfirmExit] = useState(false)
  const [unreadNotifCount, setUnreadNotifCount] = useState(0)

  const empId = currentAdminUser?.id ?? null

  /* ── DOMAIN 31 — real-time unread counter on the ribbon icon ── */
  const refreshUnread = useCallback(async () => {
    if (!empId) {
      setUnreadNotifCount(0)
      return
    }
    try {
      const rows = await fetchNotifications('employee', empId)
      setUnreadNotifCount(unreadCount(rows))
    } catch {
      // Keep the last known count when the API is unreachable.
    }
  }, [empId])

  useEffect(() => {
    refreshUnread()
    if (!empId) return undefined
    const timer = setInterval(refreshUnread, 60000)
    const onChanged = () => refreshUnread()
    window.addEventListener('notifications-changed', onChanged)
    return () => {
      clearInterval(timer)
      window.removeEventListener('notifications-changed', onChanged)
    }
  }, [empId, refreshUnread])

  /* ── FLOW-EMP_SET-05 / REQ-EMP_SET-03 — the saved theme follows the
        employee across sessions: hydrate once, then save on every flip. ── */
  useEffect(() => {
    if (!empId) {
      // A signed-out ribbon re-arms the hydration for the next employee.
      themeHydratedFor = null
      return undefined
    }
    if (themeHydratedFor === empId) return undefined
    themeHydratedFor = empId
    let cancelled = false
    fetchMyPreferences()
      .then((prefs) => {
        const stored = prefs?.emp_darkmode ?? prefs?.darkmode
        if (!cancelled && typeof stored === 'boolean') setTheme(stored)
      })
      .catch(() => {
        // The local theme still applies when the API is unreachable.
      })
    return () => {
      cancelled = true
    }
  }, [empId, setTheme])

  const handleToggleTheme = () => {
    const next = !dark
    setTheme(next)
    if (empId) {
      updateMyPreferences({ darkmode: next }).catch(() => {})
    }
  }

  const breadcrumb =
    BREADCRUMB_MAP[location.pathname] ||
    BREADCRUMB_MAP[
      Object.keys(BREADCRUMB_MAP)
        .filter((key) => key !== '/admin' && location.pathname.startsWith(key))
        .sort((a, b) => b.length - a.length)[0]
    ] || ['Overview', 'Dashboard']

  const trail = activeTabLabel ? [breadcrumb[0], breadcrumb[1], activeTabLabel] : breadcrumb

  const homePath = empHomePath(currentAdminUser)

  // FLOW-EMP_HOME-06: the "home" icon goes to THIS employee's home page, which
  // for a staff member is not the Dashboard (REQ-EMP_HOME-01).
  const isHome = location.pathname === homePath || location.pathname === '/admin'

  const submitSearch = (e) => {
    e.preventDefault()
    const q = searchQuery.trim()
    if (q) navigate(`/admin/orders?search=${encodeURIComponent(q)}`)
  }

  const handleLogout = () => {
    logoutAdmin()
    setConfirmExit(false)
    navigate('/admin/login')
  }

  return (
    <header className="shrink-0 z-30 select-none">
      {/* ── Ribbon (DOMAIN 3) ── */}
      {/* Full page width: the ribbon is the top row of the portal (rule 72), so
          it never starts after the docked sidebar. */}
      <div className="h-14 bg-white border-b border-gray-100 w-full px-4 md:px-6 flex items-center gap-4">
        {/* LEFT — brand logo (FLOW-EMP_HOME-02) */}
        <Link to={homePath} className="flex items-center gap-2 shrink-0 min-w-0" title="Tindahan ni Isko">
          <img src={brandLogo} alt="Tindahan ni Isko" className="h-9 object-contain hover:opacity-90 transition-opacity" />
          <span className="hidden lg:block text-sm font-extrabold text-slate-900 tracking-tight truncate">
            Tindahan ni Isko
          </span>
        </Link>

        {/* CENTER — search bar (FLOW-EMP_HOME-03). min-w-0 lets it shrink on
            narrow viewports instead of pushing the five ribbon icons out. */}
        <form onSubmit={submitSearch} className="flex-1 max-w-lg mx-auto relative min-w-0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search orders, products, customers..."
            aria-label="Search"
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-slate-50 border border-slate-200 text-xs placeholder-gray-400 focus:outline-none focus:border-brand-orange focus:bg-white transition-all shadow-2xs"
          />
          <kbd className="hidden sm:flex absolute right-2.5 top-1/2 -translate-y-1/2 items-center px-1.5 py-0.5 rounded border border-slate-200 text-[9px] font-semibold text-slate-400 bg-white">
            ⌘K
          </kbd>
        </form>

        {/* RIGHT — exactly 5 icons (FLOW-EMP_HOME-04) */}
        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          {/* 1 — home (FLOW-EMP_HOME-06) */}
          <RibbonIcon label="Home" onClick={() => navigate(homePath)} active={isHome}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </RibbonIcon>

          {/* 2 — QR scanner (FLOW-EMP_HOME-07) */}
          <RibbonIcon
            label="QR scanner"
            onClick={() => navigate('/admin/qr')}
            active={location.pathname === '/admin/qr'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <path d="M14 14h3v3h-3z" />
              <path d="M21 14v1" />
              <path d="M21 21v-4" />
              <path d="M14 21h1" />
              <path d="M18 18h3v3h-3z" />
            </svg>
          </RibbonIcon>

          {/* 3 — notifications (FLOW-EMP_HOME-08: clicking the icon REDIRECTS
              to the notification tab; the popover it used to toggle held no
              notifications of its own.) */}
          <RibbonIcon
            label="Notifications"
            onClick={() => {
              refreshUnread()
              navigate('/admin/notifications')
            }}
            active={location.pathname === '/admin/notifications'}
            badge={unreadNotifCount}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </RibbonIcon>

          {/* 4 — dark mode (FLOW-EMP_HOME-09/10, FLOW-EMP_SET-05) */}
          <RibbonIcon
            label={dark ? 'Light mode' : 'Dark mode'}
            onClick={handleToggleTheme}
            active={dark}
          >
            {dark ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2" />
                <path d="M12 20v2" />
                <path d="M4.93 4.93l1.41 1.41" />
                <path d="M17.66 17.66l1.41 1.41" />
                <path d="M2 12h2" />
                <path d="M20 12h2" />
                <path d="M4.93 19.07l1.41-1.41" />
                <path d="M17.66 6.34l1.41-1.41" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </RibbonIcon>

          {/* 5 — settings (FLOW-EMP_PROF-01 / FLOW-EMP_SET-01) */}
          <RibbonIcon
            label="Settings"
            onClick={() => navigate('/admin/settings')}
            active={location.pathname.startsWith('/admin/settings')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </RibbonIcon>
        </div>
      </div>

      {/* ── Sub-ribbon: back (top-left) · breadcrumb · exit (top-right) ── */}
      <div className="h-10 bg-white/80 backdrop-blur border-b border-slate-100 px-4 md:px-6 flex items-center gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onToggleMobileMenu}
            className="md:hidden p-1.5 rounded-lg text-gray-600 hover:bg-gray-100 cursor-pointer"
            aria-label="Open menu"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          {!isHome && (
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors cursor-pointer"
              title="Back"
              aria-label="Back"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}

          <nav className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 font-medium truncate">
            {trail.map((crumb, i) => (
              <React.Fragment key={`${crumb}-${i}`}>
                {i > 0 && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 text-slate-300 shrink-0">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                )}
                <span className={i === trail.length - 1 ? 'text-slate-900 font-semibold truncate' : 'text-slate-500 font-medium'}>
                  {crumb}
                </span>
              </React.Fragment>
            ))}
          </nav>
        </div>

        {/* EXIT — top-right (DOMAIN 16: confirmation dialog, then logout) */}
        <div className="ml-auto relative flex items-center gap-2">
          {confirmExit && (
            <div className="absolute right-0 top-8 w-64 bg-white rounded-lg border border-slate-200 shadow-lg p-3 z-50 animate-slide-up">
              <p className="text-xs font-semibold text-slate-900">Sign out of the admin portal?</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Your session ends on all devices.</p>
              <div className="flex justify-end gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => setConfirmExit(false)}
                  className="h-7 px-3 rounded-md bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="h-7 px-3 rounded-md bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 cursor-pointer"
                >
                  Sign out
                </button>
              </div>
            </div>
          )}
          {/* Profile chip (FLOW-EMP_PROF-01 — the settings screen holds the profile) */}
          <button
            type="button"
            onClick={() => navigate('/admin/account')}
            className="flex items-center gap-2 p-1 rounded-md hover:bg-gray-100 transition-colors cursor-pointer"
            title="Account"
            aria-label="Account"
          >
            <Avatar
              src={currentAdminUser?.avatarImage}
              name={currentAdminUser?.name || 'Admin'}
              size={26}
              className="border border-slate-200"
              userId={currentAdminUser?.id}
            />
          </button>

          {/* Rule 70 — the exit button sits at the TOP RIGHT, i.e. it is the
              last (rightmost) control of the ribbon, and rule 68 keeps it on
              screen at every width (it used to vanish below `sm`). */}
          <button
            type="button"
            onClick={() => setConfirmExit((prev) => !prev)}
            className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
            title="Exit"
            aria-label="Exit"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span className="hidden sm:inline">Exit</span>
          </button>
        </div>
      </div>

    </header>
  )
}
