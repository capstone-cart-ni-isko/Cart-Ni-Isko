import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAdmin } from '../../hooks/useAdmin.js'
import { useTheme } from '../../context/ThemeContext.jsx'
import { fetchNotifications, unreadCount } from '../../services/notifications.js'
import { fetchMyPreferences, updateMyPreferences } from '../../services/settings.js'
import brandLogo from '../../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'
import { empHomePath, empIsStaff } from './schema.js'

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
 *   right = home · QR · notifications · dark mode · profile, in that order
 *           (FLOW-EMP_HOME-04, exactly five icons)
 *
 * The dark-mode icon flips to a light-mode icon while dark mode is on
 * (FLOW-EMP_HOME-09/10) and the choice is saved to `emp_darkmode`
 * (FLOW-EMP_SET-05 / REQ-EMP_SET-05).
 *
 * This is the single header row of the employee portal. The profile icon
 * opens the focused settings page, which lands on its "Profile"
 * tab. On a small screen the ribbon also carries the menu opener for the
 * docked sidebar, so the sidebar stays reachable without a second bar.
 */
export default function AdminTopBar({ onToggleMobileMenu }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { currentAdminUser } = useAdmin()
  const { dark, set: setTheme } = useTheme()
  const [searchQuery, setSearchQuery] = useState('')
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

  const homePath = empHomePath(currentAdminUser)

  // FLOW-EMP_HOME-06: the "home" icon goes to THIS employee's home page, which
  // for a staff member is not the Dashboard (REQ-EMP_HOME-01).
  const isHome = location.pathname === homePath || location.pathname === '/admin'

  const submitSearch = (e) => {
    e.preventDefault()
    const q = searchQuery.trim()
    if (q) navigate(`/admin/orders?search=${encodeURIComponent(q)}`)
  }

  return (
    <header className="shrink-0 z-30 select-none">
      {/* ── Ribbon (DOMAIN 3) ── */}
      {/* Full page width: the ribbon is the top row of the portal (rule 72), so
          it never starts after the docked sidebar. */}
      <div className="h-14 bg-white dark:bg-[var(--surface)] border-b border-gray-100 dark:border-[var(--line)] w-full px-4 md:px-6 flex items-center gap-3">
        {/* Small-screen menu opener: the docked sidebar cannot sit beside the
            content on a phone, so this one control opens it as a drawer. */}
        <button
          type="button"
          onClick={onToggleMobileMenu}
          className="md:hidden p-2 -ml-2 rounded-lg text-gray-600 hover:bg-gray-100 cursor-pointer shrink-0"
          aria-label="Open menu"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-5 h-5">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        {/* LEFT — brand logo (FLOW-EMP_HOME-02) */}
        <Link to={homePath} className="flex items-center gap-2 shrink-0 min-w-0" title="Tindahan ni Isko">
          <img src={brandLogo} alt="Tindahan ni Isko" className="h-9 object-contain hover:opacity-90 transition-opacity" />
          <span className="hidden lg:block text-sm font-extrabold text-slate-900 dark:text-[var(--ink)] tracking-tight truncate">
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
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-slate-50 dark:bg-[var(--surface-2)] border border-slate-200 dark:border-[var(--line)] text-xs text-slate-900 dark:text-[var(--ink)] placeholder-gray-400 dark:placeholder-[var(--muted-2)] focus:outline-none focus:border-brand-orange focus:bg-white dark:focus:bg-[var(--surface)] transition-all shadow-2xs"
          />
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

          {/* 2 — QR scanner (FLOW-EMP_HOME-07). Only admins and super admins
              may scan codes; staff never see the icon. */}
          {!empIsStaff(currentAdminUser) && (
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
          )}

          {/* 3 — notifications (FLOW-EMP_HOME-08: clicking the icon opens the
              notification tab). */}
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

          {/* 5 — profile (FLOW-EMP_PROF-01 / FLOW-EMP_SET-01): opens the
              focused settings page, which lands on its "Profile" tab. */}
          <RibbonIcon
            label="Profile"
            onClick={() => navigate('/admin/settings')}
            active={location.pathname.startsWith('/admin/settings')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </RibbonIcon>
        </div>
      </div>
    </header>
  )
}
