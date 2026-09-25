import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from '../hooks/useToast.js'
import AccountLayout from '../components/layout/AccountLayout.jsx'
import { apiGet } from '../services/api.js'
import { fetchOrders } from '../services/orders.js'
import { fetchNotifications, unreadCount } from '../services/notifications.js'
import { useWishlist } from '../hooks/useWishlist.js'
import Avatar from '../components/ui/Avatar.jsx'
import logo from '../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'
import ConfirmModal from '../components/ui/ConfirmModal.jsx'
import ViewAllLink from '../components/ui/ViewAllLink.jsx'

import { SettingsIcon } from '../components/ui/Icons.jsx'

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
   Main Profile Component
   ────────────────────────────────────────────── */

function Profile() {
  const { currentUser, logout } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  const baseUser = currentUser || {}

  const rawEmail = baseUser.email || ''
  const rawPhone = baseUser.phone || ''

  const isRawPhoneActuallyEmail = rawPhone && rawPhone.includes('@')
  const email = isRawPhoneActuallyEmail ? rawPhone : (rawEmail || '')

  const studentId = baseUser.studentId || ''
  const yearLevel = baseUser.yearLevel || ''
  const course = baseUser.course || ''
  const campus = baseUser.campus || ''
  const college = baseUser.college || ''
  const bio = baseUser.bio || ''
  const fullName = baseUser.fullName || 'User'
  const custId = currentUser?.cust_id ?? currentUser?.id ?? null

  const [appointments, setAppointments] = useState([])
  const [orders, setOrders] = useState([])
  const [unreadNotifs, setUnreadNotifs] = useState(0)
  const { wishlistItems = [] } = useWishlist() || {}

  const handleLogout = () => {
    logout()
    showToast('Signed out successfully')
    navigate('/')
  }

  // Fetch appointments from the backend
  useEffect(() => {
    if (!custId) return undefined
    let cancelled = false
    apiGet('/appoint/display', { cust_id: custId })
      .then((data) => {
        if (!cancelled) setAppointments(data?.data || [])
      })
      .catch(() => {
        if (!cancelled) setAppointments([])
      })
    return () => { cancelled = true }
  }, [custId])

  // Real orders (cart rows excluded) and the unread inbox count
  useEffect(() => {
    if (!custId) return undefined
    let cancelled = false
    fetchOrders(custId)
      .then((rows) => {
        if (!cancelled) setOrders(rows || [])
      })
      .catch(() => {
        if (!cancelled) setOrders([])
      })
    fetchNotifications('customer', custId)
      .then((rows) => {
        if (!cancelled) setUnreadNotifs(unreadCount(rows || []))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [custId])

  const overview = useMemo(() => {
    const byStatus = (status) =>
      orders.filter((o) => String(o.ord_status || '').toUpperCase() === status).length
    return {
      totalOrders: orders.length,
      appointments: appointments.filter((a) => !a.appoint_closed).length,
      completedOrders: byStatus('CLAIMED'),
      savedItems: wishlistItems.length,
      inProgress: byStatus('TO PROCESS'),
      forPickup: byStatus('TO CLAIM'),
      forDelivery: byStatus('TO RECEIVE'),
    }
  }, [orders, appointments, wishlistItems])

  return (
    <AccountLayout>

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
              {unreadNotifs > 0 && (
                <span className="absolute top-0 right-0 bg-[#FF6A00] text-white text-[10px] font-black w-4.5 h-4.5 rounded-full flex items-center justify-center border-2 border-white">
                  {unreadNotifs > 9 ? '9+' : unreadNotifs}
                </span>
              )}
            </Link>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Orange Banner - Mobile Redesign */}
          <div className="rounded-3xl p-5 text-white relative overflow-hidden shadow-xs bg-gradient-to-r from-[#FF7A1A] via-[#FF6600] to-[#FF8C33] space-y-4">
            <div className="absolute inset-0 opacity-[0.05] select-none pointer-events-none flex items-center justify-center">
              <span className="text-5xl font-black tracking-widest rotate-[12deg] whitespace-nowrap text-white">
                TINDAHAN NI ISKO
              </span>
            </div>

            {/* Avatar + Info Header with Settings Icon */}
            <div className="flex items-start justify-between gap-3 relative z-10">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-14 h-14 rounded-full overflow-hidden shrink-0 shadow-sm">
                  <Avatar name={fullName} size={64} className="w-full h-full scale-125" userId={currentUser?.cust_id} />
                </div>
                <div className="min-w-0 text-white">
                  <h1 className="text-lg font-black tracking-tight leading-tight truncate">{fullName}</h1>
                  <p className="text-white/90 text-xs font-normal mt-0.5 truncate">{email}</p>
                  <p className="text-white/80 text-[11px] font-normal mt-0.5">Student ID: {studentId}</p>
                </div>
              </div>

              {/* Settings Action Button - Rectangular */}
              <Link
                to="/settings"
                className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-xs text-white hover:bg-white hover:text-gray-800 flex items-center justify-center shadow-2xs active:scale-95 transition-all shrink-0"
                title="Settings"
              >
                <SettingsIcon className="w-5 h-5" />
              </Link>
            </div>

            {/* Action Bar: Edit Profile - Rectangular */}
            <div className="relative z-10 pt-1">
              <Link
                to="/account"
                className="flex items-center justify-center gap-2 bg-white text-gray-800 font-bold text-xs py-2.5 px-4 rounded-xl shadow-2xs hover:bg-gray-50 active:scale-98 transition-all w-full"
              >
                <PencilIcon className="w-3.5 h-3.5 text-gray-500" />
                <span>Edit Profile</span>
              </Link>
            </div>
          </div>

          {/* 1. Quick Overview - 2x2 Responsive Grid */}
          <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-black text-gray-900">Quick Overview</h3>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {/* Total Orders */}
              <div className="bg-[#F0F5FF] rounded-xl p-3 flex items-center gap-3 shadow-2xs">
                <div className="w-9 h-9 rounded-lg bg-blue-100 text-[#2563EB] flex items-center justify-center shrink-0">
                  <OrdersNavIcon className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0">
                  <span className="text-xl font-black text-gray-900 leading-none">{overview.totalOrders}</span>
                  <p className="text-xs text-gray-500 font-semibold mt-0.5 truncate">Total Orders</p>
                </div>
              </div>

              {/* Completed Orders */}
              <div className="bg-[#F0FDF4] rounded-xl p-3 flex items-center gap-3 shadow-2xs">
                <div className="w-9 h-9 rounded-lg bg-emerald-100 text-[#10B981] flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4.5 h-4.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <span className="text-xl font-black text-gray-900 leading-none">{overview.completedOrders}</span>
                  <p className="text-xs text-gray-500 font-semibold mt-0.5 truncate">Completed</p>
                </div>
              </div>

              {/* Appointments */}
              <div className="bg-[#FFF7ED] rounded-xl p-3 flex items-center gap-3 shadow-2xs">
                <div className="w-9 h-9 rounded-lg bg-orange-100 text-[#FF6A00] flex items-center justify-center shrink-0">
                  <CalendarNavIcon className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0">
                  <span className="text-xl font-black text-gray-900 leading-none">{overview.appointments}</span>
                  <p className="text-xs text-gray-500 font-semibold mt-0.5 truncate">Appointments</p>
                </div>
              </div>

              {/* Saved Items */}
              <div className="bg-[#FAF5FF] rounded-xl p-3 flex items-center gap-3 shadow-2xs">
                <div className="w-9 h-9 rounded-lg bg-purple-100 text-[#8B5CF6] flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4.5 h-4.5">
                    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <span className="text-xl font-black text-gray-900 leading-none">{overview.savedItems}</span>
                  <p className="text-xs text-gray-500 font-semibold mt-0.5 truncate">Saved Items</p>
                </div>
              </div>
            </div>
          </div>

          {/* 2. About Me - 2 Columns on mobile */}
          <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-gray-900">About Me</h2>
              </div>
              <Link to="/account" className="w-7 h-7 rounded-xl border border-gray-100 bg-gray-50 flex items-center justify-center text-gray-400 hover:text-gray-700">
                <PencilIcon className="w-3.5 h-3.5" />
              </Link>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed font-normal">{bio}</p>
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100">
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-0.5">Year Level</p>
                <p className="text-sm font-bold text-gray-900">{yearLevel}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-0.5">Campus</p>
                <p className="text-sm font-bold text-gray-900">{campus}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-0.5">Course</p>
                <p className="text-sm font-bold text-gray-900 leading-snug">{course}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-0.5">College</p>
                <p className="text-sm font-bold text-gray-900 leading-snug">{college}</p>
              </div>
            </div>
          </div>

          {/* 3. My Orders Stepper */}
          <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-gray-900">My Orders</h2>
              </div>
              <ViewAllLink to="/orders">View all</ViewAllLink>
            </div>

            <div className="flex items-center justify-between px-1">
              <Link to="/orders?tab=processing" className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[#EBF2FF] text-[#2563EB] flex items-center justify-center">
                  <PipelineIcon id="in_progress" className="w-4 h-4 text-[#2563EB]" />
                </div>
                <div>
                  <p className="text-lg font-black text-gray-900 leading-none">{overview.inProgress}</p>
                  <p className="text-xs text-gray-500 font-semibold mt-0.5">In Progress</p>
                </div>
              </Link>
              <span className="text-gray-300 font-light text-xs">→</span>
              <Link to="/orders?tab=receive" className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[#FFF4E5] text-[#FF6A00] flex items-center justify-center">
                  <PipelineIcon id="for_pickup" className="w-4 h-4 text-[#FF6A00]" />
                </div>
                <div>
                  <p className="text-lg font-black text-gray-900 leading-none">{overview.forPickup}</p>
                  <p className="text-xs text-gray-500 font-semibold mt-0.5">For Pickup</p>
                </div>
              </Link>
              <span className="text-gray-300 font-light text-xs">→</span>
              <Link to="/orders?tab=receive" className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[#E8F8EE] text-[#10B981] flex items-center justify-center">
                  <PipelineIcon id="for_delivery" className="w-4 h-4 text-[#10B981]" />
                </div>
                <div>
                  <p className="text-lg font-black text-gray-900 leading-none">{overview.forDelivery}</p>
                  <p className="text-xs text-gray-500 font-semibold mt-0.5">For Delivery</p>
                </div>
              </Link>
              <span className="text-gray-300 font-light text-xs">→</span>
              <Link to="/orders?tab=history" className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[#F3E8FF] text-[#8B5CF6] flex items-center justify-center">
                  <PipelineIcon id="completed" className="w-4 h-4 text-[#8B5CF6]" />
                </div>
                <div>
                  <p className="text-lg font-black text-gray-900 leading-none">{overview.completedOrders}</p>
                  <p className="text-xs text-gray-500 font-semibold mt-0.5">Completed</p>
                </div>
              </Link>
            </div>
          </div>

          {/* 4. My Appointments */}
          <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-gray-900">My Appointments</h2>
              </div>
              <ViewAllLink to="/appointments">View calendar</ViewAllLink>
            </div>

            <div className="space-y-2.5">
              {appointments.map((appt) => (
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

          {/* 6. Help Center */}
          <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-black text-gray-900">Need Help?</h3>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              We're here to assist with your BU merch orders, campus pickups, and sizing queries.
            </p>
            <span className="w-full py-2.5 px-4 rounded-xl border border-orange-200 bg-orange-50/60 text-[#FF6A00] font-bold text-xs flex items-center justify-center gap-2">
              Contact Support
            </span>
          </div>

          {/* 7. Account Security */}
          <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-gray-900">Account Security</h3>
              </div>
              <Link to="/settings/change-password" className="w-7 h-7 rounded-xl border border-gray-100 bg-gray-50 flex items-center justify-center text-gray-400 hover:text-gray-700">
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

      {/* ── DESKTOP LAYOUT ── */}
      <div className="hidden md:block w-full max-w-6xl mx-auto py-2 animate-fade-in space-y-3.5">
        {/* Top Banner - Sleek compact style */}
        <div className="rounded-2xl py-6 px-6 flex items-center justify-between text-white relative overflow-hidden shadow-xs bg-gradient-to-r from-[#FF7A1A] via-[#FF6600] to-[#FF8C33]">
          <div className="absolute inset-0 opacity-[0.04] select-none pointer-events-none flex items-center justify-center">
            <span className="text-[5rem] font-black tracking-widest rotate-[4deg] whitespace-nowrap text-white">
              TINDAHAN NI ISKO
            </span>
          </div>

          {/* Left: Avatar + Info */}
          <div className="flex items-center gap-4 relative z-10">
            <div className="w-14 h-14 rounded-full overflow-hidden shrink-0 shadow-sm border-2 border-white/40">
              <Avatar name={fullName} size={64} className="w-full h-full scale-125" userId={currentUser?.cust_id} />
            </div>
            <div className="text-white">
              <h1 className="text-xl md:text-2xl font-black tracking-tight leading-tight">{fullName}</h1>
              <p className="text-white/90 text-xs font-normal mt-0.5">{email}</p>
              <p className="text-white/80 text-[11px] font-normal mt-0.5">Student ID: {studentId}</p>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2.5 relative z-10">
            <Link
              to="/account"
              className="flex items-center gap-1.5 bg-white text-gray-800 font-bold text-xs px-4 py-2 rounded-xl shadow-2xs hover:bg-gray-50 active:scale-95 transition-all"
            >
              <PencilIcon className="w-3.5 h-3.5 text-gray-500" />
              <span>Edit Profile</span>
            </Link>
            <Link
              to="/settings"
              className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-xs text-white hover:bg-white hover:text-gray-800 flex items-center justify-center shadow-2xs active:scale-95 transition-all"
              title="Settings"
            >
              <SettingsIcon className="w-4.5 h-4.5" />
            </Link>
          </div>
        </div>

        {/* Main content (sidebar now comes from AccountLayout) */}
        <div className="w-full">
          <div className="space-y-3.5">

            {/* 1. Quick View of Order Statuses Card */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100/90 shadow-xs space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div>
                    <h2 className="text-sm font-black text-gray-900">Quick Order Statuses</h2>
                    <p className="text-[10px] text-gray-400 font-medium">Active and recent purchases</p>
                  </div>
                </div>
                <ViewAllLink to="/orders">View all</ViewAllLink>
              </div>

              <div className="grid grid-cols-4 gap-2.5 pt-1">
                <Link to="/orders?tab=processing" className="flex items-center gap-2.5 p-2.5 rounded-xl bg-blue-50/60 border border-blue-100/70 hover:bg-blue-50 transition-colors group">
                  <div className="w-9 h-9 rounded-lg bg-blue-100 text-[#2563EB] flex items-center justify-center shrink-0">
                    <PipelineIcon id="in_progress" className="w-4.5 h-4.5 text-[#2563EB]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg font-black text-gray-900 leading-none">{overview.inProgress}</p>
                    <p className="text-[11px] text-gray-500 font-bold mt-0.5 truncate">In Progress</p>
                  </div>
                </Link>

                <Link to="/orders?tab=receive" className="flex items-center gap-2.5 p-2.5 rounded-xl bg-orange-50/60 border border-orange-100/70 hover:bg-orange-50 transition-colors group">
                  <div className="w-9 h-9 rounded-lg bg-orange-100 text-brand-orange flex items-center justify-center shrink-0">
                    <PipelineIcon id="for_pickup" className="w-4.5 h-4.5 text-brand-orange" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg font-black text-gray-900 leading-none">{overview.forPickup}</p>
                    <p className="text-[11px] text-gray-500 font-bold mt-0.5 truncate">For Pickup</p>
                  </div>
                </Link>

                <Link to="/orders?tab=receive" className="flex items-center gap-2.5 p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-100/70 hover:bg-emerald-50 transition-colors group">
                  <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                    <PipelineIcon id="for_delivery" className="w-4.5 h-4.5 text-emerald-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg font-black text-gray-900 leading-none">{overview.forDelivery}</p>
                    <p className="text-[11px] text-gray-500 font-bold mt-0.5 truncate">For Delivery</p>
                  </div>
                </Link>

                <Link to="/orders?tab=history" className="flex items-center gap-2.5 p-2.5 rounded-xl bg-purple-50/60 border border-purple-100/70 hover:bg-purple-50 transition-colors group">
                  <div className="w-9 h-9 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
                    <PipelineIcon id="completed" className="w-4.5 h-4.5 text-purple-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg font-black text-gray-900 leading-none">{overview.completedOrders}</p>
                    <p className="text-[11px] text-gray-500 font-bold mt-0.5 truncate">Completed</p>
                  </div>
                </Link>
              </div>
            </div>

            {/* 2. About Me Card */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100/90 shadow-xs space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div>
                    <h2 className="text-sm font-black text-gray-900">About Me</h2>
                    <p className="text-[10px] text-gray-400 font-medium">Academic profile &amp; department</p>
                  </div>
                </div>
                <Link to="/account" className="w-7 h-7 rounded-lg border border-gray-100 bg-gray-50 flex items-center justify-center text-gray-400 hover:text-gray-700">
                  <PencilIcon className="w-3 h-3" />
                </Link>
              </div>

              <p className="text-xs md:text-sm text-gray-600 leading-relaxed font-normal">
                {bio}
              </p>

              <div className="grid grid-cols-4 gap-3 pt-3 border-t border-gray-100 text-xs">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Year Level</p>
                  <p className="font-bold text-gray-900 mt-0.5">{yearLevel}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Course</p>
                  <p className="font-bold text-gray-900 mt-0.5 truncate">{course}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Campus</p>
                  <p className="font-bold text-gray-900 mt-0.5">{campus}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase">College</p>
                  <p className="font-bold text-gray-900 mt-0.5 truncate">{college}</p>
                </div>
              </div>
            </div>

            {/* 3. My Appointments */}
            <div className="bg-white rounded-2xl p-4.5 border border-gray-100/90 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div>
                    <h2 className="text-sm font-black text-gray-900">My Appointments</h2>
                    <p className="text-[10px] text-gray-400 font-medium">Scheduled store visits &amp; pickup slots</p>
                  </div>
                </div>
                <ViewAllLink to="/appointments">View calendar</ViewAllLink>
              </div>

              <div className="space-y-2.5">
                {appointments.map((appt) => (
                  <div
                    key={appt.id}
                    className="p-3.5 rounded-xl border border-gray-100 bg-white hover:border-orange-200 transition-all shadow-2xs space-y-2.5"
                  >
                    {/* Header Row */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="bg-brand-orange text-white font-extrabold text-[9px] tracking-wider px-2 py-0.5 rounded uppercase">
                          {appt.type === 'Visit Store' ? 'VISIT STORE' : 'PICK-UP ORDER'}
                        </span>
                        <span className="text-xs font-bold text-gray-900">{appt.label}</span>
                        <span className="text-[10px] font-mono text-gray-400 bg-gray-50 border border-gray-200 px-1 py-0.5 rounded">
                          #APT-2026-04{appt.id}
                        </span>
                      </div>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-100">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Confirmed
                      </span>
                    </div>

                    {/* Detailed Row */}
                    <div className="grid grid-cols-3 gap-2 text-xs bg-gray-50/70 p-2.5 rounded-xl border border-gray-100">
                      <div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase">Location</p>
                        <p className="font-bold text-gray-800 truncate mt-0.5">{appt.location}</p>
                        <p className="text-[10px] text-gray-400">BU Main Campus</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase">Time Window</p>
                        <p className="font-bold text-gray-800 mt-0.5">{appt.date}</p>
                        <p className="text-[10px] text-brand-orange font-bold">{appt.time}</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase">Order Reference</p>
                        <p className="font-bold text-gray-800 mt-0.5">#ORD-8915</p>
                        <p className="text-[10px] text-gray-500 truncate">BU Varsity Jacket</p>
                      </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="flex items-center justify-between pt-0.5">
                      <p className="text-[10px] text-gray-400">
                        ⓘ Please arrive 5 minutes early with your Student ID.
                      </p>
                      <div className="flex items-center gap-1.5">
                        <Link
                          to="/appointments"
                          className="px-2.5 py-1 bg-white border border-gray-200 text-[11px] font-bold text-gray-700 rounded-lg hover:bg-gray-50"
                        >
                          View Ticket
                        </Link>
                        <button
                          type="button"
                          className="px-2.5 py-1 bg-brand-orange text-white text-[11px] font-bold rounded-lg hover:bg-orange-600 cursor-pointer"
                        >
                          Reschedule
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
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
    </AccountLayout>
  )
}

export default Profile