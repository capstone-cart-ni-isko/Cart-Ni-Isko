import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from '../hooks/useToast.js'
import FocusedLayout from '../components/layout/FocusedLayout.jsx'
import { dispatchModeOf, fetchOrders, orderFilterBucket } from '../services/orders.js'
import { fetchMyAccount } from '../services/accounts.js'
import { fetchNotifications, unreadCount } from '../services/notifications.js'
import Avatar from '../components/ui/Avatar.jsx'
import logo from '../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'
import notificationIcon from '../assets/icons/common/notification.svg'
import ConfirmModal from '../components/ui/ConfirmModal.jsx'
import ViewAllLink from '../components/ui/ViewAllLink.jsx'

import { SettingsIcon, LogOutIcon } from '../components/ui/Icons.jsx'

const IN_PROGRESS_STATUSES = new Set([
  'preparing',
  'confirmed',
  'in production',
  'for pre-order',
  'pre-order',
])

/* ──────────────────────────────────────────────
   SVG Icon Components for Layout
   ────────────────────────────────────────────── */

function PencilIcon({ className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

function OrderStatusOverview({ overview }) {
  const statuses = [
    {
      key: 'in_progress',
      label: 'In Progress',
      count: overview.inProgress,
      iconColor: 'bg-blue-100 text-[#2563EB]',
      cardColor: 'bg-blue-50/60 border-blue-100/70 hover:bg-blue-50',
    },
    {
      key: 'for_pickup',
      label: 'For Pickup',
      count: overview.forPickup,
      iconColor: 'bg-orange-100 text-brand-orange',
      cardColor: 'bg-orange-50/60 border-orange-100/70 hover:bg-orange-50',
    },
    {
      key: 'for_delivery',
      label: 'For Delivery',
      count: overview.forDelivery,
      iconColor: 'bg-emerald-100 text-emerald-600',
      cardColor: 'bg-emerald-50/60 border-emerald-100/70 hover:bg-emerald-50',
    },
    {
      key: 'completed',
      label: 'Completed',
      count: overview.completed,
      iconColor: 'bg-purple-100 text-purple-600',
      cardColor: 'bg-purple-50/60 border-purple-100/70 hover:bg-purple-50',
    },
  ]

  return (
    <section className="rounded-2xl border border-gray-100/90 bg-white p-4 shadow-xs">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900">Quick Order Statuses</h2>
          <p className="mt-0.5 text-[10px] font-medium text-gray-400">Active and recent purchases</p>
        </div>
        <ViewAllLink to="/orders">View all</ViewAllLink>
      </div>

      <div className="grid grid-cols-2 gap-2.5 pt-1 sm:grid-cols-4">
        {statuses.map(({ key, label, count, iconColor, cardColor }) => (
          <Link
            key={key}
            to={`/orders?status=${key}`}
            className={`group flex min-w-0 items-center gap-2.5 rounded-xl border p-2.5 transition-colors ${cardColor}`}
          >
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconColor}`}>
              <PipelineIcon id={key} className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-semibold leading-none text-gray-900">{count}</p>
              <p className="mt-0.5 truncate text-[11px] font-semibold text-gray-500">{label}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
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
  const isGuest = String(
    baseUser.cust_type || baseUser.type || baseUser.role || ''
  ).trim().toLowerCase() === 'guest'

  const rawEmail = baseUser.cust_email || baseUser.email || ''
  const rawPhone = baseUser.cust_phone || baseUser.phone || ''

  const isRawPhoneActuallyEmail = rawPhone && rawPhone.includes('@')
  const email = isRawPhoneActuallyEmail ? rawPhone : (rawEmail || '')

  const givname = baseUser.cust_givname || baseUser.givname || ''
  const surname = baseUser.cust_surname || baseUser.surname || ''
  const yearLevel = baseUser.cust_categ || baseUser.yearLevel || ''
  const course = baseUser.cust_dept || baseUser.course || ''
  const campus = baseUser.campus || ''
  const college = baseUser.cust_college || baseUser.college || ''
  const fullName = givname || surname ? `${givname} ${surname}`.trim() : (baseUser.fullName || 'User')
  const custId = currentUser?.cust_id ?? currentUser?.id ?? null

  const [orders, setOrders] = useState([])
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  // Fresh copy of the signed-in row: phone, pronoun, birthday and the saved
  // delivery addresses are not carried in the session slot (REQ-CUST_PROF-02).
  const [account, setAccount] = useState(null)
  const handleLogout = () => {
    logout()
    showToast('Signed out successfully')
    // Never "/" - the bare entry rule hands the tab to whichever portal was
    // signed in last, so an employee session left in this tab would bounce a
    // customer into the employee portal (rule 71 keeps them separate).
    navigate('/signin', { replace: true })
  }

  // Appointments live on their own standalone route (/appointments), so Profile
  // only needs orders and notifications.
  useEffect(() => {
    if (!custId) return undefined
    let cancelled = false
    Promise.allSettled([fetchOrders(custId), fetchNotifications('customer', custId)])
      .then(([ordersResult, notificationsResult]) => {
        if (cancelled) return
        if (ordersResult.status === 'fulfilled') {
          setOrders(ordersResult.value)
        } else {
          console.warn('Failed to load profile orders:', ordersResult.reason)
        }
        if (notificationsResult.status === 'fulfilled') {
          setUnreadNotifications(unreadCount(notificationsResult.value))
        } else {
          console.warn('Failed to load profile notifications:', notificationsResult.reason)
        }
      })
    return () => { cancelled = true }
  }, [custId])

  useEffect(() => {
    if (!custId) return undefined
    let cancelled = false
    fetchMyAccount()
      .then((row) => { if (!cancelled && row) setAccount(row) })
      .catch(() => { /* the session copy still paints the page */ })
    return () => { cancelled = true }
  }, [custId])

  const profilePhone = account?.cust_phone || baseUser.cust_phone || baseUser.phone || ''
  const pronoun = account?.cust_pronoun || baseUser.cust_pronoun || ''
  const birthday = account?.cust_birthday || account?.cust_bday || baseUser.cust_bday || ''
  const addresses = Array.isArray(account?.cust_addresses) ? account.cust_addresses : []

  const formatBirthday = (value) => {
    if (!value) return ''
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`)
    return Number.isNaN(date.getTime())
      ? String(value)
      : date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }

  const overview = useMemo(() => {
    const counts = {
      inProgress: 0,
      forPickup: 0,
      forDelivery: 0,
      completed: 0,
    }

    orders.forEach((order) => {
      const status = String(order.ord_status ?? order.status ?? '')
        .trim()
        .toLowerCase()
        .replace(/_/g, ' ')
      const bucket = orderFilterBucket(status)
      if (bucket === 'processing' || IN_PROGRESS_STATUSES.has(status)) {
        counts.inProgress += 1
      }
      if (bucket === 'claimed') {
        counts.completed += 1
      }
      if (bucket === 'to-claim') {
        const dispatchMode = dispatchModeOf(order)
        if (dispatchMode === 'pickup') counts.forPickup += 1
        if (dispatchMode === 'delivery') counts.forDelivery += 1
      }
    })

    return counts
  }, [orders])

  const rightAction = (
    <div className="flex items-center gap-2">
      <Link
        to="/notifications"
        className="relative p-1.5 text-gray-700 dark:text-[var(--ink)] hover:text-brand-orange transition-colors"
        aria-label="Notifications"
      >
        <img src={notificationIcon} alt="" className="w-5 h-5" />
        {unreadNotifications > 0 && (
          <span className="absolute top-0 right-0 bg-[#FF6A00] text-white text-2xs font-semibold min-w-4 h-4 px-1 rounded-full flex items-center justify-center border-2 border-white dark:border-[var(--surface)]">
            {unreadNotifications > 99 ? '99+' : unreadNotifications}
          </span>
        )}
      </Link>
      <Link
        to="/settings"
        className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-[var(--surface-2)] text-gray-700 dark:text-[var(--ink)] hover:text-brand-orange flex items-center justify-center transition-colors shadow-2xs"
        title="Settings"
      >
        <SettingsIcon className="w-4 h-4" />
      </Link>
    </div>
  )

  return (
    <FocusedLayout
      title="Profile"
      subtitle="Account and orders overview"
      backTo="/home"
      containerClassName="max-w-6xl"
      rightAction={rightAction}
    >
      {/* ── MOBILE LAYOUT (matching Image 2) ── */}
      <div className="md:hidden pb-16 bg-[#F8F9FA] dark:bg-[var(--surface)] min-h-dvh">
        <div className="space-y-4">
          {/* Orange Banner - Mobile Redesign */}
          <div className="rounded-3xl p-5 text-white relative overflow-hidden shadow-xs bg-gradient-to-r from-[#FF7A1A] via-[#FF6600] to-[#FF8C33] space-y-4">

            {/* Avatar + Info Header with Settings Icon */}
            <div className="flex items-start justify-between gap-3 relative z-10">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-14 h-14 rounded-full overflow-hidden shrink-0 shadow-sm">
                  <Avatar name={fullName} size={56} className="w-full h-full" userId={currentUser?.cust_id} />
                </div>
                <div className="min-w-0 text-white">
                  <h1 className="text-lg font-semibold tracking-tight leading-tight truncate">{fullName}</h1>
                  <p className="text-white/90 text-xs font-normal mt-0.5 truncate">{email}</p>
                  {!isGuest && <p className="text-white/80 text-[11px] font-normal mt-0.5">{college}</p>}
                </div>
              </div>
            </div>

            {/* Action Bar: Edit Profile - Rectangular */}
            <div className="relative z-10 pt-1">
              <Link
                to="/account"
                className="flex items-center justify-center gap-2 bg-white text-gray-800 font-semibold text-xs py-2.5 px-4 rounded-xl shadow-2xs hover:bg-gray-50 active:scale-98 transition-all w-full"
              >
                <PencilIcon className="w-3.5 h-3.5 text-gray-500" />
                <span>Edit Profile</span>
              </Link>
            </div>
          </div>

         

          <OrderStatusOverview overview={overview} />

          {!isGuest && (
            <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-gray-900">About Me</h2>
                </div>
                <Link to="/account" className="w-7 h-7 rounded-xl border border-gray-100 bg-gray-50 flex items-center justify-center text-gray-400 hover:text-gray-700">
                  <PencilIcon className="w-3.5 h-3.5" />
                </Link>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed font-normal">{college}{course ? ` – ${course}` : ''}</p>
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100">
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-0.5">Year Level</p>
                  <p className="text-sm font-semibold text-gray-900">{yearLevel}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-0.5">Campus</p>
                  <p className="text-sm font-semibold text-gray-900">{campus}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-0.5">Course</p>
                  <p className="text-sm font-semibold text-gray-900 leading-snug">{course}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-0.5">College</p>
                  <p className="text-sm font-semibold text-gray-900 leading-snug">{college}</p>
                </div>
              </div>
            </div>
          )}
          {/* 4. Contact Information */}
          <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-gray-900">Contact Information</h3>
              </div>
              <Link to="/account" className="w-7 h-7 rounded-xl border border-gray-100 bg-gray-50 flex items-center justify-center text-gray-400 hover:text-gray-700">
                <PencilIcon className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-semibold text-gray-500">Email Address</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5 break-all">{email}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500">Phone</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{profilePhone || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500">Pronoun</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{pronoun || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500">Birthday</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">
                  {formatBirthday(birthday) || '—'}
                </p>
              </div>
            </div>
            <div className="pt-3 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500">Delivery Addresses</p>
                <Link to="/settings/address" className="text-xs font-semibold text-brand-orange">
                  Manage
                </Link>
              </div>
              {addresses.length === 0 ? (
                <p className="text-sm text-gray-400 mt-1">No saved addresses yet.</p>
              ) : (
                <ul className="mt-1.5 space-y-1.5">
                  {addresses.map((entry) => (
                    <li
                      key={entry}
                      className="text-sm font-medium text-gray-700 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2"
                    >
                      {entry}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>


          {/* 6. Account Security */}
          <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-gray-900">Account Security</h3>
              </div>
              <Link to="/settings/change-password" className="w-7 h-7 rounded-xl border border-gray-100 bg-gray-50 flex items-center justify-center text-gray-400 hover:text-gray-700">
                <PencilIcon className="w-3.5 h-3.5" />
              </Link>
            </div>
            <p className="text-sm text-gray-500">Keep your account secure</p>
            <div>
              <Link
                to="/settings/change-password"
                className="inline-block bg-[#EFF6FF] text-[#2563EB] hover:bg-blue-100 font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors"
              >
                Change Password
              </Link>
            </div>
          </div>

          {/* 7. Log Out — opens the shared confirmation (FLOW-CUST_LOGOUT-01/02) */}
          <button
            type="button"
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full flex items-center justify-between px-5 py-4 bg-white rounded-3xl border border-gray-100 shadow-xs hover:bg-red-50 active:bg-red-100 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3.5">
              <LogOutIcon className="w-5 h-5 text-red-500" />
              <p className="text-sm font-semibold text-red-600">Log Out</p>
            </div>
            <span className="text-red-300 text-xl font-medium">›</span>
          </button>
        </div>
      </div>

      {/* ── DESKTOP LAYOUT ── */}
      <div className="hidden md:block w-full max-w-6xl mx-auto py-2 animate-fade-in space-y-3.5">
        {/* Top Banner - Sleek compact style */}
        <div className="rounded-2xl py-6 px-6 flex items-center justify-between text-white relative overflow-hidden shadow-xs bg-gradient-to-r from-[#FF7A1A] via-[#FF6600] to-[#FF8C33]">


          {/* Left: Avatar + Info */}
          <div className="flex items-center gap-4 relative z-10">
            <div className="w-14 h-14 rounded-full overflow-hidden shrink-0 shadow-sm border-2 border-white/40">
              <Avatar name={fullName} size={56} className="w-full h-full" userId={currentUser?.cust_id} />
            </div>
            <div className="text-white">
              <h1 className="text-xl md:text-2xl font-semibold tracking-tight leading-tight">{fullName}</h1>
              <p className="text-white/90 text-xs font-normal mt-0.5">{email}</p>
              {!isGuest && <p className="text-white/80 text-[11px] font-normal mt-0.5">{college}</p>}
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2.5 relative z-10">
            <Link
              to="/account"
              className="flex items-center gap-1.5 bg-white text-gray-800 font-semibold text-xs px-4 py-2 rounded-xl shadow-2xs hover:bg-gray-50 active:scale-95 transition-all"
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

            <OrderStatusOverview overview={overview} />

            {!isGuest && (
              <div className="bg-white rounded-2xl p-4 border border-gray-100/90 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-gray-900">About Me</h2>
                  </div>
                  <Link to="/account" className="w-7 h-7 rounded-lg border border-gray-100 bg-gray-50 flex items-center justify-center text-gray-400 hover:text-gray-700">
                    <PencilIcon className="w-3 h-3" />
                  </Link>
                </div>

                <p className="text-xs md:text-sm text-gray-600 leading-relaxed font-normal">
                  {college} {course && `– ${course}`}
                </p>

                <div className="grid grid-cols-4 gap-3 pt-3 border-t border-gray-100 text-xs">
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase">Year Level</p>
                    <p className="font-semibold text-gray-900 mt-0.5">{yearLevel}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase">Course</p>
                    <p className="font-semibold text-gray-900 mt-0.5 truncate">{course}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase">Campus</p>
                    <p className="font-semibold text-gray-900 mt-0.5">{campus}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase">College</p>
                    <p className="font-semibold text-gray-900 mt-0.5 truncate">{college}</p>
                  </div>
                </div>
              </div>
            )}

            {/* 3. Contact Information Card */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100/90 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Contact Information</h2>

                </div>
                <Link to="/account" className="w-7 h-7 rounded-lg border border-gray-100 bg-gray-50 flex items-center justify-center text-gray-400 hover:text-gray-700">
                  <PencilIcon className="w-3 h-3" />
                </Link>
              </div>

              <div className="grid grid-cols-4 gap-3 text-xs">
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase">Email</p>
                  <p className="font-semibold text-gray-900 mt-0.5 break-all">{email || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase">Phone</p>
                  <p className="font-semibold text-gray-900 mt-0.5">{profilePhone || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase">Pronoun</p>
                  <p className="font-semibold text-gray-900 mt-0.5">{pronoun || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase">Birthday</p>
                  <p className="font-semibold text-gray-900 mt-0.5">{formatBirthday(birthday) || '—'}</p>
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase">Delivery Addresses</p>
                  <Link to="/settings/address" className="text-[11px] font-semibold text-brand-orange">
                    Manage
                  </Link>
                </div>
                {addresses.length === 0 ? (
                  <p className="text-xs text-gray-400 mt-1">No saved addresses yet.</p>
                ) : (
                  <ul className="mt-1.5 space-y-1.5">
                    {addresses.map((entry) => (
                      <li
                        key={entry}
                        className="text-xs font-medium text-gray-700 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2"
                      >
                        {entry}
                      </li>
                    ))}
                  </ul>
                )}
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
    </FocusedLayout>
  )
}

export default Profile