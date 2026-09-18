import { useState } from 'react'
import { NavLink, Link, useNavigate } from 'react-router-dom'
import { useAdmin } from '../../hooks/useAdmin.js'
import brandLogo from '../../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'

const navSections = [
  {
    title: 'Overview',
    items: [
      {
        to: '/admin/dashboard',
        label: 'Dashboard',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
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
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            {/* Cash register display screen */}
            <rect x="6" y="2" width="12" height="4" rx="1" />
            <path d="M10 6v3" />
            <path d="M14 6v3" />
            {/* Angled keyboard body */}
            <path d="M4 14l1.8-5h12.4l1.8 5" />
            {/* Drawer */}
            <rect x="3" y="14" width="18" height="7" rx="1.5" />
            <line x1="9.5" y1="18" x2="14.5" y2="18" />
            {/* Keypad indicators */}
            <circle cx="8" cy="11.5" r="0.75" fill="currentColor" />
            <circle cx="12" cy="11.5" r="0.75" fill="currentColor" />
            <circle cx="16" cy="11.5" r="0.75" fill="currentColor" />
          </svg>
        ),
      },
      {
        to: '/admin/orders',
        label: 'Orders',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <circle cx="9" cy="21" r="1" />
            <circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
          </svg>
        ),
      },
      {
        to: '/admin/fulfillment',
        label: 'Pickup & Delivery',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <rect x="1" y="3" width="15" height="13" />
            <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
            <circle cx="5.5" cy="18.5" r="2.5" />
            <circle cx="18.5" cy="18.5" r="2.5" />
          </svg>
        ),
      },
      {
        to: '/admin/schedule',
        label: 'Schedule',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        ),
      },
      {
        to: '/admin/appointments',
        label: 'Staff Appointments',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
            <path d="M9 16l2 2 4-4" />
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
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
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
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        ),
      },
      {
        to: '/admin/customization',
        label: 'Storefront',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
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
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
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
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        ),
      },
    ],
  },
]

export default function AdminSidebar({
  onCloseMobile,
  isCollapsed: controlledIsCollapsed,
  onToggleCollapse: controlledToggleCollapse,
}) {
  const navigate = useNavigate()
  const { currentAdminUser, logoutAdmin } = useAdmin()
  const [internalCollapsed, setInternalCollapsed] = useState(false)

  const isCollapsed =
    controlledIsCollapsed !== undefined ? controlledIsCollapsed : internalCollapsed
  const onToggleCollapse =
    controlledToggleCollapse || (() => setInternalCollapsed((prev) => !prev))

  const handleSignOut = () => {
    logoutAdmin()
    navigate('/admin/login')
  }

  return (
    <aside
      className={`${
        isCollapsed ? 'w-20' : 'w-64'
      } bg-white border-r border-gray-100 flex flex-col justify-between h-full select-none transition-[width] duration-300 ease-in-out`}
    >
      {/* Top Section */}
      <div className="flex flex-col min-h-0">
        {/* Brand Header */}
        <div
          className={`p-4 border-b border-gray-100 flex items-center ${
            isCollapsed ? 'flex-col gap-2 justify-center' : 'justify-between'
          }`}
        >
          {!isCollapsed ? (
            <div className="flex items-center justify-between w-full min-w-0">
              <Link to="/admin/dashboard" className="flex flex-col items-start gap-1 min-w-0">
                <img
                  src={brandLogo}
                  alt="Tindahan ni Isko"
                  className="h-9 w-auto object-contain"
                />
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-brand-orange bg-orange-50 px-2 py-0.5 rounded-md border border-orange-100">
                  Staff Portal
                </span>
              </Link>
              <div className="flex items-center gap-1">
                {/* Desktop Collapsible Toggle: <| icon */}
                <button
                  type="button"
                  onClick={onToggleCollapse}
                  title="Collapse Sidebar (<|)"
                  aria-label="Collapse Sidebar"
                  className="hidden md:flex items-center justify-center w-8 h-8 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-4 h-4"
                  >
                    <polyline points="15 18 9 12 15 6" />
                    <line x1="5" y1="6" x2="5" y2="18" />
                  </svg>
                </button>

                {/* Mobile Drawer Close */}
                {onCloseMobile && (
                  <button
                    type="button"
                    onClick={onCloseMobile}
                    className="md:hidden p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-5 h-5">
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
                title="Tindahan ni Isko - Staff Portal"
                className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center p-1.5 hover:bg-orange-100 transition-colors"
              >
                <img
                  src={brandLogo}
                  alt="Tindahan ni Isko"
                  className="h-full w-auto object-contain"
                />
              </Link>
              {/* Expand Sidebar: |> icon */}
              <button
                type="button"
                onClick={onToggleCollapse}
                title="Expand Sidebar (|>)"
                aria-label="Expand Sidebar"
                className="hidden md:flex items-center justify-center w-8 h-8 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-4 h-4"
                >
                  <polyline points="9 18 15 12 9 6" />
                  <line x1="19" y1="6" x2="19" y2="18" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Navigation Section Groupings */}
        <nav className="p-3 space-y-4 overflow-y-auto max-h-[calc(100vh-210px)] scrollbar-none">
          {navSections.map((section, secIdx) => (
            <div key={section.title} className="space-y-1">
              {/* Section Header */}
              {!isCollapsed ? (
                <div className="px-3 pt-1 pb-1 text-[10px] font-black uppercase tracking-wider text-gray-400 select-none">
                  {section.title}
                </div>
              ) : secIdx > 0 ? (
                <div className="my-2 border-t border-gray-100" />
              ) : null}

              {/* Individual menu items */}
              <div className="space-y-1">
                {section.items.map(({ to, label, icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={onCloseMobile}
                    title={isCollapsed ? label : undefined}
                    className={({ isActive }) =>
                      `flex items-center ${
                        isCollapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3.5 py-2'
                      } rounded-xl text-xs font-semibold transition-all duration-150 ${
                        isActive
                          ? 'bg-brand-orange/10 text-brand-orange font-bold'
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

      {/* Bottom Pinned Admin Card & Settings */}
      <div className="p-3 border-t border-gray-100 space-y-2 bg-gray-50/50">
        <NavLink
          to="/admin/settings"
          onClick={onCloseMobile}
          title={isCollapsed ? 'Settings' : undefined}
          className={({ isActive }) =>
            `flex items-center ${
              isCollapsed ? 'justify-center px-2 py-2' : 'gap-3 px-3.5 py-2'
            } rounded-xl text-xs font-semibold transition-colors ${
              isActive
                ? 'bg-brand-orange/10 text-brand-orange font-bold'
                : 'text-gray-600 hover:bg-gray-100'
            }`
          }
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="w-4.5 h-4.5 shrink-0"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          {!isCollapsed && <span>Settings</span>}
        </NavLink>

        {/* User Profile Card */}
        <div
          className={`pt-1.5 flex items-center ${
            isCollapsed ? 'flex-col justify-center' : 'justify-between'
          } gap-2 px-1`}
        >
          <div
            className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5 min-w-0'}`}
            title={`${currentAdminUser?.name || 'Super Admin'} (${
              currentAdminUser?.email || 'admin@tindahan.ph'
            })`}
          >
            <div className="w-8 h-8 rounded-full bg-brand-orange text-white font-black text-xs flex items-center justify-center shrink-0 shadow-2xs">
              {currentAdminUser?.avatar || 'SA'}
            </div>
            {!isCollapsed && (
              <div className="min-w-0">
                <p className="text-xs font-bold text-gray-900 truncate">
                  {currentAdminUser?.name || 'Super Admin'}
                </p>
                <p
                  className="text-[10px] text-gray-500 truncate"
                  title={currentAdminUser?.email || 'admin@tindahan.ph'}
                >
                  {currentAdminUser?.email || 'admin@tindahan.ph'}
                </p>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            title="Log Out Staff Console"
            className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  )
}
