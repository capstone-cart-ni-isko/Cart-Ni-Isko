import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from '../hooks/useToast.js'
import FocusedLayout from '../components/layout/FocusedLayout.jsx'
import { dispatchModeOf, fetchOrders, orderFilterBucket } from '../services/orders.js'
import { fetchMyAccount } from '../services/accounts.js'
import { fetchNotifications, unreadCount } from '../services/notifications.js'
import Avatar from '../components/ui/Avatar.jsx'
import notificationIcon from '../assets/icons/common/notification.svg'
import ConfirmModal from '../components/ui/ConfirmModal.jsx'
import ViewAllLink from '../components/ui/ViewAllLink.jsx'
import Card from '../components/ui/Card.jsx'
import SignOutRow from '../components/ui/SignOutRow.jsx'

import { SettingsIcon } from '../components/ui/Icons.jsx'

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

/** Icon-only edit shortcut in a card's heading row. */
function EditLink({ to, label }) {
  return (
    <Link
      to={to}
      aria-label={label}
      title={label}
      className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-[var(--surface-2)] transition-colors"
    >
      <PencilIcon className="w-3.5 h-3.5" />
    </Link>
  )
}

/** One label/value pair; an empty value reads as an em dash. */
function DetailItem({ label, value, className = '', breakAll = false }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <dt className="text-xs font-medium text-slate-500 dark:text-[var(--muted)]">{label}</dt>
      <dd className={`mt-0.5 text-sm font-semibold text-slate-900 dark:text-[var(--ink)] leading-snug ${breakAll ? 'break-all' : ''}`}>
        {value || '—'}
      </dd>
    </div>
  )
}

function OrderStatusOverview({ overview }) {
  const statuses = [
    {
      key: 'in_progress',
      label: 'In Progress',
      count: overview.inProgress,
      iconColor: 'bg-blue-100 text-blue-600',
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
    <Card
      title="Quick Order Statuses"
      subtitle="Active and recent purchases"
      action={<ViewAllLink to="/orders">View all</ViewAllLink>}
    >
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
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
              <p className="text-lg font-semibold leading-none text-slate-900">{count}</p>
              <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-500">{label}</p>
            </div>
          </Link>
        ))}
      </div>
    </Card>
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
        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
        <path d="M3 6h18" />
        <path d="M16 10a4 4 0 0 1-8 0" />
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
  // Academic details: the fresh account row first (it is what Edit Profile
  // saved), then the session copy. 'N/A' is the session's "unset" filler.
  const known = (...values) => {
    const hit = values.find((v) => v && String(v).trim() && String(v).trim().toUpperCase() !== 'N/A')
    return hit ? String(hit).trim() : ''
  }
  const categoryRaw = known(account?.cust_categ, baseUser.cust_categ, baseUser.yearLevel)
  const category = categoryRaw ? categoryRaw.charAt(0).toUpperCase() + categoryRaw.slice(1).toLowerCase() : ''
  const college = known(account?.cust_college, baseUser.cust_college, baseUser.college)
  const course = known(account?.cust_dept, baseUser.cust_dept, baseUser.course)

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
    <div className="flex items-center gap-1">
      <Link
        to="/notifications"
        className="relative w-9 h-9 rounded-lg flex items-center justify-center text-slate-600 dark:text-[var(--ink)] hover:bg-slate-100 dark:hover:bg-[var(--surface-2)] transition-colors"
        aria-label="Notifications"
        title="Notifications"
      >
        <img src={notificationIcon} alt="" className="w-5 h-5" />
        {unreadNotifications > 0 && (
          <span className="absolute top-0.5 right-0.5 bg-brand-orange text-white text-2xs font-semibold min-w-4 h-4 px-1 rounded-full flex items-center justify-center border-2 border-white dark:border-[var(--surface)]">
            {unreadNotifications > 99 ? '99+' : unreadNotifications}
          </span>
        )}
      </Link>
      <Link
        to="/settings"
        className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-600 dark:text-[var(--ink)] hover:bg-slate-100 dark:hover:bg-[var(--surface-2)] transition-colors"
        title="Settings"
        aria-label="Settings"
      >
        <SettingsIcon className="w-5 h-5" />
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
      {/* One responsive layout for phone and desktop, so the two can no
          longer drift apart: cards stack on a phone and spread into columns
          from md up. Every section is the shared <Card>. */}
      <div className="w-full pb-16 md:pb-6 animate-fade-in space-y-4">
        {/* Identity banner */}
        <section className="rounded-2xl p-5 md:px-6 md:py-6 text-white relative overflow-hidden shadow-2xs bg-gradient-to-r from-brand-orange via-brand-orange to-orange-400 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3.5 md:gap-4 min-w-0">
            <div className="w-14 h-14 rounded-full overflow-hidden shrink-0 shadow-sm border-2 border-white/40">
              <Avatar name={fullName} size={56} className="w-full h-full" userId={currentUser?.cust_id} src={currentUser?.avatarImage || currentUser?.cust_avatar || undefined} />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg md:text-2xl font-semibold tracking-tight leading-tight truncate">{fullName}</h1>
              {email && <p className="text-white/90 text-xs mt-0.5 truncate">{email}</p>}
              {!isGuest && college && <p className="text-white/80 text-[11px] mt-0.5 truncate">{college}</p>}
            </div>
          </div>
          <Link
            to="/account"
            className="btn btn--lg md:h-9 md:text-[13px] w-full md:w-auto shrink-0 bg-white text-slate-800 hover:bg-slate-50 shadow-2xs"
          >
            <PencilIcon className="w-3.5 h-3.5 text-slate-500" />
            <span>Edit Profile</span>
          </Link>
        </section>

        <OrderStatusOverview overview={overview} />

        {!isGuest && (
          <Card title="About Me" action={<EditLink to="/account" label="Edit academic details" />}>
            <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">
              <DetailItem label="Category" value={category} />
              <DetailItem label="Course" value={course} />
              <DetailItem label="College" value={college} className="col-span-2 md:col-span-1" />
            </dl>
          </Card>
        )}

        <Card title="Contact Information" action={<EditLink to="/account" label="Edit contact information" />}>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3">
            <DetailItem label="Email" value={email} breakAll />
            <DetailItem label="Phone" value={profilePhone} />
            <DetailItem label="Pronoun" value={pronoun} />
            <DetailItem label="Birthday" value={formatBirthday(birthday)} />
          </dl>

          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-[var(--line)]">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-slate-500 dark:text-[var(--muted)]">Delivery Addresses</p>
              <Link to="/settings/address" className="text-xs font-semibold text-brand-orange hover:underline">
                Manage
              </Link>
            </div>
            {addresses.length === 0 ? (
              <p className="text-sm text-slate-400 mt-1">No saved addresses yet.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {addresses.map((entry, index) => (
                  <li
                    key={`${index}-${entry}`}
                    className="text-sm font-medium text-slate-700 dark:text-[var(--ink-2)] bg-slate-50 dark:bg-[var(--surface-2)] border border-slate-100 dark:border-[var(--line)] rounded-lg px-3 py-2"
                  >
                    {entry}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        {/* Account Security + Log Out - the same pair the employee profile
            ends with, on phone and desktop alike. */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card
            title="Account Security"
            subtitle="Keep your account secure"
            action={
              <Link to="/settings/change-password" className="btn btn--secondary">
                Change Password
              </Link>
            }
          />
          <SignOutRow onClick={() => setShowLogoutConfirm(true)} hint="Sign out of this device" />
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
