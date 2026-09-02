import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAdmin } from '../../hooks/useAdmin.js'
import avatarImg from '../../assets/avatar.png'

export default function AdminTopBar({ onToggleMobileMenu }) {
  const navigate = useNavigate()
  const {
    adminState = {},
    resolveAlert,
    currentAdminUser,
    logoutAdmin,
  } = useAdmin()
  const [showNotifications, setShowNotifications] = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [globalSearch, setGlobalSearch] = useState('')
  const [isDarkMode, setIsDarkMode] = useState(false)

  const alerts = adminState?.alerts || []

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    if (globalSearch.trim()) {
      navigate(`/admin/orders?search=${encodeURIComponent(globalSearch.trim())}`)
    }
  }

  return (
    <header className="h-18 bg-white border-b border-gray-100 px-4 md:px-8 flex items-center justify-between gap-4 sticky top-0 z-30 select-none">
      {/* Mobile Hamburger + Page Title on Mobile */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleMobileMenu}
          className="md:hidden p-2 rounded-xl text-gray-600 hover:bg-gray-100 active:scale-95 transition-all"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-5 h-5">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        {/* Global Search Bar */}
        <form onSubmit={handleSearchSubmit} className="hidden sm:block relative w-72 lg:w-96">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            placeholder="Search orders, products, customers..."
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            className="w-full h-10 pl-10 pr-4 rounded-xl bg-gray-50 border border-gray-200/80 text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange transition-all"
          />
        </form>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2.5 sm:gap-3.5">
        {/* Quick link to customer storefront */}
        <Link
          to="/home"
          className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-gray-700 bg-gray-100 hover:bg-orange-50 hover:text-brand-orange transition-all border border-gray-200/60"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
          </svg>
          <span>Storefront View</span>
        </Link>

        {/* Dark mode toggle */}
        <button
          type="button"
          onClick={() => setIsDarkMode(!isDarkMode)}
          title="Toggle Dark Mode"
          className="w-9 h-9 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-600 flex items-center justify-center transition-colors"
        >
          {isDarkMode ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-amber-500">
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
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>

        {/* Notification Bell Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowNotifications(!showNotifications)}
            className="w-9 h-9 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-600 flex items-center justify-center relative transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {alerts.length > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center border-2 border-white animate-scale-in">
                {alerts.length}
              </span>
            )}
          </button>

          {/* Notifications Dropdown Panel */}
          {showNotifications && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowNotifications(false)}
              />
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 p-4 z-50 animate-slide-up">
                <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                  <h3 className="text-xs font-black uppercase tracking-wider text-gray-900">
                    Alerts & Notifications
                  </h3>
                  <span className="text-[10px] font-bold bg-rose-50 text-rose-600 px-2 py-0.5 rounded-full">
                    {alerts.length} Pending
                  </span>
                </div>
                <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto py-2 space-y-2">
                  {alerts.length === 0 ? (
                    <p className="text-xs text-gray-400 py-4 text-center">
                      All systems operating normally.
                    </p>
                  ) : (
                    alerts.map((alert) => (
                      <div
                        key={alert.id}
                        className="pt-2 flex items-start justify-between gap-2"
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
                <div className="pt-2 border-t border-gray-100 text-center">
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
            className="flex items-center gap-2 p-1 rounded-full hover:bg-gray-100 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-brand-orange text-white font-black text-xs flex items-center justify-center border border-orange-200">
              {currentAdminUser?.avatar || 'SA'}
            </div>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="w-3.5 h-3.5 text-gray-500 hidden sm:block"
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
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 p-2 z-50 animate-slide-up">
                <div className="px-3 py-2 border-b border-gray-100">
                  <p className="text-xs font-black text-gray-900">
                    {currentAdminUser?.name || 'Super Admin'}
                  </p>
                  <p className="text-[10px] text-gray-500">
                    {currentAdminUser?.email || 'superadmin@bicol-u.edu.ph'}
                  </p>
                  <span className="inline-block mt-1 bg-orange-50 text-brand-orange text-[9px] font-black uppercase px-2 py-0.5 rounded-md">
                    {currentAdminUser?.role || 'Super Admin'}
                  </span>
                </div>
                <div className="py-1 space-y-0.5">
                  <Link
                    to="/admin/users"
                    onClick={() => setShowProfileMenu(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <span>User Management</span>
                  </Link>
                  <Link
                    to="/admin/customization"
                    onClick={() => setShowProfileMenu(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <span>Store Settings</span>
                  </Link>
                  <Link
                    to="/admin/login"
                    onClick={() => {
                      logoutAdmin()
                      setShowProfileMenu(false)
                    }}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50"
                  >
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
