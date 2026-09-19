import React, { useState, useRef, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAdmin } from '../../hooks/useAdmin.js'
import avatarImg from '../../assets/avatar.png'

/* ── Breadcrumb map ── */
const BREADCRUMB_MAP = {
  '/admin/dashboard': ['Overview', 'Dashboard'],
  '/admin': ['Overview', 'Dashboard'],
  '/admin/pos': ['Sales & Operations', 'Register'],
  '/admin/orders': ['Sales & Operations', 'Orders'],
  '/admin/fulfillment': ['Sales & Operations', 'Pickup & Delivery'],
  '/admin/schedule': ['Sales & Operations', 'Schedule'],
  '/admin/appointments': ['Sales & Operations', 'Staff Appointments'],
  '/admin/inventory': ['Store & Catalog', 'Inventory & Products'],
  '/admin/reviews': ['Store & Catalog', 'Reviews'],
  '/admin/customization': ['Store & Catalog', 'Storefront'],
  '/admin/settings': ['Management', 'Settings'],
  '/admin/analytics': ['Management', 'Analytics'],
  '/admin/users': ['Management', 'User Management'],
  '/admin/account': ['Overview', 'Account Settings'],
  '/admin/profile': ['Overview', 'Account Settings'],
}

export default function AdminTopBar({ onToggleMobileMenu }) {
  const navigate = useNavigate()
  const location = useLocation()
  const {
    adminState = {},
    resolveAlert,
    currentAdminUser,
    logoutAdmin,
  } = useAdmin()
  const [showNotifications, setShowNotifications] = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)

  const alerts = adminState?.alerts || []
  const breadcrumb = BREADCRUMB_MAP[location.pathname] || ['Overview', 'Dashboard']

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 md:px-6 flex items-center justify-between gap-4 sticky top-0 z-30 select-none shadow-2xs">
      {/* Left: Mobile Hamburger + Breadcrumb */}
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

        {/* Breadcrumb Trail */}
        <nav className="hidden sm:flex items-center gap-2 text-xs md:text-sm text-slate-400 font-medium truncate">
          <span className="text-slate-500 font-semibold">{breadcrumb[0]}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-slate-300 shrink-0">
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span className="text-slate-900 font-bold truncate">{breadcrumb[1]}</span>
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

          {/* Notifications Dropdown Panel */}
          {showNotifications && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowNotifications(false)}
              />
              <div className="absolute right-0 mt-1.5 w-72 bg-white rounded-lg border border-slate-200 p-3 z-50 animate-slide-up">
                <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900">
                    Alerts & Notifications
                  </h3>
                  <span className="text-[10px] font-bold bg-rose-50 text-rose-600 px-2 py-0.5 rounded-md border border-rose-100">
                    {alerts.length} Pending
                  </span>
                </div>
                <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto py-1.5 space-y-1.5">
                  {alerts.length === 0 ? (
                    <p className="text-xs text-gray-400 py-3 text-center">
                      All systems operating normally.
                    </p>
                  ) : (
                    alerts.map((alert) => (
                      <div
                        key={alert.id}
                        className="pt-1.5 flex items-start justify-between gap-2"
                      >
                        <div>
                          <p className="text-xs font-bold text-gray-900">
                            {alert.title}
                          </p>
                          <p className="text-[11px] text-gray-500">
                            {alert.description}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => resolveAlert(alert.id)}
                          className="text-[10px] font-bold text-brand-orange hover:underline shrink-0"
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
                    className="text-xs font-bold text-brand-orange hover:underline"
                  >
                    View Alert Center
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
            {currentAdminUser?.avatarImage || avatarImg ? (
              <img
                src={currentAdminUser?.avatarImage || avatarImg}
                alt="Admin"
                className="w-7 h-7 rounded-full object-cover border border-slate-200 shrink-0"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-brand-orange text-white font-bold text-[10px] flex items-center justify-center border border-orange-200 shrink-0">
                {currentAdminUser?.avatar || 'MS'}
              </div>
            )}
            <div className="hidden sm:flex flex-col text-left leading-tight">
              <span className="text-xs font-bold text-slate-900 truncate max-w-[120px]">
                {currentAdminUser?.name || 'Maria Santos'}
              </span>
              <span className="text-[10px] text-slate-400 font-medium truncate max-w-[120px]">
                {currentAdminUser?.role || 'Store Administrator'}
              </span>
            </div>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="w-3 h-3 text-slate-400 hidden sm:block"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {/* Profile Menu Dropdown */}
          {showProfileMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowProfileMenu(false)}
              />
              <div className="absolute right-0 mt-1.5 w-60 bg-white rounded-lg border border-slate-200 p-1.5 z-50 animate-slide-up shadow-lg">
                <div className="px-2.5 py-1.5 border-b border-slate-100">
                  <p className="text-xs font-bold text-gray-900 truncate">
                    {currentAdminUser?.name || 'Maria Santos'}
                  </p>
                  <p className="text-[10px] text-gray-500 truncate">
                    {currentAdminUser?.email || 'm.santos@tindahan.nisko.edu.ph'}
                  </p>
                  <span className="inline-block mt-1 bg-orange-50 text-brand-orange text-[9px] font-bold uppercase px-2 py-0.5 rounded-md border border-orange-100">
                    {currentAdminUser?.role || 'Store Administrator'}
                  </span>
                </div>
                <div className="py-1 space-y-0.5">
                  <Link
                    to="/admin/account"
                    onClick={() => setShowProfileMenu(false)}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-semibold text-gray-700 hover:bg-orange-50 hover:text-brand-orange transition-colors"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    <span>Account Profile</span>
                  </Link>
                  <Link
                    to="/admin/users"
                    onClick={() => setShowProfileMenu(false)}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    <span>User Management</span>
                  </Link>
                  <Link
                    to="/admin/customization"
                    onClick={() => setShowProfileMenu(false)}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </svg>
                    <span>Store Settings</span>
                  </Link>
                  <Link
                    to="/admin/login"
                    onClick={() => {
                      logoutAdmin()
                      setShowProfileMenu(false)
                    }}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    <span>Sign Out</span>
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
