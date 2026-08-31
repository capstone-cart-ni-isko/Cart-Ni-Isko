import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from '../hooks/useToast.js'
import AppShell from '../components/layout/AppShell.jsx'
import { mockUser, mockAppointments, mockOrderStatuses, mockOrderPipeline, mockQuickOverview } from '../data/mockUser.js'
import settingsIcon from '../assets/icons/profile/settings.svg'
import notificationIcon from '../assets/icons/common/notification.svg'
import editIcon from '../assets/icons/profile/edit-profile.svg'
import avatarImg from '../assets/avatar.png'
import ConfirmModal from '../components/ui/ConfirmModal.jsx'

import {
  UserIcon,
  LockIcon,
  BellIcon,
  HelpIcon,
  SettingsIcon,
  LogOutIcon
} from '../components/ui/Icons.jsx'

/* ──────────────────────────────────────────────
   SVG Icon Components for Desktop Layout
   ────────────────────────────────────────────── */

function HomeNavIcon({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

function OrdersNavIcon({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.27 6.96 8.73 5.05 8.73-5.05" /><path d="M12 22.08V12" />
    </svg>
  )
}

function CalendarNavIcon({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function StarNavIcon({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

function MapPinNavIcon({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

function WalletNavIcon({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  )
}

function PencilIcon({ className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

function TrendUpIcon({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  )
}

function ShieldIcon({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}

function ContactIcon({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="M15 8h2" />
      <path d="M15 12h2" />
      <path d="M7 16h10" />
    </svg>
  )
}

function HeadsetIcon({ className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    </svg>
  )
}

function MoreVertIcon({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
    </svg>
  )
}

/* ──────────────────────────────────────────────
   Order Status Icons for Mobile
   ────────────────────────────────────────────── */

function OrderStatusIcon({ type }) {
  const icons = {
    box: (
      <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7 text-gray-600" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 3.99A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
        <path d="M3.27 6.96 12 12.01l8.73-5.05" /><path d="M12 22.08V12" />
      </svg>
    ),
    'hand-box': (
      <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7 text-gray-600" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22a7 7 0 0 0 7-7h-2a5 5 0 0 1-5 5v2z" />
        <path d="M19 15V9a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2z" />
        <path d="M12 7V3" /><path d="M9 11h6" />
      </svg>
    ),
    'star-box': (
      <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7 text-gray-600" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    ),
  }
  return icons[type] || icons.box
}

/* ──────────────────────────────────────────────
   Order Pipeline Icons for Desktop
   ────────────────────────────────────────────── */

function PipelineIcon({ id, className = 'w-5 h-5' }) {
  const icons = {
    in_progress: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
        <path d="m3.27 6.96 8.73 5.05 8.73-5.05" /><path d="M12 22.08V12" />
      </svg>
    ),
    for_pickup: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M1 3h15v13H1z" />
        <path d="M16 8h4l3 3v5h-7V8z" />
        <circle cx="5.5" cy="18.5" r="2.5" />
        <circle cx="18.5" cy="18.5" r="2.5" />
      </svg>
    ),
    for_delivery: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <rect x="1" y="3" width="15" height="13" rx="1" />
        <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
        <circle cx="5.5" cy="18.5" r="2.5" />
        <circle cx="18.5" cy="18.5" r="2.5" />
      </svg>
    ),
    completed: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
  }
  return icons[id] || icons.in_progress
}

/* ──────────────────────────────────────────────
   Mobile Drawer Menu
   ────────────────────────────────────────────── */

function DrawerMenu({ open, onClose, user, onLogout }) {
  if (!open) return null
  const menuItems = [
    { to: '/account', label: 'Account Info', icon: <UserIcon className="w-5 h-5 text-gray-450" /> },
    { to: '/security', label: 'Security', icon: <LockIcon className="w-5 h-5 text-gray-450" /> },
    { to: '/settings/notifications', label: 'Notifications', icon: <BellIcon className="w-5 h-5 text-gray-450" /> },
    { to: '/help', label: 'Help & Support', icon: <HelpIcon className="w-5 h-5 text-gray-450" /> },
    { to: '/settings', label: 'Settings', icon: <SettingsIcon className="w-5 h-5 text-gray-450" /> },
  ]
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50 animate-fade-in" onClick={onClose} />
      <aside className="fixed top-0 left-0 bottom-0 w-72 bg-white z-50 shadow-2xl flex flex-col justify-between rounded-r-2xl overflow-hidden animate-slide-right">
        <div>
          <div className="gradient-orange-header px-6 pt-12 pb-8 text-white">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full border-2 border-white overflow-hidden bg-blue-100">
                <img src={avatarImg} alt="" className="w-full h-full object-cover" />
              </div>
              <div>
                <p className="font-bold text-lg leading-tight">{user?.fullName || 'Guest Isko'}</p>
                <p className="text-white/80 text-xs truncate max-w-[170px]">{user?.email || 'Browse campus merch'}</p>
              </div>
            </div>
          </div>
          <nav className="p-4 space-y-1">
            {menuItems.map(({ to, label, icon }) => (
              <Link key={to} to={to} onClick={onClose}
                className="flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all">
                {icon}
                <span>{label}</span>
              </Link>
            ))}
            <button onClick={() => { onLogout(); onClose() }}
              className="w-full text-left flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold text-red-600 hover:bg-red-50 transition-all">
              <LogOutIcon className="w-5 h-5 text-red-500" />
              <span>Log Out</span>
            </button>
          </nav>
        </div>
        <div className="p-6 border-t border-gray-100 text-center">
          <p className="text-xs text-gray-400 font-medium">Tindahan ni Isko v1.0.0</p>
        </div>
      </aside>
    </>
  )
}

/* ──────────────────────────────────────────────
   Desktop Account Sidebar Navigation
   ────────────────────────────────────────────── */

function DesktopAccountSidebar({ activeTab, onTabChange }) {
  const navItems = [
    { id: 'overview', label: 'Overview', icon: HomeNavIcon },
    { id: 'orders', label: 'My Orders', icon: OrdersNavIcon },
    { id: 'appointments', label: 'My Appointments', icon: CalendarNavIcon },
    { id: 'saved', label: 'Saved Items', icon: StarNavIcon },
    { id: 'addresses', label: 'Addresses', icon: MapPinNavIcon },
    { id: 'payments', label: 'Payment Methods', icon: WalletNavIcon },
    { id: 'settings', label: 'Account Settings', icon: SettingsIcon },
    { id: 'help', label: 'Help & Support', icon: HelpIcon },
  ]

  return (
    <aside className="w-60 shrink-0 flex flex-col justify-between space-y-6">
      {/* Top Nav Card */}
      <div className="bg-white rounded-3xl p-3 border border-gray-100/90 shadow-xs">
        <nav className="space-y-0.5">
          {navItems.map(({ id, label, icon: Icon }) => {
            const isActive = activeTab === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => onTabChange(id)}
                className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-xs font-bold transition-all text-left ${
                  isActive
                    ? 'bg-[#FFF4EC] text-[#FF6A00]'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon className={`w-4.5 h-4.5 ${isActive ? 'text-[#FF6A00]' : 'text-gray-400'}`} />
                <span>{label}</span>
              </button>
            )
          })}
        </nav>
      </div>

      {/* Need Help? Card at bottom */}
      <div className="bg-white rounded-3xl p-5 border border-gray-100/90 shadow-xs space-y-3">
        <div>
          <p className="font-extrabold text-sm text-gray-900">Need Help?</p>
          <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
            We're here to help with your orders and account.
          </p>
        </div>
        <Link
          to="/help"
          className="w-full py-2.5 px-4 rounded-xl border border-orange-200 bg-white hover:bg-orange-50/60 text-[#FF6A00] font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-2xs"
        >
          <HeadsetIcon className="w-4 h-4 text-[#FF6A00]" />
          <span>Contact Support</span>
        </Link>
      </div>
    </aside>
  )
}

/* ──────────────────────────────────────────────
   Main Profile Component
   ────────────────────────────────────────────── */

function Profile() {
  const { currentUser, logout } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')

  const baseUser = currentUser || mockUser

  // Robust field fallbacks to prevent swapped email/phone
  const rawEmail = baseUser.email || mockUser.email
  const rawPhone = baseUser.phone || mockUser.phone

  const isRawPhoneActuallyEmail = rawPhone && rawPhone.includes('@')
  const email = isRawPhoneActuallyEmail ? rawPhone : (rawEmail || 'jdcruz@student.u.edu.ph')
  const phone = isRawPhoneActuallyEmail ? '+63 912 345 6789' : (rawPhone || '+63 912 345 6789')

  const studentId = baseUser.studentId || mockUser.studentId || '2020-1234-5678'
  const yearLevel = baseUser.yearLevel || mockUser.yearLevel || '1st Year'
  const course = baseUser.course || mockUser.course || 'Mechanical Engineering'
  const campus = baseUser.campus || mockUser.campus || 'Main Campus'
  const college = baseUser.college || mockUser.college || 'College of Engineering'
  const bio = baseUser.bio || mockUser.bio || '1st Year Student at the College of Engineering, taking up Mechanical Engineering.'
  const preferredContact = baseUser.preferredContact || mockUser.preferredContact || 'Email'
  const fullName = baseUser.fullName || mockUser.fullName || 'Juan Dela Cruz'

  const overview = mockQuickOverview

  const handleLogout = () => {
    logout()
    showToast('Signed out successfully')
    navigate('/')
  }

  // Handle tab navigation for desktop sidebar
  const handleTabChange = (tabId) => {
    const routeMap = {
      overview: null,
      orders: '/orders',
      appointments: null,
      saved: '/wishlist',
      addresses: '/settings/address',
      payments: null,
      settings: '/settings',
      help: '/help',
    }
    if (routeMap[tabId]) {
      navigate(routeMap[tabId])
    } else {
      setActiveTab(tabId)
    }
  }

  return (
    <AppShell>
      <DrawerMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        user={{ ...baseUser, email, phone, fullName }}
        onLogout={() => setShowLogoutConfirm(true)}
      />

      {/* ── MOBILE LAYOUT (hidden on md+) ── */}
      <div className="md:hidden pb-28 bg-gray-50 min-h-dvh">
        {/* Orange gradient header */}
        <div className="gradient-orange-header relative overflow-hidden px-5 pt-6 pb-20 rounded-b-[2rem]">
          <div className="absolute inset-0 opacity-[0.05] select-none pointer-events-none flex items-center justify-center overflow-hidden">
            <span className="text-[6.5rem] font-black tracking-widest rotate-[14deg] whitespace-nowrap text-white">
              TINDAHAN NI ISKO
            </span>
          </div>

          <div className="relative flex items-center justify-between mb-8 z-10">
            <button type="button" onClick={() => setMenuOpen(true)}
              className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm active:scale-95 transition-transform">
              <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-gray-800" stroke="currentColor" strokeWidth="2.5">
                <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
              </svg>
            </button>
            <div className="flex gap-2.5">
              <Link to="/settings" className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm active:scale-95 transition-transform">
                <img src={settingsIcon} alt="Settings" className="w-5 h-5" />
              </Link>
              <Link to="/notifications" className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm active:scale-95 transition-transform">
                <img src={notificationIcon} alt="Notifications" className="w-5 h-5" />
              </Link>
            </div>
          </div>

          <div className="relative flex items-center gap-4 z-10 px-1">
            <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-white bg-blue-100 shadow-md shrink-0">
              <img src={avatarImg} alt={fullName} className="w-full h-full object-cover" />
            </div>
            <div className="min-w-0 text-white">
              <h1 className="text-2xl font-black tracking-wide leading-tight truncate">{fullName}</h1>
              <p className="text-white/80 text-xs font-semibold mt-0.5 truncate">{email}</p>
            </div>
          </div>
        </div>

        {/* Content card overlapping header */}
        <div className="bg-white rounded-t-[2.5rem] px-5 pt-8 pb-12 -mt-8 relative z-10 space-y-5 shadow-sm">
          {/* About Me */}
          <div className="gradient-about-me rounded-2xl p-5 text-white relative shadow-md overflow-hidden">
            <div className="absolute inset-0 opacity-[0.03] select-none pointer-events-none">
              <div className="text-9xl font-black -rotate-12 absolute -right-6 -bottom-6">BU</div>
            </div>
            <div className="flex items-start justify-between mb-4 relative z-10">
              <h2 className="text-lg font-black tracking-wide">About Me</h2>
              <Link to="/account" className="opacity-90 hover:opacity-100 active:scale-95 transition-transform">
                <img src={editIcon} alt="Edit" className="w-5 h-5 brightness-0 invert" />
              </Link>
            </div>
            <ul className="space-y-1.5 text-sm font-semibold tracking-wide relative z-10 opacity-95">
              <li>{yearLevel}</li>
              <li>{campus}</li>
              <li>{college}</li>
              <li>{course}</li>
            </ul>
          </div>

          {/* My Orders */}
          <div className="bg-gray-50 rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-extrabold text-gray-900 tracking-wide">My Orders</h2>
              <Link to="/orders" className="text-xs font-bold text-gray-400 hover:text-brand-orange transition-colors">View All</Link>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {mockOrderStatuses.map(({ id, label, icon }) => (
                <Link key={id} to={`/orders?status=${id}`}
                  className="flex flex-col items-center gap-2.5 text-center text-gray-500 hover:text-brand-orange transition-colors group">
                  <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform border border-gray-50">
                    <OrderStatusIcon type={icon} />
                  </div>
                  <span className="text-[10px] leading-tight font-semibold tracking-wide">{label}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* My Appointments */}
          <div className="bg-gray-50 rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-extrabold text-gray-900 tracking-wide">My Appointments</h2>
              <button type="button" className="text-xs font-bold text-gray-400 hover:text-brand-orange transition-colors">View Calendar</button>
            </div>
            <div className="space-y-3">
              {mockAppointments.map(({ id, type, time }) => (
                <div key={id} className="bg-white rounded-xl px-4 py-3.5 flex items-center justify-between shadow-sm border border-gray-50">
                  <span className="bg-brand-orange text-white text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-wider">{type}</span>
                  <span className="text-xs text-gray-500 font-bold">{time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── DESKTOP LAYOUT (matching reference image) ── */}
      <div className="hidden md:flex gap-8 items-start w-full py-2">
        {/* Left Navigation Sidebar */}
        <DesktopAccountSidebar activeTab={activeTab} onTabChange={handleTabChange} />

        {/* Right Main Container (Banner + 2-Column Grid) */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* Top Banner spanning across full width */}
          <div className="rounded-3xl p-7 md:p-8 flex items-center justify-between text-white relative overflow-hidden shadow-xs bg-gradient-to-r from-[#FF7A1A] via-[#FF6600] to-[#FF8C33]">
            <div className="absolute inset-0 opacity-[0.05] select-none pointer-events-none flex items-center justify-center">
              <span className="text-[6rem] font-black tracking-widest rotate-[12deg] whitespace-nowrap text-white">
                TINDAHAN NI ISKO
              </span>
            </div>

            {/* Left: Avatar + Info */}
            <div className="flex items-center gap-6 relative z-10">
              <div className="w-24 h-24 rounded-full border-4 border-white overflow-hidden bg-blue-100 shadow-md shrink-0">
                <img src={avatarImg} alt={fullName} className="w-full h-full object-cover" />
              </div>
              <div className="text-white">
                <h1 className="text-2xl md:text-3xl font-black tracking-tight leading-tight">{fullName}</h1>
                <p className="text-white/90 text-xs md:text-sm font-normal mt-1">{email}</p>
                <p className="text-white/80 text-xs font-normal mt-0.5">Student ID: {studentId}</p>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-3 relative z-10">
              <Link
                to="/account"
                className="flex items-center gap-2 bg-white text-gray-800 font-bold text-xs px-5 py-2.5 rounded-full shadow-xs hover:bg-gray-50 active:scale-95 transition-all"
              >
                <PencilIcon className="w-3.5 h-3.5 text-gray-500" />
                <span>Edit Profile</span>
              </Link>
              <Link
                to="/settings"
                className="w-10 h-10 rounded-full bg-white text-gray-700 flex items-center justify-center shadow-xs hover:bg-gray-50 active:scale-95 transition-all"
                title="Settings"
              >
                <SettingsIcon className="w-5 h-5 text-gray-600" />
              </Link>
            </div>
          </div>

          {/* 2-Column Grid below banner */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Center Main Column (8 Cols) */}
            <div className="lg:col-span-8 space-y-6">
              {/* 1. About Me */}
              <div className="bg-white rounded-3xl p-6 md:p-7 border border-gray-100/90 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-[#EBF2FF] text-[#2563EB] flex items-center justify-center">
                      <UserIcon className="w-4 h-4" />
                    </div>
                    <h2 className="text-base font-black text-gray-900">About Me</h2>
                  </div>
                  <Link to="/account" className="w-8 h-8 rounded-xl border border-gray-100 bg-gray-50/60 flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">
                    <PencilIcon className="w-3.5 h-3.5" />
                  </Link>
                </div>

                <p className="text-xs md:text-sm text-gray-600 leading-relaxed font-normal">
                  {bio}
                </p>

                <div className="grid grid-cols-4 gap-4 pt-4 border-t border-gray-100">
                  <div>
                    <p className="text-[11px] font-medium text-gray-400 mb-1">Year Level</p>
                    <p className="text-xs font-bold text-gray-900">{yearLevel}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-gray-400 mb-1">Course</p>
                    <p className="text-xs font-bold text-gray-900">{course}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-gray-400 mb-1">Campus</p>
                    <p className="text-xs font-bold text-gray-900">{campus}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-gray-400 mb-1">College</p>
                    <p className="text-xs font-bold text-gray-900">{college}</p>
                  </div>
                </div>
              </div>

              {/* 2. My Orders Stepper */}
              <div className="bg-white rounded-3xl p-6 md:p-7 border border-gray-100/90 shadow-xs space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-[#EBF2FF] text-[#2563EB] flex items-center justify-center">
                      <OrdersNavIcon className="w-4 h-4" />
                    </div>
                    <h2 className="text-base font-black text-gray-900">My Orders</h2>
                  </div>
                  <Link
                    to="/orders"
                    className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
                  >
                    <span>View All Orders</span>
                    <span>→</span>
                  </Link>
                </div>

                {/* Pipeline Steps */}
                <div className="flex items-center justify-between px-2">
                  {/* Step 1: In Progress */}
                  <Link to="/orders?status=in_progress" className="flex items-center gap-3 group">
                    <div className="w-12 h-12 rounded-full bg-[#EBF2FF] text-[#2563EB] flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform">
                      <PipelineIcon id="in_progress" className="w-5 h-5 text-[#2563EB]" />
                    </div>
                    <div>
                      <p className="text-xl font-black text-gray-900 leading-none">2</p>
                      <p className="text-xs text-gray-400 font-medium mt-1">In Progress</p>
                    </div>
                  </Link>

                  <span className="text-gray-300 font-light text-sm">→</span>

                  {/* Step 2: For Pickup */}
                  <Link to="/orders?status=for_pickup" className="flex items-center gap-3 group">
                    <div className="w-12 h-12 rounded-full bg-[#FFF4E5] text-[#FF6A00] flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform">
                      <PipelineIcon id="for_pickup" className="w-5 h-5 text-[#FF6A00]" />
                    </div>
                    <div>
                      <p className="text-xl font-black text-gray-900 leading-none">3</p>
                      <p className="text-xs text-gray-400 font-medium mt-1">For Pickup</p>
                    </div>
                  </Link>

                  <span className="text-gray-300 font-light text-sm">→</span>

                  {/* Step 3: For Delivery */}
                  <Link to="/orders?status=for_delivery" className="flex items-center gap-3 group">
                    <div className="w-12 h-12 rounded-full bg-[#E8F8EE] text-[#10B981] flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform">
                      <PipelineIcon id="for_delivery" className="w-5 h-5 text-[#10B981]" />
                    </div>
                    <div>
                      <p className="text-xl font-black text-gray-900 leading-none">5</p>
                      <p className="text-xs text-gray-400 font-medium mt-1">For Delivery</p>
                    </div>
                  </Link>

                  <span className="text-gray-300 font-light text-sm">→</span>

                  {/* Step 4: Completed */}
                  <Link to="/orders?status=completed" className="flex items-center gap-3 group">
                    <div className="w-12 h-12 rounded-full bg-[#F3E8FF] text-[#8B5CF6] flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform">
                      <PipelineIcon id="completed" className="w-5 h-5 text-[#8B5CF6]" />
                    </div>
                    <div>
                      <p className="text-xl font-black text-gray-900 leading-none">2</p>
                      <p className="text-xs text-gray-400 font-medium mt-1">Completed</p>
                    </div>
                  </Link>
                </div>
              </div>

              {/* 3. My Appointments */}
              <div className="bg-white rounded-3xl p-6 md:p-7 border border-gray-100/90 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-[#EBF2FF] text-[#2563EB] flex items-center justify-center">
                      <CalendarNavIcon className="w-4 h-4" />
                    </div>
                    <h2 className="text-base font-black text-gray-900">My Appointments</h2>
                  </div>
                  <button type="button" className="text-xs font-bold text-blue-600 hover:underline">
                    View Calendar
                  </button>
                </div>

                <div className="space-y-3">
                  {mockAppointments.map((appt) => (
                    <div
                      key={appt.id}
                      className="flex items-center justify-between p-4 rounded-2xl border border-gray-100 bg-white hover:border-gray-200 transition-colors shadow-2xs"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <span className="bg-[#FF6A00] text-white font-bold text-[10px] tracking-wider px-3.5 py-2 rounded-lg uppercase whitespace-nowrap shadow-2xs">
                          {appt.type === 'Visit Store' ? 'VISIT STORE' : 'PICK-UP ORDER'}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-gray-900 truncate">{appt.label}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5 truncate">{appt.location}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-5 shrink-0">
                        <div className="text-right">
                          <div className="flex items-center justify-end gap-1.5 text-xs text-gray-600 font-medium">
                            <CalendarNavIcon className="w-3.5 h-3.5 text-gray-400" />
                            <span>{appt.date}</span>
                          </div>
                          <p className="text-[11px] text-gray-400 font-normal mt-0.5">{appt.time}</p>
                        </div>
                        <button type="button" className="text-gray-400 hover:text-gray-600 p-1 transition-colors">
                          <MoreVertIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Sidebar Column (4 Cols) */}
            <div className="lg:col-span-4 space-y-6">
              {/* 1. Quick Overview */}
              <div className="bg-white rounded-3xl p-6 border border-gray-100/90 shadow-xs space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-[#EBF2FF] text-[#2563EB] flex items-center justify-center">
                    <TrendUpIcon className="w-3.5 h-3.5" />
                  </div>
                  <h3 className="text-sm font-black text-gray-900">Quick Overview</h3>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-2">
                  {/* Total Orders */}
                  <div className="bg-[#F0F5FF] rounded-2xl p-4 flex flex-col justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-blue-100 text-[#2563EB] flex items-center justify-center">
                        <OrdersNavIcon className="w-4 h-4" />
                      </div>
                      <span className="text-xl font-black text-gray-900">{overview.totalOrders}</span>
                    </div>
                    <p className="text-[11px] text-gray-400 font-medium mt-2">Total Orders</p>
                  </div>

                  {/* Completed Orders */}
                  <div className="bg-[#F0FDF4] rounded-2xl p-4 flex flex-col justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-emerald-100 text-[#10B981] flex items-center justify-center">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                      <span className="text-xl font-black text-gray-900">{overview.completedOrders}</span>
                    </div>
                    <p className="text-[11px] text-gray-400 font-medium mt-2">Completed Orders</p>
                  </div>

                  {/* Appointments */}
                  <div className="bg-[#FFF7ED] rounded-2xl p-4 flex flex-col justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-orange-100 text-[#FF6A00] flex items-center justify-center">
                        <CalendarNavIcon className="w-4 h-4" />
                      </div>
                      <span className="text-xl font-black text-gray-900">{overview.appointments}</span>
                    </div>
                    <p className="text-[11px] text-gray-400 font-medium mt-2">Appointments</p>
                  </div>

                  {/* Saved Items */}
                  <div className="bg-[#FAF5FF] rounded-2xl p-4 flex flex-col justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-purple-100 text-[#8B5CF6] flex items-center justify-center">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                        </svg>
                      </div>
                      <span className="text-xl font-black text-gray-900">{overview.savedItems}</span>
                    </div>
                    <p className="text-[11px] text-gray-400 font-medium mt-2">Saved Items</p>
                  </div>
                </div>
              </div>

              {/* 2. Contact Information */}
              <div className="bg-white rounded-3xl p-6 border border-gray-100/90 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-[#EBF2FF] text-[#2563EB] flex items-center justify-center">
                      <ContactIcon className="w-3.5 h-3.5" />
                    </div>
                    <h3 className="text-sm font-black text-gray-900">Contact Information</h3>
                  </div>
                  <Link to="/account" className="w-8 h-8 rounded-xl border border-gray-100 bg-gray-50/60 flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">
                    <PencilIcon className="w-3.5 h-3.5" />
                  </Link>
                </div>

                <div className="space-y-3.5 text-xs">
                  <div>
                    <p className="text-[11px] text-gray-400 font-medium">Email Address</p>
                    <p className="font-semibold text-gray-900 mt-0.5">{email}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-400 font-medium">Phone Number</p>
                    <p className="font-semibold text-gray-900 mt-0.5">{phone}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-400 font-medium">Student ID</p>
                    <p className="font-semibold text-gray-900 mt-0.5">{studentId}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-400 font-medium">Preferred Contact Method</p>
                    <p className="font-semibold text-gray-900 mt-0.5">{preferredContact}</p>
                  </div>
                </div>
              </div>

              {/* 3. Account Security */}
              <div className="bg-white rounded-3xl p-6 border border-gray-100/90 shadow-xs space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-[#EBF2FF] text-[#2563EB] flex items-center justify-center">
                    <ShieldIcon className="w-3.5 h-3.5" />
                  </div>
                  <h3 className="text-sm font-black text-gray-900">Account Security</h3>
                </div>
                <p className="text-xs text-gray-400 font-normal">Keep your account secure</p>
                <div className="pt-1">
                  <Link
                    to="/settings/change-password"
                    className="inline-block bg-[#EFF6FF] text-[#2563EB] hover:bg-blue-100 font-bold text-xs px-4 py-2 rounded-xl transition-colors"
                  >
                    Change Password
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={handleLogout}
        title="Log Out?"
        message="Are you sure you want to sign out?"
        confirmText="Log Out"
        isDestructive={true}
      />
    </AppShell>
  )
}

export default Profile
