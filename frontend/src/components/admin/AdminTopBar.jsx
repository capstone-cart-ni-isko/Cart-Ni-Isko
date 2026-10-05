import React, { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAdmin } from '../../hooks/useAdmin.js'
import { useTheme } from '../../context/ThemeContext.jsx'
import Avatar from '../../components/ui/Avatar.jsx'
import brandLogo from '../../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'

/* ── Breadcrumb map ── */
const BREADCRUMB_MAP = {
  '/admin/dashboard': ['Overview', 'Dashboard'],
  '/admin': ['Overview', 'Dashboard'],
  '/admin/walkin': ['Sales & Operations', 'Walk-in Orders'],
  '/admin/pos': ['Sales & Operations', 'Walk-in Orders'],
  '/admin/orders': ['Sales & Operations', 'Orders'],
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
  '/admin/enroll': ['Management', 'Enroll Staff'],
  '/admin/settings': ['Management', 'Settings'],
  '/admin/settings/logs': ['Management', 'Access Logs'],
  '/admin/setup': ['Management', 'Store Setup'],
  '/admin/account': ['Overview', 'Account Settings'],
  '/admin/profile': ['Overview', 'Account Settings'],
  '/admin/qr': ['Overview', 'QR Scanner'],
}

/**
 * The ribbon (DOMAIN 3 / REQ-EMP_HOME-05):
 *   left = Tindahan ni Isko logo, center = search bar,
 *   right = exactly 5 icons: home, QR, notifications, dark mode, settings.
 * The dark-mode icon flips to a light-mode icon while dark mode is on
 * (REQ-EMP_HOME-09/10).
 *
 * A slim sub-ribbon below carries the breadcrumb with the back button
 * at the top-left and the exit action at the top-right (NAV RULES 68-75).
 */
export default function AdminTopBar({ onToggleMobileMenu, activeTabLabel }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { alerts = [], resolveAlert, currentAdminUser, logoutAdmin } = useAdmin()
  const { dark, toggle: toggleTheme } = useTheme()
  const [showNotifications, setShowNotifications] = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [confirmExit, setConfirmExit] = useState(false)

  const breadcrumb =
    BREADCRUMB_MAP[location.pathname] ||
    BREADCRUMB_MAP[
      Object.keys(BREADCRUMB_MAP)
        .filter((key) => key !== '/admin' && location.pathname.startsWith(key))
        .sort((a, b) => b.length - a.length)[0]
    ] || ['Overview', 'Dashboard']

  const trail = activeTabLabel ? [breadcrumb[0], breadcrumb[1], activeTabLabel] : breadcrumb

  const isHome = location.pathname === '/admin' || location.pathname === '/admin/dashboard'

  const submitSearch = (e) => {
    e.preventDefault()
    const q = searchQuery.trim()
    if (q) navigate(`/admin/orders?search=${encodeURIComponent(q)}`)
  }

  const handleLogout = () => {
    logoutAdmin()
    setShowProfileMenu(false)
    setConfirmExit(false)
    navigate('/admin/login')
  }

  const iconBtn =
    'w-10 h-10 rounded-xl hover:bg-gray-100 text-slate-600 flex items-center justify-center relative transition-colors cursor-pointer border border-slate-100'

  return (
    <header className="sticky top-0 z-30 select-none">
      {/* ── Ribbon ── */}
      <div className="h-16 bg-white border-b border-slate-200 px-4 md:px-6 flex items-center gap-4">
        {/* LEFT — brand logo */}
        <Link to="/admin/dashboard" className="flex items-center gap-2 shrink-0 min-w-0" title="Tindahan ni Isko">
          <img src={brandLogo} alt="Tindahan ni Isko" className="h-8 w-auto object-contain" />
          <span className="hidden lg:block text-sm font-extrabold text-slate-900 tracking-tight truncate">
            Tindahan ni Isko
          </span>
        </Link>

        {/* CENTER — search bar */}
        <form onSubmit={submitSearch} className="flex-1 max-w-xl mx-auto">
          <div className="relative">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search orders, products, customers…"
              aria-label="Search"
              className="w-full h-9 pl-9 pr-8 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange transition-all"
            />
            <kbd className="hidden sm:flex absolute right-2.5 top-1/2 -translate-y-1/2 items-center px-1.5 py-0.5 rounded border border-slate-200 text-[9px] font-semibold text-slate-400 bg-white">
              ⌘K
            </kbd>
          </div>
        </form>

        {/* RIGHT — exactly 5 icons: home, QR, notifications, dark mode, settings */}
        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          {/* 1 — home */}
          <button
            type="button"
            onClick={() => navigate('/admin/dashboard')}
            title="Home"
            aria-label="Home"
            className={iconBtn + (isHome ? ' text-brand-orange border-brand-orange/30 bg-orange-50' : '')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </button>

          {/* 2 — QR scanner */}
          <button
            type="button"
            onClick={() => navigate('/admin/qr')}
            title="QR scanner"
            aria-label="QR scanner"
            className={iconBtn + (location.pathname === '/admin/qr' ? ' text-brand-orange border-brand-orange/30 bg-orange-50' : '')}
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
          </button>

          {/* 3 — notifications */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowNotifications((prev) => !prev)}
              title="Notifications"
              aria-label="Notifications"
              className={iconBtn}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {alerts.length > 0 && (
                <span className="absolute top-2 right-2 w-2 h-2 bg-brand-orange rounded-full ring-2 ring-white" />
              )}
            </button>

            {showNotifications && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
                <div className="absolute right-0 mt-1.5 w-72 bg-white rounded-lg border border-slate-200 p-3 z-50 animate-slide-up">
                  <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                    <h3 className="text-xs font-semibold text-gray-900">Alerts &amp; notifications</h3>
                    <span className="text-[10px] font-semibold bg-rose-50 text-rose-600 px-2 py-0.5 rounded-md border border-rose-100">
                      {alerts.length} Pending
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto py-1.5 space-y-1.5">
                    {alerts.length === 0 ? (
                      <p className="text-xs text-gray-400 py-3 text-center">All systems operating normally.</p>
                    ) : (
                      alerts.map((alert) => (
                        <div key={alert.id} className="pt-1.5 flex items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-semibold text-gray-900">{alert.title}</p>
                            <p className="text-[11px] text-gray-500">{alert.description}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => resolveAlert(alert.id)}
                            className="text-[10px] font-semibold text-slate-500 hover:text-slate-900 shrink-0 cursor-pointer"
                          >
                            Dismiss
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="pt-2 border-t border-slate-100 text-center">
                    <Link
                      to="/admin/dashboard"
                      onClick={() => setShowNotifications(false)}
                      className="text-xs font-semibold text-slate-500 hover:text-slate-900"
                    >
                      View alert center
                    </Link>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* 4 — dark mode (flips to light-mode icon, REQ-EMP_HOME-09/10) */}
          <button
            type="button"
            onClick={toggleTheme}
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={dark ? 'Light mode' : 'Dark mode'}
            className={iconBtn}
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
          </button>

          {/* 5 — settings */}
          <button
            type="button"
            onClick={() => navigate('/admin/settings')}
            title="Settings"
            aria-label="Settings"
            className={iconBtn + (location.pathname.startsWith('/admin/settings') ? ' text-brand-orange border-brand-orange/30 bg-orange-50' : '')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
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
          <button
            type="button"
            onClick={() => setConfirmExit((prev) => !prev)}
            className="hidden sm:flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
            title="Exit"
            aria-label="Exit"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Exit</span>
          </button>

          {/* Profile chip (opens profile/settings page) */}
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
        </div>
      </div>
    </header>
  )
}
