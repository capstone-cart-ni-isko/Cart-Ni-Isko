import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from '../hooks/useToast.js'
import AppShell from '../components/layout/AppShell.jsx'
import { mockUser, mockAppointments, mockOrderStatuses } from '../data/mockUser.js'
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

function Profile() {
  const { currentUser, logout } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  const user = currentUser || mockUser

  const handleLogout = () => {
    logout()
    showToast('Signed out successfully')
    navigate('/')
  }

  return (
    <AppShell>
      <DrawerMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        user={user}
        onLogout={() => setShowLogoutConfirm(true)}
      />

      <div className="pb-28 bg-gray-50 min-h-dvh">
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
              <img src={avatarImg} alt={user.fullName} className="w-full h-full object-cover" />
            </div>
            <div className="min-w-0 text-white">
              <h1 className="text-2xl font-black tracking-wide leading-tight truncate">{user.fullName}</h1>
              <p className="text-white/80 text-xs font-semibold mt-0.5 truncate">{user.email}</p>
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
              <li>{user.yearLevel}</li>
              <li>{user.campus}</li>
              <li>{user.college}</li>
              <li>{user.course}</li>
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
