import React, { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAdmin } from '../../hooks/useAdmin.js'
import Avatar from '../../components/ui/Avatar.jsx'

/* ── Breadcrumb map ── */
const BREADCRUMB_MAP = {
  '/admin/dashboard': ['Overview', 'Dashboard'],
  '/admin': ['Overview', 'Dashboard'],
  '/admin/pos': ['Sales & Operations', 'Register'],
  '/admin/orders': ['Sales & Operations', 'Orders'],
  '/admin/schedule': ['Sales & Operations', 'Schedule'],
  '/admin/appointments': ['Sales & Operations', 'Appointments'],
  '/admin/fulfillment': ['Fulfillment', 'Pickup & Delivery'],
  '/admin/pickup': ['Fulfillment', 'Pickup'],
  '/admin/delivery': ['Fulfillment', 'Delivery'],
  '/admin/inventory': ['Store & Catalog', 'Inventory & Products'],
  '/admin/reviews': ['Store & Catalog', 'Reviews'],
  '/admin/customization': ['Store & Catalog', 'Storefront'],
  '/admin/analytics': ['Management', 'Analytics'],
  '/admin/users': ['Management', 'User Management'],
  '/admin/settings': ['Management', 'Settings'],
  '/admin/account': ['Overview', 'Account Settings'],
  '/admin/profile': ['Overview', 'Account Settings'],
}

export default function AdminTopBar({ onToggleMobileMenu, activeTabLabel }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { alerts = [], resolveAlert, currentAdminUser, logoutAdmin } = useAdmin()
  const [showNotifications, setShowNotifications] = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)

  const breadcrumb =
    BREADCRUMB_MAP[location.pathname] ||
    BREADCRUMB_MAP[
      Object.keys(BREADCRUMB_MAP)
        .filter((key) => key !== '/admin' && location.pathname.startsWith(key))
        .sort((a, b) => b.length - a.length)[0]
    ] || ['Overview', 'Dashboard']

  const trail = activeTabLabel ? [breadcrumb[0], breadcrumb[1], activeTabLabel] : breadcrumb

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 md:px-6 flex items-center justify-between gap-4 sticky top-0 z-30 select-none">

      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onToggleMobileMenu}
          className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100 active:scale-95 transition-all cursor-pointer"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-5 h-5">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        <nav className="hidden sm:flex items-center gap-2 text-xs md:text-sm text-slate-400 font-medium truncate">
          {trail.map((crumb, i) => (
            <React.Fragment key={`${crumb}-${i}`}>
              {i > 0 && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-slate-300 shrink-0">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              )}
              <span
                className={
                  i === trail.length - 1
                    ? 'text-slate-900 font-semibold truncate'
                    : 'text-slate-500 font-medium'
                }
              >
                {crumb}
              </span>
            </React.Fragment>
          ))}
        </nav>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3 ml-auto">
        {/* Notification Bell Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowNotifications(!showNotifications)}
            className="w-10 h-10 rounded-xl hover:bg-gray-100 text-slate-600 flex items-center justify-center relative transition-colors cursor-pointer border border-slate-100"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <span className="absolute top-2 right-2 w-2 h-2 bg-brand-orange rounded-full ring-2 ring-white" />
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
                          className="text-[10px] font-semibold text-slate-500 hover:text-slate-900 shrink-0"
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

        {/* Profile Avatar Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-2 p-1 sm:px-1.5 sm:py-1 rounded-md hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <Avatar
              src={currentAdminUser?.avatarImage}
              name={currentAdminUser?.name || 'Admin'}
              size={28}
              className="border border-slate-200"
            />
            <div className="hidden sm:flex flex-col text-left leading-tight">
              <span className="text-xs font-semibold text-slate-900 truncate max-w-[120px]">
                {currentAdminUser?.name || 'Maria Santos'}
              </span>
              <span className="text-[10px] text-slate-400 font-medium truncate max-w-[120px]">
                {currentAdminUser?.role || 'Store Administrator'}
              </span>
            </div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3 text-slate-400 hidden sm:block">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {showProfileMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowProfileMenu(false)} />
              <div className="absolute right-0 mt-1.5 w-60 bg-white rounded-lg border border-slate-200 p-1.5 z-50 animate-slide-up shadow-lg">
                <div className="px-2.5 py-1.5 border-b border-slate-100">
                  <p className="text-xs font-semibold text-gray-900 truncate">
                    {currentAdminUser?.name || 'Maria Santos'}
                  </p>
                  <p className="text-[10px] text-gray-500 truncate">
                    {currentAdminUser?.email || 'm.santos@tindahan.nisko.edu.ph'}
                  </p>
                  <span className="inline-block mt-1 bg-orange-50 text-brand-orange text-[9px] font-semibold uppercase px-2 py-0.5 rounded-md border border-orange-100">
                    {currentAdminUser?.role || 'Store Administrator'}
                  </span>
                </div>
                <div className="py-1 space-y-0.5">
                  <Link
                    to="/admin/account"
                    onClick={() => setShowProfileMenu(false)}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    <span>Account profile</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      logoutAdmin()
                      setShowProfileMenu(false)
                      navigate('/admin/login')
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    <span>Sign out</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}