import { useCallback, useEffect, useState, useRef } from 'react'
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useAdmin } from '../../hooks/useAdmin.js'
import { useTheme } from '../../context/ThemeContext.jsx'
import { fetchNotifications, unreadCount } from '../../services/notifications.js'
import { fetchMyPreferences, updateMyPreferences } from '../../services/settings.js'
import { fetchSearchHistory, recordSearchQuery, clearSearchHistory } from '../../services/products.js'
import BackButton from '../ui/BackButton.jsx'
import brandLogo from '../../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'
import { empHomePath, empIsStaff } from './schema.js'

/** The employee whose saved theme has already been applied this session.
    Module scope (not component state) so a route change cannot re-fetch it -
    but keyed by employee, so signing out and in as someone else hydrates
    THAT person's saved preference instead of inheriting the last one. */
let themeHydratedFor = null

/** One ribbon entry: hit area, active tint, hover chip and optional badge. */
function RibbonIcon({ label, onClick, active, badge, children }) {
  return (
    <div className="relative group flex items-center justify-center">
      <button
        type="button"
        onClick={onClick}
        title={label}
        aria-label={label}
        className={`p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-[var(--surface-3)] transition-all relative flex items-center justify-center cursor-pointer ${
          active
            ? 'bg-orange-50 dark:bg-[var(--tint-brand-bg)] text-brand-orange'
            : 'text-[#757575] dark:text-[var(--muted)]'
        }`}
      >
        {children}
        {badge > 0 && (
          <span className="absolute top-0.5 right-0.5 bg-brand-orange text-white text-[10px] font-black min-w-4 h-4 px-0.5 rounded-full flex items-center justify-center border-2 border-white animate-scale-in">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </button>
      <span className="pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-slate-100 text-slate-800 border border-slate-200 text-2xs font-medium rounded-md opacity-0 group-hover:opacity-100 transition-all duration-150 whitespace-nowrap z-50">
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
 * This is the single header row of the employee portal. The profile icon
 * opens the focused settings page, which lands on its "Profile"
 * tab. On a small screen the ribbon also carries the menu opener for the
 * docked sidebar, so the sidebar stays reachable without a second bar.
 */
export default function AdminTopBar({ onToggleMobileMenu }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { currentAdminUser } = useAdmin()
  const { dark, set: setTheme } = useTheme()
  const currentQ = searchParams.get('q') ?? searchParams.get('search') ?? ''
  const [searchQuery, setSearchQuery] = useState(currentQ)
  const [unreadNotifCount, setUnreadNotifCount] = useState(0)

  useEffect(() => {
    const q = searchParams.get('q') ?? searchParams.get('search')
    if (q !== null && q !== undefined) {
      setSearchQuery(q)
    }
  }, [searchParams])

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

  const [searchFocused, setSearchFocused] = useState(false)
  const [searchHovered, setSearchHovered] = useState(false)
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const searchContainerRef = useRef(null)

  // Load history when search is focused or hovered
  const loadSearchHistory = async () => {
    setLoadingHistory(true)
    try {
      const rows = await fetchSearchHistory()
      setHistory(rows)
    } catch {
      // fallback
    } finally {
      setLoadingHistory(false)
    }
  }

  // Handle outside clicks to exit expanded ribbon overlay mode
  useEffect(() => {
    if (!searchFocused) return undefined
    const handleClickOutside = (e) => {
      // If clicking inside the search bar container or input
      if (searchContainerRef.current && searchContainerRef.current.contains(e.target)) {
        return
      }
      setSearchFocused(false)
    }
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setSearchFocused(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [searchFocused])

  const handleMouseEnterSearch = () => {
    setSearchHovered(true)
    loadSearchHistory()
  }

  const handleMouseLeaveSearch = () => {
    setSearchHovered(false)
  }

  const handleFocusSearch = () => {
    setSearchFocused(true)
    loadSearchHistory()
  }

  const handleSelectHistoryItem = (queryText) => {
    setSearchQuery(queryText)
    setSearchFocused(false)
    setSearchHovered(false)
    recordSearchQuery(queryText.trim()).catch(() => {})
    navigate(`/admin/search?q=${encodeURIComponent(queryText.trim())}`)
  }

  const handleClearAllHistory = async () => {
    await clearSearchHistory()
    setHistory([])
  }

  const handleDeleteHistoryItem = async (e, id) => {
    e.preventDefault()
    e.stopPropagation()
    await clearSearchHistory(id)
    setHistory((prev) => prev.filter((item) => item.id !== id))
  }

  const submitSearch = (e) => {
    e.preventDefault()
    const q = searchQuery.trim()
    setSearchFocused(false)
    setSearchHovered(false)
    if (q) {
      recordSearchQuery(q).catch(() => {})
      navigate(`/admin/search?q=${encodeURIComponent(q)}`)
    } else {
      navigate('/admin/search')
    }
  }

  const isSearchPage = location.pathname === '/admin/search'
  const hasSentSearch = isSearchPage && Boolean(currentQ.trim())
  const isSearchOpen = searchFocused || searchHovered
  const isSearchActiveOrSent = isSearchOpen || hasSentSearch

  const handleBack = () => {
    if (isSearchOpen && !hasSentSearch) {
      setSearchFocused(false)
      setSearchHovered(false)
      return
    }
    if (window.history.length > 1) {
      navigate(-1)
    } else {
      navigate(homePath || '/admin/dashboard')
    }
  }

  // Only the search bar reacts to hover so the other ribbon icons stay visible and clickable.
  return (
    <header
      className="shrink-0 z-30 select-none relative"
      ref={searchContainerRef}
    >
      {/* ── Ribbon (DOMAIN 3) ── */}
      {/* Full page width: the ribbon is the top row of the portal (rule 72).
          When search bar is hovered OR clicked (active) OR search is sent:
          ribbon logo and ribbon icons disappear, search bar expands, back button shows.
          When hover ends (and not clicked/sent), everything goes back to before. */}
      <div className="h-14 bg-white dark:bg-[var(--surface)] border-b border-gray-100 dark:border-[var(--line)] w-full px-4 md:px-6 flex items-center gap-3 relative z-40 transition-all duration-200 ease-out">
        {/* Back button: appears when search is hovered, clicked, or search is sent */}
        <div
          className={`shrink-0 overflow-hidden transition-all duration-200 ease-out flex items-center ${
            isSearchActiveOrSent ? 'max-w-[48px] opacity-100 scale-100' : 'max-w-0 opacity-0 scale-90 pointer-events-none'
          }`}
        >
          <BackButton onClick={handleBack} />
        </div>

        {/* Small-screen menu opener: hidden when search is active or sent */}
        <div
          className={`md:hidden shrink-0 overflow-hidden transition-all duration-200 ease-out flex items-center ${
            !isSearchActiveOrSent ? 'max-w-[40px] opacity-100' : 'max-w-0 opacity-0 pointer-events-none'
          }`}
        >
          <button
            type="button"
            onClick={onToggleMobileMenu}
            className="p-2 -ml-2 rounded-lg text-gray-600 hover:bg-gray-100 cursor-pointer shrink-0"
            aria-label="Open menu"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-5 h-5">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>

        {/* LEFT — brand logo (FLOW-EMP_HOME-02) (hidden when search is active or sent) */}
        <div
          className={`shrink-0 overflow-hidden transition-all duration-200 ease-out flex items-center ${
            !isSearchActiveOrSent ? 'max-w-[200px] opacity-100' : 'max-w-0 opacity-0 pointer-events-none'
          }`}
        >
          <Link to={homePath} className="flex items-center gap-2 shrink-0 min-w-0" title="Tindahan ni Isko">
            <img src={brandLogo} alt="Tindahan ni Isko" className="h-9 object-contain hover:opacity-90 transition-opacity" />
            <span className="hidden lg:block text-sm font-extrabold text-slate-900 dark:text-[var(--ink)] tracking-tight truncate">
              Tindahan ni Isko
            </span>
          </Link>
        </div>

        {/* CENTER — search bar (FLOW-EMP_HOME-03).
            Stays in ribbon position. Expands smoothly and fluidly when hovered, active (clicked), or when search is sent. */}
        <form
          onSubmit={submitSearch}
          onMouseEnter={handleMouseEnterSearch}
          onMouseLeave={handleMouseLeaveSearch}
          className={`flex-1 relative min-w-0 transition-all duration-200 ease-out ${isSearchActiveOrSent ? 'w-full max-w-none' : 'max-w-lg mx-auto'}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-150">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onFocus={handleFocusSearch}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search orders, products, customers..."
            aria-label="Search"
            className={`w-full ${isSearchActiveOrSent ? 'h-10 text-sm pl-10 pr-10' : 'h-9 text-xs pl-9 pr-8'} rounded-xl bg-slate-50 dark:bg-[var(--surface-2)] border border-slate-200 dark:border-[var(--line)] text-slate-900 dark:text-[var(--ink)] placeholder-gray-400 dark:placeholder-[var(--muted-2)] focus:outline-none focus:border-brand-orange focus:bg-white dark:focus:bg-[var(--surface)] transition-all duration-200 ease-out shadow-2xs`}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              aria-label="Clear search"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </form>

        {/* RIGHT — exactly 5 icons (FLOW-EMP_HOME-04) (hidden when search is active, hovered, or sent) */}
        <div
          className={`shrink-0 overflow-hidden transition-all duration-200 ease-out flex items-center ml-auto ${
            !isSearchActiveOrSent ? 'max-w-[320px] opacity-100 scale-100' : 'max-w-0 opacity-0 scale-95 pointer-events-none'
          }`}
        >
          <div className="flex items-center gap-1.5 shrink-0">
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
                  <path d="M3 7V5a2 2 0 0 1 2-2h2" />
                  <path d="M17 3h2a2 2 0 0 1 2 2v2" />
                  <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
                  <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                  <rect x="7" y="7" width="10" height="10" rx="1" />
                </svg>
              </RibbonIcon>
            )}

            {/* 3 — notifications (FLOW-EMP_HOME-08) */}
            <RibbonIcon
              label="Notifications"
              onClick={() => navigate('/admin/notifications')}
              active={location.pathname === '/admin/notifications'}
              badge={unreadNotifCount}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </RibbonIcon>

            {/* 4 — light/dark toggle (FLOW-EMP_HOME-09/10) */}
            <RibbonIcon
              label={dark ? 'Light mode' : 'Dark mode'}
              onClick={handleToggleTheme}
              active={false}
            >
              {dark ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </RibbonIcon>

            {/* 5 — settings (FLOW-EMP_HOME-11) */}
            <RibbonIcon
              label="Settings"
              onClick={() => navigate('/admin/settings')}
              active={location.pathname.startsWith('/admin/settings')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </RibbonIcon>
          </div>
        </div>
      </div>

      {/* ── FULL SCREEN BELOW RIBBON: List of previous searches (latest to oldest) ──
          Requirement: White background, rows not placed in any card or element.
          Appears when hovered or clicked (active). Smooth fluid in-and-out transition. */}
      <div
        className={`fixed inset-x-0 bottom-0 top-14 z-30 bg-white dark:bg-[var(--surface)] overflow-y-auto select-none transition-all duration-200 ease-out ${
          isSearchOpen ? 'opacity-100 pointer-events-auto translate-y-0' : 'opacity-0 pointer-events-none -translate-y-1'
        }`}
      >
          <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[var(--line)]">
              <div className="flex items-center gap-2">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-brand-orange">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[var(--muted)]">
                  Previous Searches
                </h2>
              </div>
              <div className="flex items-center gap-3">
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllHistory}
                    className="text-xs font-semibold text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                  >
                    Clear History
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setSearchFocused(false)
                    setSearchHovered(false)
                  }}
                  className="text-xs font-semibold text-slate-400 hover:text-brand-orange transition-colors cursor-pointer"
                >
                  Close (Esc)
                </button>
              </div>
            </div>

            {loadingHistory ? (
              <div className="space-y-3 py-4">
                <div className="h-10 rounded-lg bg-slate-50 dark:bg-[var(--surface-2)] animate-pulse" />
                <div className="h-10 rounded-lg bg-slate-50 dark:bg-[var(--surface-2)] animate-pulse" />
                <div className="h-10 rounded-lg bg-slate-50 dark:bg-[var(--surface-2)] animate-pulse" />
              </div>
            ) : history.length === 0 ? (
              <div className="py-16 text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-slate-50 dark:bg-[var(--surface-2)] flex items-center justify-center mx-auto text-slate-400">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-slate-800 dark:text-[var(--ink)]">No previous searches</p>
                <p className="text-xs text-slate-400 dark:text-[var(--muted)]">Type your search term and hit Enter to search.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-[var(--line)]">
                {history.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleSelectHistoryItem(item.query)}
                    className="flex items-center justify-between py-3.5 px-2 hover:bg-slate-50/80 dark:hover:bg-[var(--surface-2)] rounded-lg transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-slate-400 dark:text-[var(--muted)] group-hover:text-brand-orange shrink-0 transition-colors">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      <span className="text-sm font-medium text-slate-800 dark:text-[var(--ink)] truncate group-hover:text-brand-orange transition-colors">
                        {item.query}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {item.created_at && (
                        <span className="text-2xs text-slate-400 dark:text-[var(--muted)] hidden sm:inline">
                          {new Date(item.created_at).toLocaleDateString()}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleDeleteHistoryItem(e, item.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                        title="Delete past search"
                        aria-label="Delete past search"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
    </header>
  )
}
