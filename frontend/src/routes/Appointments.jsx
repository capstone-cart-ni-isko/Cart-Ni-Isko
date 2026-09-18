import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import AppShell from '../components/layout/AppShell.jsx'
import { mockUser } from '../data/mockUser.js'
import avatarImg from '../assets/avatar.png'
import hoodieImg from '../assets/Images/unnamed (11).png'
import jacketImg from '../assets/Images/unnamed (12).png'
import lanyardImg from '../assets/Branding/Copy of lanyard.png'
import shirtImg from '../assets/Branding/Copy of shirt.png'
import logo from '../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'
import { SettingsIcon } from '../components/ui/Icons.jsx'

const MOCK_APPOINTMENTS = [
  {
    id: 'AP-2026-0142',
    orderId: 'ORD-8921',
    itemCount: 1,
    status: 'upcoming',
    date: 'May 22, 2026',
    dayOfWeek: 'Friday',
    time: '10:30 AM – 11:00 AM',
    location: 'Tindahan ni Isko – Main Campus',
    subLocation: 'Bicol University, Main Campus',
    items: [
      {
        name: 'BU Labels 2025 Hoodie',
        details: 'Size L · Off White · Qty 1',
        image: hoodieImg,
      },
    ],
  },
  {
    id: 'AP-2026-0137',
    orderId: 'ORD-8915',
    itemCount: 2,
    status: 'upcoming',
    date: 'May 23, 2026',
    dayOfWeek: 'Saturday',
    time: '01:00 PM – 01:30 PM',
    location: 'Tindahan ni Isko – Main Campus',
    subLocation: 'Bicol University, Main Campus',
    items: [
      {
        name: 'BU Varsity Jacket (Navy)',
        details: 'Size XL · Navy/White · Qty 1',
        image: jacketImg,
      },
      {
        name: 'BU Lanyard Set',
        details: 'Orange/Blue/Green · Qty 1',
        image: lanyardImg,
      },
    ],
  },
  {
    id: 'AP-2026-0128',
    orderId: 'ORD-8842',
    itemCount: 1,
    status: 'completed',
    date: 'May 15, 2026',
    dayOfWeek: 'Friday',
    time: '09:00 AM – 09:30 AM',
    location: 'Tindahan ni Isko – Main Campus',
    subLocation: 'Bicol University, Main Campus',
    items: [
      {
        name: 'BU Polo Shirt',
        details: 'Size M · Charcoal Grey · Qty 1',
        image: shirtImg,
      },
    ],
  },
]

function CalendarHeaderIcon({ className = 'w-7 h-7' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="4" width="18" height="18" rx="2.5" ry="2.5" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function SmallCalendarIcon({ className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function ClockIcon({ className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

function PinIcon({ className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

function ScreenClaimIcon({ className = 'w-6 h-6' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <path d="M7 8h10" />
      <path d="M7 12h6" />
    </svg>
  )
}

function PencilIcon({ className = 'w-3.5 h-3.5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

function CheckmarkCircleIcon({ className = 'w-8 h-8' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" className="text-blue-500 fill-blue-50" />
      <polyline points="9 12 11 14 15 10" className="text-blue-600 stroke-[2.5]" />
    </svg>
  )
}

export default function Appointments() {
  const { currentUser } = useAuth()
  const navigate = useNavigate()
  const [activeFilter, setActiveFilter] = useState('all')

  const baseUser = currentUser || mockUser
  const rawEmail = baseUser.email || mockUser.email
  const rawPhone = baseUser.phone || mockUser.phone
  const isRawPhoneActuallyEmail = rawPhone && rawPhone.includes('@')
  const email = isRawPhoneActuallyEmail ? rawPhone : (rawEmail || 'jdc2026-1234-5678@bicol-u.edu.ph')
  const studentId = baseUser.studentId || mockUser.studentId || '2020-1234-5678'
  const fullName = baseUser.fullName || mockUser.fullName || 'Juan Dela Cruz'

  const filteredAppointments = MOCK_APPOINTMENTS.filter((appt) => {
    if (activeFilter === 'all') return true
    return appt.status === activeFilter
  })

  const filterTabs = [
    { id: 'all', label: 'All Appointments' },
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'completed', label: 'Completed' },
    { id: 'cancelled', label: 'Cancelled' },
  ]

  return (
    <AppShell>
      {/* ── MOBILE VIEW (< md) matching Image 1 ── */}
      <div className="md:hidden pb-28 bg-[#F8F9FA] min-h-dvh">
        {/* Mobile Header: Logo Left, Search + Hamburger Right */}
        <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-30">
          <Link to="/home" className="flex items-center">
            <img src={logo} alt="Tindahan ni Isko" className="h-7 object-contain" />
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/shop" className="p-1 text-gray-700 hover:text-brand-orange" aria-label="Search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </Link>
            <button
              type="button"
              onClick={() => navigate('/profile')}
              className="p-1 text-gray-700 hover:text-brand-orange"
              aria-label="Menu"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Orange Profile Banner */}
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
                <h1 className="text-lg font-black tracking-tight leading-tight truncate">{fullName}</h1>
                <p className="text-white/90 text-xs font-normal mt-0.5 truncate">{email}</p>
                <p className="text-white/80 text-[11px] font-normal mt-0.5">Student ID: {studentId}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 relative z-10 shrink-0">
              <Link
                to="/account"
                className="flex items-center gap-1.5 bg-white text-gray-800 font-bold text-xs px-3 py-1.5 rounded-full shadow-xs hover:bg-gray-50 active:scale-95 transition-all"
              >
                <PencilIcon className="w-3 h-3 text-gray-500" />
                <span>Edit Profile</span>
              </Link>
              <Link
                to="/settings"
                className="w-8 h-8 rounded-full bg-white text-gray-700 flex items-center justify-center shadow-xs hover:bg-gray-50 active:scale-95 transition-all"
                title="Settings"
              >
                <SettingsIcon className="w-4 h-4 text-gray-600" />
              </Link>
            </div>
          </div>

          {/* Section Title & Subtitle */}
          <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#EBF2FF] text-[#2563EB] flex items-center justify-center shrink-0">
                <CalendarHeaderIcon className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-black text-gray-900 tracking-tight">My Appointments</h2>
                <p className="text-xs text-gray-500 leading-relaxed mt-0.5">
                  View your assigned pickup schedule for your orders. Please arrive at the store at your designated time to claim your items.
                </p>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-2 overflow-x-auto scrollbar-none pt-2">
              {filterTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveFilter(tab.id)}
                  className={`px-4 py-2 rounded-full text-sm font-bold shrink-0 transition-all cursor-pointer ${
                    activeFilter === tab.id
                      ? 'bg-[#FF6A00] text-white shadow-xs'
                      : 'bg-[#F0F2F5] text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Appointments Cards (Matching 2-Column inner card layout of Image 1) */}
          <div className="space-y-4">
            {filteredAppointments.length === 0 ? (
              <div className="bg-white rounded-3xl p-8 text-center border border-gray-100 shadow-xs">
                <p className="text-sm font-bold text-gray-500">No appointments found in this category.</p>
              </div>
            ) : (
              filteredAppointments.map((appt) => {
                const isUpcoming = appt.status === 'upcoming'
                return (
                  <div
                    key={appt.id}
                    className="bg-white rounded-3xl p-4 border border-gray-100 shadow-xs space-y-3"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                      {/* Left: Schedule details */}
                      <div className="space-y-2 border-b sm:border-b-0 sm:border-r border-gray-100 pb-3 sm:pb-0 sm:pr-3">
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider ${
                            isUpcoming
                              ? 'bg-[#E8F8EE] text-[#10B981]'
                              : 'bg-[#EFF6FF] text-[#2563EB]'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${isUpcoming ? 'bg-[#10B981]' : 'bg-[#2563EB]'}`} />
                          <span>{appt.status}</span>
                        </span>

                        <div className="space-y-2 text-sm text-gray-600 pt-1">
                          <div className="flex items-start gap-2">
                            <SmallCalendarIcon className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-black text-gray-900 uppercase">{appt.date}</p>
                              <p className="text-xs text-gray-500 font-medium">{appt.dayOfWeek}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <ClockIcon className="w-4 h-4 text-gray-400 shrink-0" />
                            <p className="text-sm font-semibold text-gray-800">{appt.time}</p>
                          </div>

                          <div className="flex items-start gap-2">
                            <PinIcon className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-semibold text-gray-800 leading-tight">{appt.location}</p>
                              <p className="text-xs text-gray-500 font-medium">{appt.subLocation}</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Right: Items and Claiming Action */}
                      <div className="space-y-2.5">
                        <div>
                          <p className="text-sm font-black text-gray-900">
                            Appointment #{appt.id}
                          </p>
                          <p className="text-xs text-gray-500 font-medium">
                            Order #{appt.orderId} · {appt.itemCount} {appt.itemCount === 1 ? 'item' : 'items'}
                          </p>
                        </div>

                        {/* Item list */}
                        <div className="space-y-2">
                          {appt.items.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-2.5">
                              <div className="w-12 h-12 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center p-1 shrink-0">
                                <img
                                  src={item.image}
                                  alt={item.name}
                                  className="w-full h-full object-contain"
                                />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-gray-900 leading-tight truncate">
                                  {item.name}
                                </p>
                                <p className="text-xs text-gray-500 font-medium mt-0.5">
                                  {item.details}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Claiming Container */}
                        {isUpcoming ? (
                          <div className="space-y-2 pt-1">
                            <div className="bg-[#FFF5ED] border border-[#FFE2D1] rounded-2xl p-2.5 flex items-center gap-2 text-[#E65100]">
                              <div className="w-5 h-5 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                                <ScreenClaimIcon className="w-3.5 h-3.5 text-[#E65100]" />
                              </div>
                              <span className="text-xs font-semibold text-[#E65100] leading-tight">
                                Show this screen upon claiming.
                              </span>
                            </div>
                            <Link
                              to={`/orders/${appt.orderId}`}
                              className="inline-flex items-center justify-center gap-1 w-full py-2.5 px-3 rounded-full bg-white border border-[#FF9800] text-[#E65100] text-sm font-bold hover:bg-orange-50 active:scale-95 transition-all shadow-2xs"
                            >
                              <span>View Order Details</span>
                              <span>→</span>
                            </Link>
                          </div>
                        ) : (
                          <div className="space-y-2 pt-1">
                            <div className="bg-[#F0F5FA] border border-[#E2E8F0] rounded-2xl p-2.5 flex flex-col items-center justify-center text-center">
                              <div className="flex items-center gap-1.5 text-blue-600 font-black text-sm">
                                <span className="w-4 h-4 rounded-full bg-blue-100 flex items-center justify-center text-xs">✓</span>
                                <span>Order claimed</span>
                              </div>
                              <p className="text-xs text-gray-500 font-medium mt-0.5">
                                Thank you for supporting Tindahan ni Isko!
                              </p>
                            </div>
                            <Link
                              to={`/orders/${appt.orderId}`}
                              className="inline-flex items-center justify-center gap-1 w-full py-2.5 px-3 rounded-full bg-white border border-gray-200 text-gray-700 text-sm font-bold hover:bg-gray-50 active:scale-95 transition-all shadow-2xs"
                            >
                              <span>View Order Details</span>
                              <span>→</span>
                            </Link>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Quick Reminders Card (Mobile) */}
          <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <ClockIcon className="w-4 h-4" />
                </div>
                <h3 className="text-base font-black text-gray-900">Quick Reminders</h3>
              </div>
              <span className="text-gray-400 text-sm font-bold">›</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-gray-100 text-gray-700 flex items-center justify-center shrink-0 mt-0.5">
                  <ClockIcon className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-900">Arrive on time</h4>
                  <p className="text-xs text-gray-500 font-normal leading-relaxed mt-0.5">
                    Please be at the store during your scheduled time slot.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-gray-100 text-gray-700 flex items-center justify-center shrink-0 mt-0.5">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-900">Bring a valid ID</h4>
                  <p className="text-xs text-gray-500 font-normal leading-relaxed mt-0.5">
                    For verification purposes.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-gray-100 text-gray-700 flex items-center justify-center shrink-0 mt-0.5">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-900">Show your order details</h4>
                  <p className="text-xs text-gray-500 font-normal leading-relaxed mt-0.5">
                    You may show this page or your order number.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Store Location Card (Mobile) */}
          <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <PinIcon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-gray-900">Store Location</h3>
                  <p className="text-xs text-gray-500 font-medium">Bicol University, Main Campus</p>
                </div>
              </div>
              <span className="text-gray-400 text-sm font-bold">›</span>
            </div>

            {/* Map Graphic Preview */}
            <div className="w-full h-28 rounded-2xl overflow-hidden relative border border-gray-100 bg-[#E8EFF5]">
              <svg className="w-full h-full opacity-60" viewBox="0 0 300 150" fill="none" preserveAspectRatio="none">
                <rect width="300" height="150" fill="#EBF2F7" />
                <path d="M-20 40 L320 110" stroke="#FFFFFF" strokeWidth="10" strokeLinecap="round" />
                <path d="M60 -20 L180 170" stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round" />
                <path d="M120 70 L320 20" stroke="#FFFFFF" strokeWidth="6" strokeLinecap="round" />
                <rect x="70" y="20" width="30" height="25" rx="3" fill="#DFE7EE" />
                <rect x="190" y="70" width="40" height="30" rx="3" fill="#DFE7EE" />
              </svg>

              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative">
                  <div className="w-6 h-6 rounded-full bg-brand-orange text-white flex items-center justify-center shadow-md animate-bounce">
                    <PinIcon className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="w-3 h-1 rounded-full bg-black/20 mx-auto mt-0.5 filter blur-[1px]" />
                </div>
              </div>
            </div>

            <a
              href="https://maps.google.com/?q=Bicol+University+Main+Campus+Legazpi+City"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2.5 rounded-full border border-blue-200 text-[#2563EB] font-bold text-sm flex items-center justify-center gap-1.5 hover:bg-blue-50 transition-colors shadow-2xs"
            >
              <span>View on Maps</span>
              <span>→</span>
            </a>
          </div>
        </div>
      </div>

      {/* ── DESKTOP VIEW (No Sidebar) ── */}
      <div className="hidden md:block w-full max-w-5xl mx-auto space-y-5 py-2 animate-fade-in">
        {/* Top Profile Banner - Compact */}
        <div className="rounded-3xl p-5 md:py-5 md:px-6 flex items-center justify-between text-white relative overflow-hidden shadow-xs bg-gradient-to-r from-[#FF7A1A] via-[#FF6600] to-[#FF8C33]">
          <div className="absolute inset-0 opacity-[0.04] select-none pointer-events-none flex items-center justify-center">
            <span className="text-5xl font-black tracking-widest rotate-[6deg] whitespace-nowrap text-white">
              TINDAHAN NI ISKO
            </span>
          </div>

          {/* User Info */}
          <div className="flex items-center gap-4 relative z-10">
            <div className="w-16 h-16 rounded-full overflow-hidden shrink-0 shadow-sm">
              <img src={avatarImg} alt={fullName} className="w-full h-full object-cover scale-120" />
            </div>
            <div className="text-white">
              <h1 className="text-xl font-black tracking-tight leading-tight">{fullName}</h1>
              <p className="text-white/90 text-xs font-normal mt-0.5">{email}</p>
              <p className="text-white/80 text-[11px] font-normal mt-0.5">Student ID: {studentId}</p>
            </div>
          </div>

          {/* Actions - Rectangular */}
          <div className="flex items-center gap-2.5 relative z-10">
            <Link
              to="/account"
              className="flex items-center gap-1.5 bg-white text-gray-800 font-bold text-xs px-4 py-2.5 rounded-xl shadow-2xs hover:bg-gray-50 active:scale-95 transition-all"
            >
              <PencilIcon className="w-3.5 h-3.5 text-gray-500" />
              <span>Edit Profile</span>
            </Link>
            <Link
              to="/settings"
              className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-xs text-white hover:bg-white hover:text-gray-800 flex items-center justify-center shadow-2xs active:scale-95 transition-all"
              title="Settings"
            >
              <SettingsIcon className="w-5 h-5" />
            </Link>
          </div>
        </div>

          {/* 2-Column Grid (8 cols Main + 4 cols Sidebar) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Center Main Column (8 Cols) */}
            <div className="lg:col-span-8 space-y-6">
              {/* Header Title + Subtitle */}
              <div className="bg-white rounded-3xl p-6 md:p-7 border border-gray-100/90 shadow-xs space-y-4">
                <div className="flex items-start gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-[#EBF2FF] text-[#2563EB] flex items-center justify-center shrink-0">
                    <CalendarHeaderIcon className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">My Appointments</h2>
                    <p className="text-xs text-gray-500 font-normal leading-relaxed mt-1">
                      View your assigned pickup schedule for your orders. Please arrive at the campus store at your designated time to claim your items.
                    </p>
                  </div>
                </div>

                {/* Filter Tabs */}
                <div className="flex items-center gap-2.5 pt-2">
                  {filterTabs.map((tab) => {
                    const isActive = activeFilter === tab.id
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveFilter(tab.id)}
                        className={`px-5 py-2.5 rounded-full text-sm font-bold transition-all cursor-pointer ${
                          isActive
                            ? 'bg-[#FF6A00] text-white shadow-xs'
                            : 'bg-[#F0F2F5] text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {tab.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Appointments List */}
              <div className="space-y-4">
                {filteredAppointments.length === 0 ? (
                  <div className="bg-white rounded-3xl p-10 text-center border border-gray-100 shadow-xs">
                    <p className="text-base font-bold text-gray-500">No appointments in this category.</p>
                  </div>
                ) : (
                  filteredAppointments.map((appt) => {
                    const isUpcoming = appt.status === 'upcoming'
                    return (
                      <div
                        key={appt.id}
                        className="bg-white rounded-3xl p-6 border border-gray-100/90 shadow-xs space-y-4 hover:border-gray-200 transition-colors"
                      >
                        {/* Card Top Pill & Identifier */}
                        <div>
                          <span
                            className={`inline-block text-xs font-black px-3.5 py-1.5 rounded-full uppercase tracking-wider mb-2.5 ${
                              isUpcoming
                                ? 'bg-[#E8F8EE] text-[#10B981]'
                                : 'bg-[#EFF6FF] text-[#2563EB]'
                            }`}
                          >
                            {appt.status}
                          </span>
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center">
                              <SmallCalendarIcon className="w-4 h-4" />
                            </div>
                            <span className="text-base font-black text-gray-900">
                              Appointment #{appt.id}
                            </span>
                            <span className="text-sm text-gray-500 font-medium">
                              Order #{appt.orderId} · {appt.itemCount} {appt.itemCount === 1 ? 'item' : 'items'}
                            </span>
                          </div>
                        </div>

                        {/* 3-Column Content Row: Item Details, Schedule Details, Claiming Box */}
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center pt-2 border-t border-gray-100">
                          {/* Item Preview (Col 1-4) */}
                          <div className="md:col-span-4 space-y-3">
                            {appt.items.map((item, idx) => (
                              <div key={idx} className="flex items-center gap-3">
                                <div className="w-16 h-16 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center p-1.5 shrink-0">
                                  <img
                                    src={item.image}
                                    alt={item.name}
                                    className="w-full h-full object-contain"
                                  />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-bold text-gray-900 leading-snug truncate">
                                    {item.name}
                                  </p>
                                  <p className="text-xs text-gray-500 font-medium mt-0.5">
                                    {item.details}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Date, Time, Location (Col 5-8) */}
                          <div className="md:col-span-4 space-y-2.5 text-sm text-gray-700 pl-2">
                            {/* Date */}
                            <div className="flex items-start gap-2.5">
                              <SmallCalendarIcon className="w-4.5 h-4.5 text-gray-400 shrink-0 mt-0.5" />
                              <div>
                                <p className="font-bold text-gray-900 leading-tight">{appt.date}</p>
                                <p className="text-xs text-gray-500 font-medium">{appt.dayOfWeek}</p>
                              </div>
                            </div>

                            {/* Time */}
                            <div className="flex items-center gap-2.5">
                              <ClockIcon className="w-4.5 h-4.5 text-gray-400 shrink-0" />
                              <p className="font-semibold text-gray-800">{appt.time}</p>
                            </div>

                            {/* Location */}
                            <div className="flex items-start gap-2.5">
                              <PinIcon className="w-4.5 h-4.5 text-gray-400 shrink-0 mt-0.5" />
                              <div>
                                <p className="font-semibold text-gray-800 leading-tight">{appt.location}</p>
                                <p className="text-xs text-gray-500 font-medium">{appt.subLocation}</p>
                              </div>
                            </div>
                          </div>

                          {/* Right Action Callout Box (Col 9-12) */}
                          <div className="md:col-span-4">
                            {isUpcoming ? (
                              <div className="bg-[#FFF5ED] border border-[#FFE2D1] rounded-2xl p-4 flex flex-col items-center justify-center text-center space-y-3">
                                <div className="flex items-center gap-2 text-[#E65100]">
                                  <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                                    <ScreenClaimIcon className="w-3.5 h-3.5 text-[#E65100]" />
                                  </div>
                                  <span className="text-xs font-bold text-[#E65100] leading-tight">
                                    Show this screen upon claiming.
                                  </span>
                                </div>
                                <Link
                                  to={`/orders/${appt.orderId}`}
                                  className="inline-flex items-center justify-center gap-1 w-full py-2.5 px-4 rounded-full bg-white border border-[#FF9800] text-[#E65100] text-sm font-bold hover:bg-orange-50 active:scale-95 transition-all shadow-2xs"
                                >
                                  <span>View Order Details</span>
                                  <span>→</span>
                                </Link>
                              </div>
                            ) : (
                              <div className="bg-[#F0F5FA] border border-[#E2E8F0] rounded-2xl p-4 flex flex-col items-center justify-center text-center space-y-1.5">
                                <div className="flex items-center gap-2">
                                  <CheckmarkCircleIcon className="w-5 h-5 text-blue-600" />
                                  <span className="text-sm font-black text-gray-900">Order claimed</span>
                                </div>
                                <p className="text-xs text-gray-500 font-medium">
                                  Thank you for supporting Tindahan ni Isko!
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* Right Sidebar Column (4 Cols) */}
            <div className="lg:col-span-4 space-y-6">
              {/* 1. Quick Reminders Card */}
              <div className="bg-white rounded-3xl p-6 border border-gray-100/90 shadow-xs space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#EBF2FF] text-[#2563EB] flex items-center justify-center relative">
                    <SmallCalendarIcon className="w-5 h-5" />
                    <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center text-white text-[8px] font-black">
                      ✓
                    </span>
                  </div>
                  <h3 className="text-lg font-black text-gray-900">Quick Reminders</h3>
                </div>

                <div className="space-y-4">
                  {/* Reminder 1 */}
                  <div className="flex items-start gap-3.5">
                    <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 mt-0.5">
                      <ClockIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-gray-900">Arrive on time</h4>
                      <p className="text-xs text-gray-500 font-normal leading-relaxed mt-0.5">
                        Please be at the store during your scheduled time slot.
                      </p>
                    </div>
                  </div>

                  {/* Reminder 2 */}
                  <div className="flex items-start gap-3.5">
                    <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 mt-0.5">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-gray-900">Bring a valid ID</h4>
                      <p className="text-xs text-gray-500 font-normal leading-relaxed mt-0.5">
                        For verification purposes.
                      </p>
                    </div>
                  </div>

                  {/* Reminder 3 */}
                  <div className="flex items-start gap-3.5">
                    <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 mt-0.5">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-gray-900">Show your order details</h4>
                      <p className="text-xs text-gray-500 font-normal leading-relaxed mt-0.5">
                        You may show this page or your order number.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. Store Location Card */}
              <div className="bg-white rounded-3xl p-6 border border-gray-100/90 shadow-xs space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#EBF2FF] text-[#2563EB] flex items-center justify-center shrink-0">
                    <PinIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-gray-900">Store Location</h3>
                    <p className="text-sm font-bold text-gray-800 mt-1">Tindahan ni Isko – Main Campus</p>
                    <p className="text-xs text-gray-500 font-medium">Bicol University, Main Campus</p>
                  </div>
                </div>

                {/* Stylized Map View */}
                <div className="w-full h-36 rounded-2xl overflow-hidden relative border border-gray-100 bg-[#E8EFF5]">
                  {/* Subtle map road grid graphics */}
                  <svg className="w-full h-full opacity-60" viewBox="0 0 300 150" fill="none" preserveAspectRatio="none">
                    <rect width="300" height="150" fill="#EBF2F7" />
                    <path d="M-20 40 L320 110" stroke="#FFFFFF" strokeWidth="10" strokeLinecap="round" />
                    <path d="M60 -20 L180 170" stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round" />
                    <path d="M120 70 L320 20" stroke="#FFFFFF" strokeWidth="6" strokeLinecap="round" />
                    <path d="M0 120 L240 60" stroke="#FFFFFF" strokeWidth="7" strokeLinecap="round" />
                    <rect x="70" y="20" width="30" height="25" rx="3" fill="#DFE7EE" />
                    <rect x="190" y="70" width="40" height="30" rx="3" fill="#DFE7EE" />
                    <rect x="130" y="110" width="50" height="20" rx="3" fill="#DFE7EE" />
                  </svg>

                  {/* Pin in center */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="relative">
                      <div className="w-7 h-7 rounded-full bg-brand-orange text-white flex items-center justify-center shadow-md animate-bounce">
                        <PinIcon className="w-4 h-4 text-white" />
                      </div>
                      <div className="w-4 h-1.5 rounded-full bg-black/20 mx-auto mt-0.5 filter blur-[1px]" />
                    </div>
                  </div>
                </div>

                {/* View on Maps Button */}
                <a
                  href="https://maps.google.com/?q=Bicol+University+Main+Campus+Legazpi+City"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 rounded-xl border border-blue-200 text-[#2563EB] font-bold text-sm flex items-center justify-center gap-1.5 hover:bg-blue-50 transition-colors shadow-2xs"
                >
                  <span>View on Maps</span>
                  <span>→</span>
                </a>
              </div>
            </div>
          </div>
        </div>
    </AppShell>
  )
}
