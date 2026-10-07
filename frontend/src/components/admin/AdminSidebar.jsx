import { useState, useRef, useEffect, useMemo } from 'react'
import { NavLink, Link, useNavigate } from 'react-router-dom'
import { useAdmin } from '../../hooks/useAdmin.js'
import { mapOrderRows } from '../../services/dashboard.js'
import { empCateg, empHomePath, empIsStaff } from './schema.js'
import brandLogo from '../../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'

const ICON = 'w-4 h-4'

/*
 * FLOW-EMP_HOME-05 — the sidebar holds, top to bottom:
 * Dashboard, Walk-in Orders, Appointments, Orders, Products,
 * Reviews, Sales, Staff, Logout.
 *
 * REQ-EMP_HOME-01 — when emp_categ is 'staff', the Dashboard,
 * Walk-in Orders, Reviews and Sales entries must NOT render.
 */
function buildNavItems() {
  return [
    {
      to: '/admin/dashboard',
      label: 'Dashboard',
      hideForStaff: true,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
        </svg>
      ),
    },
    {
      to: '/admin/walkin',
      label: 'Walk-in Orders',
      hideForStaff: true,
      // POST /pos/* is admin-only in the API, so staff never open it.
      roles: ['ADMIN', 'SUPER_ADMIN'],
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
          <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
      ),
    },
    {
      to: '/admin/appointments',
      label: 'Appointments',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <polyline points="9 16 11 18 15 14" />
        </svg>
      ),
    },
    {
      to: '/admin/orders',
      label: 'Orders',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
          <circle cx="9" cy="21" r="1" />
          <circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
        </svg>
      ),
    },
    {
      to: '/admin/inventory',
      label: 'Products',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      ),
    },
    {
      to: '/admin/reviews',
      label: 'Reviews',
      hideForStaff: true,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ),
    },
    {
      to: '/admin/analytics',
      label: 'Sales',
      hideForStaff: true,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      ),
    },
    {
      to: '/admin/staff',
      label: 'Staff',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
  ]
}

export default function AdminSidebar({ onCloseMobile }) {
  const navigate = useNavigate()
  const { orders: rawOrders = [], products = [], currentAdminUser, logoutAdmin } = useAdmin()
  // Live rows for the ⌘K search palette (server-backed, refreshed by context).
  const liveOrders = useMemo(() => mapOrderRows(rawOrders), [rawOrders])

  const roleKey = currentAdminUser?.roleKey || (empCateg(currentAdminUser) === 'super admin' ? 'SUPER_ADMIN' : empCateg(currentAdminUser) === 'admin' ? 'ADMIN' : 'STAFF')
  // REQ-EMP_HOME-01 — a 'staff' category employee is a regular staff member,
  // so the Dashboard / Walk-in / Reviews / Sales entries never render for them.
  const isStaff = empIsStaff(currentAdminUser)
  // Where this employee's "home" leads (Dashboard for admins, Orders for
  // staff) - every logo/home link in the portal uses the same answer.
  const homePath = empHomePath(currentAdminUser)

  // FLOW-EMP_HOME-05 + REQ-EMP_HOME-01
  const navItems = useMemo(() => {
    const items = buildNavItems()
    return items.filter((item) => {
      if (item.hideForStaff && isStaff) return false
      if (item.roles && !item.roles.includes(roleKey)) return false
      return true
    })
  }, [isStaff, roleKey])

  // FLOW-EMP_HOME-05 — the docked sidebar is always fully open: its labels
  // (Dashboard … Logout) stay visible on every employee page, so there is no
  // collapsed/icon-only state any more.
  const isCollapsed = false

  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const searchInputRef = useRef(null)

  const smallIcon = 'w-4 h-4'

  const displayedItems = searchQuery.trim()
    ? [
        ...liveOrders
          .filter((o) =>
            o.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            o.customer.toLowerCase().includes(searchQuery.toLowerCase())
          )
          .slice(0, 3)
          .map((o) => ({
            id: o.id, type: 'order', title: o.id, subtitle: o.customer,
            link: `/admin/orders?search=${encodeURIComponent(o.id)}`,
            icon: (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={smallIcon}>
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
            ),
            iconBg: 'bg-blue-50 text-blue-600',
          })),
        ...products
          .filter((p) => (p.name || '').toLowerCase().includes(searchQuery.toLowerCase()))
          .slice(0, 3)
          .map((p) => ({
            id: p.id, type: 'product', title: p.name, subtitle: `In Stock (${p.totalStock ?? 0})`,
            link: `/admin/inventory?search=${encodeURIComponent(p.name)}`,
            icon: (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={smallIcon}>
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
            ),
            iconBg: 'bg-slate-100 text-slate-600',
          })),
        // Schedule deep link so the page stays reachable from the ribbon search.
        {
          id: 'schedule', type: 'page', title: 'Employee Schedule', subtitle: 'Schedules & availability',
          link: '/admin/schedules',
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={smallIcon}>
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          ),
          iconBg: 'bg-orange-50 text-brand-orange',
        },
      ]
    : []

  const handleSelectItem = (item) => {
    navigate(item.link)
    setIsSearchModalOpen(false)
    setSearchQuery('')
  }

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    if (displayedItems[selectedIndex]) {
      handleSelectItem(displayedItems[selectedIndex])
    } else if (searchQuery.trim()) {
      navigate(`/admin/orders?search=${encodeURIComponent(searchQuery.trim())}`)
      setIsSearchModalOpen(false)
      setSearchQuery('')
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % Math.max(displayedItems.length, 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev - 1 + displayedItems.length) % Math.max(displayedItems.length, 1))
    } else if (e.key === 'Escape') {
      setIsSearchModalOpen(false)
    }
  }

  useEffect(() => {
    if (isSearchModalOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus()
        setSelectedIndex(0)
      }, 50)
    }
  }, [isSearchModalOpen])

  useEffect(() => {
    function handleGlobalKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setIsSearchModalOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [])

  // DOMAIN 16 — confirmation dialog, then logout and redirect to the login page.
  const handleLogout = () => {
    logoutAdmin()
    setConfirmLogout(false)
    onCloseMobile?.()
    navigate('/admin/login')
  }

  return (
    <aside
      className={`${
        isCollapsed ? 'w-20' : 'w-60'
      } bg-white border-r border-slate-200 flex flex-col h-full select-none transition-[width] duration-300 ease-in-out`}
    >
      <div className="flex flex-col flex-1 min-h-0">
        {/* Brand Header */}
        <div className="p-3 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center justify-between w-full min-w-0">
            <Link to={homePath} className="flex items-center min-w-0" title="Tindahan ni Isko">
              <img src={brandLogo} alt="Tindahan ni Isko" className="h-8 w-auto object-contain" />
            </Link>
            {onCloseMobile && (
              <button
                type="button"
                onClick={onCloseMobile}
                className="md:hidden p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                aria-label="Close menu"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Sidebar Search */}
        <div className="px-3 pt-3 pb-1">
          <button
            type="button"
            onClick={() => setIsSearchModalOpen(true)}
            className="w-full h-8 flex items-center gap-2 px-2.5 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-400 hover:border-slate-300 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 shrink-0">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span className="flex-1 text-left truncate">Search...</span>
          </button>
        </div>

        {/* Search Command Palette Modal */}
        {isSearchModalOpen && (
          <div
            className="fixed inset-0 z-[99999] bg-black/60 flex items-start justify-center pt-20 sm:pt-28 px-4 animate-fade-in"
            onClick={() => setIsSearchModalOpen(false)}
          >
            <div
              className="bg-white w-full max-w-lg sm:max-w-xl rounded-lg border border-slate-200 overflow-hidden animate-scale-in"
              onClick={(e) => e.stopPropagation()}
            >
              <form onSubmit={handleSearchSubmit} className="flex items-center px-3.5 py-2.5 gap-2.5 border-b border-slate-100">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-slate-400 shrink-0">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search orders, products, customers..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setSelectedIndex(0)
                  }}
                  onKeyDown={handleKeyDown}
                  className="w-full text-xs text-slate-900 placeholder-slate-400 bg-transparent focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setIsSearchModalOpen(false)}
                  className="px-1.5 py-0.5 text-[10px] font-medium text-slate-400 bg-slate-100 hover:bg-slate-200 rounded border border-slate-200/80 transition-colors uppercase cursor-pointer shrink-0"
                >
                  ESC
                </button>
              </form>

              <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
                <span className="text-[10px] font-medium text-slate-400 uppercase">
                  {searchQuery.trim() ? 'Search results' : 'Start typing to search'}
                </span>
                <span className="text-[10px] text-slate-400 font-medium">Quick jump</span>
              </div>

              <div className="px-2.5 pb-2.5 space-y-0.5 max-h-64 overflow-y-auto">
                {displayedItems.length === 0 ? (
                  <p className="text-xs text-slate-400 py-5 text-center">
                    {searchQuery.trim() ? 'No matching results found.' : 'Search orders and products by name or ID.'}
                  </p>
                ) : (
                  displayedItems.map((item, index) => (
                    <div
                      key={`${item.id}-${index}`}
                      onClick={() => handleSelectItem(item)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${
                        selectedIndex === index ? 'bg-slate-50' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${item.iconBg}`}>
                        {item.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-900 truncate">{item.title}</p>
                        <p className="text-[11px] text-slate-400 font-normal truncate">{item.subtitle}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 bg-slate-50/40 text-[10px] text-slate-400 font-medium select-none">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <span className="px-1 py-0.5 rounded border border-slate-200/90 font-mono bg-white text-slate-500">↑</span>
                    <span className="px-1 py-0.5 rounded border border-slate-200/90 font-mono bg-white text-slate-500">↓</span>
                    <span className="ml-0.5">Navigate</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="px-1 py-0.5 rounded border border-slate-200/90 font-mono bg-white text-slate-500">↵</span>
                    <span className="ml-0.5">Select</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation — FLOW-EMP_HOME-05 */}
        <nav className="p-2.5 space-y-3 overflow-y-auto flex-1 scrollbar-none">
          <div className="space-y-0.5">
            {!isCollapsed && (
              <div className="px-2.5 pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 select-none">
                Menu
              </div>
            )}
            <div className="space-y-0.5">
              {navItems.map(({ to, label, icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={onCloseMobile}
                  title={isCollapsed ? label : undefined}
                  className={({ isActive }) =>
                    `flex items-center ${
                      isCollapsed ? 'justify-center px-2 py-2' : 'gap-2.5 px-2.5 py-1.5'
                    } rounded-md text-[13px] font-semibold transition-all duration-150 ${
                      isActive
                        ? 'bg-brand-orange/10 text-brand-orange'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`
                  }
                >
                  <span className="shrink-0">{icon}</span>
                  {!isCollapsed && <span className="truncate">{label}</span>}
                </NavLink>
              ))}
            </div>

            {/* Logout — last entry, with confirmation (DOMAIN 16) */}
            <div className={!isCollapsed ? 'pt-2 mt-2 border-t border-slate-100' : 'pt-2'}>
              <button
                type="button"
                onClick={() => setConfirmLogout(true)}
                title={isCollapsed ? 'Logout' : undefined}
                className="flex items-center w-full gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] font-semibold text-rose-600 hover:bg-rose-50 transition-all duration-150 cursor-pointer"
              >
                <span className="shrink-0 flex justify-center">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                </span>
                {!isCollapsed && <span className="truncate">Logout</span>}
              </button>
            </div>
          </div>
        </nav>
      </div>

      {/* Logout confirmation dialog (DOMAIN 16) */}
      {confirmLogout && (
        <div className="fixed inset-0 z-[99999] bg-black/50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-xl max-w-sm w-full border border-slate-200 p-5 shadow-xl animate-scale-in">
            <h3 className="text-sm font-bold text-slate-900">Sign out?</h3>
            <p className="text-xs text-slate-500 mt-1">
              Your staff session ends immediately and you will be redirected to the login page.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setConfirmLogout(false)}
                className="h-8 px-3.5 rounded-md bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="h-8 px-3.5 rounded-md bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 cursor-pointer"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
