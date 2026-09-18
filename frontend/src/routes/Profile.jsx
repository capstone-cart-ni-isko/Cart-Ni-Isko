import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from '../hooks/useToast.js'
import AppShell from '../components/layout/AppShell.jsx'
import { mockUser, mockAppointments, mockQuickOverview } from '../data/mockUser.js'
import avatarImg from '../assets/avatar.png'
import logo from '../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'
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
   SVG Icon Components for Layout
   ────────────────────────────────────────────── */

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

function MoreVertIcon({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
    </svg>
  )
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
   Main Profile Component
   ────────────────────────────────────────────── */

function Profile() {
  const { currentUser, logout } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

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

  return (
    <AppShell>

      {/* ── MOBILE LAYOUT (matching Image 2) ── */}
      <div className="md:hidden pb-28 bg-[#F8F9FA] min-h-dvh">
        {/* Top bar with Logo, Notifications (badge 3), and Profile icon */}
        <div className="bg-white px-4 py-3 flex items-center justify-between sticky top-0 z-30 border-b border-gray-100">
          <Link to="/home" className="flex items-center">
            <img src={logo} alt="Tindahan ni Isko" className="h-7 object-contain" />
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/notifications" className="relative p-1.5 text-gray-700 hover:text-brand-orange" aria-label="Notifications">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              <span className="absolute top-0 right-0 bg-[#FF6A00] text-white text-[10px] font-black w-4.5 h-4.5 rounded-full flex items-center justify-center border-2 border-white">
                3
              </span>
            </Link>
            <Link to="/account" className="p-1 text-gray-700 hover:text-brand-orange" aria-label="Account">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </Link>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Orange Banner */}
          <div className="rounded-3xl p-5 flex items-center justify-between text-white relative overflow-hidden shadow-xs bg-gradient-to-r from-[#FF7A1A] via-[#FF6600] to-[#FF8C33]">
            <div className="absolute inset-0 opacity-[0.05] select-none pointer-events-none flex items-center justify-center">
              <span className="text-5xl font-black tracking-widest rotate-[12deg] whitespace-nowrap text-white">
                TINDAHAN NI ISKO
              </span>
            </div>

            {/* Avatar + Info */}
            <div className="flex items-center gap-3.5 relative z-10 min-w-0">
              <div className="w-16 h-16 rounded-full border-2 border-white overflow-hidden bg-blue-100 shadow-md shrink-0">
                <img src={avatarImg} alt={fullName} className="w-full h-full object-cover" />
              </div>
              <div className="min-w-0 text-white">
                <h1 className="text-xl font-black tracking-tight leading-tight truncate">{fullName}</h1>
                <p className="text-white/90 text-sm font-normal mt-0.5 truncate">{email}</p>
                <p className="text-white/80 text-xs font-normal mt-0.5">Student ID: {studentId}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 relative z-10 shrink-0">
              <Link
                to="/account"
                className="flex items-center gap-1.5 bg-white text-gray-800 font-bold text-xs px-3.5 py-2 rounded-full shadow-xs hover:bg-gray-50 active:scale-95 transition-all"
              >
                <PencilIcon className="w-3.5 h-3.5 text-gray-500" />
                <span>Edit Profile</span>
              </Link>
              <Link
                to="/settings"
                className="w-9 h-9 rounded-full bg-white text-gray-700 flex items-center justify-center shadow-xs hover:bg-gray-50 active:scale-95 transition-all"
                title="Settings"
              >
                <SettingsIcon className="w-4.5 h-4.5 text-gray-600" />
              </Link>
            </div>
          </div>

          {/* 1. Quick Overview */}
          <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#EBF2FF] text-[#2563EB] flex items-center justify-center">
                <TrendUpIcon className="w-4 h-4" />
              </div>
              <h3 className="text-base font-black text-gray-900">Quick Overview</h3>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {/* Total Orders */}
              <div className="bg-white rounded-2xl p-2.5 border border-gray-100 flex flex-col justify-between text-center items-center shadow-2xs">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#2563EB] flex items-center justify-center mb-1">
                  <OrdersNavIcon className="w-4.5 h-4.5" />
                </div>
                <span className="text-xl font-black text-gray-900 leading-none">{overview.totalOrders}</span>
                <p className="text-xs text-gray-500 font-semibold mt-1">Total Orders</p>
              </div>

              {/* Completed Orders */}
              <div className="bg-white rounded-2xl p-2.5 border border-gray-100 flex flex-col justify-between text-center items-center shadow-2xs">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-[#10B981] flex items-center justify-center mb-1">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4.5 h-4.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <span className="text-xl font-black text-gray-900 leading-none">{overview.completedOrders}</span>
                <p className="text-xs text-gray-500 font-semibold mt-1">Completed Orders</p>
              </div>

              {/* Appointments */}
              <div className="bg-white rounded-2xl p-2.5 border border-gray-100 flex flex-col justify-between text-center items-center shadow-2xs">
                <div className="w-8 h-8 rounded-lg bg-orange-50 text-[#FF6A00] flex items-center justify-center mb-1">
                  <CalendarNavIcon className="w-4.5 h-4.5" />
                </div>
                <span className="text-xl font-black text-gray-900 leading-none">{overview.appointments}</span>
                <p className="text-xs text-gray-500 font-semibold mt-1">Appointments</p>
              </div>

              {/* Saved Items */}
              <div className="bg-white rounded-2xl p-2.5 border border-gray-100 flex flex-col justify-between text-center items-center shadow-2xs">
                <div className="w-8 h-8 rounded-lg bg-purple-50 text-[#8B5CF6] flex items-center justify-center mb-1">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4.5 h-4.5">
                    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                  </svg>
                </div>
                <span className="text-xl font-black text-gray-900 leading-none">{overview.savedItems}</span>
                <p className="text-xs text-gray-500 font-semibold mt-1">Saved Items</p>
              </div>
            </div>
          </div>

          {/* 2. About Me */}
          <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#EBF2FF] text-[#2563EB] flex items-center justify-center">
                  <UserIcon className="w-4 h-4" />
                </div>
                <h2 className="text-base font-black text-gray-900">About Me</h2>
              </div>
              <Link to="/account" className="w-7 h-7 rounded-xl border border-gray-100 bg-gray-50 flex items-center justify-center text-gray-400 hover:text-gray-700">
                <PencilIcon className="w-3.5 h-3.5" />
              </Link>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed font-normal">{bio}</p>
            <div className="grid grid-cols-4 gap-2 pt-3 border-t border-gray-100">
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-0.5">Year Level</p>
                <p className="text-sm font-bold text-gray-900">{yearLevel}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-0.5">Course</p>
                <p className="text-sm font-bold text-gray-900 truncate" title={course}>{course}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-0.5">Campus</p>
                <p className="text-sm font-bold text-gray-900">{campus}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-0.5">College</p>
                <p className="text-sm font-bold text-gray-900 truncate" title={college}>{college}</p>
              </div>
            </div>
          </div>

          {/* 3. My Orders Stepper */}
          <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#EBF2FF] text-[#2563EB] flex items-center justify-center">
                  <OrdersNavIcon className="w-4 h-4" />
                </div>
                <h2 className="text-base font-black text-gray-900">My Orders</h2>
              </div>
              <Link to="/orders" className="text-sm font-bold text-blue-600 hover:underline flex items-center gap-1">
                <span>View All Orders</span>
                <span>→</span>
              </Link>
            </div>

            <div className="flex items-center justify-between px-1">
              <Link to="/orders?status=in_progress" className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[#EBF2FF] text-[#2563EB] flex items-center justify-center">
                  <PipelineIcon id="in_progress" className="w-4 h-4 text-[#2563EB]" />
                </div>
                <div>
                  <p className="text-lg font-black text-gray-900 leading-none">2</p>
                  <p className="text-xs text-gray-500 font-semibold mt-0.5">In Progress</p>
                </div>
              </Link>
              <span className="text-gray-300 font-light text-xs">→</span>
              <Link to="/orders?status=for_pickup" className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[#FFF4E5] text-[#FF6A00] flex items-center justify-center">
                  <PipelineIcon id="for_pickup" className="w-4 h-4 text-[#FF6A00]" />
                </div>
                <div>
                  <p className="text-lg font-black text-gray-900 leading-none">3</p>
                  <p className="text-xs text-gray-500 font-semibold mt-0.5">For Pickup</p>
                </div>
              </Link>
              <span className="text-gray-300 font-light text-xs">→</span>
              <Link to="/orders?status=for_delivery" className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[#E8F8EE] text-[#10B981] flex items-center justify-center">
                  <PipelineIcon id="for_delivery" className="w-4 h-4 text-[#10B981]" />
                </div>
                <div>
                  <p className="text-lg font-black text-gray-900 leading-none">5</p>
                  <p className="text-xs text-gray-500 font-semibold mt-0.5">For Delivery</p>
                </div>
              </Link>
              <span className="text-gray-300 font-light text-xs">→</span>
              <Link to="/orders?status=completed" className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[#F3E8FF] text-[#8B5CF6] flex items-center justify-center">
                  <PipelineIcon id="completed" className="w-4 h-4 text-[#8B5CF6]" />
                </div>
                <div>
                  <p className="text-lg font-black text-gray-900 leading-none">2</p>
                  <p className="text-xs text-gray-500 font-semibold mt-0.5">Completed</p>
                </div>
              </Link>
            </div>
          </div>

          {/* 4. My Appointments */}
          <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#EBF2FF] text-[#2563EB] flex items-center justify-center">
                  <CalendarNavIcon className="w-4 h-4" />
                </div>
                <h2 className="text-base font-black text-gray-900">My Appointments</h2>
              </div>
              <Link to="/appointments" className="text-sm font-bold text-blue-600 hover:underline">
                View Calendar
              </Link>
            </div>

            <div className="space-y-2.5">
              {mockAppointments.map((appt) => (
                <div
                  key={appt.id}
                  className="flex items-center justify-between p-3.5 rounded-2xl border border-gray-100 bg-white shadow-2xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="bg-[#FF6A00] text-white font-bold text-xs tracking-wider px-2.5 py-1 rounded-lg uppercase whitespace-nowrap">
                      {appt.type === 'Visit Store' ? 'VISIT STORE' : 'PICK-UP ORDER'}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{appt.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{appt.location}</p>
                      <p className="text-xs text-gray-600 font-medium mt-0.5">{appt.date} · {appt.time}</p>
                    </div>
                  </div>
                  <button type="button" className="text-gray-400 hover:text-gray-600 p-1">
                    <MoreVertIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 5. Contact Information */}
          <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#EBF2FF] text-[#2563EB] flex items-center justify-center">
                  <ContactIcon className="w-4 h-4" />
                </div>
                <h3 className="text-base font-black text-gray-900">Contact Information</h3>
              </div>
              <Link to="/account" className="w-7 h-7 rounded-xl border border-gray-100 bg-gray-50 flex items-center justify-center text-gray-400 hover:text-gray-700">
                <PencilIcon className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500">Email Address</p>
              <p className="text-sm font-semibold text-gray-900 mt-0.5">{email}</p>
            </div>
          </div>

          {/* 6. Account Security */}
          <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#EBF2FF] text-[#2563EB] flex items-center justify-center">
                  <ShieldIcon className="w-4 h-4" />
                </div>
                <h3 className="text-base font-black text-gray-900">Account Security</h3>
              </div>
              <Link to="/security" className="w-7 h-7 rounded-xl border border-gray-100 bg-gray-50 flex items-center justify-center text-gray-400 hover:text-gray-700">
                <PencilIcon className="w-3.5 h-3.5" />
              </Link>
            </div>
            <p className="text-sm text-gray-500">Keep your account secure</p>
            <div>
              <Link
                to="/settings/change-password"
                className="inline-block bg-[#EFF6FF] text-[#2563EB] hover:bg-blue-100 font-bold text-sm px-4 py-2.5 rounded-xl transition-colors"
              >
                Change Password
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── DESKTOP LAYOUT (Full width without sidebar) ── */}
      <div className="hidden md:block w-full max-w-6xl mx-auto space-y-6 py-4 animate-fade-in">
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
                    <div className="w-9 h-9 rounded-2xl bg-[#EBF2FF] text-[#2563EB] flex items-center justify-center">
                      <UserIcon className="w-5 h-5" />
                    </div>
                    <h2 className="text-lg font-black text-gray-900">About Me</h2>
                  </div>
                  <Link to="/account" className="w-8 h-8 rounded-xl border border-gray-100 bg-gray-50/60 flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">
                    <PencilIcon className="w-3.5 h-3.5" />
                  </Link>
                </div>

                <p className="text-sm md:text-base text-gray-600 leading-relaxed font-normal">
                  {bio}
                </p>

                <div className="grid grid-cols-4 gap-4 pt-4 border-t border-gray-100">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1">Year Level</p>
                    <p className="text-sm font-bold text-gray-900">{yearLevel}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1">Course</p>
                    <p className="text-sm font-bold text-gray-900">{course}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1">Campus</p>
                    <p className="text-sm font-bold text-gray-900">{campus}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1">College</p>
                    <p className="text-sm font-bold text-gray-900">{college}</p>
                  </div>
                </div>
              </div>

              {/* 2. My Orders Stepper */}
              <div className="bg-white rounded-3xl p-6 md:p-7 border border-gray-100/90 shadow-xs space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-2xl bg-[#EBF2FF] text-[#2563EB] flex items-center justify-center">
                      <OrdersNavIcon className="w-5 h-5" />
                    </div>
                    <h2 className="text-lg font-black text-gray-900">My Orders</h2>
                  </div>
                  <Link
                    to="/orders"
                    className="text-sm font-bold text-blue-600 hover:underline flex items-center gap-1"
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
                      <p className="text-2xl font-black text-gray-900 leading-none">2</p>
                      <p className="text-xs text-gray-500 font-semibold mt-1">In Progress</p>
                    </div>
                  </Link>

                  <span className="text-gray-300 font-light text-sm">→</span>

                  {/* Step 2: For Pickup */}
                  <Link to="/orders?status=for_pickup" className="flex items-center gap-3 group">
                    <div className="w-12 h-12 rounded-full bg-[#FFF4E5] text-[#FF6A00] flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform">
                      <PipelineIcon id="for_pickup" className="w-5 h-5 text-[#FF6A00]" />
                    </div>
                    <div>
                      <p className="text-2xl font-black text-gray-900 leading-none">3</p>
                      <p className="text-xs text-gray-500 font-semibold mt-1">For Pickup</p>
                    </div>
                  </Link>

                  <span className="text-gray-300 font-light text-sm">→</span>

                  {/* Step 3: For Delivery */}
                  <Link to="/orders?status=for_delivery" className="flex items-center gap-3 group">
                    <div className="w-12 h-12 rounded-full bg-[#E8F8EE] text-[#10B981] flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform">
                      <PipelineIcon id="for_delivery" className="w-5 h-5 text-[#10B981]" />
                    </div>
                    <div>
                      <p className="text-2xl font-black text-gray-900 leading-none">5</p>
                      <p className="text-xs text-gray-500 font-semibold mt-1">For Delivery</p>
                    </div>
                  </Link>

                  <span className="text-gray-300 font-light text-sm">→</span>

                  {/* Step 4: Completed */}
                  <Link to="/orders?status=completed" className="flex items-center gap-3 group">
                    <div className="w-12 h-12 rounded-full bg-[#F3E8FF] text-[#8B5CF6] flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform">
                      <PipelineIcon id="completed" className="w-5 h-5 text-[#8B5CF6]" />
                    </div>
                    <div>
                      <p className="text-2xl font-black text-gray-900 leading-none">2</p>
                      <p className="text-xs text-gray-500 font-semibold mt-1">Completed</p>
                    </div>
                  </Link>
                </div>
              </div>

              {/* 3. My Appointments */}
              <div className="bg-white rounded-3xl p-6 md:p-7 border border-gray-100/90 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-2xl bg-[#EBF2FF] text-[#2563EB] flex items-center justify-center">
                      <CalendarNavIcon className="w-5 h-5" />
                    </div>
                    <h2 className="text-lg font-black text-gray-900">My Appointments</h2>
                  </div>
                  <Link to="/appointments" className="text-sm font-bold text-blue-600 hover:underline">
                    View Calendar
                  </Link>
                </div>

                <div className="space-y-3">
                  {mockAppointments.map((appt) => (
                    <div
                      key={appt.id}
                      className="flex items-center justify-between p-4 rounded-2xl border border-gray-100 bg-white hover:border-gray-200 transition-colors shadow-2xs"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <span className="bg-[#FF6A00] text-white font-bold text-xs tracking-wider px-3.5 py-2 rounded-lg uppercase whitespace-nowrap shadow-2xs">
                          {appt.type === 'Visit Store' ? 'VISIT STORE' : 'PICK-UP ORDER'}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-gray-900 truncate">{appt.label}</p>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">{appt.location}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-5 shrink-0">
                        <div className="text-right">
                          <div className="flex items-center justify-end gap-1.5 text-sm text-gray-700 font-medium">
                            <CalendarNavIcon className="w-4 h-4 text-gray-400" />
                            <span>{appt.date}</span>
                          </div>
                          <p className="text-xs text-gray-500 font-normal mt-0.5">{appt.time}</p>
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
                  <div className="w-7 h-7 rounded-lg bg-[#EBF2FF] text-[#2563EB] flex items-center justify-center">
                    <TrendUpIcon className="w-4 h-4" />
                  </div>
                  <h3 className="text-base font-black text-gray-900">Quick Overview</h3>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-2">
                  {/* Total Orders */}
                  <div className="bg-[#F0F5FF] rounded-2xl p-4 flex flex-col justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 text-[#2563EB] flex items-center justify-center">
                        <OrdersNavIcon className="w-4.5 h-4.5" />
                      </div>
                      <span className="text-2xl font-black text-gray-900">{overview.totalOrders}</span>
                    </div>
                    <p className="text-xs text-gray-500 font-semibold mt-2">Total Orders</p>
                  </div>

                  {/* Completed Orders */}
                  <div className="bg-[#F0FDF4] rounded-2xl p-4 flex flex-col justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 text-[#10B981] flex items-center justify-center">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4.5 h-4.5">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                      <span className="text-2xl font-black text-gray-900">{overview.completedOrders}</span>
                    </div>
                    <p className="text-xs text-gray-500 font-semibold mt-2">Completed Orders</p>
                  </div>

                  {/* Appointments */}
                  <div className="bg-[#FFF7ED] rounded-2xl p-4 flex flex-col justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-orange-100 text-[#FF6A00] flex items-center justify-center">
                        <CalendarNavIcon className="w-4.5 h-4.5" />
                      </div>
                      <span className="text-2xl font-black text-gray-900">{overview.appointments}</span>
                    </div>
                    <p className="text-xs text-gray-500 font-semibold mt-2">Appointments</p>
                  </div>

                  {/* Saved Items */}
                  <div className="bg-[#FAF5FF] rounded-2xl p-4 flex flex-col justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-purple-100 text-[#8B5CF6] flex items-center justify-center">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4.5 h-4.5">
                          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                        </svg>
                      </div>
                      <span className="text-2xl font-black text-gray-900">{overview.savedItems}</span>
                    </div>
                    <p className="text-xs text-gray-500 font-semibold mt-2">Saved Items</p>
                  </div>
                </div>
              </div>

              {/* 2. Contact Information */}
              <div className="bg-white rounded-3xl p-6 border border-gray-100/90 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-[#EBF2FF] text-[#2563EB] flex items-center justify-center">
                      <ContactIcon className="w-4 h-4" />
                    </div>
                    <h3 className="text-base font-black text-gray-900">Contact Information</h3>
                  </div>
                  <Link to="/account" className="w-8 h-8 rounded-xl border border-gray-100 bg-gray-50/60 flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">
                    <PencilIcon className="w-3.5 h-3.5" />
                  </Link>
                </div>

                <div className="space-y-3.5 text-sm">
                  <div>
                    <p className="text-xs font-semibold text-gray-500">Email Address</p>
                    <p className="font-bold text-gray-900 mt-0.5">{email}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500">Phone Number</p>
                    <p className="font-bold text-gray-900 mt-0.5">{phone}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500">Student ID</p>
                    <p className="font-bold text-gray-900 mt-0.5">{studentId}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500">Preferred Contact Method</p>
                    <p className="font-bold text-gray-900 mt-0.5">{preferredContact}</p>
                  </div>
                </div>
              </div>

              {/* 3. Account Security */}
              <div className="bg-white rounded-3xl p-6 border border-gray-100/90 shadow-xs space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#EBF2FF] text-[#2563EB] flex items-center justify-center">
                    <ShieldIcon className="w-4 h-4" />
                  </div>
                  <h3 className="text-base font-black text-gray-900">Account Security</h3>
                </div>
                <p className="text-sm text-gray-500 font-normal">Keep your account secure</p>
                <div className="pt-1">
                  <Link
                    to="/settings/change-password"
                    className="inline-block bg-[#EFF6FF] text-[#2563EB] hover:bg-blue-100 font-bold text-sm px-4 py-2.5 rounded-xl transition-colors"
                  >
                    Change Password
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

      {/* Floating Circular Help Center Icon (Bottom Right on both Mobile & Web) */}
      <Link
        to="/help"
        className="fixed bottom-20 right-5 md:bottom-8 md:right-8 z-40 w-13 h-13 md:w-14 md:h-14 rounded-full bg-[#FF6A00] text-white shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-all group cursor-pointer"
        title="Help & Support"
        aria-label="Help & Support"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-6 h-6 md:w-7 md:h-7 transition-transform group-hover:rotate-12"
        >
          <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
          <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
        </svg>
      </Link>

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
