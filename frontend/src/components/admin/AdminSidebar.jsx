import { useState, useRef, useEffect } from 'react'
import { NavLink, Link, useNavigate } from 'react-router-dom'
import { useAdmin } from '../../hooks/useAdmin.js'
import brandLogo from '../../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'

const ICON = 'w-4 h-4'

const navSections = [
  {
    title: 'Overview',
    items: [
      {
        to: '/admin/dashboard',
        label: 'Dashboard',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
          </svg>
        ),
      },
    ],
  },
  {
    title: 'Sales & Operations',
    items: [
      {
        to: '/admin/pos',
        label: 'Register',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
            <rect x="6" y="2" width="12" height="4" rx="1" />
            <path d="M10 6v3" />
            <path d="M14 6v3" />
            <path d="M4 14l1.8-5h12.4l1.8 5" />
            <rect x="3" y="14" width="18" height="7" rx="1.5" />
            <line x1="9.5" y1="18" x2="14.5" y2="18" />
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
        to: '/admin/schedule',
        label: 'Schedule',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        ),
      },
      {
        to: '/admin/appointments',
        label: 'Appointments',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="8.5" cy="7" r="4" />
            <polyline points="17 11 19 13 23 9" />
          </svg>
        ),
      },
    ],
  },
  {
    title: 'Fulfillment',
    items: [
      {
        to: '/admin/pickup',
        label: 'Pickup',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        ),
      },
      {
        to: '/admin/delivery',
        label: 'Delivery',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
            <rect x="1" y="3" width="15" height="13" />
            <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
            <circle cx="5.5" cy="18.5" r="2.5" />
            <circle cx="18.5" cy="18.5" r="2.5" />
          </svg>
        ),
      },
    ],
  },
  {
    title: 'Store & Catalog',
    items: [
      {
        to: '/admin/inventory',
        label: 'Inventory & Products',
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
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        ),
      },
      {
        to: '/admin/customization',
        label: 'Storefront',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
            <path d="M2 9h20" />
            <path d="M2 9l3-6h14l3 6" />
            <path d="M4 9v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9" />
            <path d="M9 22V14h6v8" />
          </svg>
        ),
      },
    ],
  },
  {
    title: 'Management',
    items: [
      {
        to: '/admin/analytics',
        label: 'Analytics',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
        ),
      },
      {
        to: '/admin/users',
        label: 'User Management',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        ),
      },
      {
        to: '/admin/settings',
        label: 'Settings',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        ),
      },
    ],
  },
]

/* Panel-style collapse toggle */
function PanelIcon({ className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="9" y1="4" x2="9" y2="20" />
    </svg>
  )
}

export default function AdminSidebar({
  onCloseMobile,
  isCollapsed: controlledIsCollapsed,
  onToggleCollapse: controlledToggleCollapse,
}) {
  const navigate = useNavigate()
  const { adminState = {} } = useAdmin()
  const [internalCollapsed, setInternalCollapsed] = useState(false)

  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const searchInputRef = useRef(null)

  const isCollapsed =
    controlledIsCollapsed !== undefined ? controlledIsCollapsed : internalCollapsed
  const onToggleCollapse =
    controlledToggleCollapse || (() => setInternalCollapsed((prev) => !prev))

  const smallIcon = 'w-4 h-4'

  const defaultRecentSearches = [
    {
      id: 'ord-9402', type: 'order', title: '#ORD-9402', subtitle: 'Juan Dela Cruz',
      link: '/admin/orders?search=ORD-9402',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={smallIcon}>
          <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
      ),
      iconBg: 'bg-blue-50 text-blue-600',
    },
    {
      id: 'prod-coffee', type: 'product', title: 'Organic Roast Coffee', subtitle: 'In Stock (45)',
      link: '/admin/inventory?search=Organic Roast Coffee',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={smallIcon}>
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      ),
      iconBg: 'bg-slate-100 text-slate-600',
    },
    {
      id: 'user-maria', type: 'customer', title: 'Maria Santos', subtitle: '14 Total Orders',
      link: '/admin/orders?search=Maria Santos',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={smallIcon}>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      ),
      iconBg: 'bg-slate-100 text-slate-600',
    },
  ]

  const displayedItems = searchQuery.trim()
    ? [
        ...(adminState.orders || [])
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
        ...(adminState.products || [])
          .filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
          .slice(0, 3)
          .map((p) => ({
            id: p.id, type: 'product', title: p.name, subtitle: `In Stock (${p.stock})`,
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

  useEffect(() => {
    if (isSearchModalOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50)
      setSelectedIndex(0)
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

  return (
    <aside
      className={`${
        isCollapsed ? 'w-20' : 'w-60'
      } bg-white border-r border-slate-200 flex flex-col h-full select-none transition-[width] duration-300 ease-in-out`}
    >
      <div className="flex flex-col flex-1 min-h-0">
        {/* Brand Header */}
        <div
          className={`p-3 border-b border-slate-100 flex items-center ${
            isCollapsed ? 'flex-col gap-2 justify-center' : 'justify-between'
          }`}
        >
          {!isCollapsed ? (
            <div className="flex items-center justify-between w-full min-w-0">
              <Link to="/admin/dashboard" className="flex items-center min-w-0">
                <img src={brandLogo} alt="Tindahan ni Isko" className="h-8 w-auto object-contain" />
              </Link>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onToggleCollapse}
                  title="Collapse sidebar"
                  aria-label="Collapse sidebar"
                  className="hidden md:flex items-center justify-center w-7 h-7 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  <PanelIcon />
                </button>

                {onCloseMobile && (
                  <button
                    type="button"
                    onClick={onCloseMobile}
                    className="md:hidden p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-0.5 w-full">
              <Link
                to="/admin/dashboard"
                title="Tindahan ni Isko"
                className="w-9 h-9 rounded-md bg-orange-50 border border-orange-100 flex items-center justify-center p-1 hover:bg-orange-100 transition-colors"
              >
                <img src={brandLogo} alt="Tindahan ni Isko" className="h-full w-auto object-contain" />
              </Link>
              <button
                type="button"
                onClick={onToggleCollapse}
                title="Expand sidebar"
                aria-label="Expand sidebar"
                className="hidden md:flex items-center justify-center w-7 h-7 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <PanelIcon />
              </button>
            </div>
          )}
        </div>

        {/* Sidebar Search */}
        <div className="px-3 pt-3 pb-1">
          {!isCollapsed ? (
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
          ) : (
            <button
              type="button"
              onClick={() => setIsSearchModalOpen(true)}
              title="Search"
              className="w-8 h-8 mx-auto flex items-center justify-center rounded-md bg-slate-50 border border-slate-200 text-slate-400 hover:bg-slate-100 hover:border-slate-300 transition-colors cursor-pointer"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
          )}
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
                  {searchQuery.trim() ? 'Search results' : 'Recent searches'}
                </span>
                <span className="text-[10px] text-slate-400 font-medium">Quick jump</span>
              </div>

              <div className="px-2.5 pb-2.5 space-y-0.5 max-h-64 overflow-y-auto">
                {displayedItems.length === 0 ? (
                  <p className="text-xs text-slate-400 py-5 text-center">No matching results found.</p>
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

        {/* Navigation */}
        <nav className="p-2.5 space-y-3 overflow-y-auto flex-1 scrollbar-none">
          {navSections.map((section, secIdx) => (
            <div key={section.title} className="space-y-0.5">
              {!isCollapsed ? (
                <div className="px-2.5 pt-1 pb-0.5 text-[10px] font-medium uppercase tracking-wider text-gray-400 select-none">
                  {section.title}
                </div>
              ) : secIdx > 0 ? (
                <div className="my-1.5 border-t border-slate-100" />
              ) : null}

              <div className="space-y-0.5">
                {section.items.map(({ to, label, icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={onCloseMobile}
                    title={isCollapsed ? label : undefined}
                    className={({ isActive }) =>
                      `flex items-center ${
                        isCollapsed ? 'justify-center px-2 py-2' : 'gap-2.5 px-2.5 py-1.5'
                      } rounded-md text-xs font-medium transition-all duration-150 ${
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
            </div>
          ))}
        </nav>
      </div>
    </aside>
  )
}