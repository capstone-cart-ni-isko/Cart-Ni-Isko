import React, { useState, useRef, useEffect } from 'react'
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
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  const searchInputRef = useRef(null)
  const alerts = adminState?.alerts || []

  // Default recent searches directly matching the screenshot
  const defaultRecentSearches = [
    {
      id: 'ord-9402',
      type: 'order',
      title: '#ORD-9402',
      subtitle: 'Juan Dela Cruz',
      link: '/admin/orders?search=ORD-9402',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
          <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
      ),
      iconBg: 'bg-blue-50 text-blue-600',
    },
    {
      id: 'prod-coffee',
      type: 'product',
      title: 'Organic Roast Coffee',
      subtitle: 'In Stock (45)',
      link: '/admin/inventory?search=Organic Roast Coffee',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      ),
      iconBg: 'bg-slate-100 text-slate-600',
    },
    {
      id: 'user-maria',
      type: 'customer',
      title: 'Maria Santos',
      subtitle: '14 Total Orders',
      link: '/admin/orders?search=Maria Santos',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      ),
      iconBg: 'bg-slate-100 text-slate-600',
    },
  ]

  // Filter dynamic and recent items based on input
  const displayedItems = searchQuery.trim()
    ? [
        ...(adminState.orders || [])
          .filter(
            (o) =>
              o.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
              o.customer.toLowerCase().includes(searchQuery.toLowerCase())
          )
          .slice(0, 3)
          .map((o) => ({
            id: o.id,
            type: 'order',
            title: o.id,
            subtitle: o.customer,
            link: `/admin/orders?search=${encodeURIComponent(o.id)}`,
            icon: (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
            ),
            iconBg: 'bg-blue-50 text-blue-600',
          })),
        ...(adminState.products || [])
          .filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
          .slice(0, 3)
          .map((p) => ({
            id: p.id,
            type: 'product',
            title: p.name,
            subtitle: `In Stock (${p.stock})`,
            link: `/admin/inventory?search=${encodeURIComponent(p.name)}`,
            icon: (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
            ),
            iconBg: 'bg-slate-100 text-slate-600',
          })),
        ...defaultRecentSearches.filter(
          (item) =>
            item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.subtitle.toLowerCase().includes(searchQuery.toLowerCase())
        ),
      ]
    : defaultRecentSearches

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

  // Focus input when modal opens
  useEffect(() => {
    if (isSearchModalOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50)
      setSelectedIndex(0)
    }
  }, [isSearchModalOpen])

  // Global Ctrl+K / Cmd+K shortcut
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

  return (
    <header className="h-18 bg-white border-b border-gray-100 px-4 md:px-8 flex items-center justify-between gap-4 sticky top-0 z-30 select-none">
      {/* Mobile Hamburger */}
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
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2.5 sm:gap-3.5 ml-auto">
        {/* Search Icon Button next to Notifications */}
        <button
          type="button"
          onClick={() => setIsSearchModalOpen(true)}
          title="Search orders, products, customers... (Ctrl+K)"
          className="w-9 h-9 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-600 flex items-center justify-center transition-colors cursor-pointer"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>

        {/* Search Modal / Command Palette */}
        {isSearchModalOpen && (
          <div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-start justify-center pt-20 sm:pt-28 px-4 animate-fade-in"
            onClick={() => setIsSearchModalOpen(false)}
          >
            <div
              className="bg-white w-full max-w-lg sm:max-w-xl rounded-2xl shadow-2xl border border-slate-100 overflow-hidden animate-scale-in"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Search Bar Input Row */}
              <form onSubmit={handleSearchSubmit} className="flex items-center px-4 py-3.5 gap-3 border-b border-slate-100">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-slate-400 shrink-0">
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
                  className="w-full text-sm text-slate-900 placeholder-slate-400 bg-transparent focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setIsSearchModalOpen(false)}
                  className="px-2 py-0.5 text-[10px] font-semibold text-slate-400 bg-slate-100 hover:bg-slate-200 rounded border border-slate-200/80 transition-colors uppercase cursor-pointer shrink-0"
                >
                  ESC
                </button>
              </form>

              {/* Header Label */}
              <div className="flex items-center justify-between px-5 pt-4 pb-2">
                <span className="text-[11px] font-semibold text-slate-400 tracking-wider uppercase">
                  {searchQuery.trim() ? 'SEARCH RESULTS' : 'RECENT SEARCHES'}
                </span>
                <span className="text-xs text-slate-400 font-medium">Quick Jump</span>
              </div>

              {/* Items List */}
              <div className="px-3 pb-3 space-y-1 max-h-72 overflow-y-auto">
                {displayedItems.length === 0 ? (
                  <p className="text-xs text-slate-400 py-6 text-center">
                    No matching results found.
                  </p>
                ) : (
                  displayedItems.map((item, index) => (
                    <div
                      key={`${item.id}-${index}`}
                      onClick={() => handleSelectItem(item)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={`flex items-center gap-3.5 p-2.5 rounded-xl cursor-pointer transition-colors ${
                        selectedIndex === index ? 'bg-slate-50' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${item.iconBg}`}>
                        {item.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-900 truncate">
                          {item.title}
                        </p>
                        <p className="text-[11px] text-slate-400 font-normal truncate">
                          {item.subtitle}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Footer Row (Omitted powered by Store Engine as requested) */}
              <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50/40 text-[11px] text-slate-400 font-medium select-none">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1">
                    <span className="px-1.5 py-0.5 rounded border border-slate-200/90 text-[10px] font-mono bg-white text-slate-500 shadow-2xs">↑</span>
                    <span className="px-1.5 py-0.5 rounded border border-slate-200/90 text-[10px] font-mono bg-white text-slate-500 shadow-2xs">↓</span>
                    <span className="ml-1">Navigate</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="px-1.5 py-0.5 rounded border border-slate-200/90 text-[10px] font-mono bg-white text-slate-500 shadow-2xs">↵</span>
                    <span className="ml-1">Select</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Notification Bell Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowNotifications(!showNotifications)}
            className="w-9 h-9 rounded-xl hover:bg-gray-100 text-slate-500 flex items-center justify-center relative transition-colors cursor-pointer"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-brand-orange rounded-full ring-2 ring-white" />
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
            className="flex items-center gap-2.5 p-1 sm:px-2 sm:py-1 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer"
          >
            {avatarImg ? (
              <img
                src={avatarImg}
                alt="Admin"
                className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-brand-orange text-white font-black text-xs flex items-center justify-center border border-orange-200 shrink-0">
                {currentAdminUser?.avatar || 'SA'}
              </div>
            )}
            <div className="hidden sm:flex flex-col text-left leading-tight">
              <span className="text-xs font-bold text-slate-900">
                Admin
              </span>
              <span className="text-[10px] text-slate-400 font-medium">
                Super Admin
              </span>
            </div>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="w-3.5 h-3.5 text-slate-400 hidden sm:block"
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
